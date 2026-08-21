# [BE] grade_answer nhận previousTurns — bỏ chấm mù (độc lập AE-02)

Closes #391

## Vấn đề

`grade_answer` chấm mù: `GradeAnswerParams` không có `previousTurns`, trong khi
`GenerateQuestionParams` ngay phía trên đã có. Lượt 2/3 của một khái niệm bị
chấm như thể là câu đầu tiên.

## Thay đổi

- `GradeAnswerParams` (`gemini.service.ts`) thêm `previousTurns?: PreviousTurn[]`
  — optional, default rỗng, caller không truyền thì hành vi y hệt cũ.
- `gradeAnswer` nối `formatPreviousTurns(previousTurns)` vào cuối prompt, tái
  dùng nguyên hàm đã dựng sẵn cho `generateQuestion` (không viết logic mới).
- `submitAnswer` (`interview.service.ts`) truyền lịch sử khái niệm vào
  `gradeAnswer`, lấy từ `view.conceptTurns` và **lọc bỏ chính turn đang được
  chấm** (`turn.id !== pending.id`) — `view` được snapshot trước khi claim
  nên vẫn chứa turn đó với `answerText`/`verdict` null; không lọc thì turn sẽ
  tự trích dẫn chính nó thành "(no answer given)".
- Response schema `grade_answer` **không đổi** (ràng buộc C4) — tiền lệ #346
  (`checkpoints?`).

## AC

- [x] `GradeAnswerParams` thêm `previousTurns?: PreviousTurn[]` — optional, default rỗng
- [x] Prompt builder soạn khối lịch sử tương tự `formatPreviousTurns` của generate_question
- [x] Caller `submitAnswer` truyền lịch sử khái niệm đúng như đã làm cho generate_question
- [x] Response schema `grade_answer` không đổi
- [x] Test hàm thuần cho prompt builder; toàn bộ test pass khi tước `DATABASE_URL` + `GEMINI_API_KEY`
- [ ] Verify LIVE: chạy Gemini thật ≥2 lượt trên cùng khái niệm, xác nhận feedback lượt 2 bám câu trả lời lượt 1

## Test plan

- `npx tsc --noEmit` — sạch
- `npx eslint .` — sạch
- `npm test` (không có `DATABASE_URL`/`GEMINI_API_KEY`) — 908/908 pass
- [ ] Verify LIVE với Gemini thật (cần `GEMINI_API_KEY`, chưa chạy được trong môi trường này)
