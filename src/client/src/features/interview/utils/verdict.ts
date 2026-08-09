import type { TurnVerdict } from '../types/interview.types';

/**
 * Nhãn tiếng Việt cho kết luận AI chấm một lượt. Ở file riêng vì hai chỗ dùng nó khác họ
 * nhau: badge (`VerdictBadge`) và câu văn trong ghi chú điều phối (`TurnHistory`) — cùng
 * một kết quả thì phải gọi cùng một tên ở cả hai nơi.
 */
export const VERDICT_LABEL: Record<TurnVerdict, string> = {
  deep: 'Hiểu sâu',
  shallow: 'Còn nông',
  wrong: 'Chưa đúng',
};
