import { FileText } from 'lucide-react';
import type { QuestionSourceResponse } from '../types/interview.types';

interface SourceCitationProps {
  citation: QuestionSourceResponse | null;
}

/**
 * Trích dẫn nguồn C5 của một câu hỏi.
 * Render đúng thứ đang có: `{filename} · tr. N`. Không render nếu không có nguồn.
 */
export function SourceCitation({ citation }: SourceCitationProps) {
  if (!citation) return null;

  const { filename, pageFrom, pageTo } = citation;
  let pageText = '';
  if (pageFrom !== null) {
    pageText =
      pageTo !== null && pageTo !== pageFrom ? `tr. ${pageFrom}–${pageTo}` : `tr. ${pageFrom}`;
  }
  const displayText = pageText ? `${filename} · ${pageText}` : filename;

  return (
    <div className="text-muted-foreground mt-2.5 inline-flex items-center gap-1.5 font-mono text-[11px]">
      <FileText className="size-3 shrink-0" aria-hidden="true" />
      {/* TODO(#203): Đích link thực tế phụ thuộc Issue #203 (PDF Viewer). Chuyển thẻ span dưới đây thành thẻ <a> khi BE/FE hoàn thiện #203. */}
      <span className="hover:text-foreground cursor-default underline-offset-4 transition-colors hover:underline">
        {displayText}
      </span>
    </div>
  );
}
