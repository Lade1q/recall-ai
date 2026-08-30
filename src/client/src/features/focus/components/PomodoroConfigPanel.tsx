import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Kbd } from '@/components/ui/kbd';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import type { PomodoroConfig, PomodoroPhase } from '../types/focus.types';
import { estimateSessionEta } from '../utils/eta';
import { cyclesToWords, formatClockTime } from '../utils/format';

type SessionProgress = {
  phase: PomodoroPhase;
  phaseElapsedMs: number;
  phaseTargetMs: number;
  pomodorosCompleted: number;
} | null;

interface PomodoroConfigPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: React.ReactNode;
  config: PomodoroConfig;
  onApply: (config: PomodoroConfig) => void;
  /** `null` = phiên chưa bắt đầu (chỉ khác dòng phạm vi; hàng strict chỉ hiện khi đang chạy). */
  session: SessionProgress;
  /** Chỉ để hiển thị chỉ báo khóa giữa phiên; công tắc thật nằm ở màn Chưa bắt đầu, không ở đây. */
  strictMode: boolean;
}

/**
 * Panel cấu hình Pomodoro tại chỗ (AC ⑨) — dùng chung cho nút bánh răng (giữa phiên) và nút
 * "Đổi độ dài lượt" (trước khi bắt đầu). Khác đúng hai chỗ giữa hai ngữ cảnh: dòng phạm vi và
 * hàng Chế độ nghiêm ngặt (`session === null` ⇒ công tắc thật; ngược lại ⇒ chỉ báo đã khóa).
 *
 * Thân panel chỉ mount khi `open` — mỗi lần mở là một lần mount MỚI của `PomodoroConfigPanelBody`,
 * nên `draft`/`now` tự khởi tạo lại từ props hiện tại mà không cần effect đồng bộ theo `open`
 * (React Compiler cấm gọi `setState` đồng bộ trong effect để "sync theo prop" — dùng mount tự
 * nhiên thay cho pattern đó).
 */
