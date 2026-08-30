# Kế hoạch Kiểm thử — Planning AI

> **Dự án:** Planning AI – Plan / Focus / Verify  
> **Phiên bản:** 0.1 (Skeleton)  
> **Người viết:** Nguyễn Minh Phát (QA/Tester)  
> **Ngày tạo:** 2026-06-28  
> **Trạng thái:** Bản nháp

---

## Mục lục

1. [Giới thiệu](#1-giới-thiệu)
2. [Phạm vi kiểm thử](#2-phạm-vi-kiểm-thử)
3. [Các loại kiểm thử](#3-các-loại-kiểm-thử)
4. [Công cụ](#4-công-cụ)
5. [Môi trường kiểm thử](#5-môi-trường-kiểm-thử)
6. [Tiêu chí bắt đầu & kết thúc](#6-tiêu-chí-bắt-đầu--kết-thúc)
7. [Vai trò & Trách nhiệm](#7-vai-trò--trách-nhiệm)
8. [Lịch kiểm thử](#8-lịch-kiểm-thử)
9. [Rủi ro & Biện pháp](#9-rủi-ro--biện-pháp)

---

## 1. Giới thiệu

### 1.1 Mục đích

Tài liệu này định nghĩa chiến lược kiểm thử cho dự án Planning AI. Mô tả những gì sẽ được kiểm thử, kiểm thử như thế nào và khi nào.

### 1.2 Tổng quan dự án

Planning AI là ứng dụng web giúp người dùng chuyển đổi ý định thành hành động thông qua quy trình ba bước: **Plan → Focus → Verify**. Hệ thống tích hợp Gemini API của Google cho các tính năng AI.

### 1.3 Tài liệu tham chiếu

- [Project Proposal v1.4](../../pa/pa0/project-proposal.md)
- [Mẫu Test Case](./test-plans/test-case-template.md)
- [Mẫu Bug Report](./bug-reports/bug-report-template.md)

---

## 2. Phạm vi kiểm thử

### 2.1 Trong phạm vi

Các tính năng và màn hình sẽ được kiểm thử:

| #   | Màn hình / Tính năng                           | Sprint mục tiêu |
| --- | ---------------------------------------------- | --------------- |
| 1   | Landing Page                                   | Sprint 4        |
| 2   | Xác thực (Đăng nhập / Đăng ký / Đăng xuất)     | Sprint 4        |
| 3   | Dashboard                                      | Sprint 4        |
| 4   | AI Planning — Tạo kế hoạch (nhập text & ảnh)   | Sprint 4        |
| 5   | AI Planning — Chi tiết kế hoạch & Quản lý task | Sprint 4        |
| 6   | Focus Session (Pomodoro Timer)                 | Sprint 4        |
| 7   | AI Verify Setup                                | Sprint 5        |
| 8   | AI Oral Exam Session                           | Sprint 5        |
| 9   | AI Reflection Session                          | Sprint 5        |
| 10  | Verify Result                                  | Sprint 5        |

**Trình duyệt trong phạm vi:** Chrome, Edge, Firefox (chỉ Desktop)

### 2.2 Ngoài phạm vi

| Hạng mục                      | Lý do                                    |
| ----------------------------- | ---------------------------------------- |
| Responsive mobile / tablet    | Đặc tả dự án: chỉ hỗ trợ Desktop cho MVP |
| Trình duyệt Safari            | Loại trừ trong project proposal          |
| Upload file PDF / DOCX        | Tính năng Phase 2, không thuộc MVP       |
| Phòng học 3D / tương tác      | Loại trừ trong project proposal          |
| Load testing 1000+ người dùng | Ngoài phạm vi dự án học                  |

---

## 3. Các loại kiểm thử

### 3.1 Unit Testing (Kiểm thử đơn vị)

**Chú thích:** Kiểm tra một hàm hoặc component riêng lẻ — phần nhỏ nhất có thể test được.

**Người viết:** Chủ yếu là **Developer**. QA xem báo cáo coverage.

**Ví dụ trong dự án:**

- Hàm format ngày deadline → có trả về đúng chuỗi không?
- Hàm validate email → có từ chối `"khonghople"` không?
- React component có render đúng với props được truyền vào không?

**Công cụ:** Jest (test logic) + React Testing Library (test UI)

**Lý do chọn công cụ:**

- Jest là 1 testing Framework dành cho JavaScript/TypeScript, là 1 trong những công cụ phổ biến nhất để test code JavaScript hiện tại (dùng nó để theo kịp xu hướng)

- React Testing Library (RTL) cung cấp các hàm để "mô phỏng" hành vi của người dùng thật như: Tìm nút có chữ "Đăng nhập", Click vào nút đó, Gõ chữ "abc" vào ô input

- Dùng React Testing Library vì Jest chỉ hiểu code JavaScript thuần, nó không biết giao diện (UI), nút bấm, hay thẻ HTML là gì

**Khi nào:** Dev viết song song với code.

**Vai trò QA:** Xem báo cáo test coverage. Đánh dấu các khu vực coverage thấp.

---

### 3.2 Integration Testing (Kiểm thử tích hợp)

**Chú thích:** Kiểm tra hai hoặc nhiều thành phần hoạt động đúng **khi kết nối với nhau**.

**Người viết:** QA (cấp API) + Dev (cấp module).

**Ví dụ trong dự án:**

- Frontend gửi `POST /api/plans` → backend có lưu đúng vào database không?
- Backend gọi Gemini API → có parse và trả về response AI đúng không?
- Người dùng đăng nhập → JWT token có được lưu và dùng ở các request tiếp theo không?

**Công cụ:** **Postman** (test tích hợp API), **Jest** (test tích hợp service backend - service backend là test các nghiệp vụ logic trong backend, ví dụ test kiểm tra email đúng format ko...) (Người dùng Jest chính là Frontend và Backend Lead (Phong và Bảo))

**Lý do chọn công cụ:**

- Postman tốt hơn SwaggerUI ở phần tự động hóa (Swagger thường rất thủ công, Postman có hỗ trợ test tự động bằng Javascript. Ví dụ tính năng đăng nhập, SwaggerUI cần gọi thủ công nhiều API trong khi Postman có hỗ trợ viết script thuận tiện để chạy cả luồng 1 lần).

- Jest là 1 testing Framework dành cho JavaScript/TypeScript, là 1 trong những công cụ phổ biến nhất để test code JavaScript hiện tại (dùng nó để theo kịp xu hướng)

**Khi nào:** sau khi các module riêng lẻ đã được xây dựng.

**Vai trò QA:** Dùng Postman test từng API endpoint. Tạo Postman collection và chia sẻ với team.

---

### 3.3 System Testing (Kiểm thử hệ thống)

**Chú thích:** Kiểm tra **toàn bộ hệ thống đã tích hợp** từ đầu đến cuối, mô phỏng hành vi người dùng thực.

**Người viết:** QA

**Ví dụ trong dự án:**

- Người dùng đăng ký → đăng nhập → tạo kế hoạch → bắt đầu focus session → hoàn thành verify → xem kết quả trên dashboard
- Người dùng upload ảnh → AI tạo task → người dùng chỉnh sửa task → đánh dấu hoàn thành

**Bao gồm:**

- Functionality Testing (mỗi tính năng có hoạt động không?)
- Security Testing (dữ liệu người dùng có được bảo vệ không?)
- Compatibility Testing (có chạy trên Chrome, Edge, Firefox không?)
- Usability Testing (có dễ sử dụng không?)

**Công cụ:** **Playwright** (E2E tự động), kiểm thử thủ công trên trình duyệt

**Lý do chọn công cụ:**

- Playwright - framework do Microsoft phát triển chuyên dùng để Tự động hóa trình duyệt (Browser Automation) và làm Kiểm thử đầu cuối (End-to-End / E2E Testing)

- Tính năng "Ghi hình" (Codegen): thay vì phải gõ code JavaScript để "tìm nút A, click nút B", Playwright có một công cụ gọi là Codegen. Bật nó lên, một cửa sổ trình duyệt hiện ra, dùng chuột click, gõ phím như người dùng bình thường... và Playwright sẽ tự động sinh ra code test

> Nâng cao: có thể dùng Playwright tích hợp vào CI/CD (chú thích thêm mục 4 - Công cụ)

**Khi nào:** Test thường ngày hoặc sau khi Dev thêm tính năng mới

**Vai trò QA:** Viết và chạy test cases trong `docs/test/test-plans/`. Báo cáo bug trong `docs/test/bug-reports/`.

---

### 3.4 UAT — Kiểm thử chấp nhận người dùng

**Là gì:** Người dùng thật (không phải dev team) test ứng dụng để xác nhận có đáp ứng nhu cầu thực tế không. Đây là cổng cuối cùng trước khi phát hành.

**Ai thực hiện:** 2–3 người dùng thật từ nhóm mục tiêu (sinh viên / nhân viên văn phòng), QA quan sát.

**Ví dụ trong dự án:**

- Yêu cầu sinh viên "lên kế hoạch ôn thi bằng ứng dụng" — quan sát mà không hỗ trợ.
- Yêu cầu nhân viên văn phòng thực hiện một chu trình Plan → Focus → Verify.
- Ghi lại những gì họ thấy khó hiểu, nhấp nhầm, mong đợi nhưng không tìm thấy.

**Công cụ:** Quan sát trực tiếp + ghi chép. Tùy chọn: quay màn hình.

**Khi nào:** Sprint 5 (tuần cuối trước khi nộp)

**Vai trò QA:** Mời người tham gia, tổ chức buổi test, ghi lại quan sát, tổng hợp phản hồi thành UAT Report.

---

### 3.5 Regression Testing (Kiểm thử hồi quy)

**Là gì:** Chạy lại các test case đã pass trước đó sau khi có bug fix hoặc code mới, để xác nhận không có gì bị phá vỡ.

**Khi nào:** Mỗi khi developer merge một fix hoặc tính năng mới.

**Công cụ:** Chạy lại automated tests Playwright + kiểm tra thủ công các test case liên quan.

---

## 4. Công cụ

| Công cụ                     | Mục đích                                | Ai dùng              |
| --------------------------- | --------------------------------------- | -------------------- |
| **Jest**                    | Unit testing (hàm, component)           | Dev (QA xem báo cáo) |
| **React Testing Library**   | Unit testing React components           | Dev                  |
| **Postman**                 | API / Integration testing               | QA                   |
| **Playwright**              | Automated E2E / System testing          | QA                   |
| **Chrome DevTools**         | Debug, kiểm tra network, performance    | QA + Dev             |
| **JIRA**                    | Theo dõi bug và quản lý sprint          | Cả nhóm              |
| **GitHub Pull Requests**    | Review code — QA review trước khi merge | QA + Dev             |
| **Chrome / Edge / Firefox** | Kiểm thử tương thích trình duyệt        | QA                   |

> Công cụ CI/CD: GitHub Actions Lý do chọn công cụ: Tích hợp sẵn trong GitHub (miễn phí), dễ thiết lập. Mục tiêu tự động hóa:
>
> - Tự động chạy toàn bộ Unit Test (Jest) và E2E Test (Playwright) mỗi khi có Pull Request mới.
> - Báo cáo kết quả trực tiếp trên GitHub PR. Không cho phép merge code nếu có bất kỳ test case nào thất bại (Fail), giúp đảm bảo mã nguồn trên nhánh main luôn ổn định.

> **Ghi chú cho QA:** Playwright và Postman là hai công cụ chính. Playwright sẽ được setup trong Sprint 3. Postman có thể dùng ngay khi có API endpoint đầu tiên.

---

## 5. Môi trường kiểm thử

| Môi trường  | URL                                                         | Mục đích                       |
| ----------- | ----------------------------------------------------------- | ------------------------------ |
| Local (Dev) | `http://localhost:5173` (FE) · `http://localhost:3000` (BE) | Phát triển và kiểm thử ban đầu |
| Staging     | _(xác định trong Sprint 4)_                                 | Kiểm thử tích hợp đầy đủ, UAT  |
| Production  | _(xác định trong Sprint 5)_                                 | Triển khai chính thức          |

**Database test:** Sử dụng database test riêng biệt — không bao giờ chạy test trên data production.

---

## 6. Tiêu chí bắt đầu & kết thúc

### 6.1 Tiêu chí bắt đầu (khi nào BẮT ĐẦU test một tính năng)

- [ ] Code tính năng đã được merge vào branch main/dev
- [ ] Tính năng chạy không crash trên môi trường local
- [ ] Test cases cho tính năng đã được viết

### 6.2 Tiêu chí kết thúc (khi nào XONG kiểm thử)

- [ ] Tất cả test cases đã được chạy (Status ≠ Not Run)
- [ ] Không còn bug Critical hoặc High còn mở
- [ ] Tất cả bug Medium/Low đã được log trên JIRA và assign người xử lý
- [ ] Kiểm thử trình duyệt đã pass trên Chrome, Edge, Firefox
- [ ] QA đã ký duyệt và thông báo cho PM

---

## 7. Vai trò & Trách nhiệm

| Vai trò       | Người thực hiện       | Trách nhiệm                                                              |
| ------------- | --------------------- | ------------------------------------------------------------------------ |
| QA / Tester   | Nguyễn Minh Phát      | Viết test cases, chạy system test, API testing, báo cáo bug, tổ chức UAT |
| Frontend Lead | Nguyễn Phương Gia Bảo | Viết unit test cho component, sửa UI bug, hỗ trợ kiểm thử tương thích    |
| Backend Lead  | Ngô Văn Phong         | Viết unit/integration test cho API, sửa backend bug                      |
| Architect     | Nguyễn Thế Quân       | Review test coverage, hỗ trợ setup DB testing                            |
| PM            | Thái Nguyễn Tuấn Kiệt | Review báo cáo test, quyết định go/no-go release                         |

---

## 8. Lịch kiểm thử

| Sprint   | Hoạt động kiểm thử                                                                |
| -------- | --------------------------------------------------------------------------------- |
| Sprint 1 | Viết skeleton Test Plan (tài liệu này). Review proposal tìm điểm chưa rõ.         |
| Sprint 2 | Viết test cases cho Authentication, Dashboard, AI Planning.                       |
| Sprint 3 | Viết các test case còn lại. Setup Playwright. Smoke test đầu tiên trên v1.        |
| Sprint 4 | Kiểm thử hệ thống đầy đủ. API testing với Postman. Security testing. Báo cáo bug. |
| Sprint 5 | Regression testing. Kiểm thử tương thích. UAT. Báo cáo tổng kết kiểm thử.         |

---

## 9. Rủi ro & Biện pháp

| Rủi ro                                        | Mức ảnh hưởng                    | Biện pháp                                                             |
| --------------------------------------------- | -------------------------------- | --------------------------------------------------------------------- |
| Gemini API trả về kết quả không nhất quán     | Test case AI khó tự động hóa     | Dùng mock response cố định cho automated test; test API thật thủ công |
| Code của Dev không testable (thiếu test hook) | Không viết được integration test | QA báo sớm; Dev phải expose test endpoint                             |
| Áp lực thời gian Sprint 4–5                   | Không đủ thời gian test hết      | Ưu tiên test case độ ưu tiên High trước; bỏ qua Low nếu cần           |

---

## Phụ lục — Các mục cần bổ sung trong Sprint 3

> Các mục sau là stub. Sẽ được điền đầy đủ khi thiết kế kiến trúc và API design hoàn tất.

- [ ] Bộ dữ liệu test chi tiết (input hợp lệ và không hợp lệ cho từng tính năng)
- [ ] Hướng dẫn setup Playwright
- [ ] Cấu trúc Postman collection
- [ ] Query test cho database (setup Prisma Studio)
- [ ] Kế hoạch CI integration (tự động chạy test khi push code)
