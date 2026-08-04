# Quy tắc Viết Code (Coding Conventions) - Planning AI

> **Phiên bản:** v1.0
> **Ngày tạo:** 2026-06-29
> **Áp dụng cho:** Toàn bộ team phát triển Planning AI
> **Trạng thái:** Có hiệu lực

---

## 1. Nguyên tắc Chung (General Principles)

### 1.1. Nguyên tắc "Nấc Thang Tận Dụng Nền Tảng" (Platform Leverage Ladder)

Đây là nguyên tắc cốt lõi của team. Khi cần giải quyết một vấn đề, developer PHẢI kiểm tra từng nấc thang theo thứ tự và **dừng ở nấc đầu tiên** có giải pháp:

```
Nấc 1: Trình duyệt có sẵn chưa?
  --> Nếu CÓ --> DÙNG. Không cài thêm thư viện.

Nấc 2: Ngôn ngữ (TypeScript/JavaScript) có built-in chưa?
  --> Nếu CÓ --> DÙNG. Không viết utility function.

Nấc 3: Thư viện đã cài trong dự án có sẵn chưa?
  --> Nếu CÓ --> trade off giữa thư viện đã cài với thư viện có ý định thêm vào.

Nấc 4: Nếu cả 3 nấc trên đều KHÔNG có --> Mới viết code mới hoặc cài thư viện mới.
  --> Khi cài thư viện mới: phải ghi lý do vào PR description.
```

#### Ví dụ 1: Chọn ngày (Date Picker)

```tsx
// SAI - Cài thêm thư viện react-datepicker khi shadcn/ui đã có sẵn
import DatePicker from 'react-datepicker';

function DueDateInput() {
  return <DatePicker selected={date} onChange={setDate} />;
}
```

```tsx
// ĐÚNG - Nấc 3: Dùng DatePicker của shadcn/ui (thư viện đã có trong dự án)
import { DatePicker } from '@/components/ui/date-picker';

function DueDateInput() {
  return <DatePicker date={date} onDateChange={setDate} />;
}
```

#### Ví dụ 2: Định dạng ngày giờ

```typescript
// SAI - Cài thêm moment.js hoặc date-fns chỉ để format ngày
import { format } from 'date-fns';
const formatted = format(new Date(), 'dd/MM/yyyy');
```

```typescript
// ĐÚNG - Nấc 1: Trình duyệt có sẵn Intl.DateTimeFormat
const formatted = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
}).format(new Date());
```

#### Ví dụ 3: Sao chép đối tượng (Deep Clone)

```typescript
// SAI - Cài thêm lodash chỉ để dùng cloneDeep
import { cloneDeep } from 'lodash';
const copy = cloneDeep(originalObject);
```

```typescript
// ĐÚNG - Nấc 2: JavaScript có sẵn structuredClone()
const copy = structuredClone(originalObject);
```

#### Ví dụ 4: Gọi HTTP Request

```typescript
// SAI - Viết wrapper function bọc lại Axios khi Axios đã có interceptor
function apiGet(url: string) {
  return axios.get(url, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
}
```

```typescript
// ĐÚNG - Nấc 3: Cấu hình Axios interceptor 1 lần, dùng trực tiếp
// file: src/lib/axios.ts (cấu hình 1 lần)
const api = axios.create({ baseURL: '/api/v1' });
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
export default api;

// file: sử dụng trực tiếp
import api from '@/lib/axios';
const plans = await api.get('/plans');
```

#### Ví dụ 5: Hộp thoại Modal / Dialog

```tsx
// SAI - Cài thêm react-modal khi shadcn/ui đã có Dialog
import Modal from 'react-modal';

function ConfirmDelete() {
  return <Modal isOpen={isOpen}>Bạn có chắc muốn xóa?</Modal>;
}
```

```tsx
// ĐÚNG - Nấc 3: Dùng Dialog của shadcn/ui
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

function ConfirmDelete() {
  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Xác nhận xóa</DialogTitle>
        </DialogHeader>
        <p>Bạn có chắc muốn xóa?</p>
      </DialogContent>
    </Dialog>
  );
}
```

