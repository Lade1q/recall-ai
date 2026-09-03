import { z } from 'zod';

/**
 * Body of `PUT /api/v1/plans/:id/graph` — the full desired end state of the graph,
 * not a delta. Nodes are addressed by concept name (unique within a plan), so the
 * frontend can reference a concept it just drew before the server has assigned an id.
 *
 * `confirm` separates two calls that share this same endpoint: the editor re-sends the
 * whole graph after every edit to get a live DAG check (`confirm: false`, the default),
 * and sends `confirm: true` only for the explicit "Confirm Graph" action that is allowed
 * to move the plan from draft to active (I3.5).
 */
export const replaceGraphSchema = z.object({
  concepts: z.array(
    z.object({
      name: z.string().trim().min(1, 'Concept name is required').max(255),
      difficulty: z.number().int().min(1).max(5).optional(),
      /**
       * Which document (= topic) a NEWLY created concept belongs under.
       *
       * Only read for a name the plan does not already hold; an existing concept keeps the topic
       * it was extracted into, so re-sending the whole graph cannot shuffle the topic layer.
       *
       * Without this, a concept the student adds while a topic is open lands with
       * `primary_document_id = NULL` and disappears from the very topic they added it to —
       * silently, since it reappears only in the "Chưa xếp chủ đề" bucket.
       */
      primaryDocumentId: z.string().uuid().optional(),
    })
  ),
  edges: z.array(
    z.object({
      from: z.string().trim().min(1),
      to: z.string().trim().min(1),
    })
  ),
  /**
   * The topic layer: which document should be studied before which, by document id.
   *
   * **OPTIONAL, and its absence is not "no edges"** — it means "leave the topic layer exactly as
   * it is". That distinction is the whole safety of this field: the editor's live DAG re-check
   * re-sends the concept graph on every keystroke and knows nothing about topics, so treating a
   * missing field as an empty list would wipe the study order between documents on the first
   * edit, silently, with the arrows nowhere on screen at that moment.
   *
   * Sent as `[]` only by a caller that means it — a student who deleted the last topic arrow.
   */
  documentEdges: z
    .array(
      z.object({
        from: z.string().uuid(),
        to: z.string().uuid(),
      })
    )
    .optional(),
  confirm: z.boolean().optional().default(false),
});

export type ReplaceGraphInput = z.infer<typeof replaceGraphSchema>;
