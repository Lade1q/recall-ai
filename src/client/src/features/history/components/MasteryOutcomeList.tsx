import { cn } from '@/lib/utils';
import { TRACEBACK_THRESHOLD, masteryColor } from '@/features/interview/utils/summary-display';
import type { SessionSummaryResponse } from '@/features/interview/types/interview.types';
import { readMasteryDelta, formatDifference, formatScore } from '../utils/mastery-delta';
import { dedupeByConceptId } from '../utils/dedupe-concepts';
import type { InterviewSessionListConceptDelta } from '../types/history.types';

/**
 * Bước #4 — biến động `mastery_score` trước → sau phiên, kèm vạch ngưỡng `0.60`.
 *
 * `0.60` là ranh giới quyết định của vòng lặp lõi (đạt → xếp lịch ôn giãn cách; dưới → truy
 * ngược), KHÔNG phải mốc "đã vững" `0.80` mà Dashboard dùng. Hai con số khác nghĩa hẳn nhau.
 *
 * Điểm "trước" chỉ có ở `GET /interviews` (`masteryBefore`), không có trong `/summary` — nên
 * khối này đọc từ mục danh sách đang chọn chứ không từ phản hồi chi tiết.
 */
export function MasteryOutcomeList({
  concepts,
  summary,
}: {
  concepts: InterviewSessionListConceptDelta[];
  summary: SessionSummaryResponse | null;
}) {
  const uniqueConcepts = dedupeByConceptId(concepts);
  if (uniqueConcepts.length === 0) return null;

  // Số lượt ĐÃ CHẤM của từng khái niệm — để nói "chấm trên 2/3 lượt" cho phiên bỏ dở.
  //
  // Đếm `turns.length` là sai: `/summary` trả **mọi** lượt, kể cả lượt đã hỏi mà chưa trả lời
  // (`score: null`). Đó chính là ca abandon thường gặp nhất — bỏ dở đúng lúc câu kế vừa hiện —
  // và nó làm dòng này ghi "chấm trên 2/3 lượt" trong khi khối phép tính ngay bên dưới ghi
  // "trọng số gốc của 1 lượt đầu", vì `MasteryCalculation` vốn đã lọc theo `score !== null`.
  // Hai con số cùng nói về một khái niệm thì phải đếm cùng một thứ.
  const turnCountByConcept = new Map(
    (summary?.concepts ?? []).map((concept) => [
      concept.conceptId,
      concept.turns.filter((turn) => turn.score !== null).length,
    ])
  );
  // Đếm khái niệm nền mà truy ngược đã chèn, gom theo `sourceConceptId` (#310) chứ không theo
  // tên: hai khái niệm trùng tên sẽ cộng nhầm vào nhau.
  const tracebackCountBySource = new Map<string, number>();
  for (const item of summary?.reviewSchedule ?? []) {
    if (item.reason !== 'traceback' || !item.sourceConceptId) continue;
    tracebackCountBySource.set(
      item.sourceConceptId,
      (tracebackCountBySource.get(item.sourceConceptId) ?? 0) + 1
    );
  }

  return (
    <div>
      {uniqueConcepts.map((concept) => (
        <OutcomeRow
          key={concept.conceptId}
          concept={concept}
          turnCount={turnCountByConcept.get(concept.conceptId) ?? null}
          tracebackCount={tracebackCountBySource.get(concept.conceptId) ?? 0}
        />
      ))}
    </div>
  );
}

function OutcomeRow({
  concept,
  turnCount,
  tracebackCount,
}: {
  concept: InterviewSessionListConceptDelta;
  turnCount: number | null;
  tracebackCount: number;
}) {
  const delta = readMasteryDelta(concept);
  const color = masteryColor(delta.after);

  return (
    <div className="border-border grid grid-cols-[1fr_152px] items-center gap-3.5 border-b py-3 last:border-b-0">
      <div>
        <div className="text-[14px] font-medium">{concept.name}</div>
        <div className="text-muted-foreground mt-0.5 text-[12px]">
          <OutcomeNote delta={delta} turnCount={turnCount} tracebackCount={tracebackCount} />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-end gap-[7px] font-mono text-[12.5px] tabular-nums">
          <span className="text-muted-foreground">
            {delta.kind === 'changed' ? `${formatScore(delta.before)} →` : '— →'}
          </span>
          <span>{formatScore(delta.after)}</span>
          {delta.kind === 'first' && (
            <span className="border-border text-muted-foreground rounded border border-dashed px-1.5 py-px text-[11px]">
              lần đầu
            </span>
          )}
          {delta.kind === 'changed' && delta.difference !== null && (
            <DifferenceChip difference={delta.difference} />
          )}
        </div>

        <MasteryTrack before={delta.before} after={delta.after} color={color} />
      </div>
    </div>
  );
}

