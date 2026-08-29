import { Prisma } from '@prisma/client';
import {
  createFocusSession,
  endFocusSession,
  listFocusSessions,
} from '../services/focus-session.service';
import prisma from '../config/prisma';
import { AppError } from '../middleware/errorHandler';
import {
  PLAN_ARCHIVED_MESSAGE,
  PLAN_AWAITING_CONFIRMATION_MESSAGE,
} from '../services/scheduling.service';

/**
 * Simule lỗi vi phạm `focus_sessions_one_running_per_user` (migration 20260821181401). `meta`
 * đúng hình dạng **đo LIVE** qua driver adapter Prisma 7 thật (script tạm, DB Postgres cô lập,
 * 29/08) — không phải đoán theo docs Prisma <7 (`meta.target`, field không tồn tại ở đây):
 * `{ driverAdapterError: { cause: { originalMessage: 'duplicate key value violates unique
 * constraint "..."', constraint: { fields: [...] } } } }`.
 */
function uniqueViolationError(
  constraintName = 'focus_sessions_one_running_per_user'
): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: {
      modelName: 'FocusSession',
      driverAdapterError: {
        name: 'DriverAdapterError',
        cause: {
          originalCode: '23505',
          originalMessage: `duplicate key value violates unique constraint "${constraintName}"`,
          kind: 'UniqueConstraintViolation',
          constraint: { fields: ['user_id'] },
        },
      },
    },
  });
}

jest.mock('../config/prisma', () => ({
  __esModule: true,
  default: {
    studyPlan: { findUnique: jest.fn() },
    concept: { count: jest.fn(), findMany: jest.fn() },
    focusSession: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
    $executeRaw: jest.fn(),
  },
}));

const mockedPrisma = prisma as unknown as {
  studyPlan: { findUnique: jest.Mock };
  concept: { count: jest.Mock; findMany: jest.Mock };
  focusSession: {
    create: jest.Mock;
    findUnique: jest.Mock;
    findFirst: jest.Mock;
    update: jest.Mock;
    findMany: jest.Mock;
  };
  $executeRaw: jest.Mock;
};

const USER_ID = '11111111-1111-1111-1111-111111111111';
const PLAN_ID = '22222222-2222-2222-2222-222222222222';
const CONCEPT_ID = '33333333-3333-3333-3333-333333333333';
const SESSION_ID = '44444444-4444-4444-4444-444444444444';

beforeEach(() => {
  jest.clearAllMocks();
  mockedPrisma.$executeRaw.mockResolvedValue(0);
  mockedPrisma.focusSession.findFirst.mockResolvedValue(null);
});

