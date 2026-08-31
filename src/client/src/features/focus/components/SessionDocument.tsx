import {
  UNAVAILABLE_TOOLTIP,
  type DocumentLevel,
  type SessionDocument as SessionDocumentState,
} from '../hooks/useSessionDocument';
import { DocumentExcerpt } from './DocumentExcerpt';
import { DocumentFullText } from './DocumentFullText';

const LEVEL_LABEL: Record<DocumentLevel, string> = {
  hidden: 'Ẩn',
  excerpt: 'Trích đoạn',
  fulltext: 'Toàn văn',
};

const LEVELS: DocumentLevel[] = ['hidden', 'excerpt', 'fulltext'];

/**
 * Segment `Tài liệu: Ẩn | Trích đoạn | Toàn văn` trên thanh trên (mockup `.seg`).
 *
 * Khoá bằng `aria-disabled` chứ không phải thuộc tính `disabled`: nút `disabled` không nhận sự kiện
 * chuột nên tooltip `title` KHÔNG bao giờ hiện, mà lý do khoá lại đúng là thứ AC bắt phải nói ra —
 * và nút bị `disabled` cũng rơi khỏi thứ tự Tab, tức người dùng bàn phím không cách nào biết vì sao.
 */
export function SessionDocumentSegment({ document }: { document: SessionDocumentState }) {
  const { selectedLevel, setLevel, unavailableReasons } = document;

  return (
    // Segmented control liền khối (mockup `.seg`): một viền bao ngoài, `overflow-hidden`, nền muted;
    // nút đang chọn nhận nền `card` + shadow-soft. Không phải nhóm-viên-thuốc có khe hở.
    <div
      className="border-border bg-muted inline-flex items-center overflow-hidden rounded-[calc(var(--radius)*0.7)] border"
      role="group"
      aria-label="Hiển thị tài liệu"
    >
      {/* #301 · mockup `@media (max-width:900px)` dòng 1423: `.seg > span{display:none}`. Nhãn
          "Tài liệu" chỉ trả lời "Ẩn cái gì?"; dưới 900px nó ăn 30px của thanh trên vốn đã chật,
          trong khi ba nút Ẩn/Trích đoạn/Toàn văn đã tự nói ra ngữ cảnh. Rule này nằm cùng block
          `@media` với `.split` nhưng bị sót khỏi checklist issue — port kèm. (Mốc `min-[900px]:`
          lệch 1px so với `max-width:900px` — xem ghi chú đầy đủ trong `RunningSession.tsx`.) */}
      <span className="text-muted-foreground hidden self-center pl-3 pr-2.5 text-xs min-[900px]:inline">
        Tài liệu
      </span>
      {LEVELS.map((level) => {
        const unavailableReason = level === 'hidden' ? null : unavailableReasons[level];
        const isLocked = unavailableReason !== null;

        return (
          <button
            key={level}
            type="button"
            aria-pressed={selectedLevel === level}
            aria-disabled={isLocked || undefined}
            title={unavailableReason ? UNAVAILABLE_TOOLTIP[unavailableReason] : undefined}
            onClick={() => setLevel(level)}
            className={`focus-visible:outline-ring px-[13px] py-[7px] text-[13px] font-medium [outline-style:none] focus-visible:outline-2 focus-visible:-outline-offset-2 ${
              selectedLevel === level
                ? 'bg-card text-foreground shadow-[var(--shadow-soft)]'
                : 'text-muted-foreground hover:text-foreground'
            } ${isLocked ? 'cursor-not-allowed opacity-45' : ''}`}
          >
            {LEVEL_LABEL[level]}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Cột tài liệu (trái) của bố cục hai cột — bộ định tuyến giữa hai mức hiển thị.
 *
 * Không bao giờ render khi `level === 'hidden'`; nơi gọi quyết định điều đó vì chính nó cũng phải
 * đổi bố cục (một cột ↔ hai cột) theo cùng một điều kiện.
 */
export function SessionDocumentPanel({
  planId,
  document,
}: {
  planId: string;
  document: SessionDocumentState;
}) {
  const { level, sources, fullTextSource, setLevel } = document;

  if (level === 'excerpt') {
    return <DocumentExcerpt sources={sources} />;
  }

  if (fullTextSource === null) return null;

  // Có neo thì mở ở nguồn ĐẦU TIÊN sau khi sắp theo trang; không có neo thì metadata cấp plan mở
  // nguyên tệp từ đầu. Nếu tải file lỗi, chỉ mời quay lại trích đoạn khi mức đó thực sự dùng được.
  const hasExcerpt = sources.length > 0;
  return (
    <DocumentFullText
      key={fullTextSource.documentId}
      planId={planId}
      source={fullTextSource}
      fallbackLabel={hasExcerpt ? 'Quay lại trích đoạn' : 'Ẩn tài liệu'}
      onFallback={() => setLevel(hasExcerpt ? 'excerpt' : 'hidden')}
    />
  );
}
