import { Concept, ConceptEdge, PlanDocument, PlanDocumentEdge } from '../types/concept';

/**
 * Rổ chứa các khái niệm chưa thuộc tài liệu nào.
 *
 * Không phải trạng thái di sản: `replacePlanGraph` tạo khái niệm người dùng tự thêm ở bước kiểm
 * chứng mà không có tài liệu nào để gán, nên rổ này có thật ngay cả trên kế hoạch mới tinh.
 * Giấu chúng đi là làm mất khái niệm một cách im lặng.
 */
export const UNASSIGNED_TOPIC_ID = '__unassigned__';

/**
 * Nhãn hiển thị của một chủ đề, suy ra từ TÊN TỆP.
 *
 * `Document.filename` phải giữ nguyên byte-for-byte (một `UPDATE` lên `documents` bump
 * `updatedAt`, và đó là mốc để biết "tệp đã bị thay sau khi trích dẫn này được lấy"), nên việc
 * làm sạch xảy ra ở đây, lúc vẽ, chứ không phải trong DB.
 *
 * Bỏ phần mở rộng và các tiền tố mã bài thường gặp. Không khớp mẫu nào thì trả về nguyên tên đã
 * bỏ đuôi — KHÔNG BAO GIỜ trả chuỗi rỗng: một ô chủ đề không nhãn tệ hơn hẳn một nhãn xấu.
 */
/**
 * Nhãn hiển thị của một chủ đề, suy ra từ TÊN TỆP.
 *
 * `Document.filename` phải giữ nguyên byte-for-byte (một `UPDATE` lên `documents` bump
 * `updatedAt`, và đó là mốc để biết "tệp đã bị thay sau khi trích dẫn này được lấy"), nên việc
 * làm sạch xảy ra ở đây, lúc vẽ, chứ không phải trong DB.
 *
 * Tiền tố bị bóc, theo thứ tự áp dụng. Mỗi mẫu chỉ bóc PHẦN ĐẦU, không đụng phần còn lại.
 */
const TOPIC_LABEL_PREFIXES: readonly RegExp[] = [
  // "[CNPM] ", "(CNPM) "
  /^[[(][^\])]*[\])]\s*/,
  // "LN02 - ", "LN02_", "Bài 3:", "Chapter 4 —", "chap8 -", "Tuần 2."
  /^(?:ln|bài|bai|chapter|chap|ch|lecture|lec|unit|week|tuần|tuan)\s*\d+\s*[-–—:_.)]*\s*/i,
  // "01. ", "1 - "
  /^\d+\s*[-–—:_.)]+\s*/,
];

export function topicLabel(filename: string): string {
  const withoutExtension = filename.replace(/\.[^./\\]+$/, '').trim();

  let label = withoutExtension;
  for (const prefix of TOPIC_LABEL_PREFIXES) {
    const stripped = label.replace(prefix, '').trim();
    // Bóc mà không còn gì thì HOÀN LẠI bước đó, đừng bóc tiếp và cũng đừng quay về tên gốc.
    // "[CNPM] chap1.pdf" là ca thật: bóc ngoặc ra "chap1", rồi luật "chap<số>" nuốt nốt phần còn
    // lại. Quay về tên gốc ở đây thì công của bước bóc ngoặc mất trắng; giữ "chap1" mới đúng.
    if (stripped.length > 0) label = stripped;
  }

  // Không bao giờ trả rỗng: một ô chủ đề không nhãn tệ hơn hẳn một nhãn xấu.
  return label.length > 0 ? label : filename;
}

export interface TopicSummary {
  /** `Document.id`, hoặc `UNASSIGNED_TOPIC_ID` cho rổ chưa xếp. */
  id: string;
  label: string;
  filename: string | null;
  pageCount: number | null;
  conceptCount: number;
  /** Số khái niệm dưới ngưỡng yếu — mặt sau của dải mastery trên node chủ đề. */
  weakCount: number;
  /** Trung bình `mastery_score` của các khái niệm CÓ điểm; `null` khi chưa có cái nào được chấm.
   *  Không lấy 0 làm mặc định: "chưa kiểm tra" và "kiểm tra rồi, 0 điểm" là hai chuyện khác nhau. */
  averageMastery: number | null;
}

/** Ngưỡng "yếu" — cùng con số `masteryBand` dùng, giữ ở một chỗ để hai bên không trôi khỏi nhau. */
const WEAK_THRESHOLD = 0.6;

/**
 * Gom khái niệm về từng chủ đề, theo đúng thứ tự tài liệu được đưa vào.
 *
 * Rổ "Chưa xếp chủ đề" chỉ xuất hiện khi thực sự có khái niệm rơi vào nó — một ô rỗng mang tên
 * đó chỉ làm người đọc tưởng có gì bị mất.
 */
