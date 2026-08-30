// ④ Auth Vertex + service account. Đạt: 3 phiên × 5 phút, 0 lần rơi 1011.
// Đây là probe CHẶN — không auth được WS thì các probe khác vô nghĩa. Chạy đầu tiên.
import '../lib/env.mjs';
import { makeClient, LiveSession, LIVE_MODEL, Modality } from '../lib/liveClient.mjs';
import { Logger } from '../lib/log.mjs';

const SESSIONS = Number(process.env.P4_SESSIONS || 3);
const SESSION_MS = Number(process.env.P4_SESSION_MS || 300000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runOne(ai, log, idx) {
  const s = new LiveSession(log);
  const result = { idx, connected: false, closeCode: null, got1011: false, error: null };
  try {
    await s.open({
      ai,
      model: LIVE_MODEL(),
      config: {
        responseModalities: [Modality.AUDIO],
        systemInstruction: 'Trả lời rất ngắn bằng tiếng Việt.',
        outputAudioTranscription: {},
      },
    });
    result.connected = true;
    s.on('closed', (info) => {
      result.closeCode = info.code;
      if (info.code === 1011) result.got1011 = true;
    });

    // giữ phiên SESSION_MS, keepalive mỗi 60s
    const deadline = Date.now() + SESSION_MS;
    let ping = 0;
    while (Date.now() < deadline && !s.closeInfo) {
      await sleep(Math.min(60000, deadline - Date.now()));
      if (s.closeInfo) break;
      s.sendText(`ping ${++ping}`);
      await s.waitForTurn(20000).catch(() => {});
    }
  } catch (e) {
    result.error = e?.message || String(e);
    // lỗi auth khi connect cũng tính là fail cửa ④
    if (/1011|auth|permission|credential|unauthor/i.test(result.error)) result.got1011 = true;
  } finally {
    s.close();
  }
  return result;
}

async function main() {
  const log = new Logger('p4-auth');
  log.note(`④ AUTH — ${SESSIONS} phiên × ${(SESSION_MS / 1000).toFixed(0)}s · model=${LIVE_MODEL()}`);
  const ai = makeClient();
  const results = [];
  for (let i = 1; i <= SESSIONS; i++) {
    log.note(`  → phiên ${i}/${SESSIONS} ...`);
    const r = await runOne(ai, log, i);
    results.push(r);
    log.note(
      `    connected=${r.connected} closeCode=${r.closeCode} 1011=${r.got1011}` +
        (r.error ? ` error="${r.error}"` : ''),
    );
  }

  const total1011 = results.filter((r) => r.got1011).length;
  const pass = total1011 === 0 && results.every((r) => r.connected);
  log.note('');
  log.note(`KẾT QUẢ ④: ${total1011} lần 1011 / ${SESSIONS} phiên  =>  ${pass ? 'ĐẠT ✅' : 'KHÔNG ĐẠT ❌'}`);
  log.event('result', { criterion: '4-auth', total1011, sessions: SESSIONS, pass, results });
  log.note(`(log: ${log.path})`);
  await log.close();
  process.exit(pass ? 0 : 1);
}

main().catch((e) => {
  console.error('p4 lỗi:', e);
  process.exit(2);
});
