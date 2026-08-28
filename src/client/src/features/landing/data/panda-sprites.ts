/**
 * Gấu Trúc — linh vật của trang landing, vẽ dạng pixel art trên lưới 16×16.
 *
 * Mỗi tư thế là một mảng 16 chuỗi, mỗi chuỗi 16 ký tự. Sửa một ô = sửa một
 * ký tự, không cần mở phần mềm vẽ và không thêm tệp ảnh nào vào bundle.
 *
 * Bảng màu chỉ 4 ký tự, và cả 4 đều là TOKEN của hệ thống chứ không phải giá
 * trị cứng — đó là điều kiện để con vật đổi theo theme. Lông đen là than ẤM
 * (không phải đen tuyệt đối) và lông trắng là ngà ấm, theo đúng luật "never
 * pure black/white"; khăn quàng dùng thẳng `--remediate`, màu hệ thống đã dành
 * riêng cho truy ngược, nên linh vật luôn ăn màu với chip "TRUY NGƯỢC · TẦNG N"
 * trong app.
 *
 * Trước đây bốn màu này là hằng số oklch viết cứng, nên sprite giữ nguyên một
 * bộ lông ở cả hai theme: đo ra thì theme tối lông đen chỉ còn 1,16:1 so với
 * nền, tai và tay chân biến mất. Giá trị theo theme nằm ở `global.css`.
 */

/** Ký tự dùng trong bản đồ tư thế. `.` là ô trống. */
type PixelKey = 'K' | 'W' | 'E' | 'O';

const PALETTE: Record<PixelKey, string> = {
  K: 'var(--panda-ink)', // lông đen — than ấm, sáng lên ở theme tối
  W: 'var(--panda-fur)', // lông trắng — ngà ấm
  E: 'var(--panda-eye)', // đốm sáng trong mắt
  O: 'var(--remediate)', // khăn quàng
};

/**
 * Màu bóng đổ dưới chân.
 *
 * Design system cấm đen/trắng tuyệt đối, và bảng màu ở trên đã theo luật đó.
 * Nhưng cái bóng lại nằm NGOÀI bảng, nên nó lọt qua với `oklch(0 0 0)` — đúng
 * pixel duy nhất của cả hệ sprite phá luật, ngay bên dưới một chú thích khoe
 * rằng cả bốn màu đều tuân thủ. Dùng lại `PALETTE.K` thì bóng không thể lệch
 * tông khỏi con vật, và luật chỉ còn phải giữ ở đúng một chỗ.
 */
export const SHADOW_FILL = 'var(--panda-shadow)';

export type PandaPose =
  | 'idle'
  | 'walk'
  | 'walk2'
  | 'carry'
  | 'carry2'
  | 'climb'
  | 'dig'
  | 'throw'
  | 'cheer'
  | 'sit'
  | 'shrug'
  | 'surprise';

const IDLE = [
  '...KKK....KKK...',
  '..KKKKK..KKKKK..',
  '..KKKKK..KKKKK..',
  '...WWWWWWWWWW...',
  '..WWWWWWWWWWWW..',
  '.WWWWWWWWWWWWWW.',
  '.WKKKWWWWWWKKKW.',
  '.WKEKWWWWWWKEKW.',
  '.WKKKWWWWWWKKKW.',
  '.WWWWWKKKKWWWWW.',
  '..WWWWWWWWWWWW..',
  '..OOOOOOOOOOOO..',
  'KKKWWWWWWWWWWKKK',
  'KKKWWWWWWWWWWKKK',
  '.KKWWWWWWWWWWKK.',
  '..KKK......KKK..',
];

/**
 * Chu kỳ đi — HAI khung, chân đá SO LE.
 *
 * Bản đầu chỉ đổi đúng hàng chân cuối và đẩy cả hai chân về cùng một phía:
 * đó là lê chân tại chỗ, không phải bước. Ở đây mỗi khung đưa một chân ra
 * trước và một chân lùi lại, nên mắt đọc ra được nhịp trái–phải.
 */
