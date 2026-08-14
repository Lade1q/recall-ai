import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { MetaMono } from '@/components/ui/kbd';
import type { SessionSummaryReviewItemResponse } from '../types/interview.types';

interface NextSessionPanelProps {
  /** Cả hàng đợi phiên này sinh ra — server đã sort: truy ngược trước, rồi ôn giãn cách. */
  schedule: SessionSummaryReviewItemResponse[];
  skippedItemIds: ReadonlySet<string>;
}

const DAY_MS = 86_400_000;

/**
 * "10/08". Không dùng `Intl.DateTimeFormat` ở đây: với `vi-VN` và chỉ hai trường day+month,
 * nó nối bằng dấu gạch ("10-08") chứ không phải "/" như mockup — ghép tay cho đúng một dạng
 * duy nhất trên toàn màn.
 */
function formatDayMonth(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}`;
}

/** Mốc 00:00 địa phương — đếm theo ngày lịch, không theo số giờ trôi qua. */
function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/**
 * "12/08 · sau 8 ngày". Khoảng cách ôn do `finalizeConceptResult` tính sẵn và ghi vào
 * `scheduledFor`; ở đây chỉ diễn đạt lại, không tính lại công thức giãn cách.
 */
function formatWhen(scheduledFor: string | null): string {
  if (!scheduledFor) return 'chưa xếp lịch';

  const target = new Date(scheduledFor);
  if (Number.isNaN(target.getTime())) return 'chưa xếp lịch';

  const days = Math.round((startOfDay(target) - startOfDay(new Date())) / DAY_MS);
  const date = formatDayMonth(target);
  if (days <= 0) return `${date} · hôm nay`;
  if (days === 1) return `${date} · ngày mai`;
  return `${date} · sau ${days} ngày`;
}

/**
 * Hàng đợi của phiên kế tiếp — hệ quả trực tiếp của những gì vừa xảy ra: khái niệm nền do truy
 * ngược tìm ra lên đầu, các khái niệm vừa làm quay lại theo ngày ôn giãn cách của riêng chúng
 * chứ không phải ngay ngày mai.
 *
 * Đây cũng là chỗ chứa đường đi tiếp DUY NHẤT của màn tổng kết (đúng một primary action). Phiên
 * kế tiếp là phiên học tập trung với tài liệu, không phải vấn đáp — nói rõ để không ai bấm vào
 * rồi bất ngờ.
 */
export function NextSessionPanel({ schedule, skippedItemIds }: NextSessionPanelProps) {
  const navigate = useNavigate();

  const queue = schedule.filter(
    (item) => item.status !== 'skipped' && !skippedItemIds.has(item.conceptId)
  );
  const tracebackCount = queue.filter((item) => item.reason === 'traceback').length;

  return (
    <section className="flex flex-col gap-4" aria-labelledby="tt-tiep">
      <div>
        <p className="text-muted-foreground mb-1 text-[13px] font-medium uppercase tracking-wider">
          Bước tiếp theo
        </p>
        <h2 className="text-foreground font-heading text-xl tracking-[-0.01em]" id="tt-tiep">
          Phiên kế tiếp sẽ học gì
        </h2>
        <p className="text-muted-foreground mt-2 text-[14.5px] leading-[1.6]">
          {tracebackCount > 0
            ? `${tracebackCount === 1 ? 'Khái niệm nền' : `${tracebackCount} khái niệm nền`} lên đầu hàng đợi. Các khái niệm bạn vừa làm không quay lại ngay — chúng có ngày ôn riêng, xa dần theo mức bạn đã nắm.`
            : 'Các khái niệm bạn vừa làm có ngày ôn riêng, xa dần theo mức bạn đã nắm.'}
        </p>
      </div>

      <div className="bg-card border-border flex flex-col rounded-xl border">
        {queue.length === 0 ? (
          <p className="text-muted-foreground px-5 py-6 text-[14px] leading-[1.6]">
            Hàng đợi ôn của phiên này đang trống. Bạn có thể thêm phạm vi mới từ kế hoạch.
          </p>
        ) : (
          <div className="divide-border flex flex-col divide-y">
            {queue.map((item, idx) => (
              <div
                key={item.conceptId}
                className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3 px-5 py-3.5"
              >
                <MetaMono className="text-muted-foreground text-[11px]">
                  {String(idx + 1).padStart(2, '0')}
                </MetaMono>

                <div className="flex min-w-0 flex-col">
                  <span className="text-foreground truncate text-[14px] font-medium">
                    {item.name}
                  </span>
                  <span className="text-muted-foreground text-[12.5px] leading-normal">
                    {item.reason === 'traceback'
                      ? item.sourceConceptName
                        ? `Nền của ${item.sourceConceptName}`
                        : 'Khái niệm nền do truy ngược tìm ra'
                      : 'Ôn lại theo mức độ ghi nhớ'}
                  </span>
                </div>

                <span className="text-muted-foreground whitespace-nowrap text-[12.5px]">
                  {item.reason === 'traceback' ? 'phiên kế tiếp' : formatWhen(item.scheduledFor)}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="border-border flex flex-wrap items-center gap-3 border-t px-5 py-4">
          <Button onClick={() => navigate('/focus')}>Bắt đầu phiên học tiếp theo</Button>
          <Button variant="outline" onClick={() => navigate('/dashboard')}>
            Để sau
          </Button>
          <span className="text-muted-foreground text-[12.5px] leading-normal">
            Phiên kế tiếp là một phiên học tập trung với tài liệu, không phải vấn đáp.
          </span>
        </div>
      </div>
    </section>
  );
}
