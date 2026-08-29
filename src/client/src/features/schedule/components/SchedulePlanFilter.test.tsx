import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/utils/test-utils';
import { SchedulePlanFilter } from './SchedulePlanFilter';
import type { PlanSummary, PlanStatus } from '@/features/study-planner/types/concept';
import type { ScheduleItem } from '../types/schedule.types';

function makePlan(id: string, name: string, status: PlanStatus = 'active'): PlanSummary {
  return {
    id,
    name,
    deadline: null,
    status,
    conceptCount: 3,
    masteryDistribution: { strong: 0, learning: 0, weak: 0, untested: 3 },
    analysisStatus: 'done',
    analysisStartedAt: null,
    analysisErrorMessage: null,
    document: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    reviewQueueConceptCount: 1,
  };
}

function makeItem(planId: string, id: string): ScheduleItem {
  return {
    id,
    conceptId: `concept-${id}`,
    name: 'Khái niệm',
    planId,
    planName: 'Kế hoạch',
    scheduledFor: '2026-08-30T03:00:00.000Z',
    dateKey: '2026-08-30',
    priority: 0.5,
    reason: 'spaced_repetition',
    reasonText: 'Đã đến lịch ôn tập theo mức độ ghi nhớ',
    sourceConceptName: null,
    depth: null,
    masteryScore: 0.5,
    status: 'pending',
    estimatedMinutes: 9,
    sourceSessionEndedAt: null,
  };
}

const PLANS = [
  makePlan('p1', 'FS-04'),
  makePlan('p2', 'E2E PR263'),
  makePlan('p3', 'Cấu trúc dữ liệu'),
  makePlan('p4', 'Chưa xác nhận', 'draft'),
];

const ITEMS = [makeItem('p1', 'a'), makeItem('p1', 'b'), makeItem('p3', 'c')];

function renderFilter(hidden: string[]) {
  return render(
    <SchedulePlanFilter
      plans={PLANS}
      items={ITEMS}
      hiddenPlanIds={new Set(hidden)}
      onTogglePlan={vi.fn()}
      onSetHiddenPlans={vi.fn()}
    />
  );
}

/**
 * DoD #405: *"luôn khai đang ẩn N/M kế hoạch"*.
 *
 * Con số này phải ĐÚNG, không chỉ phải có mặt: kế hoạch bị ẩn mà lịch trống trơn trong im lặng là
 * kiểu hỏng khó chịu nhất, và một dòng khai sai số còn tệ hơn không khai — nó nói với người dùng
 * rằng họ đã hiểu tình hình. Đột biến bỏ phép trừ `hiddenCount` sống sót qua toàn bộ suite trước
 * bài này, và nó hiện số sai thẳng lên màn hình.
 *
 * Mẫu số M là số kế hoạch **`active`** — khớp đúng bộ lọc của `getReviewSchedule`; đếm cả `draft`
 * sẽ hứa những công tắc không nối vào đâu.
 */
describe('SchedulePlanFilter — dòng "Đang ẩn N/M"', () => {
  it('ẩn 1 trong 3 kế hoạch active ⇒ khai đúng 1/3', () => {
    renderFilter(['p3']);
    expect(screen.getByText(/Đang ẩn/).textContent).toContain('Đang ẩn 1/3 kế hoạch');
  });

  it('ẩn 2 ⇒ khai 2/3, không phải 1/3', () => {
    renderFilter(['p1', 'p3']);
    expect(screen.getByText(/Đang ẩn/).textContent).toContain('Đang ẩn 2/3 kế hoạch');
  });

  it('không ẩn gì ⇒ không có dòng đó', () => {
    renderFilter([]);
    expect(screen.queryByText(/Đang ẩn/)).toBeNull();
  });

  it('kế hoạch draft KHÔNG vào mẫu số', () => {
    // 4 kế hoạch nhưng chỉ 3 `active`; `p4` là `draft` nên không bao giờ có mục trên lịch.
    renderFilter(['p1']);
    expect(screen.getByText(/Đang ẩn/).textContent).toContain('1/3');
    expect(screen.getByText(/Đang ẩn/).textContent).not.toContain('/4');
  });
});

describe('SchedulePlanFilter — bộ đếm trên nút mở', () => {
  it('nói còn HIỆN mấy trên tổng mấy', () => {
    renderFilter(['p3']);
    expect(screen.getByRole('button', { name: /Kế hoạch/ }).textContent).toContain('2/3');
  });

  it('không ẩn gì ⇒ 3/3', () => {
    renderFilter([]);
    expect(screen.getByRole('button', { name: /Kế hoạch/ }).textContent).toContain('3/3');
  });

  it('không có kế hoạch active nào ⇒ không render bộ lọc', () => {
    const { container } = render(
      <SchedulePlanFilter
        plans={[makePlan('p4', 'Chưa xác nhận', 'draft')]}
        items={[]}
        hiddenPlanIds={new Set()}
        onTogglePlan={vi.fn()}
        onSetHiddenPlans={vi.fn()}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
