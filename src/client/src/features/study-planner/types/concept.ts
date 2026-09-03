/**
 * Provenance của một khái niệm (enum `ConceptSource` phía server). Quan trọng với microcopy:
 * `difficulty` của khái niệm `manual` là giá trị mặc định server đặt (1), không phải ước lượng
 * của ai cả — nên không được gắn nhãn "AI ước lượng" cho nó.
 */
export type ConceptSource = 'ai_generated' | 'manual' | 'imported';

export interface Concept {
  id: string;
  name: string;
  mastery_score: number | null; // null means untested
  difficulty?: number | null;
  source?: ConceptSource;
  /** Last time an interview graded this concept — DB-06's `last_tested_at` (Issue #168). */
  lastTestedAt?: string | null;
  /** Second, orthogonal channel next to mastery band: pending in the AE-07 review queue. */
  isRemediating?: boolean;
  /**
   * Tài liệu mà khái niệm này được xếp dưới — tức CHỦ ĐỀ của nó ở tầng trên của đồ thị.
   * `null`/vắng nghĩa là chưa xếp chủ đề nào (khái niệm người dùng tự thêm ở bước kiểm chứng);
   * UI gom chúng vào rổ "Chưa xếp chủ đề" chứ không giấu đi.
   */
  primaryDocumentId?: string | null;
}

export interface ConceptEdge {
  id: string;
  source: string; // ID of the prerequisite concept
  target: string; // ID of the target concept
}

export interface PlanGraph {
  concepts: Concept[];
  edges: ConceptEdge[];
}

/**
 * The three values of the backend's `StudyPlanStatus` enum — no more, no less.
 * (There is no `completed`: a plan the user is done with is `archived`, SP-04.)
 */
export type PlanStatus = 'draft' | 'active' | 'archived';

export type AnalysisStatus = 'pending' | 'processing' | 'done' | 'failed';

/** Sub-step of a `processing` AnalysisJob (Issue #186, SP-06 mockup's 4-phase progress). */
export type AnalysisPhase = 'sending_to_ai' | 'extracting' | 'linking' | 'validating';

/**
 * `kind` matters to the SP-06 progress panel: a `text` document is inlined into the extract
 * call, so it never goes through a "gửi tài liệu tới AI Service" upload step — the panel
 * must not show that phase as done for one (Issue #186).
 */
export interface PlanDocumentSummary {
  filename: string;
  pageCount: number | null;
  kind: 'pdf' | 'image' | 'text';
}

/**
 * Một tài liệu của kế hoạch — và, vì MỘT TỆP = MỘT CHỦ ĐỀ, cũng chính là một NODE của tầng chủ
 * đề. Không có bảng `topics` nào, nên `id` ở đây là thứ `?topic=<uuid>` trên URL trỏ tới và là
 * thứ `Concept.primaryDocumentId` chỉ vào.
 *
 * Không có tên hiển thị riêng: nhãn suy ra từ `filename` bằng `topicLabel` ở client, vì
 * `Document.filename` phải giữ nguyên byte-for-byte những gì sinh viên tải lên.
 */
export interface PlanDocument {
  id: string;
  filename: string;
  pageCount: number | null;
  kind: 'pdf' | 'image' | 'text';
}

/**
 * Một cạnh của tầng chủ đề: "học `fromDocumentId` trước `toDocumentId`".
 *
 * MỌI hàng đều do lượt nối (pha 2) SUY RA từ mô tả khái niệm, không phải đọc thẳng trang tài
 * liệu — pha 1 chỉ nhìn một tệp nên về nguyên tắc không sinh được cạnh loại này. Vì thế không có
 * trường `source`: tính chất đó là của cả tập hợp, và UI vẽ TOÀN BỘ cạnh này bằng nét đứt.
 */
export interface PlanDocumentEdge {
  id: string;
  fromDocumentId: string;
  toDocumentId: string;
}

