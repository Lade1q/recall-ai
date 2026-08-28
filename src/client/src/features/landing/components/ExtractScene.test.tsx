import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from '@/utils/test-utils';
import { ExtractScene } from './ExtractScene';
import { CARRY_EDGES, CARRY_LABELS } from '../data/carry-sequence';

const matchMediaGoc = window.matchMedia;

/** Bật `prefers-reduced-motion` ở tầng trình duyệt giả. */
function batGiamChuyenDong() {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

afterEach(() => {
  window.matchMedia = matchMediaGoc;
});

function docSanKhau(container: HTMLElement) {
  const chip = [...container.querySelectorAll('g.lp-chip')];
  const canh = [...container.querySelectorAll('svg g')].filter((g) =>
    g.querySelector(':scope > line')
  );
  const hien = (els: Element[]) => els.filter((e) => e.getAttribute('opacity') === '1').length;
  return { soChip: chip.length, chipHien: hien(chip), soCanh: canh.length, canhHien: hien(canh) };
}

/**
 * Hồi quy cho một lỗi đã lọt qua một vòng review.
 *
 * `ExtractScene` từng đóng băng ở `SEQUENCE_LENGTH - 1` khi người dùng bật
 * giảm chuyển động. Nhịp đó là nhịp DỌN SẠCH sân khấu để chuyến khiêng sau có
 * chỗ bắt đầu — nên đúng nhóm người dùng cần được chăm nhất lại nhận một đồ
 * thị trống trơn: mất sạch nội dung của cảnh, không phải mất hoạt ảnh.
 *
 * Test ghim ở CHỖ GỌI chứ không ở hằng số. Bản trước hằng số vẫn đúng với
 * chính tên nó, chỉ là chỗ gọi chọn nhầm nhịp — nên một test soi hằng số sẽ
 * xanh trong khi trang thì hỏng.
 */
describe('ExtractScene — giảm chuyển động', () => {
  it('đóng băng ở trạng thái ĐÃ DỰNG XONG: đủ chip, đủ cạnh', () => {
    batGiamChuyenDong();
    const { container } = render(<ExtractScene />);

    expect(docSanKhau(container)).toEqual({
      soChip: CARRY_LABELS.length,
      chipHien: CARRY_LABELS.length,
      soCanh: CARRY_EDGES.length,
      canhHien: CARRY_EDGES.length,
    });
  });

  /* Nếu bỏ ca này thì ca trên có thể xanh vì lý do sai — chẳng hạn `opacity`
     ngừng được set và mọi thứ mặc định hiện. Ca này chứng minh phép đo thật sự
     phân biệt được hai trạng thái. */
  it('không bật giảm chuyển động thì nhịp đầu sân khấu còn trống', () => {
    const { container } = render(<ExtractScene />);
    const sanKhau = docSanKhau(container);

    expect(sanKhau.soChip).toBe(CARRY_LABELS.length);
    expect(sanKhau.chipHien).toBe(0);
    expect(sanKhau.canhHien).toBe(0);
  });
});