describe('createFocusSession', () => {
  it('throws 404 when planId does not belong to the user', async () => {
    mockedPrisma.studyPlan.findUnique.mockResolvedValue({ id: PLAN_ID, userId: 'someone-else' });

    const error = await createFocusSession(USER_ID, {
      planId: PLAN_ID,
      conceptIds: [CONCEPT_ID],
    }).catch((e) => e);

    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
    expect(mockedPrisma.focusSession.create).not.toHaveBeenCalled();
  });

  it('throws 409 PLAN_NOT_ACTIVE when the plan has been archived', async () => {
    mockedPrisma.studyPlan.findUnique.mockResolvedValue({
      id: PLAN_ID,
      userId: USER_ID,
      status: 'archived',
    });

    const error = await createFocusSession(USER_ID, {
      planId: PLAN_ID,
      conceptIds: [CONCEPT_ID],
    }).catch((e) => e);

    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({
      statusCode: 409,
      code: 'PLAN_NOT_ACTIVE',
      message: PLAN_ARCHIVED_MESSAGE,
    });
    expect(mockedPrisma.concept.count).not.toHaveBeenCalled();
    expect(mockedPrisma.focusSession.create).not.toHaveBeenCalled();
  });

  // `draft` is blocked too, not just `archived` (review #350) — reanalyzePlan can put a plan
  // back into `draft` while it's already in use, and the two states carry different, both
  // actionable, sentences (buildInactivePlanMessage), so both need their own coverage.
  it('throws 409 PLAN_NOT_ACTIVE with the awaiting-confirmation message when the plan is still draft', async () => {
    mockedPrisma.studyPlan.findUnique.mockResolvedValue({
      id: PLAN_ID,
      userId: USER_ID,
      status: 'draft',
    });

    const error = await createFocusSession(USER_ID, {
      planId: PLAN_ID,
      conceptIds: [CONCEPT_ID],
    }).catch((e) => e);

    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({
      statusCode: 409,
      code: 'PLAN_NOT_ACTIVE',
      message: PLAN_AWAITING_CONFIRMATION_MESSAGE,
    });
    expect(mockedPrisma.focusSession.create).not.toHaveBeenCalled();
  });

  it('throws 400 INVALID_CONCEPT_IDS when a concept does not belong to the plan', async () => {
    mockedPrisma.studyPlan.findUnique.mockResolvedValue({
      id: PLAN_ID,
      userId: USER_ID,
      status: 'active',
    });
    mockedPrisma.concept.count.mockResolvedValue(0);

    const error = await createFocusSession(USER_ID, {
      planId: PLAN_ID,
      conceptIds: [CONCEPT_ID],
    }).catch((e) => e);

    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ statusCode: 400, code: 'INVALID_CONCEPT_IDS' });
    expect(mockedPrisma.focusSession.create).not.toHaveBeenCalled();
  });

  // conceptIds trùng lặp trong body không được tạo ra thêm hàng nào trong DB — count không
  // bao giờ khớp input.length nếu không dedupe trước khi đối chiếu (xem comment trong service).
  it('dedupes conceptIds before comparing against the matched count', async () => {
    mockedPrisma.studyPlan.findUnique.mockResolvedValue({
      id: PLAN_ID,
      userId: USER_ID,
      status: 'active',
    });
    mockedPrisma.concept.count.mockResolvedValue(1);
    mockedPrisma.focusSession.create.mockResolvedValue({
      id: SESSION_ID,
      planId: PLAN_ID,
      conceptIds: [CONCEPT_ID],
      status: 'running',
      strictMode: false,
      startedAt: new Date(),
    });

    const result = await createFocusSession(USER_ID, {
      planId: PLAN_ID,
      conceptIds: [CONCEPT_ID, CONCEPT_ID],
    });

    expect(mockedPrisma.concept.count).toHaveBeenCalledWith({
      where: { planId: PLAN_ID, id: { in: [CONCEPT_ID] } },
    });
    expect(mockedPrisma.focusSession.create).toHaveBeenCalledWith({
      data: { userId: USER_ID, planId: PLAN_ID, conceptIds: [CONCEPT_ID], strictMode: false },
    });
    expect(result.conceptIds).toEqual([CONCEPT_ID]);
  });

  it('skips the plan/concept ownership check entirely when planId is omitted', async () => {
    mockedPrisma.focusSession.create.mockResolvedValue({
      id: SESSION_ID,
      planId: null,
      conceptIds: [CONCEPT_ID],
      status: 'running',
      strictMode: true,
      startedAt: new Date(),
    });

    const result = await createFocusSession(USER_ID, {
      conceptIds: [CONCEPT_ID],
      strictMode: true,
    });

    expect(mockedPrisma.studyPlan.findUnique).not.toHaveBeenCalled();
    expect(mockedPrisma.concept.count).not.toHaveBeenCalled();
    expect(result.created).toBe(true);
  });

  // Issue #328: N request song song (double-click, hai tab) không còn tạo ra N phiên running.
  // Chốt app-level — tìm phiên running trước khi tạo; có thì so khớp plan+conceptIds với
  // request vừa gửi trước khi quyết định resume hay từ chối.
  describe('chống trùng phiên running (#328)', () => {
    const otherPlanId = '66666666-6666-6666-6666-666666666666';
    const otherConceptId = '77777777-7777-7777-7777-777777777777';

    function existingRunningSession(overrides: Partial<Record<string, unknown>> = {}) {
      return {
        id: SESSION_ID,
        userId: USER_ID,
        planId: otherPlanId,
        conceptIds: [otherConceptId],
        status: 'running',
        strictMode: false,
        startedAt: new Date(Date.now() - 5 * 60 * 1000),
        ...overrides,
      };
    }

    it('trả lại phiên running đang có, không tạo hàng mới, khi request khớp đúng planId+conceptIds', async () => {
      mockedPrisma.studyPlan.findUnique.mockResolvedValue({
        id: otherPlanId,
        userId: USER_ID,
        status: 'active',
      });
      mockedPrisma.concept.count.mockResolvedValue(1);
      mockedPrisma.focusSession.findFirst.mockResolvedValue(existingRunningSession());

      const result = await createFocusSession(USER_ID, {
        planId: otherPlanId,
        conceptIds: [otherConceptId],
      });

      expect(mockedPrisma.focusSession.findFirst).toHaveBeenCalledWith({
        where: { userId: USER_ID, status: 'running' },
        orderBy: { startedAt: 'desc' },
      });
      expect(mockedPrisma.focusSession.create).not.toHaveBeenCalled();
      expect(result).toMatchObject({ created: false, id: SESSION_ID, planId: otherPlanId });
    });

    // Phiên tự do (không planId) khớp đúng một phiên running cũng KHÔNG có planId + cùng
    // conceptIds vẫn được coi là cùng một request — resume, không 409.
    it('trả lại phiên running đang có khi cả hai đều là phiên tự do cùng conceptIds', async () => {
      mockedPrisma.focusSession.findFirst.mockResolvedValue(
        existingRunningSession({ planId: null, conceptIds: [otherConceptId] })
      );

      const result = await createFocusSession(USER_ID, { conceptIds: [otherConceptId] });

      expect(mockedPrisma.focusSession.create).not.toHaveBeenCalled();
      expect(result).toMatchObject({ created: false, id: SESSION_ID, planId: null });
    });

    // Review #371 (blocker): bản đầu trả nguyên phiên cũ trong MỌI trường hợp, kể cả khi
    // request mới nhắm plan/concept khác — client duy nhất (FocusPage.tsx) không đọc lại
    // `created`/so khớp, nên hiện UI của concept vừa bấm trong khi đồng hồ & lịch sử ghi vào
    // concept của phiên cũ, âm thầm sai lệch dữ liệu học tập. Phải từ chối tường minh (409).
    it('từ chối 409 SESSION_ALREADY_RUNNING khi phiên đang chạy ở plan/concept khác', async () => {
      mockedPrisma.studyPlan.findUnique.mockResolvedValue({
        id: PLAN_ID,
        userId: USER_ID,
        status: 'active',
      });
      mockedPrisma.concept.count.mockResolvedValue(1);
      mockedPrisma.focusSession.findFirst.mockResolvedValue(existingRunningSession());

      const error = await createFocusSession(USER_ID, {
        planId: PLAN_ID,
        conceptIds: [CONCEPT_ID],
      }).catch((e) => e);

      expect(error).toBeInstanceOf(AppError);
      expect(error).toMatchObject({ statusCode: 409, code: 'SESSION_ALREADY_RUNNING' });
      expect(mockedPrisma.focusSession.create).not.toHaveBeenCalled();
    });

    // Ca phụ cùng họ với blocker (review #371, should-fix): request phiên tự do (không
    // planId) không được phép "mượn" một phiên running đang gắn plan — trước đây lọt qua vì
    // check cũ không so planId.
    it('từ chối 409 khi request phiên tự do (không planId) nhưng phiên đang chạy có planId', async () => {
      mockedPrisma.focusSession.findFirst.mockResolvedValue(existingRunningSession());

      const error = await createFocusSession(USER_ID, {
        conceptIds: [otherConceptId],
      }).catch((e) => e);

      expect(error).toBeInstanceOf(AppError);
      expect(error).toMatchObject({ statusCode: 409, code: 'SESSION_ALREADY_RUNNING' });
      expect(mockedPrisma.focusSession.create).not.toHaveBeenCalled();
    });

    it('reap phiên bỏ dở trước khi kiểm phiên running, để không khoá vĩnh viễn việc tạo mới', async () => {
      mockedPrisma.focusSession.create.mockResolvedValue({
        id: SESSION_ID,
        planId: null,
        conceptIds: [],
        status: 'running',
        strictMode: false,
        startedAt: new Date(),
      });

      await createFocusSession(USER_ID, { conceptIds: [] });

      expect(mockedPrisma.$executeRaw).toHaveBeenCalled();
      expect(mockedPrisma.focusSession.findFirst).toHaveBeenCalled();
    });

    it('vẫn từ chối 404/409/400 trước khi chạm tới bước kiểm phiên running', async () => {
      mockedPrisma.studyPlan.findUnique.mockResolvedValue({
        id: PLAN_ID,
        userId: 'someone-else',
      });

      await createFocusSession(USER_ID, { planId: PLAN_ID, conceptIds: [CONCEPT_ID] }).catch(
        (e) => e
      );

      expect(mockedPrisma.focusSession.findFirst).not.toHaveBeenCalled();
      expect(mockedPrisma.$executeRaw).not.toHaveBeenCalled();
    });
  });

  // Issue #328 (còn lại sau #371): N request THỰC SỰ đồng thời cùng vượt qua findFirst rồi
  // cùng INSERT — partial unique index `focus_sessions_one_running_per_user` chặn ở DB thay
  // vì app-level, request thua cuộc ăn P2002 thay vì tạo thêm hàng running.
  describe('chặn race thực sự đồng thời bằng partial unique index (#328)', () => {
    it('P2002 khi khớp đúng plan+conceptIds với phiên vừa thắng race: resume, không tạo hàng mới', async () => {
      mockedPrisma.studyPlan.findUnique.mockResolvedValue({
        id: PLAN_ID,
        userId: USER_ID,
        status: 'active',
      });
      mockedPrisma.concept.count.mockResolvedValue(1);
      mockedPrisma.focusSession.findFirst
        .mockResolvedValueOnce(null) // pre-check: chưa thấy phiên nào
        .mockResolvedValueOnce({
          // refetch sau P2002: phiên do request khác thắng race tạo ra
          id: SESSION_ID,
          userId: USER_ID,
          planId: PLAN_ID,
          conceptIds: [CONCEPT_ID],
          status: 'running',
          strictMode: false,
          startedAt: new Date(),
        });
      mockedPrisma.focusSession.create.mockRejectedValue(uniqueViolationError());

      const result = await createFocusSession(USER_ID, {
        planId: PLAN_ID,
        conceptIds: [CONCEPT_ID],
      });

      expect(mockedPrisma.focusSession.findFirst).toHaveBeenCalledTimes(2);
      expect(result).toMatchObject({ created: false, id: SESSION_ID, planId: PLAN_ID });
    });

    it('P2002 khi phiên thắng race ở plan/concept khác: 409 SESSION_ALREADY_RUNNING', async () => {
      const otherPlanId = '88888888-8888-8888-8888-888888888888';
      mockedPrisma.studyPlan.findUnique.mockResolvedValue({
        id: PLAN_ID,
        userId: USER_ID,
        status: 'active',
      });
      mockedPrisma.concept.count.mockResolvedValue(1);
      mockedPrisma.focusSession.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
        id: SESSION_ID,
        userId: USER_ID,
        planId: otherPlanId,
        conceptIds: [CONCEPT_ID],
        status: 'running',
        strictMode: false,
        startedAt: new Date(),
      });
      mockedPrisma.focusSession.create.mockRejectedValue(uniqueViolationError());

      const error = await createFocusSession(USER_ID, {
        planId: PLAN_ID,
        conceptIds: [CONCEPT_ID],
      }).catch((e) => e);

      expect(error).toBeInstanceOf(AppError);
      expect(error).toMatchObject({ statusCode: 409, code: 'SESSION_ALREADY_RUNNING' });
    });

    // Phiên thắng race đã kết thúc/bị reap ngay trước khi refetch chạy — race cực hiếm,
    // không nuốt lỗi P2002 gốc bằng một AppError sai lệch.
    it('ném lại lỗi P2002 gốc nếu không refetch được phiên nào sau race', async () => {
      mockedPrisma.focusSession.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
      const raceError = uniqueViolationError();
      mockedPrisma.focusSession.create.mockRejectedValue(raceError);

      const error = await createFocusSession(USER_ID, { conceptIds: [CONCEPT_ID] }).catch((e) => e);

      expect(error).toBe(raceError);
    });

    it('ném lại lỗi gốc khi create thất bại vì lý do khác P2002', async () => {
      mockedPrisma.focusSession.findFirst.mockResolvedValueOnce(null);
      const otherError = new Error('connection reset');
      mockedPrisma.focusSession.create.mockRejectedValue(otherError);

      const error = await createFocusSession(USER_ID, { conceptIds: [CONCEPT_ID] }).catch((e) => e);

      expect(error).toBe(otherError);
    });

    // Review #421 (Quân) — `code === 'P2002'` một mình không phân biệt được constraint nào vi
    // phạm. Một `@@unique` khác trên `focus_sessions` (giả định, chưa tồn tại hôm nay) không được
    // đi qua nhánh #328 và trả về một 409 "bạn đã có phiên đang chạy" sai lệch.
    it('ném lại lỗi P2002 gốc khi vi phạm một unique constraint KHÁC trên focus_sessions', async () => {
      mockedPrisma.focusSession.findFirst.mockResolvedValueOnce(null);
      const otherConstraintError = uniqueViolationError('some_other_future_constraint');
      mockedPrisma.focusSession.create.mockRejectedValue(otherConstraintError);

      const error = await createFocusSession(USER_ID, { conceptIds: [CONCEPT_ID] }).catch((e) => e);

      expect(error).toBe(otherConstraintError);
      expect(mockedPrisma.focusSession.findFirst).toHaveBeenCalledTimes(1);
    });

    // Review #421 round 2 (Quân) — nhánh fallback (`typeof originalMessage !== 'string'`) không
    // có test nào giữ trước đây; đảo `return true` → `return false` vẫn xanh toàn bộ suite.
    // Khoá cả hành vi (giữ nguyên #328 khi không đọc được hình dạng lỗi) lẫn tiếng kêu khi guard
    // rơi vào nhánh không xác minh được.
    it('P2002 không đọc được hình dạng lỗi driver (meta thiếu/lạ): vẫn coi là race #328 và cảnh báo', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
      mockedPrisma.studyPlan.findUnique.mockResolvedValue({
        id: PLAN_ID,
        userId: USER_ID,
        status: 'active',
      });
      mockedPrisma.concept.count.mockResolvedValue(1);
      mockedPrisma.focusSession.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
        id: SESSION_ID,
        userId: USER_ID,
        planId: PLAN_ID,
        conceptIds: [CONCEPT_ID],
        status: 'running',
        strictMode: false,
        startedAt: new Date(),
      });
      // Không có `meta` — hình dạng driver adapter đã đổi, hoặc một Prisma version khác.
      const shapelessError = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      });
      mockedPrisma.focusSession.create.mockRejectedValue(shapelessError);

      const result = await createFocusSession(USER_ID, {
        planId: PLAN_ID,
        conceptIds: [CONCEPT_ID],
      });

      expect(result).toMatchObject({ created: false, id: SESSION_ID });
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('P2002'));

      warnSpy.mockRestore();
    });
  });
});

