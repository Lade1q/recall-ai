import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  ExtractScene,
  LandingHero,
  PandaSprite,
  TracebackScene,
  VerdictScene,
} from '@/features/landing';

/**
 * Trang landing công khai (`/`, issue #388) — điểm vào cho người chưa đăng nhập.
 *
 * Tĩnh hoàn toàn, không gọi API. Trang đi theo đúng vòng lặp của sản phẩm:
 * tải tài liệu → dựng đồ thị khái niệm → truy ngược khi sai → không kết luận
 * khi chưa đủ căn cứ. Ba cảnh giữa đều dựng lại một mệnh đề CÓ THẬT trong
 * engine chứ không phải hình minh hoạ trang trí.
 *
 * Gấu Trúc là linh vật, vẽ pixel art trên lưới 16×16 (`features/landing/data`).
 * Đây là phần tử pixel DUY NHẤT của trang — chữ vẫn Noto Serif, đường vẫn
 * mảnh, khoảng trắng vẫn rộng. Tương phản đó là chủ đích.
 */
export default function LandingPage() {
  return (
    <div className="bg-background text-foreground flex min-h-screen flex-col">
      <header className="border-border mx-auto flex w-full max-w-[1280px] items-center justify-between border-b px-5 py-4 sm:px-8 lg:px-14">
        <div className="flex items-center gap-2.5">
          <PandaSprite pose="idle" size={26} />
          <span className="font-heading text-base tracking-tight">Recall AI</span>
        </div>
        <div className="flex items-center gap-3 sm:gap-5">
          <Button asChild variant="ghost" size="sm">
            <Link to="/login">Đăng nhập</Link>
          </Button>
          <Button asChild size="sm">
            <Link to="/register">Bắt đầu miễn phí</Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1280px] flex-1">
        <LandingHero />
        <SceneRule />
        <ExtractScene />
        <SceneRule />
        <TracebackScene />
        <SceneRule />
        <VerdictScene />
        <SceneRule />

        {/*
          MỘT ý, không phải hai cột.

          Chỗ này từng tách "AI làm" / "Code làm" thành hai ô để nói rõ ranh
          giới: mô hình chỉ chứng kiến, còn chấm điểm và truy ngược là việc của
          thuật toán. Review #410 gộp lại, lý do là người học không quan tâm
          bên trong ai làm phần nào — họ quan tâm cuối cùng mình có hiểu bài
          không.

          Ranh giới ấy không mất, chỉ thôi làm tiêu đề: nó vẫn hiện ra ở cảnh 2,
          dòng "Không mô hình ngôn ngữ nào tham gia bước này" nằm ngay dưới kết
          quả truy ngược — và ở đó nó là bằng chứng, chứ không phải khẩu hiệu.
        */}
        <section className="px-5 py-16 sm:px-8 lg:px-14 lg:py-20">
          <div className="border-border bg-card mx-auto max-w-[1160px] rounded-xl border p-8 text-center lg:p-12">
            <h2 className="font-heading mx-auto max-w-[26ch] text-balance text-[24px] sm:text-[27px]">
              Không chỉ hỏi bạn, Recall AI biết bạn đã hiểu đến đâu.
            </h2>
            <p className="text-muted-foreground mx-auto mt-4 max-w-[68ch] text-pretty text-[14px] leading-[1.8]">
              Recall AI đặt câu hỏi dựa trên tài liệu bạn học, đánh giá câu trả lời và cập nhật lộ
              trình theo những gì bạn thể hiện, để bạn không chỉ hoàn thành bài học, mà biết mình
              thực sự đã hiểu bản chất chưa.
            </p>
          </div>
        </section>

        <section className="flex flex-col items-center gap-5 px-5 pb-20 pt-10 text-center sm:px-8">
          <PandaSprite pose="cheer" size={128} shadow />
          <h2 className="font-heading max-w-[22ch] text-balance text-[26px] sm:text-[32px]">
            Tải lên tài liệu, nhận lộ trình học của riêng bạn.
          </h2>
          <Button asChild size="lg">
            <Link to="/register">Nhận lộ trình học ngay</Link>
          </Button>
        </section>
      </main>

      <footer className="border-border mx-auto flex w-full max-w-[1280px] items-center justify-between border-t px-5 py-5 sm:px-8 lg:px-14">
        <div className="flex items-center gap-2.5">
          <PandaSprite pose="idle" size={22} />
          <span className="font-heading text-[15px] tracking-tight">Recall AI</span>
        </div>
        <span className="text-muted-foreground font-mono text-[12px]">© 2026 Recall AI</span>
      </footer>
    </div>
  );
}

/**
 * Ngăn cách giữa hai cảnh: MỘT vạch dài, và chỉ một.
 *
 * Bản đầu kẻ `border-t` trên từng section rồi lại thêm hai vạch "mặt đất" cho
 * linh vật đứng — bốn đường sát nhau đọc thành cái thang. Ở đây mỗi ranh giới
 * chỉ có đúng một đường, và mặt đất thì để bóng đổ dưới chân lo.
 */
function SceneRule() {
  return <div aria-hidden="true" className="bg-border mx-auto h-px w-full max-w-[1160px]" />;
}