#### Ví dụ 6: Nhóm mảng theo điều kiện

```typescript
// SAI - Tự viết hàm groupBy
function groupBy<T>(arr: T[], key: keyof T): Record<string, T[]> {
  return arr.reduce(
    (acc, item) => {
      const k = String(item[key]);
      (acc[k] = acc[k] || []).push(item);
      return acc;
    },
    {} as Record<string, T[]>
  );
}
const grouped = groupBy(tasks, 'category');
```

```typescript
// ĐÚNG - Nấc 2: JavaScript có sẵn Object.groupBy()
const grouped = Object.groupBy(tasks, (task) => task.category);
```

### 1.2. YAGNI (You Aren't Gonna Need It)

Chỉ viết code cho yêu cầu hiện tại. Không viết code "phòng khi cần sau này".

```typescript
// SAI - Viết sẵn hệ thống plugin khi chưa có yêu cầu
interface Plugin {
  name: string;
  execute(): void;
}
class PluginManager {
  private plugins: Plugin[] = [];
  register(plugin: Plugin) {
    this.plugins.push(plugin);
  }
  executeAll() {
    this.plugins.forEach((p) => p.execute());
  }
}
```

```typescript
// ĐÚNG - Viết trực tiếp logic cần thiết
async function createPlan(input: CreatePlanInput) {
  const aiResponse = await geminiService.generatePlan(input);
  return prisma.plan.create({ data: { ...aiResponse, userId: input.userId } });
}
```

### 1.3. DRY (Don't Repeat Yourself)

Khi một đoạn logic xuất hiện **từ 3 lần trở lên**, mới tách thành hàm/component chung. 2 lần chưa cần tách.

### 1.4. Quy tắc Đặt tên (Naming Conventions)

| Đối tượng          | Quy tắc            | Ví dụ                             |
| ------------------ | ------------------ | --------------------------------- |
| Biến, hàm (JS/TS)  | camelCase          | `userName`, `getPlanById()`       |
| Component React    | PascalCase         | `PlanCard`, `FocusTimer`          |
| Hằng số            | UPPER_SNAKE_CASE   | `MAX_RETRY_COUNT`, `API_BASE_URL` |
| File component     | PascalCase         | `PlanCard.tsx`, `FocusTimer.tsx`  |
| File tiện ích/hook | camelCase          | `useAuth.ts`, `formatDate.ts`     |
| File CSS module    | kebab-case         | `plan-card.module.css`            |
| Thư mục            | kebab-case         | `focus-session/`, `auth-guard/`   |
| Interface/Type     | PascalCase         | `PlanResponse`, `CreateTaskInput` |
| Giá trị Enum       | PascalCase         | `TaskStatus.InProgress`           |
| Bảng Prisma        | PascalCase (số ít) | `User`, `FocusSession`            |
| Cột Prisma         | camelCase          | `userId`, `createdAt`             |

Ngôn ngữ trong code: **Tiếng Anh**. Comment có thể dùng tiếng Việt khi cần giải thích business logic phức tạp.

---

## 2. TypeScript

### 2.1. Strict Mode bắt buộc

File `tsconfig.json` PHẢI bật strict mode:

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true
  }
}
```

### 2.2. Cấm sử dụng `any`

```typescript
// SAI - Dùng any
function processData(data: any) {
  return data.name;
}
```

```typescript
// ĐÚNG - Dùng unknown + type guard
function processData(data: unknown): string {
  if (typeof data === 'object' && data !== null && 'name' in data) {
    return (data as { name: string }).name;
  }
  throw new Error('Định dạng dữ liệu không hợp lệ');
}
```

### 2.3. Quy tắc Type Annotation

**Bắt buộc annotation:** Tham số hàm, return type của hàm public/exported, biến khai báo không gán giá trị.

**Cho phép infer:** Biến có gán giá trị ngay, biến trong scope nhỏ (trong hàm).

```typescript
// Bắt buộc annotation cho exported function
export function calculateScore(answers: string[], correct: string[]): number {
  // Cho phép infer cho biến local
  const total = answers.length;
  const matched = answers.filter((a, i) => a === correct[i]).length;
  return (matched / total) * 100;
}
```

### 2.4. Union Type thay vì Enum (ưu tiên)

```typescript
// Ưu tiên: Union type - nhẹ hơn, tree-shake tốt hơn
type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';
type TaskCategory = 'academic' | 'lifestyle';

