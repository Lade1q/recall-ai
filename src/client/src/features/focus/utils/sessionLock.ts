/**
 * Tên khoá Web Locks đánh dấu một phiên Focus đang "sống" (M3). Tab đang chạy phiên GIỮ khoá này
 * suốt vòng đời `RunningSession` (mount→unmount); trình duyệt tự nhả khi tab crash/đóng. Tab hoặc
 * mount khác dò khoá để biết phiên còn sống hay không — bằng `locks.query()` (chỉ đọc, cho nhánh
 * MỜI khôi phục) hoặc `locks.request(..., { ifAvailable: true })` (chiếm nguyên tử, cho nhánh DỌN
 * orphan #311). Xem `FocusPage` để biết vì sao hai nhánh chọn primitive khác nhau.
 *
 * PHẢI dùng CHUNG một hàm ở mọi nơi (bên giữ khoá lẫn bên dò): lệch một ký tự giữa hai bên khiến
 * bên dò luôn đọc ra "không ai giữ" — với nhánh dọn `ifAvailable` điều đó đồng nghĩa GIẾT nhầm một
 * phiên đang sống. Đó là lý do const này ở module dùng chung thay vì viết tay ở từng nơi.
 */
export const sessionLockName = (sessionId: string): string => `recall.focus.session.${sessionId}`;
