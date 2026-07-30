# UC-05: Module Dashboard & Visualization

> **Module:** Dashboard & Visualization
> **Sprint:** 3 (khung Dashboard), Sprint 5 (hoàn thiện đồ thị)
> **DB liên quan:** `study_plans`, `concepts`, `concept_edges`, `interview_sessions`, `focus_sessions`

---

## UC-16: Xem Dashboard tổng quan

| Trường                   | Nội dung                                             |
| ------------------------ | ---------------------------------------------------- |
| **Actor**                | Student                                              |
| **Mục tiêu**             | Có cái nhìn tổng thể nhanh về toàn bộ tiến độ ôn tập |
| **Điều kiện tiên quyết** | Student đã đăng nhập                                 |

### Luồng chính

1. Student vào Dashboard (màn hình mặc định sau đăng nhập)
2. Hệ thống tải và hiển thị:
   - **Kế hoạch đang active:** danh sách plan, % tiến độ, deadline, số ngày còn lại
   - **Deadline sắp tới:** timeline các kỳ thi / deadline đang đếm ngược
   - **Khái niệm cần ôn hôm nay:** danh sách do Scheduling & Remediation Engine tính toán
   - **Đồ thị khái niệm tô màu** (xem UC-17) - mini version trên Dashboard
   - **Thống kê nhanh:** tổng thời gian ôn tuần này, số phiên Interview đã làm

### Luồng ngoại lệ

- **[E1] Chưa có kế hoạch nào:** Hiển thị màn hình onboarding với CTA "Tạo kế hoạch đầu tiên"
- **[E2] Tất cả kế hoạch đã hết deadline:** Gợi ý tạo kế hoạch mới

---

## UC-17: Xem và tương tác với Concept Graph Visualization

| Trường                   | Nội dung                                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------------------------ |
| **Actor**                | Student                                                                                                      |
| **Mục tiêu**             | Nhìn thấy bức tranh trực quan toàn bộ môn học, xác định ngay điểm yếu và vị trí của nó trong chuỗi kiến thức |
| **Điều kiện tiên quyết** | Kế hoạch đã được tạo và đã có ít nhất một phiên Interview                                                    |

### Màu sắc node (theo mastery_score)

> **Nguồn sự thật:** các token `--mastery-*` trong `src/client/src/global.css` — đây là ngưỡng đang chạy trên client, mọi màn hình thiết kế đều theo nó. Bảng dưới đây đã được đồng bộ với các token đó.

| Màu              | mastery_score       | Ý nghĩa                                             |
| ---------------- | ------------------- | --------------------------------------------------- |
| Xám (untested)   | `null`              | Chưa được kiểm tra lần nào                          |
| Đỏ (weak)        | `< 0.6`             | Yếu - cần ôn lại                                    |
| Vàng (learning)  | `0.6 ≤ score < 0.8` | Đang học - đã qua ngưỡng truy ngược nhưng chưa vững |
| Xanh lá (strong) | `≥ 0.8`             | Vững                                                |

> **Lưu ý về các ngưỡng khác trong tài liệu.** Ba dải màu trên (`0.6`, `0.8`) là để phân loại _hiển thị_ node. Chúng khác với hai ngưỡng _quyết định_ dùng nơi khác và không nên bị "sửa cho khớp":
>
> - `mastery_score < 0.6` → Concept Graph Engine truy ngược tiên quyết; `≥ 0.6` → xếp ôn giãn cách (SRS). Chính vì vậy biên dưới của dải "Đang học" trùng `0.6` — màu vàng nghĩa là "vừa đủ qua ngưỡng truy ngược".
> - UC-19 đếm "khái niệm chưa xong" theo `mastery_score < 0.7` khi tính trọng số ưu tiên của hàng đợi nhắc nhở — đây là tiêu chí lập lịch, không phải dải màu.

### Luồng chính

