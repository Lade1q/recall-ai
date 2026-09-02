/* eslint-disable react-refresh/only-export-components */
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

/**
 * Tiêu đề kiểu ấn phẩm — mục "Editorial heading" trong components.html:
 * "chỉ dùng cho tiêu đề lớn — không dùng cho label UI".
 *
 * Component này KHÔNG nói mặt chữ là gì. Mặt chữ / weight / tracking nằm ở
 * `.font-heading` trong `global.css`; chép lại vào đây nghĩa là lần đổi font
 * sau phải sửa cả hai chỗ, và một trong hai sẽ trôi.
 *
 * Thang bốn bậc thay cho việc mỗi màn hình tự chọn một cỡ chữ: trước đó repo
 * có 30 / 24 / 23 / 21 / 19 / 18px rải rác, tất cả đều là `font-heading` viết
 * tay. Cỡ nào cũng "đúng" khi nhìn một mình, nhưng đi qua ba màn hình liền thì
 * không còn thứ bậc nào đọc ra được.
 *
 * Chỉ `card` chỉnh lại tracking: -0.02em ở cỡ 18px thì các chữ dính vào nhau.
 */
const headingVariants = cva('font-heading text-balance', {
  variants: {
    size: {
      /** Hero — một cái mỗi màn, hoặc không có. */
      display: 'text-[40px]',
      /** Tiêu đề trang. */
      page: 'text-[30px]',
      /** Tiêu đề khối trong trang. */
      section: 'text-[21px]',
      /** Tên một thẻ trong danh sách. */
      card: 'text-[18px] tracking-[-0.015em]',
    },
  },
  defaultVariants: {
    size: 'page',
  },
});

function Heading({
  className,
  size,
  as: Comp = 'h2',
  ...props
}: React.ComponentProps<'h2'> &
  VariantProps<typeof headingVariants> & {
    /** Bậc thẻ heading đặt theo cấu trúc tài liệu, không theo cỡ chữ. */
    as?: 'h1' | 'h2' | 'h3' | 'h4' | 'div';
  }) {
  return (
    <Comp data-slot="heading" className={cn(headingVariants({ size }), className)} {...props} />
  );
}

export { Heading, headingVariants };
