import { cn } from '@/lib/utils';
import { masteryColor } from '@/features/interview/utils/summary-display';
import { normalizedTurnWeights, TURN_WEIGHTS } from '@/features/interview/utils/turn-weights';
import {
  countingTurns,
  HINT_TURN_NOTE,
  weightSlotByTurnId,
} from '@/features/interview/utils/turn-mode';
import { QUESTION_TYPE_LABEL } from '@/features/interview/utils/question-type';
import type {
  InterviewTurnResponse,
  SessionSummaryResponse,
} from '@/features/interview/types/interview.types';

/**
 * Bước #7 — bản ghi hỏi–đáp và cách tính điểm. Đây là thứ biến "AI cho tôi 0.42" thành một con
 * số kiểm chứng được, nên nó là lý do tồn tại của cả màn hình.
 *
 * Xương sống là **transcript** (`GET /interviews/:id`) chứ không phải `/summary`: `/summary`
 * cố tình chỉ trả `{ turnIndex, score, verdict }` cho mỗi lượt (hợp đồng I6.5), không có câu
 * hỏi, câu trả lời hay nhận xét. Dựng từ transcript cũng là cách khối này chạy được cho phiên
 * `paused` — phiên chưa đóng không có `/summary` để mà đọc.
 */
export function QaTranscript({
  turns,
  summary,
}: {
  turns: InterviewTurnResponse[];
  summary: SessionSummaryResponse | null;
}) {
  const concepts = groupTurnsByConcept(turns, summary);
  if (concepts.length === 0) return null;

  // Mở sẵn khái niệm bị chấm thấp nhất: nếu sinh viên chỉ đọc một chỗ trên trang này thì đây
  // là chỗ đó. Chưa có điểm nào (phiên tạm dừng) thì mở khái niệm đang dở — cái cuối cùng.
  let openId = concepts[concepts.length - 1]?.conceptId ?? null;
  let lowest = Number.POSITIVE_INFINITY;
  for (const concept of concepts) {
    if (concept.masteryScore !== null && concept.masteryScore < lowest) {
      lowest = concept.masteryScore;
      openId = concept.conceptId;
    }
  }

  return (
    <div>
      {concepts.map((concept) => (
        <ConceptTranscript
          key={concept.conceptId}
          concept={concept}
          defaultOpen={concept.conceptId === openId}
        />
      ))}
    </div>
  );
}

interface ConceptTranscriptData {
  conceptId: string;
  name: string;
  masteryScore: number | null;
  turns: InterviewTurnResponse[];
}

/**
 * Gom lượt theo khái niệm, giữ **thứ tự hàng đợi của phiên** khi có `/summary` (đó là thứ tự
 * sinh viên thực sự đi qua). Không có `/summary` thì dùng thứ tự xuất hiện đầu tiên trong
 * transcript, vốn cũng chính là thứ tự đó.
 */
function groupTurnsByConcept(
  turns: InterviewTurnResponse[],
  summary: SessionSummaryResponse | null
): ConceptTranscriptData[] {
  const byConcept = new Map<string, InterviewTurnResponse[]>();
  const nameById = new Map<string, string>();
  for (const turn of turns) {
    nameById.set(turn.conceptId, turn.conceptName);
    const existing = byConcept.get(turn.conceptId);
    if (existing) existing.push(turn);
    else byConcept.set(turn.conceptId, [turn]);
  }
  for (const list of byConcept.values()) list.sort((a, b) => a.turnIndex - b.turnIndex);

  const scoreById = new Map(
    (summary?.concepts ?? []).map((concept) => [concept.conceptId, concept.masteryScore])
  );
  // `summary.concepts` duyệt theo `conceptQueue`, mà hàng đợi có thể nhắc cùng một khái niệm
  // nhiều lần — lọc trùng để khái niệm đó không hiện thành mấy khối giống hệt nhau.
  const order = [
    ...new Set(
      summary !== null
        ? summary.concepts.map((concept) => concept.conceptId)
        : [...byConcept.keys()]
    ),
  ];

  const result: ConceptTranscriptData[] = [];
  for (const conceptId of order) {
    const conceptTurns = byConcept.get(conceptId);
    // Khái niệm trong hàng đợi mà chưa được hỏi lượt nào: không có gì để đọc lại, và một mục
    // rỗng chỉ làm dài danh sách. Điểm của nó vẫn hiện ở khối biến động phía trên.
    if (!conceptTurns || conceptTurns.length === 0) continue;
    result.push({
      conceptId,
      name:
        summary?.concepts.find((c) => c.conceptId === conceptId)?.name ??
        nameById.get(conceptId) ??
        'Khái niệm đã bị xoá',
      masteryScore: scoreById.get(conceptId) ?? null,
      turns: conceptTurns,
    });
  }
  return result;
}

