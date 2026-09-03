import fs from 'fs';
import { processAnalysisJob } from '../services/analysis.service';
import prisma from '../config/prisma';
import { extractConcepts, linkTopics } from '../services/gemini.service';

jest.mock('../config/prisma', () => {
  const client = {
    analysisJob: { updateMany: jest.fn(), findUniqueOrThrow: jest.fn(), update: jest.fn() },
    concept: { findMany: jest.fn(), update: jest.fn(), create: jest.fn(), updateMany: jest.fn() },
    conceptEdge: { deleteMany: jest.fn(), create: jest.fn() },
    conceptCheckpoint: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
      update: jest.fn(),
      createMany: jest.fn(),
    },
    document: { findFirst: jest.fn(), findMany: jest.fn() },
    documentEdge: { deleteMany: jest.fn(), createMany: jest.fn() },
    conceptSourceRef: { deleteMany: jest.fn(), createMany: jest.fn() },
    studyPlan: { update: jest.fn() },
    $transaction: jest.fn(),
  };
  client.$transaction.mockImplementation((fn: (tx: typeof client) => Promise<unknown>) =>
    fn(client)
  );
  return { __esModule: true, default: client };
});

jest.mock('../services/gemini.service', () => ({
  extractConcepts: jest.fn(),
  linkTopics: jest.fn(),
  uploadFile: jest.fn(),
}));
jest.mock('../services/graph.service', () => ({
  validateDAG: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../services/question-cache.service', () => ({
  pregenerateForPlan: jest.fn().mockResolvedValue(undefined),
}));

const mockedPrisma = prisma as jest.Mocked<typeof prisma>;
const mockedExtract = extractConcepts as jest.Mock;
const mockedLinkTopics = linkTopics as jest.Mock;

const JOB_ID = 'job-uuid';
const PLAN_ID = 'plan-uuid';

const DOCS = [
  { id: 'doc-a', filename: 'LN02.pdf', fileKey: 'plans/p/a.txt' },
  { id: 'doc-b', filename: 'LN04.pdf', fileKey: 'plans/p/b.txt' },
  { id: 'doc-c', filename: 'LN08.pdf', fileKey: 'plans/p/c.txt' },
];

/** One phase-1 answer per document, keyed by the file it was asked about. */
function extractionFor(fileKey: string) {
  const byKey: Record<string, string[]> = {
    'plans/p/a.txt': ['Process', 'Waterfall'],
    'plans/p/b.txt': ['Requirement'],
    'plans/p/c.txt': ['Testing'],
  };
  const names = byKey[fileKey] ?? ['Unknown'];
  return {
    concepts: names.map((name) => ({
      name,
      difficulty: 1,
      checkpoints: [],
      source_excerpt: `${name} is defined here.`,
    })),
    edges: names.length > 1 ? [{ from: names[0], to: names[1] }] : [],
    language_detected: 'en',
    topic_edges: [] as { from: string; to: string }[],
  };
}

/** Every `documentEdge.createMany` row committed during the run, flattened. */
function committedTopicEdges(): { fromDocumentId: string; toDocumentId: string }[] {
  return (mockedPrisma.documentEdge.createMany as jest.Mock).mock.calls.flatMap(
    (call) => call[0]?.data ?? []
  );
}

