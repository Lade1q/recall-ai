import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm, Controller, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { CalendarIcon, Loader2 } from 'lucide-react';
import { format, differenceInDays, startOfDay } from 'date-fns';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Field, FieldLabel, FieldError, FieldDescription } from '@/components/ui/field';
import { toast } from 'sonner';

import { FileDropzone, MAX_FILE_SIZE } from '@/features/study-planner/components/FileDropzone';
import { AnalysisProgressPanel } from '@/features/study-planner/components/AnalysisProgressPanel';
import { planApi, getCreatePlanErrorMessage } from '@/features/study-planner/api/plan.api';
import { PlanDetails } from '@/features/study-planner/types/concept';
import { PlanCreationStepper } from '@/features/study-planner/components/PlanCreationStepper';
import { Heading } from '@/components/ui/heading';

const formSchema = z.object({
  planName: z.string().min(1, 'Vui lòng nhập tên kế hoạch').max(100, 'Tên kế hoạch quá dài'),
  deadline: z
    .date({
      message: 'Vui lòng chọn hạn hoàn thành.',
    })
    .refine((date) => startOfDay(date) >= startOfDay(new Date()), {
      message: 'Hạn hoàn thành không được nằm trong quá khứ.',
    }),
});

type FormValues = z.infer<typeof formSchema>;

