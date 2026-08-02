import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { planApi } from '../api/plan.api';
import { ConceptDetail } from '../types/concept';
import { masteryBand, masteryLabel, type MasteryBand } from '@/components/ui/concept-node';
import { formatAbsoluteDate, formatRelativeDays, formatDayTime } from '../utils/planDates';

/** One row of the "Tiên quyết" / "Phụ thuộc" lists — resolved from the graph the client
 *  already holds (see `ConceptDetailResponse`'s doc comment for why the server doesn't
 *  compute this itself). */
export interface RelatedConcept {
  id: string;
  name: string;
  masteryScore: number | null;
  isRemediating: boolean;
}

interface ConceptDetailPanelProps {
  planId: string;
  conceptId: string;
  conceptName: string;
  prerequisites: RelatedConcept[];
  dependents: RelatedConcept[];
  onClose: () => void;
}

const MASTERY_THRESHOLD = 0.6;

const BAND_BADGE_TONE: Record<
  Exclude<MasteryBand, 'remediating'>,
  'strong' | 'learning' | 'weak' | 'untested'
> = {
  strong: 'strong',
  learning: 'learning',
  weak: 'weak',
  untested: 'untested',
};

// Tailwind cần thấy tên class đầy đủ, tĩnh, để không bị purge — không nội suy
// `text-mastery-${band}` (xem badgeVariants trong badge.tsx dùng cùng cách này).
const BAND_TEXT_CLASS: Record<Exclude<MasteryBand, 'remediating'>, string> = {
  strong: 'text-mastery-strong',
  learning: 'text-mastery-learning',
  weak: 'text-mastery-weak',
  untested: 'text-muted-foreground',
};

const BAND_BG_CLASS: Record<Exclude<MasteryBand, 'remediating'>, string> = {
  strong: 'bg-mastery-strong',
  learning: 'bg-mastery-learning',
  weak: 'bg-mastery-weak',
  untested: 'bg-mastery-untested',
};

function RelatedConceptRow({
  concept,
  isBlocked,
}: {
  concept: RelatedConcept;
  isBlocked?: boolean;
}) {
  const band = masteryBand(concept.masteryScore);
  return (
    <div className="border-border py-2.25 flex items-center justify-between gap-2.5 border-b text-[13px] last:border-b-0">
      <div className="min-w-0">
        {/* `block`, không chỉ `truncate` — span không phải flex item trực tiếp nên trình
            duyệt không tự "blockify" nó; thiếu `block` thì overflow:hidden của truncate
            không có hộp để cắt, tên dài (vd. "Software Development Lifecycle (SDLC)") sẽ
            tràn đè lên Badge điểm số bên phải. */}
        <span className="block truncate">{concept.name}</span>
        {/* Dòng "vì sao" — thứ biến một cái tên thành một lý do. Với hậu kế, nó nói ra CHI PHÍ
            của việc trì hoãn: không phải "bạn yếu một khái niệm" mà "một khái niệm yếu đang
            chặn hai khái niệm khác". */}
        {concept.isRemediating ? (
          <span className="text-remediate mt-0.5 block text-[11px]">
            Đang trong hàng đợi ôn lại hôm nay
          </span>
        ) : (
          isBlocked &&
          concept.masteryScore === null && (
            <span className="text-muted-foreground mt-0.5 block text-[11px]">
              Chưa kiểm tra · đang bị chặn
            </span>
          )
        )}
      </div>
      <Badge tone={BAND_BADGE_TONE[band]}>
        {concept.masteryScore !== null ? concept.masteryScore.toFixed(2) : '—'}
      </Badge>
    </div>
  );
}

/**
 * Tô đậm tên khái niệm ngay trong trích đoạn gốc — đây là chỗ ràng buộc C5 ("AI không bịa")
 * trở thành thứ nhìn thấy được: không chỉ nói "khái niệm này đến từ trang 118", mà chỉ đúng
 * chữ trên trang đó.
 */
