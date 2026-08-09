# AI E2E Testing Rules & Best Practices

Tài liệu này đóng vai trò là "Context / System Prompt" dành cho các AI Agent hoặc lập trình viên khi viết kịch bản kiểm thử E2E (Playwright) trong dự án này, nhằm đảm bảo tính ổn định và tránh lặp lại các lỗi đã từng gặp.

## 1. Thiết lập Database & Seed Data (Không Mocking)

Dự án ưu tiên việc **Seed dữ liệu thật** vào Database trước khi chạy test thay vì dùng Mock API, nhằm đảm bảo bài test chạy qua toàn bộ luồng (Frontend -> Backend -> Database).

- **Đường dẫn import:**
  Vì `prisma`, `dotenv`, và `bcryptjs` không được cài ở thư mục gốc của repo, bắt buộc phải require chúng từ `src/server/node_modules/`:
  ```typescript
  import * as path from 'path';
  require('../../../src/server/node_modules/dotenv').config({
    path: path.join(__dirname, '../../../src/server/.env'),
  });
  const { PrismaClient } = require('../../../src/server/node_modules/@prisma/client');
  const { PrismaPg } = require('../../../src/server/node_modules/@prisma/adapter-pg');
  const bcrypt = require('../../../src/server/node_modules/bcryptjs');
  ```
- **Khởi tạo Prisma với Adapter (Bắt buộc cho Prisma 7+):**
  ```typescript
  const databaseUrl = process.env.DATABASE_URL;
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  await prisma.$connect();
  ```
- **Kiểm tra Migration trước khi kết luận HTTP 500:** Với test chạm model/bảng mới, chạy `npx prisma migrate status` trên đúng database local/test. Nếu còn migration hợp lệ chưa áp dụng, đây là lỗi môi trường; áp dụng migration của project vào database test rồi chạy lại trước khi kết luận bug. Không tự chạy migration trên production hoặc database không xác định rõ mục đích.

## 2. Quản lý vòng đời dữ liệu (Cleanup)

Luôn dọn dẹp dữ liệu rác sau khi test chạy xong để không ảnh hưởng tới các test case khác.

- Dùng `try ... finally` bao bọc các bước chạy UI test.
- Đặt lệnh xoá trong `finally`.
- Nhờ `onDelete: Cascade` trong Prisma Schema, chỉ cần xoá Entity gốc (ví dụ `User`), các thực thể con (như `StudyPlan`, `Concept`, `ReviewQueueItem`) sẽ tự động biến mất.
  ```typescript
  try {
    // Các thao tác await page.goto(...)
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
  ```

## 3. Tránh lỗi Strict Mode của Playwright (Lỗi Selector)

Playwright mặc định sử dụng cơ chế tìm kiếm chuỗi con (substring match). Điều này rất dễ gây lỗi `strict mode violation` khi giao diện có các phần tử trùng tên.

- **Ví dụ điển hình:** `page.getByLabel('Mật khẩu')` sẽ bắt trúng cả thẻ `<input label="Mật khẩu">` và nút `<button aria-label="Hiện mật khẩu">`.
- **Cách khắc phục:**
  Luôn sử dụng tham số `{ exact: true }` cho các label ngắn hoặc dễ trùng lắp:
  `page.getByLabel('Mật khẩu', { exact: true })`.
- Ưu tiên dùng `getByRole` để lấy phần tử chính xác hơn (VD: `getByRole('heading', { name: 'Concept C1' })`).

## 4. Xử lý logic Thời gian (Date) khi Seed dữ liệu

Các API backend thường sử dụng `now()` của máy chủ hoặc CSDL làm mốc lọc (VD: Lấy hàng đợi ôn tập `scheduledFor <= NOW()`).

- Khi seed các Entity có điều kiện thời gian (như `ReviewQueueItem.scheduledFor`), nên đặt thời gian lùi về quá khứ một chút để đề phòng độ trễ mili-giây giữa lúc seed và lúc API được gọi:
  ```typescript
  // Nên trừ đi vài phút thay vì dùng thẳng new Date()
  const pastDate = new Date();
  pastDate.setMinutes(pastDate.getMinutes() - 5);
  ```

