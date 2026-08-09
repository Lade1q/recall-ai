import { Request, Response } from 'express';
import { ZodError } from 'zod';
import { getPlanDocumentFile } from '../services/document.service';
import { getPlanDocumentFileController } from '../controllers/document.controller';
import prisma from '../config/prisma';
import { createStorageService } from '../services/storage.service';
import { buildContentDisposition, resolveDocumentContentType } from '../utils/document-file';
import { AppError } from '../middleware/errorHandler';

/**
 * GET /plans/:id/documents/:documentId (Issue #203) — the permission rule and the two response
 * headers, proved without a database or an API key (SDP risk R05).
 *
 * Factory mocks run at hoist time, so no real Prisma client is ever constructed.
 */
jest.mock('../config/prisma', () => {
  const client = { document: { findFirst: jest.fn() } };
  return { __esModule: true, default: client };
});

// createStorageService() returns a stable singleton so the instance captured at
// document.service module-load is the same object asserted on here.
jest.mock('../services/storage.service', () => {
  const service = {
    upload: jest.fn(),
    read: jest.fn(),
    delete: jest.fn(),
  };
  return { __esModule: true, createStorageService: () => service };
});

const mockedPrisma = prisma as unknown as { document: { findFirst: jest.Mock } };
const storage = createStorageService() as unknown as { read: jest.Mock };

const OWNER_ID = 'user-owner-uuid';
const PLAN_ID = '11111111-1111-4111-8111-111111111111';
const DOCUMENT_ID = '22222222-2222-4222-8222-222222222222';
const FILE_KEY = `plans/${PLAN_ID}/1785665243872.pdf`;
const BYTES = Buffer.from('%PDF-1.7 fake');

describe('getPlanDocumentFile — ownership (C5 deep verification, #203)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * The whole permission rule is one query, so this is the test that matters: the row is
   * narrowed by document id AND plan id AND owner at once. Widen this `where` and every 404
   * below silently turns into someone else's file.
   */
  it('scopes the lookup by document, plan, and owner in a single query', async () => {
    mockedPrisma.document.findFirst.mockResolvedValue({
      filename: 'LN04.pdf',
      kind: 'pdf',
      fileKey: FILE_KEY,
    });
    storage.read.mockResolvedValue(BYTES);

    await getPlanDocumentFile(PLAN_ID, DOCUMENT_ID, OWNER_ID);

    expect(mockedPrisma.document.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: DOCUMENT_ID, planId: PLAN_ID, plan: { userId: OWNER_ID } },
      })
    );
  });

  // A document that does not exist, one that belongs to another plan, and one that belongs to
  // another user must be indistinguishable — 403 would confirm the id is real. The mocked query
  // returns null for all three, which is exactly what the scoped `where` above produces.
  it('throws 404 NOT_FOUND when the scoped lookup finds nothing (missing / wrong plan / not owned)', async () => {
    mockedPrisma.document.findFirst.mockResolvedValue(null);

    const error = await getPlanDocumentFile(PLAN_ID, DOCUMENT_ID, OWNER_ID).catch((e) => e);

    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
  });

  it('never touches storage when the document is not the caller’s', async () => {
    mockedPrisma.document.findFirst.mockResolvedValue(null);

    await getPlanDocumentFile(PLAN_ID, DOCUMENT_ID, OWNER_ID).catch(() => undefined);

    expect(storage.read).not.toHaveBeenCalled();
  });

  it('throws 404 DOCUMENT_FILE_MISSING when the row outlived its stored object', async () => {
    mockedPrisma.document.findFirst.mockResolvedValue({
      filename: 'LN04.pdf',
      kind: 'pdf',
      fileKey: FILE_KEY,
    });
    storage.read.mockResolvedValue(null);

    const error = await getPlanDocumentFile(PLAN_ID, DOCUMENT_ID, OWNER_ID).catch((e) => e);

    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ statusCode: 404, code: 'DOCUMENT_FILE_MISSING' });
  });

  it('returns the bytes with the filename and kind for an owned document', async () => {
    mockedPrisma.document.findFirst.mockResolvedValue({
      filename: 'LN04 - Software Requirements.pdf',
      kind: 'pdf',
      fileKey: FILE_KEY,
    });
    storage.read.mockResolvedValue(BYTES);

    await expect(getPlanDocumentFile(PLAN_ID, DOCUMENT_ID, OWNER_ID)).resolves.toEqual({
      filename: 'LN04 - Software Requirements.pdf',
      kind: 'pdf',
      bytes: BYTES,
    });
    expect(storage.read).toHaveBeenCalledWith(FILE_KEY);
  });
});

