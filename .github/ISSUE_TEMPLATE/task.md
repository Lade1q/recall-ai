---
name: Task (I{sprint}.{n})
about: Một đầu việc cụ thể trong sprint, thuộc về một EPIC
title: 'I0.0 - [BE|FE|QA|UI|DOC|INFRA] '
labels: ''
assignees: ''
---

> **EPIC:** #___ · **Sprint:** ___ · **Owner:** @___

## Tổng quan (Overview)

<!--
2-4 câu: task này làm gì, VÌ SAO cần nó, và nó nằm ở đâu trong bức tranh lớn.
Người nhận task đọc xong phải hiểu được mục đích, không chỉ hiểu thao tác.
Nếu có use-case liên quan, trích ID: SP-01, AE-02, FS-01, DB-04...
-->

---

## ⚠️ Ràng buộc (Constraints)

<!--
Phần QUAN TRỌNG NHẤT của template này. Liệt kê những gì DỄ LÀM SAI hoặc
KHÔNG ĐƯỢC LÀM. Nếu bỏ trống mục này, người làm sẽ tự suy diễn và đi lệch.

Luôn cân nhắc các ràng buộc kiến trúc của Recall AI:
- C4: AI không bao giờ là orchestrator - mọi điều phối là code tất định
- C5: AI không bịa nội dung ngoài tài liệu người dùng upload
- C6: tối đa 3 lượt hỏi-đáp mỗi khái niệm
- Đồ thị khái niệm bắt buộc là DAG
- mastery_score = null (chưa kiểm tra) KHÁC 0.0 (đã kiểm tra và sai)
-->

| #   | Ràng buộc | Ý nghĩa cụ thể |
| --- | --------- | -------------- |
|     |           |                |

---

## Mục tiêu (Acceptance Criteria)

<!--
Checklist kiểm chứng được. Mỗi dòng phải trả lời được Đạt / Không đạt,
không viết kiểu "làm cho tốt", "tối ưu hiệu năng".
Kèm luôn shape JSON / signature hàm nếu là task code - đỡ phải hỏi lại.
-->

- [ ]
- [ ]

---

## Hướng dẫn triển khai (Technical Design)

<!--
Gợi ý cấu trúc file, đoạn code mẫu, thư viện cần cài.
Đây là GỢI Ý, không phải mệnh lệnh - người làm được quyền chọn cách tốt hơn,
nhưng nếu lệch nhiều thì comment vào issue để cả team biết.
-->

```
src/...
```

---

## Phụ thuộc (Dependencies)

<!--
BẮT BUỘC khai báo bằng tính năng GitHub issue dependencies (sidebar phải:
"Relationships" → Blocked by / Blocking), KHÔNG chỉ ghi chữ ở đây.
Lý do: GitHub sẽ cảnh báo khi ai đó định đóng issue mà phần chặn chưa xong,
còn chữ trong body thì không ai đọc lại sau ngày đầu sprint.

Bảng dưới là bản chữ để đọc nhanh - phải khớp với sidebar.
Luôn ghi kèm số issue (#123) chứ đừng ghi mã I7.2, để bấm được.

Phân biệt:
- Bị chặn bởi  = chưa xong thì task này KHÔNG THỂ COI LÀ DONE
                 (vẫn có thể bắt đầu bằng mock data - ghi rõ nếu vậy)
- Đang chặn    = ai đang ngồi chờ mình. Dòng này quyết định thứ tự cắt giảm:
                 task không chặn ai là task cắt được.
- Phối hợp     = không chặn nhau nhưng đụng cùng file/API, phải thống nhất trước khi code
-->

| Quan hệ        | Issue |
| -------------- | ----- |
| 🚧 Bị chặn bởi |       |
| ⛔ Đang chặn   |       |
| 🤝 Phối hợp    |       |

## Tài liệu tham khảo (Resources)

<!-- Trỏ tới file thật trong repo hoặc mục cụ thể trong PDF, đừng trỏ chung chung -->

-

## Danh sách việc cần làm (Todo List)

- [ ]
- [ ] Push lên branch `feature/...` (hoặc `bugfix/` · `docs/` theo `docs/guidelines/coding-conventions.md` §7.1)

---

## Definition of Done

<!--
Khác với Acceptance Criteria: đây là bằng chứng CHẠY THẬT, không phải code đã viết.
Ví dụ tốt: "Chạy thật với Gemini, trả lời sai 1 khái niệm → prereq xuất hiện ở màn kết quả"
Ví dụ tệ: "Code đã xong và đã review"
-->

- [ ]
- [ ] PR đã được review, CI xanh, tuân thủ `docs/guidelines/coding-conventions.md`
