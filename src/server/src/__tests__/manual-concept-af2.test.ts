import { replacePlanGraph } from '../services/graph.service';
import prisma from '../config/prisma';

/**
 * Regression coverage for Issue #172 (AF2): "AI thất bại 3 lần → tự nhập khái niệm và bắt
 * đầu ngay". `replacePlanGraph` (PUT /plans/:id/graph) đã tự làm đúng việc này — không có
 * (và không cần) endpoint POST /plans/:id/concepts riêng. Test này khoá lại hành vi: một
 * plan `draft` (AnalysisJob `failed`, nên chưa có concept AI nào) có thể được cứu bằng cách
 * confirm một đồ thị gõ tay — concept mới nhận `source: 'manual'` và plan được kích hoạt.
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

describe('replacePlanGraph — AF2: nhập tay concept sau khi AI phân tích thất bại (#172)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (mockedPrisma.$transaction as jest.Mock).mockImplementation(
      (fn: (tx: typeof mockedPrisma) => Promise<unknown>) => fn(mockedPrisma)
    );
    // draft + không có concept nào — đúng trạng thái của một plan sau khi AnalysisJob
    // failed (StudyPlan.status vẫn giữ 'draft', concepts rỗng theo docs/api/plans.md mục 1.1).
    (mockedPrisma.studyPlan.findUnique as jest.Mock).mockResolvedValue({
      id: PLAN_ID,
      userId: OWNER_ID,
      status: 'draft',
    });
    (mockedPrisma.concept.findMany as jest.Mock).mockResolvedValue([]);
    (mockedPrisma.concept.create as jest.Mock).mockResolvedValue({ id: 'concept-new' });
  });

  it('tạo concept nhập tay với source=manual và kích hoạt plan khi confirm=true', async () => {
    (mockedPrisma.studyPlan.update as jest.Mock).mockResolvedValue({
      id: PLAN_ID,
      status: 'active',
      dagAutoFixed: false,
      concepts: [{ id: 'concept-new', name: 'Giới hạn', source: 'manual' }],
      conceptEdges: [],
    });

    await replacePlanGraph(PLAN_ID, OWNER_ID, {
      concepts: [{ name: 'Giới hạn', difficulty: 2 }],
      edges: [],
      confirm: true,
    });

    expect(mockedPrisma.concept.create).toHaveBeenCalledWith({
      data: { planId: PLAN_ID, name: 'Giới hạn', difficulty: 2, source: 'manual' },
    });
    expect(mockedPrisma.studyPlan.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'active' } })
    );
  });

  it('không kích hoạt plan khi confirm=false (đồ thị mới đang preview/DAG-check, chưa chốt)', async () => {
    (mockedPrisma.studyPlan.update as jest.Mock).mockResolvedValue({
      id: PLAN_ID,
      status: 'draft',
      dagAutoFixed: false,
      concepts: [],
      conceptEdges: [],
    });

    await replacePlanGraph(PLAN_ID, OWNER_ID, {
      concepts: [{ name: 'Giới hạn' }],
      edges: [],
      confirm: false,
    });

    expect(mockedPrisma.studyPlan.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: {} })
    );
  });

  it('không đụng tới ConceptSourceRef — concept nhập tay không có neo nguồn (page_count/document giữ nguyên)', async () => {
    (mockedPrisma.studyPlan.update as jest.Mock).mockResolvedValue({
      id: PLAN_ID,
      status: 'active',
      dagAutoFixed: false,
      concepts: [],
      conceptEdges: [],
    });

    // `conceptSourceRef` không được mock trên client — nếu replacePlanGraph lỡ gọi tới nó,
    // test sẽ throw ngay ("tx.conceptSourceRef is undefined") thay vì âm thầm pass.
    await expect(
      replacePlanGraph(PLAN_ID, OWNER_ID, {
        concepts: [{ name: 'Giới hạn' }],
        edges: [],
        confirm: true,
      })
    ).resolves.toBeDefined();
  });

  it('reject cycle khi nối cạnh tay tạo chu trình (self-loop), không ghi gì vào DB', async () => {
    await expect(
      replacePlanGraph(PLAN_ID, OWNER_ID, {
        concepts: [{ name: 'Giới hạn' }],
        edges: [{ from: 'Giới hạn', to: 'Giới hạn' }],
        confirm: true,
      })
    ).rejects.toMatchObject({ statusCode: 409, code: 'DAG_CYCLE' });

    expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
  });
});