## 5. Môi trường Trình duyệt (Browser OS Compatibility)

Hệ thống CI hoặc máy dev (Arch Linux) có thể không được hỗ trợ để cài đặt trình duyệt **Edge** (`msedge`) bằng lệnh mặc định của Playwright. Do đó, các kịch bản test **bắt buộc phải được thực thi và xác minh trên Firefox và Chrome (Chromium)**.

- **Chromium (Chrome)** là trình duyệt được ưu tiên nhất. Khi chạy test cục bộ để chẩn đoán nhanh, luôn ưu tiên sử dụng cờ `--project=chromium`.
- Với hành vi đã implement đúng đặc tả, test phải pass trên cả Chromium và Firefox trước khi xem như hoàn tất.
- Với bug của hành vi đã implement và đã được xác nhận theo Mục 6, test phải tái hiện đúng lỗi trên từng browser bị ảnh hưởng; ghi riêng kết quả từng browser thay vì ép test xanh. Nếu lỗi chỉ xuất hiện trên một engine, phải ghi rõ browser-specific.
- Phạm vi hoàn toàn chưa implement vẫn xử lý theo Mục 10, không tạo test đỏ chỉ để chứng minh tính năng chưa tồn tại.
- Tránh config bắt buộc chạy `msedge` trong `playwright.config.ts`.
- Nếu test bị kẹt hoặc treo (timeout), hãy kiểm tra xem có phải do thiếu engine trình duyệt hay không.
- **Page Visibility trong headless:** `page.bringToFront()`/mở tab phụ không đảm bảo Chromium hoặc Firefox headless sẽ tự đổi `document.hidden` và phát `visibilitychange`. Test các luồng rời tab phải kiểm tra điều này trước; nếu headless không phát, mô phỏng tường minh `document.hidden`/`visibilityState` rồi dispatch `visibilitychange` trong page, vẫn giữ API/DB thật và ghi rõ giới hạn mô phỏng trong kết quả TC. Không được chờ `document.hidden` đến hết timeout rồi kết luận lỗi sản phẩm.

## 6. Cập nhật kết quả về file Test Case (TC)

Sau khi kịch bản test được viết xong và chạy thử, AI (hoặc kỹ sư) có trách nhiệm cập nhật trực tiếp kết quả (PASS / FAIL) vào file Markdown chứa Test Case (ví dụ: `docs/test/test-cases/TC-FS-FocusSession.md`).

