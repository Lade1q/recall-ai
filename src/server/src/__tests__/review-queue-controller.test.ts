import { Request, Response } from 'express';
import {
  getReviewQueueController,
  getTodayReviewQueueController,
  updateReviewQueueItemController,
} from '../controllers/review-queue.controller';
import {
  getReviewQueueForPlan,
  getTodayReviewQueue,
  setReviewQueueItemScheduledFor,
  snoozeReviewQueueItem,
  updateReviewQueueItemStatus,
} from '../services/scheduling.service';
import { AppError } from '../middleware/errorHandler';
import { ZodError } from 'zod';

// Factory mock — no Prisma client constructed, passes without DATABASE_URL (same pattern as
// retry-controller.test.ts).
jest.mock('../services/scheduling.service', () => ({
  __esModule: true,
  getReviewQueueForPlan: jest.fn(),
  getTodayReviewQueue: jest.fn(),
  updateReviewQueueItemStatus: jest.fn(),
  snoozeReviewQueueItem: jest.fn(),
  setReviewQueueItemScheduledFor: jest.fn(),
}));

const mockedGetQueue = getReviewQueueForPlan as jest.Mock;
const mockedGetToday = getTodayReviewQueue as jest.Mock;
const mockedUpdateItem = updateReviewQueueItemStatus as jest.Mock;
const mockedSnoozeItem = snoozeReviewQueueItem as jest.Mock;
const mockedSetScheduledFor = setReviewQueueItemScheduledFor as jest.Mock;

const USER_ID = 'user-owner-uuid';
const PLAN_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
const ITEM_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

function mockRes(): Response {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
  } as unknown as Response;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getReviewQueueController', () => {
  it('throws 401 UNAUTHORIZED when req.userId is missing', async () => {
    const req = { query: { planId: PLAN_ID } } as unknown as Request;
    const res = mockRes();

    const error = await getReviewQueueController(req, res).catch((e) => e);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });
    expect(mockedGetQueue).not.toHaveBeenCalled();
  });

  it('throws a ZodError (400 VALIDATION_ERROR downstream) when planId is missing', async () => {
    const req = { userId: USER_ID, query: {} } as unknown as Request;
    const res = mockRes();

    const error = await getReviewQueueController(req, res).catch((e) => e);
    expect(error).toBeInstanceOf(ZodError);
    expect(mockedGetQueue).not.toHaveBeenCalled();
  });

  it('throws a ZodError when planId is not a UUID', async () => {
    const req = { userId: USER_ID, query: { planId: 'not-a-uuid' } } as unknown as Request;
    const res = mockRes();

    const error = await getReviewQueueController(req, res).catch((e) => e);
    expect(error).toBeInstanceOf(ZodError);
  });

  it('returns 200 with the { items, message } envelope on success', async () => {
    const queueResponse = { items: [{ conceptId: 'c1', priority: 0.5 }], message: null };
    mockedGetQueue.mockResolvedValue(queueResponse);
    const req = { userId: USER_ID, query: { planId: PLAN_ID, limit: '3' } } as unknown as Request;
    const res = mockRes();

    await getReviewQueueController(req, res);

    expect(mockedGetQueue).toHaveBeenCalledWith(PLAN_ID, USER_ID, 3, { includeSkipped: false });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: queueResponse });
  });

  // #224: the "Đã gỡ khỏi lịch" group is opt-in — I6.3's auto-pick has no use for it.
  it('passes includeSkipped through when the client asks for the removed group', async () => {
    mockedGetQueue.mockResolvedValue({ items: [], message: null, skippedItems: [] });
    const req = {
      userId: USER_ID,
      query: { planId: PLAN_ID, includeSkipped: 'true' },
    } as unknown as Request;
    const res = mockRes();

    await getReviewQueueController(req, res);

    expect(mockedGetQueue).toHaveBeenCalledWith(PLAN_ID, USER_ID, undefined, {
      includeSkipped: true,
    });
  });

  it('rejects an includeSkipped that is neither "true" nor "false" rather than guessing', async () => {
    const req = {
      userId: USER_ID,
      query: { planId: PLAN_ID, includeSkipped: 'yes' },
    } as unknown as Request;
    const res = mockRes();

    const error = await getReviewQueueController(req, res).catch((e) => e);
    expect(error).toBeInstanceOf(ZodError);
    expect(mockedGetQueue).not.toHaveBeenCalled();
  });

  it('propagates a 404 from the service (plan not found / not owned)', async () => {
    const notFound = new AppError('Study plan not found', 404, 'NOT_FOUND');
    mockedGetQueue.mockRejectedValue(notFound);
    const req = { userId: USER_ID, query: { planId: PLAN_ID } } as unknown as Request;
    const res = mockRes();

    const error = await getReviewQueueController(req, res).catch((e) => e);
    expect(error).toBe(notFound);
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe('getTodayReviewQueueController', () => {
  it('throws 401 UNAUTHORIZED when req.userId is missing', async () => {
    const req = { query: {} } as unknown as Request;
    const res = mockRes();

    const error = await getTodayReviewQueueController(req, res).catch((e) => e);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });
    expect(mockedGetToday).not.toHaveBeenCalled();
  });

  it('calls the service with the default limit when none is given', async () => {
    mockedGetToday.mockResolvedValue({ items: [], message: null });
    const req = { userId: USER_ID, query: {} } as unknown as Request;
    const res = mockRes();

    await getTodayReviewQueueController(req, res);

    expect(mockedGetToday).toHaveBeenCalledWith(USER_ID, undefined);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 200 + empty items + message for a user with no active plan', async () => {
    const emptyResponse = { items: [], message: 'Bạn chưa có kế hoạch ôn tập nào đang hoạt động.' };
    mockedGetToday.mockResolvedValue(emptyResponse);
    const req = { userId: USER_ID, query: {} } as unknown as Request;
    const res = mockRes();

    await getTodayReviewQueueController(req, res);

    expect(res.json).toHaveBeenCalledWith({ success: true, data: emptyResponse });
  });
});

