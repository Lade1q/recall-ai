# BR-DB-001: Dashboard không chuyển sang E2 khi mọi deadline đã qua

> **Module:** Dashboard & Visualization  
> **Ngày tạo:** 2026-08-11  
> **Phiên bản:** 1.0

## Thông tin bug

| Trường                  | Nội dung                                                                 |
| ----------------------- | ------------------------------------------------------------------------ |
| **Mã Bug**              | BR-DB-001                                                                |
| **Tiêu đề**             | Plan `active` quá hạn vẫn được hiển thị như Dashboard active bình thường |
| **Module**              | UC-16 — Dashboard tổng quan, E2                                          |
| **Mức độ nghiêm trọng** | Medium                                                                   |
| **Độ ưu tiên**          | High                                                                     |
| **Trạng thái**          | New                                                                      |
| **Phát hiện ở**         | TC-DB-004b                                                               |
| **Người được giao**     | Chưa phân công                                                           |
| **Môi trường**          | Chromium và Firefox local, PostgreSQL local                              |

### Mô tả

Khi Student có hai plan ở trạng thái `active` nhưng cả hai deadline đều đã trước ngày hiện tại, Dashboard vẫn tải catalog plan active cùng các khối Dashboard thông thường. Không có trạng thái E2 để gợi ý tạo kế hoạch mới.

### Điều kiện tiên quyết

Student đã đăng nhập, sở hữu P1/P2 `active`; P1 deadline = hôm nay - 3 ngày, P2 deadline = hôm nay - 1 ngày.

### Các bước tái hiện

1. Seed Student và P1/P2 như điều kiện tiên quyết.
2. Đăng nhập qua UI.
3. Chờ `GET /api/v1/plans` trả `200` và chờ catalog Dashboard render.
4. Quan sát danh mục kế hoạch.

### Kết quả mong đợi

UC-16, luồng ngoại lệ E2 trong [UC-05_Dashboard.md](../../requirements/use-case_diagram/UC-05_Dashboard.md), yêu cầu: khi tất cả kế hoạch đã hết deadline, hệ thống gợi ý Student tạo kế hoạch mới; không coi đây là Dashboard active bình thường.

### Kết quả thực tế

P1 và P2 vẫn có link `Mở kế hoạch ...` trong catalog active. Assertion `toHaveCount(0)` nhận được `1` cho P1 trên Chromium và Firefox.

### Dẫn chứng kỹ thuật

- Test tái hiện: [TC-DB-004.spec.ts](../../../e2e/tests/dashboard/TC-DB-004.spec.ts)
- Client hiện chỉ lọc theo `plan.status === 'active'`: [DashboardPage.tsx](../../../src/client/src/pages/dashboard/DashboardPage.tsx)
- API list plan vẫn trả plan active bất kể deadline: [plan.service.ts](../../../src/server/src/services/plan.service.ts)

### Ghi chú

Không sửa product code trong nhiệm vụ test. Test đã chờ response API và một trạng thái UI sau render trước assertion để loại trừ pass/FAIL giả do bất đồng bộ.
