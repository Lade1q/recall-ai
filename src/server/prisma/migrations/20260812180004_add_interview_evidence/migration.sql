-- CreateEnum
CREATE TYPE "EvidenceStatus" AS ENUM ('covered', 'contradicted');

-- CreateTable
CREATE TABLE "interview_evidence" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "concept_id" UUID NOT NULL,
    "checkpoint_id" UUID NOT NULL,
    "checkpoint_text" VARCHAR(300) NOT NULL,
    "status" "EvidenceStatus" NOT NULL,
    "quote" TEXT,
    "turn_ref" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interview_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "interview_evidence_concept_id_idx" ON "interview_evidence"("concept_id");

-- CreateIndex
CREATE UNIQUE INDEX "interview_evidence_session_id_concept_id_checkpoint_id_key" ON "interview_evidence"("session_id", "concept_id", "checkpoint_id");

-- AddForeignKey
ALTER TABLE "interview_evidence" ADD CONSTRAINT "interview_evidence_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "interview_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_evidence" ADD CONSTRAINT "interview_evidence_concept_id_fkey" FOREIGN KEY ("concept_id") REFERENCES "concepts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

