import { useState } from 'react';
import { Info, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FileDropzone, MAX_FILES } from './FileDropzone';

export type AddDocumentsMode = 'full' | 'append';

interface AddDocumentsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planName: string;
  /** Files the plan already holds — one per topic, and what the remaining slots are counted from. */
  documentCount: number;
  conceptCount: number;
  isSubmitting: boolean;
  onSubmit: (files: File[], mode: AddDocumentsMode) => void;
}

interface ModeOption {
  value: AddDocumentsMode;
  title: string;
  /** Files this mode will actually send to the AI, given how many are being added. */
  cost: (existing: number, incoming: number) => string;
  body: React.ReactNode;
}

/**
 * The two modes, with their trade-off spelled out rather than ranked.
 *
 * `full` is pre-selected because it is the accurate one, not because `append` is a lesser option —
 * and the copy for `append` deliberately promises only what it delivers: it joins the new file to
 * the old graph at the TOPIC layer. It does not create prerequisite edges between a new concept
 * and an old one; phase 2 never reads the documents themselves. Saying "nối liền hai đồ thị" here
 * would be the kind of claim the verify screen then has to walk back.
 */
const MODES: readonly ModeOption[] = [
  {
    value: 'full',
    title: 'Đọc lại toàn bộ tài liệu',
    cost: (existing, incoming) => `${existing + incoming} tệp`,
    body: (
      <>
        AI đọc lại tất cả các tệp (song song) rồi dựng lại đồ thị. Chính xác nhất — mọi quan hệ đều
        lấy thẳng từ tài liệu. Điểm thành thạo, checkpoint và lịch sử vấn đáp của khái niệm cũ được
        giữ nguyên.
      </>
    ),
  },
  {
    value: 'append',
    title: 'Chỉ đọc tệp mới, rồi nối vào đồ thị cũ',
    cost: (_existing, incoming) => `${incoming} tệp`,
    body: (
      <>
        Nhanh và rẻ hơn. Hệ thống chỉ <b className="text-foreground font-semibold">thêm</b>, không
        sửa và không khai tử gì của đồ thị cũ. Chủ đề mới được nối vào các chủ đề cũ, nhưng chỉ ở{' '}
        <b className="text-foreground font-semibold">tầng chủ đề</b>: quan hệ đó AI suy từ mô tả
        khái niệm chứ không đọc lại tài liệu, nên nó được vẽ nét đứt để bạn soát ở bước kiểm chứng.
      </>
    ),
  },
];

/**
 * "Thêm tài liệu vào kế hoạch" (§4) — artboard ⑥ of the multi-document mockup.
 *
 * Shows BOTH modes and picks neither for the user beyond a default: the two differ in accuracy vs
 * cost, and which one is right depends on whether the new file belongs with the old ones or simply
 * comes after them. The server takes no default either — `mode` is a required field there.
 *
 * Holds the picked files and the chosen mode in local state and does NOT reset them itself: the
 * caller remounts it with a `key` per plan, so every close discards this state by construction.
 * An effect that cleared it on `open === false` would be a cascading render, and would still miss
 * the path where the parent closes the dialog after a successful submit.
 */
export function AddDocumentsDialog({
  open,
  onOpenChange,
  planName,
  documentCount,
  conceptCount,
  isSubmitting,
  onSubmit,
}: AddDocumentsDialogProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [mode, setMode] = useState<AddDocumentsMode>('full');

  const remainingSlots = Math.max(0, MAX_FILES - documentCount);
  const isFull = remainingSlots === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[660px]">
        <DialogHeader>
          <DialogTitle>Thêm tài liệu vào kế hoạch</DialogTitle>
          <DialogDescription>
            {planName} · đang có {documentCount} tài liệu (= {documentCount} chủ đề), {conceptCount}{' '}
            khái niệm
          </DialogDescription>
        </DialogHeader>

        {isFull ? (
          <p className="text-muted-foreground text-[13px] leading-[1.7]">
            Kế hoạch này đã dùng hết {MAX_FILES} chỗ tài liệu. Hãy tạo một kế hoạch khác cho phần
            còn lại của môn học.
          </p>
        ) : (
          <>
            <FileDropzone
              selectedFiles={files}
              onFilesChange={setFiles}
              maxFiles={remainingSlots}
            />

            <div>
              <div className="mb-2 text-[13px] font-medium">Phân tích thế nào?</div>
              <div
                className="flex flex-col gap-2.5"
                role="radiogroup"
                aria-label="Chế độ phân tích"
              >
                {MODES.map((option) => {
                  const selected = mode === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setMode(option.value)}
                      className={cn(
                        'border-border bg-card flex cursor-pointer gap-3 rounded-[10px] border p-3.5 text-left',
                        selected && 'border-primary ring-primary/15 ring-[3px]'
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          'border-border bg-card mt-0.5 size-4 flex-none rounded-full border',
                          selected && 'border-primary border-[5px]'
                        )}
                      />
                      <span className="min-w-0">
                        <span className="block text-[13.5px] font-semibold">
                          {option.title}{' '}
                          <span className="text-muted-foreground font-mono text-[11px] font-normal">
                            · AI đọc {option.cost(documentCount, files.length)}
                          </span>
                        </span>
                        <span className="text-muted-foreground mt-1.5 block text-[12.5px] leading-[1.6]">
                          {option.body}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="border-ai-accent/28 bg-ai-accent/6 flex gap-2.5 rounded-lg border p-3 text-[12.5px] leading-[1.65]">
              <Info className="text-ai-accent mt-0.5 size-[15px] flex-none" aria-hidden="true" />
              <span className="text-muted-foreground">
                Sau khi phân tích xong, kế hoạch quay lại bước{' '}
                <b className="text-foreground font-semibold">kiểm chứng</b>. Lịch ôn tạm dừng cho
                tới khi bạn xác nhận đồ thị mới — điểm thành thạo không mất đi trong lúc chờ.
              </span>
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Hủy
          </Button>
          <Button
            onClick={() => onSubmit(files, mode)}
            disabled={isFull || files.length === 0 || isSubmitting}
          >
            {isSubmitting && <Loader2 className="animate-spin" />}
            Phân tích
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
