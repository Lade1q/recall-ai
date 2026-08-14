import { Link } from 'react-router-dom';
import { Archive, CircleCheck, ClipboardCheck, Network } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { PlanStatus } from '@/features/study-planner/types/concept';

interface EmptyQueueMessageProps {
  planId: string;
  /** Nguyên văn từ server — client không tự ghép câu (#124). Tiêu đề và nút thì là khung giao
   *  diện, chọn theo `planStatus`: một câu "đang chờ bạn xác nhận đồ thị" nằm dưới tiêu đề "Không
   *  còn khái niệm nào chờ ôn" là hai câu nói ngược nhau trên cùng một màn. */
  message: string;
  /** `null` khi chưa tải xong chi tiết kế hoạch — rơi về khung trung tính, không đoán bừa. */
  planStatus: PlanStatus | null;
  /** #345: `false` = đồ thị rỗng. `undefined` = server chưa đếm (plan chưa `active`) — hai ca
   *  `draft`/`archived` đã được trả lời trước đó nên ở đây nó không bao giờ cần tới. */
  hasActiveConcepts: boolean | undefined;
}

interface EmptyQueueFrame {
  Icon: typeof CircleCheck;
  heading: string;
  action: { label: string; to: string } | null;
}

/**
 * Khung cho ca `items` rỗng mà cũng không có mục nào bị gỡ.
 *
 * Sau khi #225 chốt phương án (a) — gộp "đã ôn hết" vào "đã gỡ hết" — ca duy nhất còn tới được
 * đây trên thực tế là plan chưa `active`: `draft` (chờ kiểm chứng đồ thị) hoặc `archived`. Hàng
 * đợi của plan `active` không cạn được, vì dòng chỉ đổi `status` chứ không bị xoá.
 *
 * #345 thêm một ca thật thứ ba: plan `active` mà **đồ thị rỗng**. Nó gác bằng
 * `hasActiveConcepts === false` chứ **không** bằng lịch sử vấn đáp — tiêu đề nói một điều về đồ
 * thị, nên gác nó bằng một dữ kiện về lịch sử là lặp lại đúng lỗi "một cờ trả lời hai câu hỏi"
 * đã đẻ ra issue này. Xét sau `draft`/`archived` là không xung đột: plan phải `active` mới tới.
 */
function resolveFrame(
  planId: string,
  planStatus: PlanStatus | null,
  hasActiveConcepts: boolean | undefined
): EmptyQueueFrame {
  if (planStatus === 'draft') {
    return {
      Icon: ClipboardCheck,
      heading: 'Hàng đợi ôn chưa bắt đầu chạy',
      // Đúng việc người dùng còn nợ, và cùng một nhãn với nút trên thẻ kế hoạch SP-03 (#269) —
      // một trạng thái không mang hai tên.
      action: { label: 'Kiểm chứng đồ thị', to: `/plan/${planId}/verify` },
    };
  }

  if (planStatus === 'archived') {
    return {
      Icon: Archive,
      heading: 'Kế hoạch này đang được lưu trữ',
      // Bỏ lưu trữ nằm ở menu của thẻ trong danh sách kế hoạch, không phải ở màn này.
      action: { label: 'Về danh sách kế hoạch', to: '/plans' },
    };
  }

  if (hasActiveConcepts === false) {
    return {
      // KHÔNG được là `CircleCheck`: một dấu tích trên kế hoạch rỗng là lời chúc mừng cho việc
      // sinh viên chưa làm — đúng cái #345 đi diệt.
      Icon: Network,
      heading: 'Đồ thị khái niệm đang trống',
      // "Mở" chứ không "Xem": đích vẫn là màn đồ thị (đó *đúng* là chỗ cần tới để thêm khái niệm
      // hoặc phân tích lại), nhưng "Xem" hàm ý ở đó có gì để xem.
      action: { label: 'Mở đồ thị khái niệm', to: `/plan/${planId}` },
    };
  }

  return {
    Icon: CircleCheck,
    heading: 'Không còn khái niệm nào chờ ôn',
    action: { label: 'Xem đồ thị khái niệm', to: `/plan/${planId}` },
  };
}

/** Hàng đợi rỗng và cũng không có mục nào bị gỡ (mockup §2, khung dùng lại cho ca plan chưa
 *  `active`). Câu chữ vẫn của server; chỉ tiêu đề và nút đổi theo trạng thái kế hoạch. */
export function EmptyQueueMessage({
  planId,
  message,
  planStatus,
  hasActiveConcepts,
}: EmptyQueueMessageProps) {
  const { Icon, heading, action } = resolveFrame(planId, planStatus, hasActiveConcepts);

  return (
    <div className="max-w-130 mb-6.5 mt-8.5 mx-auto text-center">
      <div className="text-muted-foreground mb-4 flex justify-center opacity-55">
        <Icon aria-hidden="true" className="size-10" strokeWidth={1.3} />
      </div>
      <h3 className="font-heading mb-2 text-[20px] tracking-[-0.02em]">{heading}</h3>
      {/* Chỉ render khi có câu chữ. Từ #345, ca "plan active 0 khái niệm" ĐÃ có câu server, nên
          `message = ''` ở đây không còn là ca thường nữa — nó chỉ còn tới được qua một **straddle**
          hiếm: `concept.count` chạy TRƯỚC một reanalyze còn `buildFallbackItems` chạy SAU, nên cờ
          nói "còn khái niệm" trong khi danh sách đã rỗng (READ COMMITTED lấy snapshot theo từng
          câu lệnh; đảo thứ tự hai truy vấn chỉ đổi chiều lệch chứ không đóng được). Hệ quả là một
          lần render thiếu câu, tự khỏi khi tải lại — cố ý không sửa, và cố ý KHÔNG nới vị từ nào
          để "chữa" nó. Xem #345. */}
      {message && (
        <p className="text-muted-foreground mb-4.5 text-pretty text-[13.5px] leading-[1.7]">
          {message}
        </p>
      )}
      {action && (
        <Button variant="outline" asChild>
          <Link to={action.to}>{action.label}</Link>
        </Button>
      )}
    </div>
  );
}
