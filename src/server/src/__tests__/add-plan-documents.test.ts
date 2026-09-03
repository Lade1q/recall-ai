import fs from 'fs';
import { addPlanDocuments } from '../services/plan.service';
import { processAnalysisJob } from '../services/analysis.service';
import prisma from '../config/prisma';
import { AppError } from '../middleware/errorHandler';
import { extractConcepts, linkTopics, uploadFile } from '../services/gemini.service';
import { DocumentMeta } from '../types/plan.types';
import { mockExtractForFile } from '../utils/mock-ai';

/**
 * §4 — thêm tài liệu vào một kế hoạch đã có.
 *
 * Hai nửa, và nửa thứ hai mới là lý do tệp này tồn tại:
 *
 * 1. `addPlanDocuments` — guard, trần số tệp/dung lượng tính TRÊN CẢ KẾ HOẠCH, và `scope` ghi
 *    lên job đúng theo `mode` người dùng chọn.
 * 2. 🔴 `processAnalysisJob` ở chế độ `append`. Ba khác biệt của chế độ này với `full` đều là
 *    **lỗi im lặng nếu quên**: pha 1 chỉ đọc tệp mới ⇒ MỌI khái niệm cũ "vắng mặt" trong kết
 *    quả. Quên bỏ qua `toDeprecate` thì cả đồ thị cũ bị khai tử; quên bỏ `conceptEdge.deleteMany`
 *    thì mọi cạnh cũ biến mất. Cả hai đều không ném lỗi, không hiện trên màn hình, và chỉ lộ ra
 *    khi người học mở kế hoạch lên thấy trống trơn.
 *
 * Mock Prisma tôn trọng `where` ở đúng hai chỗ cần: `concept.findMany` phục vụ HAI người gọi
 * khác nhau trong cùng một lượt (`planConceptMerge` lọc theo `planId`, `loadStoredExtraction`
 * lọc theo `primaryDocumentId`), nên một fake trả cùng một mảng cho cả hai sẽ nói dối về cái
 * thứ hai mà vẫn xanh.
 */
jest.mock('../config/prisma', () => {
  const client = {
    studyPlan: { findUnique: jest.fn(), update: jest.fn() },
    analysisJob: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    document: { count: jest.fn(), create: jest.fn(), findMany: jest.fn(), findFirst: jest.fn() },
    questionCache: { deleteMany: jest.fn() },
    concept: {
      findMany: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    conceptEdge: { deleteMany: jest.fn(), create: jest.fn(), findMany: jest.fn() },
    conceptCheckpoint: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
      update: jest.fn(),
      createMany: jest.fn(),
    },
    documentEdge: { deleteMany: jest.fn(), createMany: jest.fn() },
    conceptSourceRef: { deleteMany: jest.fn(), createMany: jest.fn() },
    $queryRaw: jest.fn().mockResolvedValue([]),
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
  invalidatePlanMaterial: jest.fn(),
}));
jest.mock('../services/graph.service', () => ({
  validateDAG: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../services/question-cache.service', () => ({
  pregenerateForPlan: jest.fn().mockResolvedValue(undefined),
  clearQuestionCacheForPlan: jest.fn().mockResolvedValue(undefined),
}));

const mockedPrisma = prisma as jest.Mocked<typeof prisma>;
const mockedLinkTopics = linkTopics as jest.Mock;
const mockedExtract = extractConcepts as jest.Mock;
const mockedUploadFile = uploadFile as jest.Mock;

const OWNER_ID = 'user-owner-uuid';
const OTHER_ID = 'user-other-uuid';
const PLAN_ID = 'plan-uuid';
const DOC_OLD = 'doc-old-uuid';
const DOC_NEW = 'doc-new-uuid';
const JOB_ID = 'job-uuid';

const activePlan = {
  id: PLAN_ID,
  userId: OWNER_ID,
  name: 'Công nghệ phần mềm',
  deadline: new Date('2026-12-31'),
  status: 'active' as const,
};

function meta(filename: string, byteSize = 1_000_000): DocumentMeta {
  return {
    filename,
    fileKey: `plans/${PLAN_ID}/${filename}`,
    kind: 'pdf',
    pageCount: 30,
    byteSize,
  };
}

