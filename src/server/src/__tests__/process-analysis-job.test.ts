import { processAnalysisJob } from '../services/analysis.service';
import prisma from '../config/prisma';
import { extractConcepts } from '../services/gemini.service';
import { pregenerateForPlan } from '../services/question-cache.service';

// Mock Prisma client — $transaction chạy callback với cùng mock client, mô phỏng
// đúng interactive transaction API của Prisma (giống pattern trong retry-plan.test.ts).
// Đầy đủ các model method mà processAnalysisJob hiện dùng, bao gồm concept-merge
// (SP-05 reanalyze, #170): concept.findMany/update/create/updateMany,
// conceptEdge.deleteMany/create, conceptSourceRef.deleteMany/createMany.
jest.mock('../config/prisma', () => {
  const client = {
    analysisJob: {
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
    },
    concept: {
      findMany: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    conceptEdge: { deleteMany: jest.fn(), create: jest.fn() },
    document: { findFirst: jest.fn() },
    conceptSourceRef: { deleteMany: jest.fn(), createMany: jest.fn() },
    studyPlan: { update: jest.fn() },
    $transaction: jest.fn(),
  };
  client.$transaction.mockImplementation((fn: (tx: typeof client) => Promise<unknown>) =>
    fn(client)
  );
  return { __esModule: true, default: client };
});

// analysis.service cũng import 2 module này — mock để load được module mà không
// đụng Gemini/fs thật. USE_MOCK_AI=true (set bên dưới) đã bypass cả hai rồi.
jest.mock('../services/gemini.service', () => ({
  extractConcepts: jest.fn(),
  uploadFile: jest.fn(),
}));
jest.mock('../services/graph.service', () => ({
  validateDAG: jest.fn().mockResolvedValue(undefined),
}));
// AE-06: pregenerateForPlan is fired-and-forgotten from processAnalysisJob (see the dedicated
// hook test below) — mocked here so this file stays focused on the analysis pipeline itself.
jest.mock('../services/question-cache.service', () => ({
  pregenerateForPlan: jest.fn().mockResolvedValue(undefined),
}));

const mockedPrisma = prisma as jest.Mocked<typeof prisma>;
const mockedExtractConcepts = extractConcepts as jest.Mock;
const mockedPregenerateForPlan = pregenerateForPlan as jest.Mock;

const JOB_ID = 'job-uuid';
const PLAN_ID = 'plan-uuid';
const pendingJob = { id: JOB_ID, fileKey: 'notes.txt', planDraftId: PLAN_ID };

/** `data.status === 'failed'` chỉ có thể đến từ markFailed (dùng `analysisJob.updateMany`) —
 * phân biệt với claim (`status: 'processing'`) và finalize guard (`status: 'done'`), vốn cùng
 * gọi updateMany nhưng khác trạng thái. */
function expectMarkFailedNotCalled() {
  expect(mockedPrisma.analysisJob.updateMany).not.toHaveBeenCalledWith(
    expect.objectContaining({ data: expect.objectContaining({ status: 'failed' }) })
  );
}

describe('processAnalysisJob', () => {
  const originalUseMockAi = process.env.USE_MOCK_AI;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.USE_MOCK_AI = 'true'; // callAi trả thẳng MOCK_EXTRACT_RESULT, không gọi Gemini thật
    (mockedPrisma.$transaction as jest.Mock).mockImplementation(
      (fn: (tx: typeof mockedPrisma) => Promise<unknown>) => fn(mockedPrisma)
    );
    // Happy-path mặc định cho toàn bộ pipeline merge — plan chưa có concept nào
    // (lần phân tích đầu), nên planConceptMerge (hàm thật, không mock) tự nhiên đi
    // theo nhánh toCreate toàn bộ, giống hành vi insert-thẳng trước đây.
    (mockedPrisma.concept.findMany as jest.Mock).mockResolvedValue([]);
    (mockedPrisma.concept.update as jest.Mock).mockResolvedValue({});
    (mockedPrisma.concept.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
    (mockedPrisma.concept.create as jest.Mock).mockImplementation(
      ({ data }: { data: { name: string } }) =>
        Promise.resolve({ id: `concept-${data.name}`, ...data })
    );
    (mockedPrisma.conceptEdge.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });
    (mockedPrisma.conceptEdge.create as jest.Mock).mockResolvedValue({});
    (mockedPrisma.document.findFirst as jest.Mock).mockResolvedValue(null);
    (mockedPrisma.conceptSourceRef.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });
    (mockedPrisma.conceptSourceRef.createMany as jest.Mock).mockResolvedValue({ count: 0 });
    (mockedPrisma.studyPlan.update as jest.Mock).mockResolvedValue({});
    (mockedPrisma.analysisJob.update as jest.Mock).mockResolvedValue({}); // setPhase / markFailed
  });

  afterAll(() => {
    process.env.USE_MOCK_AI = originalUseMockAi;
  });

  // --- AC 2 / AC 4: nhánh claim thất bại ---
  it('bails without touching the AI or a transaction when the atomic claim fails', async () => {
    (mockedPrisma.analysisJob.updateMany as jest.Mock).mockResolvedValue({ count: 0 });

    await processAnalysisJob(JOB_ID);

    expect(mockedPrisma.analysisJob.updateMany).toHaveBeenCalledWith({
      where: { id: JOB_ID, status: 'pending' },
      data: { status: 'processing' },
    });
    expect(mockedPrisma.analysisJob.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(mockedExtractConcepts).not.toHaveBeenCalled();
    expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockedPrisma.analysisJob.update).not.toHaveBeenCalled(); // setPhase/markFailed đều không chạy
  });

  // --- AC 2: gọi 2 lần trên cùng jobId chỉ xử lý 1 lần ---
  it('only runs the pipeline once when called twice concurrently on the same jobId', async () => {
    (mockedPrisma.analysisJob.updateMany as jest.Mock)
      .mockResolvedValueOnce({ count: 1 }) // lần gọi đầu claim thành công
      .mockResolvedValueOnce({ count: 0 }) // lần gọi thứ hai thấy job đã bị claim mất
      .mockResolvedValue({ count: 1 }); // bước finalize bên trong transaction của lần thắng
    (mockedPrisma.analysisJob.findUniqueOrThrow as jest.Mock).mockResolvedValue(pendingJob);

    await Promise.all([processAnalysisJob(JOB_ID), processAnalysisJob(JOB_ID)]);

    expect(mockedPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockedExtractConcepts).not.toHaveBeenCalled(); // USE_MOCK_AI đã bypass, nhưng dù sao cũng không được gọi 2 lần
    // Bên thắng phải thực sự hoàn tất pipeline, không chỉ "được gọi" — tránh false-green.
    expect(mockedPrisma.studyPlan.update).toHaveBeenCalledTimes(1);
    expectMarkFailedNotCalled();
  });

  // --- Regression: claim thành công vẫn xử lý bình thường (kể cả concept-merge #170) ---
  it('claims a pending job and processes it end-to-end', async () => {
    (mockedPrisma.analysisJob.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    (mockedPrisma.analysisJob.findUniqueOrThrow as jest.Mock).mockResolvedValue(pendingJob);

    await processAnalysisJob(JOB_ID);

    expect(mockedPrisma.concept.findMany).toHaveBeenCalledWith({
      where: { planId: PLAN_ID },
      select: { id: true, name: true, status: true },
    });
    expect(mockedPrisma.concept.create).toHaveBeenCalled();
    expect(mockedPrisma.conceptEdge.create).toHaveBeenCalled();
    expect(mockedPrisma.studyPlan.update).toHaveBeenCalledWith({
      where: { id: PLAN_ID },
      data: expect.objectContaining({ status: 'active' }),
    });
    // Lần gọi updateMany thứ 2 là guard finalize (lần đầu là claim ban đầu).
    expect(mockedPrisma.analysisJob.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: JOB_ID, status: 'processing' },
      data: { status: 'done', completedAt: expect.any(Date) },
    });
    expectMarkFailedNotCalled();
    // AE-06 hook: fired fire-and-forget once the job's transaction (incl. validateDAG) succeeds.
    expect(mockedPregenerateForPlan).toHaveBeenCalledWith(PLAN_ID);
  });

  // --- Guard cuối transaction: job bị lấy mất trạng thái 'processing' giữa chừng ---
  it('rolls back and warns, without marking the job failed, when the finalize guard no longer sees it processing', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    (mockedPrisma.analysisJob.updateMany as jest.Mock)
      .mockResolvedValueOnce({ count: 1 }) // claim ban đầu thành công
      .mockResolvedValueOnce({ count: 0 }); // guard finalize: job đã bị "cướp" mất trạng thái processing
    (mockedPrisma.analysisJob.findUniqueOrThrow as jest.Mock).mockResolvedValue(pendingJob);

    await processAnalysisJob(JOB_ID);

    // Pipeline phải chạy hết qua concept/edge/plan trước khi fail ở finalize — chứng
    // minh guard đúng chỗ chứ không phải crash sớm do thiếu mock (false-green).
    expect(mockedPrisma.concept.create).toHaveBeenCalled();
    expect(mockedPrisma.studyPlan.update).toHaveBeenCalled();
    // Xác nhận rõ lần updateMany thứ 2 chính là finalize guard (where: status 'processing')
    // — không phải một lỗi khác xảy ra sớm hơn trong transaction.
    expect(mockedPrisma.analysisJob.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: JOB_ID, status: 'processing' },
      data: { status: 'done', completedAt: expect.any(Date) },
    });
    // "Cướp" giữa chừng là benign — thủ phạm (cleanupStaleJobs/retry) đã tự ghi trạng thái
    // cuối của nó rồi, nên ở đây chỉ log cảnh báo, không được gọi markFailed đè lên
    // (tránh leak message nội bộ ra UI qua #183, và tránh ép sai retryCount).
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('no longer processing'));
    expectMarkFailedNotCalled();
    // The transaction rolled back, so there is nothing to pre-generate cache from.
    expect(mockedPregenerateForPlan).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  // --- Nhánh fetch sau claim ném (row bị hard-delete bởi delete-plan cascade giữa
  // claim và findUniqueOrThrow): phải route qua markFailed và resolve, không bubble ---
  it('routes a post-claim fetch failure through markFailed and resolves, without entering the transaction', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    (mockedPrisma.analysisJob.updateMany as jest.Mock)
      .mockResolvedValueOnce({ count: 1 }) // claim thành công
      .mockResolvedValue({ count: 0 }); // markFailed: updateMany no-op vì row đã biến mất
    (mockedPrisma.analysisJob.findUniqueOrThrow as jest.Mock).mockRejectedValue(
      new Error('No AnalysisJob found') // ~ Prisma P2025 khi row đã bị xóa
    );

    // Không được ném ra ngoài dù row đã mất — markFailed (updateMany) tự no-op count 0
    // thay vì ném P2025 lần thứ hai từ trong chính handler lỗi.
    await expect(processAnalysisJob(JOB_ID)).resolves.toBeUndefined();

    // Fetch ném trước khi vào pipeline nên transaction không được mở.
    expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
    // markFailed thực sự chạy: updateMany với status 'failed', guard chỉ theo id (không kèm
    // status trong where) nên an toàn kể cả khi row không còn.
    expect(mockedPrisma.analysisJob.updateMany).toHaveBeenLastCalledWith({
      where: { id: JOB_ID },
      data: expect.objectContaining({ status: 'failed' }),
    });
    expect(mockedPregenerateForPlan).not.toHaveBeenCalled();

    errorSpy.mockRestore();
  });
});