export function PomodoroConfigPanel({
  open,
  onOpenChange,
  trigger,
  config,
  onApply,
  session,
  strictMode,
}: PomodoroConfigPanelProps) {
  // `Date.now()` không được gọi trong thân render — chụp mốc "bây giờ" ngay tại sự kiện mở
  // (`onOpenChange` là handler, không phải render), rồi truyền xuống làm prop ổn định.
  const [openedAt, setOpenedAt] = useState<number | null>(null);

  const handleOpenChange = (next: boolean) => {
    if (next) setOpenedAt(Date.now());
    onOpenChange(next);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        role="dialog"
        aria-label="Cấu hình Pomodoro"
        align="end"
        collisionPadding={12}
        // Panel đủ 5 trường + hàng nghiêm ngặt (bản trước-khi-bắt-đầu) có thể cao hơn khoảng
        // trống phía trên nút khi Radix mở hướng `top` — kẹp vào chiều cao khả dụng Radix tính
        // sẵn rồi cho cuộn nội bộ, thay vì để nội dung tràn ra ngoài viewport.
        // L7: `w-80` (320px) đúng bằng viewport 320px + `collisionPadding` 12 nên bị cắt ~2px ở
        // màn hẹp nhất. Kẹp bề rộng theo viewport trừ lề để không tràn.
        //
        // #301 · VÌ SAO KHÔNG port `.pop`/`.popstage`/`.popbody` của mockup (dòng 1466/1472/1476),
        // dù issue nêu đích danh ba rule này. `.pop{position:static;margin:14px 16px 0}` tồn tại vì
        // mockup neo panel bằng HẰNG SỐ CỨNG `top:54px` (dòng 1258); khi topbar xếp 2 hàng ở màn
        // hẹp, mốc đó rơi vào giữa hàng thứ hai ⇒ panel đè lên chính nút vừa mở nó, nên mockup phải
        // gỡ hẳn lối neo. Radix neo theo `PopoverTrigger` THẬT và tự flip/shift khi thiếu chỗ ⇒
        // nguyên nhân bệnh không tồn tại ở đây, port thuốc là vô nghĩa. Thứ mockup nhắm tới (panel
        // vừa màn hẹp) đã do đúng ba thuộc tính ngay dưới đây lo: `collisionPadding`, kẹp bề rộng
        // theo `100vw`, và `max-h` theo chiều cao khả dụng Radix tính. `.popstage`/`.popbody` thì
        // chỉ là giàn giáo của khối demo tĩnh `.state__demo` (có `overflow:hidden`) trong trang
        // mockup, không có đối ứng nào trong app.
        className="max-h-(--radix-popover-content-available-height) flex w-[min(20rem,calc(100vw-1.5rem))] flex-col gap-4 overflow-y-auto"
      >
        {open && openedAt !== null && (
          <PomodoroConfigPanelBody
            now={openedAt}
            config={config}
            onApply={(next) => {
              onApply(next);
              onOpenChange(false);
            }}
            onClose={() => onOpenChange(false)}
            session={session}
            strictMode={strictMode}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}

const FIELD_BOUNDS = {
  work: { min: 1, max: 120 },
  short_break: { min: 1, max: 60 },
  long_break: { min: 1, max: 60 },
  cycles: { min: 1, max: 10 },
} as const;

interface PomodoroConfigPanelBodyProps {
  now: number;
  config: PomodoroConfig;
  onApply: (config: PomodoroConfig) => void;
  onClose: () => void;
  session: SessionProgress;
  strictMode: boolean;
}

/**
 * Chỉnh sửa gom vào state cục bộ (`draft`), chỉ commit ra ngoài qua `onApply` khi bấm
 * "Áp dụng" — bấm "Đóng"/Esc/click ra ngoài thì component này unmount (cha ngừng render nó),
 * `draft` dở dang biến mất theo, không âm thầm áp nửa chừng.
 */
function PomodoroConfigPanelBody({
  now,
  config,
  onApply,
  onClose,
  session,
  strictMode,
}: PomodoroConfigPanelBodyProps) {
  const [draft, setDraft] = useState<PomodoroConfig>(config);

  const eta = estimateSessionEta(
    now,
    session?.phase ?? 'work',
    session?.phaseElapsedMs ?? 0,
    session?.phaseTargetMs ?? draft.work * 60000,
    session?.pomodorosCompleted ?? 0,
    draft
  );

  // H3 — `<input type="number" min=1>` KHÔNG chặn gõ 0 / số âm / số cực lớn, và `Number('')` là
  // `0` (không phải NaN), nên phải kẹp trong JS. Ô trống ⇒ GIỮ giá trị cũ (không nhảy về 0), để
  // người dùng xoá-rồi-gõ-lại được; giá trị hợp lệ ⇒ kẹp về [min,max] + số nguyên ngay tại chỗ,
  // nhờ vậy `draft` LUÔN hợp lệ và preview ETA (đọc thẳng `draft`) không bao giờ thấy NaN/số khổng
  // lồ. Sàn cuối vẫn nằm ở engine (`useFocusTimer.updateConfig`).
  const handleField =
    (key: keyof typeof FIELD_BOUNDS) => (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      if (raw.trim() === '') return;
      const value = Number(raw);
      if (!Number.isFinite(value)) return;
      const { min, max } = FIELD_BOUNDS[key];
      const clamped = Math.min(max, Math.max(min, Math.round(value)));
      setDraft((prev) => ({ ...prev, [key]: clamped }));
    };

  return (
    <>
      <div>
        <div className="text-sm font-medium">Chu kỳ Pomodoro</div>
        <p className="text-muted-foreground mt-0.5 text-xs">
          {session === null
            ? 'Chỉ đổi cho phiên này · áp dụng ngay khi bắt đầu'
            : 'Chỉ đổi cho phiên này · áp dụng từ lượt kế tiếp'}
        </p>
      </div>

      <div className="flex flex-col gap-2.5">
        <ConfigRow label="Học" unit="phút">
          <Input
            type="number"
            value={draft.work}
            min={FIELD_BOUNDS.work.min}
            max={FIELD_BOUNDS.work.max}
            onChange={handleField('work')}
            className="w-16 text-right"
          />
        </ConfigRow>
        <ConfigRow label="Nghỉ ngắn" unit="phút">
          <Input
            type="number"
            value={draft.short_break}
            min={FIELD_BOUNDS.short_break.min}
            max={FIELD_BOUNDS.short_break.max}
            onChange={handleField('short_break')}
            className="w-16 text-right"
          />
        </ConfigRow>
        <ConfigRow label="Nghỉ dài" unit="phút">
          <Input
            type="number"
            value={draft.long_break}
            min={FIELD_BOUNDS.long_break.min}
            max={FIELD_BOUNDS.long_break.max}
            onChange={handleField('long_break')}
            className="w-16 text-right"
          />
        </ConfigRow>
        <ConfigRow label="Số chu kỳ" unit="lượt">
          <Input
            type="number"
            value={draft.cycles}
            min={FIELD_BOUNDS.cycles.min}
            max={FIELD_BOUNDS.cycles.max}
            onChange={handleField('cycles')}
            className="w-16 text-right"
          />
        </ConfigRow>
        <div className="flex items-center justify-between">
          <Label htmlFor="pomodoro-sound" className="text-sm font-normal">
            Âm báo khi hết giờ
          </Label>
          <Switch
            id="pomodoro-sound"
            checked={draft.sound}
            onCheckedChange={(value) => setDraft((prev) => ({ ...prev, sound: value }))}
          />
        </div>
      </div>

      <hr className="border-border" />

      <p className="text-muted-foreground text-xs leading-[1.6]">
        Còn <b className="text-foreground">{cyclesToWords(eta.turnsLeft)}</b>
        {session?.phase === 'work' ? ' sau lượt này' : ' nữa'} — với cấu hình trên, phiên xong
        khoảng <b className="text-foreground">{formatClockTime(eta.finishAt)}</b>.
      </p>

      {/* Chỉ báo strict CHỈ hiện giữa phiên (bản khóa) — đúng như mockup vẽ (state 3, `.pop__locked`).
          Trước khi bắt đầu, công tắc thật đã nằm trên chính màn Chưa bắt đầu (mockup state 2,
          `.strictrow`); nhắc lại trong panel là trùng hai công tắc y hệt cùng lúc. Đây là chỗ tôi
          lệch khỏi câu chữ AC ⑨ ("trước khi bắt đầu là công tắc thật trong panel") để theo mockup. */}
      {session !== null && (
        <div className="border-border bg-muted flex items-center gap-2 rounded-md border px-3 py-2 text-xs">
          <ShieldCheck className="text-focus-session size-4 shrink-0" />
          <span>
            Chế độ nghiêm ngặt {strictMode ? 'đang bật' : 'đang tắt'}, giữ nguyên cho tới hết phiên.
          </span>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <Button type="button" size="sm" onClick={() => onApply(draft)}>
            Áp dụng
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onClose}>
            Đóng
          </Button>
        </div>
        <Kbd className="text-muted-foreground text-[11px]">Esc</Kbd>
      </div>

      <p className="text-muted-foreground text-[11px] leading-[1.5]">
        {session !== null ? (
          'Đổi mặc định cho mọi phiên: trang Hồ sơ.'
        ) : (
          <>
            Đổi mặc định cho mọi phiên:{' '}
            <Link to="/profile#pomodoro" className="text-foreground underline underline-offset-2">
              trang Hồ sơ
            </Link>
            .
          </>
        )}
      </p>
    </>
  );
}

function ConfigRow({
  label,
  unit,
  children,
}: {
  label: string;
  unit: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm">{label}</span>
      <span className="flex items-center gap-1.5">
        {children}
        <span className="text-muted-foreground text-xs">{unit}</span>
      </span>
    </div>
  );
}
