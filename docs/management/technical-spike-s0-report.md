# Báo cáo Spike Kỹ thuật S0 & Quyết định Phạm vi

**Chủ đề:** Phỏng vấn voice-to-voice (Interview v2) trên Gemini Live API — native audio
**Giai đoạn:** Sprint 5 (10–23/08/2026) · Spike chạy 10–11/08 · Cổng GO/NO-GO 13/08 · Quyết định phạm vi 15/08
**Tài liệu đi kèm:** [`sprint-plans/s0-spike-protocol.md`](sprint-plans/s0-spike-protocol.md) (giao thức đo) · [`sprint-plans/sprint-5-plan.md`](sprint-plans/sprint-5-plan.md) (§4 cổng) · [`../analysis and design/interview-voice-architecture.md`](../analysis%20and%20design/interview-voice-architecture.md) (kiến trúc)

---

## Tóm tắt điều hành

Nhóm đề xuất chuyển module Phỏng vấn từ _hỏi–đáp bằng văn bản_ sang _đàm thoại giọng nói hai chiều_. Đề xuất này đụng ba ràng buộc cứng của SDP và một hạ tầng chưa từng tồn tại trong dự án. Thay vì xây trước rồi hy vọng, nhóm dành **hai ngày chạy một spike có ngưỡng đạt/không-đạt công bố trước**, đo trên hạ tầng thật với chi phí thật.

**Kết quả: công nghệ ĐẠT cổng. Lịch mới là thứ không đạt.**

> ### 🔻 Quyết định (15/08/2026)
>
> **Hoãn tầng vận chuyển giọng nói (WebSocket proxy, thu/phát audio, VAD, chống vọng) ra ngoài phạm vi môn học.**
> **Giao trong Sprint 5: tầng đánh giá theo bằng chứng** — cùng một cơ chế chấm mà bản voice sẽ dùng, chạy trên đường văn bản đã có.
>
> Đây là **quyết định về lịch, không phải kết luận về tính khả thi.** Phân biệt này quan trọng và được chứng minh bằng số ở §4.

Chi phí làm lại khi nối tiếp phần voice sau này: **bằng không** — lý do ở §8.

---

## 1. Bối cảnh và rủi ro cần khử

Ngày 08/08/2026, sau khi dùng thử bản Sprint 4, System Architect nêu hai khiếm khuyết:

1. Module _đáng ra stateful nhưng hành xử stateless_ — hệ thống chấm điểm ngay khi sinh viên trả lời, không có trạng thái "tôi chưa nói xong". Sinh viên bị chấm thấp cho một câu **dở dang**, không phải một câu **sai**.
2. Voice-to-voice đáng lẽ là kênh chính; gõ văn bản chỉ là phương án dự phòng.

Rà soát mã nguồn xác nhận khiếm khuyết (1) nặng hơn cảm nhận: nhãn `verdict = wrong` đóng khái niệm ngay lập tức, kéo `masteryScore` về 0.00, kích hoạt truy ngược lỗ hổng (traceback) và ghi hàng loạt dòng ôn tập cho các khái niệm tiên quyết — tức **bơm âm tính giả vào chính Concept Graph Engine**, phần lõi được chấm nặng nhất của sản phẩm. Làm lại phiên **không hoàn tác được** các dòng đó.

Vậy có hai rủi ro khác hạng cần khử, và chúng bị gộp làm một trong đề xuất ban đầu:

|         | Rủi ro                                                         | Hạng                                                      |
| ------- | -------------------------------------------------------------- | --------------------------------------------------------- |
| **R-A** | Cơ chế chấm sai bản chất: "chưa xong" bị tính là "sai"         | **Đúng đắn sản phẩm** — hỏng dữ liệu, không hoàn tác được |
| **R-B** | Hạ tầng đàm thoại thời gian thực chưa từng tồn tại trong dự án | **Khả thi kỹ thuật** — chưa biết có làm được không        |

