import { afterEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';

import { interviewApi } from '@/features/interview/api/interview.api';
import { render, screen } from '@/utils/test-utils';
import { GradingFeedbackPanel } from './GradingFeedbackPanel';

/**
 * AE-10 · UC-15 (#248) — bảy trạng thái của khiếu nại điểm, kê RIÊNG từng cái, kể cả ba ca HỎNG.
 *
 * `interviewApi.submitGradingFeedback` được spy chứ không `vi.mock` cả module: component đọc câu
 * lỗi qua `getInterviewErrorMessage` của chính module ấy, nên mock cả cụm sẽ làm mọi assert về
 * câu lỗi trở thành assert về mock của tôi.
 */

const ENTRY = 'Không đồng ý với điểm này';
const CHIPS = ['Câu hỏi không rõ', 'Chấm quá nặng', 'Ngoài phạm vi tài liệu'];

const axiosErr = (status: number, code?: string) => ({
  isAxiosError: true,
  response: { status, data: code ? { error: { code } } : undefined },
});

function renderPanel(overrides: Partial<Parameters<typeof GradingFeedbackPanel>[0]> = {}) {
  return render(
    <GradingFeedbackPanel
      turnId="turn-1"
      score={0.33}
      canAppeal
      gradingFeedback={null}
      {...overrides}
    />
  );
}

afterEach(() => vi.restoreAllMocks());

describe('AE-10 · lối vào và cổng', () => {
  it('(7) lượt không khiếu nại được thì KHÔNG có lối vào nào', () => {
    const { container } = renderPanel({ canAppeal: false });
    expect(container).toBeEmptyDOMElement();
  });

  /**
   * Cổng là CỜ `canAppeal`, không phải suy lại. Lượt dưới đây có đủ dấu hiệu "khiếu nại được"
   * theo mắt người (điểm thật), nhưng server nói không — và client phải nghe server.
   */
  it('(7) không suy lại từ điểm: có điểm mà canAppeal=false vẫn không hiện nút', () => {
    const { container } = renderPanel({ canAppeal: false, score: 0.9 });
    expect(container).toBeEmptyDOMElement();
  });

  it('(1) chưa gửi thì chỉ có lối vào, chưa có form', () => {
    renderPanel();
    expect(screen.getByRole('button', { name: ENTRY })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Gửi phản hồi' })).not.toBeInTheDocument();
  });
});

describe('AE-10 · form', () => {
  it('mở form ra đủ ba chip, nhãn, placeholder và hai nút — nguyên văn mockup', async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole('button', { name: ENTRY }));

    for (const chip of CHIPS) {
      expect(screen.getByRole('button', { name: chip })).toBeInTheDocument();
    }
    expect(screen.getByLabelText('Lý do (không bắt buộc)')).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText('Tôi có nói tới ngăn xếp ở lượt 2 nhưng không được tính...')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gửi phản hồi' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hủy' })).toBeInTheDocument();
  });

  /**
   * Ba bẫy chữ đã đo tới codepoint trên `screen-history.html`. Assert bằng mã điểm chứ không bằng
   * chuỗi nhìn-giống: `…` (U+2026) và `...` hiện lên gần như y hệt, `Hủy` và `Huỷ` cũng vậy.
   */
  it('🔴 giữ đúng codepoint: `...` ASCII, `Hủy` với U+1EE7, em dash U+2014', async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole('button', { name: ENTRY }));

    const placeholder = screen
      .getByLabelText('Lý do (không bắt buộc)')
      .getAttribute('placeholder')!;
    expect(placeholder.endsWith('...')).toBe(true);
    expect(placeholder).not.toContain('…');

    expect(screen.getByRole('button', { name: 'Hủy' }).textContent).toBe('Hủy');
  });

  it('(4-chặn trước) nút gửi khoá khi chưa chọn chip và chưa gõ gì', async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole('button', { name: ENTRY }));

    expect(screen.getByRole('button', { name: 'Gửi phản hồi' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Chấm quá nặng' }));
    expect(screen.getByRole('button', { name: 'Gửi phản hồi' })).toBeEnabled();
  });

  it('chỉ gõ lý do, không chọn chip, vẫn gửi được (UC-15: lý do là tùy chọn)', async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole('button', { name: ENTRY }));
    await user.type(screen.getByLabelText('Lý do (không bắt buộc)'), 'thiếu ngữ cảnh');

    expect(screen.getByRole('button', { name: 'Gửi phản hồi' })).toBeEnabled();
  });

  it('Hủy đóng form và quay về lối vào, không gọi API', async () => {
    const user = userEvent.setup();
    const spy = vi.spyOn(interviewApi, 'submitGradingFeedback');
    renderPanel();
    await user.click(screen.getByRole('button', { name: ENTRY }));
    await user.click(screen.getByRole('button', { name: 'Hủy' }));

    expect(screen.getByRole('button', { name: ENTRY })).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('AE-10 · gửi', () => {
  it('(3) gửi xong hiện đúng câu xác nhận, có nội suy điểm', async () => {
    const user = userEvent.setup();
    vi.spyOn(interviewApi, 'submitGradingFeedback').mockResolvedValue({
      reasons: ['Chấm quá nặng'],
      note: null,
    });
    renderPanel();
    await user.click(screen.getByRole('button', { name: ENTRY }));
    await user.click(screen.getByRole('button', { name: 'Chấm quá nặng' }));
    await user.click(screen.getByRole('button', { name: 'Gửi phản hồi' }));

    const confirmation = await screen.findByText(/Đã ghi nhận phản hồi/);
    // Câu nguyên văn mockup, em dash là U+2014 — so cả chuỗi, không so từng mảnh.
    expect(confirmation.textContent).toBe(
      'Đã ghi nhận phản hồi. Điểm 0.33 giữ nguyên — phản hồi được dùng để chỉnh rubric chấm, không sửa điểm của phiên đã xong.'
    );
  });

  it('gửi đúng payload: chip đã chọn, và bỏ note khi chỉ có khoảng trắng', async () => {
    const user = userEvent.setup();
    const spy = vi
      .spyOn(interviewApi, 'submitGradingFeedback')
      .mockResolvedValue({ reasons: ['Câu hỏi không rõ'], note: null });
    renderPanel();
    await user.click(screen.getByRole('button', { name: ENTRY }));
    await user.click(screen.getByRole('button', { name: 'Câu hỏi không rõ' }));
    await user.type(screen.getByLabelText('Lý do (không bắt buộc)'), '   ');
    await user.click(screen.getByRole('button', { name: 'Gửi phản hồi' }));

    expect(spy).toHaveBeenCalledWith('turn-1', {
      reasons: ['Câu hỏi không rõ'],
      note: undefined,
    });
  });

  it('(2) đang gửi thì khoá nút và nói ra là đang gửi', async () => {
    const user = userEvent.setup();
    let release!: (value: { reasons: string[]; note: string | null }) => void;
    vi.spyOn(interviewApi, 'submitGradingFeedback').mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      })
    );
    renderPanel();
    await user.click(screen.getByRole('button', { name: ENTRY }));
    await user.click(screen.getByRole('button', { name: 'Chấm quá nặng' }));
    await user.click(screen.getByRole('button', { name: 'Gửi phản hồi' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Đang gửi');
    // `aria-busy` là thứ `Button` chỉ đặt khi nhận `loading` — nó ghim luôn cái spinner đi kèm,
    // thứ mà `toBeDisabled()` không phân biệt được với một nút disabled vì lý do khác.
    expect(screen.getByRole('button', { name: 'Gửi phản hồi' })).toHaveAttribute(
      'aria-busy',
      'true'
    );
    expect(screen.getByRole('button', { name: 'Gửi phản hồi' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Hủy' })).toBeDisabled();

    release({ reasons: ['Chấm quá nặng'], note: null });
    expect(await screen.findByText(/Đã ghi nhận phản hồi/)).toBeInTheDocument();
  });
});

describe('AE-10 · ba ca HỎNG đều có đường ra', () => {
  it.each([
    ['(4) 400', axiosErr(400, 'VALIDATION_ERROR'), 'Thông tin gửi lên chưa hợp lệ.'],
    [
      '(5) 409',
      axiosErr(409, 'TURN_NOT_APPEALABLE'),
      'Lượt này không gửi phản hồi điểm được: nó chưa được AI chấm, do bạn tự chấm, hoặc là lượt gợi ý.',
    ],
    ['(6) mất mạng', { isAxiosError: true }, 'Không kết nối được tới máy chủ. Vui lòng thử lại.'],
  ])('%s hiện câu lỗi và GIỮ form lại để sửa, không thành panel trắng', async (_l, err, msg) => {
    const user = userEvent.setup();
    vi.spyOn(interviewApi, 'submitGradingFeedback').mockRejectedValue(err);
    renderPanel();
    await user.click(screen.getByRole('button', { name: ENTRY }));
    await user.click(screen.getByRole('button', { name: 'Chấm quá nặng' }));
    await user.click(screen.getByRole('button', { name: 'Gửi phản hồi' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(msg);
    // Đường ra: form còn đó, chip còn được chọn, gửi lại được ngay.
    expect(screen.getByRole('button', { name: 'Gửi phản hồi' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Chấm quá nặng' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });
});

describe('AE-10 · prefill (AC "cho sửa lại")', () => {
  it('lượt đã gửi phản hồi thì hiện xác nhận thay vì nút', () => {
    renderPanel({ gradingFeedback: { reasons: ['Chấm quá nặng'], note: 'thiếu ngữ cảnh' } });

    expect(screen.getByText(/Đã ghi nhận phản hồi/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: ENTRY })).not.toBeInTheDocument();
  });

  it('🔴 mở lại để sửa thì form dựng lại TỪ dữ liệu đã gửi, không phải form trắng', async () => {
    const user = userEvent.setup();
    renderPanel({ gradingFeedback: { reasons: ['Chấm quá nặng'], note: 'thiếu ngữ cảnh' } });
    await user.click(screen.getByRole('button', { name: 'Sửa phản hồi' }));

    expect(screen.getByRole('button', { name: 'Chấm quá nặng' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByRole('button', { name: 'Câu hỏi không rõ' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    expect(screen.getByLabelText('Lý do (không bắt buộc)')).toHaveValue('thiếu ngữ cảnh');
  });
});
