-- Thêm tài liệu vào kế hoạch đã có: một lượt phân tích giờ có thể chỉ đọc CÁC TỆP MỚI.
--
-- Enum tạo trước, ngoài transaction bên dưới — `CREATE TYPE` là một câu lệnh, tự nó atomic, và
-- cột ở dưới cần kiểu này đã tồn tại và đã commit trước khi tham chiếu tới.
--
-- Cột `scope` có DEFAULT 'all' nên mọi job cũ giữ nguyên ngữ nghĩa: đọc lại toàn bộ. Không có
-- backfill nào cần chạy.

-- CreateEnum
CREATE TYPE "AnalysisJobScope" AS ENUM ('all', 'new_only');

BEGIN;

-- AlterTable
ALTER TABLE "analysis_jobs" ADD COLUMN "scope" "AnalysisJobScope" NOT NULL DEFAULT 'all',
                            ADD COLUMN "scope_document_ids" JSONB;

COMMIT;