function ConceptTranscript({
  concept,
  defaultOpen,
}: {
  concept: ConceptTranscriptData;
  defaultOpen: boolean;
}) {
  // Trọng số phải tra theo VỊ TRÍ SAU KHI NÉN, không theo `turnIndex` (#392 (c)) — bỏ lượt 2 ra
  // khỏi công thức thì lượt 3 ăn trọng số thứ hai.
  const weightSlots = weightSlotByTurnId(concept.turns);

  return (
    <details
      open={defaultOpen}
      className="border-border group border-b first:border-t [&_summary::-webkit-details-marker]:hidden"
    >
      <summary className="flex cursor-pointer list-none items-center gap-2.5 px-0.5 py-[13px] text-[14px]">
        <span
          className="text-muted-foreground w-3 shrink-0 text-center font-mono text-[15px] leading-none"
          aria-hidden="true"
        >
          <span className="group-open:hidden">+</span>
          <span className="hidden group-open:inline">−</span>
        </span>
        {concept.name}
        {/* Đếm lượt ĐÃ HỎI, cố ý khác con số "chấm trên N/3 lượt" ở khối biến động (khối đó
            đếm lượt đã CHẤM). Ở đây con số phải khớp số khối hỏi–đáp render ngay bên dưới —
            một lượt đã hỏi mà chưa trả lời vẫn có câu hỏi để đọc lại. Ghi "2/3 lượt" rồi hiện
            2 khối là nhất quán; đổi thành lượt-đã-chấm sẽ ghi "1/3" mà vẫn hiện 2 khối. */}
        <span className="text-muted-foreground ml-auto shrink-0 font-mono text-[11px]">
          {concept.turns.length}/{TURN_WEIGHTS.length} lượt
        </span>
        <span
          className="shrink-0 font-mono text-[12.5px] tabular-nums"
          style={{ color: masteryColor(concept.masteryScore) }}
        >
          {concept.masteryScore !== null ? concept.masteryScore.toFixed(2) : '—'}
        </span>
      </summary>

      <div className="flex flex-col gap-3 pb-5 pl-[22px] pt-1">
        {concept.turns.map((turn) => (
          <TurnBlock key={turn.id} turn={turn} weightSlot={weightSlots.get(turn.id) ?? null} />
        ))}
        <MasteryCalculation turns={concept.turns} masteryScore={concept.masteryScore} />
      </div>
    </details>
  );
}

const VERDICT_BORDER = {
  deep: 'border-l-mastery-strong',
  shallow: 'border-l-mastery-learning',
  wrong: 'border-l-mastery-weak',
} as const;

