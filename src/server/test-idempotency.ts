/**
 * TC-AE-011: Idempotency Test
 *
 * Cách dùng:
 *   SESSION_ID=<id> TOKEN=<jwt> npx ts-node test-idempotency.ts
 */
const SESSION_ID = process.env.SESSION_ID;
const TOKEN = process.env.TOKEN;
const BASE_URL = 'http://localhost:3001';

if (!SESSION_ID || !TOKEN) {
  console.error('❌ Thiếu biến môi trường. Chạy lệnh như sau:');
  console.error('   SESSION_ID=<id> TOKEN=<jwt> npx ts-node test-idempotency.ts');
  process.exit(1);
}

async function main() {
  console.log(`=== 📍 TC-AE-011: IDEMPOTENCY (GỬI ĐÚP) ===`);
  console.log(`Session: ${SESSION_ID}`);
  console.log(`Bắn 2 request ĐỒNG THỜI vào POST /answers...\n`);

  const [resA, resB] = await Promise.all([
    fetch(`${BASE_URL}/api/v1/interviews/${SESSION_ID}/answers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({ answerText: 'Câu trả lời gửi đúp — request 1' }),
    }),
    fetch(`${BASE_URL}/api/v1/interviews/${SESSION_ID}/answers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({ answerText: 'Câu trả lời gửi đúp — request 2' }),
    }),
  ]);

  const [dataA, dataB] = (await Promise.all([
    resA.json().catch(() => ({})),
    resB.json().catch(() => ({})),
  ])) as [unknown, unknown];

  console.log(`Request 1 — HTTP ${resA.status}:`, JSON.stringify(dataA).substring(0, 150));
  console.log(`Request 2 — HTTP ${resB.status}:`, JSON.stringify(dataB).substring(0, 150));

  const isReplayedA = dataA?.data?.replayed === true;
  const isReplayedB = dataB?.data?.replayed === true;

  if (
    resA.status === 200 &&
    resB.status === 200 &&
    (isReplayedA || isReplayedB) &&
    !(isReplayedA && isReplayedB)
  ) {
    console.log('\n=> KẾT LUẬN TC-011: ✅ PASS');
    console.log(
      '   Cả 2 request đều thành công (200), nhưng 1 request được đánh dấu là `replayed: true`.'
    );
    console.log('   Hệ thống ĐÃ CHẶN double-submit thành công bằng replay logic!');
  } else if (resA.status === 200 && resB.status === 200) {
    console.log('\n=> KẾT LUẬN TC-011: ❌ FAIL');
    console.log(
      '   Cả 2 request đều thành công (200) và KHÔNG có request nào được replay — DB có thể tạo 2 turn bị trùng!'
    );
  } else {
    console.log(
      `\n=> KẾT LUẬN TC-011: ⚠️  CẦN KIỂM TRA THỦ CÔNG (statuses=[${resA.status}, ${resB.status}])`
    );
  }
}

main().catch((e) => console.error('LỖI:', e));
