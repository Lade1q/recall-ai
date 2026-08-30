// ③ record_evidence async NON_BLOCKING — liveness + tính-đúng (lane Co-Plan). Giao thức §③.
//
// SỬA sau review Co-Plan (11/08):
//  #1 async thật: declaration behavior=NON_BLOCKING (config.mjs) + tool-response scheduling.
//     Hai chế độ tường minh: chạy SILENT trước; nếu 1008/interrupted/<8 thì chạy lại WHEN_IDLE.
//     Bỏ suy "silent" từ spokeBefore (false-green ở chế độ đồng bộ); tín hiệu SILENT-đúng =
//     fires≥8 & KHÔNG 1008 & KHÔNG interrupted sau tool-response.
//  #2 gom fire theo checkpointId TOÀN CỤC (async tách khỏi ranh giới turn) — quy về step lúc tổng hợp.
//  #3 INV-2 cp_7 hai lượt (mơ hồ → model probe → vẫn mơ hồ → vẫn phải im).
//
// "Sinh viên" chạy bằng TEXT (tất định); output audio + tool trên native-audio thật.
// Residual (Co-Plan #5): tổ hợp audio-in + bắn-tool đồng thời KHÔNG probe nào chạm — để S3.
import '../lib/env.mjs';
import { pathToFileURL } from 'node:url';
import { makeClient, LiveSession, LIVE_MODEL } from '../lib/liveClient.mjs';
import { examinerConfig } from '../lib/config.mjs';
import { loadFixture, probeById } from '../lib/fixture.mjs';
import { Logger } from '../lib/log.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function buildScript(fx) {
  const covered = probeById(fx, 'covered_control');
  const contra = probeById(fx, 'contradicted_control');
  const inv2 = probeById(fx, 'inv2_incomplete');
  return [
    { target: 'cp_1', expect: 'covered', texts: [covered.studentUtterance] },
    { target: 'cp_2', expect: 'contradicted', texts: [contra.studentUtterance] },
    { target: 'cp_3', expect: 'covered', texts: ['Về số byte: lớp A dùng 1 byte NetID và 3 byte Host, lớp B là 2 với 2, lớp C là 3 byte NetID 1 byte Host.'] },
    { target: 'cp_4', expect: 'covered', texts: ['Địa chỉ đường mạng thì giữ nguyên phần NetID, còn phần HostID cho về 0 hết.'] },
    { target: 'cp_5', expect: 'covered', texts: ['Còn broadcast thì giữ NetID, bật tất cả bit HostID lên 1.'] },
    { target: 'cp_6', expect: 'covered', texts: ['Hai host mà cùng địa chỉ đường mạng thì nằm chung một đường mạng.'] },
    // INV-2 hai lượt: mơ hồ, rồi (nếu model hỏi lại) vẫn mơ hồ. Kỳ vọng: 0 fire trên cp_7.
    { target: 'cp_7', expect: 'none', texts: [inv2.studentUtterance, 'Ừm... thật ra tôi vẫn không nhớ, chắc có trừ gì đó mà tôi cũng không chắc nữa.'] },
    { target: 'cp_8', expect: 'covered', texts: ['Ví dụ 172.29.7.10 là lớp B, đường mạng 172.29.0.0, broadcast 172.29.255.255, host từ 172.29.0.1 đến 172.29.255.254.'] },
    { target: 'cp_9', expect: 'covered', texts: ['Lớp D dành cho multicast, còn lớp E để dành, không cấp cho host bình thường.'] },
    { target: 'cp_10', expect: 'covered', texts: ['Dải private gồm 10.0.0.0/8, 172.16 tới 172.31, và 192.168.0.0/16; loopback là 127.'] },
  ];
}

