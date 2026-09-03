-- Backfills `concepts.primary_document_id` for plans analysed before the topic layer existed.
--
-- Scope is deliberately narrow: ONLY plans holding exactly one document. For those the answer is
-- not a guess — one file is one topic, so the plan's single document is the only topic a concept
-- of that plan could belong to.
--
-- Plans with MORE than one document are left alone even when their concepts are NULL. There the
-- earliest document is a plausible-sounding but wrong answer: it would file every concept of the
-- subject under one topic and leave the other topics empty, which reads on screen as "the AI put
-- everything in chapter 1" rather than as "we do not know". NULL already has a truthful rendering
-- — the "Chưa xếp chủ đề" bucket — so not knowing stays not knowing.
-- Measured on the dev database 2026-09-03: 102 NULL concepts, 99 under single-document plans,
-- 0 under multi-document plans, 3 under a plan with no documents at all.
--
-- `updated_at` is intentionally NOT touched. `@updatedAt` is a Prisma-client behaviour, so raw SQL
-- leaves it alone, and that is the wanted outcome: this migration changes an internal grouping
-- key, not anything the student authored.

BEGIN;

UPDATE "concepts" c
SET "primary_document_id" = d."id"
FROM "documents" d
WHERE c."primary_document_id" IS NULL
  AND d."plan_id" = c."plan_id"
  AND (SELECT count(*) FROM "documents" d2 WHERE d2."plan_id" = c."plan_id") = 1;

COMMIT;
