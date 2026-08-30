import type { ReviewItemStatus, ReviewReason, StudyPlanStatus } from '@prisma/client';
import prisma from '../config/prisma';
import { getReviewSchedule } from '../services/review-schedule.service';

/**
 * `getReviewSchedule` (#402) — **thân hàm**, không phải hai hàm thuần bên cạnh nó.
 *
 * Vì sao tệp này tồn tại: bộ test đầu của #402 chỉ chạm `foldToRepresentatives` và
 * `sortScheduleItems`. Mọi thứ *quyết định đúng/sai của endpoint* thì nằm ngoài chúng — ba bộ lọc
 * bắt buộc, phép chốt `userId`, phép cắt ngày VN, phép ghép `scheduledFor` vào đúng mục — và
 * **năm đột biến trên vùng đó sống sót qua 895/895**. Trong đó có hai cái không ồn ào chút nào:
 * bỏ `userId` (mọi user thấy lịch của mọi user) và đổi `toVnDateKey` sang `toISOString()` (lệch
 * **một ngày** với mọi mục rơi vào 00:00–07:00 giờ VN).
 *
 * Prisma được fake bằng bảng in-memory **thi hành `where` thật**, theo đúng khuôn
 * `review-queue-status.test.ts`. Đó là toàn bộ giá trị của tệp: một mock trả mảng cố định sẽ xanh
 * y hệt cho cả năm đột biến trên, vì lỗi nằm TRONG bộ lọc.
 *
 * Không dựng Prisma client ⇒ chạy được khi đã tước `DATABASE_URL`/`GEMINI_API_KEY` (R05).
 */

const USER_ID = 'user-me';
const OTHER_USER_ID = 'user-someone-else';
const PLAN_ID = 'plan-active';
const OTHER_PLAN_ID = 'plan-of-another-user';

interface FakeRow {
  id: string;
  planId: string;
  conceptId: string;
  priority: number;
  reason: ReviewReason;
  depth: number | null;
  status: ReviewItemStatus;
  sourceConceptId: string | null;
  sourceSessionId: string | null;
  scheduledFor: Date | null;
  createdAt: Date;
}

interface FakePlan {
  id: string;
  userId: string;
  name: string;
  deadline: Date | null;
  status: StudyPlanStatus;
}

interface FakeConcept {
  id: string;
  name: string;
  masteryScore: number | null;
  status: 'active' | 'deprecated';
}

let rows: FakeRow[] = [];
let plans: FakePlan[] = [];
let concepts: FakeConcept[] = [];

function row(overrides: Partial<FakeRow> & { id: string; conceptId: string }): FakeRow {
  return {
    planId: PLAN_ID,
    priority: 0.5,
    reason: 'spaced_repetition',
    depth: null,
    status: 'pending',
    sourceConceptId: null,
    sourceSessionId: null,
    scheduledFor: new Date('2026-08-20T03:00:00.000Z'),
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    ...overrides,
  };
}

/** Đúng phần ngữ pháp `where` mà `getReviewSchedule` dùng — và nó phải THI HÀNH, không bỏ qua. */
interface FakeWhere {
  plan?: { userId?: string; status?: StudyPlanStatus };
  status?: { notIn?: ReviewItemStatus[] };
  concept?: { status?: string };
  scheduledFor?: { not?: null };
}

function matches(candidate: FakeRow, where: FakeWhere): boolean {
  const plan = plans.find((p) => p.id === candidate.planId);
  const concept = concepts.find((c) => c.id === candidate.conceptId);
  if (where.plan?.userId !== undefined && plan?.userId !== where.plan.userId) return false;
  if (where.plan?.status !== undefined && plan?.status !== where.plan.status) return false;
  if (where.status?.notIn?.includes(candidate.status)) return false;
  if (where.concept?.status !== undefined && concept?.status !== where.concept.status) return false;
  if (where.scheduledFor !== undefined && candidate.scheduledFor === null) return false;
  return true;
}

jest.mock('../config/prisma', () => ({
  __esModule: true,
  default: {
    reviewQueueItem: { findMany: jest.fn() },
    concept: { findMany: jest.fn() },
    interviewSession: { findMany: jest.fn() },
  },
}));

const mockedPrisma = prisma as unknown as {
  reviewQueueItem: { findMany: jest.Mock };
  concept: { findMany: jest.Mock };
  interviewSession: { findMany: jest.Mock };
};

