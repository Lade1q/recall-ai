import { Request, Response } from 'express';
import { createFocusSessionController } from '../controllers/focus-session.controller';
import { createFocusSession } from '../services/focus-session.service';
import { AppError } from '../middleware/errorHandler';

/**
 * Review #371 (should-fix): PR gốc chép `createInterviewController` làm khuôn mẫu cho quy
 * ước `201`↔`200`, nhưng không chép test khoá lại nó — một đột biến "controller luôn trả
 * 201" sống sót cả suite vì `focus-session-controller.test.ts` chưa từng tồn tại. File này
 * là bản đối chiếu, cùng pattern mock với `interview-controller.test.ts`.
 */
jest.mock('../services/focus-session.service', () => ({
  __esModule: true,
  createFocusSession: jest.fn(),
}));

const mockedCreate = createFocusSession as jest.Mock;

const USER_ID = 'user-owner-uuid';
const PLAN_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
const SESSION_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const CONCEPT_ID = '9b2f1a44-1c3d-4f0e-8f4a-2b6c5d7e8f90';

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

describe('createFocusSessionController', () => {
  it('throws 401 UNAUTHORIZED when req.userId is missing', async () => {
    const req = { body: { conceptIds: [CONCEPT_ID] } } as unknown as Request;

    const error = await createFocusSessionController(req, mockRes()).catch((e) => e);

    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it('responds 201 with the new session when created is true', async () => {
    const data = {
      created: true,
      id: SESSION_ID,
      planId: PLAN_ID,
      conceptIds: [CONCEPT_ID],
      status: 'running',
      strictMode: false,
      startedAt: new Date(),
    };
    mockedCreate.mockResolvedValue(data);
    const req = {
      userId: USER_ID,
      body: { planId: PLAN_ID, conceptIds: [CONCEPT_ID] },
    } as unknown as Request;
    const res = mockRes();

    await createFocusSessionController(req, res);

    expect(mockedCreate).toHaveBeenCalledWith(USER_ID, {
      planId: PLAN_ID,
      conceptIds: [CONCEPT_ID],
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ success: true, data });
  });

  // Cùng test mà interview-controller.test.ts:120 có cho createInterviewController — thứ
  // đột biến "luôn 201" cần để bị bắt.
  it('responds 200, not 201, when a running session is handed back to resume (#328)', async () => {
    mockedCreate.mockResolvedValue({
      created: false,
      id: SESSION_ID,
      planId: PLAN_ID,
      conceptIds: [CONCEPT_ID],
      status: 'running',
      strictMode: false,
      startedAt: new Date(),
    });
    const req = {
      userId: USER_ID,
      body: { planId: PLAN_ID, conceptIds: [CONCEPT_ID] },
    } as unknown as Request;
    const res = mockRes();

    await createFocusSessionController(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('propagates 409 SESSION_ALREADY_RUNNING from the service unchanged', async () => {
    mockedCreate.mockRejectedValue(
      new AppError('You already have a focus session running...', 409, 'SESSION_ALREADY_RUNNING')
    );
    const req = {
      userId: USER_ID,
      body: { planId: PLAN_ID, conceptIds: [CONCEPT_ID] },
    } as unknown as Request;

    const error = await createFocusSessionController(req, mockRes()).catch((e) => e);

    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ statusCode: 409, code: 'SESSION_ALREADY_RUNNING' });
  });
});
