import { useCallback, useEffect, useRef, useState } from 'react';
import { PandaSprite } from './PandaSprite';
import { usePrefersReducedMotion } from '../hooks/useSceneTicker';
import {
  DEMO_CONCEPT_IDS,
  DEMO_GRAPH,
  MASTERY_THRESHOLD,
  masteryBand,
  traceback,
  tracebackVerdict,
  type MasteryBand,
} from '../data/concept-graph';

/** Mỗi chặng của đường truy ngược. Khớp với `.lp-walker` trong global.css. */
const STEP_MS = 560;
const SURPRISE_MS = 800;

/** Màu ĐỔ NỀN: chấm chú giải, vòng tròn node. */
const BAND_COLOR: Record<MasteryBand, string> = {
  strong: 'var(--mastery-strong)',
  learning: 'var(--mastery-learning)',
  weak: 'var(--mastery-weak)',
  untested: 'var(--mastery-untested)',
};

/**
 * Màu dùng cho CHỮ. Chỉ `untested` lệch khỏi `BAND_COLOR`.
 *
 * `--mastery-untested` là màu để TÔ, không phải để viết: đo trên nền thẻ nó ra
 * 2,19:1 ở theme sáng và 1,93:1 ở theme tối, trong khi AA đòi 4,5 — mà nó lại
 * đang gánh chữ cỡ 10,5px. Hệ thống đã có sẵn `--mastery-untested-fg` đúng cho
 * vai này (9,04 và 6,13). Ba band còn lại dùng làm chữ vẫn qua AA thoải mái
 * (5,66–7,95) nên giữ nguyên, không đổi cho đều.
 */
const BAND_TEXT: Record<MasteryBand, string> = {
  ...BAND_COLOR,
  untested: 'var(--mastery-untested-fg)',
};

type WalkState = 'walking' | 'arrived' | 'digging';

/**
 * Cảnh 2 — đồ thị bấm được. Chọn khái niệm nào thì thuật toán truy ngược chạy
 * thật trên khái niệm đó, và Gấu Trúc ĐI TỪNG CHẶNG dọc chuỗi kết quả thay vì
 * nhảy thẳng tới đích: nó dừng ở mỗi khái niệm trung gian đúng như thuật toán
 * lần qua chúng, rồi ngạc nhiên khi tới nền, rồi mới đào.
 */
