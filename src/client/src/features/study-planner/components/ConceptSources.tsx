import { useEffect, useState } from 'react';
import { planApi } from '../api/plan.api';
import { fetchDocumentObjectUrl } from '../utils/documentFile';
import { ConceptDocumentSummary, ConceptSourceExcerpt } from '../types/concept';

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

type OpenFailure = 'popup-blocked' | 'fetch-failed';

const FAILURE_MESSAGE: Record<OpenFailure, string> = {
  'popup-blocked': 'Trình duyệt đã chặn cửa sổ mới. Hãy cho phép pop-up cho trang này rồi thử lại.',
  // "Chưa mở được" chứ không phải "không có tài liệu": tệp có thể đã bị thay (SP-04) hoặc mạng
  // rớt, và hai thứ đó khác hẳn nhau với người đang đối chiếu.
  'fetch-failed': 'Chưa mở được tài liệu. Vui lòng thử lại.',
};

/**
 * Nút "Mở tài liệu" của MỘT trích đoạn (Issue #203) — tầng thứ hai của ràng buộc C5: #202 cho
 * đọc *trích đoạn* AI rút ra, chỗ này cho mở chính tài liệu để đối chiếu xem câu đó có thật
 * nằm ở trang đó không.
 *
 * Là `<button>` chứ không phải `<a href>`, và đó là điều bắt buộc chứ không phải lựa chọn thẩm
 * mỹ: app xác thực bằng Bearer token trong header (`apiClient`), không phải cookie — một link
 * trần mở tab mới sẽ không mang theo token và chỉ nhận về 401. Phần lấy bytes → object URL nằm
 * ở `fetchDocumentObjectUrl`; component này chỉ quyết định *cách bày* (mở tab + `#page=N`).
 *
 * Số trang chỉ hiện cho PDF. Tài liệu `text`/`image` VẪN có thể mang `pageFrom` trong DB (văn
 * bản dán vào được đánh trang lúc phân tích), nhưng không có trình xem nào nhảy tới trang đó
 * được — hứa "tại trang N" rồi mở ra đầu tệp còn tệ hơn là không hứa. Phép lọc ấy nằm ở NƠI
 * GỌI (`ConceptSourceList`), không ở đây: nhánh rỗng không có `kind` nào để hỏi, nên nút chỉ
 * nhận một `page` đã quyết xong.
 */
function OpenDocumentButton({
  planId,
  documentId,
  page,
}: {
  planId: string;
  documentId: string;
  /**
   * Trang để nhảy tới, hoặc `null` để mở từ đầu tệp. Nhận từ NƠI GỌI chứ không tự suy ra: nút
   * này giờ phục vụ cả khối trích đoạn (có neo) lẫn nhánh rỗng (không neo), và ở nhánh rỗng
   * không tồn tại thứ gì để suy ra một số trang. Truyền vào nên "hứa trang mà không có neo"
   * là thứ không diễn đạt được, thay vì một điều kiện phải nhớ kiểm.
   */
  page: number | null;
}) {
  const [isOpening, setIsOpening] = useState(false);
  const [failure, setFailure] = useState<OpenFailure | null>(null);

  const label = page !== null ? `Mở tài liệu tại trang ${page}` : 'Mở tài liệu';

  const handleClick = async () => {
    if (isOpening) return;
    setFailure(null);

    // Mở tab TRƯỚC khi await: `window.open` chỉ được cho phép trong lúc còn "user activation".
    // Tải xong file rồi mới mở thì với tệp lớn/mạng chậm trình duyệt chặn popup âm thầm —
    // bấm vào không có gì xảy ra, kiểu hỏng khó chẩn đoán nhất.
    const tab = window.open('', '_blank');

    // Bị chặn thì DỪNG, và tuyệt đối không lấy tab hiện tại làm phương án hai: khối nguồn này
    // cũng sống trong panel edit mode, nơi người dùng có thể đang có sửa đổi đồ thị chưa lưu
    // (thêm/xoá khái niệm, nối cạnh). Điều hướng tab hiện tại sang PDF là xoá sạch chỗ đó —
    // mất việc của người dùng để đổi lấy một tệp họ chỉ định liếc qua. Thà nói thẳng là bị chặn.
    if (!tab) {
      setFailure('popup-blocked');
      return;
    }
    // Blob cùng origin nên opener không phải lỗ hổng, nhưng tab tài liệu không việc gì phải
    // giữ tay lái vào app.
    tab.opener = null;
    setIsOpening(true);

    try {
      const { url, revoke } = await fetchDocumentObjectUrl(planId, documentId);
      // `#page=N` là best-effort đúng như ràng buộc #203: trình xem PDF của Chrome/Edge hiểu,
      // trình khác bỏ qua và mở từ đầu tệp.
      tab.location.href = page !== null ? `${url}#page=${page}` : url;

      // Tab kia giờ nằm ngoài tầm với, nên chỉ còn cách hẹn giờ: thu hồi sớm thì nó chưa kịp
      // tải, không thu hồi thì giữ nguyên tệp trong bộ nhớ tới lúc rời trang. Hoãn lại là đủ
      // cho lượt tải đầu — đánh đổi là bấm F5 trong tab tài liệu sau một phút sẽ hỏng.
      setTimeout(revoke, 60000);
    } catch {
      tab.close();
      setFailure('fetch-failed');
    } finally {
      setIsOpening(false);
    }
  };

  return (
    <div className="mt-2.5">
      <button
        type="button"
        onClick={handleClick}
        disabled={isOpening}
        className="border-border hover:border-foreground border-b text-[12px] transition-colors disabled:opacity-60"
      >
        {isOpening ? 'Đang mở…' : label}
      </button>
      {failure && (
        <p className="text-muted-foreground mt-1 text-[11.5px] italic">
          {FAILURE_MESSAGE[failure]}
        </p>
      )}
    </div>
  );
}

