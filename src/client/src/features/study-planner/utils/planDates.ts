/**
 * Deadline formatting for plan cards.
 *
 * A deadline is a *calendar day*, not an instant: the API stores the day the student chose as
 * `23:59:59.999Z`. Reading it in the browser's own timezone would push a 30/07 deadline into
 * 31/07 for anyone east of UTC, so everything here works in UTC deliberately.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** The `yyyy-mm-dd` a timestamp falls on in UTC. */
function utcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Midnight UTC of the day a timestamp falls on, so two days differ by whole multiples of a day. */
function utcMidnight(date: Date): number {
  return Date.parse(`${utcDateKey(date)}T00:00:00.000Z`);
}

/**
 * The deadline as `dd/mm`, matching the density of the rest of the card's meta line.
 * Built from the UTC parts rather than `toLocaleDateString`, whose `vi-VN` separator is a
 * hyphen (`15-08`) — the mockup and every other date on the screen use a slash.
 */
export function formatDeadlineShort(deadline: string): string {
  const date = new Date(deadline);
  if (Number.isNaN(date.getTime())) return '';
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${day}/${month}`;
}

/**
 * Whole days from today to the deadline. `0` is today, negative means overdue.
 * Returns `null` for an unparseable date rather than guessing.
 */
export function daysUntilDeadline(deadline: string, now: Date = new Date()): number | null {
  const date = new Date(deadline);
  if (Number.isNaN(date.getTime())) return null;
  return Math.round((utcMidnight(date) - utcMidnight(now)) / MS_PER_DAY);
}

/** How long is left, phrased for a student rather than as a raw number. */
export function formatTimeLeft(deadline: string, now: Date = new Date()): string | null {
  const days = daysUntilDeadline(deadline, now);
  if (days === null) return null;
  if (days < 0) return `quá hạn ${Math.abs(days)} ngày`;
  if (days === 0) return 'hạn hôm nay';
  if (days === 1) return 'còn 1 ngày';
  return `còn ${days} ngày`;
}

/** `m:ss` since the analysis job was queued — the clock on an "Đang phân tích" card. */
export function formatElapsed(startedAt: string, now: Date = new Date()): string | null {
  const start = new Date(startedAt);
  if (Number.isNaN(start.getTime())) return null;
  const totalSeconds = Math.max(0, Math.floor((now.getTime() - start.getTime()) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
