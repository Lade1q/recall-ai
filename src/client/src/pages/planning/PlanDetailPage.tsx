import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';

/**
 * PlanDetailPage — Placeholder cho route /plan/:id
 *
 * Trang này sẽ được implement đầy đủ khi dựng Bước 3 (Kiểm chứng đồ thị khái niệm).
 * Hiện tại chỉ hiển thị thông tin cơ bản để luồng tạo plan không kết thúc ở 404.
 */
export default function PlanDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const mode = searchParams.get('mode');

  return (
    <div className="mx-auto w-full max-w-3xl pb-12 pt-6">
      <div className="text-muted-foreground mb-4 flex items-center gap-2 text-[13px]">
        <button
          onClick={() => navigate('/plans')}
          className="hover:text-foreground hover:border-border border-b border-transparent pb-px transition-colors"
        >
          Kế hoạch ôn tập
        </button>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="opacity-50"
        >
          <path d="M9 6l6 6-6 6" />
        </svg>
        <span>Chi tiết kế hoạch</span>
      </div>

      <h1 className="font-heading mb-2 text-[30px] leading-tight tracking-tight">
        Kiểm chứng đồ thị khái niệm
      </h1>
      <p className="text-muted-foreground max-w-160 mb-7 text-sm leading-relaxed">
        Trang này đang được phát triển. Chức năng kiểm chứng đồ thị khái niệm sẽ được hoàn thiện
        trong phiên bản tới.
      </p>

      <div className="bg-card border-border rounded-lg border p-6">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground font-medium">Plan ID:</span>
            <code className="bg-muted rounded px-2 py-0.5 font-mono text-xs">{id}</code>
          </div>
          {mode && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground font-medium">Chế độ:</span>
              <code className="bg-muted rounded px-2 py-0.5 font-mono text-xs">{mode}</code>
            </div>
          )}
        </div>
      </div>

      <div className="mt-6">
        <Button variant="outline" onClick={() => navigate('/plans')}>
          Quay lại danh sách kế hoạch
        </Button>
      </div>
    </div>
  );
}
