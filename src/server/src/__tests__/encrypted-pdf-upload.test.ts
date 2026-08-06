import fs from 'fs';
import os from 'os';
import path from 'path';
import { Request, Response } from 'express';
import { getPdfPageCount, EncryptedPdfError } from '../utils/pdf';
import { createPlanController } from '../controllers/plan.controller';
import { createPlanInDb } from '../services/plan.service';
import { triggerAnalysis } from '../services/analysis.service';
import { createStorageService } from '../services/storage.service';
import { AppError } from '../middleware/errorHandler';

// Factory mocks — same pattern as retry-controller.test.ts: no real Prisma/Gemini client
// gets constructed, so this passes without DATABASE_URL/GEMINI_API_KEY (SDP risk R05).
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

/**
 * Builds the bytes of a minimal, hand-written PDF (manual xref table, no compression) —
 * either encrypted or not. `encrypted` adds an object 4 (`/Filter /Standard ...`) and wires
 * the trailer's `/Encrypt` entry to it; the O/U password hashes are dummy bytes because
 * pdf-lib's `isEncrypted` check (mirroring the real reader/Gemini's behaviour, see Issue
 * #223) only looks at whether `/Encrypt` is present in the trailer, not whether the hashes
 * are valid — an owner-password-only PDF with an empty user password opens fine in a normal
 * reader while still tripping this exact check.
 */
function buildMinimalPdf(encrypted: boolean): Buffer {
  const objs: string[] = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> >>\nendobj\n',
  ];
  if (encrypted) {
    const dummyHash = Buffer.alloc(32, 0x41).toString('latin1');
    objs.push(
      `4 0 obj\n<< /Filter /Standard /V 1 /R 2 /O (${dummyHash}) /U (${dummyHash}) /P -44 >>\nendobj\n`
    );
  }

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const obj of objs) {
    offsets.push(pdf.length);
    pdf += obj;
  }
  const xrefStart = pdf.length;
  const count = objs.length + 1;
  let xref = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let i = 1; i < count; i++) {
    xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += xref;
  const encryptEntry = encrypted ? ' /Encrypt 4 0 R' : '';
  pdf += `trailer\n<< /Size ${count} /Root 1 0 R${encryptEntry} >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(pdf, 'latin1');
}

function writeTempPdf(name: string, bytes: Buffer): string {
  const tempPath = path.join(os.tmpdir(), `${Date.now()}-${name}`);
  fs.writeFileSync(tempPath, bytes);
  return tempPath;
}

function mockRes(): Response {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
  } as unknown as Response;
}

describe('getPdfPageCount — phát hiện PDF bị mã hoá (Issue #223)', () => {
  const tempFiles: string[] = [];
  afterAll(() => {
    for (const f of tempFiles) fs.rmSync(f, { force: true });
  });

  it('ném EncryptedPdfError cho PDF có /Encrypt dictionary', async () => {
    const filePath = writeTempPdf('encrypted.pdf', buildMinimalPdf(true));
    tempFiles.push(filePath);

    await expect(getPdfPageCount(filePath)).rejects.toBeInstanceOf(EncryptedPdfError);
  });

  it('trả về đúng số trang cho PDF hợp lệ, không mã hoá', async () => {
    const filePath = writeTempPdf('plain.pdf', buildMinimalPdf(false));
    tempFiles.push(filePath);

    await expect(getPdfPageCount(filePath)).resolves.toBe(1);
  });

  it('trả về null (không throw) cho file hỏng/không parse được', async () => {
    const filePath = writeTempPdf('corrupt.pdf', Buffer.from('not a real pdf'));
    tempFiles.push(filePath);

    await expect(getPdfPageCount(filePath)).resolves.toBeNull();
  });
});

describe('createPlanController — từ chối PDF mã hoá tại thời điểm upload (Issue #223)', () => {
  const USER_ID = 'user-owner-uuid';
  let encryptedPdfPath: string;

  beforeAll(() => {
    encryptedPdfPath = writeTempPdf('encrypted-upload.pdf', buildMinimalPdf(true));
  });

  afterAll(() => {
    fs.rmSync(encryptedPdfPath, { force: true });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('trả 400 ENCRYPTED_PDF, không tạo AnalysisJob, và dọn file staging', async () => {
    // Bản sao riêng cho test này vì controller sẽ unlink file khi cleanup.
    const stagedPath = writeTempPdf('encrypted-staged.pdf', fs.readFileSync(encryptedPdfPath));
    const size = fs.statSync(stagedPath).size;

    const req = {
      userId: USER_ID,
      body: { name: 'Kế hoạch ôn thi', deadline: '2099-12-31' },
      file: {
        path: stagedPath,
        originalname: 'de-thi-ma-hoa.pdf',
        size,
      },
    } as unknown as Request;
    const res = mockRes();

    const error = await createPlanController(req, res).catch((e) => e);

    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ statusCode: 400, code: 'ENCRYPTED_PDF' });

    // Không có AnalysisJob / Document / StudyPlan nào được tạo, và không upload lên storage.
    expect(mockedCreatePlanInDb).not.toHaveBeenCalled();
    expect(storage.upload).not.toHaveBeenCalled();
    expect(mockedTriggerAnalysis).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();

    // File staging đã bị xoá, không để lại rác.
    expect(fs.existsSync(stagedPath)).toBe(false);
  });

  it('vẫn tạo plan bình thường cho PDF không mã hoá (không ảnh hưởng luồng hợp lệ)', async () => {
    const stagedPath = writeTempPdf('plain-staged.pdf', buildMinimalPdf(false));
    const size = fs.statSync(stagedPath).size;

    mockedCreatePlanInDb.mockResolvedValue({
      id: 'plan-uuid',
      name: 'Kế hoạch ôn thi',
      deadline: new Date('2099-12-31'),
      status: 'draft',
    });
    mockedTriggerAnalysis.mockResolvedValue(undefined);

    const req = {
      userId: USER_ID,
      body: { name: 'Kế hoạch ôn thi', deadline: '2099-12-31' },
      file: {
        path: stagedPath,
        originalname: 'de-thi-hop-le.pdf',
        size,
      },
    } as unknown as Request;
    const res = mockRes();

    await createPlanController(req, res);

    expect(mockedCreatePlanInDb).toHaveBeenCalledTimes(1);
    const documentMeta = mockedCreatePlanInDb.mock.calls[0][3];
    expect(documentMeta).toMatchObject({ kind: 'pdf', pageCount: 1 });
    expect(storage.upload).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(201);

    if (fs.existsSync(stagedPath)) fs.rmSync(stagedPath, { force: true });
  });
});
