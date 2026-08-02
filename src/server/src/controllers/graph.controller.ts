import { Request, Response } from 'express';
import { replacePlanGraph } from '../services/graph.service';
import { replaceGraphSchema } from '../schemas/graph.schema';
import { planIdParamSchema } from '../schemas/plan.schema';
import { AppError } from '../middleware/errorHandler';

/**
 * PUT /api/v1/plans/:id/graph
 * Saves the concept graph the student confirmed in the editor. The body carries the
 * full desired graph, so the frontend can re-send the canvas after every edit to get
 * a live DAG check. Returns 409 if the submitted graph contains a cycle.
 */
export async function updatePlanGraphController(req: Request, res: Response): Promise<void> {
  if (!req.userId) {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  }

  const { id } = planIdParamSchema.parse(req.params);

  const input = replaceGraphSchema.parse(req.body);
  const graph = await replacePlanGraph(id, req.userId, input);

  res.status(200).json({
    success: true,
    data: graph,
  });
}