function DifferenceChip({ difference }: { difference: number }) {
  const rounded = Math.round(difference * 100) / 100;
  return (
    <span
      className={cn(
        'border-border text-muted-foreground rounded border px-1.5 py-px text-[11px]',
        rounded > 0 && 'border-mastery-strong/45 text-mastery-strong',
        rounded < 0 && 'border-mastery-weak/45 text-mastery-weak'
      )}
    >
      {formatDifference(rounded)}
    </span>
  );
}

/**
 * Thanh điểm. Phần đã có TRƯỚC phiên vẽ nhạt, phần phiên này đóng góp vẽ đậm — nhìn ra ngay
 * phiên đóng góp bao nhiêu mà không phải đọc số.
 *
 * Điểm GIẢM dùng đúng hai lớp đó theo chiều ngược lại: lớp đậm dừng ở điểm mới, phần nhạt còn
 * thò ra chính là phần đã mất. Không cần lớp thứ ba, và không có ca nào vẽ "mức tăng âm".
 */
function MasteryTrack({
  before,
  after,
  color,
}: {
  before: number | null;
  after: number | null;
  color: string;
}) {
  const clamp = (value: number) => Math.max(0, Math.min(1, value)) * 100;
  const solid =
    after === null
      ? null
      : before !== null && after >= before
        ? { left: clamp(before), width: clamp(after) - clamp(before) }
        : { left: 0, width: clamp(after) };

  return (
    <div className="bg-muted relative mt-[7px] h-1.5 rounded-[3px]">
      {before !== null && (
        <span
          className="absolute inset-y-0 left-0 rounded-[3px] opacity-[0.32]"
          style={{ width: `${clamp(before)}%`, backgroundColor: color }}
        />
      )}
      {solid && (
        <span
          className="absolute inset-y-0 rounded-[3px]"
          style={{ left: `${solid.left}%`, width: `${solid.width}%`, backgroundColor: color }}
        />
      )}
      {/* Vạch ngưỡng 0.60 — thứ duy nhất trên thanh không phải dữ liệu của khái niệm này. */}
      <span
        className="bg-foreground absolute -top-[3px] bottom-[-3px] w-px opacity-55"
        style={{ left: `${TRACEBACK_THRESHOLD * 100}%` }}
        aria-hidden="true"
      />
    </div>
  );
}

/**
 * Dòng phụ nói khái niệm này đi về đâu sau phiên. Chỉ khẳng định "đã truy ngược" khi lịch ôn
 * THẬT SỰ có hàng `traceback` sinh từ khái niệm đó — dưới ngưỡng không tự động nghĩa là đã
 * chèn được khái niệm nền (khái niệm không có tiên quyết thì không chèn được gì).
 */
function OutcomeNote({
  delta,
  turnCount,
  tracebackCount,
}: {
  delta: ReturnType<typeof readMasteryDelta>;
  turnCount: number | null;
  tracebackCount: number;
}) {
  if (delta.kind === 'ungraded') {
    return <>Phiên này chưa chấm khái niệm này</>;
  }

  const turnNote = turnCount !== null && turnCount < 3 ? ` · chấm trên ${turnCount}/3 lượt` : '';

  if (delta.kind === 'first') {
    return <>Lần đầu được kiểm tra — trước đó chưa đo, không phải 0{turnNote}</>;
  }

  const after = delta.after ?? 0;
  if (after >= TRACEBACK_THRESHOLD) {
    return <>Vượt ngưỡng — chuyển sang lịch ôn giãn cách{turnNote}</>;
  }
  if (tracebackCount > 0) {
    return (
      <>
        Dưới ngưỡng — đã truy ngược, {tracebackCount} khái niệm nền xếp trước{turnNote}
      </>
    );
  }
  return (
    <>
      Dưới ngưỡng {TRACEBACK_THRESHOLD.toFixed(2)}
      {turnNote}
    </>
  );
}
