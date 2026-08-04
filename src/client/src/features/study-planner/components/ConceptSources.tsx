import { useEffect, useState } from 'react';
import { planApi } from '../api/plan.api';
import { ConceptSourceExcerpt } from '../types/concept';

// Tên khái niệm là dữ liệu người dùng/AI sinh ra ("Mảng & Con trỏ", "Cây AVL (tự cân bằng)"),
// không phải hằng số — phải escape trước khi nhét vào RegExp.
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Tô đậm hai loại tên trong trích đoạn gốc, mỗi loại chứng minh một điều khác nhau (Issue #210):
 *
 * - Khái niệm **tiên quyết** xuất hiện trong đoạn → mức nhấn chính, khớp mockup
 *   `screen-concept-graph.html`: đây là bằng chứng đường truy ngược AE-07 (quan hệ tiên quyết
 *   có căn cứ trong chính tài liệu, không phải suy luận của mô hình).
 * - Khái niệm **đang xem** cũng xuất hiện trong đoạn → mức nhấn phụ (gạch chân, không nền):
 *   đây là ràng buộc C5 ("AI không bịa") — vẫn phải thấy được, nhưng không được lấn mức nhấn
 *   chính vì phần lớn trích đoạn thực tế không lặp lại tên khái niệm nó định nghĩa.
 *
 * Ghép mọi tên thành MỘT RegExp thay vì tô nhiều lượt, sắp xếp theo độ dài giảm dần trước khi
 * ghép — tránh tô lồng nhau khi một tên chứa tên kia (vd. "Requirements" nằm trong "Functional
 * Requirements").
 *
 * KHÔNG thêm tầng thứ ba cho khái niệm **hậu kế (downstream)**: đoạn trích neo vào một khái niệm
 * chính là đoạn *định nghĩa* nó — vốn tựa trên **tiên quyết** (cái có trước), không nhắc tới cái
 * xây trên nó → tên hậu kế gần như không bao giờ xuất hiện trong đoạn, thêm tầng ba chỉ tái lập
 * đúng căn bệnh component này vừa chữa. Hậu kế đã có chỗ riêng: mục "Khái niệm phụ thuộc" trong
 * `ConceptDetailPanel` (mảng `dependents`) — không mất thông tin, chỉ là không nằm trong trích
 * đoạn. Xem quyết định đầy đủ + điều kiện lật lại ở Issue #210 trước khi định thêm tầng này.
 */
export function HighlightedExcerpt({
  text,
  conceptName,
  prerequisiteNames = [],
}: {
  text: string;
  conceptName: string;
  prerequisiteNames?: string[];
}) {
  const prerequisiteSet = new Set(
    prerequisiteNames.map((name) => name.trim().toLowerCase()).filter(Boolean)
  );
  const terms = Array.from(new Set([conceptName.trim(), ...prerequisiteNames.map((n) => n.trim())]))
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  if (terms.length === 0) return <>{text}</>;

  const pattern = new RegExp(`(${terms.map(escapeRegExp).join('|')})`, 'gi');
  // Nhóm bắt trong `split` đẩy mọi đoạn KHỚP vào chỉ số lẻ, đoạn còn lại vào chỉ số chẵn.
  const parts = text.split(pattern);

  return (
    <>
      {parts.map((part, i) => {
        if (i % 2 === 0) return part;
        const isPrerequisite = prerequisiteSet.has(part.toLowerCase());
        return (
          <mark
            key={i}
            className={
              isPrerequisite
                ? 'bg-remediate/16 rounded-[2px] px-0.5 text-inherit'
                : 'decoration-muted-foreground/70 bg-transparent text-inherit underline decoration-dotted underline-offset-2'
            }
          >
            {part}
          </mark>
        );
      })}
    </>
  );
}

/**
 * Danh sách trích đoạn gốc của một khái niệm — dùng chung cho panel chi tiết (view mode, DB-06)
 * và panel kiểm chứng (edit mode, Issue #202) để hai bên trông như một: cùng khung nguồn
 * `filename` + `tr. X–Y`, cùng cách tô đậm tên khái niệm.
 *
 * Danh sách rỗng KHÔNG phải lỗi: khái niệm thêm tay (source=manual, #172) không có
 * `ConceptSourceRef` nào, và đó là trạng thái hợp lệ.
 */
export function ConceptSourceList({
  sources,
  conceptName,
  prerequisiteNames,
}: {
  sources: ConceptSourceExcerpt[];
  conceptName: string;
  prerequisiteNames: string[];
}) {
  if (sources.length === 0) {
    return <p className="text-muted-foreground text-[13px] italic">Không có trích đoạn gốc.</p>;
  }

  return (
    <div className="flex flex-col gap-2.5">
      {sources.map((source, idx) => (
        <div
          key={idx}
          className="border-border rounded-[calc(var(--radius)*0.8)] border px-3.5 py-3"
        >
          <div className="mb-2 flex items-baseline justify-between gap-2.5 text-[12px]">
            <span className="min-w-0 truncate">{source.filename}</span>
            {source.pageFrom !== null && (
              <span className="text-muted-foreground shrink-0 font-mono">
                {source.pageFrom === source.pageTo
                  ? `tr. ${source.pageFrom}`
                  : `tr. ${source.pageFrom}–${source.pageTo}`}
              </span>
            )}
          </div>
          {source.excerpt ? (
            <blockquote className="text-muted-foreground border-border m-0 text-pretty border-l-2 pl-2.5 text-[12.5px] leading-[1.65]">
              <HighlightedExcerpt
                text={source.excerpt}
                conceptName={conceptName}
                prerequisiteNames={prerequisiteNames}
              />
            </blockquote>
          ) : (
            <p className="text-muted-foreground text-[12px] italic">Không có trích đoạn.</p>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Khái niệm vừa thêm tay ở edit mode mang id tạm do client sinh (`c_<timestamp>`, xem
 * `handleAddConcept`), chưa hề tồn tại trong DB. Backend validate cả `:id` lẫn `:conceptId` là
 * UUID nên id tạm chỉ đổi lấy một 400 — hỏi làm gì khi đã biết câu trả lời.
 */
function isPersistedConceptId(conceptId: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(conceptId);
}

/**
 * Khối "Trích từ tài liệu" tự lấy dữ liệu — dành cho nơi chưa có sẵn `ConceptDetail` trong tay
 * (panel edit mode). Nơi đã fetch cả chi tiết khái niệm thì dùng thẳng `ConceptSourceList`.
 *
 * Nơi gọi phải remount qua `key={conceptId}`: state fetch khi đó bắt đầu đúng theo cấu trúc,
 * không cần effect reset (cùng lý do đã ghi ở `ConceptDetailPanel`).
 */
export function ConceptSourcesSection({
  planId,
  conceptId,
  conceptName,
  prerequisiteNames,
}: {
  planId: string;
  conceptId: string;
  conceptName: string;
  prerequisiteNames: string[];
}) {
  const isPersisted = isPersistedConceptId(conceptId);
  const [sources, setSources] = useState<ConceptSourceExcerpt[] | null>(null);
  const [isLoading, setIsLoading] = useState(isPersisted);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    if (!isPersisted) return;
    let isMounted = true;

    planApi
      .getConceptDetail(planId, conceptId)
      .then((data) => {
        if (isMounted) setSources(data.sources);
      })
      .catch(() => {
        if (isMounted) setHasError(true);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [planId, conceptId, isPersisted]);

  if (isLoading) {
    // Skeleton chứ không phải spinner: khối này nằm giữa panel, một vòng xoay ở đây kéo mắt
    // khỏi việc đang làm (đối chiếu khái niệm) hơn là một hình chữ nhật im lặng.
    return (
      <div className="border-border rounded-[calc(var(--radius)*0.8)] border px-3.5 py-3">
        <div className="bg-muted mb-2.5 h-2.5 w-2/5 animate-pulse rounded-full" />
        <div className="bg-muted mb-1.5 h-2.5 w-full animate-pulse rounded-full" />
        <div className="bg-muted h-2.5 w-3/4 animate-pulse rounded-full" />
      </div>
    );
  }

  // Lỗi mạng không được chặn việc chỉnh sửa: nói rõ là "chưa tải được" (khác hẳn "không có"),
  // rồi để người dùng tiếp tục xóa/nối khái niệm như thường.
  if (hasError) {
    return (
      <p className="text-muted-foreground text-[13px] italic">
        Chưa tải được trích đoạn gốc cho khái niệm này.
      </p>
    );
  }

  return (
    <ConceptSourceList
      sources={sources ?? []}
      conceptName={conceptName}
      prerequisiteNames={prerequisiteNames}
    />
  );
}
