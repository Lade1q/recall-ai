import { PandaSprite } from './PandaSprite';
import { useSceneTicker } from '../hooks/useSceneTicker';
import {
  CARRY_LABELS,
  CARRY_SLOTS,
  CHIP_H,
  CHIP_W,
  FROZEN_TICK,
  carryEdgeGeometry,
  carryFrame,
} from '../data/carry-sequence';
import { Heading } from '@/components/ui/heading';

/**
 * Nhịp kịch bản. Phải DÀI HƠN mọi transition bên dưới (`lp-carrier`: đi 1800ms,
 * trèo 1700ms) — nhịp ngắn hơn transition thì nhịp sau đã bắt đầu trong khi
 * nhịp trước còn đang chạy dở, và Gấu sẽ gắn mũi tên lúc còn lơ lửng.
 */
const TICK_MS = 2200;
/** Nhịp chân riêng, nhanh hơn nhịp kịch bản: một chuyến đi mà chỉ đổi chân
 *  một lần thì không thành bước. */
const STEP_MS = 460;

/** Chỗ đứng hai đầu lối đi. Kéo vào trong khỏi mép để không dính rìa trang. */
const DOC_SIDE = '48px';
const GRAPH_SIDE = 'calc(100% - 252px)';
/** Thang lệch trái Gấu một chút để nó đứng áp vào thang, không che mất. */
const LADDER_SIDE = 'calc(100% - 270px)';
const STAGE_W = 460;
const STAGE_H = 250;
const EDGES = carryEdgeGeometry();

/**
 * Thang: bậc, quãng trèo và chiều cao đều sinh từ CÙNG một con số.
 *
 * Bản trước đặt chiều cao thang (330) và quãng trèo (150) rời nhau, nên Gấu
 * dừng ở chưa tới nửa thang — nói gì bậc cao nhất. Ở đây quãng trèo LÀ bậc
 * trên cùng, và chiều cao thang chỉ là bậc trên cùng cộng thêm phần tay vịn
 * nhô lên (thang thật bao giờ cũng có phần rail cao hơn bậc cuối).
 */
const CLIMB_STEP = 30;
/** Muốn thang CAO hơn thì tăng số bậc, đừng nới rời chiều cao ra khỏi quãng
 *  trèo — làm thế là hai con số lại lệch nhau như bản trước. */
const RUNGS = 9;
const RUNG_H = 7;
/** Gấu dừng đúng ở bậc TRÊN CÙNG. */
const CLIMB_TO = CLIMB_STEP * RUNGS;
const RAIL_OVERHANG = 44;
const LADDER_H = CLIMB_TO + RAIL_OVERHANG;

/**
 * Cảnh 1 — Gấu Trúc đọc trang tài liệu, khiêng từng khái niệm sang đặt vào
 * đồ thị, rồi mới quăng các cạnh phụ thuộc.
 *
 * Chip và cạnh cùng đọc một mảng toạ độ trong `carry-sequence`, nên mũi tên
 * không thể lệch khỏi chip — bản dựng trước từng vẽ cạnh trong một viewBox bị
 * kéo giãn còn chip thì định vị bằng pixel CSS, và chúng không bao giờ khớp.
 */
