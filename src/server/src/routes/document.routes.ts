import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { getPlanDocumentFileController } from '../controllers/document.controller';

// mergeParams so `:id` from the parent plan router stays visible to the controller —
// same pattern as concept.routes.ts.
const documentRouter = Router({ mergeParams: true });

documentRouter.get('/:documentId', asyncHandler(getPlanDocumentFileController));

export { documentRouter };
