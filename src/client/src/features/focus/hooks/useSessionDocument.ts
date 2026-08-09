import { useCallback, useEffect, useMemo, useState } from 'react';
import { planApi } from '@/features/study-planner/api/plan.api';
import type { ConceptSourceExcerpt } from '@/features/study-planner/types/concept';

/** Ba mức của FS-04, theo đúng thứ tự phím `D` xoay vòng. */
export type DocumentLevel = 'hidden' | 'excerpt' | 'fulltext';

const LEVEL_ORDER: DocumentLevel[] = ['hidden', 'excerpt', 'fulltext'];

/** Hằng số chứ không phải `[]` viết tại chỗ: mảng mới mỗi lần render sẽ phá `useMemo` bên dưới. */
const NO_SOURCES: ConceptSourceExcerpt[] = [];

/** Vì sao hai mức tài liệu đang khoá — hiện nguyên văn trong tooltip của nút bị vô hiệu. */
export type DocumentUnavailableReason = 'loading' | 'no-sources' | 'fetch-failed';

export const UNAVAILABLE_TOOLTIP: Record<DocumentUnavailableReason, string> = {
  loading: 'Đang tải trích đoạn của khái niệm này…',
  // "Chưa neo vị trí" chứ không phải "kế hoạch không có tài liệu": kế hoạch vẫn có tệp gốc, chỉ là
  // khái niệm này không có `ConceptSourceRef` nào trỏ vào đoạn nào (vd. khái niệm thêm tay #172).
  'no-sources': 'Khái niệm này chưa được neo vị trí trong tài liệu nên không có đoạn nào để mở.',
  'fetch-failed': 'Chưa tải được trích đoạn của khái niệm này. Thử lại sau.',
};

interface UseSessionDocumentArgs {
  planId: string | null;
  conceptId: string;
  /**
   * Màn con khác đang chiếm sân khấu (nghỉ giải lao / rời tab). Tài liệu ẩn đi nhưng mức đang chọn
   * KHÔNG bị quên — hết nghỉ thì quay lại đúng mức đó.
   */
  isStageTakenOver: boolean;
}

export interface SessionDocument {
  /** Mức đang THỰC SỰ hiển thị — luôn `hidden` khi sân khấu bị chiếm. */
  level: DocumentLevel;
  /** Mức người dùng đã chọn, giữ nguyên suốt giờ nghỉ để khôi phục sau đó. */
  selectedLevel: DocumentLevel;
  setLevel: (level: DocumentLevel) => void;
  sources: ConceptSourceExcerpt[];
  /** `null` khi hai mức tài liệu dùng được. */
  unavailableReason: DocumentUnavailableReason | null;
}

/** `pageFrom` rỗng xuống cuối: không neo được trang thì không chen ngang thứ tự các đoạn có neo. */
function byPageFrom(a: ConceptSourceExcerpt, b: ConceptSourceExcerpt): number {
  if (a.pageFrom === null) return b.pageFrom === null ? 0 : 1;
  if (b.pageFrom === null) return -1;
  return a.pageFrom - b.pageFrom;
}

/**
 * Trạng thái lớp tài liệu của phiên học (FS-04) — dữ liệu, mức đang chọn, và phím `D`.
 *
 * Gọi `getConceptDetail` MỘT LẦN cho mỗi khái niệm rồi giữ lại, không gọi lại mỗi lần đổi mức
 * (ràng buộc #227): ba mức là ba cách bày cùng một mảng `sources`, không phải ba nguồn dữ liệu.
 * Phải nạp ngay khi vào phiên chứ không đợi tới lúc mở, vì chính segment trên thanh trên cần biết
 * khái niệm có nguồn hay không để render đúng trạng thái khoá — đợi tới lúc bấm thì nút đã hiện sai
 * rồi mới sửa lại trước mắt người dùng.
 */