Tách được hai rủi ro này ra là kết quả phân tích quan trọng nhất của giai đoạn, vì **R-A giải được mà không cần R-B** — điều không ai thấy lúc đầu.

---

## 2. Vì sao chọn spike

R-B mang bốn ẩn số cùng lúc, mỗi ẩn số đủ sức làm hỏng cả sprint:

- Độ trễ từ Việt Nam tới vùng phục vụ gần nhất (nhà cung cấp chỉ có US và EU; không xác nhận được APAC).
- Chất lượng tiếng Việt của mô hình audio gốc.
- Mô hình có phát được **đánh giá có cấu trúc** trong lúc vẫn đang nói không — Live API **không hỗ trợ structured output**, buộc phải đi đường function calling bất đồng bộ.
- Xác thực và giữ kết nối WebSocket dài trên hạ tầng doanh nghiệp.

Đặc điểm chung: **không ẩn số nào trả lời được bằng đọc tài liệu.** Tài liệu nhà cung cấp im lặng về ba trong bốn, và ẩn số thứ ba có báo cáo lỗi đang mở của cộng đồng.

Nhóm áp dụng **spike giải pháp** (_spike solution_): một khảo sát **có hạn định thời gian**, viết bằng mã **cố ý vứt đi**, đặt **ngoài** cây mã sản phẩm, với **ngưỡng đạt/không-đạt công bố trước khi chạy**.

Ba tính chất đó không phải hình thức:

- **Hạn định thời gian** (2 ngày) chặn spike biến thành công trình dở dang.
- **Mã vứt đi, ngoài `src/`** đảm bảo kết quả âm tính không để lại nợ kỹ thuật. Toàn bộ harness nằm ở `spike-s0/`, không một dòng nào chạm sản phẩm.
- **Ngưỡng công bố trước** là điều làm kết quả có giá trị: khi con số đã được cam kết trước lúc đo, **không thể hợp lý hoá kết quả sau khi thấy nó**. Ngưỡng nằm nguyên văn trong `s0-spike-protocol.md`, commit trước khi chạy probe đầu tiên.

---

## 3. Thiết kế phép đo

Năm tiêu chí, xếp theo phụ thuộc — ④ chặn tất cả vì không xác thực được thì không đo được gì.

| #   | Đo cái gì                   | Cách đo                                                                           | **Ngưỡng đạt (công bố trước)**                    |
| --- | --------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------- |
| ④   | Xác thực + giữ kết nối      | 3 phiên × 5 phút WebSocket qua service account                                    | **0 lần lỗi 1011**                                |
| ①   | Độ trễ từ VN                | Đẩy 1 câu tiếng Việt cố định → đo tới **byte audio đầu tiên**; lặp 20–30 lần      | **p50 < 1,5s · p95 < 3s** · khởi động nguội ≤ 3s  |
| ③   | Phát bằng chứng bất đồng bộ | Mô hình gọi `record_evidence` tăng dần trong lúc hội thoại                        | **≥ 8 lần bắn · 0 lần đóng 1008 · không cắt lời** |
| ②   | Chất lượng tiếng Việt       | Mô hình sinh ~10 câu hỏi từ một lát tài liệu thật → **người Việt chấm tay**       | **≥ 9/10**, không trôi sang tiếng Anh             |
| ⑤   | Vọng âm / cắt lời           | Phát tiếng mô hình qua (a) tai nghe (b) loa → đếm số lần mô hình tự ngắt lời mình | **tai nghe = 0**; loa chỉ ghi số                  |

**Điều kiện cổng:** `GO = ①②③④ đạt`. ⑤ hỏng vẫn GO nhưng **demo bắt buộc dùng tai nghe**.

Ngoài năm tiêu chí trên, giao thức còn cài **hai phép kiểm tính-đúng** không tính vào cổng nhưng nuôi thẳng thiết kế: (a) mỗi lần bắn có mang **đúng** mã checkpoint của thứ đang bàn không; (b) khi sinh viên trả lời **mơ hồ có chủ đích**, mô hình có im lặng đúng như bất biến INV-2 yêu cầu không.

