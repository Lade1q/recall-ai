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
    document: { findMany: jest.fn() },
    documentEdge: { deleteMany: jest.fn(), createMany: jest.fn() },
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

/**
 * The topic layer through `PUT /plans/:id/graph` — the answer to "I reviewed the dashed arrows,
 * how do I fix one?", which until now was "you cannot, only re-analyse".
 *
 * The dangerous half is not the write, it is the DEFAULT. The editor re-sends the concept graph
 * after every keystroke for a live DAG check and knows nothing about topics; if a missing field
 * meant "no topic edges", the first edit would erase the study order between documents with the
 * arrows off-screen at that moment.
 */
describe('replacePlanGraph — the topic layer', () => {
  const DOC_A = '11111111-1111-4111-8111-111111111111';
  const DOC_B = '22222222-2222-4222-8222-222222222222';
  const DOC_GONE = '33333333-3333-4333-8333-333333333333';

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
    (mockedPrisma.concept.findMany as jest.Mock).mockResolvedValue([]);
    (mockedPrisma.concept.create as jest.Mock).mockImplementation(
      ({ data }: { data: { name: string } }) => Promise.resolve({ id: `concept-${data.name}` })
    );
    (mockedPrisma.conceptEdge.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });
    (mockedPrisma.document.findMany as jest.Mock).mockResolvedValue([{ id: DOC_A }, { id: DOC_B }]);
    (mockedPrisma.documentEdge.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });
    (mockedPrisma.documentEdge.createMany as jest.Mock).mockResolvedValue({ count: 0 });
    (mockedPrisma.studyPlan.update as jest.Mock).mockResolvedValue({
      id: PLAN_ID,
      status: 'draft',
      dagAutoFixed: false,
      concepts: [],
      conceptEdges: [],
    });
  });

  /** 🔴 The default. */
  it('leaves the topic layer untouched when the field is absent', async () => {
    await replacePlanGraph(PLAN_ID, OWNER_ID, {
      concepts: [{ name: 'A' }],
      edges: [],
      confirm: false,
    });

    expect(mockedPrisma.documentEdge.deleteMany).not.toHaveBeenCalled();
    expect(mockedPrisma.documentEdge.createMany).not.toHaveBeenCalled();
  });

  /** …and the other half: an explicit empty list is a real instruction, not a missing field. */
  it('clears the topic layer when the caller sends an empty list', async () => {
    await replacePlanGraph(PLAN_ID, OWNER_ID, {
      concepts: [{ name: 'A' }],
      edges: [],
      documentEdges: [],
      confirm: false,
    });

    expect(mockedPrisma.documentEdge.deleteMany).toHaveBeenCalledWith({
      where: { planId: PLAN_ID },
    });
    expect(mockedPrisma.documentEdge.createMany).not.toHaveBeenCalled();
  });

  it('replaces the topic layer with what the caller sent', async () => {
    await replacePlanGraph(PLAN_ID, OWNER_ID, {
      concepts: [{ name: 'A' }],
      edges: [],
      documentEdges: [{ from: DOC_A, to: DOC_B }],
      confirm: false,
    });

    expect(mockedPrisma.documentEdge.createMany).toHaveBeenCalledWith({
      data: [{ planId: PLAN_ID, fromDocumentId: DOC_A, toDocumentId: DOC_B }],
    });
  });

  it('drops an arrow naming a document the plan no longer holds, rather than 400-ing', async () => {
    await replacePlanGraph(PLAN_ID, OWNER_ID, {
      concepts: [{ name: 'A' }],
      edges: [],
      documentEdges: [
        { from: DOC_A, to: DOC_B },
        { from: DOC_A, to: DOC_GONE },
      ],
      confirm: false,
    });

    expect(mockedPrisma.documentEdge.createMany).toHaveBeenCalledWith({
      data: [{ planId: PLAN_ID, fromDocumentId: DOC_A, toDocumentId: DOC_B }],
    });
  });

  it('drops a self-loop and a duplicate pair', async () => {
    await replacePlanGraph(PLAN_ID, OWNER_ID, {
      concepts: [{ name: 'A' }],
      edges: [],
      documentEdges: [
        { from: DOC_A, to: DOC_A },
        { from: DOC_A, to: DOC_B },
        { from: DOC_A, to: DOC_B },
      ],
      confirm: false,
    });

    expect(mockedPrisma.documentEdge.createMany).toHaveBeenCalledWith({
      data: [{ planId: PLAN_ID, fromDocumentId: DOC_A, toDocumentId: DOC_B }],
    });
  });

  /**
   * A cycle is REJECTED, not repaired. Unlike the drops above it is a deliberate pair of claims
   * by the student; discarding one of them silently would hide which half was thrown away.
   */
  it('rejects a cycle between topics instead of dropping half of it', async () => {
    const error = await replacePlanGraph(PLAN_ID, OWNER_ID, {
      concepts: [{ name: 'A' }],
      edges: [],
      documentEdges: [
        { from: DOC_A, to: DOC_B },
        { from: DOC_B, to: DOC_A },
      ],
      confirm: false,
    }).catch((e) => e);

    expect(error).toMatchObject({ statusCode: 409, code: 'DAG_CYCLE' });
    expect(mockedPrisma.documentEdge.createMany).not.toHaveBeenCalled();
  });
});
