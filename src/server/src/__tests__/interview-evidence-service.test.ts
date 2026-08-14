import { upsertEvidence } from '../services/interview-evidence.service';
import prisma from '../config/prisma';
import type { Prisma } from '@prisma/client';

jest.mock('../config/prisma', () => ({
  __esModule: true,
  default: { interviewEvidence: { upsert: jest.fn() } },
}));

const mockedPrisma = prisma as jest.Mocked<typeof prisma>;
const upsert = () => mockedPrisma.interviewEvidence.upsert as jest.Mock;

/** The argument of the n-th upsert, typed by the schema so a renamed column fails the build. */
function upsertArg(index: number): Prisma.InterviewEvidenceUpsertArgs {
  return upsert().mock.calls[index][0] as Prisma.InterviewEvidenceUpsertArgs;
}

const SESSION = '11111111-1111-4111-8111-111111111111';
const CONCEPT = '22222222-2222-4222-8222-222222222222';
const CHECKPOINT = '33333333-3333-4333-8333-333333333333';
const TURN = '44444444-4444-4444-8444-444444444444';
const CHECKPOINT_TEXT = 'Giải thích vì sao phải trừ đi hai địa chỉ đặc biệt';

/** The guarded write path (#330). Idempotency itself is a DB constraint — proven live, not here. */
describe('upsertEvidence', () => {
  beforeEach(() => jest.clearAllMocks());

  it('writes a kept fire to the (session, concept, checkpoint) cell with the ruler snapshot', async () => {
    const outcome = await upsertEvidence(SESSION, CONCEPT, CHECKPOINT, CHECKPOINT_TEXT, {
      status: 'covered',
      quote: 'phải trừ địa chỉ mạng và địa chỉ broadcast',
    });

    expect(outcome).toEqual({ kind: 'written', status: 'covered' });
    expect(upsert()).toHaveBeenCalledTimes(1);

    const call = upsertArg(0);
    expect(call.where).toEqual({
      sessionId_conceptId_checkpointId: {
        sessionId: SESSION,
        conceptId: CONCEPT,
        checkpointId: CHECKPOINT,
      },
    });
    expect(call.create).toEqual({
      sessionId: SESSION,
      conceptId: CONCEPT,
      checkpointId: CHECKPOINT,
      checkpointText: CHECKPOINT_TEXT,
      status: 'covered',
      quote: 'phải trừ địa chỉ mạng và địa chỉ broadcast',
      turnRef: null,
    });
    // Every column of the row comes from the fire that last wrote it — the snapshot is refreshed
    // alongside the status so the conclusion and the ruler it was measured against cannot end up
    // describing different moments.
    expect(call.update).toEqual({
      checkpointText: CHECKPOINT_TEXT,
      status: 'covered',
      quote: 'phải trừ địa chỉ mạng và địa chỉ broadcast',
      turnRef: null,
    });
  });

  it('a downgraded fire never reaches the database', async () => {
    const outcome = await upsertEvidence(SESSION, CONCEPT, CHECKPOINT, CHECKPOINT_TEXT, {
      status: 'contradicted',
      quote: '…2 mũ m gì đó, quên phải trừ mấy…|…không chắc nữa',
    });

    expect(outcome).toEqual({ kind: 'skipped', reason: 'downgraded' });
    // Not "wrote a null status" and not "wrote then deleted": no query is issued at all, which is
    // what makes an unresolved checkpoint an absent row for #331 to read as `not_discussed`.
    expect(upsert()).not.toHaveBeenCalled();
  });

  it('an out-of-enum status never reaches the database', async () => {
    const outcome = await upsertEvidence(SESSION, CONCEPT, CHECKPOINT, CHECKPOINT_TEXT, {
      status: 'Running',
      quote: 'một câu trả lời hợp lệ',
    });

    expect(outcome).toEqual({ kind: 'skipped', reason: 'dropped' });
    expect(upsert()).not.toHaveBeenCalled();
  });

  it('a dropped fire leaves an earlier conclusion standing, and a later real fire lands on it', async () => {
    // The guard composes with the unique key (§2.5): `Running` arriving between two real fires
    // must not disturb the cell, and the re-emit must target the SAME cell rather than append.
    await upsertEvidence(SESSION, CONCEPT, CHECKPOINT, CHECKPOINT_TEXT, {
      status: 'contradicted',
      quote: 'lớp B là 192 tới 223',
    });
    await upsertEvidence(SESSION, CONCEPT, CHECKPOINT, CHECKPOINT_TEXT, {
      status: 'Running',
      quote: 'đang xử lý',
    });
    await upsertEvidence(SESSION, CONCEPT, CHECKPOINT, CHECKPOINT_TEXT, {
      status: 'covered',
      quote: 'à không, lớp B là 128 tới 191',
    });

    expect(upsert()).toHaveBeenCalledTimes(2);
    const first = upsertArg(0);
    const second = upsertArg(1);
    expect(second.where).toEqual(first.where);
    expect(second.update.status).toBe('covered');
  });

  it('carries the text path’s turn reference, and leaves it null for voice', async () => {
    await upsertEvidence(
      SESSION,
      CONCEPT,
      CHECKPOINT,
      CHECKPOINT_TEXT,
      { status: 'covered', quote: 'trừ hai địa chỉ' },
      TURN
    );
    expect(upsertArg(0).create).toMatchObject({ turnRef: TURN });

    await upsertEvidence(SESSION, CONCEPT, CHECKPOINT, CHECKPOINT_TEXT, {
      status: 'covered',
      quote: 'trừ hai địa chỉ',
    });
    expect(upsertArg(1).create).toMatchObject({ turnRef: null });
  });
});