// Chạy toàn kịch bản trong MỘT chế độ scheduling. Gom fire toàn cục.
async function runMode(ai, log, fx, script, mode) {
  log.note(`  --- mode=${mode} ---`);
  const s = new LiveSession(log, { toolScheduling: mode });
  const fires = [];
  let stepIdx = -1;
  s.on('toolcall', (r) => fires.push({ cp: r.args.checkpointId, status: r.args.status, at: r.at, sentStep: stepIdx }));
  await s.open({ ai, model: LIVE_MODEL(), config: examinerConfig(fx) });

  for (stepIdx = 0; stepIdx < script.length; stepIdx++) {
    const step = script[stepIdx];
    for (const text of step.texts) {
      s.sendText(text);
      await s.waitForTurn(35000).catch(() => {});
      await sleep(600);
      if (s.closeInfo) break;
    }
    if (s.closeInfo) { log.note(`    ⚠️ đóng (code=${s.closeInfo.code}) ở step ${step.target}`); break; }
  }
  // drain: gán trailing async fire về step CUỐI (mọi checkpoint đã bàn) — KHÔNG phải -1,
  // kẻo future-cp check (misattribution) cờ oan mọi trailing fire hợp lệ.
  stepIdx = script.length - 1;
  await sleep(2500); // drain async NON_BLOCKING trailing fires
  s.close();

  return {
    mode,
    fires,
    close1008: s.closeInfo?.code === 1008,
    closeCode: s.closeInfo?.code ?? null,
    interrupted: s.interruptedCount,
  };
}

const IN_ENUM = new Set(['covered', 'contradicted']);

export function evaluate(fx, script, run) {
  const validIds = new Set(fx.checkpoints.map((c) => c.id));

  // CHỈ fire in-enum mới là evidence dùng được. status ngoài enum ("Running") = rác, đếm riêng,
  // KHÔNG tính vào ≥8 liveness (Co-Plan Q2c: tính nó vào = false-green, qua cổng bằng rác).
  const enumInvalid = run.fires.filter((f) => !IN_ENUM.has(f.status)).length;
  const validFires = run.fires.filter((f) => IN_ENUM.has(f.status));

  const byCp = new Map();
  for (const f of validFires) byCp.set(f.cp, [...(byCp.get(f.cp) || []), f]);

  const steps = script.map((step) => {
    const sf = byCp.get(step.target) || [];
    const hit = step.expect === 'none' ? sf.length === 0 : sf.some((f) => f.status === step.expect);
    return { target: step.target, expect: step.expect, fires: sf.map((f) => f.status), hit };
  });

  const wrongId = validFires.filter((f) => !validIds.has(f.cp)).length; // checkpointId ẢO (hallucination)

  // MISATTRIBUTION (Co-Plan): id HỢP LỆ nhưng bắn cho checkpoint CHƯA bàn tới (tương lai).
  // Check lệch MỘT CHIỀU dùng sentStep: chỉ cờ khi targetStep[cp] > sentStep. Trailing async fire
  // cho cp hiện tại/đã qua = OK ⇒ KHÔNG cờ oan.
  const targetStep = new Map(script.map((s, i) => [s.target, i]));
  const misattributed = validFires.filter(
    (f) => validIds.has(f.cp) && targetStep.has(f.cp) && targetStep.get(f.cp) > f.sentStep,
  ).length;

  const inv2Ok = (byCp.get('cp_7') || []).length === 0;
  const contraOk = (byCp.get('cp_2') || []).some((f) => f.status === 'contradicted');

  const livenessOk = validFires.length >= 8 && !run.close1008; // đếm CHỈ in-enum
  // mode "clean" = liveness + attribution sạch. BỎ interrupted (barge-in 2-lượt là bình thường,
  // không phải lỗi cơ chế — Co-Plan bonus). Tiêu chí này quyết định mode nào được chọn.
  const attributionClean = wrongId === 0 && misattributed === 0 && enumInvalid === 0;
  const modeClean = livenessOk && attributionClean;
  // fidelity báo RIÊNG — có thể ĐỎ dù mode clean (đúng ca SILENT: attribution sạch nhưng INV-2 vi phạm).
  const fidelityOk = attributionClean && inv2Ok && contraOk;
  return {
    steps, totalFiresAll: run.fires.length, validFires: validFires.length, enumInvalid,
    wrongId, misattributed, inv2Ok, contraOk, livenessOk, attributionClean, modeClean, fidelityOk,
  };
}

