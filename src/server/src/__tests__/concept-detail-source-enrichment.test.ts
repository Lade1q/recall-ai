import prisma from '../config/prisma';
import { getConceptDetail } from '../services/concept-detail.service';

/**
 * #296 — `getConceptDetail` (DB-06 panel, and FS-04's `useSessionDocument` via the same
 * endpoint) must pass `sectionTitle`/`context` straight through from `ConceptSourceRef`,
 * `null` and all, so the client can tell "not populated yet" (pre-#296 rows) apart from
 * an absent field.
 *
 * Factory mock — no Prisma client constructed, passes without DATABASE_URL (R05).
 */
jest.mock('../config/prisma', () => ({
  __esModule: true,
  default: {
    studyPlan: { findUnique: jest.fn() },
    concept: { findFirst: jest.fn() },
    conceptSourceRef: { findMany: jest.fn() },
    reviewQueueItem: { findFirst: jest.fn() },
    interviewTurn: { findMany: jest.fn() },
    focusSession: { findMany: jest.fn() },
  },
}));

const mockedPrisma = prisma as unknown as {
  studyPlan: { findUnique: jest.Mock };
  concept: { findFirst: jest.Mock };
  conceptSourceRef: { findMany: jest.Mock };
  reviewQueueItem: { findFirst: jest.Mock };
  interviewTurn: { findMany: jest.Mock };
  focusSession: { findMany: jest.Mock };
};

const USER_ID = 'user-uuid';
const PLAN_ID = 'plan-uuid';
const CONCEPT_ID = 'concept-uuid';

beforeEach(() => {
  jest.clearAllMocks();
  mockedPrisma.studyPlan.findUnique.mockResolvedValue({
    userId: USER_ID,
    documents: [{ id: 'doc-1', filename: 'giao-trinh.pdf', kind: 'pdf' }],
  });
  mockedPrisma.concept.findFirst.mockResolvedValue({
    id: CONCEPT_ID,
    name: 'Ngăn xếp',
    difficulty: 2,
    masteryScore: 0.5,
    lastTestedAt: null,
  });
  mockedPrisma.reviewQueueItem.findFirst.mockResolvedValue(null);
  mockedPrisma.interviewTurn.findMany.mockResolvedValue([]);
  mockedPrisma.focusSession.findMany.mockResolvedValue([]);
});

describe('getConceptDetail — sectionTitle/context passthrough (#296)', () => {
  it('carries sectionTitle and context through for a row populated by the new extraction', async () => {
    mockedPrisma.conceptSourceRef.findMany.mockResolvedValue([
      {
        pageFrom: 41,
        pageTo: 43,
        sectionTitle: '4.2 — Ngăn xếp (Stack)',
        excerpt: 'A stack follows LIFO order.',
        context: 'A stack follows LIFO order. Push and pop both happen at the top.',
        document: { id: 'doc-1', filename: 'giao-trinh.pdf', kind: 'pdf' },
      },
    ]);

    const detail = await getConceptDetail(PLAN_ID, CONCEPT_ID, USER_ID);

    expect(detail.sources[0]).toMatchObject({
      sectionTitle: '4.2 — Ngăn xếp (Stack)',
      context: 'A stack follows LIFO order. Push and pop both happen at the top.',
    });
  });

  it('falls back to null, not an empty heading, for a row anchored before #296', async () => {
    mockedPrisma.conceptSourceRef.findMany.mockResolvedValue([
      {
        pageFrom: 41,
        pageTo: 43,
        sectionTitle: null,
        excerpt: 'A stack follows LIFO order.',
        context: null,
        document: { id: 'doc-1', filename: 'giao-trinh.pdf', kind: 'pdf' },
      },
    ]);

    const detail = await getConceptDetail(PLAN_ID, CONCEPT_ID, USER_ID);

    expect(detail.sources[0]).toMatchObject({ sectionTitle: null, context: null });
    // The pre-#296 fields must be untouched by the new columns riding along.
    expect(detail.sources[0]).toMatchObject({
      excerpt: 'A stack follows LIFO order.',
      pageFrom: 41,
      pageTo: 43,
    });
  });
});

describe('getConceptDetail — plan document fallback (#378)', () => {
  it('falls back to the plan’s FIRST document when the concept has no source anchors', async () => {
    mockedPrisma.conceptSourceRef.findMany.mockResolvedValue([]);

    const detail = await getConceptDetail(PLAN_ID, CONCEPT_ID, USER_ID);

    expect(detail.sources).toEqual([]);
    expect(detail.document).toEqual({
      documentId: 'doc-1',
      filename: 'giao-trinh.pdf',
      kind: 'pdf',
    });
    // Oldest first, and no `take`: the plan can hold a whole subject now, and the answer is the
    // concept's OWN topic (below) rather than whichever file happens to be newest.
    expect(mockedPrisma.studyPlan.findUnique).toHaveBeenCalledWith({
      where: { id: PLAN_ID },
      select: {
        userId: true,
        documents: {
          select: { id: true, filename: true, kind: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  });

  /**
   * 🔴 The case a multi-document plan makes real: a concept from chapter 8 must not be labelled
   * with chapter 2's file just because chapter 2 was uploaded first. Before #378 was widened this
   * showed the LAST-added document instead, which is wrong in the other direction.
   */
  it('names the document the concept is filed under, not the plan’s first', async () => {
    mockedPrisma.studyPlan.findUnique.mockResolvedValue({
      userId: USER_ID,
      documents: [
        { id: 'doc-1', filename: 'LN02.pdf', kind: 'pdf' },
        { id: 'doc-2', filename: 'LN08.pdf', kind: 'pdf' },
      ],
    });
    mockedPrisma.concept.findFirst.mockResolvedValue({
      id: CONCEPT_ID,
      name: 'Integration testing',
      difficulty: 3,
      masteryScore: null,
      lastTestedAt: null,
      primaryDocumentId: 'doc-2',
    });
    mockedPrisma.conceptSourceRef.findMany.mockResolvedValue([]);

    const detail = await getConceptDetail(PLAN_ID, CONCEPT_ID, USER_ID);

    expect(detail.document).toMatchObject({ documentId: 'doc-2', filename: 'LN08.pdf' });
  });

  it('returns null when the plan has no document', async () => {
    mockedPrisma.studyPlan.findUnique.mockResolvedValue({ userId: USER_ID, documents: [] });
    mockedPrisma.conceptSourceRef.findMany.mockResolvedValue([]);

    const detail = await getConceptDetail(PLAN_ID, CONCEPT_ID, USER_ID);

    expect(detail.document).toBeNull();
  });
});
