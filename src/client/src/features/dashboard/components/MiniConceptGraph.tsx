import { useEffect, useState } from 'react';
import { Heading } from '@/components/ui/heading';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ConceptGraph } from '@/features/study-planner/components/ConceptGraph';
import { MASTERY_BANDS } from '@/features/study-planner/components/MasteryBar';
import { planApi } from '@/features/study-planner/api/plan.api';
import type { PlanDetails, PlanSummary } from '@/features/study-planner/types/concept';

/** Nhãn chú giải (viết hoa) theo từng mức — khác nhãn đếm thường ("14 vững") của `MasteryBar`. */
const LEGEND_LABEL: Record<(typeof MASTERY_BANDS)[number]['key'], string> = {
  strong: 'Vững',
  learning: 'Đang học',
  weak: 'Yếu',
  untested: 'Chưa kiểm tra',
};

/** Chú giải 5 mục: 4 mức mastery (ô đặc) + "Đang được ôn lại" (vòng rỗng, trực giao với mastery). */
function GraphLegend() {
  return (
    <div className="text-muted-foreground mt-3.5 flex flex-wrap gap-x-3.5 gap-y-1.5 text-[11px]">
      {MASTERY_BANDS.map(({ key, color }) => (
        <span key={key} className="inline-flex items-center gap-1.5">
          <i className="rounded-xs block size-2 flex-none" style={{ background: color }} />
          {LEGEND_LABEL[key]}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <i className="border-remediate block size-2 flex-none rounded-[2px] border-2" />
        Đang được ôn lại
      </span>
    </div>
  );
}

interface GraphState {
  detail: PlanDetails | null;
  loading: boolean;
  error: boolean;
}

/**
 * Mini Concept Graph của Dashboard (DB-01 «include» DB-02) — bản xem trước CHỈ ĐỌC quanh điểm
 * yếu hiện tại. Dùng lại `ConceptGraph mode="view" preview` (không fork): node tô theo mastery +
 * mang điểm số, vòng ngoài cho `isRemediating` (đã có sẵn trong `graph.concepts`). Zoom/pan, lọc
 * và panel chi tiết thuộc màn đồ thị đầy đủ — lối ra duy nhất là "Mở đồ thị đầy đủ →".
 */
export function MiniConceptGraph({
  plans,
  defaultPlanId,
}: {
  plans: PlanSummary[];
  defaultPlanId: string | null;
}) {
  const initialId =
    defaultPlanId && plans.some((p) => p.id === defaultPlanId) ? defaultPlanId : plans[0].id;

  const [selectedId, setSelectedId] = useState(initialId);
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState<GraphState>({ detail: null, loading: true, error: false });

  useEffect(() => {
    let alive = true;
    planApi
      .getPlan(selectedId)
      .then((detail) => {
        if (alive) setState({ detail, loading: false, error: false });
      })
      .catch(() => {
        if (alive) setState({ detail: null, loading: false, error: true });
      });
    return () => {
      alive = false;
    };
  }, [selectedId, reloadKey]);

  // Cờ loading bật trong event handler (không phải thân effect), tránh cascading render.
  const selectPlan = (id: string) => {
    if (id === selectedId) return;
    setState({ detail: null, loading: true, error: false });
    setSelectedId(id);
  };
  const retry = () => {
    setState((prev) => ({ ...prev, loading: true, error: false }));
    setReloadKey((k) => k + 1);
  };

  const conceptCount = state.detail?.graph.concepts.length ?? 0;

  return (
    <section className="border-border bg-card sm:px-6.5 rounded-xl border p-6 sm:py-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Heading as="h2" size="card" className="font-semibold">
            Đồ thị khái niệm
          </Heading>
          <p className="text-muted-foreground mt-1 text-[13px]">
            Vùng quanh điểm yếu hiện tại, tô màu theo mastery_score
          </p>
        </div>
        <select
          value={selectedId}
          onChange={(e) => selectPlan(e.target.value)}
          aria-label="Chọn kế hoạch"
          className="border-border bg-card text-foreground focus-visible:ring-ring max-w-[220px] shrink-0 rounded-[calc(var(--radius)*0.7)] border px-2.5 py-1.5 text-[13px] outline-none focus-visible:ring-2"
        >
          {plans.map((plan) => (
            <option key={plan.id} value={plan.id}>
              {plan.name}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4 h-[300px]">
        {state.loading ? (
          <div className="bg-muted size-full animate-pulse rounded-[calc(var(--radius)*0.8)]" />
        ) : state.error ? (
          <div className="border-border bg-muted flex size-full flex-col items-center justify-center gap-3 rounded-[calc(var(--radius)*0.8)] border px-4 text-center">
            <p className="text-muted-foreground text-[13px]">
              Không tải được đồ thị của kế hoạch này.
            </p>
            <Button variant="outline" size="sm" onClick={retry}>
              Thử lại
            </Button>
          </div>
        ) : state.detail ? (
          <ConceptGraph
            // Remount theo kế hoạch: state layout/react-flow bên trong khởi tạo lại sạch cho
            // mỗi đồ thị, không mang node của kế hoạch trước sang.
            key={selectedId}
            planId={selectedId}
            initialConcepts={state.detail.graph.concepts}
            initialEdges={state.detail.graph.edges}
            mode="view"
            preview
          />
        ) : null}
      </div>

      <GraphLegend />

      <div className="border-border mt-4 flex items-center justify-between border-t pt-4 text-[13px]">
        <span className="text-muted-foreground font-mono text-xs tabular-nums">
          {conceptCount} khái niệm
        </span>
        <Link
          to={`/plan/${selectedId}`}
          className="text-foreground font-medium hover:underline hover:underline-offset-[3px]"
        >
          Mở đồ thị đầy đủ →
        </Link>
      </div>
    </section>
  );
}
