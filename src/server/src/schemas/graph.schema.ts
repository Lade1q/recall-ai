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
    })
  ),
  edges: z.array(
    z.object({
      from: z.string().trim().min(1),
      to: z.string().trim().min(1),
    })
  ),
  confirm: z.boolean().optional().default(false),
});

export type ReplaceGraphInput = z.infer<typeof replaceGraphSchema>;