Phép kiểm (b) là chỗ giao thức tự đặt bẫy cho chính giả định của nhóm — và bẫy đã sập, xem §5.

---

## 4. Kết quả đo

Chạy trên Vertex AI, mô hình `gemini-live-2.5-flash-native-audio`, service account, billing thật, từ Việt Nam. Mọi con số dưới đây đọc được lại từ hiện vật ở `spike-s0/runs/` (Phụ lục A).

| #   | Kết quả                                                                | Ngưỡng              |                      |
| --- | ---------------------------------------------------------------------- | ------------------- | -------------------- |
| ④   | 3/3 phiên × 300s, **0 lần 1011**, đóng mã 1000 sạch                    | 0 lần 1011          | ✅                   |
| ①   | **p50 = 1065 ms · p95 = 1195 ms · nguội = 937 ms** (n = 24)            | p50<1500 · p95<3000 | ✅                   |
| ③   | **10 lần bắn**, đúng enum, **0 lần 1008**, liveness đạt                | ≥8 · 0×1008         | ✅ (kèm ghi chú §5)  |
| ②   | 10 phát ngôn tiếng Việt tự nhiên, bám lát tài liệu, **0 trôi English** | ≥9/10 chấm tay      | ✅                   |
| ⑤   | Chạy bán thủ công; thu được 2 bản ghi tiếng mô hình (12,8s và 16,4s)   | tai nghe = 0        | ⚠️ demo cần tai nghe |

**⇒ Cổng 13/08: GO.** Bốn tiêu chí bắt buộc đều đạt.

Hai con số đáng chú ý:

- **Độ trễ là ẩn số lớn nhất, và nó đạt với biên rộng.** p95 = 1195 ms — chưa tới **một nửa** ngưỡng 3000 ms. Nỗi lo "APAC không có vùng phục vụ ⇒ hội thoại sẽ giật" **không xảy ra**. Nếu không đo, giả định sai này sẽ được mang theo suốt sprint theo cả hai chiều: hoặc sợ hãi vô cớ, hoặc lạc quan vô cớ.
- **Chép lại lời nói tiếng Việt sạch bất ngờ.** Cùng một đoạn audio lặp 24 lần cho ra 24 lần đúng chuỗi `"Địa chỉ lớp B là gì?"` — **đủ dấu, đúng chính tả, ổn định tuyệt đối**. Đây là dữ kiện kiến trúc chứ không phải chi tiết vui: nó mở ra khả năng chấm điểm **từ bản chép lời** thay vì từ tool-call, tức tháo được phụ thuộc vào tính năng nhà cung cấp (xem §6, §8).
  _Giới hạn phải nói rõ:_ audio thử là **giọng tổng hợp**, một câu ~1,8 giây. **Giọng sinh viên thật — nhiễu nền, ngập ngừng, giọng vùng miền — chưa đo.**

---

## 5. Hai phát hiện âm tính, và cách xử lý

Giá trị lớn nhất của spike này không nằm ở bốn dấu ✅. Nó nằm ở hai thứ **hỏng**, mà không phép đo nào trong năm tiêu chí cổng bắt được.

### 5.1 Bất biến INV-2 không thực thi được bằng chỉ dẫn

Kiến trúc đặt ra INV-2: _mô hình chỉ được kết luận "hiểu sai" khi hiểu sai đã rõ ràng; dở dang hoặc mơ hồ thì **không phát gì**._ Đây chính là hiện thân kỹ thuật của lời chê "chưa trả lời xong ≠ sai" — bất biến quan trọng nhất của cả thiết kế.

Đo thật: mô hình nhận câu trả lời mơ hồ có chủ đích, **hỏi lại đúng cách** (_"Bạn có nhớ trừ 2 địa chỉ đặc biệt không?"_), nghe sinh viên nói _"không nhớ / không chắc"_ — rồi **vẫn dán nhãn `contradicted`**. Xảy ra ngay ở chế độ dự định đưa vào sản phẩm.

