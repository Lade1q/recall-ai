import { ChevronDown } from 'lucide-react';

import { cn } from '@/lib/utils';
import { masteryBand, masteryLabel } from '@/components/ui/concept-node';
import { VerdictBadge } from './VerdictBadge';
import type {
  InterviewTurnResponse,
  SessionSummaryConceptResponse,
  SessionSummaryReviewItemResponse,
  SessionSummaryTurnResponse,
} from '../types/interview.types';
import { TRACEBACK_THRESHOLD, masteryColor } from '../utils/summary-display';
import { normalizedTurnWeights } from '../utils/turn-weights';
import { QUESTION_TYPE_LABEL } from '../utils/question-type';

interface ScoreBreakdownProps {
  concepts: SessionSummaryConceptResponse[];
  /**
   * Transcript đầy đủ của phiên (`GET /interviews/:id`), đã tải sẵn cho màn vấn đáp.
   * `GET /summary` cố tình chỉ trả `{ turnIndex, score, verdict }` cho mỗi lượt (hợp đồng
   * I6.5 #117) — câu hỏi, câu trả lời và nhận xét lấy từ đây, không gọi thêm API nào.
   */
  turns: InterviewTurnResponse[];
  /** Để nói được mỗi khái niệm sẽ quay lại khi nào, hoặc đã kéo theo mấy khái niệm nền. */
  reviewSchedule: SessionSummaryReviewItemResponse[];
}

/** Khoá ghép một lượt của bảng điểm với đúng lượt đó trong transcript. */
function turnKey(conceptId: string, turnIndex: number): string {
  return `${conceptId}:${turnIndex}`;
}

