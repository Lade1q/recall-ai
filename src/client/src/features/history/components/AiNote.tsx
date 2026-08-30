import { Sparkles, AlertCircle } from 'lucide-react';

import type { SessionSummaryReport } from '@/features/interview/types/interview.types';

/**
 * Bước #5 — nhận xét cuối phiên (`summarize_session`), khối `.ai-note` của mockup.
 *
 * KHÔNG dùng lại `features/interview/components/AiSummaryCard`: component đó mang sẵn tiêu đề
 * cấp trang của màn Kết quả cuối phiên (eyebrow "DIỄN GIẢI" + `<h2>` + đoạn dẫn). Đặt nó vào
 * panel chi tiết ở đây thì tiêu đề "Nhận xét cuối phiên" hiện HAI lần và cỡ chữ phá nhịp `<h3>`
 * của các khối còn lại — đo được trên trình duyệt thật. Phần dữ liệu thì dùng chung nguyên vẹn
 * (`SessionSummaryReport`), chỉ khung trình bày là của màn này.
 *
 * Nhãn nói đúng phạm vi của AI: nó viết CHỮ. Điểm số do công thức trọng số tính và việc xếp
 * lịch do Scheduling & Remediation Engine quyết (ràng buộc C4) — nhãn mơ hồ ở đây sẽ khiến
 * người đọc tưởng AI là thứ chấm điểm.
 */
export function AiNote({ summary }: { summary: SessionSummaryReport }) {
  // Nhánh này chỉ tới được khi `generatedByAi` là false VÀ có `message` — tức UC-14 E1, AI thật
  // sự hỏng. Phiên bỏ dở (`message` null, không có gì hỏng) đã bị chặn từ chỗ gọi: SPEC_DB-03
  // AF3 đòi bỏ HẲN khối này chứ không hiện một câu báo lỗi không đúng sự thật.
  if (!summary.generatedByAi) {
    return (
      <div className="border-border bg-muted flex items-center gap-3 rounded-lg border p-4">
        <AlertCircle className="text-muted-foreground size-5 shrink-0" aria-hidden="true" />
        <p className="text-muted-foreground m-0 text-[13.5px]">{summary.message}</p>
      </div>
    );
  }

  return (
    <div className="border-ai-accent/30 bg-ai-accent/[0.06] rounded-lg border p-4">
      <div className="text-ai-accent mb-2.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.05em]">
        <Sparkles className="size-3.5 shrink-0" aria-hidden="true" />
        summarize_session — chữ do AI viết, điểm số thì không
      </div>

      {summary.text && (
        <p className="m-0 whitespace-pre-line text-[13.5px] leading-[1.65]">{summary.text}</p>
      )}

      {(summary.strengths.length > 0 || summary.weaknesses.length > 0) && (
        <div className="mt-3.5 flex flex-col gap-3.5 sm:flex-row sm:gap-7">
          <NoteList title="Đã vững" items={summary.strengths} bulletClass="text-mastery-strong" />
          <NoteList title="Còn yếu" items={summary.weaknesses} bulletClass="text-mastery-weak" />
        </div>
      )}

      {summary.recommendations.length > 0 && (
        <div className="bg-ai-accent/10 mt-3.5 rounded-md p-3.5">
          <NoteList
            title="Gợi ý ôn tập"
            items={summary.recommendations}
            bulletClass="text-ai-accent"
            titleClass="text-ai-accent"
          />
        </div>
      )}
    </div>
  );
}

function NoteList({
  title,
  items,
  bulletClass,
  titleClass = 'text-muted-foreground',
}: {
  title: string;
  items: string[];
  bulletClass: string;
  titleClass?: string;
}) {
  if (items.length === 0) return null;
  return (
    <div className="flex-1">
      <h4 className={`mb-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] ${titleClass}`}>
        {title}
      </h4>
      <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[12.5px] leading-[1.65]">
        {items.map((item, index) => (
          <li key={index} className="flex gap-2">
            <span className={`${bulletClass} mt-px`} aria-hidden="true">
              •
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