/** Every concept name `concept.create` was asked to insert. */
function createdConceptNames(): string[] {
  return (mockedPrisma.concept.create as jest.Mock).mock.calls.map((call) => call[0].data.name);
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.USE_MOCK_AI = 'false';

  (mockedPrisma.$transaction as jest.Mock).mockImplementation(
    (fn: (tx: typeof mockedPrisma) => Promise<unknown>) => fn(mockedPrisma)
  );
  (mockedPrisma.analysisJob.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
  (mockedPrisma.analysisJob.findUniqueOrThrow as jest.Mock).mockResolvedValue({
    id: JOB_ID,
    fileKey: DOCS[0]?.fileKey,
    planDraftId: PLAN_ID,
  });
  (mockedPrisma.analysisJob.update as jest.Mock).mockResolvedValue({});
  (mockedPrisma.concept.findMany as jest.Mock).mockResolvedValue([]);
  (mockedPrisma.concept.update as jest.Mock).mockResolvedValue({});
  (mockedPrisma.concept.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
  (mockedPrisma.concept.create as jest.Mock).mockImplementation(
    ({ data }: { data: { name: string } }) => Promise.resolve({ id: `c-${data.name}`, ...data })
  );
  (mockedPrisma.conceptEdge.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });
  (mockedPrisma.conceptEdge.create as jest.Mock).mockResolvedValue({});
  (mockedPrisma.conceptCheckpoint.findMany as jest.Mock).mockResolvedValue([]);
  (mockedPrisma.conceptCheckpoint.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });
  (mockedPrisma.conceptCheckpoint.update as jest.Mock).mockResolvedValue({});
  (mockedPrisma.conceptCheckpoint.createMany as jest.Mock).mockResolvedValue({ count: 0 });
  (mockedPrisma.document.findMany as jest.Mock).mockResolvedValue(DOCS);
  (mockedPrisma.documentEdge.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });
  (mockedPrisma.documentEdge.createMany as jest.Mock).mockResolvedValue({ count: 0 });
  (mockedPrisma.conceptSourceRef.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });
  (mockedPrisma.conceptSourceRef.createMany as jest.Mock).mockResolvedValue({ count: 0 });
  (mockedPrisma.studyPlan.update as jest.Mock).mockResolvedValue({});

  mockedExtract.mockImplementation(() => Promise.resolve(extractionFor('plans/p/a.txt')));
  mockedLinkTopics.mockResolvedValue([]);
});

/**
 * The topic layer's contract, which lives entirely in code rather than in the schema: phase 2
 * shares `aiExtractResponseSchema` with phase 1, so nothing in the type system stops it from
 * returning concepts and concept edges. What stops those reaching the database is a destructure
 * at the call site — one line, easy to "tidy up", and invisible in a diff. These cases are the
 * only thing standing between that line and a prompt-drift regression.
 */
