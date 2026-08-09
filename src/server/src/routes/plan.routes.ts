import { Router } from 'express';
import { upload } from '../middleware/upload.middleware';
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
import { documentRouter } from './document.routes';

const planRouter = Router();

// All plan routes are protected via authMiddleware when mounted in app.ts
planRouter.post('/', upload.single('file'), asyncHandler(createPlanController));
planRouter.get('/', asyncHandler(listPlansController));
planRouter.get('/:id', asyncHandler(getPlanByIdController));
planRouter.post('/:id/retry', asyncHandler(retryPlanController));
planRouter.post('/:id/document', upload.single('file'), asyncHandler(changePlanDocumentController));
planRouter.post('/:id/reanalyze', asyncHandler(reanalyzePlanController));
planRouter.patch('/:id', asyncHandler(updatePlanStatusController));
planRouter.delete('/:id', asyncHandler(deletePlanController));
planRouter.use('/:id/graph', graphRouter);
planRouter.use('/:id/concepts', conceptRouter);
// Plural, and distinct from the singular POST '/:id/document' above: that one *replaces* the
// plan's file (SP-04), this one *reads* one back by id (#203).
planRouter.use('/:id/documents', documentRouter);

export { planRouter };