const DAY_MS = 86_400_000;

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function formatDayMonth(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}`;
}

export function ScoreBreakdown({ concepts, turns, reviewSchedule }: ScoreBreakdownProps) {
  if (concepts.length === 0) return null;

  const transcriptByTurn = new Map(
    turns.map((turn) => [turnKey(turn.conceptId, turn.turnIndex), turn])
  );

  // Lịch ôn giãn cách của chính khái niệm đó (khi nào nó quay lại), tách khỏi các hàng
  // `traceback` — những hàng kia là khái niệm NỀN, không phải khái niệm này.
  const spacedByConcept = new Map(
    reviewSchedule
      .filter((item) => item.reason === 'spaced_repetition')
      .map((item) => [item.conceptId, item])
  );
  // Đếm theo `sourceConceptId` (#310), không theo tên — tên gãy khi hai khái niệm trùng nhau.
  const tracebackCountBySource = new Map<string, number>();
  for (const item of reviewSchedule) {
    if (item.reason !== 'traceback' || !item.sourceConceptId) continue;
    const current = tracebackCountBySource.get(item.sourceConceptId) ?? 0;
    tracebackCountBySource.set(item.sourceConceptId, current + 1);
  }

  // Khái niệm yếu nhất mở sẵn: nếu sinh viên chỉ đọc một chỗ trên trang này thì đây là chỗ đó.
  let weakestConceptId: string | null = null;
  let weakestScore = Number.POSITIVE_INFINITY;
  for (const concept of concepts) {
    if (concept.masteryScore !== null && concept.masteryScore < weakestScore) {
      weakestScore = concept.masteryScore;
      weakestConceptId = concept.conceptId;
    }
  }

  return (
    <section className="flex flex-col gap-4" id="ket-qua" aria-labelledby="tt-ket-qua">
      <div>
        <p className="text-muted-foreground mb-1 text-[13px] font-medium uppercase tracking-wider">
          Bằng chứng
        </p>
        <h2 className="text-foreground font-heading text-xl tracking-[-0.01em]" id="tt-ket-qua">
          Kết quả từng khái niệm
        </h2>
        <p className="text-muted-foreground mt-2 text-[14.5px] leading-[1.6]">
          Giữ nguyên thứ tự hàng đợi bạn vừa làm. Chiều dài thanh là điểm sau phiên, vạch cắt ngang
          là ngưỡng {TRACEBACK_THRESHOLD.toFixed(2)}. Mở một khái niệm để đọc lại các lượt hỏi–đáp
          và điểm từng lượt.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {concepts.map((concept, idx) => {
          const color = masteryColor(concept.masteryScore);
          const barWidth = concept.masteryScore === null ? 0 : concept.masteryScore * 100;

          return (
            <details
              key={concept.conceptId}
              open={concept.conceptId === weakestConceptId}
              className="bg-card border-border group overflow-hidden rounded-lg border [&_summary::-webkit-details-marker]:hidden"
            >
              <summary className="hover:bg-accent/50 flex cursor-pointer items-center gap-3 p-4 transition-colors">
                <span className="text-muted-foreground font-mono text-xs">
                  {String(idx + 1).padStart(2, '0')}
                </span>

                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="text-foreground text-[14.5px] font-medium">{concept.name}</span>
                  <ConceptNote
                    band={masteryBand(concept.masteryScore)}
                    scheduledFor={spacedByConcept.get(concept.conceptId)?.scheduledFor ?? null}
                    tracebackCount={tracebackCountBySource.get(concept.conceptId) ?? 0}
                  />
                </div>

                <div className="hidden w-24 flex-col justify-center sm:flex md:w-32">
                  <div className="bg-muted relative h-2.5 w-full overflow-hidden rounded-full">
                    <div
                      className="absolute left-0 top-0 h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(barWidth, 100)}%`, backgroundColor: color }}
                    />
                    <div
                      className="bg-foreground/20 absolute bottom-0 top-0 w-px"
                      style={{ left: `${TRACEBACK_THRESHOLD * 100}%` }}
                    />
                  </div>
                </div>

                <div className="flex w-12 justify-end">
                  <span className="font-mono text-[14.5px] font-medium" style={{ color }}>
                    {concept.masteryScore !== null ? concept.masteryScore.toFixed(2) : '--'}
                  </span>
                </div>

                <ChevronDown className="text-muted-foreground h-4 w-4 transition-transform duration-200 group-open:rotate-180" />
              </summary>

              <div className="border-border border-t px-4 py-4 sm:px-6">
                {concept.turns.length === 0 ? (
                  <p className="text-muted-foreground text-[13.5px] leading-[1.6]">
                    Khái niệm này chưa được hỏi trong phiên — hàng đợi kết thúc trước khi tới lượt
                    nó.
                  </p>
                ) : (
                  <>
                    <WeightedFormula turns={concept.turns} masteryScore={concept.masteryScore} />
                    <div className="mt-4 flex flex-col gap-5">
                      {concept.turns.map((turn) => (
                        <TurnDetail
                          key={turn.turnIndex}
                          turn={turn}
                          transcript={
                            transcriptByTurn.get(turnKey(concept.conceptId, turn.turnIndex)) ?? null
                          }
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
}

/**
 * Dòng phụ dưới tên khái niệm (`.cr__note` của mockup): khái niệm này đi về đâu sau phiên.
 * Khái niệm dưới ngưỡng đã kéo theo khái niệm nền thì nói điều đó — nó quan trọng hơn ngày ôn.
 */
function ConceptNote({
  band,
  scheduledFor,
  tracebackCount,
}: {
  band: ReturnType<typeof masteryBand>;
  scheduledFor: string | null;
  tracebackCount: number;
}) {
  const label = masteryLabel(band);

  if (tracebackCount > 0) {
    return (
      <span className="text-muted-foreground text-xs">
        {label} — đã truy ngược, {tracebackCount} khái niệm nền được xếp trước
      </span>
    );
  }

  const date = scheduledFor ? new Date(scheduledFor) : null;
  if (!date || Number.isNaN(date.getTime())) {
    return <span className="text-muted-foreground text-xs">{label}</span>;
  }

  const days = Math.round((startOfDay(date) - startOfDay(new Date())) / DAY_MS);
  const when =
    days <= 0
      ? 'hôm nay'
      : days === 1
        ? 'ngày mai'
        : `sau ${days} ngày, ngày ${formatDayMonth(date)}`;

  return (
    <span className="text-muted-foreground text-xs">
      {label} — ôn lại {when}
    </span>
  );
}

/**
 * `.tsep` của mockup: "3 lượt · 0.85 ×0.2 + 0.80 ×0.3 + 0.90 ×0.5 = 0.86". Ba con số trong một
 * hàng phải khớp nhau khi tính tay — bản thiết kế mà cộng không ra thì người đọc sẽ không tin
 * bất kỳ con số nào khác trên trang.
 *
 * Kết thúc sớm được nói thẳng cùng trọng số đã chuẩn hoá, vì đó chính là chỗ dễ hiểu lầm là
 * "bị phạt hai lần".
 */
function WeightedFormula({
  turns,
  masteryScore,
}: {
  turns: SessionSummaryTurnResponse[];
  masteryScore: number | null;
}) {
  const weights = normalizedTurnWeights(turns.length);
  const allScored = turns.every((turn) => turn.score !== null);

  if (!weights || !allScored || masteryScore === null) {
    return <div className="text-muted-foreground text-xs">{turns.length} lượt</div>;
  }

  const isEarlyStop = turns.length < 3;

  return (
    <div className="text-muted-foreground text-xs leading-[1.7]">
      {turns.length} lượt{isEarlyStop && ' · kết thúc sớm'} ·{' '}
      <span className="font-mono">
        {turns.map((turn, idx) => (
          <span key={turn.turnIndex}>
            {idx > 0 && ' + '}
            {(turn.score ?? 0).toFixed(2)} ×{(weights[idx] ?? 0).toFixed(1)}
          </span>
        ))}
        {' = '}
        {masteryScore.toFixed(2)}
      </span>
    </div>
  );
}

interface TurnDetailProps {
  turn: SessionSummaryTurnResponse;
  /** `null` khi transcript chưa tải kịp — vẫn hiện đủ điểm và verdict, chỉ thiếu phần chữ. */
  transcript: InterviewTurnResponse | null;
}

function TurnDetail({ turn, transcript }: TurnDetailProps) {
  const typeLabel = transcript?.questionType ? QUESTION_TYPE_LABEL[transcript.questionType] : null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground text-[13px]">Lượt {turn.turnIndex}</span>
        {typeLabel && (
          <>
            <span className="text-muted-foreground text-[13px]">·</span>
            <span className="text-muted-foreground text-[13px]">{typeLabel}</span>
          </>
        )}
        <span className="text-muted-foreground text-[13px]">·</span>
        {turn.verdict ? (
          <VerdictBadge verdict={turn.verdict} />
        ) : (
          <span className="text-muted-foreground text-[13px]">Chưa chấm</span>
        )}
        <span className="ml-auto font-mono text-[13px]">
          {turn.score !== null ? turn.score.toFixed(2) : '--'}
        </span>
      </div>

      {transcript && (
        <div className="flex flex-col gap-2">
          <p className="text-foreground text-[14px] leading-[1.6]">{transcript.questionText}</p>

          {transcript.answerText !== null && (
            <div className="border-border bg-muted/50 rounded border-l-2 px-3 py-2">
              <p className="text-muted-foreground mb-1 text-[12px] font-medium">Bạn trả lời</p>
              <p className="text-foreground whitespace-pre-line text-[13.5px] leading-[1.6]">
                {transcript.answerText}
              </p>
            </div>
          )}

          {transcript.feedback !== null && (
            <p
              className={cn(
                'text-muted-foreground text-[13.5px] leading-[1.6]',
                transcript.answerText === null && 'mt-1'
              )}
            >
              {transcript.feedback}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