function TurnBlock({
  turn,
  weightSlot,
}: {
  turn: InterviewTurnResponse;
  /** Vị trí của lượt trong công thức, hoặc `null` khi nó không vào công thức (lượt gợi ý). */
  weightSlot: number | null;
}) {
  const typeLabel = turn.questionType ? QUESTION_TYPE_LABEL[turn.questionType] : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="text-muted-foreground mt-1.5 font-mono text-[11px] tracking-[0.04em]">
        Lượt {turn.turnIndex}
        {typeLabel ? ` · ${typeLabel}` : ''}
      </div>

      <div className="text-[13.5px] leading-[1.65]">
        <div className="text-muted-foreground mb-[3px] text-[11px] uppercase tracking-[0.05em]">
          Câu hỏi
        </div>
        <p className="m-0">{turn.questionText}</p>
      </div>

      {/* Lượt đã hỏi mà chưa trả lời (phiên tạm dừng dừng đúng ở đây) không có khối trả lời —
          và cũng không có điểm để mà giải thích. */}
      {turn.answerText !== null && (
        <div className="text-[13.5px] leading-[1.65]">
          <div className="text-muted-foreground mb-[3px] text-[11px] uppercase tracking-[0.05em]">
            Bạn trả lời
          </div>
          <p className="border-border text-muted-foreground m-0 whitespace-pre-line border-l-2 pl-3">
            {turn.answerText}
          </p>
        </div>
      )}

      {turn.score !== null && (
        <div
          className={cn(
            'border-border bg-card rounded-lg border border-l-2 px-3.5 py-3',
            turn.verdict ? VERDICT_BORDER[turn.verdict] : undefined
          )}
        >
          <div className="text-muted-foreground mb-[7px] flex flex-wrap items-center gap-[9px] font-mono text-[11.5px]">
            <span className="text-foreground text-[13px] tabular-nums">
              {turn.score.toFixed(2)}
            </span>
            {turn.verdict && <span>{turn.verdict}</span>}
            <TurnWeightNote weightSlot={weightSlot} />
          </div>
          {/* `feedback` là `null` cho lượt tự chấm (AE-05) — không có AI nào viết gì để hiện. */}
          {turn.feedback !== null && (
            <p className="m-0 text-[13px] leading-[1.6]">{turn.feedback}</p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Trọng số GỐC của lượt. Trọng số đã chuẩn hoá nằm ở phép tính cuối khối, không lặp ở đây.
 *
 * `weightSlot === null` là lượt gợi ý: nó CÓ điểm và CÓ verdict nhưng không có số hạng nào trong
 * công thức, nên chỗ này phải nói ra — bỏ trống sẽ để người đọc tự kết luận là app tính thiếu.
 */
function TurnWeightNote({ weightSlot }: { weightSlot: number | null }) {
  if (weightSlot === null) return <span>· {HINT_TURN_NOTE}</span>;
  const weight = TURN_WEIGHTS[weightSlot];
  if (weight === undefined) return null;
  return <span>· trọng số gốc {weight.toFixed(1)}</span>;
}

/**
 * Phép tính ra `mastery_score` của khái niệm.
 *
 * Với ít hơn 3 lượt, trọng số `[0.2, 0.3, 0.5]` được **chuẩn hoá lại** trên số lượt thực có
 * (SPEC_DB-03 AF3 bước #2) — hai lượt thành `[0.4, 0.6]`. Bắt buộc phải hiện đúng bộ đã chuẩn
 * hoá, nếu không phép tính trên màn hình sẽ không ra con số ngay bên cạnh nó, và người đọc sẽ
 * thôi tin mọi con số khác trên trang.
 */
function MasteryCalculation({
  turns,
  masteryScore,
}: {
  turns: InterviewTurnResponse[];
  masteryScore: number | null;
}) {
  // Lượt gợi ý bị loại TRƯỚC, rồi mới tới lượt chưa chấm — hai luật khác nhau (#392 (c)).
  const scored = countingTurns(turns).filter((turn) => turn.score !== null);
  const weights = normalizedTurnWeights(scored.length);

  if (masteryScore === null || weights === null || scored.length === 0) return null;

  const isNormalized = scored.length < TURN_WEIGHTS.length;

  return (
    <div className="bg-muted border-border overflow-x-auto whitespace-nowrap rounded-md border px-3 py-2.5 font-mono text-[12px] tabular-nums">
      {scored.map((turn, index) => (
        <span key={turn.id}>
          {index > 0 && <>&nbsp;+&nbsp;</>}
          {(turn.score ?? 0).toFixed(2)} × {(weights[index] ?? 0).toFixed(1)}
        </span>
      ))}
      &nbsp;=&nbsp;<b className="font-semibold">{masteryScore.toFixed(2)}</b>
      <div className="text-muted-foreground mt-[7px] whitespace-normal font-sans text-[12px]">
        {isNormalized ? (
          <>
            Trọng số gốc của {scored.length} lượt đầu là{' '}
            {TURN_WEIGHTS.slice(0, scored.length)
              .map((weight) => weight.toFixed(1))
              .join(' và ')}
            ; thiếu lượt{' '}
            {TURN_WEIGHTS.slice(scored.length)
              .map((_, index) => scored.length + index + 1)
              .join(' và ')}{' '}
            nên chia lại theo tỉ lệ thành {weights.map((weight) => weight.toFixed(1)).join(' và ')}.
            Con số vẫn dùng được để xếp lịch, nhưng nó đo ít hơn{' '}
            {TURN_WEIGHTS.length - scored.length} lượt.
          </>
        ) : (
          <>
            Trọng số tăng dần vì câu sau sâu hơn câu trước (UC-Overview §5.4). Ba lượt là trần cứng
            của ràng buộc C6 — không có lượt thứ tư để gỡ điểm.
          </>
        )}
      </div>
    </div>
  );
}
