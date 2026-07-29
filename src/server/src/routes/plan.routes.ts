import { Router } from 'express';
import { upload } from '../middleware/upload.middleware';
import { asyncHandler } from '../middleware/errorHandler';
import {
  createPlanController,
  listPlansController,
  getPlanByIdController,
} from '../controllers/plan.controller';
import { graphRouter } from './graph.routes';

const planRouter = Router();

// All plan routes are protected via authMiddleware when mounted in app.ts
planRouter.post('/', upload.single('file'), asyncHandler(createPlanController));
planRouter.get('/', asyncHandler(listPlansController));
planRouter.get('/:id', asyncHandler(getPlanByIdController));
planRouter.use('/:id/graph', graphRouter);

export { planRouter };
