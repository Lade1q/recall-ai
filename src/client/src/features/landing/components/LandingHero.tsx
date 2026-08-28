import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { PandaSprite } from './PandaSprite';
import { usePrefersReducedMotion, useSceneTicker } from '../hooks/useSceneTicker';

/** Nhịp bước: đổi khung chân. Cũng là nhịp để chớp mắt thưa hơn. */
const STEP_MS = 400;
/**
 * Cỡ Gấu trên đường chạy.
 *
 * Đi xuống CSS thành biến thay vì chép tay sang `global.css`: quãng chạy phải
 * trừ đúng bề rộng con vật thì nó mới dừng sát mép phải mà không lố. Hai con
 * số ở hai tệp thì sớm muộn cũng lệch.
 */
const RUNNER_SIZE = 150;

/**
 * Hero: tiêu đề ở giữa, bên dưới là một dải đất rộng cả trang mà Gấu Trúc
 * chạy qua chạy lại. Tới mép thì quay đầu — lật hình chứ không vẽ thêm tư thế.
 *
 * Đường chạy chỉ có từ `md` trở lên: dưới đó bề ngang không đủ để một cú chạy
 * đọc ra thành chuyển động, nên nhân vật đứng yên chớp mắt cho gọn.
 */
export function LandingHero() {
  const reduced = usePrefersReducedMotion();
  const tick = useSceneTicker(STEP_MS, 0);
  /*
   * Đứng yên thì phải đứng cho tử tế — tư thế idle và MỞ MẮT.
   *
   * Bản trước để hai giá trị này suy ra từ `tick`, mà giảm chuyển động thì
   * `tick` đứng ở 0, và `0 % 14 === 0` đúng — nên Gấu nhắm tịt mắt vĩnh viễn
   * (chớp mắt là vẽ ĐÈ đốm sáng bằng màu lông đen, không phải làm mờ). Nó còn
   * chết cứng giữa một sải chân. Cả hai thứ đó phải nói thẳng ra, không suy.
   */
  const pose = reduced ? 'idle' : tick % 2 === 0 ? 'walk' : 'walk2';
  const blinking = !reduced && tick % 14 === 0;

  return (
    <section className="flex flex-col items-center gap-5 px-5 pt-16 text-center sm:px-8 sm:pt-20">
      <span className="text-remediate font-mono text-[11px] uppercase tracking-[0.14em]">
        Chào, mình là Gấu Trúc
      </span>
      {/*
        Nguyên văn theo PNG, không diễn đạt lại. Bảng định đoạt của issue #388
        có bảy hàng, sáu hàng là BỎ/SỬA vì PNG hứa năng lực không có thật —
        hero là hàng DUY NHẤT ghi "giữ nguyên văn", vì nó không hứa sai gì cả.

        Cụm cuối tô màu đúng chỗ PNG nhấn, nhưng bằng token `--remediate` của
        hệ thống chứ không lấy màu của PNG: nhấn cùng CHỖ, không cùng MÀU.
      */}
      <h1 className="font-heading max-w-[20ch] text-balance text-[34px] sm:text-[44px] lg:text-[54px]">
        Ôn tập thông minh, truy ngược tận gốc <span className="text-remediate">kiến thức yếu</span>
      </h1>
      <p className="text-muted-foreground max-w-[56ch] text-pretty text-[15px] leading-[1.7] sm:text-[17px]">
        Giải pháp AI toàn diện giúp sinh viên Việt Nam tối ưu hóa lộ trình học tập và lấp đầy lỗ
        hổng kiến thức.
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-4">
        <Button asChild size="lg">
          <Link to="/register">Nhận lộ trình ngay</Link>
        </Button>
        <span className="text-muted-foreground font-mono text-[12px]">Hoàn toàn miễn phí</span>
      </div>

      {/*
        Đường chạy — chỉ trên màn rộng.

        Không kẻ vạch mặt đất: một đường ngang hết bề rộng thì đọc thành vạch
        chia section chứ không phải mặt đất, nên vệt dưới chân phải tự làm việc
        neo nhân vật.

        Vệt đó là `--panda-shadow`, và nó KHÔNG cùng một thứ ở hai theme. Theme
        sáng thì đúng là bóng, tối hơn nền. Theme tối thì không bóng nào tồn tại
        được — nền đã ở 0.17, một vệt tối hơn nền cao nhất chỉ đạt 1,07:1 dù có
        dùng đen tuyệt đối, đã đo — nên nó lật thành vũng sáng dưới chân. Cùng
        một vai trò, hai cách đạt tới.
      */}
      <div className="relative mt-8 hidden h-[190px] w-full md:block">
        <div
          className="lp-runner absolute bottom-0"
          style={{ '--lp-runner-w': `${RUNNER_SIZE}px` } as CSSProperties}
        >
          <PandaSprite pose={pose} size={RUNNER_SIZE} blinking={blinking} shadow />
        </div>
      </div>

      {/* Màn hẹp: đứng yên, không cần đường chạy. */}
      <div className="mt-6 md:hidden">
        <PandaSprite pose="idle" size={116} blinking={blinking} shadow />
      </div>
    </section>
  );
}
