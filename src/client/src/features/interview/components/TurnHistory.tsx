import { Fragment } from 'react';
import { ChatBubble } from '@/components/ui/chat-bubble';
import { MetaMono } from '@/components/ui/kbd';
import { cn } from '@/lib/utils';
import { VerdictBadge } from './VerdictBadge';
import { SourceCitation } from './SourceCitation';
import { SystemMessage } from './SystemMessage';
import { VERDICT_LABEL } from '../utils/verdict';
import type { InterviewTurnResponse, TurnVerdict } from '../types/interview.types';
import { Heading } from '@/components/ui/heading';

interface TurnHistoryProps {
  /** Transcript ĐẦY ĐỦ của phiên, cũ nhất trước — kể cả lượt đang chờ trả lời. */
  turns: InterviewTurnResponse[];
  /** Lượt của câu hỏi đang chờ: không vẽ ở đây vì `QuestionCard` đã vẽ nó. */
  currentTurnId: string | null;
  /** Trần lượt/khái niệm của phiên (C6) — chỉ để đọc "lượt 2/3", không dùng để đếm. */
  maxTurnsPerConcept: number;
  /**
   * Phiên đang ở chế độ flashcard (AE-05). Đổi HẲN luật điều phối: `resolveFallbackStep`
   * (`interview-state.ts`) phát hết câu hỏi cache còn lại theo thứ tự và KHÔNG nhìn verdict,
   * khác `decideNextStep` của chế độ AI. Ghi chú điều phối phải nói theo luật đang chạy.
   */
  fallbackMode: boolean;
}

/**
 * Hội thoại các lượt đã diễn ra, cũ nhất trước (AE-02). Mỗi lượt gồm: câu hỏi (bong bóng
 * AI), câu trả lời của sinh viên (bong bóng trung tính), rồi thẻ chấm điểm nếu đã chấm.
 * Hiện tên khái niệm mỗi khi hàng đợi chuyển sang khái niệm mới — một transcript có thể
 * trải nhiều khái niệm.
 */
export function TurnHistory({
  turns,
  currentTurnId,
  maxTurnsPerConcept,
  fallbackMode,
}: TurnHistoryProps) {
  // Lượt ĐỨNG SAU trong transcript chính là quyết định điều phối mà phần mềm đã ra (hỏi
  // tiếp khái niệm này hay sang khái niệm khác). Nó có thể là câu hỏi đang chờ — thứ bị lọc
  // khỏi danh sách hiển thị — nên phải tra bảng "lượt kế" TRƯỚC khi lọc.
  const nextTurnById = new Map<string, InterviewTurnResponse | null>(
    turns.map((turn, index) => [turn.id, turns[index + 1] ?? null])
  );
  const visibleTurns = turns.filter((turn) => turn.id !== currentTurnId);

  if (visibleTurns.length === 0) return null;

  // Chỉ lượt vừa chấm gần nhất mới còn "mới" theo nghĩa live-region — các lượt cũ hơn là
  // nội dung tĩnh, không nên được trình đọc màn hình đọc lại như thể vừa xảy ra.
  const latestGradedId = [...visibleTurns].reverse().find((t) => t.verdict !== null)?.id;

  return (
    <div className="flex flex-col gap-5">
      {visibleTurns.map((turn, index) => {
        const isNewConcept = index === 0 || visibleTurns[index - 1].conceptId !== turn.conceptId;
        return (
          <Fragment key={turn.id}>
            {isNewConcept && (
              <Heading as="h3" size="card" className="text-foreground">
                {turn.conceptName}
              </Heading>
            )}
            <section className="flex flex-col gap-3" aria-label={`Lượt ${turn.turnIndex}`}>
              <div className="border-border text-muted-foreground flex items-baseline justify-between border-b pb-1.5 text-xs font-medium">
                <span>Lượt {turn.turnIndex}</span>
              </div>

              <ChatBubble role="ai" className="max-w-full">
                <p className="whitespace-pre-line text-sm leading-[1.62]">{turn.questionText}</p>
                <SourceCitation citation={turn.sourceCitation} />
              </ChatBubble>

              {turn.answerText && (
                // Mockup `.chat-bubble-user { max-width: 82% }` — component dùng chung mặc
                // định 68% (cho các nơi khác), override riêng ở đây cho đúng màn interview.
                // `whitespace-pre-line`: giữ nguyên xuống dòng/gạch đầu dòng sinh viên tự gõ —
                // mặc định `<p>` gộp hết newline thành khoảng trắng, dính liền cả đoạn.
                <ChatBubble role="user" className="max-w-[82%]">
                  <p className="whitespace-pre-line text-sm leading-[1.62]">{turn.answerText}</p>
                </ChatBubble>
              )}

              {turn.verdict && (
                <>
                  <GradeCard
                    verdict={turn.verdict}
                    score={turn.score}
                    feedback={turn.feedback}
                    turnIndex={turn.turnIndex}
                  />
                  <SystemNote
                    verdict={turn.verdict}
                    turnIndex={turn.turnIndex}
                    conceptId={turn.conceptId}
                    maxTurns={maxTurnsPerConcept}
                    nextTurn={nextTurnById.get(turn.id) ?? null}
                    fallbackMode={fallbackMode}
                    isLatest={turn.id === latestGradedId}
                  />
                </>
              )}
            </section>
          </Fragment>
        );
      })}
    </div>
  );
}