export function summariseTopics(
  documents: readonly PlanDocument[],
  concepts: readonly Concept[]
): TopicSummary[] {
  const byTopic = new Map<string, Concept[]>();
  const knownIds = new Set(documents.map((d) => d.id));

  for (const concept of concepts) {
    // Một `primaryDocumentId` trỏ tới tài liệu không còn trong danh sách (bị xoá, hoặc phản hồi
    // cũ) được coi như chưa xếp, chứ không dựng ra một ô chủ đề ma không có tên.
    const topicId =
      concept.primaryDocumentId && knownIds.has(concept.primaryDocumentId)
        ? concept.primaryDocumentId
        : UNASSIGNED_TOPIC_ID;
    const bucket = byTopic.get(topicId);
    if (bucket) bucket.push(concept);
    else byTopic.set(topicId, [concept]);
  }

  const summarise = (
    id: string,
    label: string,
    filename: string | null,
    pageCount: number | null
  ): TopicSummary => {
    const bucket = byTopic.get(id) ?? [];
    const scored = bucket.filter((c) => c.mastery_score !== null) as (Concept & {
      mastery_score: number;
    })[];
    return {
      id,
      label,
      filename,
      pageCount,
      conceptCount: bucket.length,
      weakCount: scored.filter((c) => c.mastery_score < WEAK_THRESHOLD).length,
      averageMastery:
        scored.length > 0
          ? scored.reduce((sum, c) => sum + c.mastery_score, 0) / scored.length
          : null,
    };
  };

  const topics = documents.map((document) =>
    summarise(document.id, topicLabel(document.filename), document.filename, document.pageCount)
  );

  if ((byTopic.get(UNASSIGNED_TOPIC_ID)?.length ?? 0) > 0) {
    topics.push(summarise(UNASSIGNED_TOPIC_ID, 'Chưa xếp chủ đề', null, null));
  }

  return topics;
}

/** Chỉ những khái niệm thuộc chủ đề đang mở. */
export function conceptsOfTopic(
  concepts: readonly Concept[],
  topicId: string,
  documents: readonly PlanDocument[]
): Concept[] {
  const knownIds = new Set(documents.map((d) => d.id));
  if (topicId === UNASSIGNED_TOPIC_ID) {
    return concepts.filter((c) => !c.primaryDocumentId || !knownIds.has(c.primaryDocumentId));
  }
  return concepts.filter((c) => c.primaryDocumentId === topicId);
}

export interface SplitEdges {
  /** Cạnh có CẢ HAI đầu trong chủ đề đang mở — thứ duy nhất được vẽ ở tầng 2. */
  intra: ConceptEdge[];
  /**
   * Cạnh có ĐÚNG MỘT đầu trong chủ đề đang mở. Không vẽ, nhưng phải ĐẾM: `ConceptDetailPanel`
   * tính tiên quyết từ chính đồ thị được truyền vào, nên một khái niệm có tiên quyết ở chủ đề
   * khác sẽ hiện ra như thể "không có tiên quyết nào" và người học tin. Con số này là thứ trả
   * nợ cho việc ẩn.
   *
   * Thường bằng 0 theo cấu tạo (pha 1 chỉ nối khái niệm trong cùng một tệp = cùng một chủ đề).
   * Khác 0 chỉ khi một khái niệm dạy ở hai tệp bị gộp làm một node — hiếm, nên đây đúng là nhánh
   * dễ không bao giờ được chạy nếu không có fixture riêng.
   */
  cross: ConceptEdge[];
}

export function splitEdgesByTopic(
  edges: readonly ConceptEdge[],
  conceptIdsInTopic: ReadonlySet<string>
): SplitEdges {
  const intra: ConceptEdge[] = [];
  const cross: ConceptEdge[] = [];

  for (const edge of edges) {
    const hasSource = conceptIdsInTopic.has(edge.source);
    const hasTarget = conceptIdsInTopic.has(edge.target);
    if (hasSource && hasTarget) intra.push(edge);
    else if (hasSource || hasTarget) cross.push(edge);
    // Cạnh không chạm chủ đề này thuộc về chủ đề khác — không phải việc của tầng 2 lúc này.
  }

  return { intra, cross };
}

/** Cạnh chủ đề dưới dạng `ConceptEdge` để dùng lại `toReactFlowEdges` nguyên vẹn. */
export function topicEdgesToGraphEdges(
  documentEdges: readonly PlanDocumentEdge[],
  topicIds: ReadonlySet<string>
): ConceptEdge[] {
  return documentEdges
    .filter((e) => topicIds.has(e.fromDocumentId) && topicIds.has(e.toDocumentId))
    .map((e) => ({ id: e.id, source: e.fromDocumentId, target: e.toDocumentId }));
}

