import { Sparkles, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SessionSummaryReport } from '../types/interview.types';

interface AiSummaryCardProps {
  summary: SessionSummaryReport;
}

export function AiSummaryCard({ summary }: AiSummaryCardProps) {
  return (
    <section className="flex flex-col gap-4" aria-labelledby="tt-nhan-xet">
      <div>
        <p className="text-muted-foreground mb-1 text-[13px] font-medium uppercase tracking-wider">
          Diễn giải
        </p>
        <h2 className="text-foreground font-heading text-xl tracking-[-0.01em]" id="tt-nhan-xet">
          Nhận xét cuối phiên
        </h2>
        <p className="text-muted-foreground mt-2 text-[14.5px] leading-[1.6]">
          Phần duy nhất trên trang do AI viết. Đọc lại toàn bộ phiên để chỉ ra điểm nghẽn và gợi ý
          cách khắc phục.
        </p>
      </div>

      <div
        className={cn(
          'bg-ai-accent/5 border-ai-accent/20 rounded-xl border p-5',
          !summary.generatedByAi && 'bg-muted border-border p-5'
        )}
      >
        {!summary.generatedByAi ? (
          <div className="flex items-center gap-3">
            <AlertCircle className="text-muted-foreground h-5 w-5 shrink-0" />
            <p className="text-muted-foreground text-[14.5px]">
              {summary.message || 'Không thể tổng hợp nhận xét lúc này.'}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            <p className="text-ai-accent flex items-center gap-2 text-xs font-medium">
              <Sparkles className="h-3.5 w-3.5" />
              Nhận xét do AI viết — điểm số và lịch ôn thì không, chúng do phần mềm tính
            </p>

            {summary.text && (
              <p className="text-foreground whitespace-pre-line text-[14.5px] leading-[1.6]">
                {summary.text}
              </p>
            )}

            <div className="flex flex-col gap-4 sm:flex-row sm:gap-8">
              {summary.strengths.length > 0 && (
                <div className="flex-1">
                  <h4 className="text-mastery-strong mb-2 text-[13px] font-semibold uppercase tracking-wider">
                    Điểm sáng
                  </h4>
                  <ul className="text-foreground flex flex-col gap-1.5 text-[14px]">
                    {summary.strengths.map((item, idx) => (
                      <li key={idx} className="flex gap-2">
                        <span className="text-mastery-strong mt-0.5">•</span>
                        <span className="leading-normal">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {summary.weaknesses.length > 0 && (
                <div className="flex-1">
                  <h4 className="text-mastery-weak mb-2 text-[13px] font-semibold uppercase tracking-wider">
                    Cần cải thiện
                  </h4>
                  <ul className="text-foreground flex flex-col gap-1.5 text-[14px]">
                    {summary.weaknesses.map((item, idx) => (
                      <li key={idx} className="flex gap-2">
                        <span className="text-mastery-weak mt-0.5">•</span>
                        <span className="leading-normal">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {summary.recommendations.length > 0 && (
              <div className="bg-ai-accent/10 rounded-lg p-4">
                <h4 className="text-ai-accent mb-2 text-[13px] font-semibold uppercase tracking-wider">
                  Gợi ý ôn tập
                </h4>
                <ul className="text-foreground flex flex-col gap-1.5 text-[14px]">
                  {summary.recommendations.map((item, idx) => (
                    <li key={idx} className="flex gap-2">
                      <span className="text-ai-accent mt-0.5">•</span>
                      <span className="leading-normal">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