export function useSessionDocument({
  planId,
  conceptId,
  isStageTakenOver,
}: UseSessionDocumentArgs): SessionDocument {
  const [selectedLevel, setSelectedLevel] = useState<DocumentLevel>('hidden');
  // Kết quả được DÁN NHÃN theo khái niệm đã yêu cầu nó, và trạng thái "đang tải" được SUY RA từ chỗ
  // nhãn đó chưa khớp — chứ không phải một `setSources(null)` dọn dẹp ở đầu effect. Cách này vừa
  // tránh cascading render (effect chỉ setState trong callback bất đồng bộ), vừa khiến việc hiện
  // nhầm nguồn của khái niệm trước trong lúc chờ khái niệm sau trở thành điều không biểu diễn được.
  const [fetched, setFetched] = useState<{ key: string; sources: ConceptSourceExcerpt[] } | null>(
    null
  );
  const [failedKey, setFailedKey] = useState<string | null>(null);

  // Phiên không gắn kế hoạch thì không có tài liệu nào để neo — biết ngay, không phải hỏi server.
  const requestKey = planId === null ? null : `${planId}::${conceptId}`;

  useEffect(() => {
    if (planId === null || requestKey === null) return;

    let isMounted = true;

    planApi
      .getConceptDetail(planId, conceptId)
      .then((detail) => {
        if (isMounted)
          setFetched({ key: requestKey, sources: [...detail.sources].sort(byPageFrom) });
      })
      .catch(() => {
        if (isMounted) setFailedKey(requestKey);
      });

    return () => {
      isMounted = false;
    };
  }, [planId, conceptId, requestKey]);

  const sources =
    requestKey === null ? NO_SOURCES : fetched?.key === requestKey ? fetched.sources : null;

  const unavailableReason: DocumentUnavailableReason | null =
    failedKey !== null && failedKey === requestKey
      ? 'fetch-failed'
      : sources === null
        ? 'loading'
        : sources.length === 0
          ? 'no-sources'
          : null;

  // Khái niệm không có nguồn thì KHÔNG mức nào mở được — kể cả "Toàn văn": id tài liệu chỉ đi kèm
  // `ConceptSourceRef`, tóm tắt kế hoạch (`PlanDetails.document`) có tên tệp nhưng không có id nên
  // không đủ để gọi endpoint #203. Đây là hệ quả của dữ liệu, không phải lựa chọn thiết kế.
  const setLevel = useCallback(
    (level: DocumentLevel) => {
      if (level !== 'hidden' && unavailableReason !== null) return;
      setSelectedLevel(level);
    },
    [unavailableReason]
  );

  // `D` xoay vòng. Bỏ qua khi đang gõ chữ (ô nhập, vùng soạn thảo) — không thì gõ chữ "d" trong ghi
  // chú/cấu hình lại lật tài liệu. Nút bấm KHÔNG bị loại trừ (khác lối tắt `Space` vốn phải nhường
  // chỗ cho việc Space kích hoạt nút): vừa bấm một mức xong rồi gõ `D` là thao tác hợp lý.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'd' && e.key !== 'D') return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      // Sân khấu đang là màn nghỉ/rời tab: mở tài liệu lúc đó vô nghĩa vì nó không được vẽ.
      if (isStageTakenOver) return;
      if (unavailableReason !== null) return;

      e.preventDefault();
      setSelectedLevel((prev) => LEVEL_ORDER[(LEVEL_ORDER.indexOf(prev) + 1) % LEVEL_ORDER.length]);
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isStageTakenOver, unavailableReason]);

  return useMemo(
    () => ({
      // Mức hiển thị thật SUY RA từ dữ liệu, không phải chỉ từ nút người dùng bấm: khoá cả khi chưa
      // có nguồn thì `sources[0]` mà mức "Toàn văn" đọc không bao giờ là `undefined` — bằng cấu
      // trúc, không nhờ mỗi component tự nhớ kiểm tra.
      level: isStageTakenOver || unavailableReason !== null ? 'hidden' : selectedLevel,
      selectedLevel,
      setLevel,
      sources: sources ?? NO_SOURCES,
      unavailableReason,
    }),
    [isStageTakenOver, selectedLevel, setLevel, sources, unavailableReason]
  );
}
