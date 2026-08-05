import 'dotenv/config';
import prisma from './src/config/prisma';
import * as jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_minimum_32_characters';

async function runTest() {
  console.log('=== STARTING API TESTS ===\n');

  const session = await prisma.interviewSession.findFirst({
    where: { status: 'active' },
    include: { plan: { include: { user: true } } },
    orderBy: { createdAt: 'desc' },
  });

  if (!session) {
    console.log('No session found in DB. Cannot test.');
    return;
  }

  const userA = session.plan.user;
  const tokenA = jwt.sign({ userId: userA.id, email: userA.email }, JWT_SECRET, {
    expiresIn: '1h',
  });
  const tokenB = jwt.sign(
    { userId: '00000000-0000-0000-0000-000000000000', email: 'hacker@example.com' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  console.log('1. TESTING SECURITY (CF-07)');
  console.log(
    `Action: User B (Hacker) trying to submit answer to User A's session (${session.id})`
  );

  const secRes = await fetch(`http://localhost:3001/api/v1/interviews/${session.id}/answers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenB}` },
    body: JSON.stringify({ answerText: 'Hacked!' }),
  });

  console.log(`Result: HTTP Status ${secRes.status}`);
  if (secRes.status === 404) {
    console.log('-> PASS: System returned 404 Not Found (Information Hiding working correctly).');
  } else {
    console.log(`-> FAIL: Expected 404, got ${secRes.status}.`);
  }

  console.log('\n2. TESTING IDEMPOTENCY (CF-08)');
  const idempotencyKey = 'test-idem-key-' + Date.now();
  console.log(
    `Action: User A sending 2 identical POST requests simultaneously with Idempotency-Key: ${idempotencyKey}`
  );

  const reqOptions = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenA}`,
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify({ answerText: 'This is an idempotency test' }),
  };

  // Fire both requests at the exact same time
  const [res1, res2] = await Promise.all([
    fetch(`http://localhost:3001/api/v1/interviews/${session.id}/answers`, reqOptions),
    fetch(`http://localhost:3001/api/v1/interviews/${session.id}/answers`, reqOptions),
  ]);

  console.log(`Result: HTTP Statuses are [${res1.status}, ${res2.status}]`);

  // Wait a moment for DB to settle
  await new Promise((r) => setTimeout(r, 500));

  const turns = await prisma.interviewTurn.findMany({
    where: {
      sessionId: session.id,
      answerText: 'This is an idempotency test',
    },
  });

  console.log(`Result: Database created ${turns.length} turn(s).`);
  if (turns.length === 1) {
    console.log('-> PASS: System successfully prevented duplicate turns.');
  } else {
    console.log('-> FAIL: System created duplicate turns or none!');
  }

  console.log('\n=== TESTS COMPLETED ===');
}

runTest()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
