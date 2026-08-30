import type { ReactNode } from 'react';
import { FileText } from 'lucide-react';
import type { ConceptSourceExcerpt } from '@/features/study-planner/types/concept';
import { formatPageAnchor, isTruncatedQuote } from '../utils/format';

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
 * Câu trích được bọc trong ngoặc kép và `…` (khi cụt) **đặt NGOÀI `<mark>`**, không phải bên trong:
 * chúng là dấu hiệu của *chúng ta*, không phải chữ có trong tệp. Nhét vào trong vùng tô sáng là
 * lặng lẽ khẳng định tài liệu có mấy ký tự đó. `aria-hidden` để trình đọc màn hình không đọc ra
 * "dấu ngoặc kép" giữa câu — thông tin đó là thị giác, và nội dung trích vẫn nguyên vẹn.
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
        // `.trim()` chứ không phải `source.excerpt` trần: schema server là `z.string().min(1)`
        // **không** `.trim()`, nên `"   "` lưu được và là truthy — render ra `“   …”`, tức một cặp
        // ngoặc kép bao quanh không có gì, kèm dấu `…` hứa rằng còn nữa. Cắt ở client là đủ và
        // không đụng tới dữ liệu đã lưu.
        const quote = source.excerpt?.trim();

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
              {quote ? (
                <p className="m-0">
                  <span aria-hidden="true">“</span>
                  <mark className="bg-focus-session/16 text-foreground box-decoration-clone px-0 py-px">
                    {quote}
                  </mark>
                  {isTruncatedQuote(quote) && <span aria-hidden="true">…</span>}
                  <span aria-hidden="true">”</span>
                </p>
              ) : (
                // Hàng vẫn thật, chỉ thiếu chữ — "không có" khác "chưa tải được". Nhưng câu phải
                // khớp đúng thứ hàng NÀY có: khoe "chỉ có neo vị trí" trong khi `pageFrom` rỗng là
                // khai một cái neo không tồn tại, lúc đó hàng chỉ còn mỗi tên tệp.
                <p className="m-0 italic">
                  {anchor
                    ? 'Đoạn này chỉ có neo vị trí, không có câu trích dẫn.'
                    : 'Khái niệm này chưa neo được vào vị trí cụ thể trong tệp, và không có câu trích dẫn.'}
                </p>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