export function TracebackScene() {
  const reduced = usePrefersReducedMotion();
  const [probed, setProbed] = useState('nf3');
  const [step, setStep] = useState<number | null>(null);
  const [walk, setWalk] = useState<WalkState>('digging');
  const timers = useRef<number[]>([]);

  const clearTimers = useCallback(() => {
    timers.current.forEach(window.clearTimeout);
    timers.current = [];
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  const goTo = useCallback(
    (id: string) => {
      clearTimers();
      setProbed(id);

      /*
       * Giảm chuyển động: nhảy THẲNG tới kết quả, không dựng chuỗi hẹn giờ.
       *
       * Bản trước chỉ tắt transition bằng CSS, còn `setTimeout` vẫn đẩy Gấu
       * qua từng node suốt ~2s — nên với người bật cài đặt này con vật vẫn
       * nhảy chỗ, chỉ là giật cục thay vì trượt. Tắt hoạt ảnh nghĩa là bỏ cả
       * quãng thời gian, không phải bỏ mỗi phần nội suy.
       */
      if (reduced) {
        setStep(null);
        setWalk('digging');
        return;
      }

      const { chain } = traceback(id);
      setStep(0);
      setWalk('walking');

      let at = 0;
      for (let i = 1; i < chain.length; i += 1) {
        at += STEP_MS;
        const index = i;
        timers.current.push(window.setTimeout(() => setStep(index), at));
      }
      timers.current.push(window.setTimeout(() => setWalk('arrived'), at + STEP_MS));
      timers.current.push(window.setTimeout(() => setWalk('digging'), at + STEP_MS + SURPRISE_MS));
    },
    [clearTimers, reduced]
  );

  const result = traceback(probed);
  const { chain } = result;
  const index = step === null ? chain.length - 1 : Math.min(step, chain.length - 1);
  const anchor = DEMO_GRAPH[chain[index]];
  const previous = DEMO_GRAPH[chain[index > 0 ? index - 1 : index]];
  /*
   * Đứng yên thì quay MẶT VÀO node.
   *
   * Chỗ đậu luôn nằm bên trái node (xem `walker` trong concept-graph), nên khi
   * đã tới nơi mà vẫn quay theo hướng vừa đi thì có lúc Gấu soi khái niệm bằng
   * gáy. Lúc đang đi thì vẫn quay theo hướng di chuyển.
   */
  const facing = walk === 'walking' ? (anchor.x < previous.x ? -1 : 1) : 1;
  const pose = walk === 'walking' ? 'walk' : walk === 'arrived' ? 'surprise' : 'dig';

  return (
    <section className="px-5 py-16 sm:px-8 lg:px-14 lg:py-20">
      <div className="mx-auto max-w-[1160px]">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="text-remediate font-mono text-[11px] tracking-[0.1em]">CẢNH 2</span>
          <h2 className="font-heading text-[22px] sm:text-[27px]">
            Chọn một khái niệm, tìm xem mình đang vướng ở đâu.
          </h2>
        </div>
        <p className="text-muted-foreground mt-3 max-w-[64ch] text-[14px] leading-[1.7]">
          Với bất kỳ khái niệm nào, Recall AI đều lần ngược qua từng mối liên hệ để tìm ra kiến thức
          nền có thể đang là nút thắt.
        </p>

        <div className="mt-8 grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:items-stretch">
          <div className="border-border bg-card rounded-xl border p-5">
            <div className="text-muted-foreground flex items-center justify-between font-mono text-[11px]">
              <span>CSDL — Chương 4.pdf</span>
              <span>7 khái niệm · 7 quan hệ</span>
            </div>

            <svg viewBox="0 0 640 400" className="mt-2 block h-auto w-full">
              <defs>
                <marker
                  id="lp-arrow-quiet"
                  viewBox="0 0 10 10"
                  refX="10"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--mastery-untested)" />
                </marker>
                <marker
                  id="lp-arrow-trace"
                  viewBox="0 0 10 10"
                  refX="10"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--remediate)" />
                </marker>
              </defs>

              {DEMO_CONCEPT_IDS.flatMap((id) =>
                DEMO_GRAPH[id].prereqs.map((from) => {
                  const a = DEMO_GRAPH[from];
                  const b = DEMO_GRAPH[id];
                  const ai = chain.indexOf(from);
                  const bi = chain.indexOf(id);
                  const lit = ai > -1 && bi > -1 && ai === bi + 1;
                  const dx = b.x - a.x;
                  const dy = b.y - a.y;
                  const len = Math.hypot(dx, dy) || 1;
                  const pad = 19;
                  return (
                    <line
                      key={`${from}-${id}`}
                      x1={a.x + (dx / len) * pad}
                      y1={a.y + (dy / len) * pad}
                      x2={b.x - (dx / len) * pad}
                      y2={b.y - (dy / len) * pad}
                      stroke={lit ? 'var(--remediate)' : 'var(--mastery-untested)'}
                      strokeWidth={lit ? 2.6 : 1.4}
                      markerEnd={`url(#${lit ? 'lp-arrow-trace' : 'lp-arrow-quiet'})`}
                      className={lit ? 'lp-edge-live' : undefined}
                      opacity={lit ? 1 : 0.75}
                    />
                  );
                })
              )}

              {/*
                Gấu vẽ TRƯỚC các node, và đậu ở chỗ do từng node tự khai.

                Hai thứ này chữa hai bệnh khác nhau, đừng bỏ bớt cái nào:

                · Chỗ đậu (`walker` trong concept-graph) là thuốc chính — nó
                  khiến Gấu KHÔNG còn nằm chồng lên nhãn nữa. Bản trước đậu ở
                  `(±26, -34)`, và đo ra thì nó đè nhãn của CẢ BẢY node.
                · Thứ tự vẽ là lưới an toàn. Nếu sau này ai dời node hay đặt
                  nhãn dài hơn mà quên đo lại chỗ đậu, chữ vẫn nổi lên trên con
                  vật — xấu, nhưng còn đọc được. Che mất tên khái niệm mà thuật
                  toán vừa tìm ra thì cảnh này mất luôn thứ nó định nói.
              */}
              <g
                className="lp-walker"
                style={{
                  transform: `translate(${anchor.x + anchor.walker.dx}px, ${anchor.y + anchor.walker.dy}px) scaleX(${facing})`,
                }}
              >
                {walk === 'arrived' && (
                  <>
                    <rect x={-3} y={-54} width={6} height={15} fill="var(--remediate)" />
                    <rect x={-3} y={-35} width={6} height={6} fill="var(--remediate)" />
                  </>
                )}
                <foreignObject x={-32} y={-32} width={64} height={70}>
                  <PandaSprite pose={pose} size={64} shadow />
                </foreignObject>
              </g>

              {DEMO_CONCEPT_IDS.map((id) => {
                const c = DEMO_GRAPH[id];
                const isProbed = id === probed;
                const isRoot = id === result.rootId;
                const band = masteryBand(c.score);
                const color = isProbed
                  ? BAND_COLOR.weak
                  : isRoot
                    ? 'var(--remediate)'
                    : BAND_COLOR[band];
                const mauChu = isProbed
                  ? BAND_TEXT.weak
                  : isRoot
                    ? 'var(--remediate)'
                    : BAND_TEXT[band];
                return (
                  <g
                    key={id}
                    className="lp-node"
                    role="button"
                    tabIndex={0}
                    aria-label={`Truy ngược từ ${c.label}`}
                    onClick={() => goTo(id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        goTo(id);
                      }
                    }}
                  >
                    <circle
                      cx={c.x}
                      cy={c.y}
                      r={isProbed ? 16 : isRoot ? 15 : 11}
                      fill={color}
                      fillOpacity={0.2}
                      stroke={color}
                      strokeWidth={isProbed || isRoot ? 2.5 : 1.6}
                    />
                    <text
                      x={c.x}
                      y={c.y - (isProbed ? 26 : 21)}
                      textAnchor="middle"
                      fill="var(--foreground)"
                      fontSize={isProbed ? 14 : 12.5}
                      fontWeight={isProbed || isRoot ? 600 : 400}
                    >
                      {c.label}
                    </text>
                    <text
                      x={c.x}
                      y={c.y + (isProbed ? 33 : 29)}
                      textAnchor="middle"
                      fill={mauChu}
                      fontSize={10.5}
                      fontFamily="var(--font-mono)"
                    >
                      {c.score === null ? 'chưa kiểm' : c.score.toFixed(2)}
                    </text>
                  </g>
                );
              })}
            </svg>

            <div className="border-border text-muted-foreground mt-2 flex flex-wrap gap-4 border-t pt-3 text-[11.5px]">
              <Legend color={BAND_COLOR.strong}>Vững</Legend>
              <Legend color={BAND_COLOR.learning}>Đang học</Legend>
              <Legend color={BAND_COLOR.weak}>Còn yếu</Legend>
              <Legend color={BAND_COLOR.untested}>Chưa kiểm</Legend>
            </div>
          </div>

          <aside className="border-border bg-card flex flex-col gap-4 rounded-xl border p-6">
            <div className="text-muted-foreground flex items-center justify-between font-mono text-[10.5px] uppercase tracking-[0.11em]">
              <span>Kết quả truy ngược</span>
              <span>
                {result.depth === null ? 'không có nền yếu' : `dừng ở tầng ${result.depth}/2`}
              </span>
            </div>
            <div>
              <div className="text-muted-foreground font-mono text-[11px]">BẠN SAI Ở</div>
              <div className="font-heading mt-1 text-[22px]">{DEMO_GRAPH[probed].label}</div>
            </div>

            <div className="bg-border h-px" />

            <ol className="flex flex-col gap-2.5">
              {chain.map((id, i) => {
                const c = DEMO_GRAPH[id];
                const isLast = i === chain.length - 1 && result.rootId !== null;
                return (
                  <li key={id} className="flex items-center gap-2.5">
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{
                        background:
                          i === 0
                            ? BAND_COLOR.weak
                            : isLast
                              ? 'var(--remediate)'
                              : BAND_COLOR[masteryBand(c.score)],
                      }}
                    />
                    <span
                      className={`text-[13.5px] ${isLast ? 'text-remediate font-semibold' : ''}`}
                    >
                      {c.label}
                    </span>
                    <span className="text-muted-foreground ml-auto font-mono text-[11px]">
                      {c.score === null ? 'chưa kiểm' : c.score.toFixed(2)}
                    </span>
                  </li>
                );
              })}
            </ol>

            <p
              className={`rounded-r-lg border-l-2 py-3.5 pl-4 pr-4 text-[13.5px] leading-[1.6] ${
                result.rootId === null
                  ? 'border-mastery-strong bg-mastery-strong/8'
                  : 'border-remediate bg-remediate/8'
              }`}
            >
              {tracebackVerdict(probed, result)}
            </p>

            <div className="border-border text-muted-foreground mt-auto border-t pt-3.5">
              <div className="font-mono text-[10.5px]">
                BFS · max_depth 2 · ngưỡng {MASTERY_THRESHOLD.toFixed(2)} · tất định
              </div>
              <p className="mt-1.5 text-[12.5px] leading-[1.55]">
                Không mô hình ngôn ngữ nào tham gia bước này.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}

function Legend({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="size-2 rounded-full" style={{ background: color }} />
      {children}
    </span>
  );
}
