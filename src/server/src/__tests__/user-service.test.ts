import { getPomodoroConfig, updatePomodoroConfig, updateProfile } from '../services/user.service';
import { updateProfileSchema } from '../schemas/user.schema';
import prisma from '../config/prisma';
import { AppError } from '../middleware/errorHandler';

jest.mock('../config/prisma', () => ({
  __esModule: true,
  default: {
    user: { findUnique: jest.fn(), update: jest.fn() },
  },
}));

const mockedPrisma = prisma as unknown as {
  user: { findUnique: jest.Mock; update: jest.Mock };
};

const USER_ID = '11111111-1111-1111-1111-111111111111';
const DEFAULT_CONFIG = { work: 25, short_break: 5, long_break: 15, cycles: 4, sound: true };

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getPomodoroConfig', () => {
  it('throws 404 when the user does not exist', async () => {
    mockedPrisma.user.findUnique.mockResolvedValue(null);

    const error = await getPomodoroConfig(USER_ID).catch((e) => e);

    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
  });

  it('returns the stored config as-is when it matches the expected shape', async () => {
    const stored = { work: 50, short_break: 10, long_break: 20, cycles: 3, sound: false };
    mockedPrisma.user.findUnique.mockResolvedValue({ pomodoroConfig: stored });

    const config = await getPomodoroConfig(USER_ID);

    expect(config).toEqual(stored);
  });

  // pomodoroConfig là cột Json — dữ liệu cũ/hỏng (null, thiếu field) không được làm sập response,
  // phải rơi về default an toàn thay vì trả undefined hay throw.
  it('falls back to the default config when the stored JSON is malformed', async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({ pomodoroConfig: { work: 'not-a-number' } });

    const config = await getPomodoroConfig(USER_ID);

    expect(config).toEqual(DEFAULT_CONFIG);
  });
});

describe('updatePomodoroConfig', () => {
  it('merges a partial patch into the current config instead of replacing it', async () => {
    const current = { work: 50, short_break: 10, long_break: 20, cycles: 3, sound: false };
    mockedPrisma.user.findUnique.mockResolvedValue({ pomodoroConfig: current });
    mockedPrisma.user.update.mockResolvedValue({
      pomodoroConfig: { ...current, work: 30 },
    });

    const result = await updatePomodoroConfig(USER_ID, { work: 30 });

    expect(mockedPrisma.user.update).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: { pomodoroConfig: { ...current, work: 30 } },
    });
    expect(result).toEqual({ ...current, work: 30 });
  });
});

/**
 * #360 — `updateProfileSchema` khai `z.string()` trần cho tới PR này, trong khi `User.name` là
 * `String?`. Client gửi `{name: null}` khi người dùng xoá trắng ô tên, nên **đúng đường đi bình
 * thường nhất của tính năng** trả 400 và người dùng đọc "Không thể lưu. Vui lòng thử lại."
 *
 * Kiểm ở tầng schema (không phải chỉ tầng service) vì chính schema là chỗ từ chối — `updateProfile`
 * chưa bao giờ thấy payload đó.
 */
describe('updateProfileSchema', () => {
  it('accepts null — clearing the name is what the nullable column is for', () => {
    const result = updateProfileSchema.safeParse({ name: null });

    expect(result.success).toBe(true);
    expect(result.success && result.data.name).toBeNull();
  });

  it('trims before length-checking, so padding cannot buy the minimum', () => {
    const result = updateProfileSchema.safeParse({ name: '  Bob  ' });

    expect(result.success && result.data.name).toBe('Bob');
  });

  /**
   * Ca 1 ký tự **vẫn hở** và cố ý không sửa ở PR này (theo dõi ở #370): DB không đòi độ dài tối
   * thiểu nào, nên `min(2)` là quy ước của tầng schema. Ghim lại để lúc #370 đổi nó thì có một
   * chỗ đỏ nhắc rằng hành vi này từng được biết, chứ không phải vô tình.
   */
  it('still rejects a one-character name (known gap, tracked in #370)', () => {
    expect(updateProfileSchema.safeParse({ name: 'A' }).success).toBe(false);
  });

  it('rejects a name past the column width', () => {
    expect(updateProfileSchema.safeParse({ name: 'x'.repeat(101) }).success).toBe(false);
  });
});

describe('updateProfile', () => {
  const ROW = {
    id: USER_ID,
    email: 'alice@example.com',
    name: null,
    createdAt: new Date('2026-01-15T00:00:00Z'),
  };

  it('writes null through to Prisma and reports it back as null', async () => {
    mockedPrisma.user.update.mockResolvedValue(ROW);

    const result = await updateProfile(USER_ID, { name: null });

    expect(mockedPrisma.user.update).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: { name: null },
    });
    // Phải là `null`, không phải `''` — hai thứ này khác nhau ở cột `String?`, và
    // `DashboardHeader` phân biệt chúng khi quyết định có chèn tên vào lời chào không.
    expect(result.name).toBeNull();
  });

  it('writes a real name through unchanged', async () => {
    mockedPrisma.user.update.mockResolvedValue({ ...ROW, name: 'Bob' });

    const result = await updateProfile(USER_ID, { name: 'Bob' });

    expect(mockedPrisma.user.update).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: { name: 'Bob' },
    });
    expect(result.name).toBe('Bob');
  });

  it('turns a missing row into 404 rather than letting P2025 surface as 500', async () => {
    mockedPrisma.user.update.mockRejectedValue(new Error('P2025'));

    const error = await updateProfile(USER_ID, { name: null }).catch((e) => e);

    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
  });
});
