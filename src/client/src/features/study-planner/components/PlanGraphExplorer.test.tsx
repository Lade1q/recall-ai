import { fireEvent, render, screen, within, waitFor } from '@/utils/test-utils';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlanGraphExplorer } from './PlanGraphExplorer';
import { Concept, ConceptEdge, PlanDocument, PlanDocumentEdge } from '../types/concept';

const DOCS: PlanDocument[] = [
  { id: 'doc-a', filename: 'LN02 - Software Processes.pdf', pageCount: 55, kind: 'pdf' },
  { id: 'doc-b', filename: 'LN04 - Software Requirements.pdf', pageCount: 36, kind: 'pdf' },
  { id: 'doc-c', filename: 'LN08 - Software Testing.pdf', pageCount: 44, kind: 'pdf' },
];

const TOPIC_EDGES: PlanDocumentEdge[] = [
  { id: 'de-1', fromDocumentId: 'doc-a', toDocumentId: 'doc-b' },
  { id: 'de-2', fromDocumentId: 'doc-b', toDocumentId: 'doc-c' },
];

function concept(id: string, name: string, primaryDocumentId: string | null): Concept {
  return { id, name, mastery_score: null, primaryDocumentId };
}

const CONCEPTS: Concept[] = [
  concept('a1', 'Process', 'doc-a'),
  concept('a2', 'Waterfall', 'doc-a'),
  concept('b1', 'Requirement', 'doc-b'),
  concept('c1', 'Testing', 'doc-c'),
];

const EDGES: ConceptEdge[] = [
  { id: 'e1', source: 'a1', target: 'a2' }, // inside doc-a
  { id: 'e2', source: 'a2', target: 'b1' }, // crosses doc-a -> doc-b
];

// `render` mounts a real router, so `?topic=` written by one case is still on `window.location`
// when the next one mounts — and every later case would silently start on the topic it left
// open. Reset the URL, or the suite measures the wrong screen.
beforeEach(() => {
  window.history.replaceState({}, '', '/');
});

function renderExplorer(props: Partial<Parameters<typeof PlanGraphExplorer>[0]> = {}) {
  return render(
    <PlanGraphExplorer
      planId="plan-1"
      documents={DOCS}
      documentEdges={TOPIC_EDGES}
      concepts={CONCEPTS}
      edges={EDGES}
      mode="view"
      {...props}
    />
  );
}

/**
 * A topic's label now appears twice in edit mode — on its node, and in the review list of AI
 * inferred orders. Scope node lookups to the canvas so a query does not silently start matching
 * the list instead (and so a future third occurrence fails loudly rather than picking one).
 */
function topicNode(label: string): HTMLElement {
  const canvas = document.querySelector('.react-flow');
  if (!canvas) throw new Error('no react-flow canvas rendered');
  return within(canvas as HTMLElement).getByText(label);
}

/**
 * `fireEvent.click`, not `userEvent.click`: userEvent also dispatches `mousedown`, which bubbles
 * to the pane where React Flow has d3-zoom bound, and d3-drag's `nodrag(event.view)` throws on
 * jsdom because `view` is null there. Vitest reports that as an unhandled error and warns it can
 * cause false positives — six of them, one per node click. The product handler under test is a
 * React `onClick`, so dispatching only `click` exercises exactly the same path.
 */
function clickTopic(label: string): void {
  fireEvent.click(topicNode(label));
}

describe('PlanGraphExplorer — degrade', () => {
  it('renders the flat concept graph, with no topic UI, for a single-document plan', () => {
    renderExplorer({ documents: [DOCS[0]!] });

    expect(screen.queryByText(/chủ đề/)).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('Tìm khái niệm theo tên...')).toBeInTheDocument();
  });

  it('renders the flat concept graph for a plan with NO document row', () => {
    renderExplorer({ documents: [] });

    expect(screen.getByPlaceholderText('Tìm khái niệm theo tên...')).toBeInTheDocument();
  });

  it('still shows every topic when the linking pass returned no order at all', () => {
    // The condition is `documents.length`, NOT `documentEdges.length`. Falling back to the flat
    // graph here would hide the fact that the plan holds three files — a different claim from
    // "we do not know their order", which is what actually happened.
    renderExplorer({ documentEdges: [] });

    expect(screen.getByText('Software Processes')).toBeInTheDocument();
    expect(screen.getByText('Software Requirements')).toBeInTheDocument();
    expect(screen.getByText('Software Testing')).toBeInTheDocument();
  });
});