describe('updateReviewQueueItemController', () => {
  it('throws 401 UNAUTHORIZED when req.userId is missing', async () => {
    const req = { params: { itemId: ITEM_ID }, body: { status: 'skipped' } } as unknown as Request;
    const res = mockRes();

    const error = await updateReviewQueueItemController(req, res).catch((e) => e);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });
    expect(mockedUpdateItem).not.toHaveBeenCalled();
  });

  it('throws a ZodError (400 VALIDATION_ERROR) when itemId param is missing', async () => {
    const req = { userId: USER_ID, params: {}, body: { status: 'skipped' } } as unknown as Request;
    const res = mockRes();

    const error = await updateReviewQueueItemController(req, res).catch((e) => e);
    expect(error).toBeInstanceOf(ZodError);
    expect(mockedUpdateItem).not.toHaveBeenCalled();
  });

  // itemId là @db.Uuid — không phải UUID phải bị chặn ở controller, tránh P2023→500 (#165/#191).
  it('throws a ZodError when itemId is not a valid UUID', async () => {
    const req = {
      userId: USER_ID,
      params: { itemId: 'not-a-uuid' },
      body: { status: 'skipped' },
    } as unknown as Request;
    const res = mockRes();

    const error = await updateReviewQueueItemController(req, res).catch((e) => e);
    expect(error).toBeInstanceOf(ZodError);
    expect(mockedUpdateItem).not.toHaveBeenCalled();
  });

  it('throws a ZodError when status is neither skipped nor pending', async () => {
    const req = {
      userId: USER_ID,
      params: { itemId: ITEM_ID },
      body: { status: 'done' },
    } as unknown as Request;
    const res = mockRes();

    const error = await updateReviewQueueItemController(req, res).catch((e) => e);
    expect(error).toBeInstanceOf(ZodError);
    expect(mockedUpdateItem).not.toHaveBeenCalled();
  });

  // #224: 'accepted' là di tích của mô hình cũ (cổng "Đồng ý ôn lại" đã bỏ). Gửi lên phải 400
  // hẳn, không được im lặng nhận rồi ghi một giá trị không ai đọc nữa.
  it("rejects the deprecated 'accepted' instead of silently accepting it", async () => {
    const req = {
      userId: USER_ID,
      params: { itemId: ITEM_ID },
      body: { status: 'accepted' },
    } as unknown as Request;
    const res = mockRes();

    const error = await updateReviewQueueItemController(req, res).catch((e) => e);
    expect(error).toBeInstanceOf(ZodError);
    expect(mockedUpdateItem).not.toHaveBeenCalled();
  });

  // Chiều ngược lại của cùng một thao tác — không có nó thì "gỡ" là cửa một chiều.
  it("updates status back to 'pending' when the student puts an item back and returns 200", async () => {
    const updated = { id: ITEM_ID, conceptId: 'c1', planId: PLAN_ID, status: 'pending' as const };
    mockedUpdateItem.mockResolvedValue(updated);
    const req = {
      userId: USER_ID,
      params: { itemId: ITEM_ID },
      body: { status: 'pending' },
    } as unknown as Request;
    const res = mockRes();

    await updateReviewQueueItemController(req, res);

    expect(mockedUpdateItem).toHaveBeenCalledWith(ITEM_ID, USER_ID, 'pending');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { item: updated } });
  });

  it("updates status to 'skipped' without deleting the row and returns 200", async () => {
    const updated = { id: ITEM_ID, conceptId: 'c1', planId: PLAN_ID, status: 'skipped' as const };
    mockedUpdateItem.mockResolvedValue(updated);
    const req = {
      userId: USER_ID,
      params: { itemId: ITEM_ID },
      body: { status: 'skipped' },
    } as unknown as Request;
    const res = mockRes();

    await updateReviewQueueItemController(req, res);

    expect(mockedUpdateItem).toHaveBeenCalledWith(ITEM_ID, USER_ID, 'skipped');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { item: updated } });
  });

  it('propagates a 404 from the service when the item does not belong to the user', async () => {
    const notFound = new AppError('Review queue item not found', 404, 'NOT_FOUND');
    mockedUpdateItem.mockRejectedValue(notFound);
    const req = {
      userId: USER_ID,
      params: { itemId: ITEM_ID },
      body: { status: 'skipped' },
    } as unknown as Request;
    const res = mockRes();

    const error = await updateReviewQueueItemController(req, res).catch((e) => e);
    expect(error).toBe(notFound);
    expect(res.status).not.toHaveBeenCalled();
  });
});