/** Kế hoạch active, job trước đã `done`, đang có 1 tài liệu 1 MB. */
function arrangeAddable(existingDocs = [{ byteSize: 1_000_000 }]) {
  (mockedPrisma.studyPlan.findUnique as jest.Mock).mockResolvedValue(activePlan);
  (mockedPrisma.analysisJob.findFirst as jest.Mock).mockResolvedValue({
    id: 'job-old',
    status: 'done',
    createdAt: new Date('2026-09-01'),
  });
  (mockedPrisma.document.findMany as jest.Mock).mockResolvedValue(existingDocs);
  (mockedPrisma.document.create as jest.Mock).mockResolvedValue({ id: DOC_NEW });
  (mockedPrisma.analysisJob.create as jest.Mock).mockResolvedValue({ id: JOB_ID });
  (mockedPrisma.studyPlan.update as jest.Mock).mockResolvedValue({});
}

describe('addPlanDocuments', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (mockedPrisma.$transaction as jest.Mock).mockImplementation(
      (fn: (tx: typeof mockedPrisma) => Promise<unknown>) => fn(mockedPrisma)
    );
  });

  it('throws 404 when the plan does not exist', async () => {
    (mockedPrisma.studyPlan.findUnique as jest.Mock).mockResolvedValue(null);

    const error = await addPlanDocuments(PLAN_ID, OWNER_ID, [meta('LN09.pdf')], 'full').catch(
      (e) => e
    );
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
    expect(mockedPrisma.document.create).not.toHaveBeenCalled();
  });

  it('throws 403 when the plan belongs to someone else', async () => {
    (mockedPrisma.studyPlan.findUnique as jest.Mock).mockResolvedValue(activePlan);

    const error = await addPlanDocuments(PLAN_ID, OTHER_ID, [meta('LN09.pdf')], 'full').catch(
      (e) => e
    );
    expect(error).toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
    expect(mockedPrisma.document.create).not.toHaveBeenCalled();
  });

  it('refuses an archived plan', async () => {
    arrangeAddable();
    (mockedPrisma.studyPlan.findUnique as jest.Mock).mockResolvedValue({
      ...activePlan,
      status: 'archived',
    });

    const error = await addPlanDocuments(PLAN_ID, OWNER_ID, [meta('LN09.pdf')], 'full').catch(
      (e) => e
    );
    expect(error).toMatchObject({ statusCode: 409, code: 'ADD_DOCUMENTS_NOT_ALLOWED' });
    expect(mockedPrisma.document.create).not.toHaveBeenCalled();
  });

  it.each(['pending', 'processing'])('refuses while a fresh job is %s', async (status) => {
    arrangeAddable();
    (mockedPrisma.analysisJob.findFirst as jest.Mock).mockResolvedValue({
      id: 'job-running',
      status,
      createdAt: new Date(),
    });

    const error = await addPlanDocuments(PLAN_ID, OWNER_ID, [meta('LN09.pdf')], 'full').catch(
      (e) => e
    );
    expect(error).toMatchObject({ statusCode: 409, code: 'ADD_DOCUMENTS_NOT_ALLOWED' });
    expect(mockedPrisma.document.create).not.toHaveBeenCalled();
  });

  it('releases a job stuck past the stale threshold and proceeds', async () => {
    arrangeAddable();
    (mockedPrisma.analysisJob.findFirst as jest.Mock).mockResolvedValue({
      id: 'job-stuck',
      status: 'processing',
      createdAt: new Date(Date.now() - 60 * 60 * 1000),
    });
    (mockedPrisma.analysisJob.update as jest.Mock).mockResolvedValue({});

    const result = await addPlanDocuments(PLAN_ID, OWNER_ID, [meta('LN09.pdf')], 'full');

    expect(mockedPrisma.analysisJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'job-stuck' },
        data: expect.objectContaining({ status: 'failed' }),
      })
    );
    expect(result.status).toBe('draft');
  });

  /**
   * Ca này ghim vế "stale rồi thì coi như FAILED" của chính guard ngay dưới nó. Trên một plan
   * `active` guard đó không chạy, nên nếu chỉ đo bằng plan active thì việc tính lại
   * `effectiveJobStatus` có thể bị xoá mà không test nào đỏ.
   */
  it('refuses a draft whose stale job was just released — that is retry territory', async () => {
    arrangeAddable();
    (mockedPrisma.studyPlan.findUnique as jest.Mock).mockResolvedValue({
      ...activePlan,
      status: 'draft',
    });
    (mockedPrisma.analysisJob.findFirst as jest.Mock).mockResolvedValue({
      id: 'job-stuck',
      status: 'processing',
      createdAt: new Date(Date.now() - 60 * 60 * 1000),
    });
    (mockedPrisma.analysisJob.update as jest.Mock).mockResolvedValue({});

    const error = await addPlanDocuments(PLAN_ID, OWNER_ID, [meta('LN09.pdf')], 'full').catch(
      (e) => e
    );
    expect(error).toMatchObject({ statusCode: 409, code: 'ADD_DOCUMENTS_NOT_ALLOWED' });
    expect(mockedPrisma.document.create).not.toHaveBeenCalled();
  });

  it('refuses a draft whose analysis failed — retry / change-document own that case', async () => {
    arrangeAddable();
    (mockedPrisma.studyPlan.findUnique as jest.Mock).mockResolvedValue({
      ...activePlan,
      status: 'draft',
    });
    (mockedPrisma.analysisJob.findFirst as jest.Mock).mockResolvedValue({
      id: 'job-failed',
      status: 'failed',
      createdAt: new Date('2026-09-01'),
    });

    const error = await addPlanDocuments(PLAN_ID, OWNER_ID, [meta('LN09.pdf')], 'full').catch(
      (e) => e
    );
    expect(error).toMatchObject({ statusCode: 409, code: 'ADD_DOCUMENTS_NOT_ALLOWED' });
    expect(mockedPrisma.document.create).not.toHaveBeenCalled();
  });

  it('accepts a draft whose analysis finished but is not confirmed yet', async () => {
    arrangeAddable();
    (mockedPrisma.studyPlan.findUnique as jest.Mock).mockResolvedValue({
      ...activePlan,
      status: 'draft',
    });

    const result = await addPlanDocuments(PLAN_ID, OWNER_ID, [meta('LN09.pdf')], 'full');

    expect(result).toMatchObject({ status: 'draft', analysisStatus: 'pending', mode: 'full' });
    expect(mockedPrisma.document.create).toHaveBeenCalledTimes(1);
  });

  /** Trần đếm TRÊN CẢ KẾ HOẠCH: 6 tệp sẵn có + 3 tệp mới = 9 > 8, dù bản thân lô chỉ có 3. */
  it('counts documents the plan ALREADY holds against the ceiling', async () => {
    arrangeAddable(Array.from({ length: 6 }, () => ({ byteSize: 1_000 })));

    const error = await addPlanDocuments(
      PLAN_ID,
      OWNER_ID,
      [meta('a.pdf', 1_000), meta('b.pdf', 1_000), meta('c.pdf', 1_000)],
      'full'
    ).catch((e) => e);

    expect(error).toMatchObject({ statusCode: 400, code: 'TOO_MANY_FILES' });
    expect(error.message).toContain('6');
    expect(mockedPrisma.document.create).not.toHaveBeenCalled();
  });

  /** Cùng lý lẽ cho dung lượng: 20 MB sẵn có + 8 MB mới vượt trần 25 MB, dù lô mới nhỏ. */
  it('counts bytes the plan ALREADY holds against the size ceiling', async () => {
    arrangeAddable([{ byteSize: 20 * 1024 * 1024 }]);

    const error = await addPlanDocuments(
      PLAN_ID,
      OWNER_ID,
      [meta('big.pdf', 8 * 1024 * 1024)],
      'full'
    ).catch((e) => e);

    expect(error).toMatchObject({ statusCode: 400, code: 'TOTAL_SIZE_EXCEEDED' });
    expect(mockedPrisma.document.create).not.toHaveBeenCalled();
  });

  it('writes scope new_only and names ONLY the rows it created, for append', async () => {
    arrangeAddable();
    (mockedPrisma.document.create as jest.Mock)
      .mockResolvedValueOnce({ id: 'doc-a' })
      .mockResolvedValueOnce({ id: 'doc-b' });

    const result = await addPlanDocuments(
      PLAN_ID,
      OWNER_ID,
      [meta('LN09.pdf'), meta('LN10.pdf')],
      'append'
    );

    expect(mockedPrisma.analysisJob.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        planDraftId: PLAN_ID,
        status: 'pending',
        scope: 'new_only',
        scopeDocumentIds: ['doc-a', 'doc-b'],
      }),
    });
    expect(result).toMatchObject({ mode: 'append', documentCount: 3 });
  });

  it('writes scope all for full, and still records which rows arrived', async () => {
    arrangeAddable();
    (mockedPrisma.document.create as jest.Mock).mockResolvedValue({ id: 'doc-a' });

    await addPlanDocuments(PLAN_ID, OWNER_ID, [meta('LN09.pdf')], 'full');

    expect(mockedPrisma.analysisJob.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ scope: 'all', scopeDocumentIds: ['doc-a'] }),
    });
  });

  it('drops the plan back to draft so the merged graph goes through the confirmation gate', async () => {
    arrangeAddable();

    await addPlanDocuments(PLAN_ID, OWNER_ID, [meta('LN09.pdf')], 'append');

    expect(mockedPrisma.studyPlan.update).toHaveBeenCalledWith({
      where: { id: PLAN_ID },
      data: { status: 'draft' },
    });
  });
});

