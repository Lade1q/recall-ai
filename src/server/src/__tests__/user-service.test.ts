import { getPomodoroConfig, updatePomodoroConfig } from '../services/user.service';
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
