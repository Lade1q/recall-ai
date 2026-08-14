import type { QuestionType } from '../types/interview.types';

/**
 * Nhãn tiếng Việt cho loại câu hỏi (`QuestionType` phía server). Cùng lý do tách file với
 * `VERDICT_LABEL`: nhãn xuất hiện ở nhiều họ thành phần khác nhau (dòng tiêu đề mỗi lượt trong
 * bảng điểm, và các chỗ đọc lại transcript) — cùng một loại thì phải gọi cùng một tên.
 *
 * Chữ lấy đúng theo mockup `screen-interview.html` (`.qa__who`): "nhắc lại · vận dụng · tại sao".
 */
export const QUESTION_TYPE_LABEL: Record<QuestionType, string> = {
  recall: 'nhắc lại',
  application: 'vận dụng',
  why: 'tại sao',
};
