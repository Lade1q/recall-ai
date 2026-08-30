// D2 — bề mặt `bidiGenerateContent` có gọi được bằng GEMINI_API_KEY (Developer API) không?
// Trả lời ĐÚNG MỘT câu hỏi đó. KHÔNG dựng conductor, KHÔNG quyết kiến trúc.
// Đối chứng: p4-auth.mjs đã chứng minh bề mặt này ĐẠT qua Vertex + service account (11/08).
//   Biến duy nhất đổi ở đây là cách dựng client: {apiKey} thay cho {vertexai:true, project, location}.
//
// TRẦN (Quân duyệt 15/08): <=3 kết nối, <=10s audio/lần, timeout cứng đóng socket.
//   Probe này gửi 0 GIÂY AUDIO — câu hỏi kết thúc ở `setupComplete`, trước khi có audio nào.
import { createRequire } from 'node:module';
import { Logger } from '../lib/log.mjs';

// --- trần cứng, đặt ở tầng transport chứ không dựa vào kỷ luật của người viết ---
const MAX_CONNECTIONS = 3;
const PER_CONN_MS = 10_000;
const WATCHDOG_MS = 90_000;
let wsOpened = 0;
let connectCalls = 0;
let audioSecondsSent = 0; // probe này không gửi audio; in ra để trần là số ĐO được, không phải lời hứa

// Hai chỗ vá KHÔNG bind, đã đo chứ không đoán — ghi lại để người sau khỏi vấp lại:
//   1. `globalThis.WebSocket`: entry Node của SDK dùng `import * as NodeWs from 'ws'`, không chạm global.
//   2. `require('ws').WebSocket`: namespace ESM của module CJS được CHỐT LÚC LINK,
//      nên gán lại module.exports sau đó vô hình với `import * as NodeWs`.
// Cửa thật: ws/lib/websocket.js:748 đọc `https.request` NGAY LÚC GỌI (CJS, tra thuộc tính runtime).
const require = createRequire(import.meta.url);
const https = require('https');
const realRequest = https.request;
https.request = function (...args) {
  const isUpgrade = args.some((a) => a && typeof a === 'object' && /websocket/i.test(String(a.headers?.Upgrade ?? '')));
  if (isUpgrade && ++wsOpened > MAX_CONNECTIONS) {
    throw new Error(`TRẦN: chặn kết nối WS thứ ${wsOpened} (trần ${MAX_CONNECTIONS})`);
  }
  return realRequest.apply(this, args);
};

const { GoogleGenAI, Modality } = await import('@google/genai');

const watchdog = setTimeout(() => {
  console.error(`WATCHDOG ${WATCHDOG_MS}ms — thoát cứng`);
  process.exit(3);
}, WATCHDOG_MS);

// Bề mặt phải KHÔNG mập mờ: xoá mọi lối để SDK trượt sang Vertex.
for (const k of ['GOOGLE_APPLICATION_CREDENTIALS', 'GOOGLE_CLOUD_PROJECT', 'GOOGLE_CLOUD_LOCATION', 'GOOGLE_GENAI_USE_VERTEXAI']) {
  delete process.env[k];
}

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) { console.error('thiếu GEMINI_API_KEY'); process.exit(2); }

// Ứng viên lấy từ bước 0 (catalogue khai bidiGenerateContent), không đoán.
// #1 là anh em Developer-API của model Vertex GA mà S0 đã dùng.
const CANDIDATES = [
  'gemini-2.5-flash-native-audio-latest',
  'gemini-2.5-flash-native-audio-preview-12-2025',
  'gemini-3.1-flash-live-preview',
];