const WALK_A = [...IDLE.slice(0, 15), '.KKK.....KKK....'];
const WALK_B = [...IDLE.slice(0, 15), '....KKK.....KKK.'];

/**
 * Bê khái niệm trên đầu — HAI TAY GIƠ LÊN ĐỠ.
 *
 * Bản trước dùng luôn khung đi bình thường, nên cái chip lơ lửng trên đầu mà
 * hai tay Gấu vẫn buông thõng hai bên: nó không bê gì cả, chỉ đi dưới một vật
 * đang bay. Hai tay dựng thành cột dọc ở rìa từ ngang đầu trở lên, đúng chỗ
 * đỡ lấy chip.
 *
 * Vẫn hai khung để chân đá so le — bê đồ thì vẫn phải bước.
 */
const CARRY_BODY = [
  ...IDLE.slice(0, 3),
  'K..WWWWWWWWWW..K',
  'K.WWWWWWWWWWWW.K',
  'KWWWWWWWWWWWWWWK',
  'KWKKKWWWWWWKKKWK',
  'KWKEKWWWWWWKEKWK',
  'KWKKKWWWWWWKKKWK',
  '.WWWWWKKKKWWWWW.',
  '..WWWWWWWWWWWW..',
  '..OOOOOOOOOOOO..',
  '..WWWWWWWWWWWW..',
  '..WWWWWWWWWWWW..',
  '..WWWWWWWWWWWW..',
];
const CARRY_A = [...CARRY_BODY, '.KKK.....KKK....'];
const CARRY_B = [...CARRY_BODY, '....KKK.....KKK.'];

/**
 * Bám thang trèo lên: hai tay vươn lên nắm bậc, hai chân đạp SO LE ở hai bậc
 * khác nhau. Khác hẳn tư thế gắn mũi tên — lúc trèo thì cả hai tay đang bận
 * giữ thang, chưa thể với ra gắn gì cả.
 */
const CLIMB = [
  ...IDLE.slice(0, 3),
  'K..WWWWWWWWWW..K',
  'KK.WWWWWWWWWW.KK',
  ...IDLE.slice(5, 12),
  '..WWWWWWWWWWWW..',
  '..WWWWWWWWWWWW..',
  '..KKKWWWWWWWWW..',
  '.........KKK....',
];

/** Đào: hai tay hạ thấp xuống một ô. */
const DIG = [
  ...IDLE.slice(0, 12),
  'KKKWWWWWWWWWWKKK',
  'KKKWWWWWWWWWWKKK',
  'KKKWWWWWWWWWWKKK',
  '..KKK......KKK..',
];

/**
 * Gắn mũi tên: tay phải vươn CHÉO LÊN, không phải chìa ngang.
 *
 * Đồ thị nằm phía TRÊN lối đi của Gấu, nên một cánh tay chìa ngang trông như
 * đang chỉ vào khoảng không. Cánh tay đi chéo lên khớp với hướng nó thật sự
 * đang với tới, và cũng nhấc vai lên cho ra dáng gắng sức.
 */
const THROW = [
  '...KKK....KKK..K',
  '..KKKKK..KKKKK.K',
  '..KKKKK..KKKKKK.',
  '...WWWWWWWWWWK..',
  '..WWWWWWWWWWWW..',
  '.WWWWWWWWWWWWWW.',
  '.WKKKWWWWWWKKKW.',
  '.WKEKWWWWWWKEKW.',
  '.WKKKWWWWWWKKKW.',
  '.WWWWWKKKKWWWWW.',
  '..WWWWWWWWWWWW..',
  '..OOOOOOOOOOOO..',
  'KKKWWWWWWWWWWWW.',
  'KKKWWWWWWWWWWWW.',
  '.KKWWWWWWWWWWWW.',
  '..KKK......KKK..',
];

