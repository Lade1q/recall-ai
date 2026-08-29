import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { FocusSessionListItem } from '@/features/focus/types/focus.types';
import { FocusSessionList } from './FocusSessionList';

function session(overrides: Partial<FocusSessionListItem> = {}): FocusSessionListItem {
  return {
    id: 'fs-1',
    planId: 'plan-1',
    concepts: [{ id: 'c-1', name: 'Ngăn xếp' }],
    status: 'completed',
    durationMinutes: 25,
    focusedSeconds: 1500,
    awayCount: 0,
    pomodorosCompleted: 1,
    strictMode: false,
    startedAt: new Date(2026, 6, 27, 19, 5).toISOString(),
    endedAt: new Date(2026, 6, 27, 19, 30).toISOString(),
    ...overrides,
  };
}

const PLANS = new Map([['plan-1', 'Cấu trúc dữ liệu & Giải thuật']]);

function renderList(sessions: FocusSessionListItem[], plans = PLANS) {
  return render(
    <FocusSessionList
      sessions={sessions}
      planNameById={plans}
      loading={false}
      loadingMore={false}
      error={false}
      hasMore={false}
      onLoadMore={vi.fn()}
      onRetry={vi.fn()}
    />
  );
}

describe('FocusSessionList — thời lượng', () => {
  it('phiên hoàn thành in số phút', () => {
    renderList([session({ durationMinutes: 25 })]);
    expect(screen.getByText(/19:05 · 25 phút/)).toBeInTheDocument();
  });

  it('phiên hủy in "—", KHÔNG in "0 phút"', () => {
    // Hợp đồng: `durationMinutes = 0` cho phiên hủy (FS-01 Alt flow 4). In con số đó ra trông
    // như lỗi, nên hàng hiện `—`.
    renderList([session({ status: 'cancelled', durationMinutes: 0, focusedSeconds: 420 })]);

    const row = screen.getByText('Đã hủy giữa chừng').closest('article');
    expect(row).not.toBeNull();
    expect(row).toHaveTextContent('19:05 · —');
    // Khẳng định phải bó trong HÀNG: tiêu đề nhóm ngày ĐƯỢC PHÉP in "0 phút" khi cả ngày chỉ có
    // phiên hủy — đó là phép cộng đúng, không phải lỗi.
    expect(row).not.toHaveTextContent('0 phút');
  });

  it('hai kiểu phiên hủy in GIỐNG nhau, dù focusedSeconds khác nhau', () => {
    // Tự hủy giữ `focusedSeconds` thật; phiên bị `reapStaleSessions` thu dọn giữ `@default(0)`
    // vì raw SQL của nó không ghi cột đó. Nếu ai đó đổi sang hiển thị `focusedSeconds`, hai hàng
    // này sẽ lệch nhau và test đỏ.
    renderList([
      session({ id: 'a', status: 'cancelled', durationMinutes: 0, focusedSeconds: 420 }),
      session({
        id: 'b',
        status: 'cancelled',
        durationMinutes: 0,
        focusedSeconds: 0,
        startedAt: new Date(2026, 6, 27, 16, 10).toISOString(),
      }),
    ]);
    expect(screen.getByText(/19:05 · —/)).toBeInTheDocument();
    expect(screen.getByText(/16:10 · —/)).toBeInTheDocument();
  });

  it('tổng của ngày KHÔNG cộng phiên hủy', () => {
    renderList([
      session({ id: 'a', durationMinutes: 25 }),
      session({
        id: 'b',
        status: 'cancelled',
        durationMinutes: 0,
        focusedSeconds: 420,
        startedAt: new Date(2026, 6, 27, 17, 40).toISOString(),
      }),
    ]);
    // Mockup ghi 32 phút ở ca này; hợp đồng cho 25 — xem `minutesTowardDayTotal`.
    expect(screen.getByText(/— 25 phút/)).toBeInTheDocument();
    expect(screen.queryByText(/— 32 phút/)).not.toBeInTheDocument();
  });
});

describe('FocusSessionList — nhãn kế hoạch', () => {
  it('hiện tên kế hoạch cạnh tên khái niệm', () => {
    renderList([session()]);
    expect(screen.getByText('Ngăn xếp · Cấu trúc dữ liệu & Giải thuật')).toBeInTheDocument();
  });

  it('phiên không gắn kế hoạch hiện "Phiên tự do"', () => {
    renderList([session({ planId: null, concepts: [] })]);
    expect(screen.getByText('Phiên tự do')).toBeInTheDocument();
  });

  it('🔴 /plans chưa về: BỎ đoạn kế hoạch, KHÔNG khai nhầm là "Phiên tự do"', () => {
    // Hồi quy: gộp "không có kế hoạch" với "chưa tra được tên" thì mọi hàng sẽ nói dối khi
    // `/plans` hỏng — cùng lớp lỗi #435.
    renderList([session()], new Map());
    expect(screen.getByText('Ngăn xếp')).toBeInTheDocument();
    expect(screen.queryByText(/Phiên tự do/)).not.toBeInTheDocument();
  });
});

describe('FocusSessionList — chu kỳ Pomodoro', () => {
  it('in số chu kỳ khi có', () => {
    renderList([session({ pomodorosCompleted: 2 })]);
    expect(screen.getByText('2 chu kỳ')).toBeInTheDocument();
  });

  it('in "—" khi chưa xong chu kỳ nào', () => {
    renderList([session({ pomodorosCompleted: 0 })]);
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
