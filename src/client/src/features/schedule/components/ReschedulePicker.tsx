import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { dateKeyToLocalDate, localDateToDateKey } from '../utils/picker-date';

interface ReschedulePickerProps {
  /** Ngày mục đang đứng, để lịch mở đúng tháng và tô sẵn ô đang chọn. */
  dateKey: string;
  /** Hôm nay theo giờ VN, **do server chốt** — là mốc chặn ngày quá khứ, xem dưới. */
  todayDateKey: string;
  disabled?: boolean;
  onPick: (dateKey: string) => void;
  /** Cho `aria-label` nói ra đang dời cái gì: trong panel có nhiều nút cùng nhãn. */
  conceptName: string;
}

/**
 * "Dời sang ngày…" — `Popover` + `Calendar`, đúng hình dạng đã có ở `CreatePlanPage` (#171).
 *
 * Khác tiền lệ đó ở một điểm quan trọng: ranh giới "quá khứ" lấy từ **`todayDateKey` của server**
 * chứ không từ `new Date()` của máy người dùng. Server từ chối ngày quá khứ theo **lịch VN**
 * (`VALIDATION_ERROR`), nên một máy đặt sai múi giờ mà tự tính "hôm nay" sẽ mở ra một ô mà server
 * chắc chắn trả lỗi — so chuỗi `YYYY-MM-DD` với mốc của server thì hai bên không thể lệch.
 *
 * Không có trần trên: engine tự xếp lịch tới đâu là việc của engine, và server cũng không chặn
 * (đo được `9999-12-31` → 200). Chặn ở client sẽ là một luật thứ hai không ai viết ra.
 */
export function ReschedulePicker({
  dateKey,
  todayDateKey,
  disabled,
  onPick,
  conceptName,
}: ReschedulePickerProps) {
  const [open, setOpen] = useState(false);
  const selected = dateKeyToLocalDate(dateKey);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          aria-label={`Dời "${conceptName}" sang ngày khác`}
        >
          Dời sang ngày…
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          disabled={(date) => localDateToDateKey(date) < todayDateKey}
          onSelect={(date) => {
            if (!date) return;
            setOpen(false);
            onPick(localDateToDateKey(date));
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