function printRun(log, run, ev) {
  log.note(`  === ${run.mode} ===`);
  for (const st of ev.steps) {
    log.note(`    ${st.target} expect=${st.expect} fires=[${st.fires.join(',')}] ${st.hit ? '✓' : '✗'}`);
  }
  log.note(`    liveness  : valid=${ev.validFires}(≥8?) · enum-lạ=${ev.enumInvalid} (không tính) · 1008=${run.close1008} => ${ev.livenessOk ? 'ĐẠT' : 'KHÔNG'}`);
  log.note(`    attribution: id-ảo=${ev.wrongId} · future-cp=${ev.misattributed} · enum-lạ=${ev.enumInvalid} => ${ev.attributionClean ? 'SẠCH' : 'BẨN'}`);
  log.note(`    fidelity  : INV-2(cp_7 im)=${ev.inv2Ok ? 'OK' : 'VI PHẠM'} · contradicted-ctrl(cp_2)=${ev.contraOk ? 'OK' : 'HỎNG'} => ${ev.fidelityOk ? 'ĐẠT' : 'ĐỎ'}`);
  log.note(`    interrupted=${run.interrupted} (không tính vào mode-clean)`);
}

async function main() {
  const log = new Logger('p3-evidence');
  const fx = loadFixture();
  const script = buildScript(fx);
  log.note(`③ EVIDENCE — concept=${fx.conceptId} · ${script.length} checkpoint · model=${LIVE_MODEL()}`);

  const ai = makeClient();

  // Chạy SILENT trước. Nếu SILENT "clean" (liveness+attribution, KHÔNG xét interrupted) thì chọn nó
  // = nhánh A và KHÔNG cần chạy WHEN_IDLE. Chỉ rơi WHEN_IDLE khi SILENT bẩn.
  const silentRun = await runMode(ai, log, fx, script, 'SILENT');
  const silentEval = evaluate(fx, script, silentRun);
  printRun(log, silentRun, silentEval); // báo run này (Co-Plan (a): không giấu)

  let branch, chosen, chosenEval;
  let idleRun = null;
  let idleEval = null;
  if (silentEval.modeClean) {
    branch = 'A: SILENT sạch (liveness+attribution) — mode tốt nhất về gán nhãn';
    chosen = silentRun;
    chosenEval = silentEval;
  } else {
    log.note('  SILENT không sạch (mode) -> thử WHEN_IDLE');
    idleRun = await runMode(ai, log, fx, script, 'WHEN_IDLE');
    idleEval = evaluate(fx, script, idleRun);
    printRun(log, idleRun, idleEval); // báo cả run này nữa
    if (idleEval.modeClean) {
      branch = 'B: WHEN_IDLE sạch (SILENT không sạch)';
    } else {
      branch = 'C: SUY BIẾN — cả hai mode đều bẩn ⇒ cân nhắc gộp assess_checkpoints. PING CO-PLAN.';
    }
    chosen = idleRun;
    chosenEval = idleEval;
  }

  const livenessPass = branch.startsWith('A') || branch.startsWith('B');
  log.note('');
  log.note(`KẾT QUẢ ③ — nhánh ${branch}`);
  log.note(`  GATE liveness (${chosen.mode}): ${livenessPass ? 'ĐẠT ✅' : 'KHÔNG ĐẠT ❌'}`);
  log.note(
    `  fidelity (${chosen.mode}): ${chosenEval.fidelityOk ? 'ĐẠT ✅' : 'ĐỎ ❌'}` +
      (chosenEval.fidelityOk ? '' : ` — ${!chosenEval.inv2Ok ? 'INV-2 vi phạm ' : ''}${!chosenEval.attributionClean ? 'attribution bẩn ' : ''}${!chosenEval.contraOk ? 'contradicted-ctrl hỏng ' : ''}=> lật §2.3, PING CO-PLAN`),
  );
  log.note('  (fidelity KHÔNG thuộc 5 tiêu chí GO/NO-GO §4 nhưng lật §2.3 nếu đỏ — Co-Plan diễn giải)');

  log.event('result', {
    criterion: '3-evidence', branch, livenessPass,
    silent: { mode: 'SILENT', closeCode: silentRun.closeCode, interrupted: silentRun.interrupted, eval: silentEval },
    whenIdle: idleRun ? { mode: 'WHEN_IDLE', closeCode: idleRun.closeCode, interrupted: idleRun.interrupted, eval: idleEval } : null,
    chosenMode: chosen.mode,
  });
  log.note(`(log: ${log.path})`);
  await log.close();
  process.exit(livenessPass ? 0 : 1);
}

// chỉ chạy khi gọi trực tiếp (cho phép import buildScript/evaluate để unit-test).
// pathToFileURL để khớp mã hoá %20 khi đường dẫn có dấu cách (repo path có "  ").
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error('p3 lỗi:', e); process.exit(2); });
}
