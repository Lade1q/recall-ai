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
  const { selectedLevel, setLevel, unavailableReason } = document;
  const lockedTooltip = unavailableReason ? UNAVAILABLE_TOOLTIP[unavailableReason] : undefined;

  return (
    // Segmented control liền khối (mockup `.seg`): một viền bao ngoài, `overflow-hidden`, nền muted;
    // nút đang chọn nhận nền `card` + shadow-soft. Không phải nhóm-viên-thuốc có khe hở.
    <div
      className="border-border bg-muted inline-flex items-center overflow-hidden rounded-[calc(var(--radius)*0.7)] border"
      role="group"
      aria-label="Hiển thị tài liệu"
    >
      <span className="text-muted-foreground self-center pl-3 pr-2.5 text-xs">Tài liệu</span>
      {LEVELS.map((level) => {
        const isLocked = level !== 'hidden' && unavailableReason !== null;

        return (
          <button
            key={level}
            type="button"
            aria-pressed={selectedLevel === level}
            aria-disabled={isLocked || undefined}
            title={isLocked ? lockedTooltip : undefined}
            onClick={() => setLevel(level)}
            className={`focus-visible:outline-ring px-[13px] py-[7px] text-[13px] font-medium outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 ${
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
  const { level, sources, setLevel } = document;

  if (level === 'excerpt') {
    return <DocumentExcerpt sources={sources} />;
  }

  // Toàn văn bám vào nguồn ĐẦU TIÊN sau khi sắp theo trang: đó là chỗ khái niệm xuất hiện sớm nhất
  // trong tệp, tức trang đáng mở nhất khi người học muốn đọc rộng ra quanh nó.
  return (
    <DocumentFullText
      key={sources[0].documentId}
      planId={planId}
      source={sources[0]}
      onFallbackToExcerpt={() => setLevel('excerpt')}
    />
  );
}
