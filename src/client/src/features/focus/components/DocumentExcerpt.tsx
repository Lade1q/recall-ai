import type { ReactNode } from 'react';
import { FileText } from 'lucide-react';
import type { ConceptSourceExcerpt } from '@/features/study-planner/types/concept';
import { formatPageAnchor } from '../utils/format';

/** Thanh tiêu đề của một tệp nguồn: tên tệp bên trái, neo vị trí bên phải (mockup `.docbar`). */
export function DocumentBar({ filename, children }: { filename: string; children?: ReactNode }) {
  return (
    <div className="border-border text-muted-foreground mb-3.5 flex items-center justify-between gap-3 border-b pb-3 text-xs">
      <span className="text-foreground flex min-w-0 items-center gap-[7px] font-medium">
        <FileText className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate">{filename}</span>
      </span>
      {children}
    </div>
  );
}

/**
 * Mức "Trích đoạn" — đọc thẳng cột `concept_sources.excerpt`, không tải tệp về, không gọi AI (C4).
 *
 * Tô SÁNG CẢ ĐOẠN chứ không tô từng tên khái niệm bên trong, và đây là điểm khác `HighlightedExcerpt`
 * của Concept Graph một cách có chủ ý: `ConceptSourceRef` không lưu offset `[from, to]` nào, chỉ lưu
 * một `excerpt` verbatim ngắn — chính là câu định nghĩa mà `extract_concepts` rút ra. Đoạn đó *toàn
 * bộ* là phần khớp khái niệm, nên tô cả khối là đúng nghĩa.
 *
 * KHÔNG có tiêu đề mục kiểu "4.2 — Ngăn xếp" như mockup vẽ: `ConceptSourceRef` chỉ có `filename` +
 * số trang, KHÔNG có tên mục tài liệu. Trước đây chỗ này lấy TÊN KHÁI NIỆM làm tiêu đề, nhưng đặt tên
 * khái niệm vào đúng vị trí tiêu đề mục tài liệu khiến nó đọc ra như một mục có thật trong tệp — một
 * nhãn bịa. Nên bỏ hẳn: chỉ bày đúng cái tài liệu thật có — tên tệp, trang, và câu trích.
 */
export function DocumentExcerpt({ sources }: { sources: ConceptSourceExcerpt[] }) {
  return (
    <div className="flex flex-col gap-7">
      {sources.map((source, index) => {
        const anchor = formatPageAnchor(source.pageFrom, source.pageTo);

        return (
          <article key={`${source.documentId}-${index}`}>
            <DocumentBar filename={source.filename}>
              {anchor && (
                <span className="border-border bg-card text-muted-foreground shrink-0 rounded-[4px] border px-[7px] py-0.5 font-mono text-[11px]">
                  {anchor}
                </span>
              )}
            </DocumentBar>

            <div className="text-muted-foreground max-w-[62ch] text-[13px] leading-[1.85]">
              {source.excerpt ? (
                <p className="m-0">
                  <mark className="bg-focus-session/16 text-foreground box-decoration-clone px-0 py-px">
                    {source.excerpt}
                  </mark>
                </p>
              ) : (
                // Có neo trang nhưng không có câu trích: hàng vẫn thật, chỉ thiếu chữ. Nói đúng
                // điều đó thay vì để khoảng trắng — "không có" khác "chưa tải được".
                <p className="m-0 italic">Đoạn này chỉ có neo vị trí, không có câu trích dẫn.</p>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
