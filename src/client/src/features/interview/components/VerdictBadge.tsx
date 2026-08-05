import { Check, Minus, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
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
const VERDICT_MAP: Record<
  TurnVerdict,
  { tone: 'strong' | 'learning' | 'weak'; label: string; Icon: typeof Check }
> = {
  deep: { tone: 'strong', label: 'Hiểu sâu', Icon: Check },
  shallow: { tone: 'learning', label: 'Còn nông', Icon: Minus },
  wrong: { tone: 'weak', label: 'Chưa đúng', Icon: X },
};

export function VerdictBadge({ verdict }: VerdictBadgeProps) {
  const { tone, label, Icon } = VERDICT_MAP[verdict];
  return (
    <Badge tone={tone}>
      <Icon />
      {label}
    </Badge>
  );
}
