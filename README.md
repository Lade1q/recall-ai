## Project Structure

Dưới đây là sơ đồ cây cấu trúc các thư mục và file trong dự án (loại bỏ các file `.gitkeep`).
Với các thư mục có nhiều tệp cùng loại, cây ghi **số lượng** thay vì liệt kê hết — con số là
số tệp thật trong thư mục đó, không phải ước lượng.

```text
.
├── .github
│   ├── ISSUE_TEMPLATE
│   │   ├── epic.md
│   │   └── task.md
│   └── workflows
│       └── ci.yml
├── .git-blame-ignore-revs
├── .gitignore
├── .husky
│   └── pre-commit
├── .lintstagedrc.cjs
├── .prettierignore
├── .prettierrc
├── README.md
├── docs
│   ├── analysis and design
│   │   ├── ai-examiner-architecture.md
│   │   ├── class-design.md
│   │   ├── dashboard-architecture.md
│   │   ├── database-design.md
│   │   ├── deployment-view.md
│   │   ├── design-system.md
│   │   ├── focus-session-architecture.md
│   │   ├── gemini-api-research.md
│   │   ├── implementation-view.md
│   │   ├── interview-voice-architecture.md
│   │   ├── claude-design            (14 tệp: components.html, screen-*.html, tokens.css…)
│   │   ├── db
│   │   │   └── recall-ai.dbml
│   │   ├── ui-prototype             (14 tệp: README.md, components.html, 11 × screen-*.html, tokens.css)
│   │   └── uml                      (10 tệp .puml: class-*, er-model, state-interview, deployment-view…)
│   ├── api
│   │   ├── auth.md
│   │   ├── focus-sessions.md
│   │   ├── interviews.md
│   │   ├── plans.md
│   │   └── review-queue.md
│   ├── guidelines
│   │   └── coding-conventions.md
│   ├── management
│   │   ├── [vi]pa4-demo-script.md
│   │   ├── pa4-demo-script.md
│   │   ├── sprint-4-spec-audit.md
│   │   ├── technical-spike-s0-report.md
│   │   ├── sprint-plans
│   │   │   ├── s0-fixture-ipv4-classful.json
│   │   │   ├── s0-spike-protocol.md
│   │   │   ├── sprint-4-plan.md
│   │   │   └── sprint-5-plan.md
│   │   ├── sprint-reviews
│   │   │   ├── sprint-3-review.md
│   │   │   └── sprint-4-retrospective.md
│   │   └── weekly-reports
│   │       ├── week-7.md
│   │       └── week-8.md
│   ├── requirements
│   │   ├── use-case_diagram
│   │   │   ├── UC-01_Account.md
│   │   │   ├── UC-02_StudyPlanner.md
│   │   │   ├── UC-03_FocusSession.md
│   │   │   ├── UC-04_AIExaminer.md
│   │   │   ├── UC-05_Dashboard.md
│   │   │   └── UC-Overview.md
│   │   └── use-case_specification
│   │       ├── SPEC_AE-02_PhienKiemTra.md
│   │       ├── SPEC_AE-07_TruyNguocLoHong.md
│   │       ├── SPEC_DB-02_TuongTacDoThi.md
│   │       ├── SPEC_DB-03_LichSuPhongVan.md
│   │       ├── SPEC_FS-01_ThucHienPhienHoc.md
│   │       └── SPEC_SP-01_TaoKeHoach.md
│   └── test
│       ├── test-plan.md
│       ├── bug-reports
│       │   ├── bug-report-template.md
│       │   └── bug-report.md
│       ├── fixtures
│       │   └── search_algorithms.pdf
│       └── test-plans               (8 tệp: TC-*.md, ai-examiner-test-cases.md, test-case-template.md, *.xlsx, rup_tstpln.pdf)
├── pa
│   ├── pa0                          (PA0-Group07.pdf, project-proposal.md)
│   ├── pa1                          (SDP v1.1, UI Prototyping ×7, Vision Document, Weekly Report ×2)
│   ├── pa2                          (SDP v1.2, Use-case model ×6, Use-case Specification)
│   ├── pa3                          (SAD v1.0, Class Diagrams ×3, ER Model, AR-01, UI Design, UC-Spec v2.0, Weekly Report ×2)
│   └── pa4                          (SAD v1.1 .docx/.pdf, Class Diagrams ×3, DV-01, ER-01, tests/ ×10)
├── package-lock.json
├── package.json
├── spike-s0                         ← harness spike S0 (Gemini Live), ngoài cây mã sản phẩm
│   ├── README.md
│   ├── .env.example
│   ├── package.json
│   ├── fixtures
│   │   └── student-vi-16k.wav
│   ├── lib                          (8 tệp .mjs: liveClient, resample, tts, wav, config…)
│   ├── probes                       (7 tệp .mjs: p1-latency, p2-viquality, p3-evidence, p4-auth, p5-echo…)
│   └── runs                         (13 hiện vật: *.jsonl nhật ký đo + *.wav audio mô hình)
└── src
    ├── client
    │   ├── .env.example
    │   ├── README.md
    │   ├── components.json
    │   ├── eslint.config.js
    │   ├── index.html
    │   ├── package.json
    │   ├── tsconfig.json / tsconfig.app.json / tsconfig.node.json
    │   ├── vite.config.ts
    │   ├── public
    │   │   ├── favicon.svg
    │   │   └── icons.svg
    │   └── src
    │       ├── App.tsx
    │       ├── main.tsx
    │       ├── global.css
    │       ├── setupTests.ts
    │       ├── vite-env.d.ts
    │       ├── components
    │       │   ├── shared
    │       │   │   ├── ProtectedRoute.tsx
    │       │   │   └── layouts
    │       │   │       ├── AuthLayout.tsx
    │       │   │       ├── InterviewLayout.tsx
    │       │   │       ├── MainLayout.tsx
    │       │   │       └── focus-overlay-context.ts
    │       │   └── ui                (20 primitive: button, badge, spinner, concept-node, chat-bubble, kbd…)
    │       ├── features             ← tổ chức theo phân hệ, mỗi feature có api/ components/ hooks/ types/ utils/
    │       │   ├── auth              (5 tệp)
    │       │   ├── dashboard         (13 tệp)
    │       │   ├── focus             (28 tệp)
    │       │   ├── interview         (20 tệp)
    │       │   ├── review-queue      (8 tệp)
    │       │   └── study-planner     (17 tệp)
    │       ├── hooks
    │       ├── lib
    │       │   ├── apiClient.ts
    │       │   ├── endpoints.ts
    │       │   └── utils.ts
    │       ├── pages
    │       │   ├── NotFoundPage.tsx
    │       │   ├── auth              (LoginPage.tsx, RegisterPage.tsx)
    │       │   ├── dashboard         (DashboardPage.tsx)
    │       │   ├── focus             (FocusPage.tsx + FocusPage.test.tsx)
    │       │   ├── history           (HistoryPage.tsx)
    │       │   ├── planning          (CreatePlanPage, PlansPage, PlanDetailPage, GraphIndexPage, PlanReviewQueuePage + test)
    │       │   ├── profile           (ProfilePage.tsx)
    │       │   └── verify            (InterviewPage.tsx, InterviewSessionPage.tsx)
    │       ├── types
    │       └── utils
    │           └── test-utils.tsx
    └── server
        ├── .env.example
        ├── README.md
        ├── eslint.config.mjs
        ├── jest.config.js
        ├── package.json
        ├── prisma.config.ts
        ├── tsconfig.json
        ├── prisma
        │   ├── schema.prisma
        │   ├── seed.ts
        │   └── migrations           (14 migration + migration_lock.toml)
        └── src
            ├── app.ts
            ├── server.ts
            ├── config
            │   └── prisma.ts
            ├── controllers          (11 tệp: auth, plan, concept, graph, interview, focus-session, dashboard, document, review-queue, session-note, user)
            ├── jobs
            │   └── stale-job-cleanup.job.ts
            ├── middleware
            │   ├── auth.middleware.ts
            │   ├── errorHandler.ts
            │   └── upload.middleware.ts
            ├── routes               (10 tệp .routes.ts, khớp 1-1 với controllers)
            ├── schemas              (10 tệp Zod: auth, plan, graph, interview, ai-extract, ai-interview, focus-session, review-queue, session-note, user)
            ├── services             (22 tệp: gemini, analysis, plan, graph, interview, scheduling, traceback, concept-*, focus-session, dashboard…)
            ├── types                (6 tệp .types.ts + express/index.d.ts)
            ├── utils                (20 tệp thuần: mastery, dag, checkpoint, evidence-guard, evidence-tally, interview-grading, jwt, pdf…)
            └── __tests__            (62 tệp test Jest + helpers/)
```

