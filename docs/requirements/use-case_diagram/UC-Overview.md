# Use-Case Overview - Recall AI

---

## 1. Danh sách Actors

| #   | Actor                               | Loại                  | Mô tả                                                                                                            | UC tham gia                                     |
| --- | ----------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| 1   | **Student**                         | Primary Actor (Human) | Người dùng cuối duy nhất - sinh viên năm 1-2 ngành kỹ thuật/KHTN                                                 | Hầu hết 42 UC                                   |
| 2   | **AI Service (Google Gemini)**      | External System Actor | LLM bên ngoài, **4 calls cố định**: `extract_concepts`, `generate_question`, `grade_answer`, `summarize_session` | SP-01, AE-02, AE-06, AE-09                      |
| 3   | **Scheduling & Remediation Engine** | Internal System Actor | Module thuật toán tất định: priority queue (lập lịch) + BFS ngược (traceback) - unit-testable, không gọi AI      | SP-01, SP-07, FS-01, FS-06, AE-07, DB-01, DB-04 |
| 4   | **Google OAuth**                    | External System Actor | Dịch vụ xác thực Google - dùng trong luồng thay thế đăng ký/đăng nhập                                            | AM-01, AM-02                                    |

---

## 2. Bảng tóm tắt toàn bộ 42 Use-case

### MODULE 1: ACCOUNT MANAGEMENT (AM)

| ID    | Tên Use-case                         | Actors                | Priority | MVP?        |
| ----- | ------------------------------------ | --------------------- | -------- | ----------- |
| AM-01 | Đăng ký tài khoản                    | Student, Google OAuth | Medium   | ✅          |
| AM-02 | Đăng nhập                            | Student, Google OAuth | High     | ✅          |
| AM-03 | Quản lý hồ sơ cá nhân                | Student               | Low      | ✅          |
| AM-04 | Đăng xuất                            | Student               | Low      | ✅          |
| AM-05 | Quên mật khẩu / Đặt lại mật khẩu     | Student               | Medium   | ✅          |
| AM-06 | Liên kết / Hủy liên kết Google OAuth | Student, Google OAuth | Low      | ⚠️ POST-MVP |

### MODULE 2: AI STUDY PLANNER - INGEST & MAP (SP)

| ID    | Tên Use-case                                         | Actors                                               | Priority | MVP?        |
| ----- | ---------------------------------------------------- | ---------------------------------------------------- | -------- | ----------- |
| SP-01 | Tạo kế hoạch ôn tập mới                              | Student, AI Service, Scheduling & Remediation Engine | **High** | ✅          |
| SP-02 | Xem & chỉnh sửa đồ thị khái niệm                     | Student                                              | **High** | ✅          |
| SP-03 | Xem danh sách kế hoạch                               | Student                                              | Medium   | ✅          |
| SP-04 | Xóa / lưu trữ kế hoạch                               | Student                                              | Low      | ✅          |
| SP-05 | Re-analyze / Cập nhật đồ thị khi tài liệu thay đổi   | Student, AI Service, Scheduling & Remediation Engine | **High** | ✅          |
| SP-06 | Xử lý phân tích tài liệu bất đồng bộ (Async Polling) | Student, AI Service                                  | **High** | ✅          |
| SP-07 | Xem lịch ôn tập (Schedule View)                      | Student, Scheduling & Remediation Engine             | Medium   | ✅ Sprint 4 |
| SP-08 | Chỉnh sửa lịch ôn tập thủ công                       | Student, Scheduling & Remediation Engine             | Medium   | ✅ Sprint 4 |
| SP-09 | Đặt lại mastery score của kế hoạch (Reset)           | Student                                              | Low      | ✅ Sprint 5 |
| SP-10 | Import kế hoạch từ file                              | Student                                              | Low      | ❌ POST-MVP |

### MODULE 3: FOCUS SESSION (FS)

| ID    | Tên Use-case                                           | Actors                                   | Priority | MVP?          |
| ----- | ------------------------------------------------------ | ---------------------------------------- | -------- | ------------- |
| FS-01 | Bắt đầu phiên Focus Session                            | Student, Scheduling & Remediation Engine | **High** | ✅            |
| FS-02 | Cấu hình phương pháp học (Pomodoro Settings)           | Student                                  | Medium   | ✅            |
| FS-03 | Xem lịch sử phiên Focus Session                        | Student                                  | Medium   | ✅            |
| FS-04 | Xem tài liệu gốc trong phiên học                       | Student                                  | Low      | ✅ Sprint 4-5 |
| FS-05 | Ghi chú nhanh trong phiên học                          | Student                                  | Low      | ✅ Sprint 4-5 |
| FS-06 | Xem gợi ý khái niệm từ Scheduling & Remediation Engine | Student, Scheduling & Remediation Engine | **High** | ✅            |
| FS-07 | Xem thống kê học tập (Streak & Total Hours)            | Student                                  | Medium   | ✅ Sprint 5   |