- **Ghi kết quả chi tiết cho Sub-test**: Nếu TC có chia trường hợp (ví dụ: a, b, c), phải ghi rõ kết quả `Kết quả thực tế` và `Trạng thái` cho từng sub-test vào cùng một ô, dùng tiền tố `a)`, `b)` và ngăn cách bằng thẻ `<br>` (VD: `a) PASS <br> b) FAIL`).
- **PASS**: Khi test chạy xanh hoàn toàn và thực sự phản ánh đúng yêu cầu của Test Case.
- **FAIL**: Chỉ đánh dấu FAIL khi xác định chắc chắn đó là **lỗi của tính năng (bug)**, ứng dụng hoạt động không đúng yêu cầu của TC.
- **Xác minh "Ảo tưởng" (Hallucination Check) khi FAIL:** Trước khi đánh dấu một Test Case là FAIL (do bug), **BẮT BUỘC** phải kiểm tra lại các tài liệu đặc tả (requirements/use-case) để đối chiếu. Phải chắc chắn rằng kịch bản test và kết quả mong đợi đó thực sự có nguồn gốc từ tài liệu gốc chứ không phải do AI tự "ảo tưởng" (hallucinate) hoặc tự chế thêm luật. Nếu kịch bản không có trong đặc tả, hãy sửa lại nội dung Test Case thay vì báo lỗi sản phẩm.
- **TUYỆT ĐỐI KHÔNG ép test pass theo code lỗi:** Không được tự ý thay đổi kịch bản test hoặc assertion để cố tình cho khớp với hành vi sai của ứng dụng hiện tại (nếu hành vi đó sai đặc tả).
- **Kiểm tra kỹ trước khi kết luận:** Khi gặp lỗi, cần double-check cẩn thận để xác định lỗi xuất phát từ script test (sai selector, thiếu setup dữ liệu, lỗi môi trường) hay do lỗi của chính mã nguồn (bug). Nếu là lỗi do script test, hãy sửa test; nếu do tính năng lỗi, hãy đánh dấu FAIL và báo cáo.
- **Bỏ qua (Skip) nếu bị Block:** Nếu một test case của phạm vi đã tồn tại gặp lỗi môi trường hoặc vấn đề kỹ thuật chưa thể giải quyết dứt điểm, làm gián đoạn (block) quá trình implement các test case phía sau, bạn có quyền tạm bỏ qua (skip) test case đó. Hãy ghi chú lại lý do lỗi (để trạng thái BLOCKED hoặc SKIPPED) và tiếp tục thực hiện các test case tiếp theo để đảm bảo tiến độ. Quyền `skip` này không thay thế Mục 10: phạm vi chưa implement thì không tạo test rồi `skip`.

## 7. Chú thích (Comments) tiếng Việt trong Test Script

Khi viết hoặc cập nhật kịch bản E2E, AI (và lập trình viên) bắt buộc phải thêm các comment (chú thích) bằng **tiếng Việt** cho từng bước cụ thể (step-by-step).

- Việc comment bằng tiếng Việt giúp đội ngũ kiểm thử, QA và developer khác trong dự án dễ dàng đọc hiểu luồng test và đối chiếu với Test Case.
- Viết comment theo dạng đánh số hoặc gạch đầu dòng rõ ràng trước các khối logic chính.
- Ví dụ: `// 1. Thực hiện đăng nhập`, `// 2. Kiểm tra điều hướng tới Dashboard`, `// 3. Xác minh nút Bắt đầu hiển thị`.

## 8. Tuân thủ Coding Conventions

Toàn bộ code test (TypeScript) phải tuân thủ chặt chẽ các quy tắc viết code của dự án được quy định tại `docs/guidelines/coding-conventions.md`.

- **Naming Conventions**: Tên biến, hàm dùng `camelCase`.
- **TypeScript Strict Mode**: Khai báo kiểu (type annotation) rõ ràng khi cần thiết, không sử dụng `any` tùy tiện.
- **Import/Export**: Áp dụng đúng thứ tự import và ưu tiên dùng alias `@/` nếu có.
- Tránh trùng lặp code (DRY), sử dụng lại các hàm tiện ích chung nếu phù hợp.

## 9. Kiểm tra Local trước khi Push (Tránh lỗi CI)

Để không làm hỏng pipeline CI/CD, bắt buộc thực hiện kiểm tra code ở local trước:

- Luôn chạy thử file test cục bộ thông qua Playwright UI hoặc Terminal (`npm run test:e2e` hoặc `playwright test --project=chromium`) để đảm bảo logic chạy đúng và ổn định (không flaky).
- Xác minh không có lỗi cú pháp, vi phạm linter (ví dụ ESLint, Prettier) hay lỗi biên dịch TypeScript (tsc) từ đoạn code test vừa được thêm vào.
- **TUYỆT ĐỐI KHÔNG được tự ý commit và push code lên repository.** AI chỉ hỗ trợ viết và xác minh code test thành công ở local. Mọi thao tác commit hoặc push phải do người dùng tự thực hiện, hoặc AI phải xin phép và được người dùng đồng ý mới được làm.

## 10. Xử lý Test Case Có Tính năng Chưa Được Implement