async function tryOne(ai, log, model) {
  const rec = { model, connectResolved: false, setupComplete: false, messages: 0, error: null, closeCode: null, closeReason: '' };
  let timer = null;
  let session = null;
  const done = new Promise((resolve) => {
    let settled = false;
    const finish = (why) => { if (!settled) { settled = true; rec.finishedBy = why; resolve(); } };
    rec._finish = finish;
    timer = setTimeout(() => finish('timeout-10s'), PER_CONN_MS);
  });

  try {
    connectCalls++;
    if (connectCalls > MAX_CONNECTIONS) throw new Error(`TRẦN: chặn connect thứ ${connectCalls}`);
    session = await ai.live.connect({
      model,
      // giữ y hệt p4-auth để chỉ còn MỘT biến khác nhau giữa hai bề mặt
      config: {
        responseModalities: [Modality.AUDIO],
        systemInstruction: 'Trả lời rất ngắn bằng tiếng Việt.',
        outputAudioTranscription: {},
      },
      callbacks: {
        onopen: () => log.event('open', { model }),
        onmessage: (m) => {
          rec.messages++;
          if (m.setupComplete) { rec.setupComplete = true; log.event('setup-complete', { model }); rec._finish('setupComplete'); }
        },
        onerror: (e) => { rec.error = e?.message || String(e); log.event('ws-error', { model, message: rec.error }); rec._finish('ws-error'); },
        onclose: (e) => {
          rec.closeCode = e?.code ?? null; rec.closeReason = e?.reason ?? '';
          log.event('close', { model, code: rec.closeCode, reason: rec.closeReason });
          rec._finish('close');
        },
      },
    });
    rec.connectResolved = true;
    await done;
  } catch (e) {
    rec.error = rec.error || (e?.message || String(e));
    rec.finishedBy = rec.finishedBy || 'throw';
  } finally {
    clearTimeout(timer);
    try { session?.close(); } catch { /* noop */ }
  }
  return rec;
}

async function main() {
  const log = new Logger('d2-devapi-auth');
  log.note('D2 — bidiGenerateContent qua Developer API (GEMINI_API_KEY)');
  log.note(`Trần: <=${MAX_CONNECTIONS} kết nối · ${PER_CONN_MS / 1000}s/kết nối · audio gửi = 0s · watchdog ${WATCHDOG_MS / 1000}s`);
  log.event('ceiling', { maxConnections: MAX_CONNECTIONS, perConnMs: PER_CONN_MS, watchdogMs: WATCHDOG_MS });

  const ai = new GoogleGenAI({ apiKey }); // Developer API, KHÔNG vertexai
  const results = [];
  for (const model of CANDIDATES) {
    if (connectCalls >= MAX_CONNECTIONS) { log.note(`  (dừng: chạm trần ${MAX_CONNECTIONS} kết nối)`); break; }
    log.note(`  → thử ${model} ...`);
    const r = await tryOne(ai, log, model);
    results.push(r);
    log.note(`    setupComplete=${r.setupComplete} connect=${r.connectResolved} msgs=${r.messages} close=${r.closeCode} kết=${r.finishedBy}` + (r.error ? ` error="${String(r.error).slice(0, 200)}"` : ''));
    if (r.setupComplete) break; // đã trả lời xong câu hỏi — không đốt thêm kết nối
  }

  const pass = results.some((r) => r.setupComplete);
  // Dụng cụ phải tự tố cáo: có setupComplete thì socket CHẮC CHẮN đã mở.
  // Nếu bộ đếm vẫn 0 thì con số đó là "trần không bind", KHÔNG phải "0 socket".
  const guardBound = !(pass && wsOpened === 0);
  log.note('');
  log.note(`KẾT QUẢ D2: ${pass ? 'GỌI ĐƯỢC ✅' : 'KHÔNG GỌI ĐƯỢC ❌'} — dùng ${connectCalls}/${MAX_CONNECTIONS} kết nối, WS mở ${wsOpened}, audio gửi ${audioSecondsSent}s`);
  if (!guardBound) log.note('⚠ TRẦN KHÔNG BIND: setupComplete có nhưng bộ đếm WS = 0 — đừng đọc số này là "0 socket".');
  log.event('result', { criterion: 'd2-devapi-auth', pass, guardBound, connectCalls, wsOpened, audioSecondsSent, results });
  log.note(`(log: ${log.path})`);
  await log.close();
  clearTimeout(watchdog);
  process.exit(pass ? 0 : 1);
}

main().catch((e) => { console.error('d2 lỗi:', e); process.exit(2); });