### MODULE 4: AI EXAMINER - INTERVIEW (AE)

| ID    | Tên Use-case                                           | Actors                                               | Priority | MVP?        |
| ----- | ------------------------------------------------------ | ---------------------------------------------------- | -------- | ----------- |
| AE-01 | Cấu hình & Bắt đầu phiên Interview mới                 | Student, Scheduling & Remediation Engine             | **High** | ✅          |
| AE-02 | Phiên Interview vấn đáp nhiều lượt (State Machine)     | Student, AI Service, Scheduling & Remediation Engine | **High** | ✅          |
| AE-03 | Tạm dừng và Tiếp tục phiên Interview                   | Student                                              | **High** | ✅          |
| AE-04 | Bỏ qua khái niệm trong phiên (Skip Concept)            | Student                                              | Medium   | ✅ Sprint 5 |
| AE-05 | Fallback - Tự chấm bằng Flashcard tĩnh                 | Student                                              | **High** | ✅          |
| AE-06 | Pre-generate & Cache câu hỏi (Background)              | AI Service                                           | **High** | ✅          |
| AE-07 | Truy ngược khái niệm tiên quyết (Concept Traceback) ⭐ | Scheduling & Remediation Engine                      | **High** | ✅          |
| AE-08 | Thông báo kết quả Traceback cho Student                | Student                                              | Medium   | ✅          |
| AE-09 | Xem kết quả tổng hợp cuối phiên                        | Student, AI Service                                  | **High** | ✅          |
| AE-10 | Phản hồi / Khiếu nại kết quả chấm điểm                 | Student                                              | Low      | ✅ Sprint 5 |

### MODULE 5: DASHBOARD & VISUALIZATION (DB)

| ID    | Tên Use-case                                  | Actors                                   | Priority | MVP?          |
| ----- | --------------------------------------------- | ---------------------------------------- | -------- | ------------- |
| DB-01 | Xem Dashboard tổng quan                       | Student, Scheduling & Remediation Engine | **High** | ✅            |
| DB-02 | Tương tác với Concept Graph Visualization     | Student                                  | **High** | ✅            |
| DB-03 | Xem lịch sử phiên Interview                   | Student                                  | Medium   | ✅ Sprint 5   |
| DB-04 | Nhận nhắc nhở ôn tập chủ động (Agentic)       | Scheduling & Remediation Engine, Student | **High** | ✅            |
| DB-05 | Lọc / Tìm kiếm khái niệm trên đồ thị          | Student                                  | **High** | ✅            |
| DB-06 | Xem chi tiết khái niệm (Concept Detail Panel) | Student                                  | **High** | ✅            |
| DB-07 | Xem lịch & Deadline sắp tới (Calendar View)   | Student, Scheduling & Remediation Engine | Medium   | ✅ Sprint 4-5 |
| DB-08 | Xem lịch sử phiên Focus Session               | Student                                  | Medium   | ✅ Sprint 5   |
| DB-09 | Điều chỉnh gợi ý ôn tập (Dismiss / Snooze)    | Student                                  | Medium   | ✅ Sprint 5   |

---

## 3. Sơ đồ quan hệ Use-case

### Quan hệ <\<include\>> và <\<extend\>>

