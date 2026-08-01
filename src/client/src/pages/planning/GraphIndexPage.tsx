import { useEffect, useState } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { planApi } from '@/features/study-planner/api/plan.api';
import { PlanSummary } from '@/features/study-planner/types/concept';

/**
 * Mục nav "Đồ thị khái niệm" (Issue #173) không có màn hình riêng — đồ thị luôn
 * gắn với một kế hoạch cụ thể (PlanDetailPage). Trang này chỉ tra danh sách kế
 * hoạch và chuyển tới đồ thị của kế hoạch gần nhất tạo; bộ chọn nhiều kế hoạch
 * ngay trên toolbar thuộc #168 (chưa làm).
 */
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
    return (
      <div className="bg-card border-border rounded-xl border p-6">
        <h1 className="mb-2 text-2xl font-bold">Đồ thị khái niệm</h1>
        <p className="text-muted-foreground text-sm">Không thể tải danh sách kế hoạch.</p>
      </div>
    );
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
      <div className="bg-card border-border rounded-xl border p-6">
        <h1 className="mb-2 text-2xl font-bold">Đồ thị khái niệm</h1>
        <p className="text-muted-foreground mb-4 text-sm">
          Bạn chưa có kế hoạch ôn tập nào để xem đồ thị khái niệm.
        </p>
        <Button asChild>
          <Link to="/plan/new">Tạo kế hoạch đầu tiên</Link>
        </Button>
      </div>
    );
  }

  return <Navigate to={`/plan/${plans[0].id}`} replace />;
}
