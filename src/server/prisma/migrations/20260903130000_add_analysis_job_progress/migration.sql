-- Panel phân tích cho nhiều tài liệu: một pha mới cho lượt nối, và hai bộ đếm tiến độ.
--
-- `ALTER TYPE ... ADD VALUE` cố ý nằm NGOÀI transaction. Postgres 12+ cho phép chạy nó trong
-- transaction nhưng cấm DÙNG giá trị mới cho tới khi commit; để ngoài thì câu lệnh tự nó là
-- atomic và không có bẫy nào để nhớ. Nó cũng phải đứng TRƯỚC, vì một migration sau sẽ ghi giá
-- trị `linking` vào cột.
--
-- Hai cột nullable, thuần cộng thêm: job cũ để NULL và client đọc NULL là "không biết", rơi về
-- thanh tiến độ theo pha như trước.

-- AlterEnum
ALTER TYPE "AnalysisJobPhase" ADD VALUE 'linking';

BEGIN;

-- AlterTable
ALTER TABLE "analysis_jobs" ADD COLUMN "documents_total" INTEGER,
                            ADD COLUMN "documents_done" INTEGER;

COMMIT;
