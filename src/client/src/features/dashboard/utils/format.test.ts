import { describe, expect, it } from 'vitest';
import { formatFullDate, formatStudyMinutes, greetingForHour } from './format';

describe('greetingForHour', () => {
  it('chọn lời chào theo mốc buổi trong ngày', () => {
    expect(greetingForHour(0)).toBe('Chào buổi sáng');
    expect(greetingForHour(8)).toBe('Chào buổi sáng');
    expect(greetingForHour(10)).toBe('Chào buổi sáng');
    expect(greetingForHour(11)).toBe('Chào buổi trưa');
    expect(greetingForHour(12)).toBe('Chào buổi trưa');
    expect(greetingForHour(13)).toBe('Chào buổi chiều');
    expect(greetingForHour(17)).toBe('Chào buổi chiều');
    expect(greetingForHour(18)).toBe('Chào buổi tối');
    expect(greetingForHour(23)).toBe('Chào buổi tối');
  });
});

describe('formatStudyMinutes', () => {
  it('luôn hiện cả giờ lẫn phút, kể cả khi bằng 0', () => {
    expect(formatStudyMinutes(0)).toBe('0h 0m');
    expect(formatStudyMinutes(10)).toBe('0h 10m');
    expect(formatStudyMinutes(59)).toBe('0h 59m');
    expect(formatStudyMinutes(60)).toBe('1h 0m');
    expect(formatStudyMinutes(380)).toBe('6h 20m');
  });

  it('kẹp số âm về 0 và làm tròn phút lẻ', () => {
    expect(formatStudyMinutes(-5)).toBe('0h 0m');
    expect(formatStudyMinutes(10.6)).toBe('0h 11m');
  });
});

describe('formatFullDate', () => {
  it('ghép thứ (vi-VN) với ngày dd/MM/yyyy', () => {
    // 2026-08-09 là Chủ Nhật; chỉ khẳng định hình dạng để không phụ thuộc ICU của môi trường.
    const result = formatFullDate(new Date(2026, 7, 9));
    expect(result).toMatch(/^\S.*, \d{2}\/\d{2}\/\d{4}$/);
    expect(result.endsWith('09/08/2026')).toBe(true);
  });
});
