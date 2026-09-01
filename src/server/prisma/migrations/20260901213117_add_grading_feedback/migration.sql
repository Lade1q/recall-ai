-- AE-10 (#248) — bảng ghi log phản hồi của sinh viên về điểm một lượt chấm.
--
-- Đúng MỘT thay đổi logic (thêm bảng), theo docs/guidelines/coding-conventions.md §5.2.
--
-- `BEGIN`/`COMMIT` tường minh vì nợ đã biết (#470): trên Postgres, Prisma KHÔNG tự bọc file
-- migration trong transaction (SQL Server thì có). Migration này có 5 câu lệnh; nếu câu thứ hai
-- trở đi hỏng mà câu đầu đã COMMIT, `_prisma_migrations` giữ lại một hàng `unfinished` chặn MỌI
-- migration sau đó với P3009, và đường ra đòi `migrate resolve --rolled-back` — lệnh mà
-- `migrate deploy` không bao giờ tự chạy. Khuôn lấy từ migration
-- `20260821181401_focus_sessions_one_running_per_user`.
--
-- KHÔNG có `LOCK TABLE` ở đây, và đó là chủ ý: khuôn gốc cần lock vì nó DỌN dữ liệu có sẵn rồi
-- mới tạo unique index, nên một `INSERT` chen giữa hai bước sẽ làm index hỏng. Bảng này vừa được
-- tạo trong chính transaction này — chưa tồn tại writer nào để chặn. Thêm lock là bắt chước
-- hình thức mà không có mối nguy tương ứng.


-- CreateTable
BEGIN;

-- CreateTable
CREATE TABLE "grading_feedback" (
    "id" UUID NOT NULL,
    "turn_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "reasons" JSONB NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grading_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "grading_feedback_turn_id_user_id_key" ON "grading_feedback"("turn_id", "user_id");

-- AddForeignKey
ALTER TABLE "grading_feedback" ADD CONSTRAINT "grading_feedback_turn_id_fkey" FOREIGN KEY ("turn_id") REFERENCES "interview_turns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grading_feedback" ADD CONSTRAINT "grading_feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
