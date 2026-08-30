// ① Độ trễ từ VN: activityEnd (mic dừng) -> byte audio-out đầu tiên.
// Đạt: p50 < 1,5s · p95 < 3s · cold-start ≤ 3s (1 lần/connection).
// Cần WAV 16kHz mono PCM (P1_AUDIO_WAV) — một câu tiếng Việt ngắn. Xem README cách tạo.
import '../lib/env.mjs';
import { existsSync } from 'node:fs';
import { resolve, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeClient, LiveSession, LIVE_MODEL } from '../lib/liveClient.mjs';
import { audioConfig } from '../lib/config.mjs';
import { readWavPcm } from '../lib/wav.mjs';
import { Logger } from '../lib/log.mjs';

const ITER = Number(process.env.P1_ITERATIONS || 25);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WAV_RAW = process.env.P1_AUDIO_WAV || './fixtures/student-vi-16k.wav';
const WAV = isAbsolute(WAV_RAW) ? WAV_RAW : resolve(ROOT, WAV_RAW);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function pct(sorted, p) {
  if (!sorted.length) return NaN;
  const i = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[i];
}

async function feedAudio(s, pcm, rate) {
  // Đẩy khung 20ms Ở TỐC ĐỘ THỰC. Nếu dump tức thì, server còn tồn đọng audio lúc activityEnd ⇒
  // độ trễ đo bị cộng ~thời lượng clip (bug lần đầu: ~6.2s ≈ clip 7s). Pace real-time = server bắt kịp
  // trước activityEnd ⇒ đo đúng độ trễ đáp (mạng + sinh).
  const frameMs = 20;
  const bytesPerFrame = Math.floor((rate * 2 * frameMs) / 1000);
  for (let o = 0; o < pcm.length; o += bytesPerFrame) {
    s.sendAudio(pcm.subarray(o, o + bytesPerFrame).toString('base64'), rate);
    await sleep(frameMs);
  }
}

async function main() {
  const log = new Logger('p1-latency');
  if (!existsSync(WAV)) {
    console.error(`Thiếu WAV: ${WAV}\nTạo bằng ffmpeg (xem README):\n  ffmpeg -i input.m4a -ar 16000 -ac 1 -c:a pcm_s16le ${WAV}`);
    process.exit(2);
  }
  const { pcm, sampleRate } = readWavPcm(WAV);
  if (sampleRate !== 16000) log.note(`⚠️  WAV ${sampleRate}Hz (nên 16000Hz) — vẫn thử.`);
  log.note(`① LATENCY — ${ITER} lần · model=${LIVE_MODEL()} · audio=${WAV} (${sampleRate}Hz, ${pcm.length}B)`);

  const ai = makeClient();
  const s = new LiveSession(log);
  await s.open({ ai, model: LIVE_MODEL(), config: audioConfig() });

  const samples = [];
  let cold = null;
  for (let i = 0; i < ITER; i++) {
    s.activityStart();
    await feedAudio(s, pcm, sampleRate);
    const wait = s.waitForFirstAudio(15000); // đăng ký listener TRƯỚC activityEnd
    const t0 = Date.now();
    s.activityEnd();
    let ms;
    try {
      ms = (await wait) - t0;
    } catch (e) {
      log.note(`  [${i + 1}] lỗi: ${e.message}`);
      if (s.closeInfo) break;
      continue;
    }
    await s.waitForTurn(20000).catch(() => {}); // drain hết lượt trước khi đo tiếp
    if (i === 0) { cold = ms; log.note(`  cold-start: ${ms}ms`); }
    else { samples.push(ms); log.note(`  [${i + 1}] ${ms}ms`); }
    await sleep(400);
  }
  s.close();

  const sorted = [...samples].sort((a, b) => a - b);
  const p50 = pct(sorted, 50);
  const p95 = pct(sorted, 95);
  const pass = p50 < 1500 && p95 < 3000 && (cold ?? Infinity) <= 3000;
  log.note('');
  log.note(`KẾT QUẢ ①: n=${samples.length} · p50=${p50}ms · p95=${p95}ms · cold=${cold}ms  =>  ${pass ? 'ĐẠT ✅' : 'KHÔNG ĐẠT ❌'}`);
  log.note('   (ngưỡng: p50<1500 · p95<3000 · cold≤3000)');
  log.event('result', { criterion: '1-latency', n: samples.length, p50, p95, cold, pass, samples });
  log.note(`(log: ${log.path})`);
  await log.close();
  process.exit(pass ? 0 : 1);
}

main().catch((e) => { console.error('p1 lỗi:', e); process.exit(2); });
