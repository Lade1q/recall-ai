import { render, screen } from '@/utils/test-utils';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AddDocumentsDialog } from './AddDocumentsDialog';
import { MAX_FILES } from './FileDropzone';

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

function renderDialog(overrides: Partial<React.ComponentProps<typeof AddDocumentsDialog>> = {}) {
  const onSubmit = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <AddDocumentsDialog
      open
      onOpenChange={onOpenChange}
      planName="Công nghệ phần mềm"
      documentCount={5}
      conceptCount={58}
      isSubmitting={false}
      onSubmit={onSubmit}
      {...overrides}
    />
  );
  return { onSubmit, onOpenChange };
}

describe('AddDocumentsDialog', () => {
  it('says what the plan already holds, in topics as well as files', () => {
    renderDialog();

    expect(screen.getByText(/đang có 5 tài liệu \(= 5 chủ đề\), 58 khái niệm/)).toBeInTheDocument();
  });

  it('offers only the slots the plan has left, not a fresh eight', () => {
    renderDialog({ documentCount: 6 });

    expect(screen.getByText(new RegExp(`còn 2 chỗ trong ${MAX_FILES} tệp`))).toBeInTheDocument();
  });

  /**
   * The ceiling is per-plan, so a plan at the limit has nothing to offer — and saying so here is
   * the difference between a clear dead end and an upload the server rejects after the transfer.
   */
  it('refuses to take anything when the plan is already at the file ceiling', () => {
    renderDialog({ documentCount: MAX_FILES });

    expect(document.querySelector('input[type="file"]')).toBeNull();
    expect(screen.getByText(new RegExp(`đã dùng hết ${MAX_FILES} chỗ`))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Phân tích' })).toBeDisabled();
  });

  it('keeps the submit button disabled until a file is picked', async () => {
    const user = userEvent.setup();
    renderDialog();

    expect(screen.getByRole('button', { name: 'Phân tích' })).toBeDisabled();
    await user.upload(fileInput(), pdf('LN09.pdf'));
    expect(screen.getByRole('button', { name: 'Phân tích' })).toBeEnabled();
  });

  it('defaults to reading everything again — the accurate mode', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderDialog();

    await user.upload(fileInput(), pdf('LN09.pdf'));
    await user.click(screen.getByRole('button', { name: 'Phân tích' }));

    expect(onSubmit).toHaveBeenCalledWith([expect.objectContaining({ name: 'LN09.pdf' })], 'full');
  });

  it('sends append when the user picks the cheap mode', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderDialog();

    await user.upload(fileInput(), pdf('LN09.pdf'));
    await user.click(screen.getByRole('radio', { name: /Chỉ đọc tệp mới/ }));
    await user.click(screen.getByRole('button', { name: 'Phân tích' }));

    expect(onSubmit).toHaveBeenCalledWith(
      [expect.objectContaining({ name: 'LN09.pdf' })],
      'append'
    );
  });

  it('marks exactly one mode as chosen', async () => {
    const user = userEvent.setup();
    renderDialog();

    const [full, append] = screen.getAllByRole('radio');
    expect(full).toHaveAttribute('aria-checked', 'true');
    expect(append).toHaveAttribute('aria-checked', 'false');

    await user.click(append!);

    expect(full).toHaveAttribute('aria-checked', 'false');
    expect(append).toHaveAttribute('aria-checked', 'true');
  });

  /**
   * The cost line is what makes the trade-off concrete, and it has to count the RIGHT files:
   * `full` re-reads the plan's existing documents plus the new ones, `append` only the new ones.
   * A line that showed the same number for both would make the two modes look interchangeable.
   */
  it('counts each mode’s AI cost from the real numbers', async () => {
    const user = userEvent.setup();
    renderDialog({ documentCount: 5 });

    await user.upload(fileInput(), pdf('LN09.pdf'));

    expect(screen.getByText('· AI đọc 6 tệp')).toBeInTheDocument();
    expect(screen.getByText('· AI đọc 1 tệp')).toBeInTheDocument();
  });

  /**
   * `append` never claims to join the two concept graphs — phase 2 only orders the documents.
   * This copy is the promise the verify screen has to keep, so it is pinned rather than left to
   * whoever edits the dialog next.
   */
  it('promises append joins at the topic layer only', () => {
    renderDialog();

    const append = screen.getAllByRole('radio')[1];
    expect(append).toHaveTextContent('chỉ ở tầng chủ đề');
    expect(append).toHaveTextContent('không sửa và không khai tử gì của đồ thị cũ');
  });

  it('blocks a second submit while one is in flight', () => {
    renderDialog({ isSubmitting: true });

    expect(screen.getByRole('button', { name: /Phân tích/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Hủy' })).toBeDisabled();
  });
});