describe('resolveDocumentContentType', () => {
  it('serves a pdf as application/pdf', () => {
    expect(resolveDocumentContentType('pdf', 'LN04.pdf')).toBe('application/pdf');
  });

  // Without the charset a browser guesses, and pasted Vietnamese material renders as mojibake —
  // which reads as the AI having cited nonsense.
  it('serves text as UTF-8 so Vietnamese material is not mojibake', () => {
    expect(resolveDocumentContentType('text', 'pasted-text.txt')).toBe('text/plain; charset=utf-8');
  });

  it('infers the image type from the extension, case-insensitively', () => {
    expect(resolveDocumentContentType('image', 'slide.png')).toBe('image/png');
    expect(resolveDocumentContentType('image', 'slide.jpg')).toBe('image/jpeg');
    expect(resolveDocumentContentType('image', 'slide.JPEG')).toBe('image/jpeg');
  });

  // Serving must never throw: an unrecognised name still has to come back with *some* type
  // rather than 500 the page the student is trying to check.
  it('falls back to octet-stream for an image with an unknown or absent extension', () => {
    expect(resolveDocumentContentType('image', 'scan.heic')).toBe('application/octet-stream');
    expect(resolveDocumentContentType('image', 'scan')).toBe('application/octet-stream');
  });
});

describe('buildContentDisposition', () => {
  it('serves inline, not as a download', () => {
    expect(buildContentDisposition('LN04.pdf')).toMatch(/^inline; /);
  });

  /**
   * The trap this function exists for: Node rejects a header value with any non-Latin-1
   * character (`ERR_INVALID_CHAR`), and real filenames here are Vietnamese. The plain
   * `filename=` must therefore stay pure ASCII while `filename*` carries the true name.
   */
  it('keeps the ASCII fallback header-safe and puts the real name in filename*', () => {
    const header = buildContentDisposition('Giải thuật — Chương 4: Đồ thị.pdf');

    const fallback = /filename="([^"]*)"/.exec(header)?.[1] ?? '';
    expect(fallback).toMatch(/^[\x20-\x7e]*$/);
    expect(header).toContain(
      `filename*=UTF-8''${encodeURIComponent('Giải thuật — Chương 4: Đồ thị.pdf')}`
    );
  });

  it('strips quotes and backslashes so the fallback cannot break out of its own quoting', () => {
    const fallback = /filename="([^"]*)"/.exec(buildContentDisposition('a"b\\c.pdf'))?.[1];

    expect(fallback).toBe('abc.pdf');
  });

  // Every non-ASCII character becomes `_`, so a fully non-Latin name still yields a non-empty
  // fallback — the placeholder is there for the degenerate case of no filename at all.
  it('substitutes non-ASCII characters rather than dropping them', () => {
    expect(buildContentDisposition('Đồ thị.pdf')).toContain('filename="__ th_.pdf"');
    expect(buildContentDisposition('数据')).toContain('filename="__"');
  });

  it('falls back to a placeholder when the filename is empty', () => {
    expect(buildContentDisposition('')).toContain('filename="document"');
    expect(buildContentDisposition('   ')).toContain('filename="document"');
  });
});

describe('getPlanDocumentFileController', () => {
  function mockRes(): Response & { setHeader: jest.Mock; send: jest.Mock } {
    return {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      setHeader: jest.fn().mockReturnThis(),
    } as unknown as Response & { setHeader: jest.Mock; send: jest.Mock };
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('throws 401 UNAUTHORIZED when req.userId is missing', async () => {
    const req = { params: { id: PLAN_ID, documentId: DOCUMENT_ID } } as unknown as Request;

    const error = await getPlanDocumentFileController(req, mockRes()).catch((e) => e);

    expect(error).toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });
    expect(mockedPrisma.document.findFirst).not.toHaveBeenCalled();
  });

  // Both ids are @db.Uuid: an unvalidated one reaches Prisma as P2023 and falls through to a
  // 500 instead of a 400 (the bug PR #191 fixed for the other /plans routes).
  it.each([
    ['plan id', { id: 'not-a-uuid', documentId: DOCUMENT_ID }],
    ['document id', { id: PLAN_ID, documentId: 'not-a-uuid' }],
  ])('throws ZodError (400) when the %s is not a UUID', async (_label, params) => {
    const req = { userId: OWNER_ID, params } as unknown as Request;

    const error = await getPlanDocumentFileController(req, mockRes()).catch((e) => e);

    expect(error).toBeInstanceOf(ZodError);
    expect(mockedPrisma.document.findFirst).not.toHaveBeenCalled();
  });

  it('sends the bytes with the inline headers for an owned document', async () => {
    mockedPrisma.document.findFirst.mockResolvedValue({
      filename: 'LN04.pdf',
      kind: 'pdf',
      fileKey: FILE_KEY,
    });
    storage.read.mockResolvedValue(BYTES);
    const req = {
      userId: OWNER_ID,
      params: { id: PLAN_ID, documentId: DOCUMENT_ID },
    } as unknown as Request;
    const res = mockRes();

    await getPlanDocumentFileController(req, res);

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      expect.stringContaining('inline;')
    );
    expect(res.setHeader).toHaveBeenCalledWith('Content-Length', BYTES.length);
    // Pin the declared type at the endpoint too, not only via helmet — this route is the one
    // that returns raw user bytes and must not depend on middleware ordering.
    expect(res.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
    // A shared cache must never hand one student's upload to the next request bearing a
    // different token.
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', expect.stringContaining('private'));
    expect(res.send).toHaveBeenCalledWith(BYTES);
  });
});
