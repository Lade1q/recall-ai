import { getUserPlans, getPlanById } from '../services/plan.service';
import prisma from '../config/prisma';

/**
 * Regression test for a bug caught only by exercising SP-05 re-analyze end-to-end against
 * a real database (not by reading the code): `getUserPlans` and `getPlanById` selected a
 * plan's concepts with no `status` filter, so a concept `planConceptMerge` had deprecated
 * (#170) still counted toward `conceptCount` and still rendered as a node in the concept
 * graph — a tombstone kept for mastery history leaking into what the student sees as their
 * current material.
 *
 * A mocked Prisma client returns whatever the mock is told to regardless of the `where`
 * clause it was called with, so the only way a unit test catches a regression here is by
 * asserting on the query shape itself — the same pattern `retry-plan.test.ts` uses to pin
 * its `select`.
 */
jest.mock('../config/prisma', () => {
  const client = {
    studyPlan: { findMany: jest.fn(), findUnique: jest.fn() },
    analysisJob: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn() },
  };
  return { __esModule: true, default: client };
});

const mockedPrisma = prisma as jest.Mocked<typeof prisma>;

const USER_ID = 'user-owner-uuid';
const PLAN_ID = 'plan-uuid';

describe('getUserPlans', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (mockedPrisma.analysisJob.findMany as jest.Mock).mockResolvedValue([]);
  });

  it('queries only active concepts, so a deprecated one cannot inflate conceptCount', async () => {
    (mockedPrisma.studyPlan.findMany as jest.Mock).mockResolvedValue([]);

    await getUserPlans(USER_ID);

    expect(mockedPrisma.studyPlan.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          concepts: { where: { status: 'active' }, select: { masteryScore: true } },
        }),
      })
    );
  });

  it('counts only the concepts the query actually returned', async () => {
    (mockedPrisma.studyPlan.findMany as jest.Mock).mockResolvedValue([
      {
        id: PLAN_ID,
        name: 'Ngăn xếp và Hàng đợi',
        deadline: null,
        status: 'active',
        createdAt: new Date('2026-07-31'),
        // A real query already excludes the deprecated concept — this fixture is what
        // Prisma would hand back, not what the mock is trusted to filter.
        concepts: [{ masteryScore: null }, { masteryScore: 0.9 }],
        documents: [],
      },
    ]);

    const plans = await getUserPlans(USER_ID);

    expect(plans[0]?.conceptCount).toBe(2);
    expect(plans[0]?.masteryDistribution).toEqual({ strong: 1, learning: 0, weak: 0, untested: 1 });
  });
});

describe('getPlanById', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (mockedPrisma.analysisJob.findFirst as jest.Mock).mockResolvedValue(null);
  });

  it('queries only active concepts, so a deprecated one cannot render as a graph node', async () => {
    (mockedPrisma.studyPlan.findUnique as jest.Mock).mockResolvedValue({
      id: PLAN_ID,
      userId: USER_ID,
      name: 'Ngăn xếp và Hàng đợi',
      deadline: null,
      status: 'active',
      dagAutoFixed: false,
      tracebackEnabled: true,
      createdAt: new Date('2026-07-31'),
      updatedAt: new Date('2026-07-31'),
      concepts: [],
      conceptEdges: [],
      documents: [],
    });

    await getPlanById(PLAN_ID, USER_ID);

    const call = (mockedPrisma.studyPlan.findUnique as jest.Mock).mock.calls[0][0];
    expect(call.include.concepts.where).toEqual({ status: 'active' });
  });
});