describe('phase 2 (topic linking)', () => {
  /** `.txt` documents are read from disk by the real path; point extract at the right answer. */
  beforeEach(() => {
    mockedExtract.mockReset();
    let call = 0;
    mockedExtract.mockImplementation(() => {
      const doc = DOCS[call++ % DOCS.length];
      return Promise.resolve(extractionFor(doc?.fileKey ?? ''));
    });
    jest.spyOn(fs.promises, 'readFile').mockResolvedValue('material');
  });

  afterEach(() => jest.restoreAllMocks());

  it('persists the study order it returns, keyed by document id, not by filename', async () => {
    mockedLinkTopics.mockResolvedValue([
      { from: 'LN02.pdf', to: 'LN04.pdf' },
      { from: 'LN04.pdf', to: 'LN08.pdf' },
    ]);

    await processAnalysisJob(JOB_ID);

    expect(mockedPrisma.documentEdge.deleteMany).toHaveBeenCalledWith({
      where: { planId: PLAN_ID },
    });
    expect(committedTopicEdges()).toEqual([
      { planId: PLAN_ID, fromDocumentId: 'doc-a', toDocumentId: 'doc-b' },
      { planId: PLAN_ID, fromDocumentId: 'doc-b', toDocumentId: 'doc-c' },
    ]);
  });

  it('throws away the concepts and concept edges phase 2 returns — they never reach the DB', async () => {
    mockedLinkTopics.mockResolvedValue([{ from: 'LN02.pdf', to: 'LN08.pdf' }]);

    await processAnalysisJob(JOB_ID);

    // The four names below are the only ones phase 1 produced. `linkTopics` returns just the
    // topic edges by contract, so a phase-2 answer cannot add a fifth concept or a fifth edge —
    // and if someone widens that return type, these two assertions are what turn red.
    expect(createdConceptNames().sort()).toEqual([
      'Process',
      'Requirement',
      'Testing',
      'Waterfall',
    ]);
    const conceptEdgeCalls = (mockedPrisma.conceptEdge.create as jest.Mock).mock.calls.length;
    expect(conceptEdgeCalls).toBe(1); // Process -> Waterfall, from phase 1's own file
  });

  it('drops an edge naming a file this plan does not hold, and flags the graph as auto-fixed', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockedLinkTopics.mockResolvedValue([
      { from: 'LN02.pdf', to: 'LN04.pdf' },
      { from: 'LN99-does-not-exist.pdf', to: 'LN08.pdf' },
    ]);

    await processAnalysisJob(JOB_ID);

    expect(committedTopicEdges()).toEqual([
      { planId: PLAN_ID, fromDocumentId: 'doc-a', toDocumentId: 'doc-b' },
    ]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('LN99-does-not-exist.pdf'));
    expect(mockedPrisma.studyPlan.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ dagAutoFixed: true }) })
    );
  });

  it('breaks a cycle in the study order rather than persisting one', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockedLinkTopics.mockResolvedValue([
      { from: 'LN02.pdf', to: 'LN04.pdf' },
      { from: 'LN04.pdf', to: 'LN08.pdf' },
      { from: 'LN08.pdf', to: 'LN02.pdf' },
    ]);

    await processAnalysisJob(JOB_ID);

    const committed = committedTopicEdges();
    expect(committed).toHaveLength(2);
    expect(mockedPrisma.studyPlan.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ dagAutoFixed: true }) })
    );
  });

  it('keeps the whole concept graph when the linking call fails — only the arrows are lost', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockedLinkTopics.mockRejectedValue(new Error('AI_UNAVAILABLE'));

    await processAnalysisJob(JOB_ID);

    // Not marked failed, concepts committed, topic layer simply empty.
    expect(mockedPrisma.analysisJob.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'failed' }) })
    );
    expect(createdConceptNames()).toHaveLength(4);
    expect(committedTopicEdges()).toEqual([]);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('topic linking failed'),
      expect.anything()
    );
  });

  it('does not call the linking pass at all for a single-document plan', async () => {
    (mockedPrisma.document.findMany as jest.Mock).mockResolvedValue([DOCS[0]]);

    await processAnalysisJob(JOB_ID);

    expect(mockedLinkTopics).not.toHaveBeenCalled();
    expect(committedTopicEdges()).toEqual([]);
  });

  it('files each concept under the document whose call produced it', async () => {
    await processAnalysisJob(JOB_ID);

    const byName = new Map(
      (mockedPrisma.concept.create as jest.Mock).mock.calls.map((call) => [
        call[0].data.name,
        call[0].data.primaryDocumentId,
      ])
    );
    expect(byName.get('Process')).toBe('doc-a');
    expect(byName.get('Waterfall')).toBe('doc-a');
    expect(byName.get('Requirement')).toBe('doc-b');
    expect(byName.get('Testing')).toBe('doc-c');
  });

  it('drops topic edges invented by PHASE 1 — only the linking pass may fill that table', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockedExtract.mockReset();
    let call = 0;
    mockedExtract.mockImplementation(() => {
      const doc = DOCS[call++ % DOCS.length];
      return Promise.resolve({
        ...extractionFor(doc?.fileKey ?? ''),
        // A single call saw ONE file, so it cannot know an order between two — but the shared
        // schema still asks it for `topic_edges`, so it answers anyway.
        topic_edges: [{ from: 'LN02.pdf', to: 'LN08.pdf' }],
      });
    });
    mockedLinkTopics.mockResolvedValue([]);

    await processAnalysisJob(JOB_ID);

    expect(committedTopicEdges()).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('invented by phase 1'));
  });

  /**
   * 🔴 `USE_MOCK_AI=true` has to switch off the LINKING pass as well, not just extraction.
   *
   * It did not until 03/09: `runPhaseTwo` called the real `linkTopics` regardless of the flag.
   * With no API key the call threw, the catch turned it into "no study order", and the offline
   * demo showed N topics and no arrows — a live call failing silently, wearing the costume of a
   * mock that had not been written yet.
   */
  it('never reaches the linking service when USE_MOCK_AI is on', async () => {
    process.env.USE_MOCK_AI = 'true';
    try {
      await processAnalysisJob(JOB_ID);
    } finally {
      process.env.USE_MOCK_AI = 'false';
    }

    expect(mockedLinkTopics).not.toHaveBeenCalled();
    // …and it still produces a real order: the upload chain, the only one derivable offline.
    expect(committedTopicEdges()).toEqual([
      { planId: PLAN_ID, fromDocumentId: 'doc-a', toDocumentId: 'doc-b' },
      { planId: PLAN_ID, fromDocumentId: 'doc-b', toDocumentId: 'doc-c' },
    ]);
  });
});
