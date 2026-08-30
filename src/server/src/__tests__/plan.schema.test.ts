import {
  conceptDetailParamsSchema,
  createPlanSchema,
  planIdParamSchema,
} from '../schemas/plan.schema';

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Builds the ISO string a browser in Vietnam sends for local midnight of `daysFromToday`. */
function vnLocalMidnightIso(daysFromToday: number): string {
  const nowVn = new Date(Date.now() + VN_OFFSET_MS);
  const vnMidnightUtc = Date.UTC(
    nowVn.getUTCFullYear(),
    nowVn.getUTCMonth(),
    nowVn.getUTCDate() + daysFromToday
  );
  return new Date(vnMidnightUtc - VN_OFFSET_MS).toISOString();
}

/** Builds the plain "yyyy-MM-dd" string the client actually sends for `daysFromToday`. */
function vnDateOnlyString(daysFromToday: number): string {
  const nowVn = new Date(Date.now() + VN_OFFSET_MS);
  const targetVn = new Date(
    Date.UTC(nowVn.getUTCFullYear(), nowVn.getUTCMonth(), nowVn.getUTCDate() + daysFromToday)
  );
  return targetVn.toISOString().slice(0, 10);
}

describe('createPlanSchema deadline', () => {
  const base = { name: 'Test plan' };

  it('accepts a deadline of today (Vietnam local midnight), matching the client-allowed choice', () => {
    expect(() =>
      createPlanSchema.parse({ ...base, deadline: vnLocalMidnightIso(0) })
    ).not.toThrow();
  });

  it('accepts a deadline in the future', () => {
    expect(() =>
      createPlanSchema.parse({ ...base, deadline: vnLocalMidnightIso(5) })
    ).not.toThrow();
  });

  it('rejects a deadline of yesterday', () => {
    expect(() => createPlanSchema.parse({ ...base, deadline: vnLocalMidnightIso(-1) })).toThrow(
      /future date/
    );
  });

  it('accepts a plain "yyyy-MM-dd" deadline of today (actual wire format sent by the client)', () => {
    expect(() => createPlanSchema.parse({ ...base, deadline: vnDateOnlyString(0) })).not.toThrow();
  });

  it('rejects a plain "yyyy-MM-dd" deadline of yesterday', () => {
    expect(() => createPlanSchema.parse({ ...base, deadline: vnDateOnlyString(-1) })).toThrow(
      /future date/
    );
  });

  it('rejects an invalid date string', () => {
    expect(() => createPlanSchema.parse({ ...base, deadline: 'not-a-date' })).toThrow();
  });

  it('rejects an empty deadline', () => {
    expect(() => createPlanSchema.parse({ ...base, deadline: '' })).toThrow(/required/);
  });
});

