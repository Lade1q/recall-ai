import { replacePlanGraph } from '../services/graph.service';
import prisma from '../config/prisma';

/**
 * Regression coverage for the hard-delete bug found while implementing SP-05 re-analyze
 * (#170): `replacePlanGraph` used to diff the submitted graph against *every* concept row,
 * `deprecated` tombstones included. A tombstone is never shown to the editor (`getPlanById`
 * only returns `active` concepts), so it can never appear in a submitted graph — reading
 * that as "the user dropped it" would hard-delete the very mastery history `planConceptMerge`
 * kept it around to preserve.
 */
jest.mock('../config/prisma', () => {
  const client = {
    studyPlan: { findUnique: jest.fn(), update: jest.fn() },
    concept: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
      create: jest.fn(),
    },
    conceptEdge: { deleteMany: jest.fn(), createMany: jest.fn() },
    $transaction: jest.fn(),
  };
  client.$transaction.mockImplementation((fn: (tx: typeof client) => Promise<unknown>) =>
    fn(client)
  );
  return { __esModule: true, default: client };
});

const mockedPrisma = prisma as jest.Mocked<typeof prisma>;

const OWNER_ID = 'user-owner-uuid';
const PLAN_ID = 'plan-uuid';

describe('replacePlanGraph — deprecated concepts are never diffed for deletion', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (mockedPrisma.$transaction as jest.Mock).mockImplementation(
      (fn: (tx: typeof mockedPrisma) => Promise<unknown>) => fn(mockedPrisma)
    );
    (mockedPrisma.studyPlan.findUnique as jest.Mock).mockResolvedValue({
      id: PLAN_ID,
      userId: OWNER_ID,
      status: 'draft',
    });
    // Only the active concept is ever returned — status: 'active' is asserted below to make
    // sure this reflects the real query, not just this mock's own filtering.
    (mockedPrisma.concept.findMany as jest.Mock).mockResolvedValue([
      { id: 'concept-a', name: 'A' },
    ]);
    (mockedPrisma.studyPlan.update as jest.Mock).mockResolvedValue({
      id: PLAN_ID,
      status: 'draft',
      dagAutoFixed: false,
      concepts: [],
      conceptEdges: [],
    });
  });

  it('queries existing concepts scoped to status: active', async () => {
    await replacePlanGraph(PLAN_ID, OWNER_ID, {
      concepts: [{ name: 'A' }],
      edges: [],
      confirm: false,
    });

    expect(mockedPrisma.concept.findMany).toHaveBeenCalledWith({
      where: { planId: PLAN_ID, status: 'active' },
      select: { id: true, name: true },
    });
  });

  it('does not delete anything when the submitted graph omits a name that was never fetched (deprecated tombstone)', async () => {
    // The editor never sent "Z" because it is deprecated and was excluded from the fetch —
    // it must not be treated as a dropped concept.
    await replacePlanGraph(PLAN_ID, OWNER_ID, {
      concepts: [{ name: 'A' }],
      edges: [],
      confirm: false,
    });

    expect(mockedPrisma.concept.deleteMany).not.toHaveBeenCalled();
  });

  it('still hard-deletes an active concept the user actually removed from the graph', async () => {
    (mockedPrisma.concept.findMany as jest.Mock).mockResolvedValue([
      { id: 'concept-a', name: 'A' },
      { id: 'concept-b', name: 'B' },
    ]);

    await replacePlanGraph(PLAN_ID, OWNER_ID, {
      concepts: [{ name: 'A' }],
      edges: [],
      confirm: false,
    });

    expect(mockedPrisma.concept.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['concept-b'] } },
    });
  });
});
