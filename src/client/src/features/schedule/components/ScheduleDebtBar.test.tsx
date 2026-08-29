import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/utils/test-utils';
import { ScheduleDebtBar } from './ScheduleDebtBar';
import type { ScheduleItem } from '../types/schedule.types';

function makeItem(overrides: Partial<ScheduleItem> = {}): ScheduleItem {
  return {
    id: 'item-1',
    conceptId: 'concept-1',
    name: 'Danh sách liên kết',
    planId: 'plan-1',
    planName: 'Cấu trúc dữ liệu',
    scheduledFor: '2026-08-22T03:00:00.000Z',
    dateKey: '2026-08-22',
    priority: 0.5,
    reason: 'spaced_repetition',
    reasonText: 'Đã đến lịch ôn tập theo mức độ ghi nhớ',
    sourceConceptName: null,
    depth: null,
    masteryScore: 0.85,
    status: 'pending',
    estimatedMinutes: 3,
    sourceSessionEndedAt: null,
    ...overrides,
  };
}

function renderBar(debtItems: ScheduleItem[], hasAnyItem = true) {
  return render(
    <ScheduleDebtBar debtItems={debtItems} hasAnyItem={hasAnyItem} onOpenDebt={vi.fn()} />
  );
}

/**
 * Thanh "Còn nợ" gộp theo **khái niệm**, không theo ngày (#400).
 *
 * Ca then chốt dưới đây — hai mục **cùng khái niệm, khác ngày** — không xuất hiện trên dữ liệu
 * thật hôm nay, và đó chính là lý do phải ghim nó: `getReviewSchedule` đã fold mỗi cụm
 * `(planId, conceptId)` về một mục, nên `debtItems.length` cho kết quả đúng **nhờ một bất biến
 * của server** chứ không nhờ gì ở phía client. Bài test này là chỗ duy nhất phân biệt được hai
 * phép đếm, nên nó cũng là chỗ duy nhất bắt được ngày bất biến kia thay đổi.
 */
describe('ScheduleDebtBar — đếm theo khái niệm', () => {
  it('hai mục CÙNG khái niệm khác ngày ⇒ nói 1 khái niệm', () => {
    renderBar([
      makeItem({ id: 'row-cu', dateKey: '2026-08-22', estimatedMinutes: 3 }),
      makeItem({ id: 'row-moi', dateKey: '2026-08-25', estimatedMinutes: 9 }),
    ]);
    expect(screen.getByText(/khái niệm ·/).textContent).toBe('1 khái niệm · ≈ 12 phút');
  });

  it('hai khái niệm khác nhau ⇒ nói 2', () => {
    renderBar([
      makeItem({ id: 'a', conceptId: 'concept-a', estimatedMinutes: 3 }),
      makeItem({ id: 'b', conceptId: 'concept-b', estimatedMinutes: 9 }),
    ]);
    expect(screen.getByText(/khái niệm ·/).textContent).toBe('2 khái niệm · ≈ 12 phút');
  });

  it('cùng conceptId ở hai planId vẫn đếm là MỘT — ghim luật gộp, không phải ghim dữ liệu', () => {
    // ⚠️ Đầu vào này KHÔNG tồn tại trong dữ liệu thật: `model Concept` có cột `planId` với khoá
    // ngoại, nên một `conceptId` thuộc đúng một kế hoạch — `conceptId` một mình đã hàm ý `planId`.
    // Giữ ca lại vì nó ghim **luật gộp**, không ghim dữ liệu: đổi khoá đếm sang
    // `` `${planId}:${conceptId}` `` làm test này đỏ. Tức nếu sau này ai refactor sang khoá cụm
    // đầy đủ, họ phải nói ra là mình đang đổi hành vi gộp, thay vì nó trôi đi im lặng.
    renderBar([
      makeItem({ id: 'a', planId: 'plan-1', estimatedMinutes: 3 }),
      makeItem({ id: 'b', planId: 'plan-2', estimatedMinutes: 9 }),
    ]);
    expect(screen.getByText(/khái niệm ·/).textContent).toBe('1 khái niệm · ≈ 12 phút');
  });
});

describe('ScheduleDebtBar — trạng thái không nợ', () => {
  it('lịch CÓ mục mà không nợ gì ⇒ nói "Không nợ gì"', () => {
    renderBar([], true);
    expect(screen.getByText('Không nợ gì')).toBeInTheDocument();
  });

  it('lịch RỖNG hẳn ⇒ im lặng, không chúc mừng người chưa làm gì', () => {
    // "0 khái niệm quá hạn" với người chưa vấn đáp bao giờ là lời khen cho việc họ chưa làm —
    // đúng kiểu hỏng #345 đã đi diệt một lần ở màn hàng đợi ôn.
    const { container } = renderBar([], false);
    expect(container).toBeEmptyDOMElement();
  });
});
