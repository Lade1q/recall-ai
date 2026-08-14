import * as React from 'react';
import { Switch as SwitchPrimitive } from 'radix-ui';

import { cn } from '@/lib/utils';

/**
 * Công tắc bật/tắt theo `.switch` trong claude-design (38×22px, núm trượt bằng transform).
 * Dùng `--focus-session` làm màu bật mặc định — nơi component này xuất hiện đầu tiên là
 * "Chế độ nghiêm ngặt" của màn Focus; nơi khác dùng lại chỉ cần override qua className.
 */
function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        'focus-visible:outline-ring duration-(--duration-fast) ease-(--ease-standard) inline-flex h-[22px] w-[38px] shrink-0 cursor-pointer items-center rounded-full border transition-colors [outline-style:none] focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        'data-[state=checked]:border-focus-session data-[state=checked]:bg-focus-session/20',
        'data-[state=unchecked]:border-border data-[state=unchecked]:bg-muted',
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          'duration-(--duration-fast) ease-(--ease-standard) block size-4 rounded-full transition-transform data-[state=checked]:translate-x-[18px] data-[state=unchecked]:translate-x-0.5',
          // Núm khi TẮT dùng `muted-foreground` (không phải `mastery-untested`): tương phản với nền
          // rãnh `muted` ≥ 3:1 để trạng thái tắt vẫn nhận ra được (WCAG 1.4.11 non-text contrast).
          'data-[state=checked]:bg-focus-session data-[state=unchecked]:bg-muted-foreground'
        )}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