/** Ăn mừng: hai tay giơ lên cạnh đầu. */
const CHEER = [
  ...IDLE.slice(0, 4),
  'KK.WWWWWWWWWW.KK',
  'KKWWWWWWWWWWWWKK',
  ...IDLE.slice(6, 12),
  '..WWWWWWWWWWWW..',
  '..WWWWWWWWWWWW..',
  '..WWWWWWWWWWWW..',
  '..KKK......KKK..',
];

/** Ngồi nghỉ: chân gập ra trước. */
const SIT = [...IDLE.slice(0, 14), '.KKKKWWWWWWKKKK.', '..KKKKKKKKKKKK..'];

/** Nhún vai lúc đang ngồi: tay nhô lên hai bên, mắt nheo (bỏ đốm sáng). */
const SHRUG = [
  ...IDLE.slice(0, 5),
  'KWWWWWWWWWWWWWWK',
  'KWKKKWWWWWWKKKWK',
  'KWKKKWWWWWWKKKWK',
  ...IDLE.slice(8, 12),
  '..WWWWWWWWWWWW..',
  '..WWWWWWWWWWWW..',
  '.KKKKWWWWWWKKKK.',
  '..KKKKKKKKKKKK..',
];

/** Ngạc nhiên: mắt cao gấp đôi, hai tay bung ra. */
const SURPRISE = [
  ...IDLE.slice(0, 8),
  '.WKEKWWWWWWKEKW.',
  '.WKKKWWWWWWKKKW.',
  '..WWWWKKKKWWWWW.',
  '..OOOOOOOOOOOO..',
  'KKWWWWWWWWWWWWKK',
  'KKWWWWWWWWWWWWKK',
  '.KKWWWWWWWWWWKK.',
  '..KKK......KKK..',
];

const POSES: Record<PandaPose, readonly string[]> = {
  idle: IDLE,
  walk: WALK_A,
  walk2: WALK_B,
  carry: CARRY_A,
  carry2: CARRY_B,
  climb: CLIMB,
  dig: DIG,
  throw: THROW,
  cheer: CHEER,
  sit: SIT,
  shrug: SHRUG,
  surprise: SURPRISE,
};

/** Cạnh của lưới, tính bằng ô. Dùng cho viewBox của mọi tư thế. */
export const SPRITE_GRID = 16;

export interface SpriteRect {
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string;
}

/**
 * Đổi một tư thế thành danh sách hình chữ nhật để vẽ.
 *
 * Gộp các ô cùng màu nằm liền nhau theo hàng thành MỘT hình chữ nhật: một
 * tư thế đặc có thể lên tới 200 ô, gộp lại còn khoảng 60 — đáng làm vì
 * trang này dựng linh vật ở sáu chỗ khác nhau.
 */
export function spriteRects(pose: PandaPose, cell: number): SpriteRect[] {
  const map = POSES[pose];
  const out: SpriteRect[] = [];

  for (let row = 0; row < map.length; row += 1) {
    const line = map[row];
    let col = 0;
    while (col < line.length) {
      const ch = line[col];
      if (ch === '.') {
        col += 1;
        continue;
      }
      let end = col;
      while (end + 1 < line.length && line[end + 1] === ch) end += 1;
      out.push({
        x: col * cell,
        y: row * cell,
        w: (end - col + 1) * cell,
        h: cell,
        fill: PALETTE[ch as PixelKey],
      });
      col = end + 1;
    }
  }
  return out;
}

/**
 * Hai ô đốm sáng trong mắt, vẽ ĐÈ bằng màu lông đen để làm hiệu ứng chớp.
 * Chớp mắt phải là ĐỔI KHUNG chứ không phải làm mờ — pixel art không được
 * có ô nửa trong nửa đục.
 */
export function blinkRects(cell: number): SpriteRect[] {
  return [
    { x: 3 * cell, y: 7 * cell, w: cell, h: cell, fill: PALETTE.K },
    { x: 12 * cell, y: 7 * cell, w: cell, h: cell, fill: PALETTE.K },
  ];
}
