# AI Test Planning Rules & Best Practices

Tài liệu này là bộ quy tắc (System Prompt / Guidelines) dành cho AI Agent hoặc QA Engineer trong giai đoạn **Lên Kế hoạch Kiểm thử (Test Planning)** và **Viết kịch bản Test Case (Test Case Design)**. Khác với bộ quy tắc Code Test, tài liệu này tập trung vào tư duy thiết kế, độ bao phủ (coverage) và chất lượng của từng Test Case trước khi viết code.

## 1. Chống "Ảo tưởng" (Anti-Hallucination) & Bám sát MVP

- **Truy xuất nguồn gốc:** Bất kỳ Test Case nào được sinh ra đều **BẮT BUỘC** phải dựa trên một tính năng có thật, được định nghĩa rõ ràng trong tài liệu đặc tả (Requirement, Use Case Specification, Use Case Diagram, v.v.).
- **Không tự chế tính năng:** AI tuyệt đối không được tự "ảo tưởng" hoặc bịa ra các luồng nghiệp vụ không có trong MVP (Minimum Viable Product).
- **Phân biệt "Chưa code" và "Không tồn tại":** Một tính năng có trong đặc tả nhưng developer chưa code xong thì **vẫn phải viết Test Case cho nó** (và xử lý theo Rule Code đánh dấu `CHƯA IMPLEMENT`). Nhưng một tính năng không hề có trong đặc tả thì tuyệt đối không được đưa vào Plan.

## 2. Phủ kín Đặc tả (Full Requirement Coverage)

- Kế hoạch kiểm thử phải bao phủ **mọi trường hợp** được đề cập trong tài liệu gốc.
- Không được bỏ sót bất kỳ luồng chính (Basic Flow), luồng rẽ nhánh (Alternative Flows) hay luồng ngoại lệ (Exception Flows) nào đã được định nghĩa trong sơ đồ UML hoặc Requirement.
- Mỗi Test Case phải trích dẫn rõ ràng nó đang bao phủ dòng nào/đoạn nào trong tài liệu gốc để thuận tiện cho việc đối chiếu.

## 3. Tư duy Người dùng & Bao phủ Edge Case (User-centric & Negative Testing)

- Test Case không chỉ là việc kiểm tra các luồng đi lý tưởng (Happy Paths) trong tài liệu. Nó bắt buộc phải bao gồm các **User Cases thực tế**, đặc biệt là những trường hợp người dùng thao tác sai, "thao tác ngốc nghếch", hoặc cố tình phá hệ thống.
- **Dự đoán lỗi:** Phải thiết kế các trường hợp Edge Case (giới hạn biên, spam click, reload trang giữa chừng, mở nhiều tab, nhập dữ liệu rác, bỏ trống form...) mà sản phẩm có thể chưa dự đoán hoặc chưa xử lý kịp.
- Mục tiêu: Phủ được càng nhiều thao tác thực tế và đa dạng của người dùng càng tốt, giúp đánh giá khả năng chịu lỗi (Resilience) và bảo mật (Security) của hệ thống.

## 4. Tuân thủ Tuyệt đối Template Mẫu

- Mọi Test Case được tạo ra đều phải tuân thủ nghiêm ngặt định dạng Markdown tại file mẫu: `docs/test/test-cases/test-case-template.md`.
- Không được tự ý thay đổi cấu trúc bảng, xóa cột, hoặc tự chế thêm format mới làm mất đi tính đồng nhất của hệ thống tài liệu.
- Phải cập nhật kết quả vào Bảng tóm tắt (Summary Table) ở cuối mỗi file Test Case.

## 5. Gộp nhóm kịch bản bằng Sub-tests (a, b, c)