/**
 * Cùng quy tắc chuẩn hoá tên với server (`normalizeConceptKey`). Hai bên PHẢI khớp, vì
 * `PUT /plans/:id/graph` định địa chỉ khái niệm bằng TÊN chứ không bằng id.
 */
export function conceptKey(name: string): string {
  return name.trim().toLowerCase();
}

export interface TopicEditMerge {
  concepts: Concept[];
  edges: ConceptEdge[];
}

/**
 * Ghép phần vừa sửa của MỘT chủ đề trở lại đồ thị đầy đủ.
 *
 * 🔴 Chỗ dễ mất dữ liệu nhất của cả tính năng. `PUT /plans/:id/graph` là THAY-THẾ-TOÀN-BỘ và xoá
 * cứng mọi khái niệm vắng mặt trong payload, nên gửi thẳng thứ `ConceptGraph` trả về — tập con
 * của một chủ đề — là xoá vĩnh viễn khái niệm của mọi chủ đề khác.
 *
 * Ba vế, cả ba đều là lỗi IM LẶNG nếu viết sai:
 *
 * 1. `slice` là tập TRUYỀN XUỐNG, không phải tập TRẢ VỀ. Người dùng xoá một khái niệm thì nó vắng
 *    ở `editedConcepts`; lấy tập đối chiếu từ giá trị trả về thì bản cũ sống sót và thao tác xoá
 *    không có tác dụng — mà màn hình vẫn hiện như đã xoá.
 * 2. Cạnh XUYÊN chủ đề chưa từng được truyền xuống nên không thể quay về từ `editedEdges`. Giữ
 *    mọi cạnh có ÍT NHẤT một đầu ngoài lát; chỉ thay nhóm có CẢ HAI đầu trong lát. Viết thành
 *    "bỏ mọi cạnh chạm lát" là xoá sạch cạnh xuyên chủ đề mỗi lần xác nhận.
 * 3. Nhưng cạnh giữ lại có thể MỒ CÔI: nếu khái niệm vừa xoá chính là đầu-trong-lát của một cạnh
 *    xuyên chủ đề thì đầu kia không còn trong payload ⇒ backend trả 400 INVALID_EDGE_REFERENCE và
 *    cả thao tác xác nhận hỏng. Nên bước cuối bắt buộc là lọc bỏ cạnh mồ côi.
 */
export function mergeTopicEditIntoGraph(params: {
  fullConcepts: readonly Concept[];
  fullEdges: readonly ConceptEdge[];
  /** Đúng tập đã TRUYỀN XUỐNG `ConceptGraph`. */
  slice: readonly Concept[];
  editedConcepts: readonly Concept[];
  editedEdges: readonly ConceptEdge[];
  /** Chủ đề đang mở — gán cho khái niệm người dùng vừa THÊM. `null` cho rổ chưa xếp. */
  openTopicId: string | null;
}): TopicEditMerge {
  const { fullConcepts, fullEdges, slice, editedConcepts, editedEdges, openTopicId } = params;

  const touched = new Set(slice.map((c) => conceptKey(c.name)));
  const existingKeys = new Set(fullConcepts.map((c) => conceptKey(c.name)));

  const concepts: Concept[] = [
    ...fullConcepts.filter((c) => !touched.has(conceptKey(c.name))),
    // Bỏ qua khái niệm quay về mà KHÔNG thuộc lát và cũng KHÔNG mới: trình sửa chưa từng được
    // trao quyền trên nó, nên bản trong `fullConcepts` mới là bản đúng. Không có bộ lọc này thì
    // payload mang hai hàng cùng một tên — mà server định địa chỉ bằng TÊN.
    ...editedConcepts
      .filter((c) => touched.has(conceptKey(c.name)) || !existingKeys.has(conceptKey(c.name)))
      .map((c) =>
        existingKeys.has(conceptKey(c.name))
          ? c
          : {
              ...c,
              // Không có dòng này thì server tạo khái niệm mới với `primary_document_id = NULL`
              // và nó biến khỏi đúng cái chủ đề vừa thêm nó vào — im lặng, vì nó chỉ hiện lại ở
              // rổ "Chưa xếp chủ đề".
              primaryDocumentId: openTopicId,
            }
      ),
  ];

  const sliceIds = new Set(slice.map((c) => c.id));
  const keptEdges = fullEdges.filter((e) => !(sliceIds.has(e.source) && sliceIds.has(e.target)));

  const conceptIds = new Set(concepts.map((c) => c.id));
  const edges = [...keptEdges, ...editedEdges].filter(
    (e) => conceptIds.has(e.source) && conceptIds.has(e.target)
  );

  return { concepts, edges };
}
