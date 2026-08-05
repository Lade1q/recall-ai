-- AlterTable: `documents.updated_at` is what makes "the file was replaced after the question was
-- asked" checkable (#240). SP-04 change-document updates the row in place, keeping its `id`, so
-- without this column a stale citation points at a different file and still looks valid.
--
-- Added in three steps rather than one: Prisma's own `ADD COLUMN ... NOT NULL` cannot run on a
-- table that already has rows. Existing documents are backfilled from `created_at` — never
-- touched since they were uploaded is the honest reading, and dating them to the migration
-- instead would hide every citation asked before today.
ALTER TABLE "documents" ADD COLUMN "updated_at" TIMESTAMP(3);
UPDATE "documents" SET "updated_at" = "created_at" WHERE "updated_at" IS NULL;
ALTER TABLE "documents" ALTER COLUMN "updated_at" SET NOT NULL;

-- AlterTable: the C5 source anchor frozen onto a turn at ask time. Nullable and deliberately
-- not backfilled — a turn asked before this migration has no record of which document it came
-- from, and guessing one back from the concept's current anchor is exactly the fabricated
-- citation this issue exists to remove.
ALTER TABLE "interview_turns" ADD COLUMN     "source_document_id" UUID,
ADD COLUMN     "source_page_from" INTEGER,
ADD COLUMN     "source_page_to" INTEGER;