// Chấp nhận: Const object khi cần nhóm giá trị phức tạp
const TASK_STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
} as const;
type TaskStatus2 = (typeof TASK_STATUS)[keyof typeof TASK_STATUS];
```

### 2.5. Interface vs Type

- **Interface:** Dùng cho object shape, đặc biệt khi cần extends/implements.
- **Type:** Dùng cho union, intersection, utility types, mapped types.

```typescript
// Interface cho object shape
interface User {
  id: string;
  email: string;
  name: string;
}

// Type cho union, utility
type CreateUserInput = Omit<User, 'id'>;
type ApiResponse<T> = { success: true; data: T } | { success: false; error: string };
```

### 2.6. Import/Export

- Dùng named export (không dùng default export), ngoại trừ page component.
- Nhóm import theo thứ tự: (1) thư viện ngoài, (2) alias nội bộ `@/`, (3) relative path.

```typescript
// Thứ tự import
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';

import { PlanCard } from './PlanCard';
import type { PlanListProps } from './types';
```

---

## 3. Frontend (React + Tailwind + shadcn/ui)

### 3.1. Cấu trúc Component

Luôn dùng functional component. Định nghĩa Props bằng interface riêng.

```tsx
// ĐÚNG - Props interface tách riêng, named export
interface PlanCardProps {
  plan: Plan;
  onDelete: (id: string) => void;
  isLoading?: boolean;
}

export function PlanCard({ plan, onDelete, isLoading = false }: PlanCardProps) {
  if (isLoading) {
    return <Skeleton className="h-32 w-full" />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{plan.title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p>{plan.description}</p>
        <Button variant="destructive" onClick={() => onDelete(plan.id)}>
          Xóa
        </Button>
      </CardContent>
    </Card>
  );
}
```

### 3.2. shadcn/ui: Ưu tiên Component có sẵn

Trước khi tự viết component UI, kiểm tra shadcn/ui có component tương tự chưa. Nếu có, dùng và customize qua props hoặc className. Không fork/copy-paste rồi sửa.

```tsx
// SAI - Tự viết button component
function MyButton({ children, ...props }: ButtonProps) {
  return (
    <button className="rounded bg-blue-500 px-4 py-2 text-white" {...props}>
      {children}
    </button>
  );
}
```

```tsx
// ĐÚNG - Dùng Button của shadcn/ui, customize qua variant và className
import { Button } from '@/components/ui/button';

<Button variant="default" className="w-full">
  Tạo kế hoạch
</Button>;
```

### 3.3. Tailwind: Quy tắc sắp xếp Class

Thứ tự sắp xếp class Tailwind: layout -> sizing -> spacing -> typography -> visual -> interactive -> responsive.

```tsx
// ĐÚNG - Thứ tự rõ ràng
<div className="flex flex-col w-full max-w-md p-4 gap-3 text-sm text-gray-700 bg-white rounded-lg shadow-md hover:shadow-lg md:flex-row">
```

Khi danh sách class quá dài (trên 5-6 utility), cân nhắc tách thành component thay vì dùng `@apply`.

### 3.4. State Management

| Tình huống                      | Giải pháp                |
| ------------------------------- | ------------------------ |
| State cục bộ 1 component        | `useState`               |
| State phức tạp với nhiều action | `useReducer`             |
| State chia sẻ 2-3 component gần | Lifting state up (props) |
| State toàn cục (auth, theme)    | React Context            |
| Server state (dữ liệu API)      | Custom hook với Axios    |

### 3.5. Custom Hooks

- Đặt tên bắt đầu bằng `use`: `useAuth`, `usePlans`, `useFocusTimer`.
- Mỗi hook làm 1 việc duy nhất.
- Đặt trong thư mục `src/hooks/`.

```typescript
// Ví dụ: Custom hook quản lý danh sách kế hoạch
export function usePlans() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPlans = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await api.get<Plan[]>('/plans');
      setPlans(response.data);
    } catch (err) {
      setError('Không thể tải danh sách kế hoạch');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  return { plans, isLoading, error, refetch: fetchPlans };
}
```

### 3.6. Protected Routes

```tsx
// Component bảo vệ route cần đăng nhập
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) return <LoadingSpinner />;
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

