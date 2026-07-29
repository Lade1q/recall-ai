-- CreateEnum
CREATE TYPE "InterviewSessionStatus" AS ENUM ('active', 'paused', 'completed', 'abandoned');

-- CreateEnum
CREATE TYPE "TurnVerdict" AS ENUM ('deep', 'shallow', 'wrong');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('recall', 'application', 'why');

-- CreateEnum
CREATE TYPE "TurnSource" AS ENUM ('ai', 'cache_fallback');

-- CreateEnum
CREATE TYPE "FocusSessionStatus" AS ENUM ('running', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "ReviewReason" AS ENUM ('traceback', 'spaced_repetition', 'deadline_priority', 'manual');

-- CreateEnum
CREATE TYPE "ReviewItemStatus" AS ENUM ('pending', 'accepted', 'skipped', 'done');

-- AlterTable
ALTER TABLE "concepts" ADD COLUMN     "last_tested_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "interview_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "status" "InterviewSessionStatus" NOT NULL DEFAULT 'active',
    "concept_queue" JSONB NOT NULL,
    "current_concept_idx" INTEGER NOT NULL DEFAULT 0,
    "max_turns_per_concept" INTEGER NOT NULL DEFAULT 3,
    "fallback_mode" BOOLEAN NOT NULL DEFAULT false,
    "summary_text" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interview_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_turns" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "concept_id" UUID NOT NULL,
    "turn_index" INTEGER NOT NULL,
    "question_text" TEXT NOT NULL,
    "question_type" "QuestionType",
    "answer_text" TEXT,
    "score" DOUBLE PRECISION,
    "feedback" TEXT,
    "verdict" "TurnVerdict",
    "source" "TurnSource" NOT NULL DEFAULT 'ai',
    "asked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answered_at" TIMESTAMP(3),

    CONSTRAINT "interview_turns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "focus_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "plan_id" UUID,
    "concept_ids" JSONB NOT NULL,
    "status" "FocusSessionStatus" NOT NULL DEFAULT 'running',
    "duration_minutes" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),

    CONSTRAINT "focus_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_queue_items" (
    "id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "concept_id" UUID NOT NULL,
    "priority" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reason" "ReviewReason" NOT NULL,
    "source_concept_id" UUID,
    "source_session_id" UUID,
    "depth" INTEGER,
    "status" "ReviewItemStatus" NOT NULL DEFAULT 'pending',
    "scheduled_for" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_queue_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "interview_sessions_user_id_idx" ON "interview_sessions"("user_id");

-- CreateIndex
CREATE INDEX "interview_sessions_plan_id_idx" ON "interview_sessions"("plan_id");

-- CreateIndex
CREATE INDEX "interview_sessions_status_idx" ON "interview_sessions"("status");

-- CreateIndex
CREATE INDEX "interview_turns_session_id_idx" ON "interview_turns"("session_id");

-- CreateIndex
CREATE INDEX "interview_turns_concept_id_idx" ON "interview_turns"("concept_id");

-- CreateIndex
CREATE UNIQUE INDEX "interview_turns_session_id_concept_id_turn_index_key" ON "interview_turns"("session_id", "concept_id", "turn_index");

-- CreateIndex
CREATE INDEX "focus_sessions_user_id_idx" ON "focus_sessions"("user_id");

-- CreateIndex
CREATE INDEX "review_queue_items_plan_id_status_idx" ON "review_queue_items"("plan_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "review_queue_items_source_session_id_concept_id_key" ON "review_queue_items"("source_session_id", "concept_id");

-- AddForeignKey
ALTER TABLE "interview_sessions" ADD CONSTRAINT "interview_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_sessions" ADD CONSTRAINT "interview_sessions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "study_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_turns" ADD CONSTRAINT "interview_turns_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "interview_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_turns" ADD CONSTRAINT "interview_turns_concept_id_fkey" FOREIGN KEY ("concept_id") REFERENCES "concepts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "focus_sessions" ADD CONSTRAINT "focus_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "focus_sessions" ADD CONSTRAINT "focus_sessions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "study_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_queue_items" ADD CONSTRAINT "review_queue_items_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "study_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_queue_items" ADD CONSTRAINT "review_queue_items_concept_id_fkey" FOREIGN KEY ("concept_id") REFERENCES "concepts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