```
═══════════════════════════════════════════════════════════
  MODULE ACCOUNT MANAGEMENT
═══════════════════════════════════════════════════════════
AM-02 (Đăng nhập)
  └── <<extend>> AM-05 (Quên mật khẩu) - khi click "Quên mật khẩu?"
AM-03 (Quản lý hồ sơ)
  └── <<include>> AM-06 (Liên kết Google) - POST-MVP

═══════════════════════════════════════════════════════════
  MODULE STUDY PLANNER
═══════════════════════════════════════════════════════════
SP-01 (Tạo kế hoạch)
  ├── <<include>> AI Service (extract_concepts)
  ├── <<include>> SP-02 (Xem & chỉnh sửa đồ thị)
  ├── <<include>> Scheduling & Remediation Engine (tạo lịch đầu)
  └── <<extend>> SP-06 (Async Polling - khi timeout > 30s)

SP-05 (Re-analyze)
  ├── <<include>> AI Service
  └── <<include>> SP-02 (Review đồ thị sau re-analyze)

SP-08 (Chỉnh sửa lịch) <<extend>> SP-07 (Xem lịch)

═══════════════════════════════════════════════════════════
  MODULE FOCUS SESSION
═══════════════════════════════════════════════════════════
FS-01 (Bắt đầu Focus Session)
  ├── <<include>> FS-06 (Xem gợi ý từ Scheduling & Remediation Engine)
  ├── <<include>> FS-02 (Cấu hình Pomodoro - nếu Student muốn)
  ├── <<extend>> FS-04 (Xem tài liệu gốc - tùy chọn)
  └── <<extend>> FS-05 (Ghi chú nhanh - tùy chọn)

FS-07 (Thống kê) <<extend>> FS-03 (Lịch sử phiên học)

═══════════════════════════════════════════════════════════
  MODULE AI EXAMINER
═══════════════════════════════════════════════════════════
AE-01 (Cấu hình phiên)
  ├── <<sequence>> AE-02 (Interview chạy sau cấu hình)
  └── <<extend>> AE-03 (Tiếp tục phiên dở - khi phát hiện PAUSED)

AE-02 (Phiên Interview)
  ├── <<include>> AI Service (generate_question + grade_answer)
  ├── <<include>> AE-07 (Traceback - khi verdict=wrong & has_prereqs)
  ├── <<extend>> AE-05 (Fallback Flashcard - khi AI fail)
  ├── <<extend>> AE-03 (Tạm dừng - khi Student click Pause)
  └── <<extend>> AE-04 (Skip Concept - khi Student click Bỏ qua)

AE-05 (Fallback Flashcard) ← phụ thuộc AE-06 (Cache câu hỏi)
AE-06 (Pre-generate Cache) <<include>> AI Service

AE-07 (Traceback)
  ├── <<include>> Scheduling & Remediation Engine (prepend_to_next_session)
  └── <<sequence>> AE-08 (Thông báo kết quả traceback)

AE-09 (Kết quả tổng hợp)
  ├── <<include>> AI Service (summarize_session)
  ├── <<include>> AE-08 (Hiển thị traceback info)
  └── <<extend>> AE-10 (Khiếu nại điểm - tùy chọn)

═══════════════════════════════════════════════════════════
  MODULE DASHBOARD & VISUALIZATION
═══════════════════════════════════════════════════════════
DB-01 (Dashboard)
  ├── <<include>> DB-02 (mini Concept Graph)
  ├── <<include>> DB-04 (Gợi ý hôm nay từ Scheduling & Remediation Engine)
  └── <<extend>> DB-07 (Deadline Calendar - khi click "Xem lịch")

DB-02 (Concept Graph)
  ├── <<extend>> DB-05 (Lọc/Tìm kiếm - khi Student click filter)
  └── <<extend>> DB-06 (Concept Detail Panel - khi click node)

DB-06 (Concept Detail Panel)
  ├── <<extend>> AE-01 (Bắt đầu Interview từ đây)
  └── <<extend>> FS-01 (Bắt đầu Focus Session từ đây)

DB-04 (Agentic Reminder)
  └── <<extend>> DB-09 (Dismiss/Snooze - khi Student muốn điều chỉnh)

DB-03 (Lịch sử Interview) ↔ [tabs với] DB-08 (Lịch sử Focus Session)
```

---

## 4. Sơ đồ vòng lặp học tập (Core Agentic Loop)

```
  [SP-01 Tạo kế hoạch]
        ↓
  [Scheduling & Remediation Engine tạo lịch]
        ↓
  [FS-06 Xem gợi ý hôm nay] ←─────────────────────┐
        ↓                                            │
  [FS-01 Focus Session]                             │
        ↓                                            │
  [AE-01 Cấu hình Interview]                        │
        ↓                                            │
  [AE-02 Phiên Interview]                           │
        ↓                                            │
  ┌─────────────────────────────────────┐           │
  │ mastery_score(C) >= 0.6?            │           │
  ├─ CÓ → SRS: schedule review C after X days       │
  └─ KHÔNG → [AE-07 Traceback BFS]                  │
              ↓                                      │
              Chèn prereqs P vào lịch tiếp theo      │
              ↓                                      │
  [AE-09 Kết quả + AE-08 Traceback notification]    │
        ↓                                            │
  [DB-01 Dashboard cập nhật mastery colors]         │
        ↓                                            │
  [DB-04 Agentic Reminder tính priority mới] ───────┘
```