// Sử dụng trong router
<Route
  path="/dashboard"
  element={
    <ProtectedRoute>
      <DashboardPage />
    </ProtectedRoute>
  }
/>;
```

---

## 4. Backend (Node.js + Express.js)

### 4.1. Cấu trúc Thư mục

```
src/
  routes/          --> Định nghĩa endpoint, gọi controller
  controllers/     --> Nhận request, gọi service, trả response
  services/        --> Business logic, gọi repository/external API
  repositories/    --> Truy vấn database (Prisma)
  middlewares/     --> Auth, validation, error handler
  utils/           --> Hàm tiện ích dùng chung
  types/           --> Type/interface dùng chung
  config/          --> Cấu hình ứng dụng
  app.ts           --> Khởi tạo Express app
  server.ts        --> Entry point
```

Luồng dữ liệu: `Route -> Controller -> Service -> Repository -> Database`

### 4.2. Middleware Pattern

```typescript
// Middleware xác thực JWT
export function authenticate(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    throw new AppError('Token không được cung cấp', 401);
  }

  try {
    const payload = jwt.verify(token, config.jwtSecret) as JwtPayload;
    req.user = payload;
    next();
  } catch {
    throw new AppError('Token không hợp lệ hoặc đã hết hạn', 401);
  }
}
```

### 4.3. Xử lý Lỗi (Error Handling)

Dùng custom error class và centralized error handler:

```typescript
// Lớp lỗi tùy chỉnh
export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number,
    public code?: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

// Middleware xử lý lỗi tập trung (đặt cuối cùng)
export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: { code: err.code, message: err.message },
    });
  }

  console.error('Lỗi không xử lý được:', err);
  return res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'Lỗi hệ thống' },
  });
}
```

### 4.4. Validation với Zod

Validate ở controller layer trước khi gọi service:

```typescript
import { z } from 'zod';

// Schema xác thực
const createPlanSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(5000),
  category: z.enum(['academic', 'lifestyle']).optional(),
});

type CreatePlanInput = z.infer<typeof createPlanSchema>;

// Controller
export async function createPlan(req: Request, res: Response) {
  const input = createPlanSchema.parse(req.body); // Tự động throw ZodError nếu sai
  const plan = await planService.create(input, req.user.id);
  return res.status(201).json({ success: true, data: plan });
}
```

### 4.5. Định dạng Response chuẩn hóa

```typescript
// Thành công
{ success: true, data: { id: "...", title: "..." } }
{ success: true, data: [...], meta: { page: 1, limit: 20, total: 100 } }

// Lỗi
{ success: false, error: { code: "VALIDATION_ERROR", message: "...", details: [...] } }
{ success: false, error: { code: "NOT_FOUND", message: "Kế hoạch không tồn tại" } }
```

### 4.6. Async/Await

Luôn dùng `async/await`. Bọc controller bằng wrapper để bắt lỗi tự động:

```typescript
// Wrapper tránh try-catch lặp lại
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

// Sử dụng
router.post('/plans', authenticate, asyncHandler(createPlan));
```

---

## 5. Database (Prisma + PostgreSQL)

### 5.1. Quy ước Schema

```prisma
// Tên bảng: PascalCase, số ít (singular)
model User {
  id            String         @id @default(uuid())
  email         String         @unique
  passwordHash  String         @map("password_hash")
  name          String
  createdAt     DateTime       @default(now()) @map("created_at")
  updatedAt     DateTime       @updatedAt @map("updated_at")

  plans         Plan[]
  focusSessions FocusSession[]

  @@map("users") // Tên bảng trong DB: snake_case, số nhiều
}

