import { ChatBubble } from '@/components/ui/chat-bubble';
import { Badge } from '@/components/ui/badge';
import { SourceCitation } from './SourceCitation';
import type { InterviewQuestionResponse, QuestionType } from '../types/interview.types';

interface QuestionCardProps {
  question: InterviewQuestionResponse;
}

/** Nhãn tiếng Việt cho loại câu hỏi — hiển thị dạng badge tone AI, ẩn khi server trả `null`. */
const QUESTION_TYPE_LABEL: Record<QuestionType, string> = {
  recall: 'Ghi nhớ',
  application: 'Vận dụng',
  why: 'Vì sao',
};

/**
 * Câu hỏi đang chờ trả lời (AE-02 bước 3). Là nội dung chính của màn hình nên bong bóng
 * AI chiếm trọn chiều rộng cột thay vì bó 68% như một tin nhắn chat thường.
 */
export function QuestionCard({ question }: QuestionCardProps) {
  return (
    <ChatBubble role="ai" className="max-w-full">
      {question.questionType && (
        <Badge tone="ai" className="mb-2">
          {QUESTION_TYPE_LABEL[question.questionType]}
        </Badge>
      )}
      <p className="text-sm leading-[1.62]">{question.questionText}</p>
      <SourceCitation citation={question.sourceCitation} />
    </ChatBubble>
  );
}