export function ExtractScene() {
  const tick = useSceneTicker(TICK_MS, FROZEN_TICK);
  const legTick = useSceneTicker(STEP_MS, 0);
  const frame = carryFrame(tick);
  /*
   * Kịch bản chỉ nói "đang đi"; hai việc còn lại là của tầng này:
   *   · đang bê khái niệm hay tay không → chọn bộ khung tương ứng
   *   · nhịp chân → chọn khung nào trong hai khung của bộ đó
   */
  const alt = legTick % 2 === 1;
  const pose =
    frame.pose !== 'walk'
      ? frame.pose
      : frame.carrying !== null
        ? alt
          ? 'carry2'
          : 'carry'
        : alt
          ? 'walk2'
          : 'walk';

  return (
    <section className="px-5 py-16 sm:px-8 lg:px-14 lg:py-20">
      <div className="mx-auto max-w-[1160px]">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="text-remediate font-mono text-[11px] tracking-[0.1em]">CẢNH 1</span>
          <Heading as="h2" size="section" className="sm:text-[30px]">
            Từ tài liệu thành lộ trình học tập
          </Heading>
        </div>
        <p className="text-muted-foreground mt-3 max-w-[66ch] text-[14px] leading-[1.7]">
          Recall AI tách tài liệu thành từng khái niệm, rồi nối chúng lại theo mối quan hệ phụ
          thuộc, để bạn biết cần hiểu gì trước và học gì sau.
        </p>

        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_460px] lg:items-start lg:gap-14">
          <article className="border-border bg-card rounded-xl border p-6">
            <span className="text-muted-foreground font-mono text-[10.5px] tracking-[0.08em]">
              CHƯƠNG 4.PDF · TRANG 12
            </span>
            <p className="mt-3 text-[13.5px] leading-[2]">
              Một lược đồ đạt dạng chuẩn <Marked on={frame.placed > 0}>2NF</Marked> vẫn có thể dư
              thừa dữ liệu khi tồn tại <Marked on={frame.placed > 1}>phụ thuộc hàm</Marked> bắc cầu
              giữa các thuộc tính không khoá. Muốn loại bỏ, ta đưa lược đồ về{' '}
              <Marked on={frame.placed > 2}>chuẩn 3NF</Marked>, nơi mọi thuộc tính không khoá phụ
              thuộc trực tiếp vào <Marked on={frame.placed > 3}>khoá chính</Marked>.
            </p>
          </article>

          {/*
            Chip VẼ TRONG SVG chứ không phải thẻ HTML định vị chồng lên.
            Bản trước đặt chip bằng phần trăm của khung còn cạnh thì vẽ trong
            viewBox: hai hệ toạ độ đó chỉ trùng nhau khi khung đúng tỉ lệ
            460×250, mà `preserveAspectRatio` lại tự căn giữa SVG khi tỉ lệ
            lệch — thế là mũi tên trượt khỏi chip. Nằm chung một SVG thì không
            còn hai hệ để mà lệch, và chữ cũng co giãn theo đồ thị.
          */}
          <svg
            viewBox={`0 0 ${STAGE_W} ${STAGE_H}`}
            className="mx-auto block h-auto w-full max-w-[460px] lg:mx-0"
            role="img"
            aria-label="Đồ thị khái niệm đang được dựng dần"
          >
            {EDGES.map((e, i) => (
              <g key={`${e.x1}-${e.y1}`} opacity={frame.edges > i ? 1 : 0}>
                <line
                  x1={e.x1}
                  y1={e.y1}
                  x2={e.x2}
                  y2={e.y2}
                  stroke="var(--remediate)"
                  strokeWidth={2}
                  strokeLinecap="round"
                />
                <polygon points={e.arrow} fill="var(--remediate)" />
              </g>
            ))}

            {CARRY_LABELS.map((label, i) => (
              <g key={label} className="lp-chip" opacity={frame.placed > i ? 1 : 0}>
                <rect
                  x={CARRY_SLOTS[i].x}
                  y={CARRY_SLOTS[i].y}
                  width={CHIP_W}
                  height={CHIP_H}
                  rx={CHIP_H / 2}
                  fill="var(--remediate)"
                  fillOpacity={0.14}
                  stroke="var(--remediate)"
                  strokeOpacity={0.5}
                />
                <text
                  x={CARRY_SLOTS[i].x + CHIP_W / 2}
                  y={CARRY_SLOTS[i].y + CHIP_H / 2}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={13}
                  fill="var(--foreground)"
                >
                  {label}
                </text>
              </g>
            ))}
          </svg>
        </div>

        {/* Đường Gấu đi giữa trang tài liệu và đồ thị. Ẩn ở màn hẹp: hai khối
            xếp chồng nên "đi qua đi lại" không còn nghĩa gì. */}
        <div className="relative mt-2 hidden h-[210px] lg:block">
          {/* Thang chỉ dựng lên ở hồi nối cạnh — nối xong thì cất đi. */}
          <div
            className="lp-ladder absolute bottom-0"
            style={{ left: LADDER_SIDE, opacity: frame.ladderUp ? 1 : 0 }}
          >
            <Ladder />
          </div>

          {/*
            Gấu leo lên: đổi cả `left` lẫn `bottom`, và cả hai đều có transition
            nên người xem THẤY nó trèo lên từng nấc chứ không phải bỗng dưng
            đứng sẵn trên cao.
          */}
          <div
            className="lp-carrier absolute"
            style={{
              left: frame.side === 'graph' ? GRAPH_SIDE : DOC_SIDE,
              bottom: frame.onLadder ? CLIMB_TO : 0,
            }}
          >
            {frame.carrying !== null && (
              <span className="border-remediate/60 bg-remediate/20 absolute -top-9 left-1/2 flex h-8 -translate-x-1/2 items-center whitespace-nowrap rounded-full border px-3 text-[12.5px]">
                {CARRY_LABELS[frame.carrying]}
              </span>
            )}
            <PandaSprite pose={pose} size={116} shadow={!frame.onLadder} />
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * Thang cho Gấu trèo lên gắn mũi tên.
 *
 * Vẽ theo cùng lưới ô vuông với linh vật (thanh dày 7px, khớp cỡ ô của sprite
 * 116px) và bật `crispEdges`, để nó là đồ vật CÙNG THẾ GIỚI pixel với con
 * gấu chứ không phải một hình vector lạc vào.
 */
function Ladder() {
  /* Bậc thứ i nằm cách ĐÁY thang đúng i·CLIMB_STEP — cùng đơn vị với quãng
     trèo, nên mỗi nhịp Gấu lên trọn một bậc và bậc cuối cùng chính là chỗ nó
     dừng lại. Đổi sang toạ độ SVG (tính từ đỉnh) ở ngay đây. */
  const rungs = Array.from({ length: RUNGS }, (_, i) => LADDER_H - (i + 1) * CLIMB_STEP - RUNG_H);
  return (
    <svg
      width={56}
      height={LADDER_H}
      viewBox={`0 0 56 ${LADDER_H}`}
      style={{ shapeRendering: 'crispEdges', display: 'block' }}
      aria-hidden="true"
      focusable="false"
    >
      <rect x={0} y={0} width={7} height={LADDER_H} fill="var(--mastery-untested)" />
      <rect x={49} y={0} width={7} height={LADDER_H} fill="var(--mastery-untested)" />
      {rungs.map((y) => (
        <rect key={y} x={7} y={y} width={42} height={RUNG_H} fill="var(--mastery-untested)" />
      ))}
    </svg>
  );
}

/** Từ khoá trên trang: gạch chân bật lên khi Gấu đã nhặt nó đi. */
function Marked({ on, children }: { on: boolean; children: React.ReactNode }) {
  return (
    <span className="relative whitespace-nowrap">
      {children}
      <span
        className="bg-remediate duration-(--duration-normal) ease-(--ease-standard) absolute inset-x-0 -bottom-0.5 block h-0.5 origin-left transition-transform"
        style={{ transform: `scaleX(${on ? 1 : 0})` }}
      />
    </span>
  );
}
