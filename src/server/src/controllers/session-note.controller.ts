import { Request, Response } from 'express';
import {
  createSessionNote,
  deleteSessionNote,
  listSessionNotes,
  updateSessionNote,
} from '../services/session-note.service';
import {
  createSessionNoteSchema,
  sessionNoteParamSchema,
  sessionNoteSessionParamSchema,
  updateSessionNoteSchema,
} from '../schemas/session-note.schema';
import { AppError } from '../middleware/errorHandler';

export async function createSessionNoteController(req: Request, res: Response): Promise<void> {
  if (!req.userId) {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  }

  const { id } = sessionNoteSessionParamSchema.parse(req.params);
  const input = createSessionNoteSchema.parse(req.body);
  const note = await createSessionNote(req.userId, id, input);

  res.status(201).json({ success: true, data: note });
}

export async function listSessionNotesController(req: Request, res: Response): Promise<void> {
  if (!req.userId) {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  }

  const { id } = sessionNoteSessionParamSchema.parse(req.params);
  const notes = await listSessionNotes(req.userId, id);

  res.status(200).json({ success: true, data: notes });
}

export async function updateSessionNoteController(req: Request, res: Response): Promise<void> {
  if (!req.userId) {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  }

  const { id, noteId } = sessionNoteParamSchema.parse(req.params);
  const input = updateSessionNoteSchema.parse(req.body);
  const note = await updateSessionNote(req.userId, id, noteId, input);

  res.status(200).json({ success: true, data: note });
}

export async function deleteSessionNoteController(req: Request, res: Response): Promise<void> {
  if (!req.userId) {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  }

  const { id, noteId } = sessionNoteParamSchema.parse(req.params);
  await deleteSessionNote(req.userId, id, noteId);

  res.status(204).send();
}