describe('PlanGraphExplorer — navigation', () => {
  it('opens a topic on click and puts it in the URL, so Back returns to the topic layer', async () => {
    renderExplorer();

    clickTopic('Software Testing');

    await waitFor(() => expect(window.location.search).toContain('topic=doc-c'));
    expect(screen.getByText('← Tất cả chủ đề')).toBeInTheDocument();
  });

  it('shows only the concepts of the open topic', async () => {
    renderExplorer();

    clickTopic('Software Processes');

    await waitFor(() => expect(screen.getByText('Process')).toBeInTheDocument());
    expect(screen.getByText('Waterfall')).toBeInTheDocument();
    expect(screen.queryByText('Requirement')).not.toBeInTheDocument();
  });
});

describe('PlanGraphExplorer — the cross-edge notice', () => {
  it('names the number of hidden prerequisite links when there are any', async () => {
    renderExplorer();

    clickTopic('Software Processes');

    // e2 (Waterfall -> Requirement) leaves doc-a, so it is not drawn — and a concept whose
    // prerequisite is invisible must not read as "no prerequisites".
    const notice = await screen.findByTestId('cross-edge-notice');
    expect(notice).toHaveTextContent('1');
    expect(notice).toHaveTextContent('nối sang chủ đề khác');
  });

  it('is ABSENT — not "0 quan hệ" — for the ordinary topic with no cross edges', async () => {
    renderExplorer();

    clickTopic('Software Testing');

    await waitFor(() => expect(screen.getByText('← Tất cả chủ đề')).toBeInTheDocument());
    expect(screen.queryByTestId('cross-edge-notice')).not.toBeInTheDocument();
  });
});

