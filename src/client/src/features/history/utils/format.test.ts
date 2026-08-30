import { describe, expect, it } from 'vitest';
import { formatSessionMeta, formatDayTime, formatFullDate } from './format';

const STARTED = new Date(2026, 7, 13, 21, 40).toISOString();
const ENDED = new Date(2026, 7, 13, 22, 6).toISOString();

describe('formatSessionMeta — thời lượng chỉ có nghĩa khi phiên đã đóng', () => {
  it('phiên đã đóng hiện khoảng giờ và thời lượng', () => {
    expect(
      formatSessionMeta({
        startedAt: STARTED,
        endedAt: ENDED,
        durationMinutes: 26,
        planName: 'CTDL & GT',
      })
    ).toBe('21:40 – 22:06 · 26 phút · CTDL & GT');
  });

  /**
   * `/summary` trả `durationMinutes: 0` — KHÔNG phải `null` — cho phiên `endedAt` null
   * (`session.endedAt ? … : 0`). Hàng cũ bị bỏ dở trước khi `abandonInterview` biết ghi
   * `endedAt` rơi đúng vào đây, và guard theo `null` một mình sẽ in ra "0 phút".
   */
  it('endedAt null thì bỏ hẳn thời lượng, kể cả khi server trả 0 chứ không phải null', () => {
    const meta = formatSessionMeta({
      startedAt: STARTED,
      endedAt: null,
      durationMinutes: 0,
      planName: 'CTDL & GT',
    });

    expect(meta).toBe('21:40 · CTDL & GT');
    expect(meta).not.toContain('phút');
    // Không assert `not.toContain('0')` — chuỗi giờ "21:40" vốn đã chứa số 0.
  });

  it('phiên chưa đóng và chưa biết thời lượng cũng không hiện gì', () => {
    expect(
      formatSessionMeta({
        startedAt: STARTED,
        endedAt: null,
        durationMinutes: null,
        planName: 'CTDL & GT',
      })
    ).toBe('21:40 · CTDL & GT');
  });

  it('phiên đã đóng mà ngắn thật (làm tròn 0 phút) vẫn hiện — đó là số đo thật', () => {
    expect(
      formatSessionMeta({
        startedAt: STARTED,
        endedAt: ENDED,
        durationMinutes: 0,
        planName: 'CTDL & GT',
      })
    ).toContain('0 phút');
  });
});

describe('format ngày giờ', () => {
  it('ngày giờ hỏng không ném, trả gạch ngang', () => {
    expect(formatDayTime('không-phải-ngày')).toBe('—');
    expect(formatFullDate('không-phải-ngày')).toBe('—');
  });
});
