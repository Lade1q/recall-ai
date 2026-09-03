import React, { useRef, useState } from 'react';
import { UploadCloud, AlertCircle, FileText, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FileDropzoneProps {
  onFilesChange: (files: File[]) => void;
  selectedFiles: File[];
  error?: string | null;
  allowedTypes?: string[];
  acceptString?: string;
  errorText?: string;
  /**
   * How many files this particular dropzone may still take. Defaults to a whole plan's worth.
   *
   * "Thêm tài liệu" passes the REMAINING slots of an existing plan: the ceiling is per-plan, so a
   * plan already holding six files can only take two more. Without this the dropzone would happily
   * accept eight and let the server be the one to say no, after the upload.
   */
  maxFiles?: number;
}

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
/** Documents one plan may hold — mirrors `MAX_FILES_PER_PLAN` on the server. */
export const MAX_FILES = 8;
/** Combined size of one upload — mirrors `MAX_TOTAL_UPLOAD_SIZE` on the server. */
export const MAX_TOTAL_SIZE = 25 * 1024 * 1024;

const DEFAULT_ALLOWED_TYPES = ['application/pdf', 'text/plain', 'image/png', 'image/jpeg'];

function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Multi-file dropzone: one plan takes a whole subject's worth of documents, and each of them
 * becomes one topic in the graph.
 *
 * The limits here mirror the server's, and that is on purpose rather than duplication for its own
 * sake — the server still rejects an over-long upload, but only after the whole thing has been
 * transferred. Checking here means the student learns which file is the problem before waiting
 * for 25MB to travel.
 */
export function FileDropzone({
  onFilesChange,
  selectedFiles,
  error: externalError,
  allowedTypes = DEFAULT_ALLOWED_TYPES,
  acceptString = '.pdf,.txt,.png,.jpg,.jpeg',
  errorText = 'Định dạng không được hỗ trợ. Chỉ nhận PDF, TXT, PNG, JPG.',
  maxFiles = MAX_FILES,
}: FileDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFiles = (incoming: File[]) => {
    setLocalError(null);
    if (incoming.length === 0) return;

    const rejected = incoming.find((f) => !allowedTypes.includes(f.type));
    if (rejected) {
      // Naming the file matters as soon as there can be more than one: "định dạng không hỗ trợ"
      // on its own leaves the student guessing which of five files to remove.
      setLocalError(`${rejected.name}: ${errorText}`);
      return;
    }

    const tooBig = incoming.find((f) => f.size > MAX_FILE_SIZE);
    if (tooBig) {
      setLocalError(`${tooBig.name} nặng ${formatMb(tooBig.size)}, vượt giới hạn 10 MB mỗi tệp.`);
      return;
    }

    // Same file picked twice is a slip, not an intent — and two documents with the same name
    // would be indistinguishable in the topic graph.
    const existingKeys = new Set(selectedFiles.map((f) => `${f.name}:${f.size}`));
    const fresh = incoming.filter((f) => !existingKeys.has(`${f.name}:${f.size}`));
    if (fresh.length === 0) {
      setLocalError('Tệp này đã có trong danh sách.');
      return;
    }

    const next = [...selectedFiles, ...fresh];
    if (next.length > maxFiles) {
      setLocalError(
        maxFiles < MAX_FILES
          ? `Kế hoạch này chỉ còn ${maxFiles} chỗ trong ${MAX_FILES} tệp (đang chọn ${next.length}).`
          : `Một kế hoạch nhận tối đa ${MAX_FILES} tệp (đang chọn ${next.length}).`
      );
      return;
    }

    const totalSize = next.reduce((sum, f) => sum + f.size, 0);
    if (totalSize > MAX_TOTAL_SIZE) {
      setLocalError(
        `Tổng dung lượng ${formatMb(totalSize)}, vượt giới hạn ${formatMb(MAX_TOTAL_SIZE)} cho một kế hoạch.`
      );
      return;
    }

    onFilesChange(next);
  };

  const removeFile = (index: number) => {
    setLocalError(null);
    onFilesChange(selectedFiles.filter((_, i) => i !== index));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    addFiles(Array.from(e.dataTransfer.files ?? []));
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    addFiles(Array.from(e.target.files ?? []));
    // Reset so picking the same file again after removing it still fires `change`.
    e.target.value = '';
  };

  const error = externalError || localError;
  const totalSize = selectedFiles.reduce((sum, f) => sum + f.size, 0);
  const remaining = maxFiles - selectedFiles.length;

  return (
    <div>
      {selectedFiles.length > 0 && (
        <ul className="mb-2 flex flex-col gap-1.5">
          {selectedFiles.map((file, index) => (
            <li
              key={`${file.name}:${file.size}`}
              className="border-border bg-background flex items-center gap-3 rounded-md border px-3 py-2"
            >
              <FileText className="text-primary h-4 w-4 shrink-0" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium">{file.name}</div>
                <div className="text-muted-foreground font-mono text-[11px]">
                  {formatMb(file.size)}
                </div>
              </div>
              <button
                type="button"
                aria-label={`Bỏ ${file.name}`}
                className="text-muted-foreground hover:text-foreground shrink-0 transition-colors"
                onClick={() => removeFile(index)}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {remaining > 0 && (
        <div
          className={cn(
            'border-border bg-card cursor-pointer rounded-[calc(var(--radius)*1.1)] border border-dashed text-center transition-colors',
            selectedFiles.length > 0 ? 'p-4' : 'p-7',
            isDragging && 'border-primary bg-primary/5',
            error && 'border-destructive/55 bg-destructive/5'
          )}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setIsDragging(false);
          }}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            type="file"
            multiple
            ref={fileInputRef}
            className="hidden"
            accept={acceptString}
            onChange={handleChange}
          />
          <div className="flex flex-col items-center justify-center">
            {selectedFiles.length === 0 && (
              <UploadCloud
                className={cn('mb-2 h-7 w-7', error ? 'text-destructive' : 'text-muted-foreground')}
              />
            )}
            <div className="text-sm font-medium">
              {selectedFiles.length === 0
                ? 'Kéo thả tệp vào đây, hoặc bấm để chọn'
                : 'Thêm tệp nữa'}
            </div>
            <div className="text-muted-foreground mt-1 font-mono text-xs">
              PDF, TXT, PNG, JPG ·{' '}
              {maxFiles < MAX_FILES
                ? `còn ${remaining} chỗ trong ${MAX_FILES} tệp`
                : `tối đa ${MAX_FILES} tệp`}{' '}
              · mỗi tệp 10 MB · tổng {formatMb(MAX_TOTAL_SIZE)}
            </div>
          </div>
        </div>
      )}

      {selectedFiles.length > 0 && (
        <p className="text-muted-foreground mt-2 font-mono text-[11.5px]">
          {selectedFiles.length}/{maxFiles} tệp · {formatMb(totalSize)} · mỗi tệp là một chủ đề
          trong đồ thị
        </p>
      )}

      {error && (
        <p className="text-destructive mt-2 flex items-start gap-2 text-xs leading-[1.6]">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}
