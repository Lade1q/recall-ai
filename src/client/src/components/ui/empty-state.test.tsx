import { describe, expect, it } from 'vitest';
import { Inbox } from 'lucide-react';

import { render, screen } from '@/utils/test-utils';
import { EmptyState } from './empty-state';

/**
 * #387 — `EmptyState` là primitive dùng chung của MỌI trạng thái rỗng, và nó đi vào thang chữ ở
 * commit `03244cc` mà không một test nào chạm, cũng không ai nhìn thấy: tài khoản dev có đủ dữ
 * liệu ở mọi màn demo nên không lối nào dựng được trạng thái rỗng để chụp ảnh.
 *
 * ⚠️ `PlansPage.test.tsx` KHÔNG canh chỗ này, dù trông rất giống: `PlansPage.tsx:399` khai một
 * hàm `EmptyState` CỤC BỘ trùng tên, render `h2`. Bốn nơi dùng primitive thật là
 * `EmptyQueueMessage`, `AllRemovedState`, `ScheduleView` và `NoSessionsYet`.
 */
describe('EmptyState — bậc chữ của tiêu đề (#387)', () => {
  it('🔴 tiêu đề đi qua primitive Heading ở bậc `section`, KHÔNG phải `card`', () => {
    render(<EmptyState icon={Inbox} heading="Chưa có gì ở đây" body="Câu giải thích." />);

    // `level: 3` ghim CẤP THẺ. `getByRole('heading')` không phân biệt cấp, nên bỏ `level` đi là
    // biến assert thành "có một tiêu đề nào đó" — đúng mà rỗng.
    const heading = screen.getByRole('heading', { level: 3, name: 'Chưa có gì ở đây' });

    // Ba vế đo ba thứ KHÁC nhau, đừng gộp:
    expect(heading).toHaveAttribute('data-slot', 'heading'); // (1) có dùng primitive
    expect(heading).toHaveClass('text-[21px]'); // (2) đúng BẬC section
    expect(heading).toHaveClass('font-heading'); // (3) đúng bộ chữ ấn phẩm

    // (4) Thứ KHÔNG được có mặt phải hỏi riêng: vế (2) một mình vẫn xanh nếu ai đó chồng thêm
    // một cỡ thứ hai vào `className`, vì `toHaveClass` chỉ hỏi "có chứa".
    expect(heading).not.toHaveClass('text-[18px]'); // card
    expect(heading).not.toHaveClass('text-[30px]'); // page
    expect(heading).not.toHaveClass('text-[40px]'); // display
  });

  it('🔴 không tự chế cỡ chữ: cỡ duy nhất trên tiêu đề là cỡ do bậc cấp', () => {
    const { container } = render(<EmptyState heading="Chưa có gì ở đây" />);
    const heading = container.querySelector('[data-slot="heading"]')!;

    // Bắt cả hai cách viết cỡ trong Tailwind — `text-[Npx]` và cỡ đặt tên. Đếm một cách rồi
    // kết luận "đúng một cỡ" là phép đếm phủ một ô mà phát biểu như đã phủ hết (#380/#387).
    const sizes = [...heading.classList].filter(
      (c) => /^text-\[[\d.]+px\]$/.test(c) || /^text-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl)$/.test(c)
    );
    expect(sizes).toEqual(['text-[21px]']);
  });

  // `my-10` chứ không phải một class bịa ra: đó là đúng chuỗi `ScheduleView.tsx:158` đang truyền.
  // Class chỉ sống trong test sẽ nuôi bộ quét Tailwind sinh CSS chết — bộ audit ở
  // `test-utils/tailwind-class-audit` bắt đúng chuyện đó (#472), và nó đã bắt tôi ở bản đầu.
  it('lề ngoài vẫn do nơi gọi quyết, primitive không nướng cứng', () => {
    const { container } = render(<EmptyState heading="X" className="my-10" />);
    expect(container.firstElementChild).toHaveClass('my-10');
  });
});
