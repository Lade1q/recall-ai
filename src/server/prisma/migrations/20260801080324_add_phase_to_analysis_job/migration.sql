-- CreateEnum
CREATE TYPE "AnalysisJobPhase" AS ENUM ('sending_to_ai', 'extracting', 'validating');

-- AlterTable
ALTER TABLE "analysis_jobs" ADD COLUMN     "phase" "AnalysisJobPhase";
