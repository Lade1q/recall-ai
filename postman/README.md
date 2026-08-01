# Postman Testing Guide & Automation Documentation

Tài liệu hướng dẫn chạy và quản lý các bộ test API (Postman Collections) cho dự án **Recall AI / Study Planner**.

---

## 1. Cơ chế & Vai trò của `test:seed` và `test-setup.ts`

| Lệnh / Script            | File thực thi              | Vai trò & Chức năng                                                                                                                                         | Khi nào chạy?                                                                                                                       |
| :----------------------- | :------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------- |
| **`npm run test:seed`**  | `prisma/seed-test.ts`      | **Reset & nạp dữ liệu mẫu vào PostgreSQL test DB.** Tạo sẵn tài khoản test (`logintest@example.com`) và các dữ liệu nền ban đầu.                            | Chạy trước khi test suite thực thi để đảm bảo Database luôn ở trạng thái sạch chuẩn.                                                |
| **`npm run test:setup`** | `src/server/test-setup.ts` | **Tự động đăng nhập lấy Access Token.** Gọi `/api/v1/auth/login`, lấy JWT Token mới và ghi trực tiếp vào `postman/environments/Local Dev.environment.yaml`. | Tự động chạy ngay trước `test:planner` để tất cả API yêu cầu xác thực (`Bearer {{accessToken}}`) không bị lỗi **401 Unauthorized**. |

---

## 2. Danh sách các Lệnh Test trong `package.json`

| Lệnh                       | Chi tiết thực thi                                                     | Mục đích                                                                   |
| :------------------------- | :-------------------------------------------------------------------- | :------------------------------------------------------------------------- |
| **`npm run test:auth`**    | Runs Postman `Authentication Module Tests` collection                 | Chạy riêng kiểm thử module Đăng ký, Đăng nhập, Refresh Token, Logout.      |
| **`npm run test:planner`** | `npm run test:setup` -> Runs Postman `Study Planner Tests` collection | Chạy riêng kiểm thử module Quản lý Kế hoạch học tập (UC-05, UC-06, UC-07). |
| **`npm run test:run`**     | `npm run test:seed` -> `npm run test:auth` -> `npm run test:planner`  | Chạy nối tiếp toàn bộ regression test suite từ A-Z.                        |

---

## 3. Hướng dẫn Chạy Test Chi tiết

Mọi lệnh chạy đều thực hiện tại thư mục `src/server` (đảm bảo Backend Server `npm run dev` đang bật ở port `3001`).

```bash
cd src/server
```

### A. Chạy Toàn Bộ Test Suite (All-in-One)

```bash
npm run test:run
```

### B. Chạy Tách Biệt Từng Module (Auth / Planner)

- **Chạy riêng Auth Tests:**

  ```bash
  npm run test:auth
  ```

- **Chạy riêng Planner Tests:**
  ```bash
  npm run test:planner
  ```

### C. Chạy Đơn Lẻ Từng Thư Mục (Folder / Use Case) Cụ Thể

Bạn có thể chạy riêng từng Use Case trong `Study Planner Tests` bằng cờ `--folder`:

- **Chạy riêng UC-05 (Tạo kế hoạch học tập):**

  ```bash
  npx postman collection run "../../postman/collections/Study Planner Tests" -e "../../postman/environments/Local Dev.environment.yaml" --working-dir "../../postman/test-data/TC-SP-Studyplanner" --folder "UC-05 — Create Plan"
  ```

- **Chạy riêng UC-06 (Chỉnh sửa đồ thị môn học):**

  ```bash
  npx postman collection run "../../postman/collections/Study Planner Tests" -e "../../postman/environments/Local Dev.environment.yaml" --working-dir "../../postman/test-data/TC-SP-Studyplanner" --folder "UC-06 — Edit Graph"
  ```

- **Chạy riêng UC-07 (Xem danh sách & Chi tiết kế hoạch):**
  ```bash
  npx postman collection run "../../postman/collections/Study Planner Tests" -e "../../postman/environments/Local Dev.environment.yaml" --working-dir "../../postman/test-data/TC-SP-Studyplanner" --folder "UC-07 — List Plans"
  ```

---

## 4. Giải thích thắc mắc thường gặp

1. **`test:seed` và `test-setup.ts` khác nhau như thế nào?**
   - **`test:seed`** làm việc trực tiếp với **Database**: xóa dữ liệu cũ và insert lại các bản ghi chuẩn (User `logintest@example.com`, Plan mẫu, v.v.).
   - **`test-setup.ts`** làm việc với **API Authentication & File môi trường Postman**: gọi API login để cấp JWT token thực tế từ server, sau đó cập nhật token đó vào file `Local Dev.environment.yaml` để các request Postman dùng biến `{{accessToken}}` không bị hết hạn hoặc sai token.

2. **Nếu muốn chạy lẻ 1 folder mà bị lỗi 401 Unauthorized thì làm sao?**
   - Hãy chạy `npm run test:setup` trước 1 lần để làm mới Token vào file YAML môi trường, sau đó chạy lệnh Postman CLI `--folder ...`.