beforeEach(() => {
  jest.clearAllMocks();

  plans = [
    { id: PLAN_ID, userId: USER_ID, name: 'Kế hoạch của tôi', deadline: null, status: 'active' },
    {
      id: OTHER_PLAN_ID,
      userId: OTHER_USER_ID,
      name: 'Kế hoạch người khác',
      deadline: null,
      status: 'active',
    },
  ];
  concepts = [
    { id: 'c-alpha', name: 'Alpha', masteryScore: 0.4, status: 'active' },
    { id: 'c-beta', name: 'Beta', masteryScore: 0.9, status: 'active' },
    { id: 'c-tombstone', name: 'Đã gỡ khỏi tài liệu', masteryScore: 0.1, status: 'deprecated' },
  ];
  rows = [];

  mockedPrisma.reviewQueueItem.findMany.mockImplementation(({ where }: { where: FakeWhere }) =>
    Promise.resolve(
      rows
        .filter((candidate) => matches(candidate, where))
        .map((candidate) => ({
          ...candidate,
          plan: plans.find((p) => p.id === candidate.planId),
          concept: concepts.find((c) => c.id === candidate.conceptId),
        }))
    )
  );
  // Hai tra cứu mềm của `toResponseItems`; không ca nào ở đây dùng tới nên trả rỗng là đủ.
  mockedPrisma.concept.findMany.mockResolvedValue([]);
  mockedPrisma.interviewSession.findMany.mockResolvedValue([]);
});

const NOW = new Date('2026-08-20T03:00:00.000Z');

describe('getReviewSchedule — ba bộ lọc bắt buộc', () => {
  it('chỉ trả mục của kế hoạch thuộc user đang đăng nhập', async () => {
    rows = [
      row({ id: 'mine', conceptId: 'c-alpha' }),
      row({ id: 'theirs', conceptId: 'c-beta', planId: OTHER_PLAN_ID }),
    ];
    const schedule = await getReviewSchedule(USER_ID, NOW);
    expect(schedule.items.map((i) => i.id)).toEqual(['mine']);
  });

  it('bỏ mục sinh viên đã gỡ khỏi lịch (ON_SCHEDULE_WHERE)', async () => {
    rows = [
      row({ id: 'on-schedule', conceptId: 'c-alpha' }),
      row({ id: 'removed', conceptId: 'c-beta', status: 'skipped' }),
    ];
    const schedule = await getReviewSchedule(USER_ID, NOW);
    expect(schedule.items.map((i) => i.id)).toEqual(['on-schedule']);
  });

  it('bỏ mục trỏ vào khái niệm tài liệu đã bỏ dạy (ACTIVE_CONCEPT_WHERE)', async () => {
    rows = [
      row({ id: 'live', conceptId: 'c-alpha' }),
      row({ id: 'tombstone', conceptId: 'c-tombstone' }),
    ];
    const schedule = await getReviewSchedule(USER_ID, NOW);
    expect(schedule.items.map((i) => i.id)).toEqual(['live']);
  });

  it('bỏ mục chưa có ngày — không đặt lên lịch được', async () => {
    rows = [
      row({ id: 'dated', conceptId: 'c-alpha' }),
      row({ id: 'undated', conceptId: 'c-beta', scheduledFor: null }),
    ];
    const schedule = await getReviewSchedule(USER_ID, NOW);
    expect(schedule.items.map((i) => i.id)).toEqual(['dated']);
  });
});

describe('getReviewSchedule — ngày lịch VN', () => {
  /**
   * Biên UTC+7. `2026-08-19T18:30:00Z` là **01:30 sáng 20/08 giờ VN**, nên `dateKey` phải là
   * `2026-08-20`. Đây là ca duy nhất bắt được đột biến `toISOString().slice(0, 10)`, thứ sẽ trả
   * `2026-08-19` — lệch một ngày cho MỌI mục rơi vào 00:00–07:00 giờ VN, tức lệch âm thầm cho
   * cả một khung giờ chứ không phải một ca lẻ.
   */
  it('cắt ngày theo giờ VN, không theo UTC', async () => {
    rows = [
      row({
        id: 'early',
        conceptId: 'c-alpha',
        scheduledFor: new Date('2026-08-19T18:30:00.000Z'),
      }),
    ];
    const schedule = await getReviewSchedule(USER_ID, NOW);
    expect(schedule.items[0]?.dateKey).toBe('2026-08-20');
  });

  it('todayDateKey cũng theo giờ VN', async () => {
    rows = [row({ id: 'any', conceptId: 'c-alpha' })];
    const schedule = await getReviewSchedule(USER_ID, new Date('2026-08-19T18:30:00.000Z'));
    expect(schedule.todayDateKey).toBe('2026-08-20');
  });
});

