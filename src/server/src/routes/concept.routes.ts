import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { getConceptDetailController } from '../controllers/concept.controller';

// mergeParams so `:id` from the parent plan router stays visible to the controller —
// same pattern as graph.routes.ts.
const conceptRouter = Router({ mergeParams: true });

conceptRouter.get('/:conceptId', asyncHandler(getConceptDetailController));

export { conceptRouter };
