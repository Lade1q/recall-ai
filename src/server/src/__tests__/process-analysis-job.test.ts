import fs from 'fs';
import { processAnalysisJob } from '../services/analysis.service';
import prisma from '../config/prisma';
import { extractConcepts } from '../services/gemini.service';
import { pregenerateForPlan } from '../services/question-cache.service';
import { mockExtractForFile } from '../utils/mock-ai';

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

// analysis.service cũng import 2 module này — mock để load được module mà không
// đụng Gemini/fs thật. USE_MOCK_AI=true (set bên dưới) đã bypass cả hai rồi.
jest.mock('../services/gemini.service', () => ({
  extractConcepts: jest.fn(),
  linkTopics: jest.fn(),
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

/**
 * `callAi`'s USE_MOCK_AI branch picks a mock bank from the fileKey, so the fixture has to be
 * the bank THIS job's file maps to. Derived rather than hard-coded: hard-coding bank 0 would
 * pass only for as long as 'notes.txt' happens to hash there.
 */
const MOCK_EXTRACT_RESULT = mockExtractForFile(pendingJob.fileKey);

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

  /**
   * Chạy pipeline với đúng MỘT concept ('Variable') và trường `checkpoints` do test đặt.
   *
   * USE_MOCK_AI trả về bank cố định theo fileKey nên không đổi payload được; phải đi qua
   * `extractConcepts` (đã mock). `readFile` bị chặn vì fileKey trỏ tệp không có thật trên đĩa.
   * Dọn trong `finally` để một assertion hỏng không rò env/spy sang test sau.
   */
  async function runWithCheckpoints(checkpoints: string[] | null) {
    mockedExtractConcepts.mockResolvedValue({
      ...MOCK_EXTRACT_RESULT,
      concepts: [{ ...MOCK_EXTRACT_RESULT.concepts[0], checkpoints }],
      edges: [],
    });
    const readFile = jest.spyOn(fs.promises, 'readFile').mockResolvedValue('nội dung tài liệu');
    process.env.USE_MOCK_AI = 'false';
    try {
      await processAnalysisJob(JOB_ID);
    } finally {
      readFile.mockRestore();
      mockedExtractConcepts.mockReset();
      process.env.USE_MOCK_AI = 'true';
    }
  }

  /** Kế hoạch đã có concept 'Variable' cùng 2 checkpoint đã chốt từ lần phân tích trước. */
  function givenStoredCheckpoints() {
    (mockedPrisma.concept.findMany as jest.Mock).mockResolvedValue([
      { id: 'c-variable', name: 'Variable', status: 'active' },
    ]);
    (mockedPrisma.conceptCheckpoint.findMany as jest.Mock).mockResolvedValue(
      (MOCK_EXTRACT_RESULT.concepts[0]?.checkpoints ?? []).map((text, orderIndex) => ({
        id: `cp-${orderIndex}`,
        conceptId: 'c-variable',
        text,
        orderIndex,
      }))
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.USE_MOCK_AI = 'true'; // callAi trả thẳng bank mock của fileKey, không gọi Gemini thật

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
    // #329: chưa có checkpoint nào lưu trước đó — lần phân tích đầu, mọi checkpoint là toCreate.
    (mockedPrisma.conceptCheckpoint.findMany as jest.Mock).mockResolvedValue([]);
    (mockedPrisma.conceptCheckpoint.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });
    (mockedPrisma.conceptCheckpoint.update as jest.Mock).mockResolvedValue({});
    (mockedPrisma.conceptCheckpoint.createMany as jest.Mock).mockResolvedValue({ count: 0 });
    (mockedPrisma.document.findFirst as jest.Mock).mockResolvedValue(null);
    // Mặc định: kế hoạch KHÔNG còn hàng `documents` nào. Đây là đường degrade -- job vẫn biết
    // fileKey nên vẫn trích được khái niệm, chúng chỉ không thuộc chủ đề nào và không được neo.
    // Giữ làm mặc định để mọi ca cũ (vốn viết cho một-tài-liệu-không-neo) không phải đổi.
    (mockedPrisma.document.findMany as jest.Mock).mockResolvedValue([]);
    (mockedPrisma.documentEdge.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });
    (mockedPrisma.documentEdge.createMany as jest.Mock).mockResolvedValue({ count: 0 });
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

    // `primaryDocumentId` is selected alongside the three the merge needs: append mode reads it
    // to tell a concept that already belongs to a topic from one that does not (§4).
    expect(mockedPrisma.concept.findMany).toHaveBeenCalledWith({
      where: { planId: PLAN_ID },
      select: { id: true, name: true, status: true, primaryDocumentId: true },
    });
    expect(mockedPrisma.concept.create).toHaveBeenCalled();
    expect(mockedPrisma.conceptEdge.create).toHaveBeenCalled();
    expect(mockedPrisma.studyPlan.update).toHaveBeenCalledWith({
      where: { id: PLAN_ID },
      data: expect.objectContaining({ dagAutoFixed: expect.any(Boolean) }),
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

  // --- #329 (INV-1): thước đo được chốt LÚC PHÂN TÍCH, không phải lúc phỏng vấn ---
  it('commits each concept’s checkpoints in the same transaction as the concepts', async () => {
    (mockedPrisma.analysisJob.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    (mockedPrisma.analysisJob.findUniqueOrThrow as jest.Mock).mockResolvedValue(pendingJob);

    await processAnalysisJob(JOB_ID);

    const variable = MOCK_EXTRACT_RESULT.concepts[0];
    expect(mockedPrisma.conceptCheckpoint.createMany).toHaveBeenCalledWith({
      // `concept-<name>` là id do mock concept.create sinh ra ở trên.
      data: (variable?.checkpoints ?? []).map((text, orderIndex) => ({
        conceptId: `concept-${variable?.name}`,
        text,
        orderIndex,
      })),
    });
    // Đủ cả 5 concept của MOCK_EXTRACT_RESULT, không phải chỉ concept đầu.
    expect(mockedPrisma.conceptCheckpoint.createMany).toHaveBeenCalledTimes(
      MOCK_EXTRACT_RESULT.concepts.length
    );
  });

  it('keeps the id of a checkpoint that survives a re-analysis, and drops the one that did not', async () => {
    (mockedPrisma.analysisJob.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    (mockedPrisma.analysisJob.findUniqueOrThrow as jest.Mock).mockResolvedValue(pendingJob);
    // Kế hoạch đã có concept 'Variable' (SP-05 phân tích lại) — planConceptMerge giữ lại id của nó.
    (mockedPrisma.concept.findMany as jest.Mock).mockResolvedValue([
      { id: 'c-variable', name: 'Variable', status: 'active' },
    ]);
    const [surviving, added] = MOCK_EXTRACT_RESULT.concepts[0]?.checkpoints ?? [];
    (mockedPrisma.conceptCheckpoint.findMany as jest.Mock).mockResolvedValue([
      // Lần trích trước xếp nó ở vị trí 5; lần này nó là checkpoint đầu tiên.
      { id: 'cp-keep', conceptId: 'c-variable', text: surviving, orderIndex: 5 },
      { id: 'cp-gone', conceptId: 'c-variable', text: 'Điểm tài liệu cũ không còn', orderIndex: 6 },
    ]);

    await processAnalysisJob(JOB_ID);

    // Giữ nguyên hàng cũ: bằng chứng phỏng vấn (#330) trỏ vào `cp-keep`, tái tạo hàng là mất nó.
    expect(mockedPrisma.conceptCheckpoint.update).toHaveBeenCalledWith({
      where: { id: 'cp-keep' },
      data: { text: surviving, orderIndex: 0 },
    });
    expect(mockedPrisma.conceptCheckpoint.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['cp-gone'] } },
    });
    expect(mockedPrisma.conceptCheckpoint.createMany).toHaveBeenCalledWith({
      data: [{ conceptId: 'c-variable', text: added, orderIndex: 1 }],
    });

    // Thứ tự delete -> update -> create là ràng buộc thật: unique (concept_id, text) sẽ từ chối
    // một hàng được tạo/đổi tên đè lên text mà bản trùng chưa bị xoá còn giữ. Prisma mock không
    // có unique index nên sẽ không tự vỡ — phải ghim ở đây, nếu không ai gộp/đảo 3 khối này sẽ
    // thấy toàn bộ test xanh rồi vỡ trên DB thật.
    const firstCall = (fn: unknown) => (fn as jest.Mock).mock.invocationCallOrder[0] ?? Infinity;
    expect(firstCall(mockedPrisma.conceptCheckpoint.deleteMany)).toBeLessThan(
      firstCall(mockedPrisma.conceptCheckpoint.update)
    );
    expect(firstCall(mockedPrisma.conceptCheckpoint.update)).toBeLessThan(
      firstCall(mockedPrisma.conceptCheckpoint.createMany)
    );
  });

  it('writes nothing when a re-analysis returns the checkpoints already stored', async () => {
    (mockedPrisma.analysisJob.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    (mockedPrisma.analysisJob.findUniqueOrThrow as jest.Mock).mockResolvedValue(pendingJob);
    givenStoredCheckpoints();

    await processAnalysisJob(JOB_ID);

    // Phân tích lại một tài liệu không đổi không được đụng vào hàng nào — đụng là bump `updatedAt`
    // của thước đo dù nó y nguyên.
    expect(mockedPrisma.conceptCheckpoint.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'cp-0' } })
    );
    expect(mockedPrisma.conceptCheckpoint.deleteMany).not.toHaveBeenCalled();
  });

  it('commits nothing for a concept the model gave no checkpoints — C = 0 is a valid outcome', async () => {
    (mockedPrisma.analysisJob.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    (mockedPrisma.analysisJob.findUniqueOrThrow as jest.Mock).mockResolvedValue(pendingJob);

    await runWithCheckpoints([]);

    expect(mockedPrisma.conceptCheckpoint.createMany).not.toHaveBeenCalled();
    // Không checkpoint KHÔNG phải lỗi: phân tích vẫn hoàn tất bình thường.
    expectMarkFailedNotCalled();
    expect(mockedPrisma.analysisJob.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: JOB_ID, status: 'processing' },
      data: { status: 'done', completedAt: expect.any(Date) },
    });
  });

  it('still clears the ruler when the model deliberately returns an empty list', async () => {
    (mockedPrisma.analysisJob.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    (mockedPrisma.analysisJob.findUniqueOrThrow as jest.Mock).mockResolvedValue(pendingJob);
    givenStoredCheckpoints();

    await runWithCheckpoints([]);

    // Nhánh xoá phải còn sống: tài liệu mới thật sự không còn đỡ checkpoint nào thì `C` về 0,
    // không phải "sửa blocker bằng cách không bao giờ xoá nữa".
    expect(mockedPrisma.conceptCheckpoint.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['cp-0', 'cp-1'] } },
    });
  });

  // --- Blocker review PR #333: output hỏng KHÔNG được đọc thành "concept này không có checkpoint" ---
  const unreadable: [string, string[] | null][] = [
    ['null (field vắng / null / không phải mảng)', null],
    ['mảng non-empty mà mọi entry đều hỏng', ['', '']],
  ];
  it.each(unreadable)(
    'keeps the stored ruler when checkpoints are unreadable — %s',
    async (_label, raw) => {
      (mockedPrisma.analysisJob.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      (mockedPrisma.analysisJob.findUniqueOrThrow as jest.Mock).mockResolvedValue(pendingJob);
      givenStoredCheckpoints();

      await runWithCheckpoints(raw);

      // Một lần trích lỡ nhịp không được xoá thước đo đã chốt — và từ #330 trở đi, xoá thước là
      // xoá luôn bằng chứng trỏ vào id của nó.
      expect(mockedPrisma.conceptCheckpoint.deleteMany).not.toHaveBeenCalled();
      expect(mockedPrisma.conceptCheckpoint.update).not.toHaveBeenCalled();
      expect(mockedPrisma.conceptCheckpoint.createMany).not.toHaveBeenCalled();
      // Nhưng bản thân lần phân tích vẫn thành công: một field hỏng không đánh sập cả job.
      expectMarkFailedNotCalled();
      expect(mockedPrisma.analysisJob.updateMany).toHaveBeenNthCalledWith(2, {
        where: { id: JOB_ID, status: 'processing' },
        data: { status: 'done', completedAt: expect.any(Date) },
      });
    }
  );

  // --- #265: phân tích xong KHÔNG được tự kích hoạt kế hoạch ---
  it('leaves the plan in draft — only the user confirming the graph activates it', async () => {
    (mockedPrisma.analysisJob.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    (mockedPrisma.analysisJob.findUniqueOrThrow as jest.Mock).mockResolvedValue(pendingJob);

    await processAnalysisJob(JOB_ID);

    // Kiểm trên chính payload đã ghi: `status` phải vắng mặt, không chỉ "khác 'active'" —
    // ghi 'draft' đè lên cũng sai, vì kế hoạch đã active (SP-05 reanalyze) sẽ bị hạ cấp.
    const [call] = (mockedPrisma.studyPlan.update as jest.Mock).mock.calls;
    expect(call[0].data).not.toHaveProperty('status');
    expect(call[0].data).toMatchObject({ dagAutoFixed: expect.any(Boolean) });
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

  /**
   * Review #425 round 2 (Quân) — a hardcoded `const materialText = null;` at the call site
   * survived 926/926: every other test here runs `USE_MOCK_AI=true`, where `resolveMaterialText`
   * short-circuits to `null` regardless of wiring, so nothing actually proves the real value read
   * from disk reaches `buildConceptSourceRows`. This test runs the real (non-mock) `.txt` path —
   * same `fs.promises.readFile` spy `runWithCheckpoints` already uses — and asserts the section
   * title the mocked extraction returns actually survives into `conceptSourceRef.createMany`,
   * which is only possible if `materialText` really is the file content, not `null`.
   */
  it('threads the real material text through to buildConceptSourceRows (sectionTitle guard)', async () => {
    (mockedPrisma.analysisJob.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    (mockedPrisma.analysisJob.findUniqueOrThrow as jest.Mock).mockResolvedValue(pendingJob);
    (mockedPrisma.document.findMany as jest.Mock).mockResolvedValue([
      { id: 'doc-1', filename: 'notes.txt', fileKey: pendingJob.fileKey },
    ]);
    mockedExtractConcepts.mockResolvedValue({
      ...MOCK_EXTRACT_RESULT,
      concepts: [
        {
          ...MOCK_EXTRACT_RESULT.concepts[0],
          source_section: 'nội dung',
        },
      ],
      edges: [],
    });
    const readFile = jest.spyOn(fs.promises, 'readFile').mockResolvedValue('nội dung tài liệu');
    process.env.USE_MOCK_AI = 'false';

    try {
      await processAnalysisJob(JOB_ID);

      expect(mockedPrisma.conceptSourceRef.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([expect.objectContaining({ sectionTitle: 'nội dung' })]),
      });
    } finally {
      readFile.mockRestore();
      mockedExtractConcepts.mockReset();
      process.env.USE_MOCK_AI = 'true';
    }
  });
});
