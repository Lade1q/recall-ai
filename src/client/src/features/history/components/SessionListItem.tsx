import { cn } from '@/lib/utils';
import { SessionStatusLine } from './SessionStatusLine';
import { formatDayTime } from '../utils/format';
import { dedupeByConceptId } from '../utils/dedupe-concepts';
import { readMasteryDelta, formatDifference, formatScore } from '../utils/mastery-delta';
import type {
  InterviewSessionListItem,
  InterviewSessionListConceptDelta,
} from '../types/history.types';

/**
 * Một hàng của danh sách phiên (SPEC_DB-03 bước #2). Thứ chiếm chỗ nhiều nhất là **biến động
 * điểm từng khái niệm**, không phải điểm trung bình: trung bình cộng của các khái niệm ở những
 * giai đoạn khác nhau nói được rất ít, nên nó lùi xuống hàng phụ (ghi chú cuối SPEC_DB-03).
 */
export function SessionListItem({
  session,
  selected,
  onSelect,
}: {
  session: InterviewSessionListItem;
  selected: boolean;
  onSelect: () => void;
}) {
  // Khái niệm phiên này không chấm được lượt nào thì không có chip: một chip "—" chiếm chỗ
  // đúng bằng một chip có tin, mà không nói thêm được gì.
  const graded = dedupeByConceptId(session.concepts).filter(
    (concept) => concept.masteryAfter !== null
  );

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? 'true' : undefined}
      className={cn(
        'hover:bg-accent focus-visible:ring-ring/50 block w-full cursor-pointer border-l-2 border-transparent px-[18px] pb-[13px] pt-[11px] text-left transition-colors focus-visible:outline-none focus-visible:ring-2',
        selected && 'bg-accent border-l-foreground'
      )}
    >
      <div className="flex items-baseline justify-between gap-2.5">
        <span className="font-mono text-[12.5px] tabular-nums">
          {formatDayTime(session.startedAt)}
        </span>
        <span className="text-muted-foreground shrink-0 font-mono text-[12px] tabular-nums">
          {session.averageMasteryScore !== null
            ? `TB ${session.averageMasteryScore.toFixed(2)}`
            : '—'}
        </span>
      </div>

      <div className="text-muted-foreground mt-px truncate text-[12.5px]">
        {session.plan.name} · {session.conceptTotal} khái niệm
      </div>

      {graded.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-[5px]">
          {graded.map((concept) => (
            <DeltaChip key={concept.conceptId} concept={concept} />
          ))}
        </div>
      )}

      <SessionStatusLine status={session.status} fallbackMode={session.fallbackMode} />
    </button>
  );
}

/**
 * Chip biến động. Dấu `+`/`−` và kiểu viền là kênh đọc thứ hai bên cạnh màu — ba token mastery
 * đều ở lightness ≈ 0.5 và chỉ khác nhau ở sắc, nên chỉ dựa vào màu là mất tin với người khó
 * phân biệt màu (ghi chú `.delta` trong mockup).
 */
function DeltaChip({ concept }: { concept: InterviewSessionListConceptDelta }) {
  const delta = readMasteryDelta(concept);

  if (delta.kind === 'first') {
    return (
      <span className="border-border text-muted-foreground bg-card inline-flex items-center gap-1 rounded border border-dashed px-1.5 py-px font-mono text-[11px] tabular-nums">
        {concept.name} {formatScore(delta.after)}
      </span>
    );
  }

  if (delta.kind === 'changed' && delta.difference !== null) {
    // Làm tròn 2 chữ số TRƯỚC khi so 0, để `+0.001` không hiện thành chip xanh "+0.00".
    const rounded = Math.round(delta.difference * 100) / 100;
    return (
      <span
        className={cn(
          'border-border text-muted-foreground bg-card inline-flex items-center gap-1 rounded border px-1.5 py-px font-mono text-[11px] tabular-nums',
          rounded > 0 && 'border-mastery-strong/45 text-mastery-strong',
          rounded < 0 && 'border-mastery-weak/45 text-mastery-weak'
        )}
      >
        {concept.name} {formatDifference(rounded)}
      </span>
    );
  }

  return null;
}