/**
 * Danh sách trích đoạn gốc của một khái niệm — dùng chung cho panel chi tiết (view mode, DB-06)
 * và panel kiểm chứng (edit mode, Issue #202) để hai bên trông như một: cùng khung nguồn
 * `filename` + `tr. X–Y`, cùng cách tô đậm tên khái niệm.
 *
 * Danh sách rỗng KHÔNG phải lỗi, và có HAI nguyên nhân chứ không phải một:
 *  - khái niệm **thêm tay** (`source=manual`, #172) chưa từng có `ConceptSourceRef` nào;
 *  - khái niệm AI **chỉ được nhắc tên**: #377 cho phép một khái niệm không trích được đoạn nào
 *    vẫn vào đồ thị, nên nó cũng rơi đúng vào nhánh này.
 *
 * Cả hai đều là mệnh đề về NEO của một khái niệm, và **không** nói gì về việc kế hoạch có tệp
 * gốc hay không — `document` (metadata cấp plan, #490) vẫn mở được nguyên tệp. Đọc nhánh rỗng
 * thành "kế hoạch không có tài liệu" chính là chỗ bản vá #378 dừng lại ở focus mode và bỏ quên
 * hai panel này (#493).
 */
export function ConceptSourceList({
  planId,
  sources,
  conceptName,
  prerequisiteNames,
  document = null,
}: {
  planId: string;
  sources: ConceptSourceExcerpt[];
  conceptName: string;
  prerequisiteNames: string[];
  /** Tệp gốc của kế hoạch, độc lập với việc khái niệm này có neo được đoạn nào không (#493). */
  document?: ConceptDocumentSummary | null;
}) {
  if (sources.length === 0) {
    return (
      <div>
        <p className="text-muted-foreground text-[13px] italic">Không có trích đoạn gốc.</p>
        {/* Không neo được đoạn nào thì vẫn còn nguyên tệp để đối chiếu — và ở panel edit mode
            đây chính là cổng xác nhận C5, nơi người dùng phải soi tên khái niệm với câu trong
            tài liệu trước khi bấm xác nhận. `page={null}`: không có neo thì KHÔNG hứa trang. */}
        {document && (
          <OpenDocumentButton planId={planId} documentId={document.documentId} page={null} />
        )}
      </div>
    );
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
          {/* Mỗi trích đoạn một nút, không phải một nút cho cả khái niệm: một khái niệm có thể
              neo vào nhiều trang khác nhau, "trang 41" phải thuộc về đúng đoạn nằm ở trang 41
              (mockup screen-concept-graph đặt link ngay trong khối nguồn vì lẽ đó). */}
          <OpenDocumentButton
            planId={planId}
            documentId={source.documentId}
            page={source.kind === 'pdf' ? source.pageFrom : null}
          />
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
  const [document, setDocument] = useState<ConceptDocumentSummary | null>(null);
  const [isLoading, setIsLoading] = useState(isPersisted);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    if (!isPersisted) return;
    let isMounted = true;

    planApi
      .getConceptDetail(planId, conceptId)
      .then((data) => {
        if (!isMounted) return;
        setSources(data.sources);
        // Tệp gốc đi kèm chi tiết khái niệm và KHÔNG phụ thuộc vào việc có neo được đoạn nào —
        // vứt nó đi ở đây là cách nhánh rỗng mất hết lối vào tài liệu (#493).
        setDocument(data.document);
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
      planId={planId}
      sources={sources ?? []}
      conceptName={conceptName}
      prerequisiteNames={prerequisiteNames}
      document={document}
    />
  );
}
