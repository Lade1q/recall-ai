import { Request, Response } from 'express';
import {
  getReviewQueueController,
  getTodayReviewQueueController,
  updateReviewQueueItemController,
} from '../controllers/review-queue.controller';
import {
  getReviewQueueForPlan,
  getTodayReviewQueue,
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
}));

const mockedGetQueue = getReviewQueueForPlan as jest.Mock;
const mockedGetToday = getTodayReviewQueue as jest.Mock;
const mockedUpdateItem = updateReviewQueueItemStatus as jest.Mock;

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

    expect(mockedGetQueue).toHaveBeenCalledWith(PLAN_ID, USER_ID, 3);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: queueResponse });
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
    const req = { params: { itemId: ITEM_ID }, body: { status: 'accepted' } } as unknown as Request;
    const res = mockRes();

    const error = await updateReviewQueueItemController(req, res).catch((e) => e);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });
    expect(mockedUpdateItem).not.toHaveBeenCalled();
  });

  it('throws a ZodError (400 VALIDATION_ERROR) when itemId param is missing', async () => {
    const req = { userId: USER_ID, params: {}, body: { status: 'accepted' } } as unknown as Request;
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
      body: { status: 'accepted' },
    } as unknown as Request;
    const res = mockRes();

    const error = await updateReviewQueueItemController(req, res).catch((e) => e);
    expect(error).toBeInstanceOf(ZodError);
    expect(mockedUpdateItem).not.toHaveBeenCalled();
  });

  it('throws a ZodError when status is neither accepted nor skipped', async () => {
    const req = {
      userId: USER_ID,
      params: { itemId: ITEM_ID },
      body: { status: 'pending' },
    } as unknown as Request;
    const res = mockRes();

    const error = await updateReviewQueueItemController(req, res).catch((e) => e);
    expect(error).toBeInstanceOf(ZodError);
    expect(mockedUpdateItem).not.toHaveBeenCalled();
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
      body: { status: 'accepted' },
    } as unknown as Request;
    const res = mockRes();

    const error = await updateReviewQueueItemController(req, res).catch((e) => e);
    expect(error).toBe(notFound);
    expect(res.status).not.toHaveBeenCalled();
  });
});