model Plan {
  id            String   @id @default(uuid())
  userId        String   @map("user_id")
  title         String
  description   String
  aiRawResponse String?  @map("ai_raw_response")
  status        String   @default("draft")
  createdAt     DateTime @default(now()) @map("created_at")

  user  User   @relation(fields: [userId], references: [id])
  tasks Task[]

  @@map("plans")
}
```

Quy tắc:

- Model name: PascalCase, số ít (`User`, không phải `Users`)
- Field name: camelCase trong Prisma (`userId`)
- Column name trong DB: snake_case, dùng `@map()` (`user_id`)
- Table name trong DB: snake_case số nhiều, dùng `@@map()` (`users`)

### 5.2. Quy tắc Migration

- Mỗi migration chỉ chứa **1 thay đổi logic** (thêm bảng, thêm cột, đổi index...).
- Luôn đặt tên migration có ý nghĩa: `npx prisma migrate dev --name add_verification_table`.
- Trước khi migration: chạy `npx prisma format` để đảm bảo schema sạch.
- Không sửa trực tiếp file migration đã tạo.

### 5.3. Quy tắc Query

```typescript
// ĐÚNG - Dùng Prisma Client
const plans = await prisma.plan.findMany({
  where: { userId, status: 'active' },
  include: { tasks: true },
  orderBy: { createdAt: 'desc' },
  take: 20,
  skip: 0,
});
```

```sql
-- SAI - Tránh raw SQL trừ khi Prisma không hỗ trợ (vd: full-text search phức tạp)
SELECT * FROM plans WHERE user_id = $1 AND status = 'active' ORDER BY created_at DESC;
```

### 5.4. Dữ liệu Seed

File seed đặt tại `prisma/seed.ts`. Dữ liệu seed phải idempotent (chạy nhiều lần không bị trùng):

```typescript
async function seed() {
  // Dùng upsert thay vì create để đảm bảo idempotent
  await prisma.user.upsert({
    where: { email: 'test@example.com' },
    update: {},
    create: {
      email: 'test@example.com',
      passwordHash: await bcrypt.hash('password123', 10),
      name: 'Test User',
    },
  });
}
```

---

## 6. Thiết kế API (REST)

### 6.1. Quy tắc Đặt tên URL

- Dùng **kebab-case**, **danh từ số nhiều**
- Prefix: `/api/v1/`

```
ĐÚNG:
  GET    /api/v1/plans
  GET    /api/v1/plans/:id
  POST   /api/v1/plans
  PATCH  /api/v1/plans/:id
  DELETE /api/v1/plans/:id
  GET    /api/v1/focus-sessions
  POST   /api/v1/verifications

SAI:
  GET    /api/v1/getPlan        --> Không dùng động từ trong URL
  GET    /api/v1/plan           --> Phải dùng số nhiều
  GET    /api/v1/focusSessions  --> Phải dùng kebab-case
```

### 6.2. HTTP Methods

| Phương thức | Ý nghĩa                           | Ví dụ                                    |
| ----------- | --------------------------------- | ---------------------------------------- |
| GET         | Lấy dữ liệu, không thay đổi state | `GET /plans` - Lấy danh sách kế hoạch    |
| POST        | Tạo resource mới                  | `POST /plans` - Tạo kế hoạch mới         |
| PUT         | Thay thế toàn bộ resource         | `PUT /plans/:id` - Thay thế kế hoạch     |
| PATCH       | Cập nhật một phần resource        | `PATCH /plans/:id` - Cập nhật trạng thái |
| DELETE      | Xóa resource                      | `DELETE /plans/:id` - Xóa kế hoạch       |

### 6.3. HTTP Status Codes

| Mã  | Khi nào dùng                                      |
| --- | ------------------------------------------------- |
| 200 | Thành công (GET, PATCH, DELETE)                   |
| 201 | Tạo thành công (POST)                             |
| 204 | Thành công, không có body (DELETE không trả data) |
| 400 | Request không hợp lệ (validation thất bại)        |
| 401 | Chưa xác thực (thiếu hoặc sai token)              |
| 403 | Không có quyền truy cập resource này              |
| 404 | Resource không tồn tại                            |
| 409 | Conflict (vd: email đã tồn tại)                   |
| 500 | Lỗi server không xác định                         |

### 6.4. Định dạng Response

```typescript
// Thành công - 1 resource
{
  "success": true,
  "data": {
    "id": "uuid-123",
    "title": "Kế hoạch ôn thi",
    "status": "active"
  }
}

