# Thiết kế giám khảo vấn đáp — bài đối chứng độc lập

> **Trạng thái: THAM CHIẾU — không phải đặc tả đang hiệu lực.** Đặc tả và kiến trúc đang hiệu lực của module Interview nằm ở `ai-examiner-architecture.md`, `interview-voice-architecture.md` và UC-Spec. Tài liệu này không quy định gì cả.
>
> **Nguồn gốc — và vì sao nó có giá trị:** viết ngày 16/08/2026 bởi một session được hỏi _"theo kiến thức chung, tính năng Interview — kiểm tra kiến thức người dùng — sẽ trông như thế nào?"_ — **không đọc repo, không biết codebase**. Giá trị của bài nằm đúng ở sự mù đó: chỗ nó **trùng** với repo là hội tụ độc lập (bằng chứng thiết kế đi đúng hướng chung của lĩnh vực), chỗ nó **lệch** là câu hỏi đáng cân — không phải mệnh lệnh.
>
> Nguyên văn bài giữ nguyên từng chữ ở nửa dưới. Phần đối chiếu bên trên do team đo ngày 16/08 trên `main@5f6afd3`.

## Đối chiếu với repo

### Trùng khớp — hội tụ độc lập trên phần khó nhất

| Bài viết (không nhìn repo)                                                            | Repo đã có                                                                                                            |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| _"Tách **Policy / Grader / Voice**, đừng gộp vào một call LLM"_                       | **C4** — routing là logic tất định; `decideNextStep` là hàm thuần; `generate_question`/`grade_answer` là hai call rời |
| _"Sycophancy là lý do lớn nhất để tách Grader khỏi Voice"_                            | chính là lý do C4 tồn tại                                                                                             |
| _"Grader phải bám nguồn, không chấm theo kiến thức chung của model"_                  | **C5** + neo nguồn per-turn (Sprint 4)                                                                                |
| _"**'Không biết' là câu trả lời hạng nhất** — trừng phạt nó thì user học cách bluff"_ | **INV-2** + `coverageMasteryScore` (`not_discussed` không bao giờ tính là sai)                                        |
| _"Báo cáo cuối trích lại **chính lời user**"_                                         | `interview_evidence.quote` + `isQuoteGrounded` — đã xây (0 hàng dữ liệu tới 16/08, cần re-analyze plan)               |

### Lệch — ba chỗ, và mỗi chỗ đã đi về đâu

1. **Phán quyết từng lượt đang hiện ngay trong phiên.** `GradeCard` render `{verdict, score, feedback}` mỗi lượt (`TurnHistory.tsx:122`). Bài nói ngược: hiện tiến độ, giấu ✓/✗ real-time, dồn phán quyết về báo cáo cuối — _"điểm real-time dạy user đánh vật với đồng hồ điểm thay vì suy nghĩ"_. → Ghi thành chỗ lệch đo được trong epic **#384**; đổi hành vi nhìn thấy được của AE-02 nên chờ Quân quyết, chưa thành issue.
2. **Không có nước đi "gợi ý thu hẹp".** 0 hit `hint|gợi ý|scaffold` trong `interview-state.ts` + `gemini.service.ts`. Bài mô tả: bí → thu nhỏ câu hỏi một nấc, tối đa 2 lần, rồi ghi nhận gap và đi tiếp. → Trở thành **phương án B** của quyết định AE-02 đang treo ở **#392**.
3. **Thang leo độ khó chỉ có 2 mode** (`deeper`/`probe` — `MODE_BY_STEP`, `interview-state.ts:100-102`) so với 4 bậc Bloom của bài (nhớ → giải thích → áp dụng → tình huống lạ). → Hướng mở rộng `MODE_INSTRUCTION` hậu-demo, ghi trong **#384**.

### Phần voice trong bài