describe('PlanGraphExplorer — merge before PUT', () => {
  /**
   * `PUT /plans/:id/graph` is a full replace that hard-deletes every concept missing from the
   * payload. Sending back what `ConceptGraph` returns — one topic's worth — would permanently
   * delete the other topics.
   *
   * The merge RULES live in `mergeTopicEditIntoGraph` and are measured there, where a deletion
   * or an addition can be expressed directly; deleting a node through this UI means a Delete
   * keypress inside React Flow, which jsdom does not reproduce faithfully. What is measured HERE
   * is the wiring: that the container submits the whole graph rather than the slice it handed
   * down, which is the part a unit test of a pure function cannot see.
   */
  it('keeps cross-topic edges that the open topic never saw', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    // Open doc-b: its only concept is Requirement, and edge e2 arrives from doc-a.
    renderExplorer({ mode: 'edit', onConfirm, confirmLabel: 'Xác nhận' });

    clickTopic('Software Requirements');
    await waitFor(() => expect(screen.getByText('Requirement')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Xác nhận' }));

    await waitFor(() => expect(onConfirm).toHaveBeenCalled());
    const [, submittedEdges] = onConfirm.mock.calls[0] as [Concept[], ConceptEdge[]];

    // e2 was never handed to ConceptGraph, so it cannot come back from it — it survives only
    // because the merge keeps every edge with an end outside the slice.
    expect(submittedEdges.map((e) => e.id)).toContain('e2');
    expect(submittedEdges.map((e) => e.id)).toContain('e1');
  });

  it('submits the untouched graph when confirming from the topic layer', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderExplorer({ mode: 'edit', onConfirm, confirmLabel: 'Xác nhận' });

    await user.click(screen.getByRole('button', { name: 'Xác nhận' }));

    // The third argument is `undefined`, not `[]`: nothing about the topic layer was touched, and
    // an empty list would tell the server to delete every study order between the documents.
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith(CONCEPTS, EDGES, undefined));
  });

  /**
   * 🔴 The review list is the answer to "I checked the dashed arrows, now what?". Striking one
   * out has to reach the payload, and the payload has to be the SURVIVORS — sending the removed
   * one, or sending nothing, both leave the arrow the student rejected in the database.
   */
  it('drops a struck-out topic order from the confirmed payload', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderExplorer({ mode: 'edit', onConfirm, confirmLabel: 'Xác nhận' });

    const list = screen.getByTestId('topic-edge-review-list');
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);

    await user.click(
      within(list).getByRole('button', {
        name: 'Bỏ thứ tự Software Processes trước Software Requirements',
      })
    );
    await user.click(screen.getByRole('button', { name: 'Xác nhận' }));

    await waitFor(() => expect(onConfirm).toHaveBeenCalled());
    const [, , submittedTopicEdges] = onConfirm.mock.calls[0] as [
      Concept[],
      ConceptEdge[],
      { from: string; to: string }[] | undefined,
    ];
    expect(submittedTopicEdges).toEqual([{ from: 'doc-b', to: 'doc-c' }]);
  });

  it('sends an empty list — not undefined — when every order is struck out', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderExplorer({ mode: 'edit', onConfirm, confirmLabel: 'Xác nhận' });

    const list = screen.getByTestId('topic-edge-review-list');
    for (const button of within(list).getAllByRole('button')) {
      await user.click(button);
    }
    await user.click(screen.getByRole('button', { name: 'Xác nhận' }));

    await waitFor(() => expect(onConfirm).toHaveBeenCalled());
    expect(onConfirm.mock.calls[0]?.[2]).toEqual([]);
    expect(screen.queryByTestId('topic-edge-review-list')).not.toBeInTheDocument();
  });

  /** A removal made at the topic layer must survive the trip down into a topic and back out. */
  it('carries a removal through a confirm made from inside a topic', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderExplorer({ mode: 'edit', onConfirm, confirmLabel: 'Xác nhận' });

    await user.click(
      within(screen.getByTestId('topic-edge-review-list')).getByRole('button', {
        name: 'Bỏ thứ tự Software Processes trước Software Requirements',
      })
    );
    clickTopic('Software Testing');
    await waitFor(() => expect(screen.getByText('← Tất cả chủ đề')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Xác nhận' }));

    await waitFor(() => expect(onConfirm).toHaveBeenCalled());
    expect(onConfirm.mock.calls[0]?.[2]).toEqual([{ from: 'doc-b', to: 'doc-c' }]);
  });

  it('has no review list in view mode — nothing there is being decided', () => {
    renderExplorer({ mode: 'view' });

    expect(screen.queryByTestId('topic-edge-review-list')).not.toBeInTheDocument();
  });
});

describe('PlanGraphExplorer — the review strip', () => {
  it('says how many topic links the AI inferred, before the user confirms', () => {
    renderExplorer({ mode: 'edit', onConfirm: vi.fn() });

    const strip = screen.getByTestId('topic-review-strip');
    expect(strip).toHaveTextContent('suy từ mô tả khái niệm');
    expect(strip).toHaveTextContent('2 quan hệ nối giữa các chủ đề');
  });

  it('says plainly that no order was found, rather than showing "0 quan hệ"', () => {
    renderExplorer({ mode: 'edit', onConfirm: vi.fn(), documentEdges: [] });

    const strip = screen.getByTestId('topic-review-strip');
    expect(strip).toHaveTextContent('Chưa xếp được thứ tự học');
    expect(strip).not.toHaveTextContent('suy từ mô tả khái niệm');
  });

  it('does not appear in view mode — there is nothing to confirm there', () => {
    renderExplorer({ mode: 'view' });

    expect(screen.queryByTestId('topic-review-strip')).not.toBeInTheDocument();
  });
});
