-- #224 (04/08/2026): truy ngược áp thẳng khái niệm nền vào lịch, không còn cổng xác nhận.
-- 'accepted' trong mô hình cũ nghĩa là "tôi muốn ôn cái này" — mô hình mới thể hiện đúng ý đó
-- bằng 'pending' (= đã áp vào lịch), nên backfill là vô hại, không mất hàng nào.
UPDATE "review_queue_items" SET "status" = 'pending' WHERE "status" = 'accepted';

-- Cố ý KHÔNG đụng 'skipped': đó là lựa chọn gỡ khỏi lịch của sinh viên, mô hình mới giữ nguyên.
-- Cố ý KHÔNG gỡ nhãn 'accepted' khỏi type "ReviewItemStatus": bỏ một giá trị khỏi enum trong
-- Postgres phải dựng lại type + rewrite mọi cột dùng nó (thao tác phá huỷ). Nhãn ở lại như một
-- di tích chết, đã đánh dấu deprecated trong schema.prisma; xoá hẳn để Sprint 5 (#220).
