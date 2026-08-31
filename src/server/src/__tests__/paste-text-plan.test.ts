import fs from 'fs';
import path from 'path';
import { Request, Response } from 'express';
import { createPlanController } from '../controllers/plan.controller';
import { createPlanInDb } from '../services/plan.service';
import { triggerAnalysis } from '../services/analysis.service';
import { createStorageService } from '../services/storage.service';
import { AppError } from '../middleware/errorHandler';
import { STAGING_DIR } from '../middleware/upload.middleware';

// Cùng pattern mock với encrypted-pdf-upload.test.ts — không cần DATABASE_URL/GEMINI_API_KEY
// thật (SDP risk R05).
jest.mock('../services/plan.service', () => ({
  __esModule: true,
  createPlanInDb: jest.fn(),
}));

jest.mock('../services/analysis.service', () => ({
  __esModule: true,
  triggerAnalysis: jest.fn(),
}));

jest.mock('../services/storage.service', () => {
  const service = {
    upload: jest.fn().mockResolvedValue(''),
    delete: jest.fn().mockResolvedValue(undefined),
  };
  return { __esModule: true, createStorageService: () => service };
});

const mockedCreatePlanInDb = createPlanInDb as jest.Mock;
const mockedTriggerAnalysis = triggerAnalysis as jest.Mock;
const storage = createStorageService() as jest.Mocked<ReturnType<typeof createStorageService>>;

function mockRes(): Response {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
  } as unknown as Response;
}

const USER_ID = 'user-owner-uuid';

describe('createPlanController — dán text (UC-02 A3, Issue #172)', () => {
  const stagedPaths: string[] = [];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    for (const p of stagedPaths) {
      if (fs.existsSync(p)) fs.rmSync(p, { force: true });
    }
  });

  it('tạo plan thành công từ content, không cần file, Document kind=text và pageCount=null', async () => {
    mockedCreatePlanInDb.mockResolvedValue({
      id: 'plan-uuid',
      name: 'Kế hoạch từ text dán',
      deadline: new Date('2099-12-31'),
      status: 'draft',
    });
    mockedTriggerAnalysis.mockResolvedValue(undefined);

    const req = {
      userId: USER_ID,
      body: {
        name: 'Kế hoạch từ text dán',
        deadline: '2099-12-31',
        content: 'Giới hạn là khái niệm nền tảng của giải tích.',
      },
      file: undefined,
    } as unknown as Request;
    const res = mockRes();

    await createPlanController(req, res);

    expect(mockedCreatePlanInDb).toHaveBeenCalledTimes(1);
    const documentMeta = mockedCreatePlanInDb.mock.calls[0][3];
    expect(documentMeta).toMatchObject({ kind: 'text', pageCount: null });

    expect(storage.upload).toHaveBeenCalledTimes(1);
    const stagedPath = storage.upload.mock.calls[0]![0] as string;
    stagedPaths.push(stagedPath);
    expect(path.dirname(stagedPath)).toBe(STAGING_DIR);
    expect(fs.existsSync(stagedPath)).toBe(true);
    expect(fs.readFileSync(stagedPath, 'utf-8')).toBe(
      'Giới hạn là khái niệm nền tảng của giải tích.'
    );

    expect(mockedTriggerAnalysis).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('không coi là conflict khi có file và content rỗng ("") — form multipart luôn gửi kèm ô content chưa đụng tới', async () => {
    mockedCreatePlanInDb.mockResolvedValue({
      id: 'plan-uuid',
      name: 'Kế hoạch từ file',
      deadline: new Date('2099-12-31'),
      status: 'draft',
    });
    mockedTriggerAnalysis.mockResolvedValue(undefined);

    const req = {
      userId: USER_ID,
      body: {
        name: 'Kế hoạch từ file',
        deadline: '2099-12-31',
        content: '',
      },
      file: { path: '/tmp/does-not-matter.txt', originalname: 'notes.txt', size: 10 },
    } as unknown as Request;
    const res = mockRes();

    await createPlanController(req, res);

    expect(mockedCreatePlanInDb).toHaveBeenCalledTimes(1);
    expect(storage.upload).toHaveBeenCalledWith('/tmp/does-not-matter.txt', expect.any(String));
    expect(res.status).toHaveBeenCalledWith(201);
  });

  // Review #363, vòng đo lại (04:41): cùng lớp lỗi với ca content:'' ở trên, lệch một bước —
  // người dùng upload file, lỡ gõ một dấu cách vào ô dán text, và bị chặn oan bởi "nội dung
  // dán không được rỗng" dù họ không định dán gì.
  it('không coi là conflict khi có file và content toàn khoảng trắng ("   ")', async () => {
    mockedCreatePlanInDb.mockResolvedValue({
      id: 'plan-uuid',
      name: 'Kế hoạch từ file',
      deadline: new Date('2099-12-31'),
      status: 'draft',
    });
    mockedTriggerAnalysis.mockResolvedValue(undefined);

    const req = {
      userId: USER_ID,
      body: {
        name: 'Kế hoạch từ file',
        deadline: '2099-12-31',
        content: '   ',
      },
      file: { path: '/tmp/does-not-matter.txt', originalname: 'notes.txt', size: 10 },
    } as unknown as Request;
    const res = mockRes();

    await createPlanController(req, res);

    expect(mockedCreatePlanInDb).toHaveBeenCalledTimes(1);
    expect(storage.upload).toHaveBeenCalledWith('/tmp/does-not-matter.txt', expect.any(String));
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('từ chối khi vừa có file vừa có content (CONTENT_OR_FILE_CONFLICT), không tạo plan', async () => {
    const req = {
      userId: USER_ID,
      body: {
        name: 'Kế hoạch',
        deadline: '2099-12-31',
        content: 'Nội dung dán',
      },
      file: { path: '/tmp/does-not-matter.pdf', originalname: 'a.pdf', size: 10 },
    } as unknown as Request;
    const res = mockRes();

    const error = await createPlanController(req, res).catch((e) => e);

    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ statusCode: 400, code: 'CONTENT_OR_FILE_CONFLICT' });
    expect(mockedCreatePlanInDb).not.toHaveBeenCalled();
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('từ chối khi không có cả file lẫn content (FILE_REQUIRED)', async () => {
    const req = {
      userId: USER_ID,
      body: { name: 'Kế hoạch', deadline: '2099-12-31' },
      file: undefined,
    } as unknown as Request;
    const res = mockRes();

    const error = await createPlanController(req, res).catch((e) => e);

    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ statusCode: 400, code: 'FILE_REQUIRED' });
    expect(mockedCreatePlanInDb).not.toHaveBeenCalled();
  });

  it('dọn file .txt tạm đã stage khi createPlanInDb lỗi', async () => {
    mockedCreatePlanInDb.mockRejectedValue(new Error('db down'));

    const req = {
      userId: USER_ID,
      body: {
        name: 'Kế hoạch',
        deadline: '2099-12-31',
        content: 'Nội dung sẽ không được lưu vì DB lỗi',
      },
      file: undefined,
    } as unknown as Request;
    const res = mockRes();

    await expect(createPlanController(req, res)).rejects.toThrow('db down');

    // storage.upload chạy trước createPlanInDb, nên vẫn thấy path để assert đã bị xoá.
    const stagedPath = storage.upload.mock.calls[0]![0] as string;
    expect(path.dirname(stagedPath)).toBe(STAGING_DIR);
    expect(fs.existsSync(stagedPath)).toBe(false);
  });
});
