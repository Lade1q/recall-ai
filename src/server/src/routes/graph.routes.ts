import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { updatePlanGraphController } from '../controllers/graph.controller';

// mergeParams so `:id` from the parent plan router stays visible to the controller.
const graphRouter = Router({ mergeParams: true });

graphRouter.put('/', asyncHandler(updatePlanGraphController));

export { graphRouter };
