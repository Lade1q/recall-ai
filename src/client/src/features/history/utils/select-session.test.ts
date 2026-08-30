import { describe, expect, it } from 'vitest';

import type { InterviewSessionListItem } from '../types/history.types';
import { selectInterviewSession } from './select-session';

function session(id: string): InterviewSessionListItem {
  return {
    id,
    startedAt: '2026-08-30T12:00:00.000Z',
    endedAt: '2026-08-30T12:10:00.000Z',
    status: 'completed',
    fallbackMode: false,
    plan: { id: 'plan-1', name: 'Kế hoạch' },
    conceptTotal: 1,
    averageMasteryScore: 0.5,
    concepts: [],
  };
}

describe('selectInterviewSession', () => {
  const sessions = [session('newest'), session('older'), session('oldest')];

  it('giữ đúng phiên đã chọn dù nó không nằm đầu danh sách', () => {
    expect(selectInterviewSession(sessions, 'oldest')?.id).toBe('oldest');
  });

  it('rơi về phiên mới nhất khi selection không còn trong bộ lọc', () => {
    expect(selectInterviewSession(sessions, 'outside-filter')?.id).toBe('newest');
  });

  it('trả null cho danh sách rỗng', () => {
    expect(selectInterviewSession([], 'oldest')).toBeNull();
  });
});