### Chi tiết các thư mục chính

- **Các tệp tin cấu hình ở thư mục gốc (Root):**
  - `.github/workflows/ci.yml`: Thiết lập quy trình tích hợp liên tục (CI) tự động cho dự án.
  - `.husky/`: Thư mục quản lý các Git hooks (như tự động kiểm tra định dạng và lint code với `pre-commit` hook).
  - `.lintstagedrc.cjs`: Cấu hình lint-staged để chỉ chạy kiểm tra và định dạng trên các file đã được git stage.
  - `.prettierignore` & `.prettierrc`: Các tệp tin định cấu hình bỏ qua định dạng và luật format mã nguồn của Prettier.
  - `package.json` & `package-lock.json`: Quản lý dependencies, devDependencies và các scripts công cụ dùng chung cho toàn bộ dự án ở thư mục gốc.

- `/src`: Thư mục chứa mã nguồn của ứng dụng.
  - `/src/client`: Mã nguồn dự án FrontEnd (React + Vite + TypeScript).
    - `public/`: Chứa các tài nguyên tĩnh công khai (favicon, các icons SVG dùng chung).
    - `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`: Cấu hình Typescript cho client.
    - `vite.config.ts`: Cấu hình cho Vite bundler.
    - `src/`: Mã nguồn logic của FrontEnd client:
      - `components/`: Chứa các React components dùng chung toàn ứng dụng:
        - `shared/`: Các components layout dùng chung (`AuthLayout.tsx`, `MainLayout.tsx`, `InterviewLayout.tsx`) và Route bảo vệ (`ProtectedRoute.tsx`).
        - `ui/`: Các UI base components (như `button.tsx`, `badge.tsx`, `spinner.tsx`, `concept-node.tsx`, `chat-bubble.tsx`).
      - `features/`: Mã nguồn tổ chức **theo phân hệ** — mỗi feature tự chứa `api/`, `components/`, `hooks/`, `types/`, `utils/` của riêng nó (`auth`, `dashboard`, `focus`, `interview`, `review-queue`, `study-planner`). Đây là nơi chứa phần lớn logic giao diện; thư mục `pages/` chỉ lắp ráp lại theo route.
      - `hooks/` & `types/`: Thư mục dành cho hooks và kiểu dữ liệu dùng chung toàn ứng dụng (hiện các phần này nằm trong từng `features/*`).
      - `lib/`: Chứa các cấu hình thư viện và hàm tiện ích (`utils.ts`, `apiClient.ts` khởi tạo Axios instance tích hợp interceptors tự động gán token, `endpoints.ts` quản lý danh sách hằng số API endpoint).
      - `pages/`: Định nghĩa các trang giao diện của ứng dụng, gắn với route:
        - `auth/`: Các trang đăng nhập (`LoginPage.tsx`) và đăng ký (`RegisterPage.tsx`).
        - `dashboard/`: Trang bảng điều khiển chính (`DashboardPage.tsx`).
        - `focus/`: Trang tập trung học tập Pomodoro (`FocusPage.tsx`).
        - `history/`: Trang lịch sử phỏng vấn (`HistoryPage.tsx`).
        - `planning/`: Trang tạo kế hoạch (`CreatePlanPage.tsx`), danh sách kế hoạch (`PlansPage.tsx`), chi tiết kế hoạch (`PlanDetailPage.tsx`), đồ thị khái niệm (`GraphIndexPage.tsx`) và hàng đợi ôn tập (`PlanReviewQueuePage.tsx`).
        - `profile/`: Trang hồ sơ người dùng (`ProfilePage.tsx`).
        - `verify/`: Trang kiểm tra năng lực và phỏng vấn AI (`InterviewPage.tsx`, `InterviewSessionPage.tsx`).
        - `NotFoundPage.tsx`: Trang lỗi 404 hiển thị khi người dùng truy cập sai đường dẫn.
      - `utils/test-utils.tsx` & `setupTests.ts`: Tiện ích và cấu hình dùng chung cho test phía client (Vitest + Testing Library).
      - `global.css`: Quản lý styles toàn cục và toàn bộ design tokens (**nguồn chân lý** cho giá trị token — xem `docs/analysis and design/design-system.md`).
      - `App.tsx` & `main.tsx`: File cấu hình giao diện chính (chứa Router thiết lập layout) và điểm khởi tạo ứng dụng Client.

  - `/src/server`: Mã nguồn dự án Backend (Node.js + Express + TypeScript).
    - `prisma/`: Chứa cơ sở dữ liệu Prisma bao gồm schema, seed script và migrations.
      - `schema.prisma`: Prisma database schema định nghĩa **15 models** phục vụ lưu trữ tài khoản, kế hoạch học, đồ thị khái niệm, phiên học tập trung, phiên phỏng vấn và hàng đợi ôn tập.
      - `seed.ts`: Script khởi tạo dữ liệu mẫu cho database.
      - `migrations/`: Lịch sử các đợt cập nhật cơ sở dữ liệu (migration).
    - `prisma.config.ts`: Cấu hình Prisma 7 (datasource URL, seed command).
    - `tsconfig.json`: Cấu hình Typescript cho Backend server.
    - `src/`: Mã nguồn logic của Backend server:
      - `config/`: Cấu hình hệ thống (như Prisma Client singleton tại `prisma.ts`).
      - `controllers/`: Tiếp nhận requests, gọi services xử lý logic và trả về responses (ví dụ: `auth.controller.ts`, `interview.controller.ts`).
      - `middleware/`: Middleware trung gian cho Express (như `errorHandler.ts` xử lý lỗi tập trung, `auth.middleware.ts` xác thực quyền truy cập qua JWT, `upload.middleware.ts` nhận tệp tài liệu tải lên).
      - `routes/`: Định nghĩa các API endpoints của ứng dụng (ví dụ: `auth.routes.ts`), khớp 1-1 với `controllers/`.
      - `schemas/`: Các schema xác thực định dạng dữ liệu đầu vào (như Zod schema `auth.schema.ts` validate request body đăng nhập/đăng ký) và các schema JSON cố định dùng khi gọi AI (`ai-extract.schema.ts`, `ai-interview.schema.ts`).
      - `services/`: Tầng xử lý logic nghiệp vụ chi tiết và tương tác database (ví dụ: `auth.service.ts`, `gemini.service.ts`, `scheduling.service.ts`, `traceback.service.ts`).
      - `jobs/`: Các tác vụ chạy nền theo lịch (`stale-job-cleanup.job.ts` dọn các job phân tích treo).
      - `types/`: Chứa các định nghĩa kiểu dữ liệu TypeScript dùng cho backend (`auth.types.ts`, và `express/index.d.ts` bổ sung trường user vào Request).
      - `utils/`: Chứa các hàm **thuần** tái sử dụng, tách khỏi DB/IO để test được độc lập (`jwt.ts` sinh và xác thực JWT, `mastery.ts` tính điểm thành thạo, `dag.ts` xử lý đồ thị khái niệm, `evidence-guard.ts` hàng rào tất định cho bằng chứng chấm điểm).
      - `__tests__/`: Bộ test Jest cho backend.
      - `app.ts`: Khởi tạo và thiết lập các cấu hình cho Express app.
      - `server.ts`: Điểm khởi chạy chính của HTTP server.