// DB-09 / #233 — nhánh thứ hai của cùng endpoint. Điều phải giữ được: `{ status }` (nhánh cũ,
// #224/#225 đang gửi live) và `{ snooze }` không được lẫn vào nhau ở bất kỳ chiều nào.
describe('updateReviewQueueItemController — snooze branch (#233)', () => {
  const SNOOZED = {
    id: ITEM_ID,
    conceptId: 'c1',
    planId: PLAN_ID,
    status: 'pending' as const,
    scheduledFor: new Date('2026-08-05T17:00:00.000Z'),
  };

  it('routes { snooze: true } to the snooze service and returns 200', async () => {
    mockedSnoozeItem.mockResolvedValue(SNOOZED);
    const req = {
      userId: USER_ID,
      params: { itemId: ITEM_ID },
      body: { snooze: true },
    } as unknown as Request;
    const res = mockRes();

    await updateReviewQueueItemController(req, res);

    expect(mockedSnoozeItem).toHaveBeenCalledWith(ITEM_ID, USER_ID, expect.any(Date));
    expect(mockedUpdateItem).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { item: SNOOZED } });
  });

  it('leaves the status branch untouched — { status } never reaches the snooze service', async () => {
    mockedUpdateItem.mockResolvedValue({
      id: ITEM_ID,
      conceptId: 'c1',
      planId: PLAN_ID,
      status: 'skipped',
    });
    const req = {
      userId: USER_ID,
      params: { itemId: ITEM_ID },
      body: { status: 'skipped' },
    } as unknown as Request;
    const res = mockRes();

    await updateReviewQueueItemController(req, res);

    expect(mockedSnoozeItem).not.toHaveBeenCalled();
    expect(mockedUpdateItem).toHaveBeenCalledWith(ITEM_ID, USER_ID, 'skipped');
  });

  // `{ snooze: false }` là một lệnh không có nghĩa. Nhận nó = một no-op 200 mà người gọi tưởng
  // đã hoãn xong — nên schema dùng `z.literal(true)`.
  it('rejects { snooze: false } instead of treating it as a silent no-op', async () => {
    const req = {
      userId: USER_ID,
      params: { itemId: ITEM_ID },
      body: { snooze: false },
    } as unknown as Request;
    const res = mockRes();

    const error = await updateReviewQueueItemController(req, res).catch((e) => e);
    expect(error).toBeInstanceOf(ZodError);
    expect(mockedSnoozeItem).not.toHaveBeenCalled();
    expect(mockedUpdateItem).not.toHaveBeenCalled();
  });

  // `.strict()` ở cả hai nhánh: một body mang cả hai key là hai lệnh mâu thuẫn (giữ trên lịch /
  // gỡ khỏi lịch). Chọn đại một cái nghĩa là một nửa yêu cầu bị nuốt mất mà không ai biết.
  it('rejects a body carrying both status and snooze rather than picking one', async () => {
    const req = {
      userId: USER_ID,
      params: { itemId: ITEM_ID },
      body: { status: 'skipped', snooze: true },
    } as unknown as Request;
    const res = mockRes();

    const error = await updateReviewQueueItemController(req, res).catch((e) => e);
    expect(error).toBeInstanceOf(ZodError);
    expect(mockedSnoozeItem).not.toHaveBeenCalled();
    expect(mockedUpdateItem).not.toHaveBeenCalled();
  });

  // Client KHÔNG sở hữu mốc ngày (C4): biên "đầu ngày mai giờ VN" do server tính. Nhận một ngày
  // từ client là mở lại đúng cửa `now + 24h` mà AC cấm.
  it('rejects a client-supplied snoozedUntil — the day boundary belongs to the server', async () => {
    const req = {
      userId: USER_ID,
      params: { itemId: ITEM_ID },
      body: { snooze: true, snoozedUntil: '2026-08-06T00:00:00.000Z' },
    } as unknown as Request;
    const res = mockRes();

    const error = await updateReviewQueueItemController(req, res).catch((e) => e);
    expect(error).toBeInstanceOf(ZodError);
    expect(mockedSnoozeItem).not.toHaveBeenCalled();
  });

  it('propagates a 404 from the snooze service (item missing or not owned)', async () => {
    const notFound = new AppError('Review queue item not found', 404, 'NOT_FOUND');
    mockedSnoozeItem.mockRejectedValue(notFound);
    const req = {
      userId: USER_ID,
      params: { itemId: ITEM_ID },
      body: { snooze: true },
    } as unknown as Request;
    const res = mockRes();

    const error = await updateReviewQueueItemController(req, res).catch((e) => e);
    expect(error).toBe(notFound);
    expect(res.status).not.toHaveBeenCalled();
  });
});

