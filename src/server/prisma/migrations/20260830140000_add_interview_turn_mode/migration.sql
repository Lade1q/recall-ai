-- CreateEnum
CREATE TYPE "TurnMode" AS ENUM ('initial', 'deeper', 'probe', 'hint');

-- AlterTable
-- Nullable and WITHOUT a default on purpose. A default would make every `cache_fallback` row
-- claim a rung of the AI ladder it never stood on, and `resolveFallbackStep` deliberately has no
-- hint step. NULL means "not on the ladder" — which `countsTowardMastery` reads as "counts".
ALTER TABLE "interview_turns" ADD COLUMN "mode" "TurnMode";

-- Backfill (#392): re-derive which historical turns were hint turns.
--
-- A hint turn is the one asked right after a `wrong` verdict on the same concept in the same
-- session, and only on the AI path. Everything else stays NULL — including the first turn of a
-- concept, any turn following a `deep`/`shallow` verdict, and every `cache_fallback` turn.
--
-- `interview_turns` has no `@updatedAt` column (only `asked_at DEFAULT now()` and `answered_at`),
-- so this UPDATE bumps no timestamp and cannot disturb anything that reads recency.
--
-- Note what holds the predicate up: it constrains `t.source = 'ai'` but NOT `p.source`. That is
-- safe only because `InterviewSession.fallbackMode` is a ONE-WAY latch — two writes of `true`,
-- none of `false` — so within a session an `ai` turn can never follow a `cache_fallback` one. If
-- fallback ever becomes recoverable, this predicate starts matching pairs it was never meant to,
-- and nothing here would say so.
--
-- Count with `data: {`, NOT with `fallbackMode: true`: the latter also matches Prisma `select`
-- blocks, and that one grep has now produced three different published numbers (4 → 3 → 2) for
-- the same fact. `@default(false)` in the schema is the initial state, not a reset.
UPDATE "interview_turns" AS t
SET "mode" = 'hint'
FROM "interview_turns" AS p
WHERE p."session_id" = t."session_id"
  AND p."concept_id" = t."concept_id"
  AND p."turn_index" = t."turn_index" - 1
  AND p."verdict" = 'wrong'
  AND t."source" = 'ai';
