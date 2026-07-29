# UC-02: Module AI Study Planner (Ingest & Map)

> **Module:** AI Study Planner
> **Sprint:** 3
> **DB liên quan:** `study_plans`, `concepts`, `concept_edges`, `analysis_jobs`
> **AI calls:** `extract_concepts` (JSON schema cố định)

---

## UC-05: Tạo kế hoạch ôn tập mới ⭐ (Use-case trung tâm)

| Trường                              | Nội dung                                                                      |
| ----------------------------------- | ----------------------------------------------------------------------------- |
| **Actor**                           | Student, AI Service, Scheduling & Remediation Engine                          |
| **Mục tiêu**                        | Biến tài liệu thô thành kế hoạch ôn tập có cấu trúc với đồ thị khái niệm      |
| **Điều kiện tiên quyết**            | Student đã đăng nhập                                                          |
| **Điều kiện kết thúc (thành công)** | Plan được lưu DB, đồ thị khái niệm hợp lệ (DAG), lịch ôn tập ban đầu được tạo |

### Luồng chính

1. Student click "Tạo kế hoạch mới"
2. Nhập tên kế hoạch, deadline ôn tập
3. Tải lên tài liệu (chọn một trong 3 dạng: PDF, ảnh, text dán trực tiếp)
4. Click "Phân tích tài liệu"
5. **[AI Call]** Hệ thống gửi nội dung tài liệu đến AI Service với prompt yêu cầu trả về JSON schema:
   ```json
   {
     "concepts": [
       {
         "id": "string",
         "name": "string",
         "difficulty": 1-5,
         "prerequisites": ["concept_id", ...]
       }
     ]
   }
   ```
6. Hệ thống validate output: kiểm tra JSON schema hợp lệ + kiểm tra tính chất DAG (không chu trình)
7. Hiển thị đồ thị khái niệm dạng visual (react-flow) để Student xem xét → chuyển sang UC-06
8. Student xác nhận ("Bắt đầu học với kế hoạch này")
9. Hệ thống lưu vào DB:
   - Bảng `study_plans`: thông tin plan + deadline
   - Bảng `concepts`: danh sách khái niệm + `mastery_score = null` (chưa kiểm tra)
   - Bảng `concept_edges`: các cặp quan hệ tiên quyết
10. Scheduling & Remediation Engine tạo lịch ôn tập ban đầu dựa trên deadline + estimated difficulty

### Luồng thay thế

- **[A1] Tải lên PDF:** Hệ thống đọc text từ PDF rồi gửi đến AI (hoặc gửi trực tiếp nếu model hỗ trợ multimodal PDF)
- **[A2] Tải lên ảnh chụp tài liệu:** AI xử lý qua khả năng multimodal image understanding
- **[A3] Dán text thẳng:** Student dán text vào textbox, không cần upload file

### Luồng ngoại lệ

- **[E1] AI trả về JSON sai schema:**
  1. Hệ thống tự động retry 1 lần với prompt rõ hơn
  2. Nếu vẫn sai → chia nhỏ tài liệu theo heading/đoạn văn → retry từng phần
  3. Nếu vẫn thất bại → thông báo lỗi, đề nghị Student thử lại hoặc chia nhỏ tài liệu
- **[E2] AI tạo chu trình trong DAG:**
  1. Hệ thống phát hiện chu trình bằng topological sort
  2. Tự động loại bỏ cạnh gây vòng (ghi log)
  3. Hiển thị cảnh báo cho Student: "Một số quan hệ tiên quyết đã được điều chỉnh do phát hiện chu trình"
