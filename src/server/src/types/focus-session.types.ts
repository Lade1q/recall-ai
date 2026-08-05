import { FocusSessionStatus } from '@prisma/client';

/** Response shape for POST /focus-sessions (FS-01, bước 3-6). */
export interface CreateFocusSessionResponse {
  id: string;
  planId: string | null;
  conceptIds: string[];
  status: FocusSessionStatus;
  strictMode: boolean;
  startedAt: Date;
}

/** Response shape for PATCH /focus-sessions/:id (FS-01 Alt flow 1/3/4). */
export interface EndFocusSessionResponse {
  id: string;
  status: FocusSessionStatus;
  durationMinutes: number;
  focusedSeconds: number;
  awayCount: number;
  pomodorosCompleted: number;
  strictMode: boolean;
  startedAt: Date;
  endedAt: Date;
}

/** One concept studied in a session, resolved from `concept_ids` for the FS-03 history list. */
export interface FocusSessionConceptSummary {
  id: string;
  name: string;
}

/** One row of GET /focus-sessions (FS-03 "Lịch sử & Tiến độ"). */
export interface FocusSessionListItem {
  id: string;
  planId: string | null;
  concepts: FocusSessionConceptSummary[];
  status: FocusSessionStatus;
  durationMinutes: number;
  focusedSeconds: number;
  awayCount: number;
  pomodorosCompleted: number;
  strictMode: boolean;
  startedAt: Date;
  endedAt: Date | null;
}

/** Pomodoro config stored at `users.pomodoro_config` (FS-02). */
export interface PomodoroConfig {
  work: number;
  short_break: number;
  long_break: number;
  cycles: number;
  sound: boolean;
}