Ngoài phạm vi bài nộp — Interview v2 voice đã bỏ sáng 16/08 (#356→#358, lý do lịch; spike S0 qua cổng khả thi 13/08). Giữ nguyên trong bài làm tham khảo; **không phải việc phải làm**. Đối chiếu kỹ thuật chi tiết (endpointing, latency, WS proxy): `interview-voice-architecture.md`.

---

## Nguyên văn

## Ý cốt lõi: một cuộc trò chuyện, nhưng bên dưới là máy trạng thái có chủ đích

Interview tốt TRÔNG như chat tự nhiên, nhưng giám khảo không bao giờ "trôi theo hội thoại". Nó luôn mang một agenda ẩn: danh sách khái niệm cần kiểm, mỗi khái niệm cần thu đủ BẰNG CHỨNG (evidence) để kết luận vững/lung lay. Mỗi lượt nói của giám khảo là một _nước đi_ được chọn có chủ đích, không phải LLM tự do ứng khẩu.

Kiến trúc kinh điển của dialogue system tách làm 3 "bộ não", và kinh nghiệm chung là ĐỪNG GỘP vào một call LLM:

1. **Policy** — quyết định _hỏi gì tiếp theo_ (đào sâu, chuyển khái niệm, gợi ý, hay kết thúc). Nên là logic tất định càng nhiều càng tốt.
2. **Grader** — chấm _câu trả lời vừa rồi chứng minh được gì_, đối chiếu với tài liệu nguồn. Chạy riêng, lạnh lùng.
3. **Voice** — chỉ lo _diễn đạt_ nước đi thành câu nói tự nhiên.

Gộp cả ba thì bị sycophancy: LLM vừa hỏi vừa chấm sẽ chấm hào phóng dần để giữ hội thoại "dễ chịu", và không test riêng từng phần được.

## Vòng đời một phiên

- **Mở màn (30 giây):** một câu warm-up dễ để calibrate ("giải thích X như cho bạn năm nhất nghe"). Giảm căng thẳng + lấy mẫu ngôn ngữ của user.
- **Vòng lặp probe (phần thân):** mỗi khái niệm leo thang theo bậc Bloom — nhớ → giải thích → áp dụng → tình huống lạ. Đủ bằng chứng thì CHUYỂN, đừng tra khảo tiếp khái niệm đã vững.
- **Đóng phiên:** tóm 30 giây "bạn vững A, còn B đoạn X hơi lung lay", rồi đẩy chi tiết sang màn báo cáo. User luôn kết thúc sớm được, giám khảo wrap-up tử tế.

## Kho "nước đi" của giám khảo — phần giao tiếp thật sự

- **Probe "tại sao":** trả lời đúng định nghĩa → hỏi _vì sao_, hoặc xin ví dụ tự nghĩ. Định nghĩa thuộc lòng ≠ hiểu.
- **Phản ví dụ / biên:** "Vậy nếu chỉ có MỘT process thì có deadlock được không?" — câu biên phân biệt người hiểu và người học vẹt tốt hơn mọi câu định nghĩa.
- **Gợi ý thu hẹp, không đưa đáp án:** user bí → thu nhỏ câu hỏi một nấc, tối đa 2 lần, rồi ghi nhận gap và đi tiếp (kiểu tutor Socratic/Khanmigo).
- **Steelman cái sai:** thỉnh thoảng giám khảo _cố tình_ nói một ý sai tinh vi xem user có dám cãi không — test độ tự tin, không chỉ độ nhớ. Dùng tiết chế, nên khai báo trong luật chơi.
- **"Không biết" là câu trả lời hạng nhất:** thừa nhận gap phải được đối xử tốt hơn chém gió; nếu app trừng phạt "em chưa nắm", user học cách bluff — hỏng giá trị đo.

Nguyên tắc giao tiếp: giám khảo KHÔNG BAO GIỜ giảng bài. Mỗi lượt 1–2 câu, luôn kết bằng câu hỏi. Tỉ lệ nói nghiêng hẳn về user (~70/30) — mỗi lời user nói là _bằng chứng_, mỗi lời giám khảo nói là _chi phí_.

Ví dụ nhịp điệu chuẩn:

> GK: Bạn giải thích "deadlock" như đang nói với bạn năm nhất xem?
> User: Là hai process giữ tài nguyên của nhau và chờ nhau vô hạn.
> GK: Ổn. Vậy chỉ MỘT process thôi thì có deadlock được không?
> User: Ơ… chắc không?
> GK: Thử nghĩ một thread lock hai lần cùng một mutex không-reentrant?
> User: À, nó tự chờ chính nó — vậy là có.
> (Grader ẩn: recall ✓, câu biên sai nhưng tự sửa khi được gợi ý → khá; hỏi thêm 1 câu áp dụng rồi chuyển khái niệm.)

## Hiện gì, giấu gì trên UI

Đồng thuận chung: HIỆN tiến độ, GIẤU điểm từng câu. User thấy "khái niệm 2/5" để có cảm giác kiểm soát, nhưng không thấy ✓/✗ nhảy theo từng lượt (điểm real-time gây lo âu, dạy user đánh vật với đồng hồ điểm thay vì suy nghĩ). Toàn bộ phán quyết dồn về BÁO CÁO CUỐI PHIÊN: verdict theo từng khái niệm, kèm _trích lại chính lời user_ ("bạn nói X, thực ra là Y") — trích lời thật thuyết phục hơn lời phê chung chung, và output này đổ thẳng vào hàng ôn tập.

## Text vs voice

- **Text turn-based:** dễ làm, dễ chấm, user có thời gian nghĩ. Nhược: dễ trả lời kiểu "soạn văn", mất chất vấn đáp, mất tín hiệu ngập ngừng.
- **Voice real-time:** đúng chất thi vấn đáp — retrieval dưới áp lực nhẹ, không kịp tra Google, sự ấp úng cũng là dữ liệu. Bài toán khó nhất là ENDPOINTING: phân biệt "nói xong" với "đang dừng để nghĩ". Cắt lời lúc đang nghĩ là cách nhanh nhất tạo âm tính giả. Mitigation kinh điển: push-to-talk hoặc nút "hết ý" tường minh, ngưỡng im lặng hào phóng, backchannel ("ừm, cứ từ từ") thay vì nhảy vào hỏi tiếp. Cộng ràng buộc latency: quá ~2–3 giây là chết cảm giác hội thoại.

## Bẫy thiết kế hay gặp nhất

1. **Sycophancy khi chấm** — lý do lớn nhất để tách Grader khỏi Voice.
2. **Grader không bám nguồn** — chấm theo "kiến thức chung" của model thay vì tài liệu user học → phán sai chính tài liệu.
3. **Cảm giác bị hỏi cung** — sửa bằng persona ấm-nhưng-nghiêm, warm-up, cho phép thoát bất cứ lúc nào.
4. **Phiên quá dài** — 10–15 phút là trần; mệt thì chất lượng câu trả lời sụp, dữ liệu đo sụp theo.
5. **User gạ đáp án** — giám khảo phải có nước đi từ chối mềm, ghi nhận gap, đi tiếp.

Tóm một câu: _giao tiếp giám khảo↔user là vòng lặp "hỏi ngắn → nghe dài → chấm ngầm → chọn nước đi kế"_, và chất lượng tính năng nằm ở kho nước đi + kỷ luật tách policy/grader/voice, chứ không nằm ở việc prompt LLM "hãy đóng vai giám khảo" hay.
