// D3-VAD — server-VAD (silenceDurationMs) trên dòng Live HIỆN HÀNH có hoạt động không?
// Giao thức + ngưỡng công bố trước: probes/d3-protocol.md (V1 nới 5000ms · V2 control · V3 manual).
// Audio pace THỜI GIAN THỰC (server-VAD đo thời gian thực của stream — bài học p1).
import '../lib/env.mjs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import { resolve, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, Modality } from '@google/genai';
import { LiveSession, makeClient } from '../lib/liveClient.mjs';
import { readWavPcm } from '../lib/wav.mjs';
import { Logger } from '../lib/log.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- trần cứng ---
const MAX_WS_TOTAL = 8;
const WATCHDOG_PER_RUN_MS = 120_000;
const PAUSE_MS = 2500;
const SILENCE_SETTING_MS = 5000;
let wsOpened = 0;

const require = createRequire(import.meta.url);
const https = require('https');
const realRequest = https.request;
https.request = function (...args) {
  const isUpgrade = args.some((a) => a && typeof a === 'object' && /websocket/i.test(String(a.headers?.Upgrade ?? '')));
  if (isUpgrade && ++wsOpened > MAX_WS_TOTAL) throw new Error(`TRẦN: chặn WS thứ ${wsOpened} (trần ${MAX_WS_TOTAL})`);
  return realRequest.apply(this, args);
};

const SURFACE = (process.env.D3_SURFACE || 'dev').toLowerCase();
const MODELS = (process.env.D3_MODELS || 'gemini-3.1-flash-live-preview,gemini-2.5-flash-native-audio-latest')
  .split(',').map((s) => s.trim()).filter(Boolean);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WAV_RAW = process.env.P1_AUDIO_WAV || './fixtures/student-vi-16k.wav';
const WAV = isAbsolute(WAV_RAW) ? WAV_RAW : resolve(ROOT, WAV_RAW);

function makeAi() {
  if (SURFACE === 'vertex') return makeClient();
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) { console.error('thiếu GEMINI_API_KEY (surface=dev)'); process.exit(2); }
  for (const k of ['GOOGLE_APPLICATION_CREDENTIALS', 'GOOGLE_CLOUD_PROJECT', 'GOOGLE_CLOUD_LOCATION', 'GOOGLE_GENAI_USE_VERTEXAI']) delete process.env[k];
  return new GoogleGenAI({ apiKey });
}

const SYS = 'Bạn là trợ giảng. Nghe sinh viên nói xong rồi trả lời RẤT NGẮN bằng tiếng Việt.';

function vadConfig(variant) {
  const base = {
    responseModalities: [Modality.AUDIO],
    systemInstruction: SYS,
    inputAudioTranscription: {},
    outputAudioTranscription: {},
  };
  if (variant === 'V1') base.realtimeInputConfig = { automaticActivityDetection: { silenceDurationMs: SILENCE_SETTING_MS } };
  if (variant === 'V3') base.realtimeInputConfig = { automaticActivityDetection: { disabled: true } };
  return base; // V2: mặc định, không đụng VAD config
}

async function feedPcm(s, pcm, rate) {
  const frameMs = 20;
  const bytesPerFrame = Math.floor((rate * 2 * frameMs) / 1000);
  for (let o = 0; o < pcm.length; o += bytesPerFrame) {
    s.sendAudio(pcm.subarray(o, o + bytesPerFrame).toString('base64'), rate);
    await sleep(frameMs);
  }
}

function silencePcm(ms, rate) {
  return Buffer.alloc(Math.floor((rate * 2 * ms) / 1000));
}

