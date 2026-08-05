import { Router } from 'express';
import {
  createFocusSessionController,
  endFocusSessionController,
  listFocusSessionsController,
} from '../controllers/focus-session.controller';
import { asyncHandler } from '../middleware/errorHandler';

const focusSessionRouter = Router();

focusSessionRouter.post('/', asyncHandler(createFocusSessionController));
focusSessionRouter.get('/', asyncHandler(listFocusSessionsController));
focusSessionRouter.patch('/:id', asyncHandler(endFocusSessionController));

export { focusSessionRouter };
