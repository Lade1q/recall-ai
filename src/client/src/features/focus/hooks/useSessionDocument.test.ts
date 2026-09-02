import { renderHook, act, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSessionDocument } from './useSessionDocument';
import { planApi } from '@/features/study-planner/api/plan.api';
import type {
  ConceptDetail,
  ConceptDocumentSummary,
  ConceptSourceExcerpt,
} from '@/features/study-planner/types/concept';

vi.mock('@/features/study-planner/api/plan.api', () => ({
  planApi: { getConceptDetail: vi.fn() },
}));

const getConceptDetail = vi.mocked(planApi.getConceptDetail);

function source(over: Partial<ConceptSourceExcerpt> = {}): ConceptSourceExcerpt {
  return {
    documentId: 'doc-1',
    filename: 'ctdl.pdf',
    kind: 'pdf',
    pageFrom: 41,
    pageTo: 43,
    excerpt: 'Ngăn xếp là cấu trúc LIFO.',
    ...over,
  };
}

function detail(
  sources: ConceptSourceExcerpt[],
  document: ConceptDocumentSummary | null = {
    documentId: 'doc-1',
    filename: 'ctdl.pdf',
    kind: 'pdf',
  }
): ConceptDetail {
  return {
    id: 'c-1',
    name: 'Stack',
    difficulty: 2,
    masteryScore: null,
    lastTestedAt: null,
    isRemediating: false,
    remediationReason: null,
    document,
    sources,
    history: [],
  };
}

// Dispatch from an element the way a browser does — a real keydown's target is the focused
// element (or <body>), never the document — so `e.target.closest(...)` in the handler has a node
// to walk up from.
function press(key: string) {
  act(() => {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  });
}

function setup(args: { planId?: string | null; conceptId?: string; taken?: boolean } = {}) {
  const props = {
    planId: args.planId === undefined ? 'plan-1' : args.planId,
    conceptId: args.conceptId ?? 'c-1',
    isStageTakenOver: args.taken ?? false,
  };
  const hook = renderHook((p: typeof props) => useSessionDocument(p), { initialProps: props });
  return hook;
}

beforeEach(() => {
  getConceptDetail.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useSessionDocument — data + level machine', () => {
  it('fetches the concept detail once and sorts sources by pageFrom', async () => {
    getConceptDetail.mockResolvedValue(
      detail([source({ pageFrom: 43 }), source({ pageFrom: 12 }), source({ pageFrom: null })])
    );
    const { result } = setup();

    await waitFor(() => expect(result.current.unavailableReasons.excerpt).toBeNull());

    expect(result.current.sources.map((s) => s.pageFrom)).toEqual([12, 43, null]);
    expect(getConceptDetail).toHaveBeenCalledTimes(1);
  });

  it('does not refetch when the level changes', async () => {
    getConceptDetail.mockResolvedValue(detail([source()]));
    const { result } = setup();
    await waitFor(() => expect(result.current.unavailableReasons.excerpt).toBeNull());

    act(() => result.current.setLevel('excerpt'));
    act(() => result.current.setLevel('fulltext'));

    expect(getConceptDetail).toHaveBeenCalledTimes(1);
    expect(result.current.level).toBe('fulltext');
  });

  it('starts hidden and never restores a previous choice on its own', async () => {
    getConceptDetail.mockResolvedValue(detail([source()]));
    const { result } = setup();
    await waitFor(() => expect(result.current.unavailableReasons.excerpt).toBeNull());

    expect(result.current.level).toBe('hidden');
  });
});

describe('useSessionDocument — independent excerpt and full-text availability', () => {
  it('locks only the excerpt when a concept has no source anchors', async () => {
    getConceptDetail.mockResolvedValue(detail([]));
    const { result } = setup();

    await waitFor(() => expect(result.current.unavailableReasons.excerpt).toBe('no-sources'));
    expect(result.current.unavailableReasons.fulltext).toBeNull();

    act(() => result.current.setLevel('excerpt'));
    expect(result.current.selectedLevel).toBe('hidden');
    act(() => result.current.setLevel('fulltext'));

    expect(result.current.level).toBe('fulltext');
    expect(result.current.fullTextSource).toEqual({
      documentId: 'doc-1',
      filename: 'ctdl.pdf',
      kind: 'pdf',
      pageFrom: null,
    });
  });

  it('reports fetch-failed when the detail call rejects', async () => {
    getConceptDetail.mockRejectedValue(new Error('network'));
    const { result } = setup();

    await waitFor(() =>
      expect(result.current.unavailableReasons).toEqual({
        excerpt: 'fetch-failed',
        fulltext: 'fetch-failed',
      })
    );
  });

  it('locks both levels for a plan-less session without calling the API', async () => {
    const { result } = setup({ planId: null });

    expect(result.current.unavailableReasons).toEqual({
      excerpt: 'no-sources',
      fulltext: 'no-document',
    });
    expect(getConceptDetail).not.toHaveBeenCalled();
  });

  it('locks full text when the plan truly has no document', async () => {
    getConceptDetail.mockResolvedValue(detail([], null));
    const { result } = setup();

    await waitFor(() => expect(result.current.unavailableReasons.fulltext).toBe('no-document'));

    act(() => result.current.setLevel('fulltext'));
    expect(result.current.level).toBe('hidden');
  });
});

describe('useSessionDocument — the D shortcut', () => {
  it('cycles hidden -> excerpt -> fulltext -> hidden', async () => {
    getConceptDetail.mockResolvedValue(detail([source()]));
    const { result } = setup();
    await waitFor(() => expect(result.current.unavailableReasons.excerpt).toBeNull());

    press('d');
    expect(result.current.level).toBe('excerpt');
    press('D');
    expect(result.current.level).toBe('fulltext');
    press('d');
    expect(result.current.level).toBe('hidden');
  });

  it('skips the locked excerpt and opens full text when a concept has no sources', async () => {
    getConceptDetail.mockResolvedValue(detail([]));
    const { result } = setup();
    await waitFor(() => expect(result.current.unavailableReasons.excerpt).toBe('no-sources'));

    press('d');
    expect(result.current.level).toBe('fulltext');
    press('d');
    expect(result.current.level).toBe('hidden');
  });

  it('is inert while the stage is taken over by a break', async () => {
    getConceptDetail.mockResolvedValue(detail([source()]));
    const { result, rerender } = setup();
    await waitFor(() => expect(result.current.unavailableReasons.excerpt).toBeNull());

    act(() => result.current.setLevel('excerpt'));
    rerender({ planId: 'plan-1', conceptId: 'c-1', isStageTakenOver: true });

    press('d');
    // selectedLevel stays put; the key is ignored while hidden by the break.
    expect(result.current.selectedLevel).toBe('excerpt');
  });
});

describe('useSessionDocument — break hides but preserves the level', () => {
  it('forces hidden while taken over, then restores the chosen level', async () => {
    getConceptDetail.mockResolvedValue(detail([source()]));
    const { result, rerender } = setup();
    await waitFor(() => expect(result.current.unavailableReasons.excerpt).toBeNull());

    act(() => result.current.setLevel('fulltext'));
    expect(result.current.level).toBe('fulltext');

    rerender({ planId: 'plan-1', conceptId: 'c-1', isStageTakenOver: true });
    expect(result.current.level).toBe('hidden');
    expect(result.current.selectedLevel).toBe('fulltext');

    rerender({ planId: 'plan-1', conceptId: 'c-1', isStageTakenOver: false });
    expect(result.current.level).toBe('fulltext');
  });
});
