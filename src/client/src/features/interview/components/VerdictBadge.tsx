import { Check, Minus, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { VERDICT_LABEL } from '../utils/verdict';
import type { TurnVerdict } from '../types/interview.types';

interface VerdictBadgeProps {
  verdict: TurnVerdict;
}

/**
 * Nhãn kết luận AI chấm cho một lượt. Màu bám đúng ba tone mastery của Design System
 * (§C6: màu không bao giờ là tín hiệu duy nhất nên mỗi badge kèm chữ + icon):
 *   deep    → mastery-strong (xanh)  — "Hiểu sâu"
 *   shallow → mastery-learning (hổ phách) — "Còn nông"
 *   wrong   → mastery-weak (đỏ)     — "Chưa đúng"
 */
const VERDICT_STYLE: Record<
  TurnVerdict,
  { tone: 'strong' | 'learning' | 'weak'; Icon: typeof Check }
> = {
  deep: { tone: 'strong', Icon: Check },
  shallow: { tone: 'learning', Icon: Minus },
  wrong: { tone: 'weak', Icon: X },
};

export function VerdictBadge({ verdict }: VerdictBadgeProps) {
  const { tone, Icon } = VERDICT_STYLE[verdict];
  return (
    <Badge tone={tone}>
      <Icon />
      {VERDICT_LABEL[verdict]}
    </Badge>
  );
}
