import { isTokenVersionCurrent } from '../utils/jwt';

/**
 * `isTokenVersionCurrent` là một dòng, và nó được tách ra khỏi chỗ dùng chỉ vì
 * một lý do: chiều hỏng của nó không đối xứng.
 *
 * Sai theo chiều quá dễ dãi ⇒ đổi mật khẩu không đuổi được ai — tính năng thành
 * vô nghĩa nhưng không ai nhận ra.
 * Sai theo chiều quá chặt ⇒ **mọi** người dùng đang đăng nhập bị đăng xuất ngay
 * lúc bản này lên, vì token đang lưu hành không mang claim nào cả.
 *
 * Không tệp test nào trong server đụng tới auth hay JWT, nên nếu dòng này sai
 * thì không có gì đỏ lên. Đây là lưới duy nhất của nó.
 */
describe('isTokenVersionCurrent', () => {
  describe('ngày triển khai — token cũ không mang claim', () => {
    it('chấp nhận token không có claim khi cột vẫn ở mặc định 0', () => {
      // Đây LÀ ca ngày-triển-khai. Mọi token đã phát trước bản này đều rơi vào
      // đây, và mọi hàng users đều được backfill về 0. Viết `!==` trần thì
      // `undefined !== 0` là true ⇒ 401 hàng loạt ⇒ interceptor của client xoá
      // token và đá tất cả về màn đăng nhập.
      expect(isTokenVersionCurrent(undefined, 0)).toBe(true);
    });

    it('từ chối token không có claim sau khi người dùng đã đổi mật khẩu', () => {
      // Cùng token cũ đó, nhưng chủ tài khoản đã đổi mật khẩu ⇒ cột thành 1.
      // Sự dễ dãi ở ca trên KHÔNG được lan sang đây, nếu không thì token cũ
      // sống mãi và cả tính năng chỉ là trang trí.
      expect(isTokenVersionCurrent(undefined, 1)).toBe(false);
    });
  });

  describe('vòng đời bình thường', () => {
    it('chấp nhận khi claim khớp cột', () => {
      expect(isTokenVersionCurrent(0, 0)).toBe(true);
      expect(isTokenVersionCurrent(3, 3)).toBe(true);
    });

    it('từ chối token phát trước lần đổi mật khẩu gần nhất', () => {
      expect(isTokenVersionCurrent(1, 2)).toBe(false);
    });

    it('từ chối cả token có claim CAO hơn cột', () => {
      // Không tới được bằng đường thường (cột chỉ tăng), nên ca này không mô tả
      // một tình huống thật — nó ghim rằng phép so là "bằng đúng", không phải
      // "không nhỏ hơn". Nới thành `>=` là mở cửa cho token bịa số.
      expect(isTokenVersionCurrent(5, 2)).toBe(false);
    });
  });

  describe('0 phải là một giá trị thật, không phải "không có gì"', () => {
    it('phân biệt claim 0 với claim vắng mặt khi cột đã bị bump', () => {
      // Cả hai cùng cho `false` ở đây, nhưng vì hai lý do khác nhau: một cái là
      // token đời 0 thật, một cái là token chưa từng biết tới khái niệm đời.
      // Ca này tồn tại để chặn kiểu vá `if (!claimed) return true` — trông như
      // xử lý claim vắng mặt, nhưng `0` là falsy nên nó nuốt luôn token đời 0.
      expect(isTokenVersionCurrent(0, 2)).toBe(false);
      expect(isTokenVersionCurrent(undefined, 2)).toBe(false);
    });
  });
});