- Một Test Case không nhất thiết chỉ có một kịch bản duy nhất. Nếu cùng một tính năng (cùng bối cảnh) nhưng có nhiều trường hợp dữ liệu đầu vào khác nhau (Data-Driven Testing) hoặc các nhánh nhỏ, **hãy gộp chúng thành một Test Case duy nhất**.
- Tránh việc tạo ra hàng chục Test Case vụn vặt (ví dụ: tạo 3 TC riêng biệt chỉ để test nhập mảng rỗng, mảng 1 phần tử, mảng 3 phần tử).
- **Cách trình bày:** Sử dụng ký hiệu danh sách `a)`, `b)`, `c)` bên trong các cột `Dữ liệu đầu vào`, `Kết quả mong đợi`, `Kết quả thực tế` và `Trạng thái`. Dùng thẻ `<br>` để xuống dòng trong Markdown Table nhằm giữ bố cục gọn gàng.
  - _Ví dụ ở phần Dữ liệu đầu vào:_ `a) Mảng rỗng <br> b) Mảng 1 phần tử <br> c) Mảng 3 phần tử`
  - _Ví dụ ở phần Trạng thái:_ `a) PASS <br> b) FAIL <br> Tổng: FAIL`

## 6. Triển khai Tuần tự (Chất lượng hơn Số lượng)

- Không được nhồi nhét, sinh ra hàng loạt Test Case hời hợt, thiếu điều kiện đầu vào hoặc kết quả mong đợi chung chung trong một lần xử lý.
- Mỗi Case sinh ra phải được suy nghĩ thấu đáo: Đầu vào là gì? Hành vi là gì? Khác biệt cốt lõi so với các Case trước là gì?

## 7. Chủ động Cập nhật Rule Kế hoạch

- Nếu trong quá trình lập kế hoạch kiểm thử, AI (hoặc QA) phát hiện ra các quy luật mới, các tư duy phân tích mới giúp tìm ra nhiều bug hơn, hoặc các lỗi lặp đi lặp lại trong cách hành văn, hãy **mạnh dạn đề xuất và cập nhật thêm quy tắc vào tài liệu này**.
- Việc này giúp bộ não Test Planning của dự án ngày càng thông minh và bám sát thực tế hơn.

## 8. Định dạng Bảng Markdown (Table Formatting)

- Khi thiết kế các bảng (Table) trong file Markdown, tuyệt đối **không được dùng quá nhiều khoảng trắng (spaces)** để dóng cột (align) sao cho các hàng dài bằng nhau.
- Việc tự động đệm (pad) bằng hàng tá khoảng trắng sẽ khiến mã nguồn (raw) của file Markdown bị phình to, lộn xộn và rất khó đọc/chỉnh sửa trên các text editor.
- **Quy tắc bắt buộc:** Chỉ sử dụng đúng **1 khoảng trắng** ở mỗi bên của thanh phân cách cột (ký tự `|`). Bỏ qua việc dóng thẳng hàng các cột ở chế độ raw text.
- ✅ _Đúng:_ `| Nội dung | Kết quả | Trạng thái |`
- ❌ _Sai:_ `| Nội dung                                      | Kết quả                           | Trạng thái |`

## 9. Ưu tiên Nguồn Chốt & Quản lý Phạm vi (Source of Truth & Scope Verdict)

