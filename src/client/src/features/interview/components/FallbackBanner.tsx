import { SystemMessage } from './SystemMessage';

/**
 * Băng thông báo khi phiên rơi vào chế độ flashcard tự chấm (AE-05): một lệnh gọi
 * Gemini đã fail nên hệ thống chuyển sang cho sinh viên tự chấm thay vì AI. Dùng đúng khối
 * `.sys--warn` của mockup — cùng chip "Hệ thống" với các ghi chú điều phối, vì đây cũng là
 * một quyết định của phần mềm chứ không phải lời của AI.
 */
export function FallbackBanner() {
  return (
    <SystemMessage variant="warn" isLive>
      AI tạm thời không khả dụng. Chuyển sang chế độ Flashcard tự chấm.
    </SystemMessage>
  );
}
