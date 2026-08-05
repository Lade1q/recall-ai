# Thư mục Hooks

Thư mục này chứa các **Custom React Hooks** của ứng dụng.

## 💡 Mục đích sử dụng

Các custom hooks giúp tách biệt logic xử lý trạng thái (stateful logic) ra khỏi component giao diện, tăng khả năng tái sử dụng mã nguồn và giúp code sạch sẽ hơn.

Ví dụ các hooks sẽ viết ở đây:

- `useAuth`: Quản lý trạng thái đăng nhập, phân quyền người dùng.
- `useLocalStorage`: Đọc/ghi dữ liệu vào LocalStorage.
- `useDebounce`: Trì hoãn xử lý input tìm kiếm để giảm tải API.
