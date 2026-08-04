import { cn } from '@/lib/utils';

/**
 * Mục "Chat Bubbles — AI Examiner" trong claude-design/components.html:
 * "Màu chỉ dành cho phía AI; phía sinh viên trung tính."
 *
 * `.chat-bubble-ai` / `.chat-bubble-user` (viền + bo góc bất đối xứng, tint
 * ai-accent 8%) đã định nghĩa trong global.css; component này chỉ chọn lớp
 * theo `role`, canh lề, và giới hạn độ rộng 68% để một câu dài không kéo bong
 * bóng chat chạy hết chiều ngang màn hình.
 */
function ChatBubble({
  className,
  role,
  ...props
}: React.ComponentProps<'div'> & { role: 'ai' | 'user' }) {
  return (
    <div
      data-slot="chat-bubble"
      data-role={role}
      className={cn(
        'px-4.5 max-w-[68%] py-3.5 text-sm',
        role === 'ai' ? 'chat-bubble-ai self-start' : 'chat-bubble-user self-end',
        className
      )}
      {...props}
    />
  );
}

export { ChatBubble };
