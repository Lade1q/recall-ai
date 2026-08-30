// ② Chất lượng vi-VN trên PDF thật. Đạt: ≥9/10 câu hỏi tiếng Việt tự nhiên, không trôi sang English.
// Probe SINH 10 câu hỏi từ materialSlice; CON NGƯỜI chấm (tự nhiên? trôi English? trong lát?).
// Máy chỉ gợi ý cờ "nghi trôi English" bằng heuristic để người soi nhanh — quyết định vẫn là người.
import '../lib/env.mjs';
import { makeClient, LiveSession, LIVE_MODEL } from '../lib/liveClient.mjs';
import { questionGenConfig } from '../lib/config.mjs';
import { loadFixture } from '../lib/fixture.mjs';
import { Logger } from '../lib/log.mjs';

const N = 10;

// Từ tiếng Anh hay bị model chèn vào (thuật ngữ giữ nguyên như NetID/broadcast KHÔNG tính là trôi).
const OK_TERMS = /\b(netid|hostid|host|broadcast|multicast|ip|ipv4|loopback|private|public|class|octet|subnet|mask)\b/gi;
function suspectEnglish(text) {
  const stripped = text.replace(OK_TERMS, '');
  const en = stripped.match(/\b(the|is|are|what|which|address|network|number|range|explain|describe|between)\b/gi);
  return en ? [...new Set(en.map((w) => w.toLowerCase()))] : [];
}

async function main() {
  const log = new Logger('p2-viquality');
  const fx = loadFixture();
  log.note(`② VI-QUALITY — concept=${fx.conceptId} · xin ${N} câu · model=${LIVE_MODEL()}`);

  const ai = makeClient();
  const s = new LiveSession(log);
  await s.open({ ai, model: LIVE_MODEL(), config: questionGenConfig(fx) });

  const questions = [];
  for (let i = 0; i < N; i++) {
    const prompt = i === 0 ? 'Bắt đầu đi, hỏi câu hỏi số 1.' : 'tiếp';
    const collect = [];
    const onOut = (t) => collect.push(t.outText);
    s.sendText(prompt);
    let turn;
    try { turn = await s.waitForTurn(30000); } catch (e) { log.note(`  [${i + 1}] lỗi: ${e.message}`); if (s.closeInfo) break; continue; }
    const q = (turn.outText || '').trim();
    questions.push(q);
    const susp = suspectEnglish(q);
    log.note(`  Q${i + 1}: ${q}${susp.length ? `   ⟵ nghi English: ${susp.join(',')}` : ''}`);
  }
  s.close();

  log.note('');
  log.note(`Đã sinh ${questions.length}/${N} câu. CHẤM TAY: mỗi câu (a) tiếng Việt tự nhiên? (b) không trôi English? (c) trong phạm vi lát?`);
  log.note('Đạt cổng ②: ≥9/10. (Cờ "nghi English" chỉ để soi nhanh — người quyết định.)');
  log.event('result', { criterion: '2-viquality', asked: N, got: questions.length, questions });
  log.note(`(log đầy đủ: ${log.path})`);
  await log.close();
}

main().catch((e) => { console.error('p2 lỗi:', e); process.exit(2); });