- `/docs`: Thư mục chứa tài liệu thiết kế, phân tích, kiểm thử và quản lý dự án.
  - `/docs/management/`: Kế hoạch dự án, báo cáo tiến độ, kịch bản demo.
    - `sprint-plans/`: Kế hoạch từng sprint (`sprint-4-plan.md`, `sprint-5-plan.md`) và giao thức đo của spike S0.
    - `sprint-reviews/` & `weekly-reports/`: Biên bản sơ kết sprint và báo cáo tuần.
    - `technical-spike-s0-report.md`: Báo cáo spike kỹ thuật S0 — đo khả thi Gemini Live cho phỏng vấn giọng nói, kèm chỉ mục hiện vật đo được.
    - `pa4-demo-script.md` / `[vi]pa4-demo-script.md`: Kịch bản demo PA4 (bản tiếng Anh và tiếng Việt).
  - `/docs/requirements/`: Yêu cầu dự án, tài liệu đặc tả (NFRs, Use case, Vision).
    - `use-case_diagram/`: Các tài liệu/sơ đồ Use-case tổng quan và chi tiết cho từng phân hệ.
    - `use-case_specification/`: Đặc tả chi tiết từng Use-case cốt lõi (như Phiên kiểm tra, Tạo kế hoạch, Thực hiện phiên học,...).
  - `/docs/analysis and design/`: Tài liệu phân tích, thiết kế hệ thống, UML, UI design.
    - Tài liệu kiến trúc theo phân hệ: `ai-examiner-architecture.md`, `focus-session-architecture.md`, `dashboard-architecture.md`, `interview-voice-architecture.md` (thiết kế phỏng vấn giọng nói v2), `class-design.md`, `database-design.md`, `implementation-view.md`, `deployment-view.md`, `gemini-api-research.md`.
    - `design-system.md`: Đặc tả hệ thống thiết kế (Design System) của dự án, bao gồm bảng màu (color palette), typography, các tokens và hướng dẫn giao diện (UI guidelines). ⚠️ Giá trị token thật nằm ở `src/client/src/global.css`; khi hai bên lệch nhau, `global.css` đúng.
    - `ui-prototype/`: Bản thiết kế UI cuối cùng — 11 màn hình HTML tương tác + thư viện component + `tokens.css`.
    - `claude-design/`: Bản mockup HTML dùng làm tham chiếu khi hiện thực giao diện.
    - `uml/`: Các sơ đồ UML nguồn (`.puml`) — class diagram, ER model, state machine, deployment view.
    - `db/recall-ai.dbml`: Mô hình cơ sở dữ liệu dạng DBML.
  - `/docs/api/`: Tài liệu đặc tả kỹ thuật chi tiết của các API endpoints (`auth.md`, `plans.md`, `interviews.md`, `focus-sessions.md`, `review-queue.md`).
  - `/docs/test/`: Kế hoạch kiểm thử (`test-plan.md`), kịch bản kiểm thử (`test-plans/`), báo cáo lỗi (`bug-reports/`) và dữ liệu mẫu dùng cho kiểm thử (`fixtures/`).
  - `/docs/guidelines/`: Tài liệu hướng dẫn nội bộ, quy trình làm việc, tiêu chuẩn code.