export interface PlanDetails {
  id: string;
  name: string;
  deadline?: string;
  status: PlanStatus;
  analysisStatus?: AnalysisStatus | null;
  analysisPhase?: AnalysisPhase | null;
  /** Tiến độ pha đọc tài liệu: "đã đọc k/N tệp". `null` = job cũ, chưa có số — đọc là "không
   *  biết" rồi rơi về thanh theo pha, KHÔNG đọc là 0. */
  analysisDocumentsTotal?: number | null;
  analysisDocumentsDone?: number | null;
  analysisStartedAt?: string | null;
  /** Real reason the latest job failed, truncated/safe — null unless status is `failed` (#183). */
  analysisErrorMessage?: string | null;
  document?: PlanDocumentSummary | null;
  /** Mọi tài liệu của kế hoạch, cũ nhất trước — các node của tầng chủ đề. */
  documents?: PlanDocument[];
  /** Thứ tự học giữa các tài liệu. Rỗng là câu trả lời hợp lệ ("chưa biết thứ tự"): vẫn phải vẽ
   *  đủ các ô chủ đề, chỉ không có mũi tên. */
  documentEdges?: PlanDocumentEdge[];
  dagAutoFixed?: boolean;
  graph: PlanGraph;
}

/** Concepts per mastery band. Sums to `conceptCount`; `untested` is never folded into `weak`. */
export interface MasteryDistribution {
  strong: number;
  learning: number;
  weak: number;
  untested: number;
}

/** One row of `GET /plans` — everything a plan card on SP-03 draws, with no follow-up call. */
export interface PlanSummary {
  id: string;
  name: string;
  deadline: string | null;
  status: PlanStatus;
  conceptCount: number;
  masteryDistribution: MasteryDistribution;
  analysisStatus: AnalysisStatus | null;
  analysisStartedAt: string | null;
  /** Real reason the latest job failed, truncated/safe — null unless status is `failed` (#183). */
  analysisErrorMessage: string | null;
  document: PlanDocumentSummary | null;
  /** Kế hoạch có mấy tài liệu — thẻ nêu tên tệp đầu và đếm phần còn lại. */
  documentCount?: number;
  createdAt: string;
  /** Số KHÁI NIỆM distinct đang chờ ôn của plan (#232 phần 2, đếm theo `conceptId` — KHÔNG phải
   *  số dòng `ReviewQueueItem`) — chân thẻ SP-03 dùng, khác `conceptCount`. */
  reviewQueueConceptCount: number;
}

// Backend Response Types
export interface BackendConcept {
  id: string;
  name: string;
  difficulty: number | null;
  masteryScore: number | null;
  lastTestedAt?: string | null;
  isRemediating?: boolean;
  source?: ConceptSource;
  primaryDocumentId?: string | null;
}

export interface BackendEdge {
  id: string;
  fromConceptId: string;
  toConceptId: string;
}

/** One passage of the source document a concept was extracted from (DB-06 "Trích từ tài liệu"). */
export interface ConceptSourceExcerpt {
  documentId: string;
  filename: string;
  kind: 'pdf' | 'image' | 'text';
  pageFrom: number | null;
  pageTo: number | null;
  excerpt: string | null;
}

/** Latest plan document, available even when a concept has no source anchor (#378). */
export interface ConceptDocumentSummary {
  documentId: string;
  filename: string;
  kind: 'pdf' | 'image' | 'text';
}

/** One row of the DB-06 "Lịch sử học tập" list. */
export interface ConceptHistoryEntry {
  kind: 'interview' | 'focus';
  id: string;
  at: string;
  score: number | null;
  turnCount: number | null;
  durationMinutes: number | null;
}

export type RemediationReason = 'traceback' | 'spaced_repetition' | 'deadline_priority' | 'manual';

/** GET /plans/:id/concepts/:conceptId response — the DB-06 panel's data (Issue #168). */
export interface ConceptDetail {
  id: string;
  name: string;
  difficulty: number | null;
  masteryScore: number | null;
  lastTestedAt: string | null;
  isRemediating: boolean;
  remediationReason: RemediationReason | null;
  document: ConceptDocumentSummary | null;
  sources: ConceptSourceExcerpt[];
  history: ConceptHistoryEntry[];
}

export interface BackendPlanDetails {
  id: string;
  userId: string;
  name: string;
  deadline: string;
  status: PlanStatus;
  analysisStatus: AnalysisStatus | null;
  analysisPhase: AnalysisPhase | null;
  analysisDocumentsTotal?: number | null;
  analysisDocumentsDone?: number | null;
  analysisStartedAt: string | null;
  analysisErrorMessage: string | null;
  document: PlanDocumentSummary | null;
  documents?: PlanDocument[];
  documentEdges?: PlanDocumentEdge[];
  dagAutoFixed: boolean;
  concepts: BackendConcept[];
  edges: BackendEdge[];
}