1. Student xem đồ thị react-flow (node = khái niệm, edge = quan hệ tiên quyết)
2. Quan sát màu sắc để nhận biết ngay điểm yếu và vị trí trong chuỗi kiến thức
3. Click vào node để xem panel chi tiết:
   - Tên khái niệm
   - `mastery_score` hiện tại và lịch sử theo thời gian
   - Các khái niệm tiên quyết (upstream) và hậu kế (downstream)
   - Lần kiểm tra cuối (`last_tested_at`)
   - Nút "Bắt đầu Interview cho khái niệm này"
4. Zoom in/out, kéo thả để điều hướng đồ thị (tính năng của react-flow)

### Luồng ngoại lệ

- **[E1] Đồ thị quá nhiều node (> 50):**
  - Cảnh báo performance: "Đồ thị lớn có thể chậm"
  - Cung cấp bộ lọc: hiển thị theo nhóm / chỉ hiện node yếu
- **[E2] Chưa có phiên Interview nào:**
  - Toàn bộ node màu xám
  - Tooltip hướng dẫn: "Làm phiên Interview đầu tiên để xem mức độ vững của từng khái niệm"

---

## UC-18: Xem lịch sử phiên Interview

| Trường       | Nội dung                                                         |
| ------------ | ---------------------------------------------------------------- |
| **Actor**    | Student                                                          |
| **Mục tiêu** | Theo dõi tiến độ theo thời gian, xem lại các lượt hỏi-đáp cụ thể |
| **Sprint**   | 5                                                                |

### Luồng chính

1. Student vào trang "Lịch sử & Tiến độ"
2. Xem danh sách các phiên Interview đã làm (ngày, số khái niệm, điểm trung bình)
3. Click vào một phiên → xem chi tiết:
   - Từng lượt hỏi-đáp (câu hỏi, câu trả lời của Student, feedback của AI, điểm)
   - Biến động `mastery_score` trước và sau phiên
4. Xem biểu đồ đường thể hiện `mastery_score` theo thời gian cho từng khái niệm

### Luồng ngoại lệ

- **[E1] Chưa có phiên Interview nào:** Hiển thị trạng thái rỗng, gợi ý bắt đầu phiên đầu tiên

---

## UC-19: Nhận nhắc nhở ôn tập chủ động (Agentic)

| Trường        | Nội dung                                                             |
| ------------- | -------------------------------------------------------------------- |
| **Actor**     | System (Scheduling & Remediation Engine) → thông báo đến Student     |
| **Mục tiêu**  | Nhắc nhở đúng lúc, đúng khái niệm, dựa trên ngữ cảnh học tập thực tế |
| **Tính chất** | Agentic - hệ thống tự tính toán, không theo lịch cố định             |

### Logic tính toán (Scheduling & Remediation Engine)

```text
HÀM NGÀY: tính_khuyến_nghị_hôm_nay()
  Với mỗi concept C trong tất cả plan active:
    thời_gian_còn_lại = deadline - hôm_nay  (ngày)
    khái_niệm_chưa_xong = đếm C có mastery_score < 0.7
    trọng_số_ưu_tiên = (1 / thời_gian_còn_lại) * (1 - mastery_score(C))

  Sắp xếp giảm dần theo trọng_số_ưu_tiên
  Lấy top K khái niệm ưu tiên nhất → đưa vào "Cần ôn hôm nay"
```

### Luồng chính

1. Scheduling & Remediation Engine chạy tính toán (định kỳ hoặc khi Student đăng nhập)
2. Tạo danh sách "Cần ôn hôm nay" với lý do cụ thể cho từng khái niệm
3. Hiển thị trên Dashboard (UC-16) và gửi thông báo (nếu Student cho phép)
4. Student click vào khái niệm gợi ý → chọn Focus Session hoặc Interview

### Luồng ngoại lệ

- **[E1] Student đã ôn đủ tất cả khái niệm trong ngày:** Không hiển thị gợi ý, thay bằng "Bạn đã hoàn thành kế hoạch hôm nay 🎉"
- **[E2] Không còn deadline nào sắp tới:** Gợi ý ôn lại các khái niệm có `mastery_score` thấp nhất
