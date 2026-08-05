import { useState, type KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';

interface AnswerInputProps {
  /**
   * Callback gửi câu trả lời. Trả `false` (đồng bộ hoặc qua Promise) khi gửi thất bại
   * để ô nhập GIỮ NGUYÊN nội dung đã gõ — sinh viên không phải gõ lại. Trả `true`/`void`
   * khi thành công thì ô nhập tự xóa. Cùng contract này sẽ được `VoiceAnswerInput` (I6.9)
   * tái sử dụng, nên không nhắc gì tới Web Speech API ở đây.
   */
  onSubmit: (text: string) => void | Promise<boolean | void>;
  disabled?: boolean;
  isSubmitting?: boolean;
}

/**
 * Ô trả lời dạng gõ (mặc định Sprint 4). Ctrl/Cmd + Enter để gửi nhanh vì cả phiên có
 * thể làm mà không rời tay khỏi bàn phím.
 */
export function AnswerInput({
  onSubmit,
  disabled = false,
  isSubmitting = false,
}: AnswerInputProps) {
  const [text, setText] = useState('');
  const isBlocked = disabled || isSubmitting;

  const handleSubmit = async (): Promise<void> => {
    const trimmed = text.trim();
    if (!trimmed || isBlocked) return;
    const result = await onSubmit(trimmed);
    // Chỉ xóa khi gửi KHÔNG thất bại — `false` nghĩa là lỗi, giữ lại chữ đã gõ.
    if (result !== false) {
      setText('');
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      void handleSubmit();
    }
  };

  return (
    <div>
      <label className="sr-only" htmlFor="interview-answer">
        Câu trả lời của bạn
      </label>
      <textarea
        id="interview-answer"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={handleKeyDown}
        disabled={isBlocked}
        spellCheck={false}
        placeholder="Nhập câu trả lời của bạn…"
        className="max-h-50 min-h-23 border-border bg-background text-foreground focus-visible:outline-ring block w-full resize-y rounded-md border px-3.5 py-3 text-sm leading-[1.62] outline-none transition-colors focus-visible:border-transparent focus-visible:outline-2 focus-visible:outline-offset-1 disabled:cursor-not-allowed disabled:opacity-60"
      />
      <div className="text-muted-foreground mt-2.5 flex items-center gap-3.5 text-xs">
        <span>
          <Kbd>Ctrl</Kbd> + <Kbd>Enter</Kbd> để gửi
        </span>
        <Button
          type="button"
          size="sm"
          className="ml-auto"
          onClick={() => void handleSubmit()}
          loading={isSubmitting}
          disabled={isBlocked || text.trim().length === 0}
        >
          Gửi
        </Button>
      </div>
    </div>
  );
}
