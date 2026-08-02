import { Router } from 'express';
import { upload, enforceFileSizeLimit } from '../middleware/upload.middleware';
import { asyncHandler } from '../middleware/errorHandler';
import {
  createPlanController,
  listPlansController,
  getPlanByIdController,
  retryPlanController,
  changePlanDocumentController,
  reanalyzePlanController,
  updatePlanStatusController,
  deletePlanController,
} from '../controllers/plan.controller';
import { graphRouter } from './graph.routes';
import { conceptRouter } from './concept.routes';

const planRouter = Router();

// All plan routes are protected via authMiddleware when mounted in app.ts
planRouter.post(
  '/',
  upload.single('file'),
  enforceFileSizeLimit,
  asyncHandler(createPlanController)
);
planRouter.get('/', asyncHandler(listPlansController));
planRouter.get('/:id', asyncHandler(getPlanByIdController));
planRouter.post('/:id/retry', asyncHandler(retryPlanController));
planRouter.post(
  '/:id/document',
  upload.single('file'),
  enforceFileSizeLimit,
  asyncHandler(changePlanDocumentController)
);
planRouter.post('/:id/reanalyze', asyncHandler(reanalyzePlanController));
planRouter.patch('/:id', asyncHandler(updatePlanStatusController));
planRouter.delete('/:id', asyncHandler(deletePlanController));
planRouter.use('/:id/graph', graphRouter);
planRouter.use('/:id/concepts', conceptRouter);

export { planRouter };
