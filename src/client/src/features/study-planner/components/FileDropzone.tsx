import React, { useRef, useState } from 'react';
import { UploadCloud, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FileDropzoneProps {
  onFileSelect: (file: File | null) => void;
  selectedFile: File | null;
  error?: string | null;
  allowedTypes?: string[];
  acceptString?: string;
  hintText?: string;
  errorText?: string;
}

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const DEFAULT_ALLOWED_TYPES = ['application/pdf', 'text/plain', 'image/png', 'image/jpeg'];

export function FileDropzone({
  onFileSelect,
  selectedFile,
  error: externalError,
  allowedTypes = DEFAULT_ALLOWED_TYPES,
  acceptString = '.pdf,.txt,.png,.jpg,.jpeg',
  hintText = 'PDF, TXT, PNG, JPG · tối đa 10 MB',
  errorText = 'Định dạng không được hỗ trợ. Chỉ nhận PDF, TXT, PNG, JPG.',
}: FileDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateAndSetFile = (file: File) => {
    setLocalError(null);
    if (!allowedTypes.includes(file.type)) {
      setLocalError(errorText);
      onFileSelect(null);
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
      setLocalError(`Tệp nặng ${sizeMB} MB, vượt giới hạn 10 MB.`);
      onFileSelect(null);
      return;
    }
    onFileSelect(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const error = externalError || localError;

  return (
    <div>
      <div
        className={cn(
          'border-border bg-card cursor-pointer rounded-[calc(var(--radius)*1.1)] border border-dashed p-7 text-center transition-colors',
          isDragging && 'border-primary bg-primary/5',
          error && 'border-destructive/55 bg-destructive/5'
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          accept={acceptString}
          onChange={handleChange}
        />
        {selectedFile && !error ? (
          <div className="flex flex-col items-center justify-center">
            <UploadCloud className="text-primary mb-2 h-7 w-7" />
            <div className="text-sm font-medium">{selectedFile.name}</div>
            <div className="text-muted-foreground mt-1 font-mono text-xs">
              {(selectedFile.size / (1024 * 1024)).toFixed(1)} MB
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center">
            <UploadCloud
              className={cn('mb-2 h-7 w-7', error ? 'text-destructive' : 'text-muted-foreground')}
            />
            <div className="text-sm font-medium">Kéo thả tệp vào đây, hoặc bấm để chọn</div>
            <div className="text-muted-foreground mt-1 font-mono text-xs">{hintText}</div>
          </div>
        )}
      </div>

      {error && (
        <p className="text-destructive mt-2 flex items-start gap-2 text-xs leading-[1.6]">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}
