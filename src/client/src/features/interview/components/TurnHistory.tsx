import { Fragment } from 'react';
import { ChatBubble } from '@/components/ui/chat-bubble';
import { MetaMono } from '@/components/ui/kbd';
import { VerdictBadge } from './VerdictBadge';
import { SourceCitation } from './SourceCitation';
import type { InterviewTurnResponse } from '../types/interview.types';

interface TurnHistoryProps {
  turns: InterviewTurnResponse[];
}

/**
 * Hội thoại các lượt đã diễn ra, cũ nhất trước (AE-02). Mỗi lượt gồm: câu hỏi (bong bóng
 * AI), câu trả lời của sinh viên (bong bóng trung tính), rồi thẻ chấm điểm nếu đã chấm.
 * Hiện tên khái niệm mỗi khi hàng đợi chuyển sang khái niệm mới — một transcript có thể
 * trải nhiều khái niệm.
 */
export function TurnHistory({ turns }: TurnHistoryProps) {
  if (turns.length === 0) return null;

  return (
    <div className="flex flex-col gap-5">
      {turns.map((turn, index) => {
        const isNewConcept = index === 0 || turns[index - 1].conceptId !== turn.conceptId;
        return (
          <Fragment key={turn.id}>
            {isNewConcept && (
              <h3 className="font-heading text-foreground text-lg tracking-[-0.01em]">
                {turn.conceptName}
              </h3>
            )}
            <section className="flex flex-col gap-3" aria-label={`Lượt ${turn.turnIndex}`}>
              <div className="border-border text-muted-foreground flex items-baseline justify-between border-b pb-1.5 text-xs font-medium">
                <span>Lượt {turn.turnIndex}</span>
              </div>

              <ChatBubble role="ai" className="max-w-full">
                <p className="text-sm leading-[1.62]">{turn.questionText}</p>
                <SourceCitation citation={turn.sourceCitation} />
              </ChatBubble>

              {turn.answerText && (
                <ChatBubble role="user">
                  <p className="text-sm leading-[1.62]">{turn.answerText}</p>
                </ChatBubble>
              )}

              {turn.verdict && (
                <GradeCard
                  verdict={turn.verdict}
                  score={turn.score}
                  feedback={turn.feedback}
                  turnIndex={turn.turnIndex}
                />
              )}
            </section>
          </Fragment>
        );
      })}
    </div>
  );
}

interface GradeCardProps {
  verdict: NonNullable<InterviewTurnResponse['verdict']>;
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
      className={`border-border bg-card rounded-md border border-l-2 px-4 py-3.5 ${borderColor}`}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2.5">
        <VerdictBadge verdict={verdict} />
        {score !== null && <MetaMono className="text-[13px]">{score.toFixed(2)}</MetaMono>}
        <span className="text-muted-foreground ml-auto text-[11px]">Lượt {turnIndex}</span>
      </div>
      {feedback && <p className="text-foreground text-[13.5px] leading-[1.6]">{feedback}</p>}
    </div>
  );
}
