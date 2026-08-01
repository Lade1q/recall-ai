/**
 * Turns a caught error into what `AnalysisJob.errorMessage` stores and `GET /plans/:id`
 * returns (Issue #183). Pure — no Prisma, no network — so it's provable from plain values
 * alone (SDP risk R05).
 *
 * Only `error.message` is ever read, never `.stack` and never the error object itself: this
 * codebase's own thrown errors (`AppError`, plain `Error`) carry no request internals in their
 * message, and truncating bounds how much of an unexpected third-party SDK message — which
 * this function has no way to inspect for secrets — can reach a response.
 */

const MAX_ERROR_MESSAGE_LENGTH = 500;

export function toSafeErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.length > MAX_ERROR_MESSAGE_LENGTH ? `${raw.slice(0, MAX_ERROR_MESSAGE_LENGTH)}…` : raw;
}
