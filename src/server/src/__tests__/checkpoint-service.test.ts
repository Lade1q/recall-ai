import { countConceptCheckpoints, listConceptCheckpoints } from '../services/checkpoint.service';
import prisma from '../config/prisma';
import { coverageMasteryScore } from '../utils/mastery';

jest.mock('../config/prisma', () => ({
  __esModule: true,
  default: { conceptCheckpoint: { findMany: jest.fn(), count: jest.fn() } },
}));

const mockedPrisma = prisma as jest.Mocked<typeof prisma>;

/** Reading back the committed ruler (#329) — the `C` that feeds `coverageMasteryScore`. */
describe('checkpoint.service', () => {
  beforeEach(() => jest.clearAllMocks());

  it('lists one concept’s checkpoints in extraction order', async () => {
    (mockedPrisma.conceptCheckpoint.findMany as jest.Mock).mockResolvedValue([
      { id: 'cp-1', text: 'Điểm A', orderIndex: 0 },
      { id: 'cp-2', text: 'Điểm B', orderIndex: 1 },
    ]);

    const rows = await listConceptCheckpoints('concept-1');

    expect(rows.map((r) => r.id)).toEqual(['cp-1', 'cp-2']);
    expect(mockedPrisma.conceptCheckpoint.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { conceptId: 'concept-1' },
        orderBy: { orderIndex: 'asc' },
      })
    );
  });

  it('reads C as a live count of stored rows for that concept', async () => {
    (mockedPrisma.conceptCheckpoint.count as jest.Mock).mockResolvedValue(4);

    expect(await countConceptCheckpoints('concept-1')).toBe(4);
    expect(mockedPrisma.conceptCheckpoint.count).toHaveBeenCalledWith({
      where: { conceptId: 'concept-1' },
    });
  });

  it('feeds the coverage formula: C = 4 with 3 resolved scores, C = 0 stays unassessable', async () => {
    (mockedPrisma.conceptCheckpoint.count as jest.Mock).mockResolvedValue(4);
    const committed = await countConceptCheckpoints('concept-1');
    expect(coverageMasteryScore(2, 1, committed)).toBe(0.67);

    // A concept with no checkpoints is a valid state, not an error: the formula returns null
    // ("not assessed") and the §2.4 guard routes it to the text path — neither is this issue's job.
    (mockedPrisma.conceptCheckpoint.count as jest.Mock).mockResolvedValue(0);
    const none = await countConceptCheckpoints('concept-2');
    expect(none).toBe(0);
    expect(coverageMasteryScore(0, 0, none)).toBeNull();
  });
});
