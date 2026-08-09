import { describe, expect, it } from 'vitest';
import {
  formatClock,
  formatMinutesPhrase,
  formatMinutesSecondsPhrase,
  cyclesToWords,
  formatClockTime,
  formatPageAnchor,
} from './format';

describe('formatClock', () => {
  it('renders 0 ms as 00:00', () => {
    expect(formatClock(0)).toBe('00:00');
  });

  it('floors 65000 ms to 01:05', () => {
    expect(formatClock(65000)).toBe('01:05');
  });

  it('clamps negative ms to 00:00', () => {
    expect(formatClock(-5000)).toBe('00:00');
  });
});

describe('formatMinutesPhrase', () => {
  it('renders 130 seconds as "2 phút"', () => {
    expect(formatMinutesPhrase(130)).toBe('2 phút');
  });

  it('renders 30 seconds as "0 phút"', () => {
    expect(formatMinutesPhrase(30)).toBe('0 phút');
  });
});

describe('formatMinutesSecondsPhrase', () => {
  it('renders 0 seconds as "0 giây"', () => {
    expect(formatMinutesSecondsPhrase(0)).toBe('0 giây');
  });

  it('renders 65 seconds as "1 phút 5 giây"', () => {
    expect(formatMinutesSecondsPhrase(65)).toBe('1 phút 5 giây');
  });

  it('drops the seconds clause on a whole minute (120 -> "2 phút")', () => {
    expect(formatMinutesSecondsPhrase(120)).toBe('2 phút');
  });
});

describe('cyclesToWords', () => {
  it('spells small in-range counts (4 -> "Bốn lượt")', () => {
    expect(cyclesToWords(4)).toBe('Bốn lượt');
  });

  it('spells 1 as "Một lượt"', () => {
    expect(cyclesToWords(1)).toBe('Một lượt');
  });

  it('renders 0 as "0 lượt" (no ordinal for zero)', () => {
    expect(cyclesToWords(0)).toBe('0 lượt');
  });

  it('guards NaN to "0 lượt"', () => {
    expect(cyclesToWords(NaN)).toBe('0 lượt');
  });

  it('guards negative counts to "0 lượt"', () => {
    expect(cyclesToWords(-1)).toBe('0 lượt');
  });

  it('uses digits (no ordinal) above 10 (11 -> "11 lượt")', () => {
    expect(cyclesToWords(11)).toBe('11 lượt');
  });
});

describe('formatClockTime', () => {
  it('returns an HH:mm shaped string', () => {
    expect(formatClockTime(new Date(2026, 7, 8, 22, 5, 0))).toMatch(/^\d{2}:\d{2}$/);
  });
});

describe('formatPageAnchor', () => {
  it('renders a single page when from and to are equal', () => {
    expect(formatPageAnchor(41, 41)).toBe('tr. 41');
  });

  it('renders a range with an en dash when the excerpt spans pages', () => {
    expect(formatPageAnchor(41, 43)).toBe('tr. 41–43');
  });

  it('treats a null pageTo as a single page', () => {
    expect(formatPageAnchor(41, null)).toBe('tr. 41');
  });

  it('returns null when there is no anchor at all', () => {
    expect(formatPageAnchor(null, null)).toBeNull();
    expect(formatPageAnchor(null, 43)).toBeNull();
  });
});