async function runVariant(ai, log, model, variant, pcm, rate) {
  log.note(`  --- ${variant} (${variant === 'V1' ? `silenceDurationMs=${SILENCE_SETTING_MS}` : variant === 'V2' ? 'VAD mặc định' : 'manual activity'}) ---`);
  const s = new LiveSession(log);
  const events = { audio: [], turns: [], interrupted: [] };
  s.on('audio', (a) => events.audio.push(a.at));
  s.on('turn', () => events.turns.push(Date.now()));
  s.on('interrupted', () => events.interrupted.push(Date.now()));
  const watchdog = setTimeout(() => { console.error(`WATCHDOG ${variant}/${model}`); process.exit(3); }, WATCHDOG_PER_RUN_MS);
  let marks = {};
  try {
    await s.open({ ai, model, config: vadConfig(variant) });
    const t0 = Date.now();
    if (variant === 'V3') s.activityStart();
    marks.utt1Start = Date.now();
    await feedPcm(s, pcm, rate);
    marks.utt1End = Date.now();
    await feedPcm(s, silencePcm(PAUSE_MS, rate), rate); // im lặng GIỮA câu — pace thật
    marks.utt2Start = Date.now();
    await feedPcm(s, pcm, rate);
    marks.utt2End = Date.now();
    // đuôi im lặng đủ dài để server-VAD 5000ms có thể commit (V1) / VAD mặc định commit (V2)
    await feedPcm(s, silencePcm(variant === 'V1' ? SILENCE_SETTING_MS + 1500 : 3000, rate), rate);
    if (variant === 'V3') { marks.activityEnd = Date.now(); s.activityEnd(); }
    await sleep(6000); // chờ phản hồi
    marks.t0 = t0;
  } catch (e) {
    clearTimeout(watchdog);
    s.close();
    return { variant, error: e?.message || String(e), closeCode: s.closeInfo?.code ?? null };
  }
  clearTimeout(watchdog);
  const closeCode = s.closeInfo?.code ?? null;
  s.close();

  const rel = (t) => (t == null ? null : t - marks.t0);
  const firstAudio = events.audio.length ? events.audio[0] : null;
  const audioInPause = events.audio.filter((t) => t > marks.utt1End + 200 && t < marks.utt2Start).length;
  const interruptedDuringFeed = events.interrupted.filter((t) => t < marks.utt2End).length;

  let verdict;
  if (variant === 'V3') {
    const audioBeforeEnd = events.audio.filter((t) => t < marks.activityEnd).length;
    verdict = s.errorInfo || closeCode === 1007 ? 'ERROR'
      : audioBeforeEnd > 0 ? 'BUG (trả lời trước activityEnd)'
      : firstAudio && firstAudio > marks.activityEnd ? 'OK'
      : 'INCONCLUSIVE (không có phản hồi)';
  } else {
    const respondedBeforeUtt2Done = (firstAudio && firstAudio < marks.utt2End) || audioInPause > 0 || interruptedDuringFeed > 0;
    if (variant === 'V1') {
      verdict = respondedBeforeUtt2Done ? 'VAD-BUG (commit trong pause dù 5000ms)'
        : firstAudio && firstAudio >= marks.utt2End + 4000 ? 'VAD-OK'
        : firstAudio ? 'INCONCLUSIVE (phản hồi sau utt2 nhưng sớm hơn 4s)' : 'INCONCLUSIVE (không phản hồi)';
    } else {
      verdict = respondedBeforeUtt2Done ? 'CONTROL-OK (mặc định commit trong pause — phép đo có độ phân giải)'
        : 'CONTROL-FLAT (mặc định cũng không commit trong pause — V1 không kết luận được)';
    }
  }
  const out = {
    variant, verdict, closeCode, error: s.errorInfo || null,
    marks: { utt1End: rel(marks.utt1End), utt2Start: rel(marks.utt2Start), utt2End: rel(marks.utt2End), activityEnd: rel(marks.activityEnd) },
    firstAudioRel: rel(firstAudio), audioInPause, interruptedDuringFeed,
    audioEvents: events.audio.length, turnCompletes: events.turns.map(rel), inTranscript: s.turn?.inText || undefined,
  };
  log.note(`    ⇒ ${verdict} · firstAudio=${out.firstAudioRel}ms · utt1End=${out.marks.utt1End} utt2End=${out.marks.utt2End} · audioInPause=${audioInPause} · interrupted=${interruptedDuringFeed} · close=${closeCode}`);
  return out;
}

async function main() {
  const log = new Logger('d3-vad');
  if (!existsSync(WAV)) { console.error(`Thiếu WAV: ${WAV}`); process.exit(2); }
  const { pcm, sampleRate } = readWavPcm(WAV);
  log.note(`D3-VAD — surface=${SURFACE} · models=[${MODELS.join(', ')}] · pause=${PAUSE_MS}ms · wav=${WAV} (${sampleRate}Hz)`);
  log.event('ceiling', { maxWsTotal: MAX_WS_TOTAL, pauseMs: PAUSE_MS, silenceSettingMs: SILENCE_SETTING_MS });

  const ai = makeAi();
  const outcomes = [];
  for (const model of MODELS) {
    log.note(`\n=== model: ${model} ===`);
    const runs = [];
    for (const variant of ['V1', 'V2', 'V3']) {
      runs.push(await runVariant(ai, log, model, variant, pcm, sampleRate));
      await sleep(800);
    }
    outcomes.push({ model, runs });
  }

  log.note('\nKẾT QUẢ D3-VAD:');
  for (const o of outcomes) log.note(`  ${o.model}: ${o.runs.map((r) => `${r.variant}=${r.verdict || r.error}`).join(' · ')}`);
  log.event('result', { criterion: 'd3-vad', surface: SURFACE, wsOpened, outcomes });
  log.note(`(log: ${log.path})`);
  await log.close();
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error('d3-vad lỗi:', e); process.exit(2); });
}