// Thành công - danh sách có phân trang
{
  "success": true,
  "data": [...],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 45,
    "totalPages": 3
  }
}

// Lỗi
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Tiêu đề kế hoạch không được để trống",
    "details": [
      { "field": "title", "message": "Bắt buộc nhập" }
    ]
  }
}
```

### 6.5. JWT

- Gửi qua header: `Authorization: Bearer <token>`
- KHÔNG gửi qua cookie hoặc query parameter
- Token bao gồm: `{ userId, email, iat, exp }`
- Thời hạn token: 7 ngày (có thể điều chỉnh)

### 6.6. Phân trang (Pagination)

Sử dụng offset-based pagination cho MVP (đơn giản, đủ dùng):

```
GET /api/v1/plans?page=1&limit=20
GET /api/v1/plans?page=2&limit=20&sort=createdAt&order=desc
```

---

## 7. Git và Code Review

### 7.1. Đặt tên Nhánh (Branch Naming)

```
feature/plan-creation      --> Tính năng mới
bugfix/fix-login-error     --> Sửa lỗi
docs/coding-conventions    --> Tài liệu
hotfix/fix-critical-bug    --> Sửa lỗi khẩn cấp trên production
refactor/auth-middleware   --> Tái cấu trúc code
```

### 7.2. Commit Message (Conventional Commits)

Định dạng: `<type>: <mô tả ngắn>`

```
feat: add plan creation API endpoint
fix: resolve JWT expiration check error
docs: add coding conventions for team
refactor: extract auth middleware to separate file
test: add unit tests for plan service
chore: update dependencies to latest versions
style: fix Tailwind class ordering in PlanCard
```

Quy tắc:

- Dòng đầu: tối đa 72 ký tự, bắt đầu bằng type, dùng tiếng Anh
- Body (tùy chọn): giải thích **tại sao**, không phải **làm gì**
- Không dùng dấu chấm cuối dòng đầu

### 7.3. Danh sách Kiểm tra Pull Request (PR Checklist)

Trước khi tạo PR, developer tự kiểm tra:

- [ ] Code đã self-review (đọc lại toàn bộ diff)
- [ ] Không còn `console.log` dùng để debug
- [ ] Lint và TypeScript check pass (`npm run lint && npm run type-check`)
- [ ] Các test liên quan đã pass
- [ ] Không có file thừa (`.env`, `node_modules`, file tạm)
- [ ] PR description mô tả rõ thay đổi và lý do

### 7.4. Hướng dẫn Code Review

Người review tập trung vào:

1. **Logic và tính đúng đắn:** Code có làm đúng việc cần làm không?
2. **Bảo mật:** Có lỗ hổng bảo mật không? (SQL injection, XSS, thiếu auth check)
3. **Hiệu suất:** Có query N+1, vòng lặp không cần thiết không?
4. **Platform Leverage Ladder:** Có vi phạm nguyên tắc "nấc thang" không?
5. **Naming và readability:** Tên biến/hàm có diễn đạt đúng ý nghĩa không?

Không review:

- Code style (đã có Prettier + ESLint tự động xử lý)
- Thứ tự import (đã có ESLint rule)

---

## 8. Testing (Frontend)

- Sử dụng **Vitest** kết hợp với **React Testing Library**.
- **Vị trí đặt file test:** Đặt cùng cấp với component, sử dụng đuôi `*.test.tsx`.
- **Nguyên tắc test FE:** Không phụ thuộc API/Server thật, bắt buộc mock dữ liệu hoặc truyền qua props.
- Không test implementation detail (như state bên trong), hãy test behavior (thao tác người dùng lên UI thay đổi ra sao).