Nói cách khác: **bất biến đã được viết vào chỉ dẫn, mô hình đã đọc nó, đã hành xử đúng ở bước hỏi — và vẫn vi phạm ở bước kết luận.**

### 5.2 Rò giá trị ngoài enum

Lược đồ hàm khai báo `status` chỉ nhận `covered | contradicted`. Mô hình vẫn tự sinh `status: "Running"` — một giá trị **không tồn tại trong lược đồ nó vừa được đưa**. Kiểm tra xác nhận đây là dữ liệu mô hình tự đẻ, không phải lỗi thư viện.

### 5.3 Xử lý: chuyển bảo đảm từ chỉ dẫn sang mã tất định

Hai phát hiện cùng kể một câu chuyện: **một ràng buộc đã khai báo không đủ để ràng buộc mô hình.** Phản ứng đúng không phải viết prompt chặt hơn — đó vẫn là đặt niềm tin vào cùng một chỗ vừa hỏng.

Nhóm cài **hàng rào tất định** `sanitizeEvidence` (`src/server/src/utils/evidence-guard.ts`, PR #326 đã hợp nhất) chặn **mọi** bằng chứng trước khi nó chạm công thức chấm:

|     | Điều kiện                                                        | Hành động                 |
| --- | ---------------------------------------------------------------- | ------------------------- |
| (a) | `status` ngoài enum                                              | **loại bỏ**               |
| (b) | trích dẫn khớp dấu hiệu bất định (_"không nhớ"_, _"em quên"_, …) | **hạ xuống** chưa-ngã-ngũ |
| (c) | còn lại                                                          | giữ                       |

Hàng rào bảo đảm **một chiều**: nó chỉ có thể sai theo chiều **không phạt sinh viên**.

Quá trình làm cứng nó tự nó là một kết quả kỹ thuật: qua các vòng rà soát, nhóm phát hiện việc bỏ dấu tiếng Việt để so khớp gây va chạm gần-đồng-tự (`nhớ` ≡ `nhỏ`, `quên` ≡ `quen`), khiến câu **đúng** bị hạ nhầm. Lời giải cuối là **hai bộ từ vựng tách theo có/không đồng-tự**, kèm ghi nhận thẳng thắn một khoảng trống **không thể khử** (mất dấu là mất từ). Hiện có **28 ca kiểm thử** riêng cho hàng rào này, tất cả chạy được khi đã **tước biến môi trường CSDL và khoá API** — tức là logic thuần, kiểm được, không phụ thuộc dịch vụ ngoài.

**Mệnh đề thiết kế rút ra — và là mệnh đề nhóm muốn được chấm:**

> **AI làm chứng; MÃ bảo đảm.** Mô hình được phép quan sát và tường thuật. Nó không được phép là thứ duy nhất đứng giữa một quan sát sai và điểm số của sinh viên.

---

## 6. Rủi ro tồn đọng sau cổng

Cổng cho GO. Nhưng bốn thứ dưới đây vẫn đứng nguyên, và chính chúng dẫn tới quyết định ở §7.

**R-1 — Cơ chế lõi bám vào một thế hệ mô hình mà thế hệ kế đã bỏ.**
Việc _"phát bằng chứng trong lúc vẫn đang nói"_ đòi **function calling bất đồng bộ**. Tính năng này **chỉ có ở dòng 2.5**. Mô hình kế nhiệm được nhà cung cấp chỉ định thay thế (`gemini-3.1-flash-live-preview`, ra 03/2026) **không có** function calling bất đồng bộ, **không có** structured output, và hạn chế luôn đường bơm ngữ cảnh giữa phiên. Mô hình đang dùng có lịch ngừng phục vụ **13/12/2026** — sau demo, nhưng cơ chế thì không có đường đi tiếp.

**R-2 — Chế độ "im lặng" không im lặng.**
Probe ③ kết luận nhánh **B** của cây quyết định, nguyên văn: _"incremental chạy nhưng KHÔNG silent — model kể lể bookkeeping"_. Giao thức xếp nhánh B là **chấp nhận được**, nhưng với sản phẩm bán bằng cảm giác _đàm thoại tự nhiên_, việc mô hình nói ra chuyện nó đang ghi sổ là khiếm khuyết trải nghiệm.

**R-3 — Vọng âm buộc demo phải đeo tai nghe.**
Không phải lỗi chặn, nhưng là **ràng buộc lên buổi demo** — thứ không thể sửa bằng code vào phút chót.

**R-4 — Tầng vận chuyển vẫn là con số không.**
Tính tới 15/08, `src/` có **0 dòng** WebSocket, **0 dòng** thu/phát audio, **0** phụ thuộc liên quan. Đóng băng mã ngày 21/08. Phần phải viết — proxy, thu âm, phát âm, dò biên lượt nói, chống vọng, nối lại khi rớt — đồng thời là phần **ít bền nhất**: nó sẽ bị thay khi đổi nhà cung cấp hoặc khi dùng khung có sẵn.

---

## 7. Quyết định phạm vi (15/08/2026)

**Hoãn R-B (tầng vận chuyển giọng nói). Giao R-A (tầng đánh giá theo bằng chứng).**

Lập luận, theo thứ tự sức nặng:

1. **R-A là rủi ro đúng-đắn; R-B là rủi ro khả thi.** Rủi ro đúng-đắn làm hỏng dữ liệu người dùng và không hoàn tác được. Rủi ro khả thi, một khi đã đo và đã đạt, **có thể chờ**.
2. **Hai rủi ro không ràng buộc nhau.** R-A giải trọn vẹn trên đường văn bản đang chạy. Phát hiện này chỉ lộ ra sau khi tách hai rủi ro ở §1.
3. **Giá trị còn lại của R-B trong 6 ngày là thấp nhất trong mọi hạng mục.** Tầng vận chuyển vừa rủi ro nhất khi demo (quyền micro, tai nghe, mạng phòng máy, giọng sinh viên chưa đo) vừa ít bền nhất về sau.
4. **Nghịch lý quyết định vấn đề:** phần có tương lai xa nhất — cơ chế chấm — **đã xây xong**. Phần phải xây từ đầu lại đúng là phần sẽ bị vứt.

**Hệ quả cho Sprint 5:** hạng mục giao là nối cơ chế chấm theo bằng chứng vào chỗ đóng khái niệm của đường văn bản. Sinh viên sẽ thấy: _trả lời dở dang không còn bị tính là trả lời sai_ — đúng lời chê ngày 08/08, trong sản phẩm chạy thật, chứ không phải trong tài liệu.

**Điều báo cáo này KHÔNG nói:** nó không nói voice-to-voice bất khả thi, không nói Gemini Live không phù hợp, không nói nhóm bỏ hướng đó. Số đo ở §4 nói ngược lại cả ba.

---

## 8. Cái gì được bảo toàn — chi phí làm lại bằng không

Hoãn thường đồng nghĩa vứt việc. Ở đây thì không, vì kiến trúc **cố ý** đặt ranh giới ở chỗ khiến tầng vận chuyển trở thành thứ thay được:

| Thành phần                                          | Trạng thái              | Bản voice có dùng lại không                          |
| --------------------------------------------------- | ----------------------- | ---------------------------------------------------- |
| Bảng bằng chứng theo checkpoint                     | đã hợp nhất             | **Có** — voice ghi vào **cùng bảng**                 |
| Hàng rào tất định `sanitizeEvidence`                | đã hợp nhất, 28 ca kiểm | **Có** — cùng hàng rào, cùng bảo đảm một chiều       |
| Công thức phủ-lượng → điểm                          | đã hợp nhất             | **Có** — không biết bằng chứng đến từ đâu            |
| Lập lịch ôn + truy ngược lỗ hổng                    | đã hợp nhất             | **Có** — một điểm ghi duy nhất, dùng chung hai đường |
| Kết nối WebSocket, thu/phát audio, dò biên lượt nói | **chưa xây**            | _đây là phần hoãn_                                   |

Ranh giới nằm ở **một kiểu dữ liệu**: engine nhận `masteryScore: number | null` cho mỗi khái niệm, và không quan tâm điểm đó sinh ra từ chữ hay từ tiếng nói. Đó là lý do bốn hàng đầu **không phải viết lại một dòng nào** khi nối tiếp phần voice.

Thêm hai đường đã mở sẵn cho tương lai:

- **Bản chép lời hai chiều được lưu từ ngày đầu** như một yêu cầu kiến trúc (phục vụ đo ràng buộc C5). Cộng với chất lượng chép lời tiếng Việt đo được ở §4, nó mở đường chấm **ngoài luồng hội thoại** — tháo hẳn phụ thuộc vào function calling bất đồng bộ, tức **hoá giải R-1**.
- **Harness spike vẫn còn**, kèm toàn bộ nhật ký chạy. Người tiếp tục công việc bắt đầu từ số đo, không từ giả định.

---

## 9. Truy vết ràng buộc

| Ràng buộc     | Nguyên văn (rút gọn)                                                                                                          | Tình trạng sau quyết định                                                                                                                                                                                                                       |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **C4**        | _AI không được dùng làm bộ điều phối; mọi quyết định định tuyến là logic tất định. AI chỉ được gọi với lược đồ JSON cố định._ | **Giữ nguyên trong phạm vi giao.** Mọi định tuyến vẫn tất định. Bề mặt gọi AI không nở ra: bề mặt hội thoại tự do — thứ **duy nhất** cần sửa C4 — nằm trong phần hoãn. Câu sửa C4 đã soạn sẵn cho tương lai, kèm ba bảo đảm tất định rào quanh. |
| **C5**        | Câu hỏi phải neo vào tài liệu người học tải lên                                                                               | **Mạnh lên.** Đường văn bản giữ nguyên neo nguồn đã có; thiết kế voice đưa việc chọn lát tài liệu về phía **mã**, tất định hơn bản văn bản.                                                                                                     |
| **C6**        | Tối đa 3 lượt mỗi khái niệm                                                                                                   | **Đổi hạt, không xoá.** Trọng số 3 lượt nhường chỗ cho công thức phủ-lượng theo checkpoint. Ràng buộc "có giới hạn tất định do mã sở hữu" được giữ; thứ đổi là đơn vị đo.                                                                       |
| **Ngân sách** | Dùng bậc miễn phí                                                                                                             | **Đã sửa có chủ đích, có ghi nhận.** Chủ dự án chấp nhận chi phí cho spike; đây là sửa đổi một ràng buộc **có viết trong SDP**, nên phải nằm trong bản hiệu đính chứ không lặng lẽ bỏ qua.                                                      |

---

## 10. Bài học phương pháp

1. **Tách rủi ro theo _hạng_, đừng theo _tính năng_.** Đề xuất ban đầu gộp một khiếm khuyết đúng-đắn với một ẩn số khả thi thành "làm voice". Tách ra mới thấy cái quan trọng hơn lại **rẻ hơn** và **không cần** cái kia.
2. **Viết ngưỡng trước khi đo.** Không có ngưỡng viết trước, `p95 = 1195 ms` chỉ là một con số để tranh luận. Có nó, đây là một tiêu chí đã vượt.
3. **Thiết kế phép đo để nó có thể chứng minh mình sai.** Phép kiểm INV-2 tồn tại để bắt lỗi giả định của chính nhóm. Nó bắt được. Nếu spike chỉ đo những thứ kỳ vọng sẽ chạy, nó đã cho GO mà giấu khiếm khuyết nguy hiểm nhất.
4. **Kết quả âm tính là kết quả.** Hai phát hiện ở §5 đổi kiến trúc: bảo đảm dời từ chỉ dẫn sang mã. Không có spike, chúng sẽ lộ ra ở buổi demo, dưới dạng một điểm số sai không giải thích được.
5. **"Đạt cổng" không đồng nghĩa "làm ngay".** Cổng trả lời _có làm được không_. Phạm vi trả lời _có nên làm bây giờ không_. Trộn hai câu hỏi là cách một dự án đúng-về-kỹ-thuật lỡ hạn.

---

## Phụ lục A — Chỉ mục hiện vật

Toàn bộ nằm ở `spike-s0/` (harness vứt đi, ngoài cây mã sản phẩm). Mỗi tệp nhật ký là JSONL, dòng cuối là bản ghi `result` chứa số kết luận.

| Hiện vật                                                                                     | Chứng minh điều gì                                                                                |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `runs/p4-auth-*.jsonl`                                                                       | ④ — 3 phiên, `total1011: 0`, `pass: true`                                                         |
| `runs/p1-latency-*.jsonl`                                                                    | ① — `p50: 1065`, `p95: 1195`, `cold: 937`, `n: 24`; kèm 24 bản chép lời tiếng Việt giống hệt nhau |
| `runs/p3-evidence-*.jsonl`                                                                   | ③ — 10 lần bắn kèm mã checkpoint, nhánh quyết định, ca kiểm INV-2 hỏng                            |
| `runs/p2-viquality-*.jsonl`                                                                  | ② — nguyên văn 10 phát ngôn tiếng Việt để chấm tay                                                |
| `runs/p5-model-audio-*.wav`                                                                  | ⑤ — bản ghi thật tiếng mô hình nói tiếng Việt (12,8s và 16,4s, 24 kHz)                            |
| `runs/d2-devapi-auth-*.jsonl`                                                                | Đường xác thực thứ hai (khoá API) cũng gọi được — hai đường sống, không một                       |
| `docs/management/sprint-plans/s0-fixture-ipv4-classful.json`                                 | Lát tài liệu + 10 checkpoint dùng cho ②③, trích tay từ giáo trình thật                            |
| `src/server/src/utils/evidence-guard.ts` + `src/server/src/__tests__/evidence-guard.test.ts` | Hàng rào tất định sinh ra từ §5, 28 ca kiểm                                                       |

**Chạy lại:** cài `spike-s0/`, cấu hình service account, chạy theo thứ tự `④ → ① → ③ → ② → ⑤`. Giao thức đầy đủ ở `s0-spike-protocol.md`.

---

## Phụ lục B — Dữ kiện nhà cung cấp (tra 15/08/2026)

Ghi lại vì chúng nuôi §6 và sẽ cũ đi — kiểm lại trước khi dựa vào.

| Dữ kiện                                                                                                                                                     | Hệ quả                                                                            |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Live API **không hỗ trợ** structured output                                                                                                                 | Đánh giá có cấu trúc phải đi đường function calling                               |
| Function calling **bất đồng bộ** chỉ có ở dòng 2.5, **không có** ở `gemini-3.1-flash-live-preview`                                                          | R-1                                                                               |
| `gemini-3.1-flash-live-preview` cũng **không có** structured output                                                                                         | R-1                                                                               |
| Mô hình 2.5 native audio trên Vertex: ngừng phục vụ **13/12/2026**                                                                                          | Sau demo; nhưng cơ chế không có đường kế thừa                                     |
| Một kết nối WebSocket sống ~10 phút; phiên chỉ-âm-thanh tối đa 15 phút nếu không bật nén cửa sổ ngữ cảnh                                                    | Vòng đời kết nối là quyết định kiến trúc, không phải chi tiết                     |
| Tham số `silenceDurationMs` bị bỏ qua trên 3.1 nhưng **hoạt động đúng** trên 2.5 native audio                                                               | Có thể **không cần** tự viết tầng dò biên lượt nói — cần đo lại                   |
| Nối trực tiếp từ trình duyệt bằng token tạm: nếu không khoá ràng buộc lúc phát hành, phía trình duyệt **ghi đè được** chỉ dẫn hệ thống và danh sách công cụ | Lựa chọn proxy phía máy chủ của nhóm **tránh được lớp lỗ hổng này theo cấu trúc** |
