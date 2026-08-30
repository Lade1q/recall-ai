import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/utils/test-utils';
import { DayPanel } from './DayPanel';
import type { PlanSummary } from '@/features/study-planner/types/concept';
import type { DeadlineMark } from '../utils/schedule-date';

const TODAY = '2026-08-30';

function plan(name: string): PlanSummary {
  return {
    id: `plan-${name}`,
    name,
    deadline: '2026-09-02T23:59:59.999Z',
    status: 'active',
    conceptCount: 1,
    masteryDistribution: { strong: 0, learning: 0, weak: 0, untested: 1 },
    analysisStatus: 'done',
    analysisStartedAt: null,
    analysisErrorMessage: null,
    document: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    reviewQueueConceptCount: 0,
  };
}

function renderPanel(dateKey: string, deadline: DeadlineMark | undefined) {
  return render(
    <DayPanel
      scope={{ kind: 'day', dateKey }}
      todayDateKey={TODAY}
      items={[]}
      deadline={deadline}
      expandedItemId={null}
      pendingItemIds={new Set()}
      onToggleItem={vi.fn()}
      onClose={vi.fn()}
      onReschedule={vi.fn()}
      onRemove={vi.fn()}
    />
  );
}

describe('DayPanel — hạn chót (#439)', () => {
  it('names the plans, because that is the one thing the grid cannot say', () => {
    renderPanel('2026-09-02', {
      plans: [plan('Kiến trúc phần mềm'), plan('Cơ sở dữ liệu')],
      isPast: false,
    });
    expect(screen.getByText(/Kiến trúc phần mềm · Cơ sở dữ liệu/)).toBeInTheDocument();
  });

  /**
   * ⭐ Panel đọc `mark.isPast`, KHÔNG so lại `scope.dateKey` với `todayDateKey`. Hai phép so cùng
   * nghĩa là hai chỗ để lệch, và bản sao thứ ba làm docstring "suy đúng một chỗ" thành lời nói dối.
   *
   * Ca dưới đây được dựng để một bản tự-suy sẽ SAI: ngày ở TƯƠNG LAI nhưng cờ nói ĐÃ QUA. Không
   * dựng nổi ca đó từ dữ liệu thật — và đó chính là lý do phải dựng nó ở đây.
   */
  it('trusts the flag it was handed, not a second comparison of its own', () => {
    renderPanel('2026-09-02', { plans: [plan('Mạng máy tính')], isPast: true });
    expect(screen.getByText('Hạn chót đã qua')).toBeInTheDocument();
    expect(screen.queryByText('Hạn chót')).toBeNull();
  });

  it('says nothing about deadlines on a day that has none', () => {
    renderPanel('2026-09-02', undefined);
    expect(screen.queryByText(/Hạn chót/)).toBeNull();
  });
});