- `/spike-s0`: Harness của spike kỹ thuật S0 (đo khả thi Gemini Live) — **nằm ngoài cây mã sản phẩm, không được build hay deploy**. Gồm `probes/` (các phép đo độ trễ, chất lượng tiếng Việt, phát bằng chứng, xác thực), `lib/` (client Live, xử lý audio) và `runs/` (nhật ký JSONL + bản ghi audio làm hiện vật cho báo cáo).

- `/pa`: Thư mục chứa các bài tập dự án đã nộp theo từng giai đoạn học tập.
  - `pa/pa0/`: Bài tập nộp đề xuất dự án (Project proposal) và tài liệu định hướng.
  - `pa/pa1/`: Bài tập Sprint 1 (Kế hoạch dự án bản 1.1, thiết kế giao diện UI Prototyping, Vision Document và Báo cáo tuần).
  - `pa/pa2/`: Bài tập Sprint 2 (Kế hoạch dự án bản 1.2, sơ đồ Use-case và tài liệu Đặc tả Use-case đầy đủ).
  - `pa/pa3/`: Bài tập Sprint 3 (Tài liệu Kiến trúc phần mềm bản 1.0, Class Diagram, ER Model, sơ đồ kiến trúc 3 tầng, UI Design, Đặc tả Use-case bản 2.0 và Báo cáo tuần).
  - `pa/pa4/`: Bài tập Sprint 4 (Tài liệu Kiến trúc phần mềm bản 1.1, Class Diagram bổ sung cho Focus Session/Dashboard/AI Examiner, Deployment View, ER Model cập nhật và toàn bộ hồ sơ kiểm thử: test plan, test cases, bug report, ảnh chụp kết quả chạy e2e).
