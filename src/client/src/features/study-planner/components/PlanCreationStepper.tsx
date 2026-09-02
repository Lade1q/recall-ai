import { cn } from '@/lib/utils';
import { Spinner } from '@/components/ui/spinner';

export interface PlanCreationStepperProps {
  step: 1 | 2 | 3;
  analysisStatus?: 'idle' | 'running' | 'failed' | 'done';
}

export function PlanCreationStepper({ step, analysisStatus = 'idle' }: PlanCreationStepperProps) {
  return (
    <ol className="bg-card border-border mb-6 flex overflow-hidden rounded-[calc(var(--radius)*0.9)] border">
      <li
        aria-current={step === 1 ? 'step' : undefined}
        className={cn(
          'border-border flex min-w-0 flex-1 items-center gap-2.5 border-r px-4 py-3 text-[13px]',
          step === 1 ? 'bg-accent text-foreground font-semibold' : 'text-muted-foreground'
        )}
      >
        <span
          className={cn(
            'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
            step === 1
              ? 'bg-primary text-primary-foreground border-primary font-mono text-[11px]'
              : 'border-primary/40 bg-primary/10 text-primary-text'
          )}
        >
          {step === 1 ? (
            '1'
          ) : (
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 12.5l5.2 5.2L20 7" />
            </svg>
          )}
        </span>
        <span className="truncate">Nhập thông tin & tải tài liệu</span>
      </li>
      <li
        aria-current={step === 2 ? 'step' : undefined}
        className={cn(
          'border-border flex min-w-0 flex-1 items-center gap-2.5 border-r px-4 py-3 text-[13px]',
          step === 2 ? 'text-foreground font-semibold' : 'text-muted-foreground'
        )}
      >
        <span
          className={cn(
            'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
            step === 1 || analysisStatus === 'idle'
              ? 'border-border font-mono text-[11px]'
              : analysisStatus === 'failed'
                ? 'border-destructive/40 bg-destructive/10 text-destructive'
                : 'border-primary/40 bg-primary/10 text-primary-text'
          )}
        >
          {step === 1 || analysisStatus === 'idle' ? (
            '2'
          ) : analysisStatus === 'failed' ? (
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          ) : analysisStatus === 'running' ? (
            <Spinner className="size-2.5" />
          ) : (
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 12.5l5.2 5.2L20 7" />
            </svg>
          )}
        </span>
        <span className="truncate">AI phân tích</span>
      </li>
      <li
        aria-current={step === 3 ? 'step' : undefined}
        className={cn(
          'flex min-w-0 flex-1 items-center gap-2.5 px-4 py-3 text-[13px]',
          step === 3 ? 'bg-accent text-foreground font-semibold' : 'text-muted-foreground'
        )}
      >
        <span
          className={cn(
            'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border font-mono text-[11px]',
            step === 3 ? 'bg-primary text-primary-foreground border-primary' : 'border-border'
          )}
        >
          3
        </span>
        <span className="truncate">Kiểm chứng & xác nhận</span>
      </li>
    </ol>
  );
}