// #403 — nhánh thứ ba: dời sang ngày người dùng chọn (màn Lịch của epic #400).
describe('updateReviewQueueItemController — scheduledFor branch (#403)', () => {
  const RESCHEDULED = {
    id: ITEM_ID,
    conceptId: 'c1',
    planId: PLAN_ID,
    status: 'pending' as const,
    scheduledFor: new Date('2026-08-25T03:00:00.000Z'),
  };

  it('routes { scheduledFor } to the reschedule service and returns 200', async () => {
    mockedSetScheduledFor.mockResolvedValue(RESCHEDULED);
    const req = {
      userId: USER_ID,
      params: { itemId: ITEM_ID },
      body: { scheduledFor: '2026-08-25' },
    } as unknown as Request;
    const res = mockRes();

    await updateReviewQueueItemController(req, res);

    expect(mockedSetScheduledFor).toHaveBeenCalledWith(
      ITEM_ID,
      USER_ID,
      '2026-08-25',
      expect.any(Date)
    );
    expect(mockedUpdateItem).not.toHaveBeenCalled();
    expect(mockedSnoozeItem).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { item: RESCHEDULED } });
  });

  it('rejects a malformed date instead of forwarding it to the service', async () => {
    const req = {
      userId: USER_ID,
      params: { itemId: ITEM_ID },
      body: { scheduledFor: '25/08/2026' },
    } as unknown as Request;
    const res = mockRes();

    const error = await updateReviewQueueItemController(req, res).catch((e) => e);
    expect(error).toBeInstanceOf(ZodError);
    expect(mockedSetScheduledFor).not.toHaveBeenCalled();
  });

  it('rejects a calendar date that does not exist (2026-02-30)', async () => {
    const req = {
      userId: USER_ID,
      params: { itemId: ITEM_ID },
      body: { scheduledFor: '2026-02-30' },
    } as unknown as Request;
    const res = mockRes();

    const error = await updateReviewQueueItemController(req, res).catch((e) => e);
    expect(error).toBeInstanceOf(ZodError);
    expect(mockedSetScheduledFor).not.toHaveBeenCalled();
  });

  it('rejects a body carrying both status and scheduledFor rather than picking one', async () => {
    const req = {
      userId: USER_ID,
      params: { itemId: ITEM_ID },
      body: { status: 'skipped', scheduledFor: '2026-08-25' },
    } as unknown as Request;
    const res = mockRes();

    const error = await updateReviewQueueItemController(req, res).catch((e) => e);
    expect(error).toBeInstanceOf(ZodError);
    expect(mockedSetScheduledFor).not.toHaveBeenCalled();
    expect(mockedUpdateItem).not.toHaveBeenCalled();
  });

  it('propagates the traceback-guard rejection from the service untouched', async () => {
    const locked = new AppError(
      "Không thể dời ngày: Nền tảng của 'Đệ quy' mà bạn còn yếu, nên lịch của mục này do hệ thống giữ nguyên.",
      409,
      'TRACEBACK_REPRESENTATIVE_LOCKED'
    );
    mockedSetScheduledFor.mockRejectedValue(locked);
    const req = {
      userId: USER_ID,
      params: { itemId: ITEM_ID },
      body: { scheduledFor: '2026-08-25' },
    } as unknown as Request;
    const res = mockRes();

    const error = await updateReviewQueueItemController(req, res).catch((e) => e);
    expect(error).toBe(locked);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('propagates a 404 from the reschedule service (item missing or not owned)', async () => {
    const notFound = new AppError('Review queue item not found', 404, 'NOT_FOUND');
    mockedSetScheduledFor.mockRejectedValue(notFound);
    const req = {
      userId: USER_ID,
      params: { itemId: ITEM_ID },
      body: { scheduledFor: '2026-08-25' },
    } as unknown as Request;
    const res = mockRes();

    const error = await updateReviewQueueItemController(req, res).catch((e) => e);
    expect(error).toBe(notFound);
    expect(res.status).not.toHaveBeenCalled();
  });
});
