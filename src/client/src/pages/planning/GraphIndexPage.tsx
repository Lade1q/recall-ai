import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { planApi } from '@/features/study-planner/api/plan.api';
import { PlanSummary } from '@/features/study-planner/types/concept';
import { Heading } from '@/components/ui/heading';

/**
 * Mục nav "Đồ thị khái niệm" (Issue #173) không có màn hình riêng — đồ thị luôn gắn với một
 * kế hoạch cụ thể (PlanDetailPage). Trang này chỉ tra danh sách kế hoạch và chuyển tới đồ thị
 * của kế hoạch đang chạy gần nhất; bộ chọn nhiều kế hoạch ngay trên toolbar thuộc #168.
 */

/** Khung chung của các trạng thái không redirect: cùng tiêu đề, khác lý do và lối ra. */
function GraphIndexNotice({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="bg-card border-border max-w-140 rounded-xl border p-6">
      <Heading as="h1" size="section" className="mb-2 leading-tight tracking-tight">
        Đồ thị khái niệm
      </Heading>
      <p className="text-muted-foreground text-pretty text-[13.5px] leading-[1.65]">{children}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export default function GraphIndexPage() {
  const [plans, setPlans] = useState<PlanSummary[] | null>(null);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let isMounted = true;
    planApi
      .listPlans()
      .then((data) => {
        if (isMounted) setPlans(data);
      })
      .catch(() => {
        if (isMounted) setHasError(true);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  if (hasError) {
    return <GraphIndexNotice>Không thể tải danh sách kế hoạch.</GraphIndexNotice>;
  }

  if (plans === null) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (plans.length === 0) {
    return (
      <GraphIndexNotice
        action={
          <Button asChild>
            <Link to="/plan/new">Tạo kế hoạch đầu tiên</Link>
          </Button>
        }
      >
        Bạn chưa có kế hoạch ôn tập nào để xem đồ thị khái niệm.
      </GraphIndexNotice>
    );
  }

  // `listPlans` sắp theo createdAt giảm dần, nên phần tử đầu tiên của mỗi nhóm là cái mới
  // nhất của nhóm đó. Phải lọc `active` chứ không lấy thẳng plans[0]: từ #265 bản nháp ở lại
  // `draft` cho tới khi được xác nhận, nên kế hoạch mới nhất rất thường là draft — mà draft
  // thì thuộc /plan/:id/verify, tức mục nav "Kế hoạch ôn tập". Lấy plans[0] ở đây khiến bấm
  // "Đồ thị khái niệm" tự tắt chính mục vừa bấm. `archived` cũng bỏ qua: nó không phải thứ
  // người dùng đang học.
  const activePlan = plans.find((p) => p.status === 'active');
  if (activePlan) {
    return <Navigate to={`/plan/${activePlan.id}`} replace />;
  }

  const draftPlan = plans.find((p) => p.status === 'draft');
  if (draftPlan) {
    return (
      <GraphIndexNotice
        action={
          <Button asChild>
            <Link to={`/plan/${draftPlan.id}/verify`}>Kiểm chứng đồ thị</Link>
          </Button>
        }
      >
        Kế hoạch <span className="text-foreground font-medium">{draftPlan.name}</span> đã có đồ thị
        AI đề xuất nhưng chưa qua bước kiểm chứng. Đồ thị chỉ mở được ở đây sau khi bạn xác nhận.
      </GraphIndexNotice>
    );
  }

  return (
    <GraphIndexNotice
      action={
        <Button asChild>
          <Link to="/plans">Mở danh sách kế hoạch</Link>
        </Button>
      }
    >
      Mọi kế hoạch của bạn đang được lưu trữ. Bỏ lưu trữ một kế hoạch để xem lại đồ thị của nó.
    </GraphIndexNotice>
  );
}