function HighlightedExcerpt({ text, term }: { text: string; term: string }) {
  const needle = term.trim();
  if (!needle) return <>{text}</>;

  // Tên khái niệm là dữ liệu người dùng/AI sinh ra ("Mảng & Con trỏ", "Cây AVL (tự cân bằng)"),
  // không phải hằng số — phải escape trước khi nhét vào RegExp.
  const pattern = new RegExp(`(${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  // Nhóm bắt trong `split` đẩy mọi đoạn KHỚP vào chỉ số lẻ, đoạn còn lại vào chỉ số chẵn.
  const parts = text.split(pattern);

  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="bg-remediate/16 rounded-[2px] px-0.5 text-inherit">
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  );
}

/**
 * DB-06 — panel chi tiết khái niệm (Issue #168). Chỉ đọc dữ liệu đồ thị; hai nút ở cuối là
 * điều hướng sang FS-01 / AE-01 (cả hai đang là placeholder — panel chỉ mở đúng route với
 * `planId`/`conceptId` trên query string, không giả định gì về màn hình đích).
 *
 * Tiên quyết/hậu kế nhận qua props thay vì gọi thêm API: `ConceptGraph` đã có toàn bộ đồ thị
 * trong bộ nhớ (đúng như lý do BE bỏ hai trường này khỏi response — xem
 * `ConceptDetailResponse` phía server), nên tính tại đây giữ tên/điểm số khớp với canvas thay
 * vì một bản sao lệch tuổi.
 */
export function ConceptDetailPanel({
  planId,
  conceptId,
  conceptName,
  prerequisites,
  dependents,
  onClose,
}: ConceptDetailPanelProps) {
  const navigate = useNavigate();
  const [detail, setDetail] = useState<ConceptDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  // `ConceptGraph` mounts this panel with `key={conceptId}` (see its call site), so a fresh
  // selection is a fresh component instance — `detail`/`isLoading`/`hasError` already start at
  // the right values without an effect resetting them, which is also what
  // `react-hooks/set-state-in-effect` asks for here.
  useEffect(() => {
    let isMounted = true;

    planApi
      .getConceptDetail(planId, conceptId)
      .then((data) => {
        if (isMounted) setDetail(data);
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
  }, [planId, conceptId]);

  const band = masteryBand(detail?.masteryScore ?? null);
  const scorePercent =
    detail?.masteryScore !== null && detail?.masteryScore !== undefined
      ? Math.round(detail.masteryScore * 100)
      : null;

  return (
    <aside className="w-70 border-border bg-card shadow-soft absolute bottom-0 right-0 top-0 z-10 flex shrink-0 flex-col gap-5 overflow-y-auto border-l p-[22px_22px_26px] lg:static lg:w-80 lg:border-none lg:shadow-none">
      <div>
        <div className="mb-1.5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-heading text-[18px] leading-tight tracking-[-0.01em]">
              {conceptName}
            </h2>
            <Badge tone={BAND_BADGE_TONE[band]} className="mt-1.5">
              {masteryLabel(band)}
            </Badge>
          </div>
          <button
            type="button"
            aria-label="Đóng panel"
            onClick={onClose}
            className="text-muted-foreground hover:bg-accent hover:text-foreground shrink-0 rounded-md p-1 text-lg leading-none transition-colors"
          >
            ×
          </button>
        </div>
        <p className="text-muted-foreground mt-2 font-mono text-[12px]">
          {detail?.lastTestedAt
            ? `last_tested_at · ${formatAbsoluteDate(detail.lastTestedAt)} — ${formatRelativeDays(detail.lastTestedAt)}`
            : isLoading
              ? '…'
              : 'Chưa kiểm tra lần nào'}
        </p>
      </div>

      <div className="bg-border h-px" />

      {isLoading ? (
        <div className="text-muted-foreground flex flex-1 items-center justify-center gap-2 text-[13px]">
          <Spinner className="size-4" />
          Đang tải chi tiết...
        </div>
      ) : hasError ? (
        <p className="text-muted-foreground text-[13px] italic">
          Không tải được chi tiết khái niệm. Vui lòng thử lại.
        </p>
      ) : (
        <>
          <div>
            <div className="mb-1.5 flex items-baseline justify-between font-mono text-[12px]">
              <span className="text-muted-foreground">mastery_score</span>
              {scorePercent !== null ? (
                <b className={`text-[20px] font-semibold ${BAND_TEXT_CLASS[band]}`}>
                  {detail?.masteryScore?.toFixed(2)}
                </b>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </div>
            {scorePercent !== null && (
              <>
                <div className="bg-muted h-1.25 overflow-hidden rounded-full">
                  <div
                    className={`h-full ${BAND_BG_CLASS[band]}`}
                    style={{ width: `${scorePercent}%` }}
                  />
                </div>
                <div className="text-muted-foreground relative mt-1 h-3.5 font-mono text-[10px]">
                  <span
                    className="border-border h-1.25 absolute -top-1.5 border-l"
                    style={{ left: `${MASTERY_THRESHOLD * 100}%` }}
                  />
                  <span
                    className="absolute -translate-x-1/2 whitespace-nowrap"
                    style={{ left: `${MASTERY_THRESHOLD * 100}%` }}
                  >
                    ngưỡng 0.60
                  </span>
                </div>
              </>
            )}
          </div>

          <div>
            <h4 className="text-muted-foreground mb-2.5 text-[11px] font-semibold uppercase tracking-[0.06em]">
              Trích từ tài liệu
            </h4>
            {detail && detail.sources.length > 0 ? (
              <div className="flex flex-col gap-2.5">
                {detail.sources.map((source, idx) => (
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
                        <HighlightedExcerpt text={source.excerpt} term={conceptName} />
                      </blockquote>
                    ) : (
                      <p className="text-muted-foreground text-[12px] italic">
                        Không có trích đoạn.
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-[13px] italic">Không có trích đoạn gốc.</p>
            )}
          </div>

          <div>
            <div className="mb-1 flex items-baseline justify-between">
              <h4 className="text-muted-foreground text-[11px] font-semibold uppercase tracking-[0.06em]">
                Khái niệm tiên quyết
              </h4>
              <span className="text-muted-foreground font-mono text-[12px]">
                {prerequisites.length} quan hệ
              </span>
            </div>
            {prerequisites.length > 0 ? (
              prerequisites.map((c) => <RelatedConceptRow key={c.id} concept={c} />)
            ) : (
              <p className="text-muted-foreground text-[13px] italic">Không có tiên quyết</p>
            )}
          </div>

          <div>
            <div className="mb-1 flex items-baseline justify-between">
              <h4 className="text-muted-foreground text-[11px] font-semibold uppercase tracking-[0.06em]">
                Khái niệm phụ thuộc
              </h4>
              <span className="text-muted-foreground font-mono text-[12px]">
                {dependents.length} quan hệ
              </span>
            </div>
            {dependents.length > 0 ? (
              dependents.map((c) => <RelatedConceptRow key={c.id} concept={c} isBlocked />)
            ) : (
              <p className="text-muted-foreground text-[13px] italic">
                Không có khái niệm phụ thuộc
              </p>
            )}
          </div>

          <div>
            <h4 className="text-muted-foreground mb-1 text-[11px] font-semibold uppercase tracking-[0.06em]">
              Lịch sử học tập
            </h4>
            {detail && detail.history.length > 0 ? (
              detail.history.map((entry) => (
                <div
                  key={`${entry.kind}-${entry.id}`}
                  className="border-border/60 py-2.25 flex items-baseline justify-between gap-2.5 border-b text-[13px] last:border-b-0"
                >
                  <div>
                    {entry.kind === 'interview' ? 'Phiên kiểm tra' : 'Focus Session'}
                    <span className="text-muted-foreground mt-0.5 block font-mono text-[11px]">
                      {formatDayTime(entry.at)}
                      {entry.turnCount !== null && ` · ${entry.turnCount} lượt`}
                      {entry.durationMinutes !== null && ` · ${entry.durationMinutes} phút`}
                    </span>
                  </div>
                  <span
                    className={`font-mono text-[12px] ${entry.score !== null ? BAND_TEXT_CLASS[masteryBand(entry.score)] : 'text-muted-foreground'}`}
                  >
                    {entry.score !== null ? entry.score.toFixed(2) : '—'}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-muted-foreground text-[13px] italic">Chưa có lịch sử học tập.</p>
            )}
          </div>

          <div className="border-border mt-auto flex flex-col gap-2 border-t pt-5">
            <Button onClick={() => navigate(`/focus?planId=${planId}&conceptId=${conceptId}`)}>
              Học lại khái niệm này
            </Button>
            <Button
              variant="secondary"
              onClick={() => navigate(`/interview?planId=${planId}&conceptId=${conceptId}`)}
            >
              Kiểm tra ngay
            </Button>
          </div>
        </>
      )}
    </aside>
  );
}
