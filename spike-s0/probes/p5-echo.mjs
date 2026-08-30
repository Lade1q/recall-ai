// ⑤ Echo / barge-in — BÁN THỦ CÔNG (cần loa + mic + tai người). Được phép fail vẫn GO (demo đeo tai nghe).
// Máy KHÔNG tự đo được tự-ngắt-lời qua loa — cần người nghe. Probe này:
//   1) lấy một đoạn audio model (lưu WAV để bạn phát thử),
//   2) in đúng quy trình đo thủ công.
import '../lib/env.mjs';
import { makeClient, LiveSession, LIVE_MODEL } from '../lib/liveClient.mjs';
import { audioConfig } from '../lib/config.mjs';
import { writeWavPcm } from '../lib/wav.mjs';
import { Logger } from '../lib/log.mjs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'runs', `p5-model-audio-${Date.now()}.wav`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const log = new Logger('p5-echo');
  log.note(`⑤ ECHO/BARGE-IN — bán thủ công · model=${LIVE_MODEL()}`);

  const ai = makeClient();
  const s = new LiveSession(log);
  await s.open({ ai, model: LIVE_MODEL(), config: audioConfig('Bạn là trợ giảng. Hãy nói một đoạn ~15 giây bằng tiếng Việt giải thích ngắn về địa chỉ IP lớp B.') });

  const chunks = [];
  let turnAt = null;
  let bytesAtTurn = 0;
  s.on('audio', (a) => chunks.push({ buf: Buffer.from(a.b64, 'base64'), at: a.at }));
  s.on('turn', (t) => { if (turnAt === null) { turnAt = Date.now(); bytesAtTurn = t.audioBytes; } });
  s.sendText('Giải thích giúp tôi địa chỉ IP lớp B trong khoảng 15 giây.');
  await s.waitForTurn(40000).catch(() => {});
  await sleep(2500); // grace-drain: bắt audio đến SAU turnComplete (phân xử harness-cắt vs API-cắt)
  s.close();

  if (chunks.length) {
    const after = turnAt !== null ? chunks.filter((c) => c.at > turnAt).length : 0;
    const totalBytes = chunks.reduce((n, c) => n + c.buf.length, 0);
    writeWavPcm(OUT, Buffer.concat(chunks.map((c) => c.buf)), { sampleRate: 24000, numChannels: 1 }); // native-audio out = 24kHz
    log.note(`Đã lưu audio model: ${OUT} (${(totalBytes / 2 / 24000).toFixed(2)}s)`);
    log.note(`Chẩn đoán cắt-đuôi: chunk TRƯỚC turnComplete=${chunks.length - after} · SAU grace=${after} · bytes@turnComplete=${bytesAtTurn}/${totalBytes}`);
    log.note(
      after > 0
        ? `  → grace bắt ${after} chunk SAU turnComplete ⇒ trước đây HARNESS cắt sớm (nay đã vá bằng grace-drain).`
        : `  → 0 chunk sau turnComplete ⇒ audio kết thúc ĐÚNG tại turnComplete ⇒ cụt-đuôi là API-side (transcript chạy trước audio), KHÔNG phải harness.`,
    );
  } else {
    log.note('⚠️ Không nhận được audio — kiểm ④ trước.');
  }

  log.note('');
  log.note('QUY TRÌNH ĐO THỦ CÔNG (ghi số vào issue cổng):');
  log.note('  Chạy một phiên hội thoại thật trên máy spike (mic + loa) với client-VAD bật:');
  log.note('  (a) TAI NGHE: nói chuyện ~2 phút, đếm số lần model TỰ NGẮT LỜI MÌNH. Đạt = 0.');
  log.note('  (b) LOA LAPTOP: lặp lại, đếm số lần tự-ngắt. Được phép fail — chỉ ghi số.');
  log.note('  GO nếu (a)=0. (a)=0 & (b)>0 vẫn GO nhưng demo BẮT BUỘC tai nghe.');
  log.note('  Mẹo: phát file WAV ở trên qua loa trong lúc client-VAD đang nghe để tái hiện echo mà không cần người nói.');
  log.event('result', { criterion: '5-echo', mode: 'manual', modelAudioWav: chunks.length ? OUT : null });
  await log.close();
}

main().catch((e) => { console.error('p5 lỗi:', e); process.exit(2); });
