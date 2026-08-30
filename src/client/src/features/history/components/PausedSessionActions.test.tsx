import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';

import { interviewApi } from '@/features/interview/api/interview.api';
import type { GetInterviewResponse } from '@/features/interview/types/interview.types';
import { render, screen, waitFor } from '@/utils/test-utils';
import { PausedSessionActions } from './PausedSessionActions';

vi.mock('@/features/interview/api/interview.api', () => ({
  interviewApi: {
    resumeInterview: vi.fn(),
    abandonInterview: vi.fn(),
  },
  getInterviewErrorMessage: () => 'Lỗi phiên đã được dịch.',
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const mockedApi = vi.mocked(interviewApi);

function detail(): GetInterviewResponse {
  return {
    session: {
      id: 'session-1',
      planId: 'plan-1',
      status: 'paused',
      fallbackMode: false,
      startedAt: '2026-08-30T10:00:00.000Z',
      endedAt: null,
      currentConcept: { id: 'concept-1', name: 'Duyệt đồ thị DFS' },
      progress: {
        conceptIndex: 1,
        conceptTotal: 3,
        completedConcepts: 1,
        turnIndex: 2,
        maxTurnsPerConcept: 3,
      },
    },
    currentQuestion: null,
    turns: [
      {
        id: 'turn-1',
        conceptId: 'concept-1',
        conceptName: 'Duyệt đồ thị DFS',
        turnIndex: 1,
        questionText: 'DFS hoạt động thế nào?',
        questionType: 'recall',
        answerText: 'Đi sâu trước.',
        score: 0.6,
        feedback: 'Đúng ý chính.',
        verdict: 'shallow',
        askedAt: '2026-08-30T10:01:00.000Z',
        answeredAt: '2026-08-30T10:02:00.000Z',
        sourceCitation: null,
      },
      {
        id: 'turn-2',
        conceptId: 'concept-1',
        conceptName: 'Duyệt đồ thị DFS',
        turnIndex: 2,
        questionText: 'DFS dùng cấu trúc dữ liệu gì?',
        questionType: 'application',
        answerText: null,
        score: null,
        feedback: null,
        verdict: null,
        askedAt: '2026-08-30T10:03:00.000Z',
        answeredAt: null,
        sourceCitation: null,
      },
    ],
    fallback: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  window.history.pushState({}, '', '/history');
});

describe('PausedSessionActions', () => {
  it('đếm số lượt đã trả lời, không tính câu đang bỏ trống', () => {
    render(<PausedSessionActions sessionId="session-1" detail={detail()} onAbandoned={() => {}} />);

    expect(screen.getByText(/Hàng đợi còn/)).toHaveTextContent('2 trong 3 khái niệm');
    expect(screen.getByText(/Khái niệm đang dở/)).toHaveTextContent('đã trả lời 1/3 lượt');
    expect(screen.getByText(/Kết thúc sớm thì/)).toHaveTextContent('chỉ được chấm trên 1 lượt');
  });

  it('resume thành công thì chuyển về đúng phiên phỏng vấn', async () => {
    const user = userEvent.setup();
    mockedApi.resumeInterview.mockResolvedValueOnce({
      session: { ...detail().session, status: 'active' },
      currentQuestion: null,
      fallback: null,
    });
    render(<PausedSessionActions sessionId="session-1" detail={detail()} onAbandoned={() => {}} />);

    await user.click(screen.getByRole('button', { name: 'Tiếp tục phiên' }));

    await waitFor(() => expect(window.location.pathname).toBe('/interview/session-1'));
    expect(mockedApi.resumeInterview).toHaveBeenCalledWith('session-1');
  });

  it('abandon thành công báo kết quả và yêu cầu danh sách đồng bộ lại', async () => {
    const user = userEvent.setup();
    const onAbandoned = vi.fn();
    mockedApi.abandonInterview.mockResolvedValueOnce({
      session: { ...detail().session, status: 'abandoned', endedAt: '2026-08-30T10:05:00.000Z' },
      conceptCompleted: null,
    });
    render(
      <PausedSessionActions sessionId="session-1" detail={detail()} onAbandoned={onAbandoned} />
    );

    await user.click(screen.getByRole('button', { name: 'Kết thúc và chấm phần đã làm' }));

    await waitFor(() => expect(onAbandoned).toHaveBeenCalledOnce());
    expect(mockedApi.abandonInterview).toHaveBeenCalledWith('session-1');
    expect(toast.success).toHaveBeenCalledWith('Đã kết thúc phiên và chấm phần bạn đã làm.');
  });

  it('lỗi abandon dùng thông báo đã dịch và không báo danh sách thay đổi', async () => {
    const user = userEvent.setup();
    const onAbandoned = vi.fn();
    mockedApi.abandonInterview.mockRejectedValueOnce(new Error('network down'));
    render(
      <PausedSessionActions sessionId="session-1" detail={detail()} onAbandoned={onAbandoned} />
    );

    await user.click(screen.getByRole('button', { name: 'Kết thúc và chấm phần đã làm' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Lỗi phiên đã được dịch.'));
    expect(onAbandoned).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Kết thúc và chấm phần đã làm' })).toBeEnabled();
  });
});