describe('getReviewSchedule — gộp và ghép', () => {
  /**
   * ⭐ Ca mà **dữ liệu thật không dựng nổi**: engine luôn ghi `spaced_repetition` trước rồi mới
   * `traceback` trong cùng một phiên, nên hàng traceback gần như luôn là hàng mới nhất và luật
   * đã chốt trùng kết quả với luật ngây thơ "chỉ `createdAt` mới nhất" (đo được: 6/6 cụm trên DB
   * dev). Ở đây dựng ngược lại bằng hai dòng — và đây là **bằng chứng duy nhất phân biệt được
   * hai luật**.
   */
  it('giữ hàng truy ngược yếu làm đại diện dù có hàng MỚI HƠN', async () => {
    rows = [
      row({
        id: 'traceback-cũ',
        conceptId: 'c-alpha',
        reason: 'traceback',
        depth: 1,
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
        scheduledFor: new Date('2026-08-20T03:00:00.000Z'),
      }),
      row({
        id: 'giãn-cách-mới',
        conceptId: 'c-alpha',
        createdAt: new Date('2026-08-10T00:00:00.000Z'),
        scheduledFor: new Date('2026-08-26T03:00:00.000Z'),
      }),
    ];
    const schedule = await getReviewSchedule(USER_ID, NOW);
    expect(schedule.items).toHaveLength(1);
    expect(schedule.items[0]?.id).toBe('traceback-cũ');
    expect(schedule.items[0]?.dateKey).toBe('2026-08-20');
  });

  /** `scheduledFor`/`dateKey` phải bám đúng mục của nó, kể cả khi thứ tự hai mảng khác nhau. */
  it('ghép ngày vào đúng mục, không theo vị trí trong mảng', async () => {
    rows = [
      row({ id: 'sớm', conceptId: 'c-alpha', scheduledFor: new Date('2026-08-12T03:00:00.000Z') }),
      row({ id: 'muộn', conceptId: 'c-beta', scheduledFor: new Date('2026-08-27T03:00:00.000Z') }),
    ];
    const schedule = await getReviewSchedule(USER_ID, NOW);
    const byId = new Map(schedule.items.map((i) => [i.id, i.dateKey]));
    expect(byId.get('sớm')).toBe('2026-08-12');
    expect(byId.get('muộn')).toBe('2026-08-27');
  });

  it('cùng khái niệm ở hai kế hoạch là hai mục, không phải trùng lặp', async () => {
    plans.push({
      id: 'plan-two',
      userId: USER_ID,
      name: 'Kế hoạch thứ hai',
      deadline: null,
      status: 'active',
    });
    rows = [
      row({ id: 'p1', conceptId: 'c-alpha' }),
      row({ id: 'p2', conceptId: 'c-alpha', planId: 'plan-two' }),
    ];
    const schedule = await getReviewSchedule(USER_ID, NOW);
    expect(schedule.items).toHaveLength(2);
  });

  it('sắp theo dateKey tăng dần, truy ngược đứng trước trong cùng một ngày', async () => {
    rows = [
      row({ id: 'muộn', conceptId: 'c-beta', scheduledFor: new Date('2026-08-27T03:00:00.000Z') }),
      row({ id: 'giãn-cách-hôm-nay', conceptId: 'c-alpha', priority: 0.9 }),
      row({
        id: 'truy-ngược-hôm-nay',
        conceptId: 'c-tombstone-not-used',
        reason: 'traceback',
        depth: 1,
        priority: 0.1,
      }),
    ];
    concepts.push({
      id: 'c-tombstone-not-used',
      name: 'Gamma',
      masteryScore: 0.2,
      status: 'active',
    });
    const schedule = await getReviewSchedule(USER_ID, NOW);
    expect(schedule.items.map((i) => i.id)).toEqual([
      'truy-ngược-hôm-nay',
      'giãn-cách-hôm-nay',
      'muộn',
    ]);
  });

  /**
   * Ghim theo HÌNH DẠNG LỜI GỌI, không theo hành vi — cố ý, và đây là ca hiếm mà điều đó đúng:
   * tác dụng của `orderBy` nằm hoàn toàn trong Postgres, nên một fake in-memory không thể chứng
   * minh nó. Thứ ghim được là "tuỳ chọn này không bị lặng lẽ bỏ đi".
   *
   * Vì sao nó đáng ghim: `pickRepresentative` phá hoà bằng "giữ hàng thấy trước", nên bỏ
   * `orderBy` là trao quyền phá hoà cho thứ tự Postgres trả về — và ngày 20/08 trên DB dev đang
   * có đúng một cụm hoà cả hai khoá sắp, tức hai mục đổi chỗ được giữa hai lần tải.
   */
  it('xin thứ tự tất định từ DB để phép phá hoà không do Postgres quyết', async () => {
    rows = [row({ id: 'any', conceptId: 'c-alpha' })];
    await getReviewSchedule(USER_ID, NOW);
    expect(mockedPrisma.reviewQueueItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: [{ createdAt: 'desc' }, { id: 'asc' }] })
    );
  });

  it('trả danh sách rỗng khi user không có mục nào', async () => {
    rows = [row({ id: 'theirs', conceptId: 'c-alpha', planId: OTHER_PLAN_ID })];
    const schedule = await getReviewSchedule(USER_ID, NOW);
    expect(schedule.items).toEqual([]);
    expect(schedule.todayDateKey).toBe('2026-08-20');
  });
});
