import apiClient from '@/lib/apiClient';
import { ENDPOINTS } from '@/lib/endpoints';
import type { SessionNote } from '../types/focus.types';

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

/** Client cho 4 endpoint ghi chú nhanh lồng dưới `/focus-sessions/:id` (#228 · FS-05). */
export const sessionNoteApi = {
  list: async (sessionId: string): Promise<SessionNote[]> => {
    const response = await apiClient.get<ApiEnvelope<SessionNote[]>>(
      ENDPOINTS.FOCUS_SESSIONS.NOTES(sessionId)
    );
    return response.data.data;
  },

  create: async (
    sessionId: string,
    payload: { conceptId: string; body: string }
  ): Promise<SessionNote> => {
    const response = await apiClient.post<ApiEnvelope<SessionNote>>(
      ENDPOINTS.FOCUS_SESSIONS.NOTES(sessionId),
      payload
    );
    return response.data.data;
  },

  /** Đường auto-save: cùng một ghi chú được PATCH lại mỗi lần người học gõ tiếp. */
  update: async (sessionId: string, noteId: string, body: string): Promise<SessionNote> => {
    const response = await apiClient.patch<ApiEnvelope<SessionNote>>(
      ENDPOINTS.FOCUS_SESSIONS.NOTE(sessionId, noteId),
      { body }
    );
    return response.data.data;
  },

  remove: async (sessionId: string, noteId: string): Promise<void> => {
    await apiClient.delete(ENDPOINTS.FOCUS_SESSIONS.NOTE(sessionId, noteId));
  },
};