- **Không viết code test:** Tuyệt đối không viết script E2E cho tính năng chưa tồn tại. Việc cố viết test chỉ để nó báo FAIL làm tốn thời gian vô ích.
- **Không đánh dấu FAIL:** Trong file Test Case (Markdown), không điền kết quả là FAIL. Hãy giữ nguyên plan/form như ban đầu (ví dụ: `Not Run`) hoặc đánh dấu rõ là `Chưa implement`.
- **Ghi chú và Dẫn chứng nguồn gốc (BẮT BUỘC):** Thêm chú thích ngay cạnh tên Test Case trong file Markdown theo mẫu `— ⚠️ CHƯA IMPLEMENT: <phạm vi còn thiếu>`. Đặc biệt, **phải cung cấp dẫn chứng cụ thể** (link đường dẫn file nguồn, tên file đặc tả, dòng nào...) chỉ ra tính năng này được định nghĩa từ đâu. Điều này nhằm minh chứng rằng tính năng thực sự có trong yêu cầu gốc, ngăn chặn việc AI tự "ảo tưởng" (hallucinate) ra plan.

## 11. Xử lý Mâu thuẫn giữa Đặc tả và Thực tế triển khai (Requirement Conflicts)

Trong quá trình viết và chạy test, có khả năng tài liệu đặc tả (Test Plan/Test Case) hơi khác so với triển khai thực tế của project (ví dụ: đặc tả yêu cầu trả về lỗi 500, nhưng hệ thống thực tế trả về 501). Điều này dễ làm test bị fail mà không rõ nguyên nhân, trong khi logic project có thể không sai mà chỉ là do yêu cầu bị conflict hoặc outdated.

Khi gặp trường hợp này:

- Nếu đánh giá logic của project là hợp lý và an toàn, **trực tiếp cập nhật/sửa lại tài liệu Test Case** để khớp với code thực tế của project.
- **BẮT BUỘC** phải để lại ghi chú (note) rõ ràng ngay trong tài liệu hoặc Test Case đó: Ghi rõ yêu cầu ban đầu từ tài liệu là gì và thực tế project đang xử lý như thế nào. Việc này giúp mọi người hiểu được tại sao có sự điều chỉnh.

## 12. Triển khai Tuần tự (Từng Test Case một)

Để đảm bảo chất lượng code test là tốt nhất và dễ dàng debug khi xảy ra lỗi, AI (và lập trình viên) **bắt buộc phải implement (viết code) lần lượt từng Test Case một**.

- **Tuyệt đối không** cố gắng viết hoặc chạy một lúc nhiều Test Case trong cùng một lượt (prompt).
- Phải hoàn thiện toàn bộ vòng đời của một Test Case (viết code -> chạy test local -> sửa lỗi script/môi trường nếu có -> đạt `PASS`, hoặc tái hiện ổn định một bug đủ căn cứ `FAIL` theo Mục 6 và Mục 18 -> cập nhật file đặc tả Markdown) rồi mới được chuyển sang làm Test Case tiếp theo. Không được chuyển tiếp khi test đỏ nhưng chưa xác định được nguyên nhân.
- **Ngoại lệ cho tính năng chưa implement theo Mục 10:** Vì không cần viết code cho case chưa implement, vòng đời của case này chỉ bao gồm việc cập nhật file Markdown (thêm dẫn chứng nguồn, note lại là chưa implement). Sau đó, bạn được phép chuyển ngay sang case tiếp theo.

## 13. Chủ động cập nhật Bộ Quy tắc (Self-updating Rules)

Lưu ý rằng toàn bộ các quy tắc trong tài liệu `AI-TESTING-RULES.md` này được đúc kết từ những lỗi và kinh nghiệm trong các lần test trước đó.