export default function CreatePlanPage() {
  const navigate = useNavigate();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [submitPhase, setSubmitPhase] = useState<'idle' | 'uploading' | 'analyzing'>('idle');
  const [fileError, setFileError] = useState(false);
  const [activeTab, setActiveTab] = useState<'pdf' | 'img' | 'text'>('pdf');
  const [textContent, setTextContent] = useState('');
  // Polled plan snapshot for the real 4-phase progress panel (Issue #186) — each poll in
  // the loop below refreshes it, so the panel reflects the AnalysisJob's actual phase.
  const [analysisPlan, setAnalysisPlan] = useState<PlanDetails | null>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (submitPhase !== 'analyzing') return;
    const clockId = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(clockId);
  }, [submitPhase]);

  const {
    control,
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      planName: '',
    },
  });

  const deadlineValue = useWatch({ control, name: 'deadline' });
  const daysLeft = deadlineValue
    ? differenceInDays(startOfDay(deadlineValue), startOfDay(new Date()))
    : null;

  const onSubmit = async (values: FormValues) => {
    let fileToUpload: File | null = selectedFile;

    if (activeTab === 'text') {
      if (!textContent.trim()) {
        setFileError(true);
        return;
      }
      const blob = new Blob([textContent], { type: 'text/plain' });
      if (blob.size > MAX_FILE_SIZE) {
        const sizeMB = (blob.size / (1024 * 1024)).toFixed(1);
        toast.error(`Văn bản dán vào nặng ${sizeMB} MB, vượt giới hạn 10 MB.`);
        return;
      }
      fileToUpload = new File([blob], 'pasted-text.txt', { type: 'text/plain' });
    } else {
      if (!selectedFile) {
        setFileError(true);
        return;
      }
    }

    setFileError(false);

    try {
      setSubmitPhase('uploading');
      const formData = new FormData();
      formData.append('name', values.planName);
      formData.append('deadline', format(values.deadline, 'yyyy-MM-dd'));
      formData.append('file', fileToUpload!);

      const response = await planApi.createPlan(formData);

      setSubmitPhase('analyzing');

      let currentStatus = 'pending';
      while (currentStatus === 'pending' || currentStatus === 'processing') {
        await new Promise((resolve) => setTimeout(resolve, 2500));
        const plan = await planApi.getPlan(response.planId);
        setAnalysisPlan(plan);
        currentStatus = plan.analysisStatus || 'done';
        if (currentStatus === 'failed') {
          toast.error('Phân tích tài liệu thất bại (lỗi AI). Vui lòng thử lại.');
          setSubmitPhase('idle');
          return;
        }
      }

      // Hold the panel a beat so the last phase's checkmark is actually visible — without
      // this, "Kiểm tra chu trình (DAG)" finishing and step 3 replacing the panel happened
      // in the same instant, so the user never saw it complete.
      await new Promise((resolve) => setTimeout(resolve, 800));

      // Bước 3 của luồng tạo: kiểm chứng đồ thị AI đề xuất. Route riêng chứ không phải
      // `?mode=edit` — đây vẫn là luồng "Kế hoạch ôn tập", không phải sửa đồ thị của một
      // kế hoạch đang chạy (Issue #274).
      navigate(`/plan/${response.planId}/verify`);
    } catch (error) {
      console.error('Failed to create plan:', error);
      toast.error(getCreatePlanErrorMessage(error));
      setSubmitPhase('idle');
    }
  };

  if (submitPhase !== 'idle') {
    const documentLabel = activeTab === 'text' ? 'Văn bản (Dán)' : selectedFile?.name || 'Tài liệu';

    return (
      <div className="mx-auto w-full max-w-3xl pb-12 pt-6">
        <div className="text-muted-foreground mb-4 flex items-center gap-2 text-[13px]">
          <button
            onClick={() => navigate('/plans')}
            className="hover:text-foreground hover:border-border border-b border-transparent pb-px transition-colors"
          >
            Kế hoạch ôn tập
          </button>
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="opacity-50"
          >
            <path d="M9 6l6 6-6 6" />
          </svg>
          <span>Tạo mới</span>
        </div>

        <Heading as="h1" size="page" className="mb-2 leading-tight tracking-tight">
          Tạo kế hoạch mới
        </Heading>
        <p className="text-muted-foreground mb-7 text-pretty text-[14px]">
          Tải lên tài liệu học tập của bạn, AI sẽ tự động phân tích và trích xuất các khái niệm cốt
          lõi cùng quan hệ tiên quyết giữa chúng.
        </p>

        <PlanCreationStepper
          step={2}
          analysisStatus={submitPhase === 'uploading' ? 'idle' : 'running'}
        />

        <div className="max-w-155 mx-auto flex w-full flex-col gap-3.5 pt-6">
          {/* Keyed by submitPhase so "uploading" → "analyzing" re-triggers the entrance
              animation instead of snapping straight to the new content. */}
          <div
            key={submitPhase}
            className="animate-in fade-in slide-in-from-bottom-2 flex flex-col gap-3.5 duration-300"
          >
            {submitPhase === 'uploading' ? (
              <>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[15px] font-semibold">
                    Đang tải lên &ldquo;{documentLabel}&rdquo;
                  </span>
                  <span className="text-muted-foreground font-mono text-xs">0:00</span>
                </div>
                <div className="flex flex-col gap-2">
                  <div className="text-foreground flex items-center gap-2.5 text-[13px] font-medium">
                    <Loader2 className="text-primary h-3.75 w-3.75 animate-spin" />
                    Đang gửi dữ liệu lên máy chủ...
                  </div>
                </div>
              </>
            ) : (
              // Real 4-phase progress (Issue #186) — replaces #163's static placeholder track
              // with the AnalysisJob's actual phase, polled by the loop in onSubmit above.
              <AnalysisProgressPanel
                filename={analysisPlan?.document?.filename ?? documentLabel}
                pageCount={analysisPlan?.document?.pageCount}
                documentKind={analysisPlan?.document?.kind}
                startedAt={analysisPlan?.analysisStartedAt}
                now={now}
                phase={analysisPlan?.analysisPhase ?? null}
                complete={analysisPlan?.analysisStatus === 'done'}
              />
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl pb-12 pt-6">
      <div className="text-muted-foreground mb-4 flex items-center gap-2 text-[13px]">
        <button
          onClick={() => navigate('/plans')}
          className="hover:text-foreground hover:border-border border-b border-transparent pb-px transition-colors"
        >
          Kế hoạch ôn tập
        </button>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="opacity-50"
        >
          <path d="M9 6l6 6-6 6" />
        </svg>
        <span>Tạo mới</span>
      </div>

      <Heading as="h1" size="page" className="mb-2 leading-tight tracking-tight">
        Tạo kế hoạch ôn tập
      </Heading>
      <p className="text-muted-foreground max-w-160 mb-7 text-sm leading-relaxed">
        Nhập tên, chọn hạn hoàn thành và tải lên tài liệu. Hệ thống sẽ phân tích nội dung để trích
        xuất các khái niệm cốt lõi cùng quan hệ tiên quyết.
      </p>

      {/* Thanh 3 bước mô phỏng UI */}
      <PlanCreationStepper step={1} />

      <form id="create-plan-form" onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
        <Field>
          <FieldLabel htmlFor="planName" className="mb-1.5 text-[13px] font-medium">
            Tên kế hoạch
          </FieldLabel>
          <Input
            id="planName"
            placeholder="Ví dụ: Mạng máy tính"
            {...register('planName')}
            className="text-sm"
          />
          {errors.planName?.message && <FieldError>{errors.planName.message}</FieldError>}
        </Field>

        <Field>
          <FieldLabel className="mb-1.5 text-[13px] font-medium">Hạn ôn xong</FieldLabel>
          <div className="flex items-center gap-2.5">
            <Controller
              control={control}
              name="deadline"
              render={({ field }) => (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant={'outline'}
                      className={cn(
                        'w-45 justify-start text-left font-normal',
                        !field.value && 'text-muted-foreground'
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4 opacity-50" />
                      {field.value ? format(field.value, 'dd/MM/yyyy') : <span>Chọn ngày</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={field.value}
                      onSelect={field.onChange}
                      disabled={(date) => startOfDay(date) < startOfDay(new Date())}
                    />
                  </PopoverContent>
                </Popover>
              )}
            />
            {daysLeft !== null && daysLeft >= 0 && (
              <span className="text-muted-foreground font-mono text-[12px]">
                còn {daysLeft} ngày
              </span>
            )}
          </div>
          {errors.deadline?.message && <FieldError>{errors.deadline.message}</FieldError>}
          <FieldDescription className="mt-1.5 text-xs">
            Hệ thống dùng mốc này để rải khái niệm theo độ khó và quan hệ tiên quyết.
          </FieldDescription>
        </Field>

        <Field>
          <FieldLabel id="src-label" className="mb-1.5 text-[13px] font-medium">
            Tài liệu ôn tập
          </FieldLabel>
          <div
            className="bg-card border-border w-fit! mb-3 flex overflow-hidden rounded-lg border"
            role="tablist"
            aria-labelledby="src-label"
          >
            <button
              type="button"
              role="tab"
              className={cn(
                'border-border border-r px-4 py-1.5 font-sans text-[13px] font-medium transition-colors',
                activeTab === 'pdf'
                  ? 'bg-accent text-foreground'
                  : 'text-muted-foreground hover:bg-accent/50'
              )}
              onClick={() => {
                setActiveTab('pdf');
                setFileError(false);
              }}
              aria-selected={activeTab === 'pdf'}
            >
              Tệp PDF
            </button>
            <button
              type="button"
              role="tab"
              className={cn(
                'border-border border-r px-4 py-1.5 font-sans text-[13px] font-medium transition-colors',
                activeTab === 'img'
                  ? 'bg-accent text-foreground'
                  : 'text-muted-foreground hover:bg-accent/50'
              )}
              onClick={() => {
                setActiveTab('img');
                setFileError(false);
              }}
              aria-selected={activeTab === 'img'}
            >
              Ảnh chụp
            </button>
            <button
              type="button"
              role="tab"
              className={cn(
                'px-4 py-1.5 font-sans text-[13px] font-medium transition-colors',
                activeTab === 'text'
                  ? 'bg-accent text-foreground'
                  : 'text-muted-foreground hover:bg-accent/50'
              )}
              onClick={() => {
                setActiveTab('text');
                setFileError(false);
              }}
              aria-selected={activeTab === 'text'}
            >
              Dán text
            </button>
          </div>

          {activeTab === 'text' ? (
            <textarea
              className={cn(
                'border-border bg-card focus-visible:ring-primary min-h-40 w-full resize-none rounded-[calc(var(--radius)*1.1)] border p-4 text-sm focus-visible:outline-none focus-visible:ring-1',
                fileError && 'border-destructive focus-visible:ring-destructive'
              )}
              placeholder="Dán nội dung văn bản vào đây..."
              value={textContent}
              onChange={(e) => {
                setTextContent(e.target.value);
                if (e.target.value.trim()) setFileError(false);
              }}
            />
          ) : (
            <FileDropzone
              selectedFile={selectedFile}
              onFileSelect={(file) => {
                setSelectedFile(file);
                if (file) setFileError(false);
              }}
              error={fileError ? 'Vui lòng tải lên tài liệu để tiếp tục.' : undefined}
              allowedTypes={
                activeTab === 'pdf' ? ['application/pdf'] : ['image/png', 'image/jpeg', 'image/jpg']
              }
              acceptString={activeTab === 'pdf' ? '.pdf' : '.png,.jpg,.jpeg'}
              hintText={activeTab === 'pdf' ? 'PDF · tối đa 10 MB' : 'PNG, JPG · tối đa 10 MB'}
              errorText={
                activeTab === 'pdf'
                  ? 'Định dạng không được hỗ trợ. Chỉ nhận PDF.'
                  : 'Định dạng không được hỗ trợ. Chỉ nhận ảnh PNG, JPG.'
              }
            />
          )}
        </Field>

        <div className="mt-2 flex gap-2.5">
          <Button type="submit" disabled={submitPhase !== 'idle'}>
            Phân tích tài liệu
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => navigate(-1)}
            disabled={submitPhase !== 'idle'}
          >
            Hủy
          </Button>
        </div>
      </form>
    </div>
  );
}