interface GradeCardProps {
  verdict: TurnVerdict;
  score: number | null;
  feedback: string | null;
  turnIndex: number;
}

/**
 * Thẻ chấm điểm — đầu ra `grade_answer` {score, feedback, verdict}. Viền trái tô theo
 * verdict (`.grade--*` trong mockup). `feedback` có thể là `null` với lượt tự chấm
 * flashcard (AE-05) — khi đó chỉ hiện verdict, không bịa nhận xét.
 */
function GradeCard({ verdict, score, feedback, turnIndex }: GradeCardProps) {
  const borderColor =
    verdict === 'deep'
      ? 'border-l-mastery-strong'
      : verdict === 'shallow'
        ? 'border-l-mastery-learning'
        : 'border-l-mastery-weak';

  return (
    <div
      className={cn('border-border bg-card rounded-md border border-l-2 px-4 py-3.5', borderColor)}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2.5">
        <VerdictBadge verdict={verdict} />
        {score !== null && <MetaMono className="text-[13px]">{score.toFixed(2)}</MetaMono>}
        <span className="text-muted-foreground ml-auto text-[11px]">Lượt {turnIndex}</span>
      </div>
      {feedback && (
        <p className="text-foreground whitespace-pre-line text-[13.5px] leading-[1.6]">
          {feedback}
        </p>
      )}
    </div>
  );
}

interface SystemNoteProps {
  verdict: TurnVerdict;
  turnIndex: number;
  conceptId: string;
  maxTurns: number;
  /** Lượt kế trong transcript; `null` khi phần mềm chưa ra bước tiếp theo. */
  nextTurn: InterviewTurnResponse | null;
  fallbackMode: boolean;
  isLatest: boolean;
}

/**
 * Dòng minh bạch điều phối (`.sys` trong mockup, ràng buộc C4 — quyết định điều phối là
 * logic tất định của phần mềm, không phải AI).
 *
 * Câu chữ chỉ được nói ĐÚNG những gì transcript đã chứng minh: lượt kế tiếp cùng khái niệm
 * nghĩa là phần mềm đã chọn hỏi thêm; lượt kế tiếp khác khái niệm nghĩa là khái niệm này đã
 * chốt điểm. Khi chưa có lượt kế thì chỉ xác nhận trung tính — KHÔNG đoán trước server sẽ
 * làm gì (đoán sai một lần là mất hết giá trị minh bạch của dòng này).
 *
 * Mệnh đề nhân quả "kết quả X và còn lượt →" CHỈ đúng ở chế độ AI, nơi `decideNextStep` thật
 * sự đọc verdict. Ở chế độ flashcard, lượt tự chấm vẫn mang verdict nhưng `resolveFallbackStep`
 * phát hết cache theo thứ tự bất kể verdict — nói "kết quả chưa đúng và còn lượt → hỏi tiếp" ở
 * đó vừa gán sai nguyên nhân, vừa dạy sai luật thật. Nên chế độ này chỉ thuật lại việc đã xảy ra.
 *
 * ⚠️ (#392, review 30/08) Câu "hỏi tiếp khái niệm này" ở nhánh AI dưới đây đúng nhưng KHÔNG
 * phân biệt được ba lý do khác nhau của việc hỏi tiếp — `deep`→đào sâu, `shallow`→hỏi thêm,
 * `wrong`→**thu hẹp chính câu vừa hỏi** (gợi ý, không phải câu mới). API hiện không trả `mode`
 * của lượt, nên client không có dữ liệu để nói khác đi. Cần PM/Quân quyết có cần tách câu này
 * theo verdict hay không trước khi coi đây là xong — chưa tự thêm phân nhánh ở đây.
 */
function SystemNote({
  verdict,
  turnIndex,
  conceptId,
  maxTurns,
  nextTurn,
  fallbackMode,
  isLatest,
}: SystemNoteProps) {
  const verdictLabel = VERDICT_LABEL[verdict].toLowerCase();
  const isSameConceptNext = nextTurn !== null && nextTurn.conceptId === conceptId;

  return (
    <SystemMessage isLive={isLatest}>
      {nextTurn === null ? (
        <>
          Đã ghi nhận kết quả lượt {turnIndex}/{maxTurns}.
        </>
      ) : !isSameConceptNext ? (
        <>Đã chốt điểm khái niệm này → chuyển sang khái niệm tiếp theo.</>
      ) : fallbackMode ? (
        <>
          Đã chấm lượt {turnIndex}/{maxTurns} → chuyển sang lượt {nextTurn.turnIndex}/{maxTurns}.
        </>
      ) : (
        <>
          Kết quả <strong className="font-medium">{verdictLabel}</strong> và còn lượt → hỏi tiếp
          khái niệm này. Chuyển sang lượt {nextTurn.turnIndex}/{maxTurns}.
        </>
      )}
    </SystemMessage>
  );
}