Do đó, nếu trong quá trình triển khai test, AI (hoặc lập trình viên) phát hiện ra **một vấn đề nghiêm trọng mới có khả năng lặp lại nhiều lần**, hãy **mạnh dạn tự động cập nhật và thêm quy tắc mới** vào tài liệu này. Việc liên tục hoàn thiện bộ quy tắc sẽ giúp ngăn chặn các lỗi tương tự trong các lần prompt sau, đảm bảo quá trình test ngày càng tối ưu và trơn tru hơn. Mọi lần thêm hoặc sửa rule phải thực hiện audit xung đột theo Mục 21.

## 14. Đồng bộ Mutation UI → API → Database

Một thao tác UI có thể trả quyền điều khiển cho Playwright trước khi request bất đồng bộ đã được backend xử lý. Đọc DB ngay sau `click()`/`fill()` vì vậy có thể tạo race condition và báo sai rằng record chưa tồn tại.

- Tạo `page.waitForResponse(...)` **trước** thao tác kích hoạt mutation; match chính xác HTTP method và endpoint của request thật.
- `await` response, kiểm tra status thành công, rồi mới đọc DB hoặc kiểm tra side effect tiếp theo. Không dùng `waitForTimeout()` để che race vì thời gian cố định sẽ flaky theo tải máy/CI.
- Nếu response trả ID của entity vừa tạo, dùng chính ID đó cho mọi truy vấn tiếp theo; không dùng `findFirst()` để đoán record mới nhất, nhất là khi suite có thể chạy nhiều worker.

## 15. Fault Injection Hẹp cho Test Resilience

Mặc định mọi happy path, dữ liệu và response nghiệp vụ vẫn phải đi qua backend/database thật theo Mục 1. Tuy nhiên, một TC resilience có thể yêu cầu **timeout, mất kết nối hoặc HTTP 5xx** mà không có cách an toàn, tất định để ép server chung tự lỗi (không được dừng DB/server hoặc phá schema chỉ để tạo lỗi).

- Chỉ trong trường hợp đó mới được intercept đúng **một boundary lỗi** bằng Playwright: `route.abort(...)` cho transport failure/timeout, hoặc `route.fulfill(...)` với status lỗi chính xác. Không được fulfill `2xx` hay bịa payload thành công.
- Phải kiểm tra request thật đã được UI phát với đúng method/URL. Auth, seed DB, các request ngoài boundary lỗi, lối fallback và mutation sau fallback vẫn chạy qua hệ thống thật.
- Mỗi nhánh thành công/rỗng có thể tạo bằng dữ liệu thật phải dùng dữ liệu thật, không dùng interception cho tiện.
- Tháo route handler trong `finally` và ghi rõ trong kết quả TC đâu là fault injection; không kết luận backend tự phát sinh 5xx/timeout.

## 16. Phân biệt Tải Binary Thành công và Render Thành công

Với tài liệu/ảnh/media được tải bằng API rồi đưa vào `<iframe>` hoặc viewer qua `blob:` URL, HTTP `200` chỉ chứng minh client nhận được bytes; nó **không chứng minh bytes hợp lệ hoặc viewer render thành công**. Built-in viewer có thể tự vẽ trang lỗi bên trong iframe mà không làm Promise `fetch` reject và không phát lỗi hữu ích cho component cha.

- Test các nhánh file hỏng/sai định dạng phải dùng bytes thực, kiểm tra `Content-Type` và magic bytes/signature khi định dạng có signature (ví dụ PDF bắt đầu bằng `%PDF-`). Không dùng một response `200` giả chỉ để ép trạng thái.
- Phải assertion trạng thái lỗi do chính ứng dụng hiển thị, đồng thời xác minh hết loading và các chức năng độc lập vẫn hoạt động. Không xem việc `<iframe>` tồn tại hoặc event `load` đã chạy là bằng chứng tài liệu đọc được.
- Nếu đặc tả yêu cầu thông báo khi bytes hỏng nhưng app chỉ giao `blob:` cho built-in viewer, giữ assertion đỏ và note thiếu bước validate bytes hoặc callback lỗi từ renderer; không sửa test thành chỉ kiểm iframe visible.

## 17. Kiểm tra Ownership cho Resource Lồng nhau

