// D3-FC — dòng Live HIỆN HÀNH có phát dữ liệu có cấu trúc GIỮA-LÚC-NÓI không?
// Giao thức + ngưỡng công bố trước: probes/d3-protocol.md (viết TRƯỚC run đầu tiên).
// Kế thừa p3 nhưng KHÁC MỘT CHỖ ĐO: tool-response bị trì hoãn DELAY_MS có chủ đích —
// async thật ⇒ audio tiếp tục chảy trong cửa sổ trì hoãn; blocking ⇒ im tới khi có response.
import '../lib/env.mjs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { GoogleGenAI } from '@google/genai';
import { LiveSession, makeClient } from '../lib/liveClient.mjs';
import { examinerConfig, recordEvidenceDeclaration } from '../lib/config.mjs';
import { loadFixture } from '../lib/fixture.mjs';
import { buildScript } from './p3-evidence.mjs';
import { Logger } from '../lib/log.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- trần cứng ở transport (bài học D2: đếm được, không phải lời hứa) ---
const MAX_WS_TOTAL = 8;
const MAX_CONN_PER_MODEL = 2;
const WATCHDOG_PER_MODEL_MS = 300_000;
const DELAY_MS = 3000; // cửa sổ đo mid-speech, khớp giao thức
let wsOpened = 0;

const require = createRequire(import.meta.url);
const https = require('https');
const realRequest = https.request;
https.request = function (...args) {
  const isUpgrade = args.some((a) => a && typeof a === 'object' && /websocket/i.test(String(a.headers?.Upgrade ?? '')));
  if (isUpgrade && ++wsOpened > MAX_WS_TOTAL) throw new Error(`TRẦN: chặn WS thứ ${wsOpened} (trần ${MAX_WS_TOTAL})`);
  return realRequest.apply(this, args);
};

const SURFACE = (process.env.D3_SURFACE || 'dev').toLowerCase(); // dev | vertex
const MODELS = (process.env.D3_MODELS || 'gemini-3.1-flash-live-preview,gemini-2.5-flash-native-audio-latest')
  .split(',').map((s) => s.trim()).filter(Boolean);

function makeAi() {
  if (SURFACE === 'vertex') return makeClient();
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) { console.error('thiếu GEMINI_API_KEY (surface=dev)'); process.exit(2); }
  // Bề mặt không mập mờ (bài học D2): xoá lối trượt sang Vertex.
  for (const k of ['GOOGLE_APPLICATION_CREDENTIALS', 'GOOGLE_CLOUD_PROJECT', 'GOOGLE_CLOUD_LOCATION', 'GOOGLE_GENAI_USE_VERTEXAI']) delete process.env[k];
  return new GoogleGenAI({ apiKey });
}

// Trì hoãn tool-response + ghi timestamp audio để tính "audio trong cửa sổ sau fire".
class DelayedToolSession extends LiveSession {
  constructor(logger, opts) {
    super(logger, opts);
    this.audioTimes = [];
    this.responseBatches = []; // {firesAt, sentAt}
    this.on('audio', (a) => this.audioTimes.push(a.at));
  }
  _respondTools(fcs) {
    const firesAt = Date.now();
    setTimeout(() => {
      this.responseBatches.push({ firesAt, sentAt: Date.now() });
      this.logger?.event('toolresponse-delayed-sent', { firesAt, delayMs: DELAY_MS });
      super._respondTools(fcs);
    }, DELAY_MS);
  }
}

async function runModel(ai, log, fx, script, model, { declaration }) {
  const s = new DelayedToolSession(log, { toolScheduling: 'SILENT' });
  const fires = [];
  let stepIdx = -1;
  s.on('toolcall', (r) => fires.push({ cp: r.args?.checkpointId, status: r.args?.status, at: r.at, sentStep: stepIdx }));
  const config = { ...examinerConfig(fx), tools: [{ functionDeclarations: [declaration] }] };
  try {
    await s.open({ ai, model, config });
  } catch (e) {
    return { connectError: e?.message || String(e), fires, closeCode: null, session: s };
  }
  for (stepIdx = 0; stepIdx < script.length; stepIdx++) {
    for (const text of script[stepIdx].texts) {
      s.sendText(text);
      await s.waitForTurn(35000).catch(() => {});
      await sleep(600);
      if (s.closeInfo) break;
    }
    if (s.closeInfo) { log.note(`    ⚠️ đóng (code=${s.closeInfo.code}) ở step ${script[stepIdx].target}`); break; }
  }
  await sleep(DELAY_MS + 2000); // drain trailing fires + response cuối
  s.close();
  return { connectError: s.errorInfo, fires, closeCode: s.closeInfo?.code ?? null, session: s };
}

const IN_ENUM = new Set(['covered', 'contradicted']);

function evaluate(script, run) {
  const valid = run.fires.filter((f) => IN_ENUM.has(f.status));
  const stepsHit = script.filter((st) =>
    st.expect === 'none' ? true : valid.some((f) => f.cp === st.target && f.status === st.expect)).length;
  const firedSteps = new Set(valid.map((f) => f.cp)).size;
  // mid-speech: fire có >=1 audio-chunk trong (fire.at, fire.at + DELAY_MS) — TRƯỚC khi response được gửi.
  const midSpeech = valid.map((f) => {
    const inWindow = run.session.audioTimes.filter((t) => t > f.at && t < f.at + DELAY_MS).length;
    return { cp: f.cp, status: f.status, audioInWindow: inWindow };
  });
  const midSpeechFires = midSpeech.filter((m) => m.audioInWindow > 0).length;
  return {
    totalFires: run.fires.length,
    validFires: valid.length,
    enumInvalid: run.fires.length - valid.length,
    firedSteps,
    stepsHit,
    midSpeech,
    midSpeechFires,
    interrupted: run.session.interruptedCount,
  };
}