// UC-02 A3 "Dán text" — `content` là field mới, thay thế cho `file` khi tạo plan bằng cách
// dán text thuần thay vì upload tài liệu.
describe('createPlanSchema content (dán text)', () => {
  const base = { name: 'Test plan', deadline: '2099-12-31' };

  it('chấp nhận khi không có content (luồng upload file cũ)', () => {
    expect(() => createPlanSchema.parse(base)).not.toThrow();
  });

  it('chấp nhận content hợp lệ và trim khoảng trắng thừa', () => {
    const result = createPlanSchema.parse({ ...base, content: '  Nội dung bài học  ' });
    expect(result.content).toBe('Nội dung bài học');
  });

  // Code review #363 (2 vòng): một form multipart gửi file lại kèm luôn ô `content` chưa
  // đụng tới dưới dạng chuỗi rỗng `''`, hoặc lỡ gõ một dấu cách `'   '` — cả hai không phải
  // ý định dán text, nên coi như "không có" thay vì ném VALIDATION_ERROR vào một request
  // upload-file hợp lệ. Vòng đầu chỉ vá `''`; vòng hai mở rộng ra mọi chuỗi toàn khoảng trắng.
  it('coi content chuỗi rỗng ("") là không có, không phải lỗi', () => {
    const result = createPlanSchema.parse({ ...base, content: '' });
    expect(result.content).toBeUndefined();
  });

  it('coi content toàn khoảng trắng ("   ") là không có, không phải lỗi', () => {
    const result = createPlanSchema.parse({ ...base, content: '   ' });
    expect(result.content).toBeUndefined();
  });

  it('từ chối content vượt quá 10,000 ký tự', () => {
    const tooLong = 'a'.repeat(10_001);
    expect(() => createPlanSchema.parse({ ...base, content: tooLong })).toThrow(/too long/);
  });

  it('chấp nhận content đúng giới hạn 10,000 ký tự', () => {
    const maxLength = 'a'.repeat(10_000);
    expect(() => createPlanSchema.parse({ ...base, content: maxLength })).not.toThrow();
  });

  // Comment bổ sung trên #363: multipart/form-data chuẩn hoá mỗi `\n` thành `\r\n` khi
  // truyền tải — nếu đếm giới hạn trên chuỗi thô, mỗi dòng xuống hàng bị tính thành 2 ký
  // tự, khiến một đoạn 9,957 ký tự đã gõ (91 dòng) bị từ chối vì "too long" ở 10,048 ký
  // tự thô. Chuẩn hoá `\r\n` → `\n` trước khi đếm để cap phản ánh đúng số ký tự đã gõ.
  it('không tính CRLF (xuống dòng qua multipart) gấp đôi khi kiểm tra giới hạn', () => {
    // Xuống dòng nằm giữa nội dung (không ở đầu/cuối) để .trim() không vô tình nuốt mất
    // — mô phỏng một đoạn nhiều dòng thật, không phải chuỗi toàn '\n'.
    const lines = Array.from({ length: 100 }, (_, i) => `dòng ${i}: ` + 'a'.repeat(90));
    const typed = lines.join('\n'); // đúng những gì sinh viên gõ, dùng '\n'
    const wireValue = typed.replace(/\n/g, '\r\n'); // dạng đã "nở" mà multipart gửi lên
    expect(wireValue.length).toBeGreaterThan(typed.length); // xác nhận có "nở" thật, không phải no-op

    const result = createPlanSchema.parse({ ...base, content: wireValue });
    expect(result.content).toBe(typed); // sau chuẩn hoá, khớp đúng bản gốc đã gõ, không còn CRLF
  });

  it('thông báo lỗi vượt giới hạn có kèm số ký tự thực tế đã gõ', () => {
    const tooLong = 'a'.repeat(10_001);
    expect(() => createPlanSchema.parse({ ...base, content: tooLong })).toThrow(
      /max 10000 characters, got 10001/
    );
  });
});

// Regression coverage for PR #160: id là @db.Uuid trong Prisma — một id không phải UUID
// ném PrismaClientKnownRequestError P2023 chưa được errorHandler map, rớt xuống 500
// INTERNAL_ERROR nếu không bị chặn ở đây trước khi chạm service/Prisma.
describe('planIdParamSchema', () => {
  it('accepts a valid UUID', () => {
    expect(() =>
      planIdParamSchema.parse({ id: '11111111-1111-4111-8111-111111111111' })
    ).not.toThrow();
  });

  it('rejects a missing id', () => {
    expect(() => planIdParamSchema.parse({})).toThrow();
  });

  it('rejects an empty id', () => {
    expect(() => planIdParamSchema.parse({ id: '' })).toThrow();
  });

  it('rejects a non-UUID string id', () => {
    expect(() => planIdParamSchema.parse({ id: 'plan-uuid' })).toThrow();
    expect(() => planIdParamSchema.parse({ id: 'abc' })).toThrow();
  });

  it('rejects a UUID missing a segment', () => {
    expect(() => planIdParamSchema.parse({ id: '11111111-1111-4111-8111' })).toThrow();
  });
});

// Route lồng GET /plans/:id/concepts/:conceptId — cả hai param đều là @db.Uuid, nên đều phải
// chặn P2023→500 (cùng lỗi PR #191 đã vá cho các route /plans khác, xem concept.controller.ts).
describe('conceptDetailParamsSchema', () => {
  const validPlanId = '11111111-1111-4111-8111-111111111111';
  const validConceptId = '22222222-2222-4222-8222-222222222222';

  it('accepts a pair of valid UUIDs', () => {
    expect(() =>
      conceptDetailParamsSchema.parse({ id: validPlanId, conceptId: validConceptId })
    ).not.toThrow();
  });

  it('rejects a non-UUID plan id', () => {
    expect(() =>
      conceptDetailParamsSchema.parse({ id: 'plan-uuid', conceptId: validConceptId })
    ).toThrow();
  });

  it('rejects a non-UUID conceptId', () => {
    expect(() =>
      conceptDetailParamsSchema.parse({ id: validPlanId, conceptId: 'concept-uuid' })
    ).toThrow();
  });

  it('rejects a missing conceptId', () => {
    expect(() => conceptDetailParamsSchema.parse({ id: validPlanId })).toThrow();
  });
});
