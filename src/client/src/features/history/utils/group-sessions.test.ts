import { describe, expect, it } from 'vitest';
import { groupSessionsByTime, timeBucketLabel } from './group-sessions';
import type { InterviewSessionListItem } from '../types/history.types';

/** Thứ Năm 13/08/2026, 21:00 giờ địa phương. Tuần chứa nó bắt đầu thứ Hai 10/08. */
const NOW = new Date(2026, 7, 13, 21, 0, 0);

function iso(year: number, month: number, day: number, hour = 12): string {
  return new Date(year, month - 1, day, hour).toISOString();
}

describe('timeBucketLabel', () => {
  it('cùng ngày ⇒ "Hôm nay", kể cả lúc 00:05 sáng', () => {
    expect(timeBucketLabel(iso(2026, 8, 13, 9), NOW)).toBe('Hôm nay');
    expect(timeBucketLabel(iso(2026, 8, 13, 0), NOW)).toBe('Hôm nay');
  });

  it('thứ Hai đầu tuần vẫn thuộc "Tuần này"', () => {
    expect(timeBucketLabel(iso(2026, 8, 10, 0), NOW)).toBe('Tuần này');
  });

  it('Chủ nhật liền trước thuộc "Tuần trước", không mở tuần mới', () => {
    expect(timeBucketLabel(iso(2026, 8, 9, 23), NOW)).toBe('Tuần trước');
  });

  it('thứ Hai của tuần trước là biên dưới của "Tuần trước"', () => {
    expect(timeBucketLabel(iso(2026, 8, 3, 0), NOW)).toBe('Tuần trước');
    expect(timeBucketLabel(iso(2026, 8, 2, 23), NOW)).toBe('Tháng 8/2026');
  });

  it('cũ hơn hai tuần gom theo tháng', () => {
    expect(timeBucketLabel(iso(2026, 7, 26), NOW)).toBe('Tháng 7/2026');
  });

  it('ngày giờ hỏng không làm sập danh sách', () => {
    expect(timeBucketLabel('không-phải-ngày', NOW)).toBe('Không rõ thời gian');
  });
});

function session(id: string, startedAt: string): InterviewSessionListItem {
  return {
    id,
    startedAt,
    endedAt: null,
    status: 'completed',
    fallbackMode: false,
    plan: { id: 'p1', name: 'CTDL & GT' },
    conceptTotal: 3,
    averageMasteryScore: 0.6,
    concepts: [],
  };
}

describe('groupSessionsByTime', () => {
  it('giữ nguyên thứ tự server trả và chỉ chèn tiêu đề khi nhãn đổi', () => {
    const groups = groupSessionsByTime(
      [
        session('a', iso(2026, 8, 13, 20)),
        session('b', iso(2026, 8, 13, 8)),
        session('c', iso(2026, 8, 11)),
        session('d', iso(2026, 8, 5)),
      ],
      NOW
    );

    expect(groups.map((group) => group.label)).toEqual(['Hôm nay', 'Tuần này', 'Tuần trước']);
    expect(groups[0]?.sessions.map((s) => s.id)).toEqual(['a', 'b']);
    expect(groups[1]?.sessions.map((s) => s.id)).toEqual(['c']);
    expect(groups[2]?.sessions.map((s) => s.id)).toEqual(['d']);
  });

  it('danh sách rỗng ⇒ không nhóm nào', () => {
    expect(groupSessionsByTime([], NOW)).toEqual([]);
  });
});