describe('endFocusSession', () => {
  function runningSession(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      id: SESSION_ID,
      userId: USER_ID,
      planId: null,
      conceptIds: [],
      status: 'running',
      durationMinutes: 0,
      focusedSeconds: 0,
      awayCount: 0,
      pomodorosCompleted: 0,
      strictMode: false,
      startedAt: new Date(Date.now() - 5 * 60 * 1000),
      endedAt: null,
      ...overrides,
    };
  }

  it('throws 404 when the session does not belong to the user', async () => {
    mockedPrisma.focusSession.findUnique.mockResolvedValue(
      runningSession({ userId: 'someone-else' })
    );

    const error = await endFocusSession(USER_ID, SESSION_ID, {
      status: 'completed',
      focusedSeconds: 60,
    }).catch((e) => e);

    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
  });

  it('throws 400 when focusedSeconds exceeds the elapsed session time', async () => {
    mockedPrisma.focusSession.findUnique.mockResolvedValue(
      runningSession({ startedAt: new Date(Date.now() - 10 * 1000) })
    );

    const error = await endFocusSession(USER_ID, SESSION_ID, {
      status: 'completed',
      focusedSeconds: 3600,
    }).catch((e) => e);

    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ statusCode: 400, code: 'FOCUSED_SECONDS_EXCEEDS_ELAPSED' });
    expect(mockedPrisma.focusSession.update).not.toHaveBeenCalled();
  });

  it('forces durationMinutes to 0 when cancelling, even with a non-zero focusedSeconds', async () => {
    mockedPrisma.focusSession.findUnique.mockResolvedValue(runningSession());
    mockedPrisma.focusSession.update.mockResolvedValue(
      runningSession({
        status: 'cancelled',
        durationMinutes: 0,
        focusedSeconds: 120,
        endedAt: new Date(),
      })
    );

    await endFocusSession(USER_ID, SESSION_ID, { status: 'cancelled', focusedSeconds: 120 });

    expect(mockedPrisma.focusSession.update).toHaveBeenCalledWith({
      where: { id: SESSION_ID },
      data: {
        status: 'cancelled',
        endedAt: expect.any(Date),
        durationMinutes: 0,
        focusedSeconds: 120,
        awayCount: 0,
        pomodorosCompleted: 0,
      },
    });
  });

  it('derives durationMinutes = floor(focusedSeconds / 60) when completing', async () => {
    mockedPrisma.focusSession.findUnique.mockResolvedValue(
      runningSession({ startedAt: new Date(Date.now() - 60 * 60 * 1000) })
    );
    mockedPrisma.focusSession.update.mockResolvedValue(
      runningSession({
        status: 'completed',
        durationMinutes: 47,
        focusedSeconds: 2832,
        endedAt: new Date(),
      })
    );

    await endFocusSession(USER_ID, SESSION_ID, { status: 'completed', focusedSeconds: 2832 });

    expect(mockedPrisma.focusSession.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ durationMinutes: 47 }) })
    );
  });

  // Lỗ hổng đã vá: một phiên running quá 8 giờ không có endedAt phải bị lazy-reap thành
  // cancelled TRƯỚC khi PATCH được xử lý — không được "hoàn thành" ngược lại với giờ ảo.
  it('rejects a stale (already-reaped) session as ALREADY_ENDED instead of completing it', async () => {
    mockedPrisma.focusSession.findUnique.mockResolvedValue(
      runningSession({
        status: 'cancelled',
        durationMinutes: 0,
        startedAt: new Date(Date.now() - 20 * 60 * 60 * 1000),
        endedAt: new Date(),
      })
    );

    const error = await endFocusSession(USER_ID, SESSION_ID, {
      status: 'completed',
      focusedSeconds: 28800,
    }).catch((e) => e);

    expect(mockedPrisma.$executeRaw).toHaveBeenCalled();
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ statusCode: 409, code: 'ALREADY_ENDED' });
    expect(mockedPrisma.focusSession.update).not.toHaveBeenCalled();
  });
});

