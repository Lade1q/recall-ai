import { useEffect, useState } from 'react';
import { Toaster as Sonner, type ToasterProps } from 'sonner';
import {
  CircleCheckIcon,
  InfoIcon,
  TriangleAlertIcon,
  OctagonXIcon,
  Loader2Icon,
} from 'lucide-react';

/**
 * Theo dõi class `.dark` trên `<html>` — nguồn chân lý duy nhất của theme trong app này
 * (đặt lúc khởi động ở `index.html`, bật/tắt bởi công tắc trong `MainLayout`). Không có
 * ThemeProvider để subscribe nên dùng `MutationObserver`: rẻ, đúng API nền tảng, và tự
 * đúng dù ai đổi class.
 */
function useIsDarkTheme(): boolean {
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));

  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => setIsDark(root.classList.contains('dark')));
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return isDark;
}

const Toaster = ({ ...props }: ToasterProps) => {
  // Bám theo theme của app, KHÔNG dùng "system" của Sonner (theo OS, không liên quan tới
  // app). Toast là kênh phản hồi chính của màn vấn đáp toàn màn hình, để nó sáng trên nền
  // tối là hỏng đúng chỗ dễ thấy nhất.
  const theme: ToasterProps['theme'] = useIsDarkTheme() ? 'dark' : 'light';

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      richColors
      closeButton
      duration={6000}
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
          '--border-radius': 'var(--radius)',
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: 'cn-toast',
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
