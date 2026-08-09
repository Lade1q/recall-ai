import { Link } from 'react-router-dom';
import { Archive, CircleCheck, ClipboardCheck } from 'lucide-react';
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
 */
function resolveFrame(planId: string, planStatus: PlanStatus | null): EmptyQueueFrame {
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

  return {
    Icon: CircleCheck,
    heading: 'Không còn khái niệm nào chờ ôn',
    action: { label: 'Xem đồ thị khái niệm', to: `/plan/${planId}` },
  };
}

/** Hàng đợi rỗng và cũng không có mục nào bị gỡ (mockup §2, khung dùng lại cho ca plan chưa
 *  `active`). Câu chữ vẫn của server; chỉ tiêu đề và nút đổi theo trạng thái kế hoạch. */
export function EmptyQueueMessage({ planId, message, planStatus }: EmptyQueueMessageProps) {
  const { Icon, heading, action } = resolveFrame(planId, planStatus);

  return (
    <div className="max-w-130 mb-6.5 mt-8.5 mx-auto text-center">
      <div className="text-muted-foreground mb-4 flex justify-center opacity-55">
        <Icon aria-hidden="true" className="size-10" strokeWidth={1.3} />
      </div>
      <h3 className="font-heading mb-2 text-[20px] tracking-[-0.02em]">{heading}</h3>
      {/* Chỉ render khi có câu chữ: ca biên plan active 0 khái niệm cho `message = ''`
          (server trả null → `?? ''`), lúc đó một <p> rỗng chỉ chèn khoảng trắng thừa. */}
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