---

## 5. Ghi chú kiến trúc quan trọng

### 5.1 Tách biệt AI vs Logic phần mềm

AI Service chỉ được gọi với 4 JSON schema cố định:

- `extract_concepts` → `{concepts[], edges[], language_detected}`
- `generate_question` → `{question_text, question_type, concept_id}`
- `grade_answer` → `{score: 0.0-1.0, feedback, verdict: "deep|shallow|wrong"}`
- `summarize_session` → `{summary_text, strengths[], weaknesses[], recommendations[]}`

Mọi điều phối (khi nào dừng, khi nào traceback, khi nào fallback) = **logic phần mềm tất định**.

### 5.2 DAG Constraint

Đồ thị khái niệm **bắt buộc là DAG**. Validation bằng Kahn's Algorithm (topological sort). Nếu phát hiện cycle: auto-remove cạnh cuối trong cycle + log + cảnh báo Student. Flag `plan.dag_auto_fixed = true`.

### 5.3 BFS Traceback Algorithm (đã sửa lỗi depth tracking)

Dùng tuple `(concept_id, depth)` trong queue. Giới hạn `max_depth = 2`. Phân biệt `mastery_score IS NULL` (chưa kiểm tra, treat như yếu) vs `mastery_score = 0.0` (đã kiểm tra, sai hoàn toàn). Xem chi tiết tại [AE-07 trong UC-04_AIExaminer.md].

### 5.4 Weighted Mastery Score Formula

`mastery_score(C) = weighted_avg(turn_scores, weights=[0.2, 0.3, 0.5])` cho N=3 turns - lượt sau quan trọng hơn vì câu hỏi sâu hơn.

### 5.5 DB Schema bổ sung (phát hiện qua phân tích UC)

```sql
-- Bổ sung so với schema gốc trong proposal:
ALTER TABLE study_plans ADD COLUMN status ENUM('draft','active','archived') DEFAULT 'active';
ALTER TABLE study_plans ADD COLUMN dag_auto_fixed BOOLEAN DEFAULT FALSE;
ALTER TABLE study_plans ADD COLUMN traceback_enabled BOOLEAN DEFAULT TRUE;

ALTER TABLE concepts ADD COLUMN source ENUM('ai_generated','manual','imported') DEFAULT 'ai_generated';
ALTER TABLE concepts ADD COLUMN status ENUM('active','deprecated') DEFAULT 'active';

CREATE TABLE analysis_jobs (
  id UUID PRIMARY KEY,
  plan_draft_id UUID,
  status ENUM('pending','processing','done','failed'),
  retry_count INT DEFAULT 0,
  created_at TIMESTAMP,
  completed_at TIMESTAMP
);

CREATE TABLE question_cache (
  id UUID PRIMARY KEY,
  concept_id UUID REFERENCES concepts(id),
  question_text TEXT,
  answer_hint TEXT,
  generated_at TIMESTAMP
);

CREATE TABLE session_notes (
  id UUID PRIMARY KEY,
  session_id UUID,
  concept_id UUID,
  content TEXT,
  created_at TIMESTAMP
);

CREATE TABLE grading_feedback (
  id UUID PRIMARY KEY,
  turn_id UUID,
  reason VARCHAR(100),
  explanation TEXT,
  submitted_at TIMESTAMP
);

-- Cấu hình Pomodoro lưu trong profile
ALTER TABLE users ADD COLUMN pomodoro_config JSONB DEFAULT '{"work":25,"short_break":5,"long_break":15,"cycles":4,"sound":true}';
```

### 5.6 Use-case ngoài MVP (không implement Sprint 3-5)

- AM-06: Liên kết/Hủy liên kết Google - chỉ cần silent merge email trong MVP
- SP-10: Import kế hoạch từ file
- ~~Voice Input (đề cập trong proposal nhưng không có UC chính thức)~~ → **SỬA:** Voice Input **có** UC chính thức (trong `Use-case_Specification.pdf` mục 2.3, nằm ở basic flow: TTS đọc câu hỏi, trả lời qua micro, STT). Sprint 4 chốt làm **luồng text trước**, tách tầng voice thành issue riêng (I6.9) — hoãn sang Sprint 5, không phải "ngoài MVP".
