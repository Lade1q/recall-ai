/* eslint-disable react-refresh/only-export-components */
import { cn } from '@/lib/utils';

/**
 * Mục "Concept Graph Nodes" trong claude-design/components.html: "Flat, viền
 * 1px, nền tint 10% — không còn nền tô đậm như v2".
 *
 * Năm dải tương ứng năm lớp `.concept-node--*` đã có sẵn trong global.css
 * (định nghĩa màu/viền/animation ở đó — component này chỉ quyết định lớp nào
 * áp dụng và nhãn tiếng Việt đi kèm, để không có màn hình nào tự nghĩ ra một
 * nhãn khác cho cùng một trạng thái).
 */
export type MasteryBand = 'strong' | 'learning' | 'weak' | 'untested' | 'remediating';

const BAND_CLASS: Record<MasteryBand, string> = {
  strong: 'concept-node--strong',
  learning: 'concept-node--learning',
  weak: 'concept-node--weak',
  untested: 'concept-node--untested',
  remediating: 'concept-node--remediating',
};

const BAND_LABEL: Record<MasteryBand, string> = {
  strong: 'Vững',
  learning: 'Đang học',
  weak: 'Yếu',
  untested: 'Chưa kiểm tra',
  remediating: 'Cần ôn lại',
};

/**
 * `mastery_score` -> dải hiển thị, dùng chung ngưỡng 0.8 / 0.6 mà
 * `ConceptGraph.tsx` từng tự tính. `null` (chưa qua interview) luôn là
 * "untested" — không có ngưỡng số nào áp cho nó.
 *
 * Không tự suy ra "remediating": đó là một trạng thái quy trình (đang được hệ
 * thống chèn lại vào lịch ôn), không phải hàm của điểm số — nơi gọi phải tự
 * truyền `band="remediating"` khi biết concept đang ở trạng thái đó.
 */
export function masteryBand(score: number | null): Exclude<MasteryBand, 'remediating'> {
  if (score === null) return 'untested';
  if (score >= 0.8) return 'strong';
  if (score >= 0.6) return 'learning';
  return 'weak';
}

export function masteryLabel(band: MasteryBand): string {
  return BAND_LABEL[band];
}

function ConceptNode({
  className,
  band,
  children,
  ...props
}: React.ComponentProps<'div'> & { band: MasteryBand }) {
  return (
    <div
      data-slot="concept-node"
      data-band={band}
      className={cn('concept-node', BAND_CLASS[band], className)}
      {...props}
    >
      {children}
    </div>
  );
}

export { ConceptNode };