/**
 * 🔴 Nửa thứ hai — chế độ `append` chạy qua `processAnalysisJob` thật.
 *
 * Không mock `planConceptMerge`: nó là hàm thuần và nó VẪN phải trả về `toDeprecate` đầy đủ.
 * Điều được đo ở đây là **nơi gọi bỏ qua verdict đó**, chứ không phải hàm merge bị làm cho im.
 */
describe('processAnalysisJob — append scope', () => {
  const originalUseMockAi = process.env.USE_MOCK_AI;

  const documents = [
    { id: DOC_OLD, filename: 'LN02 - Software Processes.pdf', fileKey: 'plans/p/ln02.pdf' },
    { id: DOC_NEW, filename: 'LN09 - Software Evolution.pdf', fileKey: 'plans/p/ln09.pdf' },
  ];

  /**
   * The first concept the NEW document's mock extraction returns — see `storedConcepts`.
   *
   * The index must be the document's position in the PLAN (1), not in the batch: that is the
   * argument `runPhaseOne` passes, and picking the bank any other way here would derive a name
   * from a bank the run never uses, quietly turning the shared-concept cases into no-op ones.
   */
  const SHARED_CONCEPT = mockExtractForFile('plans/p/ln09.pdf', 1).concepts[0]!;

  /**
   * A second shared concept, but one the plan holds with **no topic yet** — the case the
   * `primary_document_id != null` guard used to fall through. Same bank, same run, so it is a
   * real collision and not a name nobody mentions.
   */
  const UNFILED_CONCEPT = mockExtractForFile('plans/p/ln09.pdf', 1).concepts[1]!;

  /**
   * Khái niệm cũ của LN02, đã có mastery, KHÔNG được xuất hiện trong kết quả pha 1 lần này.
   *
   * ⚠️ Tên phải nằm NGOÀI cả ba bank của `mock-ai.ts`. Bản đầu của tệp này dùng "Waterfall
   * model" / "Incremental development" — đúng hai tên bank số 1 có sẵn — nên ở chế độ `all` hai
   * khái niệm cũ được pha 1 tìm thấy lại, `toDeprecate` rỗng, và ca ĐỐI CHỨNG xanh vì lý do sai.
   * Nó không đo được cái nó khai; chính nó là thứ suýt làm cả cặp test thành vô nghĩa.
   */
  const storedConcepts = [
    { id: 'c-old-1', name: 'Spiral model', status: 'active', primaryDocumentId: DOC_OLD },
    {
      id: 'c-old-2',
      name: 'Rational Unified Process',
      status: 'active',
      primaryDocumentId: DOC_OLD,
    },
    // 🔴 The shared case, and the one real material produced on 03/09: a concept the OLD file
    // taught that the NEW file teaches too. Its name is DERIVED from the mock bank the new
    // document's fileKey maps to, not written out — hard-coding it would let a bank edit turn
    // this whole case into "a concept nobody mentions", which is a different test that passes.
    { id: 'c-shared', name: SHARED_CONCEPT.name, status: 'active', primaryDocumentId: DOC_OLD },
    // 🔴 Stored SHOUTING and at a different difficulty on purpose. `planConceptMerge` matches on
    // `normalizeConceptKey` (trim + lowercase), so this row matches the new file's extraction —
    // which means any code path that writes the extracted `name`/`difficulty` back would be
    // visible here as a casing change and a number change, and invisible in production.
    {
      id: 'c-unfiled',
      name: UNFILED_CONCEPT.name.toUpperCase(),
      difficulty: 5,
      status: 'active',
      primaryDocumentId: null,
    },
  ];

  function arrangeJob(scope: 'all' | 'new_only') {
    (mockedPrisma.analysisJob.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    (mockedPrisma.analysisJob.findUniqueOrThrow as jest.Mock).mockResolvedValue({
      id: JOB_ID,
      planDraftId: PLAN_ID,
      fileKey: documents[0]?.fileKey,
      scope,
      scopeDocumentIds: scope === 'new_only' ? [DOC_NEW] : null,
    });
    (mockedPrisma.document.findMany as jest.Mock).mockResolvedValue(documents);
  }

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.USE_MOCK_AI = 'true';
    (mockedPrisma.$transaction as jest.Mock).mockImplementation(
      (fn: (tx: typeof mockedPrisma) => Promise<unknown>) => fn(mockedPrisma)
    );

    // `where`-honouring: planConceptMerge asks by planId, loadStoredExtraction asks by
    // primaryDocumentId. A fake that answered both with the same array would let the phase-2
    // material silently become "every concept of the plan, filed under every document".
    (mockedPrisma.concept.findMany as jest.Mock).mockImplementation(
      ({ where }: { where: { planId?: string; primaryDocumentId?: string } }) => {
        if (where.primaryDocumentId) {
          return Promise.resolve(
            storedConcepts
              .filter((c) => c.primaryDocumentId === where.primaryDocumentId)
              .map((c) => ({ name: c.name, difficulty: 2, conceptSources: [] }))
          );
        }
        return Promise.resolve(storedConcepts);
      }
    );
    (mockedPrisma.concept.update as jest.Mock).mockResolvedValue({});
    (mockedPrisma.concept.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
    (mockedPrisma.concept.create as jest.Mock).mockImplementation(
      ({ data }: { data: { name: string } }) =>
        Promise.resolve({ id: `concept-${data.name}`, ...data })
    );
    (mockedPrisma.conceptEdge.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });
    (mockedPrisma.conceptEdge.create as jest.Mock).mockResolvedValue({});
    (mockedPrisma.conceptEdge.findMany as jest.Mock).mockResolvedValue([]);
    (mockedPrisma.conceptCheckpoint.findMany as jest.Mock).mockResolvedValue([]);
    (mockedPrisma.conceptCheckpoint.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });
    (mockedPrisma.conceptCheckpoint.update as jest.Mock).mockResolvedValue({});
    (mockedPrisma.conceptCheckpoint.createMany as jest.Mock).mockResolvedValue({ count: 0 });
    (mockedPrisma.documentEdge.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });
    (mockedPrisma.documentEdge.createMany as jest.Mock).mockResolvedValue({ count: 0 });
    (mockedPrisma.conceptSourceRef.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });
    (mockedPrisma.conceptSourceRef.createMany as jest.Mock).mockResolvedValue({ count: 0 });
    (mockedPrisma.studyPlan.update as jest.Mock).mockResolvedValue({});
    (mockedPrisma.analysisJob.update as jest.Mock).mockResolvedValue({});
    mockedLinkTopics.mockResolvedValue([]);
    mockedUploadFile.mockResolvedValue({ uri: 'files/x', mimeType: 'application/pdf' });
  });

  afterAll(() => {
    process.env.USE_MOCK_AI = originalUseMockAi;
  });

  /** 🔴 Lỗi im lặng #1. */
  it('does NOT deprecate the old concepts the new file never mentions', async () => {
    arrangeJob('new_only');

    await processAnalysisJob(JOB_ID);

    expect(mockedPrisma.concept.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'deprecated' }) })
    );
  });

  /**
   * Cột mốc đối chứng: cùng vật liệu, cùng khái niệm cũ, chỉ khác `scope`. Không có ca này thì
   * ca trên có thể xanh vì `toDeprecate` vốn rỗng — tức phép đo không có khả năng SAI.
   */
  it('DOES deprecate them under scope all, on the same material', async () => {
    arrangeJob('all');

    await processAnalysisJob(JOB_ID);

    // BOTH ids, named explicitly. `toHaveBeenCalledWith(objectContaining({status:'deprecated'}))`
    // alone would still pass if a future mock-bank edit reintroduced one of these names — the
    // surviving one would carry the call and hide the collision. Naming the set is what makes
    // this measurement able to fail for the reason it claims to.
    // `c-shared` is absent on purpose: the new file teaches it, so `full` keeps it. The two
    // that no file mentions any more are the ones that must go.
    expect(mockedPrisma.concept.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['c-old-1', 'c-old-2'] } },
      data: { status: 'deprecated' },
    });
  });

  /** 🔴 Lỗi im lặng #2 — cạnh khái niệm cũ bị xoá sạch. */
  it('does NOT wipe the existing concept edges in append mode', async () => {
    arrangeJob('new_only');

    await processAnalysisJob(JOB_ID);

    expect(mockedPrisma.conceptEdge.deleteMany).not.toHaveBeenCalled();
  });

  it('DOES rebuild the concept edges under scope all', async () => {
    arrangeJob('all');

    await processAnalysisJob(JOB_ID);

    expect(mockedPrisma.conceptEdge.deleteMany).toHaveBeenCalledWith({
      where: { planId: PLAN_ID },
    });
  });

  /**
   * Không có `deleteMany` để dọn, một cặp đã lưu sẽ đâm vào `@@unique` và làm hỏng CẢ transaction.
   * Đo bằng một cạnh đã tồn tại đúng bằng cạnh pha 1 vừa trả về.
   */
  it('skips a concept edge that is already stored, instead of failing the transaction', async () => {
    arrangeJob('new_only');
    const created: Array<{ fromConceptId: string; toConceptId: string }> = [];
    (mockedPrisma.conceptEdge.create as jest.Mock).mockImplementation(
      ({ data }: { data: { fromConceptId: string; toConceptId: string } }) => {
        created.push(data);
        return Promise.resolve({});
      }
    );
    // Everything phase 1 could propose, already in the table. Both ends matter: an edge can run
    // between two concepts this job created AND between a created one and a KEPT one (the shared
    // concept), so a stored set built only from `concept.create` would leave the second kind
    // looking new and this case would pass for the wrong reason.
    (mockedPrisma.conceptEdge.findMany as jest.Mock).mockImplementation(async () => {
      const ids = [
        ...(mockedPrisma.concept.create as jest.Mock).mock.calls.map(
          (call) => `concept-${call[0].data.name}`
        ),
        ...storedConcepts.map((c) => c.id),
      ];
      return ids.flatMap((from) => ids.map((to) => ({ fromConceptId: from, toConceptId: to })));
    });

    await processAnalysisJob(JOB_ID);

    expect(created).toHaveLength(0);
  });

  /**
   * 🔴 Đo được trên vật liệu THẬT 03/09: thêm "LN09 - Test Automation" vào kế hoạch đã có LN08
   * làm khái niệm "Test Automation" bị chuyển chủ đề từ LN08 sang LN09. Pha 1 không thấy LN08 nên
   * không biết LN08 đã sở hữu khái niệm đó — luật "tệp SỚM NHẤT giữ khái niệm dùng chung" gãy, và
   * gãy im lặng: chủ đề cũ mất một node mà không gì trên màn hình nói vậy.
   */
  it('does NOT re-file a shared concept onto the newly added document', async () => {
    arrangeJob('new_only');

    await processAnalysisJob(JOB_ID);

    const sharedUpdate = (mockedPrisma.concept.update as jest.Mock).mock.calls.find(
      (call) => call[0].where.id === 'c-shared'
    );
    expect(sharedUpdate).toBeDefined();
    expect(sharedUpdate[0].data).not.toHaveProperty('primaryDocumentId');
  });

  /**
   * Cùng lập luận, mặt khác: chế độ này hứa "chỉ thêm, không sửa gì của đồ thị cũ" ngay trên hộp
   * thoại. Ghi đè tên/độ khó của một khái niệm cũ bằng phán đoán từ MỘT tệp là làm câu đó thành
   * lời nói dối.
   */
  it('leaves a shared concept’s name and difficulty exactly as the old graph has them', async () => {
    arrangeJob('new_only');

    await processAnalysisJob(JOB_ID);

    const sharedUpdate = (mockedPrisma.concept.update as jest.Mock).mock.calls.find(
      (call) => call[0].where.id === 'c-shared'
    );
    expect(sharedUpdate[0].data).toEqual({ status: 'active' });
  });

  /**
   * 🔴 Khác biệt append thứ tư, nửa còn lại: khái niệm cũ **chưa có chủ đề**.
   *
   * `primary_document_id = NULL` không có nghĩa "khái niệm này không thật sự của sinh viên". Nó
   * là trạng thái đạt tới được: kế hoạch một tài liệu sửa đồ thị bằng trình soạn thảo PHẲNG, mà
   * trình đó không gửi chủ đề nào, nên `replacePlanGraph` lưu `null`. Đọc "chưa xếp chủ đề"
   * thành "được phép ghi đè" là làm hộp thoại nói dối đúng ở ca nó hứa nhiều nhất.
   *
   * Xếp chủ đề cho nó thì ĐƯỢC — cho một khái niệm vô gia cư một mái nhà chỉ là thêm thông tin.
   * Ghi đè tên và độ khó thì KHÔNG.
   */
  it('files an unfiled concept but does not rewrite its name or difficulty', async () => {
    arrangeJob('new_only');

    await processAnalysisJob(JOB_ID);

    const update = (mockedPrisma.concept.update as jest.Mock).mock.calls.find(
      (call) => call[0].where.id === 'c-unfiled'
    );
    expect(update).toBeDefined();
    expect(update[0].data).toHaveProperty('primaryDocumentId', DOC_NEW);
    expect(update[0].data).not.toHaveProperty('name');
    expect(update[0].data).not.toHaveProperty('difficulty');
  });

  /**
   * Đối chứng cho ca ngay trên, và nó phải nằm ở đây: nếu bank đổi và `UNFILED_CONCEPT` không
   * còn va với khái niệm cũ nào thì `concept.update` cho `c-unfiled` **không được gọi**, cả hai
   * `not.toHaveProperty` ở trên thành vô nghĩa — nhưng ca này sẽ đỏ và nói ra điều đó.
   */
  it('DOES rewrite that same concept under scope all', async () => {
    arrangeJob('all');

    await processAnalysisJob(JOB_ID);

    const update = (mockedPrisma.concept.update as jest.Mock).mock.calls.find(
      (call) => call[0].where.id === 'c-unfiled'
    );
    expect(update).toBeDefined();
    expect(update[0].data).toMatchObject({
      name: UNFILED_CONCEPT.name,
      difficulty: UNFILED_CONCEPT.difficulty,
    });
  });

  /** Đối chứng: ở `full` thì pha 1 ĐÃ đọc mọi tệp, nên nó có quyền xếp lại chủ đề. */
  it('DOES refresh a shared concept under scope all', async () => {
    arrangeJob('all');

    await processAnalysisJob(JOB_ID);

    const sharedUpdate = (mockedPrisma.concept.update as jest.Mock).mock.calls.find(
      (call) => call[0].where.id === 'c-shared'
    );
    expect(sharedUpdate[0].data).toMatchObject({
      name: SHARED_CONCEPT.name,
      difficulty: SHARED_CONCEPT.difficulty,
    });
    expect(sharedUpdate[0].data).toHaveProperty('primaryDocumentId');
  });

  /**
   * 🔴 Thước chấm điểm (INV-1). `planCheckpointMerge` XOÁ checkpoint cũ của một khái niệm rồi ghi
   * lại theo kết quả mới — với khái niệm dùng chung, cái "mới" đó suy từ một tệp đọc riêng lẻ.
   * Mọi câu trả lời của sinh viên về khái niệm đó đã được chấm bằng thước cũ.
   */
  it('does NOT rebuild the checkpoints of a concept it did not create', async () => {
    arrangeJob('new_only');
    (mockedPrisma.conceptCheckpoint.findMany as jest.Mock).mockResolvedValue([
      { id: 'cp-old', conceptId: 'c-shared', text: 'Nêu các pha của một quy trình', orderIndex: 0 },
    ]);

    await processAnalysisJob(JOB_ID);

    const touchedShared = [
      ...(mockedPrisma.conceptCheckpoint.deleteMany as jest.Mock).mock.calls,
      ...(mockedPrisma.conceptCheckpoint.createMany as jest.Mock).mock.calls,
    ].some((call) => JSON.stringify(call[0]).includes('c-shared'));
    expect(touchedShared).toBe(false);
  });

  /** 🔴 Chỗ `append` KHÔNG append: thứ tự chủ đề luôn được thay TRỌN, không cộng thêm. */
  it('still replaces document_edges wholesale in append mode', async () => {
    arrangeJob('new_only');

    await processAnalysisJob(JOB_ID);

    expect(mockedPrisma.documentEdge.deleteMany).toHaveBeenCalledWith({
      where: { planId: PLAN_ID },
    });
  });

  /**
   * 🔴 Pha 2 phải thấy CẢ HAI tài liệu, dù pha 1 chỉ đọc một. Đây là thứ giữ chủ đề mới khỏi
   * thành một đảo — và nó chỉ có thể đo được ở vật liệu gửi cho `linkTopics`.
   */
  it('feeds phase 2 every document, with the old one rebuilt from the database', async () => {
    // The one case here that must run the REAL linking path: `USE_MOCK_AI` short-circuits phase 2
    // to a chain over the filenames, which would make this assertion pass without the material
    // ever being built.
    arrangeJob('new_only');
    process.env.USE_MOCK_AI = 'false';
    mockedExtract.mockResolvedValue(mockExtractForFile('plans/p/ln09.pdf', 1));
    const readFile = jest.spyOn(fs.promises, 'readFile').mockResolvedValue('nội dung tài liệu');
    try {
      await processAnalysisJob(JOB_ID);
    } finally {
      readFile.mockRestore();
      mockedExtract.mockReset();
      process.env.USE_MOCK_AI = 'true';
    }

    expect(mockedLinkTopics).toHaveBeenCalledTimes(1);
    const material = mockedLinkTopics.mock.calls[0][0] as string;
    expect(material).toContain('LN02 - Software Processes.pdf');
    expect(material).toContain('LN09 - Software Evolution.pdf');
    // The old file contributes its STORED concepts, not a re-read.
    expect(material).toContain('Spiral model');
  });

  /** Pha 1 chỉ được gọi cho tệp mới — đó là toàn bộ lý do chế độ này rẻ hơn. */
  it('reads only the newly added document in phase 1', async () => {
    arrangeJob('new_only');

    await processAnalysisJob(JOB_ID);

    // Every anchored source row must belong to the new document; the old one was not re-read.
    const anchoredDocIds = (mockedPrisma.conceptSourceRef.createMany as jest.Mock).mock.calls
      .flatMap((call) => call[0].data as Array<{ documentId: string }>)
      .map((row) => row.documentId);
    expect(anchoredDocIds.length).toBeGreaterThan(0);
    expect(new Set(anchoredDocIds)).toEqual(new Set([DOC_NEW]));
  });

  /** Một tệp lạ trong `scopeDocumentIds` là job hỏng, không phải "đọc cả bộ". */
  it('fails the job when the scope names no document of this plan', async () => {
    (mockedPrisma.analysisJob.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    (mockedPrisma.analysisJob.findUniqueOrThrow as jest.Mock).mockResolvedValue({
      id: JOB_ID,
      planDraftId: PLAN_ID,
      fileKey: documents[0]?.fileKey,
      scope: 'new_only',
      scopeDocumentIds: ['doc-that-was-deleted'],
    });
    (mockedPrisma.document.findMany as jest.Mock).mockResolvedValue(documents);

    await processAnalysisJob(JOB_ID);

    expect(mockedPrisma.analysisJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'failed' }) })
    );
    expect(mockedPrisma.concept.create).not.toHaveBeenCalled();
  });
});
