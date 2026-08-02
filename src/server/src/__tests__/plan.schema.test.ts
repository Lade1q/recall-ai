import {
  conceptDetailParamsSchema,
  createPlanSchema,
  planIdParamSchema,
} from '../schemas/plan.schema';

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Builds the ISO string a browser in Vietnam sends for local midnight of `daysFromToday`. */
function vnLocalMidnightIso(daysFromToday: number): string {
  const nowVn = new Date(Date.now() + VN_OFFSET_MS);
  const vnMidnightUtc = Date.UTC(
    nowVn.getUTCFullYear(),
    nowVn.getUTCMonth(),
    nowVn.getUTCDate() + daysFromToday
  );
  return new Date(vnMidnightUtc - VN_OFFSET_MS).toISOString();
}

/** Builds the plain "yyyy-MM-dd" string the client actually sends for `daysFromToday`. */
function vnDateOnlyString(daysFromToday: number): string {
  const nowVn = new Date(Date.now() + VN_OFFSET_MS);
  const targetVn = new Date(
    Date.UTC(nowVn.getUTCFullYear(), nowVn.getUTCMonth(), nowVn.getUTCDate() + daysFromToday)
  );
  return targetVn.toISOString().slice(0, 10);
}

describe('createPlanSchema deadline', () => {
  const base = { name: 'Test plan' };

  it('accepts a deadline of today (Vietnam local midnight), matching the client-allowed choice', () => {
    expect(() =>
      createPlanSchema.parse({ ...base, deadline: vnLocalMidnightIso(0) })
    ).not.toThrow();
  });

  it('accepts a deadline in the future', () => {
    expect(() =>
      createPlanSchema.parse({ ...base, deadline: vnLocalMidnightIso(5) })
    ).not.toThrow();
  });

  it('rejects a deadline of yesterday', () => {
    expect(() => createPlanSchema.parse({ ...base, deadline: vnLocalMidnightIso(-1) })).toThrow(
      /future date/
    );
  });

  it('accepts a plain "yyyy-MM-dd" deadline of today (actual wire format sent by the client)', () => {
    expect(() => createPlanSchema.parse({ ...base, deadline: vnDateOnlyString(0) })).not.toThrow();
  });

  it('rejects a plain "yyyy-MM-dd" deadline of yesterday', () => {
    expect(() => createPlanSchema.parse({ ...base, deadline: vnDateOnlyString(-1) })).toThrow(
      /future date/
    );
  });

  it('rejects an invalid date string', () => {
    expect(() => createPlanSchema.parse({ ...base, deadline: 'not-a-date' })).toThrow();
  });

  it('rejects an empty deadline', () => {
    expect(() => createPlanSchema.parse({ ...base, deadline: '' })).toThrow(/required/);
  });
});

// Regression coverage for PR #160: id là @db.Uuid trong Prisma — một id không phải UUID
// ném PrismaClientKnownRequestError P2023 chưa được errorHandler map, rớt xuống 500
// INTERNAL_ERROR nếu không bị chặn ở đây trước khi chạm service/Prisma.
describe('planIdParamSchema', () => {
  it('accepts a valid UUID', () => {
    expect(() =>
      planIdParamSchema.parse({ id: '11111111-1111-4111-8111-111111111111' })
    ).not.toThrow();
  });

  it('rejects a missing id', () => {
    expect(() => planIdParamSchema.parse({})).toThrow();
  });

  it('rejects an empty id', () => {
    expect(() => planIdParamSchema.parse({ id: '' })).toThrow();
  });

  it('rejects a non-UUID string id', () => {
    expect(() => planIdParamSchema.parse({ id: 'plan-uuid' })).toThrow();
    expect(() => planIdParamSchema.parse({ id: 'abc' })).toThrow();
  });

  it('rejects a UUID missing a segment', () => {
    expect(() => planIdParamSchema.parse({ id: '11111111-1111-4111-8111' })).toThrow();
  });
});

// Route lồng GET /plans/:id/concepts/:conceptId — cả hai param đều là @db.Uuid, nên đều phải
// chặn P2023→500 (cùng lỗi PR #191 đã vá cho các route /plans khác, xem concept.controller.ts).
describe('conceptDetailParamsSchema', () => {
  const validPlanId = '11111111-1111-4111-8111-111111111111';
  const validConceptId = '22222222-2222-4222-8222-222222222222';

  it('accepts a pair of valid UUIDs', () => {
    expect(() =>
      conceptDetailParamsSchema.parse({ id: validPlanId, conceptId: validConceptId })
    ).not.toThrow();
  });

  it('rejects a non-UUID plan id', () => {
    expect(() =>
      conceptDetailParamsSchema.parse({ id: 'plan-uuid', conceptId: validConceptId })
    ).toThrow();
  });

  it('rejects a non-UUID conceptId', () => {
    expect(() =>
      conceptDetailParamsSchema.parse({ id: validPlanId, conceptId: 'concept-uuid' })
    ).toThrow();
  });

  it('rejects a missing conceptId', () => {
    expect(() => conceptDetailParamsSchema.parse({ id: validPlanId })).toThrow();
  });
});