describe('listFocusSessions', () => {
  const OTHER_CONCEPT_ID = '55555555-5555-5555-5555-555555555555';

  function listedSession(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      id: SESSION_ID,
      userId: USER_ID,
      planId: PLAN_ID,
      conceptIds: [CONCEPT_ID, OTHER_CONCEPT_ID],
      status: 'completed',
      durationMinutes: 47,
      focusedSeconds: 2832,
      awayCount: 2,
      pomodorosCompleted: 2,
      strictMode: true,
      startedAt: new Date('2026-08-05T08:00:00.000Z'),
      endedAt: new Date('2026-08-05T08:47:12.000Z'),
      ...overrides,
    };
  }

  it('reaps stale sessions before reading the list back', async () => {
    mockedPrisma.focusSession.findMany.mockResolvedValue([]);

    await listFocusSessions(USER_ID, {});

    expect(mockedPrisma.$executeRaw).toHaveBeenCalled();
    expect(mockedPrisma.focusSession.findMany).toHaveBeenCalledWith({
      where: { userId: USER_ID },
      orderBy: { startedAt: 'desc' },
      take: 20,
      skip: 0,
    });
  });

  // Lỗ hổng đã vá: conceptIds của một phiên tự do (không planId) không được validate lúc tạo,
  // nên resolve tên khái niệm PHẢI lọc theo plan.userId — nếu không, id khái niệm của user khác
  // nhét vào body sẽ trả về tên thật của họ (rò rỉ dữ liệu chéo user).
  it('scopes the concept-name lookup to the caller (plan.userId), not just the raw ids', async () => {
    mockedPrisma.focusSession.findMany.mockResolvedValue([listedSession()]);
    mockedPrisma.concept.findMany.mockResolvedValue([{ id: CONCEPT_ID, name: 'Ngăn xếp (Stack)' }]);

    const result = await listFocusSessions(USER_ID, {});

    expect(mockedPrisma.concept.findMany).toHaveBeenCalledWith({
      where: { id: { in: [CONCEPT_ID, OTHER_CONCEPT_ID] }, plan: { userId: USER_ID } },
      select: { id: true, name: true },
    });
    expect(result[0]?.concepts).toEqual([
      { id: CONCEPT_ID, name: 'Ngăn xếp (Stack)' },
      { id: OTHER_CONCEPT_ID, name: 'Không xác định' },
    ]);
  });

  it('skips the concept lookup entirely when no session references any concept', async () => {
    mockedPrisma.focusSession.findMany.mockResolvedValue([listedSession({ conceptIds: [] })]);

    await listFocusSessions(USER_ID, {});

    expect(mockedPrisma.concept.findMany).not.toHaveBeenCalled();
  });
});
