import { PandaSprite } from './PandaSprite';
import { useSceneTicker } from '../hooks/useSceneTicker';

/** Bốn nhịp: chấm · chấm · khựng lại · nhún vai. */
const TICK_MS = 1700;
const CYCLE = 4;

/**
 * Cảnh 3 — bất biến `null ≠ 0.0`, dựng thành một khoảnh khắc thay vì một đoạn
 * văn: thanh điểm chạy lên rồi KHỰNG lại, nhãn lật thành "chưa đủ để kết luận",
 * và Gấu Trúc nhún vai.
 *
 * Cả ba thứ đọc chung một nhịp nên không bao giờ lệch pha nhau.
 */
export function VerdictScene() {
  const tick = useSceneTicker(TICK_MS, CYCLE - 1);
  const phase = tick % CYCLE;
  const stalled = phase >= 2;

  return (
    <section className="px-5 py-16 sm:px-8 lg:px-14 lg:py-20">
      <div className="mx-auto max-w-[1160px]">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="text-remediate font-mono text-[11px] tracking-[0.1em]">CẢNH 3</span>
          <h2 className="font-heading text-[22px] sm:text-[27px]">
            Trả lời dở dang không đồng nghĩa bạn sai.
          </h2>
        </div>

        <div className="mt-8 grid items-center gap-8 lg:grid-cols-[auto_minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-10">
          <div className="relative mx-auto lg:mx-0">
            {stalled && (
              <span className="text-remediate absolute -top-2 right-0 font-mono text-[26px] leading-none">
                ?
              </span>
            )}
            <PandaSprite
              pose={stalled ? 'shrug' : 'sit'}
              size={132}
              blinking={phase === 1}
              shadow
            />
          </div>

          <p className="text-muted-foreground text-[15px] leading-[1.8]">
            Có thể bạn đang suy nghĩ, trả lời chưa hết, hoặc đơn giản là cần thêm một chút thời
            gian. Hầu hết các hệ thống ghi nhận đó là điểm thấp. Recall AI không vội đánh dấu sai,
            chỉ ghi nhận rằng mình{' '}
            <strong className="text-foreground">chưa đủ căn cứ để kết luận</strong> bạn đã hiểu hay
            chưa. Điểm cũ của khái niệm được giữ nguyên, và nó được xếp lại vào lịch ôn để bạn thử
            lại sau.
          </p>

          <div className="border-border bg-card flex flex-col gap-4 rounded-xl border p-6">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[15px] font-medium">Chuẩn hoá 3NF</span>
              <span
                className={`font-mono text-[13px] ${stalled ? 'text-mastery-untested-fg' : 'text-muted-foreground'}`}
              >
                {stalled ? 'chưa đủ để kết luận' : 'đang chấm…'}
              </span>
            </div>
            <div className="bg-muted h-[7px] overflow-hidden rounded-full">
              <div
                className="bg-mastery-untested duration-(--duration-slow) ease-(--ease-standard) h-full rounded-full transition-[width]"
                style={{ width: phase === 0 ? '0%' : '47%' }}
              />
            </div>
            {/*
              Chỉ còn ĐÚNG bất biến, không còn con số nào.

              Chỗ này từng in "2/5 checkpoint có bằng chứng" — đó là từ vựng của
              cơ chế chấm theo coverage (`MIN_COVERAGE = 0.7`), và 2/5 = 0,4 <
              0,7 chính là công thức cho ra `null`. Nghe rất thuyết phục, chỉ có
              điều `finalizeConceptCoverage` KHÔNG ĐƯỢC AI GỌI trong sản phẩm:
              nó chỉ xuất hiện trong test của chính nó, và
              `interview-evidence.service.ts:19` tự ghi "still has no caller".
              Đường sống thật là trung bình có trọng số của các lượt trả lời.

              Trang này tồn tại để KHÔNG hứa thứ chưa có, nên nó không được đi
              khoe một cơ chế đang ngủ — dù cơ chế đó có thật trong repo.
            */}
            <div className="font-mono text-[11px]">
              <span className="text-mastery-untested-fg">null ≠ 0.0</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
