/** Một ghi chú nhanh (FS-05) như API trả về — phẳng, không lộ quan hệ Prisma. */
export interface SessionNoteResponse {
  id: string;
  sessionId: string;
  conceptId: string;
  body: string;
  createdAt: Date;
  updatedAt: Date;
}
