import { render, screen } from '@/utils/test-utils';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FileDropzone, MAX_FILES } from './FileDropzone';

function pdf(name: string, sizeBytes = 1024): File {
  const file = new File(['x'], name, { type: 'application/pdf' });
  Object.defineProperty(file, 'size', { value: sizeBytes });
  return file;
}

function fileInput(): HTMLInputElement {
  const input = document.querySelector('input[type="file"]');
  if (!input) throw new Error('no file input rendered');
  return input as HTMLInputElement;
}

describe('FileDropzone — multiple documents', () => {
  it('accepts several files at once and reports them all', async () => {
    const onFilesChange = vi.fn();
    const user = userEvent.setup();
    render(<FileDropzone selectedFiles={[]} onFilesChange={onFilesChange} />);

    await user.upload(fileInput(), [pdf('a.pdf'), pdf('b.pdf')]);

    expect(onFilesChange).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'a.pdf' }),
      expect.objectContaining({ name: 'b.pdf' }),
    ]);
  });

  it('adds to the existing selection instead of replacing it', async () => {
    const onFilesChange = vi.fn();
    const user = userEvent.setup();
    render(<FileDropzone selectedFiles={[pdf('a.pdf')]} onFilesChange={onFilesChange} />);

    await user.upload(fileInput(), pdf('b.pdf'));

    expect(onFilesChange.mock.calls[0]?.[0]).toHaveLength(2);
  });

  it('refuses the same file twice rather than creating two identical topics', async () => {
    const onFilesChange = vi.fn();
    const user = userEvent.setup();
    render(<FileDropzone selectedFiles={[pdf('a.pdf')]} onFilesChange={onFilesChange} />);

    await user.upload(fileInput(), pdf('a.pdf'));

    expect(onFilesChange).not.toHaveBeenCalled();
    expect(screen.getByText(/đã có trong danh sách/)).toBeInTheDocument();
  });

  it(`refuses more than ${MAX_FILES} files, naming the real count`, async () => {
    const onFilesChange = vi.fn();
    const existing = Array.from({ length: MAX_FILES }, (_, i) => pdf(`f${i}.pdf`));
    render(<FileDropzone selectedFiles={existing} onFilesChange={onFilesChange} />);

    // The dropzone hides itself once full, so reaching the limit is asserted through the UI
    // rather than through another upload: there is no input left to upload into.
    expect(document.querySelector('input[type="file"]')).toBeNull();
    expect(screen.getByText(`${MAX_FILES}/${MAX_FILES} tệp`, { exact: false })).toBeInTheDocument();
  });

  it('refuses a single file over 10 MB and says which one', async () => {
    const onFilesChange = vi.fn();
    const user = userEvent.setup();
    render(<FileDropzone selectedFiles={[]} onFilesChange={onFilesChange} />);

    await user.upload(fileInput(), pdf('huge.pdf', 11 * 1024 * 1024));

    expect(onFilesChange).not.toHaveBeenCalled();
    expect(screen.getByText(/huge\.pdf/)).toBeInTheDocument();
  });

  it('refuses a batch over the 25 MB total even when every file is under 10 MB', async () => {
    const onFilesChange = vi.fn();
    const user = userEvent.setup();
    const existing = [pdf('a.pdf', 9 * 1024 * 1024), pdf('b.pdf', 9 * 1024 * 1024)];
    render(<FileDropzone selectedFiles={existing} onFilesChange={onFilesChange} />);

    await user.upload(fileInput(), pdf('c.pdf', 9 * 1024 * 1024));

    // Each file is legal on its own; only the sum is not, and multer cannot express that limit.
    expect(onFilesChange).not.toHaveBeenCalled();
    expect(screen.getByText(/Tổng dung lượng/)).toBeInTheDocument();
  });

  it('lets a file be removed from the selection', async () => {
    const onFilesChange = vi.fn();
    const user = userEvent.setup();
    render(
      <FileDropzone selectedFiles={[pdf('a.pdf'), pdf('b.pdf')]} onFilesChange={onFilesChange} />
    );

    await user.click(screen.getByRole('button', { name: 'Bỏ a.pdf' }));

    expect(onFilesChange).toHaveBeenCalledWith([expect.objectContaining({ name: 'b.pdf' })]);
  });

  it('names the file whose format is wrong', async () => {
    const onFilesChange = vi.fn();
    const user = userEvent.setup();
    render(
      <FileDropzone
        selectedFiles={[]}
        onFilesChange={onFilesChange}
        allowedTypes={['application/pdf']}
      />
    );

    await user.upload(fileInput(), new File(['x'], 'notes.txt', { type: 'text/plain' }));

    expect(onFilesChange).not.toHaveBeenCalled();
    expect(screen.getByText(/notes\.txt/)).toBeInTheDocument();
  });
});
