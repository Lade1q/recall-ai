import {
  spriteRects,
  blinkRects,
  SHADOW_FILL,
  SPRITE_GRID,
  type PandaPose,
} from '../data/panda-sprites';

const CELL = 10;
const SIDE = SPRITE_GRID * CELL;

interface PandaSpriteProps {
  pose: PandaPose;
  /** Bề rộng hiển thị (px). Cao bằng rộng vì lưới vuông. */
  size: number;
  /** Vẽ thêm khung mắt nhắm chồng lên để làm hiệu ứng chớp. */
  blinking?: boolean;
  /** Bóng đổ dưới chân. Tắt khi nhân vật không đứng trên mặt đất. */
  shadow?: boolean;
  className?: string;
}

/**
 * Vẽ một tư thế của Gấu Trúc.
 *
 * `shape-rendering: crispEdges` là bắt buộc: không có nó trình duyệt sẽ khử
 * răng cưa mép từng ô và cả con vật mờ đi ở cỡ nhỏ — đúng thứ pixel art
 * sinh ra để tránh.
 */
export function PandaSprite({
  pose,
  size,
  blinking = false,
  shadow = false,
  className,
}: PandaSpriteProps) {
  const rects = spriteRects(pose, CELL);

  return (
    <svg
      viewBox={`0 0 ${SIDE} ${SIDE + 14}`}
      width={size}
      height={size * ((SIDE + 14) / SIDE)}
      className={className}
      style={{ shapeRendering: 'crispEdges', display: 'block' }}
      aria-hidden="true"
      focusable="false"
    >
      {shadow && (
        <rect
          x={CELL * 2}
          y={SIDE + 4}
          width={SIDE - CELL * 4}
          height={5}
          fill={SHADOW_FILL}
          opacity={0.3}
        />
      )}
      {rects.map((r) => (
        <rect key={`${r.x}-${r.y}`} x={r.x} y={r.y} width={r.w} height={r.h} fill={r.fill} />
      ))}
      {blinking &&
        blinkRects(CELL).map((r) => (
          <rect key={`b-${r.x}`} x={r.x} y={r.y} width={r.w} height={r.h} fill={r.fill} />
        ))}
    </svg>
  );
}
