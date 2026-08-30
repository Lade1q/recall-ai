-- Review #421 (Quân, 29/08) — đo LIVE trên 4 DB cô lập: chạy migration này trên một DB có sẵn 2
-- hàng `running` cùng user thì `CREATE UNIQUE INDEX` chết với P3018/23505 (unique violation), và
-- KHÔNG tự lành — `_prisma_migrations` giữ lại một hàng `unfinished`, chặn MỌI migration sau đó
-- với P3009 kể cả sau khi dữ liệu đã được dọn tay (đường ra đòi `migrate resolve --rolled-back`,
-- lệnh mà `migrate deploy` không bao giờ tự chạy). Cửa sổ này không nhỏ: `reapStaleSessions` chỉ
-- chạy trong request của chính user đó, không có cron/job nào quét toàn bảng lúc boot.
--
-- Dọn TRƯỚC khi tạo index, trong CÙNG file migration. Giữ lại hàng `started_at` mới nhất mỗi
-- user (tie-break bằng `id` cho hai hàng cùng mốc), hạ phần còn lại xuống `cancelled` đúng cách
-- `reapStaleSessions()` (`focus-session.service.ts`) đang làm cho một phiên bỏ dở:
-- `status = 'cancelled'`, `duration_minutes = 0`, `ended_at` được ghi (ở đây là lúc chạy
-- migration, không phải `started_at + 8h` — đây không phải phiên "stale", chỉ là bản sao thừa
-- mà #328 sinh ra trước khi có index chặn).
--
-- Review #421 round 2 (Quân) — bản trước ghi "Prisma bọc mỗi file migration trong một
-- transaction, nên dọn dữ liệu và tạo index là MỘT bước nguyên tử". Đo LIVE: SAI trên Postgres.
-- Theo docs Prisma (mục transactional DDL): SQL Server tự bọc transaction; **Postgres phải tự
-- thêm `BEGIN`/`COMMIT`, mặc định KHÔNG bọc**. `grep` tệp gốc ra 0 dòng `BEGIN`/`COMMIT`. Ép
-- `CREATE UNIQUE INDEX` hỏng sau khi `UPDATE` đã chạy (đo bằng cách tạo sẵn index trùng tên) cho
-- thấy `UPDATE` COMMIT thật — phiên bị huỷ ở lại `cancelled`, index không tồn tại,
-- `_prisma_migrations` còn một hàng `unfinished`.
--
-- `BEGIN`/`COMMIT` dưới đây là bước Prisma docs chỉ định cho Postgres. Riêng `BEGIN`/`COMMIT`
-- không đủ đóng cửa sổ đua: `UPDATE` chỉ giữ `ROW EXCLUSIVE`, một `INSERT` (`createFocusSession`)
-- vẫn chen vào và commit được GIỮA `UPDATE` và `CREATE INDEX`, khiến `CREATE UNIQUE INDEX` lại
-- thấy 2 hàng `running`. `LOCK TABLE ... IN SHARE ROW EXCLUSIVE MODE` xung đột với `ROW EXCLUSIVE`
-- mà `INSERT` cần, nên đặt NGAY SAU `BEGIN` chặn mọi writer đồng thời tại chính câu `INSERT` cho
-- tới `COMMIT` — ai đã commit TRƯỚC lock thì nằm sẵn trong tập `UPDATE` dọn, không còn khe hở.
-- Không chặn đọc (khác `ACCESS EXCLUSIVE`); bảng nhỏ nên lock chỉ giữ vài chục mili-giây. Kiểm
-- chứng LIVE (Postgres tạm qua Docker): `LOCK TABLE` ngoài transaction ném lỗi ngay
-- ("LOCK TABLE can only be used in transaction blocks") — đúng PostgreSQL docs (`sql-lock.html`),
-- nên bộ ba `BEGIN`/`LOCK TABLE`/`COMMIT` phải đi cùng nhau, không tách được.
BEGIN;

LOCK TABLE "focus_sessions" IN SHARE ROW EXCLUSIVE MODE;

UPDATE "focus_sessions"
SET "status" = 'cancelled', "duration_minutes" = 0, "ended_at" = now()
WHERE "id" IN (
  SELECT "id" FROM (
    SELECT "id",
           ROW_NUMBER() OVER (PARTITION BY "user_id" ORDER BY "started_at" DESC, "id" DESC) AS rn
    FROM "focus_sessions"
    WHERE "status" = 'running'
  ) ranked
  WHERE rn > 1
);

-- #328: chặn N request THỰC SỰ đồng thời (cùng round-trip DB, ví dụ Promise.all) tạo N hàng
-- `running` cho cùng user. App-level check trong `createFocusSession` (#371) đã đóng phần
-- double-click/2-tab tuần tự, nhưng `reap -> findFirst -> create` không nằm trong 1 transaction
-- nên N request thực sự song song vẫn cùng thấy "chưa có phiên nào" rồi cùng ghi.
--
-- Đây là partial unique index (`WHERE status = 'running'`) nên KHÔNG thể khai báo qua
-- `@@unique` trong schema.prisma (Prisma không hỗ trợ điều kiện `WHERE` trên unique constraint) -
-- viết raw SQL là ngoại lệ hợp lệ theo docs/guidelines/coding-conventions.md §5.3.
--
-- Scope là per-user (không phải per-user+plan+concept) vì `concept_ids` là cột Json
-- (`string[]`), không đặt được ràng buộc duy nhất lên phần tử mảng JSON mà không chuẩn hoá lại
-- mô hình dữ liệu - và per-user đã khớp đúng ngữ nghĩa "một người chỉ tập trung một lúc" mà #371
-- chọn.
CREATE UNIQUE INDEX "focus_sessions_one_running_per_user"
  ON "focus_sessions" ("user_id")
  WHERE "status" = 'running';

COMMIT;
