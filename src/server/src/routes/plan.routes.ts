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
  addPlanDocumentsController,
} from '../controllers/plan.controller';
import { graphRouter } from './graph.routes';
import { conceptRouter } from './concept.routes';
import { documentRouter } from './document.routes';
import { MAX_FILES_PER_PLAN } from '../config/upload-limits';

const planRouter = Router();

// All plan routes are protected via authMiddleware when mounted in app.ts
// `upload.fields`, not `upload.array`: the current client posts `files[]`, while an
// un-redeployed client (and seven backend tests) still post a single `file`. Accepting both
// field names costs one line here and removes a whole class of "FE and BE deployed out of step"
// 400s. `changePlanDocument` below stays `upload.single` — replacing a document is still
// one-file-in, one-file-out.
planRouter.post(
  '/',
  upload.fields([
    { name: 'files', maxCount: MAX_FILES_PER_PLAN },
    { name: 'file', maxCount: 1 },
  ]),
  asyncHandler(createPlanController)
);
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
// plan's file (SP-04), the ones here *add* files (§4) and *read* one back by id (#203).
//
// POST is declared on the parent router rather than inside documentRouter for one reason:
// `documentRouter.post('/')` would be reachable at the same path, but `endpoints.ts:43-46`
// records a route-ORDER trap on nested routers, and a bare '/' inside a mounted router is
// exactly the shape that trap bites. Explicit path here, no ambiguity.
planRouter.post(
  '/:id/documents',
  upload.fields([
    { name: 'files', maxCount: MAX_FILES_PER_PLAN },
    { name: 'file', maxCount: 1 },
  ]),
  asyncHandler(addPlanDocumentsController)
);
planRouter.use('/:id/documents', documentRouter);

export { planRouter };