- **[E3] File quá lớn / định dạng không hỗ trợ:** Từ chối upload, hiển thị giới hạn và định dạng hợp lệ
- **[E4] AI Service timeout / lỗi quota:** Hiển thị thông báo lỗi rõ, cung cấp nút "Thử lại"
- **[E5] Student rời trang giữa chừng (trước bước 8):** Bản nháp **đã được ghi vào DB** từ trước, không phải transient state:
  1. Ngay tại bước 4, hệ thống upload tài liệu lên Storage Service rồi ghi `study_plans` (`status = draft`) + `analysis_jobs` (`status = pending`, giữ `file_key` trỏ tới file đã upload) trong cùng một transaction, **trước khi** gọi AI Service
  2. Việc lưu bản nháp trước là điều kiện bắt buộc để phân tích chạy nền và Student polling tiến độ (SP-06); `concepts` / `concept_edges` chỉ được ghi khi job phân tích hoàn tất, và khi đó plan mới chuyển `draft → active`
  3. Nếu Student hủy hoặc rời trang trước bước 8: hệ thống dọn dẹp bản nháp — xóa bản ghi `study_plans` (kèm `concepts` / `concept_edges` theo cascade), `analysis_jobs` tương ứng và file trong Storage Service
  4. Nếu bước tạo bản nháp thất bại (validate lỗi, DB lỗi): hệ thống tự xóa file staging và file đã upload, không để lại file mồ côi

---

## UC-06: Xem và chỉnh sửa đồ thị khái niệm

| Trường                   | Nội dung                                                                                                 |
| ------------------------ | -------------------------------------------------------------------------------------------------------- |
| **Actor**                | Student                                                                                                  |
| **Mục tiêu**             | Review và hiệu chỉnh quan hệ tiên quyết do AI đề xuất trước khi bắt đầu học                              |
| **Điều kiện tiên quyết** | UC-05 đã hoàn thành bước 7 (đồ thị đã được hiển thị)                                                     |
| **Ghi chú**              | Bước xác nhận thủ công này là **bắt buộc**, không phải tùy chọn - hệ thống không tự tin hoàn toàn vào AI |

### Luồng chính

1. Student xem đồ thị dạng react-flow (node = khái niệm, edge = quan hệ tiên quyết)
2. Thao tác hiệu chỉnh (tùy chọn):
   - Kéo thả để sắp xếp lại vị trí node
   - Click vào edge để xóa quan hệ tiên quyết
   - Kéo từ node A đến node B để thêm quan hệ "A là tiên quyết của B"
   - Click vào node để sửa tên khái niệm hoặc độ khó
3. Click "Xác nhận & Lưu"

### Luồng ngoại lệ

- **[E1] Student thêm cạnh tạo chu trình:**
  - Hệ thống cảnh báo ngay lập tức: "Không thể thêm quan hệ này - sẽ tạo ra chu trình"
  - Từ chối lưu cạnh đó, không ảnh hưởng các cạnh khác
- **[E2] Student xóa toàn bộ quan hệ tiên quyết:**
  - Hệ thống cảnh báo: "Không có quan hệ tiên quyết - tính năng Traceback sẽ không hoạt động. Vẫn tiếp tục?"
  - Nếu xác nhận: lưu đồ thị thưa, hệ thống vận hành như spaced repetition thông thường

---

## UC-07: Xem danh sách kế hoạch ôn tập

| Trường       | Nội dung                                             |
| ------------ | ---------------------------------------------------- |
| **Actor**    | Student                                              |
| **Mục tiêu** | Có cái nhìn tổng quan về tất cả kế hoạch đang active |

### Luồng chính

1. Student vào Dashboard
2. Xem danh sách kế hoạch: tên, deadline, % tiến độ, số khái niệm vững/yếu
3. Click vào một kế hoạch → xem chi tiết đồ thị và lịch ôn tập

### Luồng ngoại lệ

- **[E1] Chưa có kế hoạch nào:** Hiển thị màn hình onboarding với CTA "Tạo kế hoạch đầu tiên"

---

## UC-08: Xóa / lưu trữ kế hoạch ôn tập

| Trường       | Nội dung                                                 |
| ------------ | -------------------------------------------------------- |
| **Actor**    | Student                                                  |
| **Mục tiêu** | Dọn dẹp các kế hoạch đã hết hạn hoặc không còn cần thiết |

### Luồng chính

1. Student chọn kế hoạch → click "Xóa" hoặc "Lưu trữ"
2. Hệ thống yêu cầu xác nhận (confirm dialog)
3. Nếu xác nhận: xóa hoặc đánh dấu `archived = true` trong DB
4. Cập nhật danh sách kế hoạch

### Luồng ngoại lệ

- **[E1] Xóa kế hoạch đang có phiên học dở:** Cảnh báo "Kế hoạch này có phiên học chưa hoàn thành. Xóa sẽ mất toàn bộ dữ liệu. Tiếp tục?"
