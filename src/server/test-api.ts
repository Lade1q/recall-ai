import * as dotenv from 'dotenv';
dotenv.config();

import prisma from './src/config/prisma';
import * as jwt from 'jsonwebtoken';

const JWT_SECRET = 'your_jwt_secret_minimum_32_characters';
const BASE_URL = 'http://localhost:3001';

async function main() {
  console.log('--- CHUẨN BỊ MOCK DATA ---');

  // Tạo 2 user riêng biệt
  const ts = Date.now();
  const userA = await prisma.user.create({
    data: { email: `usera-${ts}@test.com`, passwordHash: 'fake', name: 'User A' },
  });
  const userB = await prisma.user.create({
    data: { email: `userb-${ts}@test.com`, passwordHash: 'fake', name: 'User B' },
  });

  // Plan + Concept + Session cho User A
  const planA = await prisma.studyPlan.create({ data: { userId: userA.id, name: 'Plan A' } });
  const conceptA = await prisma.concept.create({
    data: { planId: planA.id, name: 'Concept A', source: 'manual', masteryScore: 0 },
  });
  const sessionA = await prisma.interviewSession.create({
    data: {
      userId: userA.id,
      planId: planA.id,
      status: 'active',
      conceptQueue: [conceptA.id],
    },
  });

  // Plan + Concept + Session cho User B
  const planB = await prisma.studyPlan.create({ data: { userId: userB.id, name: 'Plan B' } });
  const conceptB = await prisma.concept.create({
    data: { planId: planB.id, name: 'Concept B', source: 'manual', masteryScore: 0 },
  });
  const sessionB = await prisma.interviewSession.create({
    data: {
      userId: userB.id,
      planId: planB.id,
      status: 'active',
      conceptQueue: [conceptB.id],
    },
  });

  const tokenA = jwt.sign({ userId: userA.id }, JWT_SECRET);

  // ============================================================
  console.log('\n\n=== 📍 TC-AE-010: BẢO MẬT (PHÂN QUYỀN) ===');
  console.log(`Dùng Token User A gọi API nộp bài vào Session của User B (${sessionB.id})...`);

  const res010 = await fetch(`${BASE_URL}/api/v1/interviews/${sessionB.id}/answers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
    body: JSON.stringify({ answerText: 'User A tọc mạch bài của B' }),
  });

  const data010 = (await res010.json().catch(() => ({}))) as unknown;
  console.log(`HTTP Status: ${res010.status}`);
  console.log(`Response:`, JSON.stringify(data010, null, 2));

  if (res010.status === 404) {
    console.log('=> KẾT LUẬN TC-010: ✅ PASS (404 Not Found — đúng thiết kế bảo mật)');
  } else {
    console.log('=> KẾT LUẬN TC-010: ❌ FAIL (Hệ thống không chặn truy cập chéo người dùng)');
  }

  // ============================================================
  console.log('\n\n=== 📍 TC-AE-011: IDEMPOTENCY (GỬI ĐÚP) ===');
  console.log(`Bắn 2 request ĐỒNG THỜI vào Session của User A (${sessionA.id})...`);

  const [res011a, res011b] = await Promise.all([
    fetch(`${BASE_URL}/api/v1/interviews/${sessionA.id}/answers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ answerText: 'Câu trả lời gửi đúp' }),
    }),
    fetch(`${BASE_URL}/api/v1/interviews/${sessionA.id}/answers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ answerText: 'Câu trả lời gửi đúp' }),
    }),
  ]);

  const [data011a, data011b] = (await Promise.all([
    res011a.json().catch(() => ({})),
    res011b.json().catch(() => ({})),
  ])) as [unknown, unknown];

  console.log(`Request 1 — HTTP ${res011a.status}:`, JSON.stringify(data011a).substring(0, 120));
  console.log(`Request 2 — HTTP ${res011b.status}:`, JSON.stringify(data011b).substring(0, 120));

  const turns = await prisma.interviewTurn.count({ where: { sessionId: sessionA.id } });
  console.log(`Số lượt (turns) trong DB: ${turns}`);

  const statuses = [res011a.status, res011b.status].sort();
  if (turns === 1 && JSON.stringify(statuses) === JSON.stringify([200, 409])) {
    console.log(
      '=> KẾT LUẬN TC-011: ✅ PASS (1 request thành công 200, 1 request bị chặn 409, DB chỉ có 1 turn)'
    );
  } else if (res011a.status === 409 && res011b.status === 409) {
    console.log(
      '=> KẾT LUẬN TC-011: ❌ FAIL (Cả 2 request đều bị 409, không có lượt nào được tạo trong DB — lỗi logic Race Condition)'
    );
  } else {
    console.log(
      `=> KẾT LUẬN TC-011: ❌ FAIL (Hành vi không mong đợi: statuses=${statuses}, turns=${turns})`
    );
  }

  // Cleanup
  await prisma.interviewSession.deleteMany({ where: { id: { in: [sessionA.id, sessionB.id] } } });
  await prisma.concept.deleteMany({ where: { id: { in: [conceptA.id, conceptB.id] } } });
  await prisma.studyPlan.deleteMany({ where: { id: { in: [planA.id, planB.id] } } });
  await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
  console.log('\n--- Đã dọn sạch mock data ---');
}

main()
  .catch((e) => console.error('LỖI:', e))
  .finally(() => prisma.$disconnect());
