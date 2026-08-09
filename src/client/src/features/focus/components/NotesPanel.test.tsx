import { render, screen, fireEvent, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotesPanel } from './NotesPanel';
import { useAutosaveNote, type UseAutosaveNoteReturn } from '../hooks/useAutosaveNote';
import type { SessionNote } from '../types/focus.types';

vi.mock('../hooks/useAutosaveNote', () => ({ useAutosaveNote: vi.fn() }));
const mockedHook = vi.mocked(useAutosaveNote);

function note(over: Partial<SessionNote> = {}): SessionNote {
  return {
    id: 'n-1',
    sessionId: 's-1',
    conceptId: 'c-1',
    body: 'body',
    createdAt: '2026-08-09T13:31:00Z',
    updatedAt: '2026-08-09T13:31:00Z',
    ...over,
  };
}

function setup(over: Partial<UseAutosaveNoteReturn> = {}) {
  const value: UseAutosaveNoteReturn = {
    draft: '',
    setDraft: vi.fn(),
    status: 'idle',
    savedAt: null,
    notes: [],
    commitNote: vi.fn(),
    canCommit: false,
    ...over,
  };
  mockedHook.mockReturnValue(value);
  render(<NotesPanel sessionId="s-1" conceptId="c-1" conceptName="Ngăn xếp" />);
  return value;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('NotesPanel', () => {
  it('titles the panel with the anchored concept', () => {
    setup();
    expect(screen.getByText(/Ghi chú · Ngăn xếp/)).toBeInTheDocument();
  });

  it('shows the saving label while a save is in flight', () => {
    setup({ status: 'saving' });
    expect(screen.getByText('Đang lưu…')).toBeInTheDocument();
  });

  it('shows the saved timestamp when saved', () => {
    setup({ status: 'saved', savedAt: new Date('2026-08-09T20:47:00') });
    expect(screen.getByText(/^Đã lưu \d{2}:\d{2}$/)).toBeInTheDocument();
  });

  it('renders previous notes in the order given (newest-first)', () => {
    setup({
      notes: [
        note({ id: 'n-2', body: 'Ghi chú mới hơn' }),
        note({ id: 'n-1', body: 'Ghi chú cũ hơn' }),
      ],
    });
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Ghi chú mới hơn');
    expect(items[1]).toHaveTextContent('Ghi chú cũ hơn');
  });

  it('disables "Ghi chú mới" when there is nothing to commit', () => {
    setup({ canCommit: false });
    expect(screen.getByRole('button', { name: 'Ghi chú mới' })).toBeDisabled();
  });

  it('commits the current note when "Ghi chú mới" is clicked', () => {
    const value = setup({ draft: 'đang soạn', canCommit: true });
    const button = screen.getByRole('button', { name: 'Ghi chú mới' });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(value.commitNote).toHaveBeenCalledTimes(1);
  });

  it('forwards typing to setDraft', () => {
    const value = setup();
    const textarea = screen.getByRole('textbox', { name: /Ghi chú cho khái niệm Ngăn xếp/ });
    fireEvent.change(textarea, { target: { value: 'x' } });
    expect(value.setDraft).toHaveBeenCalledWith('x');
  });

  it('does not render a list when there are no previous notes', () => {
    setup({ notes: [] });
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    // sanity: within the panel there are no list items
    expect(within(screen.getByRole('complementary')).queryAllByRole('listitem')).toHaveLength(0);
  });
});