Với endpoint dạng `/parents/:parentId/children/:childId`, chỉ thử cả `parentId` và `childId` của user khác là chưa đủ: ownership check ở parent có thể trả 404 sớm và che mất lỗ hổng truy cập child sau khi parent hợp lệ.

- Bắt buộc kiểm cả hai tổ hợp: **foreign parent + foreign child** và **owned parent + foreign child**. Tổ hợp thứ hai chứng minh truy vấn child có scope theo parent/owner, không chỉ `WHERE id = childId`.
- Trước các assertion từ chối, gọi một endpoint tương ứng trên resource của chính user và xác nhận thành công để loại trừ false positive do token hết hạn hoặc setup auth sai.
- Sau mọi request đọc/ghi/xóa trái quyền, đối chiếu DB của owner trước/sau (nội dung, số lượng và quan hệ) để chứng minh lỗi 404/403 không đi kèm side effect một phần.
- Response từ từ chối không được phản chiếu ID phụ, tên, nội dung hoặc metadata bí mật. Khi API cố ý gộp “không tồn tại” và “không thuộc quyền” thành 404, assertion phải giữ đúng hợp đồng chống enumeration đó.

## 18. Tuyệt đối Không Tự Ý Sửa Product Code

Nhiệm vụ của AI (và quy trình viết test này) là đảm bảo hệ thống được kiểm thử dựa trên hành vi thực tế và tài liệu đặc tả, đóng vai trò như một người kiểm thử (Tester/QA) độc lập.

- **TUYỆT ĐỐI KHÔNG** được tự ý thay đổi, chỉnh sửa, hoặc bổ sung mã nguồn của dự án (các thư mục gốc của logic ứng dụng như `src/client`, `src/server`, v.v.) chỉ với mục đích để làm cho test chạy xanh (PASS).
- Chỉ khi tính năng hoặc nhánh hành vi **đã được implement** nhưng hoạt động sai yêu cầu gốc đã xác minh theo Mục 6, hãy viết/giữ test đúng đặc tả để tái hiện lỗi và ghi `FAIL`. Không làm yếu assertion để khớp code sai.
- Nếu toàn bộ tính năng hoặc một phạm vi độc lập của tính năng **chưa được implement**, không viết test đỏ cho phạm vi còn thiếu và không ghi `FAIL`; xử lý đúng theo Mục 10. Với TC chỉ implement một phần, vẫn được giữ test cho phần đã tồn tại, nhưng phần còn thiếu phải ghi `CHƯA IMPLEMENT` thay vì tạo sub-test cố ý đỏ.
- Nếu chưa đủ nguồn để phân biệt bug, tính năng chưa implement hay yêu cầu tự suy diễn, phải dừng kết luận `FAIL` và đối chiếu Mục 6, Mục 10 và Mục 11 trước.
- Trách nhiệm sửa code dự án để fix bug hoặc thêm tính năng thuộc về luồng phát triển (Development), trừ khi user có yêu cầu rõ ràng "hãy fix lỗi này trong product code". Ngay cả trong trường hợp đó, hãy xác nhận lại trước khi can thiệp vào mã nguồn sản phẩm.

## 19. Quy tắc Kiểm thử Tích hợp (Integration / API Testing)

Dù Playwright chủ yếu dùng cho E2E, chúng ta hoàn toàn dùng nó để thực hiện kiểm thử Tích hợp (Integration) hoặc API (thay thế vai trò của Postman). Khi viết các Test Case thiên về API/Tích hợp, cần tuân thủ:

- **Bypass UI bằng APIRequestContext:** Sử dụng đối tượng `request` của Playwright (ví dụ: `request.post('/api/...')`, `request.get(...)`) để gọi thẳng xuống Backend thay vì phải click qua giao diện. Điều này giúp test chạy cực nhanh và mô phỏng được các hacker/user gọi API trực tiếp.
- **Tập trung vào luồng Dữ liệu (Data Flow):** Test tích hợp bắt buộc phải xác minh ba điểm chạm: (1) Payload gửi đi -> (2) Response trả về (HTTP Status, Body) -> (3) Trạng thái cuối cùng trong Database (truy vấn bằng Prisma).
- **Bẻ gãy giới hạn của UI (Negative API Testing):** Giao diện UI có thể chặn người dùng nhập sai, nhưng test Tích hợp/API phải cố tình gửi payload rác, payload sai quyền (IDOR, test bằng token của user khác) để chứng minh Backend có cơ chế tự phòng vệ độc lập. Quy định ở Mục 17 chính là một phần lõi của kiểm thử Tích hợp bảo mật.

## 20. Đo Burst Click / Double-submit Không Lẫn Auto-wait

Các TC spam click/idempotency cần phân biệt thời gian phát input của người dùng với thời gian Playwright làm actionability check và hậu kiểm. `Locator.click()` có thể mất thêm hàng trăm mili-giây dù chuỗi mouse event trong browser đã phát tức thì; dùng wall-clock bao quanh locator rồi áp ngưỡng `<300ms` dễ tạo false negative.

- Khi đặc tả yêu cầu nhiều click trong một cửa sổ thời gian rất ngắn, lấy `boundingBox()` của control rồi dùng `page.mouse.click(x, y, { clickCount: N })`, hoặc ghi timestamp của event ngay trong page. Không dùng tổng thời gian Promise của `Locator.click()` làm thời gian input.
- Gắn listener request và `page.waitForResponse(...)` **trước** burst; sau đó đợi network lắng rồi khẳng định tổng số mutation. Response đầu tiên không chứng minh các click còn lại không tạo request trễ.
- Với trạng thái `loading/disabled` quá ngắn trên backend local, gắn `MutationObserver` trước click và lưu cờ quan sát vào DOM/page state; không thêm delay giả vào response thành công chỉ để test nhìn thấy spinner.
- Burst vẫn phải gọi backend/database thật. Không dùng interception `2xx`, không làm chậm happy path bằng mock, và truy vấn DB bằng ID từ response duy nhất theo Mục 14.

## 21. Audit Xung đột khi Thêm hoặc Sửa Rule

Mỗi rule mới có thể vô tình phủ định một rule cũ hoặc làm các thuật ngữ bắt buộc như `PASS`, `FAIL`, `SKIP`, `CHƯA IMPLEMENT` mang nhiều nghĩa. Vì vậy, trước khi hoàn tất bất kỳ thay đổi nào trong tài liệu rule, bắt buộc thực hiện conflict audit trên **toàn bộ** file.

- Đọc lại toàn bộ `AI-TESTING-RULES.md` ngay trước khi sửa và đọc lại lần nữa sau khi sửa; không chỉ đọc section đang thay đổi.
- Đối chiếu rule mới/sửa với mọi rule hiện có, đặc biệt các nhóm dễ xung đột: PASS/FAIL, tính năng chưa implement, browser, mocking/fault injection, cleanup, thứ tự triển khai và quyền sửa product code.
- Tìm lại các từ khóa bắt buộc và tham chiếu chéo (`BẮT BUỘC`, `TUYỆT ĐỐI`, `PASS`, `FAIL`, `SKIP`, `CHƯA IMPLEMENT`, `Mục ...`) để phát hiện câu cũ còn trái nghĩa hoặc trỏ sai section.
- Nếu phát hiện xung đột, phải sửa đồng bộ tất cả section liên quan trong cùng thay đổi và ghi câu chữ đủ rõ để không cần áp dụng "rule nào ưu tiên hơn". Không được âm thầm bỏ qua một rule cũ.
- Sau khi sửa, chạy format/check tài liệu và tóm tắt xung đột đã phát hiện cùng cách giải quyết. Nếu chưa thể hòa giải vì cần quyết định nghiệp vụ, không thêm rule mơ hồ; ghi rõ điểm cần người dùng xác nhận.
