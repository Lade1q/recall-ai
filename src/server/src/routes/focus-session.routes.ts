import { Router } from 'express';
import {
  createFocusSessionController,
  endFocusSessionController,
  listFocusSessionsController,
} from '../controllers/focus-session.controller';
import {
  createSessionNoteController,
  deleteSessionNoteController,
  listSessionNotesController,
  updateSessionNoteController,
} from '../controllers/session-note.controller';
import { asyncHandler } from '../middleware/errorHandler';

const focusSessionRouter = Router();

focusSessionRouter.post('/', asyncHandler(createFocusSessionController));
focusSessionRouter.get('/', asyncHandler(listFocusSessionsController));
focusSessionRouter.patch('/:id', asyncHandler(endFocusSessionController));

// FS-05 ghi chú nhanh — lồng dưới `:id` để dùng lại kiểm quyền sở hữu phiên một chỗ (#228).
focusSessionRouter.post('/:id/notes', asyncHandler(createSessionNoteController));
focusSessionRouter.get('/:id/notes', asyncHandler(listSessionNotesController));
focusSessionRouter.patch('/:id/notes/:noteId', asyncHandler(updateSessionNoteController));
focusSessionRouter.delete('/:id/notes/:noteId', asyncHandler(deleteSessionNoteController));

export { focusSessionRouter };