function classify(script, attempts) {
  // attempts: [{declaration:'NON_BLOCKING'|'sync', run, ev}]
  const nb = attempts.find((a) => a.declaration === 'NON_BLOCKING');
  const best = attempts.filter((a) => a.ev).sort((a, b) => b.ev.validFires - a.ev.validFires)[0];
  const need = script.filter((s) => s.expect !== 'none').length; // 4
  const toolAlive = best?.ev && best.ev.firedSteps >= need - 1; // >=3/4 bước có fire
  if (!toolAlive) return { branch: 'C', why: 'tool KHÔNG bắn đủ (hoặc connect lỗi) ở mọi attempt' };
  if (nb?.ev && nb.ev.firedSteps >= need - 1 && nb.ev.midSpeechFires >= 1)
    return { branch: 'A', why: `NON_BLOCKING sống: ${nb.ev.midSpeechFires} fire có audio trong cửa sổ ${DELAY_MS}ms trước tool-response` };
  return { branch: 'B', why: nb?.run?.connectError ? `NON_BLOCKING bị từ chối (${String(nb.run.connectError).slice(0, 120)}); sync FC chạy` : '0 fire nào có audio trong cửa sổ trì hoãn — model đợi response (blocking)' };
}

async function main() {
  const log = new Logger('d3-fc');
  const fx = loadFixture();
  const script = buildScript(fx).slice(0, 4); // cp_1..cp_4, có contradicted-control cp_2
  log.note(`D3-FC — surface=${SURFACE} · models=[${MODELS.join(', ')}] · delay=${DELAY_MS}ms · trần ${MAX_CONN_PER_MODEL}/model, ${MAX_WS_TOTAL} WS tổng`);
  log.event('ceiling', { maxWsTotal: MAX_WS_TOTAL, maxConnPerModel: MAX_CONN_PER_MODEL, delayMs: DELAY_MS });

  const ai = makeAi();
  const outcomes = [];
  for (const model of MODELS) {
    log.note(`\n=== model: ${model} ===`);
    const watchdog = setTimeout(() => { console.error(`WATCHDOG model ${model}`); process.exit(3); }, WATCHDOG_PER_MODEL_MS);
    const attempts = [];
    let conns = 0;

    // attempt 1: NON_BLOCKING
    conns++;
    let run = await runModel(ai, log, fx, script, model, { declaration: recordEvidenceDeclaration });
    let ev = run.connectError && run.fires.length === 0 ? null : evaluate(script, run);
    attempts.push({ declaration: 'NON_BLOCKING', run, ev });
    log.note(`  [NON_BLOCKING] connectError=${run.connectError ? JSON.stringify(String(run.connectError).slice(0, 160)) : 'null'} close=${run.closeCode} fires=${run.fires.length} valid=${ev?.validFires ?? 0} firedSteps=${ev?.firedSteps ?? 0} midSpeechFires=${ev?.midSpeechFires ?? 0}`);
    if (ev) for (const m of ev.midSpeech) log.note(`    fire ${m.cp}/${m.status}: audioInWindow=${m.audioInWindow}`);

    // attempt 2 CHỈ khi cần phân biệt B vs C: NON_BLOCKING lỗi/0-fire -> thử sync (bỏ behavior)
    const needSync = !ev || ev.validFires === 0;
    if (needSync && conns < MAX_CONN_PER_MODEL) {
      conns++;
      const { behavior: _drop, ...syncDecl } = recordEvidenceDeclaration;
      run = await runModel(ai, log, fx, script, model, { declaration: syncDecl });
      ev = run.connectError && run.fires.length === 0 ? null : evaluate(script, run);
      attempts.push({ declaration: 'sync', run, ev });
      log.note(`  [sync]        connectError=${run.connectError ? JSON.stringify(String(run.connectError).slice(0, 160)) : 'null'} close=${run.closeCode} fires=${run.fires.length} valid=${ev?.validFires ?? 0} firedSteps=${ev?.firedSteps ?? 0}`);
    }

    const cls = classify(script, attempts);
    log.note(`  ⇒ NHÁNH ${cls.branch} — ${cls.why}`);
    outcomes.push({
      model, branch: cls.branch, why: cls.why,
      attempts: attempts.map((a) => ({
        declaration: a.declaration,
        connectError: a.run.connectError ? String(a.run.connectError).slice(0, 300) : null,
        closeCode: a.run.closeCode,
        ev: a.ev ? { ...a.ev, midSpeech: a.ev.midSpeech } : null,
      })),
    });
    clearTimeout(watchdog);
  }

  log.note('\nKẾT QUẢ D3-FC:');
  for (const o of outcomes) log.note(`  ${o.model}: nhánh ${o.branch} — ${o.why}`);
  log.event('result', { criterion: 'd3-fc', surface: SURFACE, delayMs: DELAY_MS, wsOpened, outcomes });
  log.note(`(log: ${log.path})`);
  await log.close();
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error('d3-fc lỗi:', e); process.exit(2); });
}
