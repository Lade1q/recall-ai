import { Request, Response } from 'express';
import { getConceptDetail } from '../services/concept-detail.service';
import { conceptDetailParamsSchema } from '../schemas/plan.schema';
import { AppError } from '../middleware/errorHandler';

/**
 * GET /api/v1/plans/:id/concepts/:conceptId
 * DB-06's detail panel (Issue #168): mastery/remediation state, source excerpts, and
 * learning history for one concept. Read-only — see `concept-detail.service.ts`.
 */
export async function getConceptDetailController(req: Request, res: Response): Promise<void> {
  if (!req.userId) {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  }

  // mergeParams on the router makes `id` (the plan) visible alongside `conceptId` here.
  // Cả hai đều là @db.Uuid: validate UUID trước khi chạm Prisma, nếu không một id sai định
  // dạng ném P2023 chưa được map → 500 thay vì 400 (đúng lỗi PR #191 đã vá cho các route
  // /plans khác). ZodError của .parse() được errorHandler map sẵn về 400.
  const { id, conceptId } = conceptDetailParamsSchema.parse(req.params);

  const concept = await getConceptDetail(id, conceptId, req.userId);

  res.status(200).json({
    success: true,
    data: concept,
  });
}
