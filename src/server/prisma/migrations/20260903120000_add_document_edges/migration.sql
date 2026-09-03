-- Tầng chủ đề của đồ thị hai tầng: MỘT TỆP = MỘT CHỦ ĐỀ.
--
-- Node của tầng trên chính là hàng `documents` đã có, nên migration này KHÔNG tạo bảng node
-- nào. Nó chỉ thêm hai thứ: các CẠNH giữa hai tài liệu, và một con trỏ N:1 từ khái niệm về
-- tài liệu đã sinh ra nó.
--
-- `BEGIN`/`COMMIT` tường minh vì nợ đã biết (#470): trên Postgres, Prisma KHÔNG tự bọc file
-- migration trong transaction. Migration này có 8 câu lệnh; nếu câu thứ hai trở đi hỏng mà câu
-- đầu đã COMMIT, `_prisma_migrations` giữ một hàng `unfinished` chặn MỌI migration sau đó với
-- P3009. Khuôn lấy từ `20260901213117_add_grading_feedback`.
--
-- THUẦN CỘNG THÊM: không chạm `concepts.name`, `concept_edges`, hay bất kỳ cột nào của
-- `documents`. Cột mới nullable, không backfill -- 11/11 kế hoạch hiện có đúng 1 tài liệu nên
-- chúng rẽ về đồ thị phẳng và không đọc cột này.

BEGIN;

-- AlterTable
ALTER TABLE "concepts" ADD COLUMN "primary_document_id" UUID;

-- CreateTable
CREATE TABLE "document_edges" (
    "id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "from_document_id" UUID NOT NULL,
    "to_document_id" UUID NOT NULL,

    CONSTRAINT "document_edges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "concepts_primary_document_id_idx" ON "concepts"("primary_document_id");

-- CreateIndex
CREATE INDEX "document_edges_plan_id_idx" ON "document_edges"("plan_id");

-- CreateIndex
CREATE INDEX "document_edges_from_document_id_idx" ON "document_edges"("from_document_id");

-- CreateIndex
CREATE INDEX "document_edges_to_document_id_idx" ON "document_edges"("to_document_id");

-- CreateIndex
CREATE UNIQUE INDEX "document_edges_plan_id_from_document_id_to_document_id_key" ON "document_edges"("plan_id", "from_document_id", "to_document_id");

-- AddForeignKey
ALTER TABLE "concepts" ADD CONSTRAINT "concepts_primary_document_id_fkey" FOREIGN KEY ("primary_document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_edges" ADD CONSTRAINT "document_edges_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "study_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_edges" ADD CONSTRAINT "document_edges_from_document_id_fkey" FOREIGN KEY ("from_document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_edges" ADD CONSTRAINT "document_edges_to_document_id_fkey" FOREIGN KEY ("to_document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
