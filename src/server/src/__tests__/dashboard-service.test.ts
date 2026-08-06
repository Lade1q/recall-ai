import { getDashboardStats } from '../services/dashboard.service';
import prisma from '../config/prisma';

jest.mock('../config/prisma', () => ({
  __esModule: true,
  default: {
    interviewSession: { findMany: jest.fn() },
    focusSession: { findMany: jest.fn(), aggregate: jest.fn() },
    studyPlan: { findMany: jest.fn() },
  },
}));

const mockedPrisma = prisma as unknown as {
  interviewSession: { findMany: jest.Mock };
  focusSession: { findMany: jest.Mock; aggregate: jest.Mock };
  studyPlan: { findMany: jest.Mock };
};

const USER_ID = '11111111-1111-1111-1111-111111111111';

function mockEmpty(): void {
  mockedPrisma.interviewSession.findMany.mockResolvedValue([]);
  mockedPrisma.focusSession.findMany.mockResolvedValue([]);
  mockedPrisma.focusSession.aggregate.mockResolvedValue({ _sum: { durationMinutes: null } });
  mockedPrisma.studyPlan.findMany.mockResolvedValue([]);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockEmpty();
});

describe('getDashboardStats', () => {
  it('returns all zeros for a user with no plans and no activity, without throwing', async () => {
    const stats = await getDashboardStats(USER_ID);

    expect(stats).toEqual({
      studyStreakDays: 0,
      weeklyStudyMinutes: 0,
      conceptsMastered: 0,
      conceptsTotal: 0,
    });
  });

  it('maps a null durationMinutes sum (no completed session this week) to 0', async () => {
    mockedPrisma.focusSession.aggregate.mockResolvedValue({ _sum: { durationMinutes: null } });

    const stats = await getDashboardStats(USER_ID);

    expect(stats.weeklyStudyMinutes).toBe(0);
  });

  it('passes the aggregated durationMinutes sum through when present', async () => {
    mockedPrisma.focusSession.aggregate.mockResolvedValue({ _sum: { durationMinutes: 380 } });

    const stats = await getDashboardStats(USER_ID);

    expect(stats.weeklyStudyMinutes).toBe(380);
    expect(mockedPrisma.focusSession.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: USER_ID, status: 'completed' }),
      })
    );
  });

  it('counts only active concepts from active plans, filtering out deprecated/other-status noise at the query level', async () => {
    // service tin tưởng Prisma đã lọc đúng theo where — chỉ cần trả về đúng những gì "còn sót lại"
    mockedPrisma.studyPlan.findMany.mockResolvedValue([
      { concepts: [{ masteryScore: 0.9 }, { masteryScore: 0.5 }] },
      { concepts: [{ masteryScore: 0.8 }] },
    ]);

    const stats = await getDashboardStats(USER_ID);

    expect(stats.conceptsTotal).toBe(3);
    expect(stats.conceptsMastered).toBe(2); // 0.9 và 0.8 (>= MASTERY_STRONG_THRESHOLD), 0.5 thì không
    expect(mockedPrisma.studyPlan.findMany).toHaveBeenCalledWith({
      where: { userId: USER_ID, status: 'active' },
      select: { concepts: { where: { status: 'active' }, select: { masteryScore: true } } },
    });
  });

  it('does not count a null masteryScore as mastered, and does not throw', async () => {
    mockedPrisma.studyPlan.findMany.mockResolvedValue([{ concepts: [{ masteryScore: null }] }]);

    const stats = await getDashboardStats(USER_ID);

    expect(stats.conceptsTotal).toBe(1);
    expect(stats.conceptsMastered).toBe(0);
  });

  // Streak gộp từ cả hai nguồn hoạt động, bất kể status — mở phiên là "có hoạt động", không cần
  // hoàn thành. Đây là quyết định đã chốt khác với weeklyStudyMinutes (chỉ tính completed).
  it('combines InterviewSession and FocusSession activity regardless of status for the streak', async () => {
    const today = new Date();
    mockedPrisma.interviewSession.findMany.mockResolvedValue([{ startedAt: today }]);
    mockedPrisma.focusSession.findMany.mockResolvedValue([{ startedAt: today }]);

    const stats = await getDashboardStats(USER_ID);

    expect(stats.studyStreakDays).toBe(1);
    expect(mockedPrisma.focusSession.findMany).toHaveBeenCalledWith({
      where: { userId: USER_ID, startedAt: { gte: expect.any(Date) } },
      select: { startedAt: true },
    });
  });

  // Streak chỉ cần các ngày liên tiếp gần nhất — không nên quét toàn bộ lịch sử phiên (cost
  // tăng tuyến tính theo tuổi tài khoản). Cả hai nguồn hoạt động phải cùng bị bound.
  it('bounds both activity queries to the streak lookback window instead of scanning full history', async () => {
    await getDashboardStats(USER_ID);

    expect(mockedPrisma.interviewSession.findMany).toHaveBeenCalledWith({
      where: { userId: USER_ID, startedAt: { gte: expect.any(Date) } },
      select: { startedAt: true },
    });
    expect(mockedPrisma.focusSession.findMany).toHaveBeenCalledWith({
      where: { userId: USER_ID, startedAt: { gte: expect.any(Date) } },
      select: { startedAt: true },
    });
  });
});
