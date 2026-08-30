import { Link } from 'react-router-dom';
import { RotateCcw } from 'lucide-react';

import type { SessionSummaryResponse } from '@/features/interview/types/interview.types';

/**
 * Bước #6 — hệ thống đã làm gì sau phiên: khái niệm tiên quyết mà truy ngược (AE-07/AE-08) đã
 * chèn vào lịch ôn, ở `depth` nào, xếp cho ngày nào.
 *
 * Vẽ khác hẳn khối nhận xét AI ở trên là chủ đích, không phải trang trí: đây là kết quả của
 * BFS ngược chạy trong Scheduling & Remediation Engine — mã tất định — chứ không phải câu chữ
 * do mô hình sinh ra. Hai khối trông giống nhau thì ranh giới C4 biến mất khỏi giao diện.
 *
 * Không có hàng `traceback` nào thì khối biến mất hẳn: phiên không kích hoạt truy ngược là
 * chuyện bình thường, và một khung trống ghi "không có gì" chỉ tốn chỗ.
 */
export function SystemActionsBlock({ summary }: { summary: SessionSummaryResponse }) {
  const tracebacks = summary.reviewSchedule.filter((item) => item.reason === 'traceback');
  if (tracebacks.length === 0) return null;

  // Gom theo khái niệm NGUỒN (`sourceConceptId`, #310) — một phiên có thể truy ngược từ nhiều
  // khái niệm yếu, và mỗi lần truy ngược là một câu chuyện riêng.
  const bySource = new Map<string, typeof tracebacks>();
  for (const item of tracebacks) {
    const key = item.sourceConceptId ?? '__unknown__';
    const existing = bySource.get(key);
    if (existing) existing.push(item);
    else bySource.set(key, [item]);
  }

  return (
    <div className="flex flex-col gap-2.5">
      {[...bySource.entries()].map(([key, items]) => (
        <TracebackLine key={key} items={items} />
      ))}
    </div>
  );
}

function TracebackLine({ items }: { items: SessionSummaryResponse['reviewSchedule'] }) {
  const first = items[0];
  if (!first) return null;

  const scheduled = first.scheduledFor ? new Date(first.scheduledFor) : null;
  const scheduledLabel =
    scheduled && !Number.isNaN(scheduled.getTime())
      ? `${String(scheduled.getDate()).padStart(2, '0')}/${String(scheduled.getMonth() + 1).padStart(2, '0')}`
      : null;

  const maxDepth = items.reduce((max, item) => Math.max(max, item.depth ?? 0), 0);

  return (
    <div className="border-border border-l-remediate bg-card flex gap-[11px] rounded-lg border border-l-[3px] px-[15px] py-[13px]">
      <RotateCcw className="text-remediate mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 text-[13px] leading-[1.65]">
        <p className="m-0">
          Truy ngược từ{' '}
          {/* `sourceConceptName` là `null` khi khái niệm nguồn đã bị xoá (tham chiếu mềm, không
              có FK) — nói thẳng thay vì hiện chữ "null". */}
          <strong className="font-semibold">
            {first.sourceConceptName ?? 'một khái niệm đã bị xoá'}
          </strong>{' '}
          tìm thấy {items.length === 1 ? 'một tiên quyết' : `${items.length} tiên quyết`} chưa vững:{' '}
          <strong className="font-semibold">{items.map((item) => item.name).join(', ')}</strong>
          {scheduledLabel ? `. Đã chèn lên đầu lịch ôn ngày ${scheduledLabel}.` : '.'}
        </p>
        <div className="text-muted-foreground mt-[5px] font-mono text-[11px]">
          AE-07 · depth {maxDepth || 1} / max 2 · review_queue_items.reason = traceback
        </div>
        <div className="mt-2">
          <Link
            to="/dashboard"
            className="text-foreground border-border border-b no-underline hover:border-current"
          >
            Xem trong hàng đợi hôm nay
          </Link>
        </div>
      </div>
    </div>
  );
}
