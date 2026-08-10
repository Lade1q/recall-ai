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