- **Xác định nguồn chốt trước khi viết TC:** Khi Requirement/UC cũ, API contract và mockup/thiết kế MVP có khác biệt, phải ghi rõ thứ tự ưu tiên ngay đầu plan. Mockup hoặc quyết định phạm vi đã được Product/Owner chốt là nguồn ưu tiên cho hành vi UI; API contract là nguồn ưu tiên cho hành vi request/response và quyền truy cập.
- **Đóng quyết định đã chốt thành acceptance criterion:** Trước khi ghi `Partial`, `FAIL`, “cần Product chốt” hoặc một expected result tự đề xuất, phải đối chiếu nguồn chốt — gồm mockup `claude-design` đã phê duyệt và quyết định đã được hợp nhất vào tài liệu đặc tả. Nếu nguồn này quy định hành vi dứt khoát, chuyển nó thành expected result có dẫn chứng; không mở lại tranh luận chỉ vì UC/tài liệu cũ không lặp lại cùng quyết định.
- **Phân biệt chênh lệch tài liệu với test đỏ:** Hệ thống khớp nguồn chốt thì TC phải là `Pass`, kể cả khi tài liệu cấp thấp hơn còn lỗi thời. Ghi chênh lệch đó thành việc đồng bộ tài liệu riêng, không dùng nó làm lý do cho `Partial` hoặc yêu cầu Product quyết định lại.
- **Clarification chỉ sau audit không có kết luận:** Chỉ ghi điểm cần quyết định khi các nguồn chốt đã kiểm không đưa ra phán quyết hoặc mâu thuẫn ngang cấp. Ghi rõ nguồn đã kiểm, câu hỏi còn mở, tác động đến TC và owner cần chốt; không dùng các cụm chung chung như “cần xác nhận”.
- **Không biến quyết định sản phẩm thành bug:** Tính năng được thiết kế cố ý không có phải được ghi là `N/A — by design`; tính năng đã đưa sang sprint/module khác phải ghi `N/A — de-scoped/chuyển module`. Không gán `FAIL` hay `CHƯA IMPLEMENT` cho các trường hợp này.
- **Giữ traceability khi loại TC:** Không xóa dấu vết quyết định. Lập bảng nêu mã TC cũ, lý do loại, nguồn chứng minh trong đặc tả và nơi tiếp nhận (module hoặc sprint) để không mất coverage liên module.
- **Edge case cần expected result có căn cứ:** Được chủ động kiểm các hành vi như spam click, reload hoặc nhiều tab, nhưng không được tự suy diễn policy mới (ví dụ mutual exclusion toàn bộ tab) khi MVP chưa quy định. Nếu chưa có expected result đáng tin cậy, ghi thành điểm cần quyết định thay vì một TC FAIL.
- **Bug thật phải phản ánh đúng phạm vi:** Với bug đã xác nhận, TC regression phải nêu cả hành vi by-design cần giữ nguyên, lỗi còn lại cần sửa và severity/priority đã thống nhất.

## 10. Test Case là Báo cáo Độc lập

- File Test Plan/Test Case là tài liệu báo cáo có thể được push, review và đọc độc lập với mã nguồn và script kiểm thử. Mỗi ô phải tự mô tả được dữ liệu nghiệp vụ, hành vi và kết luận mà không yêu cầu người đọc mở code.
- **Mã tham chiếu phải tự giải thích:** Trong mọi phần của plan/TC — Function/Feature, Mô tả, các ô dữ liệu/kết quả/trạng thái, Ghi chú, Nhận xét, tiêu đề và bảng tổng hợp — mã định danh một yêu cầu, module, acceptance criterion, sprint hoặc quyết định phải kèm tên/vai trò ngắn ngay lần xuất hiện đầu trong mỗi đơn vị có thể được đọc độc lập (ô bảng, bullet, hàng bảng hoặc tiêu đề). Ví dụ: `UC-16 (Xem Dashboard tổng quan)`, `DB-01 (Thống kê nhanh)`, `AC-02 (ngăn tạo phiên Focus trùng)`. Không buộc người đọc phải tra mã ở tài liệu khác mới hiểu câu. Ngoại lệ: mã `TC-...` trong ô **Mã TC** hoặc bảng đã có cột **Tiêu đề** tương ứng không cần lặp lại tên; HTTP status, API field và giá trị dữ liệu giữ theo quy tắc kỹ thuật bên dưới.
- **Không dùng issue/PR trong báo cáo:** Issue/PR chỉ phục vụ điều tra và phối hợp nội bộ. Không ghi, liên kết hoặc dùng chúng làm dẫn chứng trong Test Plan/Test Case; thay vào đó, nêu hành vi, quyết định và nguồn chốt đã được hợp nhất vào requirement, mockup, API contract hoặc decision record chính thức.
- **Không ghi đường dẫn mã nguồn hoặc script test** trong Điều kiện tiên quyết, Dữ liệu đầu vào, Kết quả mong đợi, Kết quả thực tế, Trạng thái, Ghi chú hay Nhận xét; ví dụ: `src/...`, `e2e/...`, `*.spec.ts`. Không dùng các đường dẫn này làm viện dẫn cho kết quả.
- Khi cần truy xuất nguồn gốc, viện dẫn theo tên/đề mục tài liệu đặc tả, mã Use Case, mockup, API contract, endpoint, HTTP status hoặc decision record chính thức. Chỉ giữ chi tiết kỹ thuật khi đó là một phần của hợp đồng cần kiểm tra; không thay kết luận nghiệp vụ bằng tên biến, selector, seed hoặc cách triển khai test.
