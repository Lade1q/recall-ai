import { beforeAll, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import userEvent from '@testing-library/user-event';
import { fireEvent, render, screen, waitFor, within } from '@/utils/test-utils';
import { PomodoroConfigPanel } from './PomodoroConfigPanel';
import type { PomodoroConfig } from '../types/focus.types';

/**
 * H3 — kiểm chứng lớp kẹp DRAFT của PomodoroConfigPanel: các ô số kẹp về [min,max], bỏ qua ô
 * trống / NaN, và dòng ETA preview không bao giờ hiện "NaN"/"Invalid".
 *
 * Thân panel chỉ mount sau khi popover mở (openedAt được đặt trong handleOpenChange). Nên dùng một
 * wrapper có state `open` thật + nút trigger thật, rồi mở bằng userEvent.
 */

// Radix Popover (DismissableLayer / floating-ui) chạm vào các API con trỏ mà jsdom không cấp.
// Vá cục bộ TRONG file test này (không đụng setupTests) để trigger mở được.
beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => {};
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => {};
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
});

const BASE_CONFIG: PomodoroConfig = {
  work: 25,
  short_break: 5,
  long_break: 15,
  cycles: 4,
  sound: false,
};

/** Wrapper quản lý `open` như cha thật: click trigger -> Radix gọi onOpenChange -> setOpen(true). */
function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <PomodoroConfigPanel
      open={open}
      onOpenChange={setOpen}
      trigger={<button type="button">cfg</button>}
      config={BASE_CONFIG}
      onApply={vi.fn()}
      session={null}
      strictMode={false}
    />
  );
}

/** Render + mở popover; trả về `user` và đợi thân panel xuất hiện. */
async function openPanel() {
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole('button', { name: /cfg/ }));
  // Thân panel chỉ mount khi open && openedAt !== null.
  await screen.findByText('Học');
  return user;
}

/** Lấy <input type=number> nằm trong ConfigRow có nhãn `label`. */
function inputForLabel(label: string): HTMLInputElement {
  const row = screen.getByText(label).closest('div');
  if (!row) throw new Error(`Không tìm thấy hàng cấu hình cho nhãn "${label}"`);
  return within(row).getByRole('spinbutton') as HTMLInputElement;
}

describe('PomodoroConfigPanel — H3 DRAFT clamp', () => {
  it('mở popover mới lộ thân panel (4 ô số)', async () => {
    await openPanel();
    // 4 ô: Học / Nghỉ ngắn / Nghỉ dài / Số chu kỳ.
    expect(screen.getAllByRole('spinbutton')).toHaveLength(4);
    expect(screen.getByText('Học')).toBeInTheDocument();
    expect(screen.getByText('Số chu kỳ')).toBeInTheDocument();
  });

  it('ô "Học" (work) kẹp giá trị khổng lồ về max 120', async () => {
    await openPanel();
    const work = inputForLabel('Học');
    expect(work.value).toBe('25');

    fireEvent.change(work, { target: { value: '999999' } });

    await waitFor(() => expect(work.value).toBe('120'));
  });

  it('ô "Số chu kỳ" (cycles) kẹp 0 lên min 1', async () => {
    await openPanel();
    const cycles = inputForLabel('Số chu kỳ');
    expect(cycles.value).toBe('4');

    fireEvent.change(cycles, { target: { value: '0' } });

    await waitFor(() => expect(cycles.value).toBe('1'));
  });

  it('xoá ô trống giữ nguyên giá trị cũ (không nhảy về 0)', async () => {
    await openPanel();
    const shortBreak = inputForLabel('Nghỉ ngắn');
    expect(shortBreak.value).toBe('5');

    fireEvent.change(shortBreak, { target: { value: '' } });

    // Controlled input: handler trả về sớm, không setDraft -> React đồng bộ lại về '5', không '0'/''.
    await waitFor(() => expect(shortBreak.value).toBe('5'));
    expect(shortBreak.value).not.toBe('0');
    expect(shortBreak.value).not.toBe('');
  });

  it('ô trống ở "Số chu kỳ" cũng không tự về 0', async () => {
    await openPanel();
    const cycles = inputForLabel('Số chu kỳ');
    expect(cycles.value).toBe('4');

    fireEvent.change(cycles, { target: { value: '' } });

    await waitFor(() => expect(cycles.value).toBe('4'));
  });

  it('preview ETA không hiện NaN/Invalid, kể cả sau khi ép cycles về biên', async () => {
    await openPanel();

    const preview = screen.getByText(/với cấu hình trên/);
    // Trạng thái ban đầu đã hợp lệ.
    expect(preview.textContent).not.toMatch(/NaN/);
    expect(preview.textContent).not.toMatch(/Invalid/);

    // Ép cycles = 0 -> kẹp về 1; ETA đọc thẳng draft nên vẫn phải hợp lệ.
    const cycles = inputForLabel('Số chu kỳ');
    fireEvent.change(cycles, { target: { value: '0' } });
    await waitFor(() => expect(cycles.value).toBe('1'));

    const previewAfter = screen.getByText(/với cấu hình trên/);
    expect(previewAfter.textContent).not.toMatch(/NaN/);
    expect(previewAfter.textContent).not.toMatch(/Invalid/);
    // Và vẫn có mốc giờ HH:mm hợp lệ ở cuối câu.
    expect(previewAfter.textContent).toMatch(/\d{1,2}:\d{2}/);
  });
});
