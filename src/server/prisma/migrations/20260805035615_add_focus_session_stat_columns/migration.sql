-- AlterTable
ALTER TABLE "focus_sessions" ADD COLUMN     "away_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "focused_seconds" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pomodoros_completed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "strict_mode" BOOLEAN NOT NULL DEFAULT false;
