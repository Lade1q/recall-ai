import { sessionMasteryScore } from './mastery';

/**
 * The learning history of ONE concept, as the DB-06 detail panel lists it (Issue #168):
 * every interview session that asked about it, and every focus session that had it on the
 * desk, in one reverse-chronological list.
 *
 * Pure — no Prisma, no clock, no `Date.now()`. `concept.service.ts` fetches the rows; this
 * file decides what counts as an entry and how two sources with nothing in common get
 * ordered together, so the decision stays provable with the database switched off (SDP
 * risk R05, see the DoD of #122/#123).
 */

/** One graded (or ungraded) question about the concept, straight from `interview_turns`. */
export interface InterviewTurnRow {
  sessionId: string;
  turnIndex: number;
  askedAt: Date;
  /** `null` when the turn was never answered, or the AI could not grade it. */
  score: number | null;
}

/** One Pomodoro session that listed the concept in `concept_ids`. */
export interface FocusSessionRow {
  id: string;
  startedAt: Date;
  /** Time actually studied, pauses excluded (FS-03). */
  durationMinutes: number;
}

export interface ConceptHistoryEntry {
  kind: 'interview' | 'focus';
  /** The session id — stable across refetches, so the client can key a list on it. */
  id: string;
  at: Date;
  /**
   * The mastery that interview session produced. `null` for a focus session (which measures
   * time, not correctness) and for an interview whose turns were all ungraded.
   */
  score: number | null;
  /** Questions asked about this concept in that session — interview only. */
  turnCount: number | null;
  /** Minutes studied — focus only. */
  durationMinutes: number | null;
}

/**
 * Folds interview turns and focus sessions into one list, newest first.
 *
 * Turns collapse per session rather than per question: the panel's row is "phiên kiểm tra,
 * 3 lượt, 0.42", which is the unit the student remembers taking. An entry is timestamped by
 * its **last** turn — the closest available stand-in for the moment
 * `finalizeConceptResult` stamped `last_tested_at`, and monotone with it, so the top row of
 * the history never contradicts the `last_tested_at` printed above it.
 *
 * Ties break interview-before-focus: if both landed on the same instant, the one carrying a
 * score is the more informative row to read first.
 */
export function buildConceptHistory(
  turns: readonly InterviewTurnRow[],
  focusSessions: readonly FocusSessionRow[],
  limit = 10
): ConceptHistoryEntry[] {
  const turnsBySession = new Map<string, InterviewTurnRow[]>();
  for (const turn of turns) {
    const existing = turnsBySession.get(turn.sessionId);
    if (existing) existing.push(turn);
    else turnsBySession.set(turn.sessionId, [turn]);
  }

  const interviewEntries: ConceptHistoryEntry[] = [...turnsBySession].map(
    ([sessionId, sessionTurns]) => ({
      kind: 'interview',
      id: sessionId,
      at: new Date(Math.max(...sessionTurns.map((turn) => turn.askedAt.getTime()))),
      score: sessionMasteryScore(sessionTurns),
      turnCount: sessionTurns.length,
      durationMinutes: null,
    })
  );

  const focusEntries: ConceptHistoryEntry[] = focusSessions.map((session) => ({
    kind: 'focus',
    id: session.id,
    at: session.startedAt,
    score: null,
    turnCount: null,
    durationMinutes: session.durationMinutes,
  }));

  return [...interviewEntries, ...focusEntries]
    .sort((a, b) => {
      const byTime = b.at.getTime() - a.at.getTime();
      if (byTime !== 0) return byTime;
      return a.kind === b.kind ? 0 : a.kind === 'interview' ? -1 : 1;
    })
    .slice(0, limit);
}
