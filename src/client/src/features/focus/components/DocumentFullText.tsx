import { useEffect, useState } from 'react';
import { fetchDocumentObjectUrl } from '@/features/study-planner/utils/documentFile';
import type { ConceptSourceExcerpt } from '@/features/study-planner/types/concept';
import { DocumentBar } from './DocumentExcerpt';

/**
 * Mức "Toàn văn" — nguyên tệp gốc, nhúng NGAY TRONG phiên học.
 *
 * `<iframe>` chứ không phải `window.open` như #203, và đó là ràng buộc chứ không phải thẩm mỹ: chế
 * độ nghiêm ngặt đếm "rời tab" bằng `document.hidden` (xem `useFocusTimer`), nên mở tài liệu ra tab
 * mới sẽ tự tay cộng một lần rời tab cho chính người đang học nghiêm túc. #203 mở tab mới được vì ở
 * đó không có phiên nào đang chạy.
 *
 * KHÔNG có thanh phân trang riêng: trình xem PDF của trình duyệt đã cho cuộn + chuyển trang, một
 * pager chồng lên chỉ lặp lại việc đó và không thể biết người dùng đang cuộn tới trang nào. Việc duy
 * nhất màn này cần làm là MỞ ĐÚNG trang chứa khái niệm — làm bằng `#page=N` một lần lúc nhúng.
 *
 * Bytes lấy qua `fetchDocumentObjectUrl` dùng chung: app xác thực bằng Bearer token trong header,
 * nên `<iframe src="/api/…">` trỏ thẳng vào endpoint chỉ nhận về 401.
 */
export function DocumentFullText({
  planId,
  source,
  onFallbackToExcerpt,
}: {
  planId: string;
  source: ConceptSourceExcerpt;
  onFallbackToExcerpt: () => void;
}) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [hasError, setHasError] = useState(false);

  // `#page=N` chỉ có nghĩa với PDF (trình xem hiểu fragment này); ảnh/text mở từ đầu tệp.
  const page = source.kind === 'pdf' ? source.pageFrom : null;

  // Không dọn `objectUrl`/`hasError` ở đầu effect: nơi gọi remount component này qua
  // `key={documentId}` (xem `SessionDocumentPanel`), nên "đổi tài liệu" đã là một mount mới với
  // state khởi tạo sạch.
  useEffect(() => {
    let isMounted = true;
    let cleanup: (() => void) | null = null;

    fetchDocumentObjectUrl(planId, source.documentId)
      .then(({ url, revoke }) => {
        // Unmount trước khi bytes về (đổi mức thật nhanh, hoặc StrictMode chạy effect hai lượt):
        // thu hồi ngay tại đây, không thì object URL này không còn ai cầm để thu hồi nữa.
        if (!isMounted) {
          revoke();
          return;
        }
        cleanup = revoke;
        setObjectUrl(url);
      })
      .catch(() => {
        if (isMounted) setHasError(true);
      });

    return () => {
      isMounted = false;
      cleanup?.();
    };
  }, [planId, source.documentId]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <DocumentBar filename={source.filename} />

      {hasError ? (
        <div className="text-muted-foreground text-[13px] leading-[1.7]">
          <p className="m-0">Chưa mở được tài liệu. Kiểm tra kết nối rồi thử lại.</p>
          <button
            type="button"
            onClick={onFallbackToExcerpt}
            className="border-border hover:border-foreground mt-2 border-b text-[12.5px]"
          >
            Quay lại trích đoạn
          </button>
        </div>
      ) : objectUrl === null ? (
        <p className="text-muted-foreground m-0 text-[13px] italic">Đang mở tài liệu…</p>
      ) : (
        <iframe
          src={page !== null ? `${objectUrl}#page=${page}` : objectUrl}
          title={`Toàn văn tài liệu ${source.filename}`}
          className="border-border min-h-0 w-full flex-1 rounded-[calc(var(--radius)*0.6)] border"
        />
      )}
    </div>
  );
}
