import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { render, screen, waitFor } from '@/utils/test-utils';
import { interviewApi } from '@/features/interview/api/interview.api';
import type {
  AbandonInterviewResponse,
  InterviewSessionState,
  StartInterviewResponse,
} from '@/features/interview/types/interview.types';
import { planApi } from '@/features/study-planner/api/plan.api';
import type { PlanSummary } from '@/features/study-planner/types/concept';
import InterviewPage from './InterviewPage';

vi.mock('@/features/interview/api/interview.api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/interview/api/interview.api')>();
  return {
    ...actual,
    interviewApi: {
      startInterview: vi.fn(),
      abandonInterview: vi.fn(),
    },
  };
});

vi.mock('@/features/study-planner/api/plan.api', () => ({
  planApi: {
    listPlans: vi.fn(),
    getPlan: vi.fn(),
  },
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const PLAN: PlanSummary = {
  id: 'plan-1',
  name: 'Mạng máy tính',
  deadline: null,
  status: 'active',
  conceptCount: 2,
  masteryDistribution: { strong: 0, learning: 0, weak: 0, untested: 2 },
  analysisStatus: 'done',
  analysisStartedAt: null,
  analysisErrorMessage: null,
  document: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  reviewQueueConceptCount: 2,
};

const SESSION: InterviewSessionState = {
  id: 'session-existing',
  planId: PLAN.id,
  status: 'active',
  fallbackMode: false,
  startedAt: '2026-09-01T08:00:00.000Z',
  endedAt: null,
  currentConcept: { id: 'c-old', name: 'Mô hình OSI' },
  progress: {
    conceptIndex: 0,
    conceptTotal: 1,
    completedConcepts: 0,
    turnIndex: 1,
    maxTurnsPerConcept: 3,
  },
};

const systemError = () => ({
  isAxiosError: true,
  response: {
    status: 500,
    data: { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
  },
});

const aiError = () => ({
  isAxiosError: true,
  response: {
    status: 502,
    data: { success: false, error: { code: 'AI_UPSTREAM_ERROR', message: 'AI unavailable' } },
  },
});

const inputError = () => ({
  isAxiosError: true,
  response: {
    status: 409,
    data: { success: false, error: { code: 'NO_MATERIAL', message: 'No material' } },
  },
});

const existingSession = (): StartInterviewResponse => ({
  created: false,
  session: SESSION,
  question: null,
  message: null,
  fallback: null,
});

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState({}, '', '/interview?planId=plan-1&conceptIds=c-1,c-2');
  vi.mocked(planApi.listPlans).mockResolvedValue([PLAN]);
  vi.mocked(planApi.getPlan).mockResolvedValue({
    graph: {
      concepts: [
        { id: 'c-1', name: 'TCP', difficulty: 2 },
        { id: 'c-2', name: 'UDP', difficulty: 2 },
      ],
    },
  } as never);
});

describe('InterviewPage — lỗi hệ thống ở lối vào deep-link (#497)', () => {
  it('keeps the deep-link selection and retries the same request after INTERNAL_ERROR', async () => {
    const user = userEvent.setup();
    vi.mocked(interviewApi.startInterview).mockRejectedValue(systemError());

    render(<InterviewPage />);

    expect(
      await screen.findByText(/Hệ thống đang gặp sự cố nên chưa mở được phiên kiểm tra/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Kế hoạch và khái niệm bạn chọn vẫn được giữ nguyên/)
    ).toBeInTheDocument();
    expect(screen.queryByText(/Hãy chọn lại kế hoạch và khái niệm/)).not.toBeInTheDocument();
    expect(interviewApi.startInterview).toHaveBeenNthCalledWith(1, {
      planId: 'plan-1',
      conceptIds: ['c-1', 'c-2'],
    });

    await user.click(screen.getByRole('button', { name: 'Thử lại' }));

    await waitFor(() => expect(interviewApi.startInterview).toHaveBeenCalledTimes(2));
    expect(interviewApi.startInterview).toHaveBeenNthCalledWith(2, {
      planId: 'plan-1',
      conceptIds: ['c-1', 'c-2'],
    });
  });

  it('keeps the existing AI-specific retry state separate from system errors', async () => {
    vi.mocked(interviewApi.startInterview).mockRejectedValue(aiError());

    render(<InterviewPage />);

    expect(
      await screen.findByText(/Dịch vụ AI tạm thời không phản hồi nên chưa mở được phiên kiểm tra/)
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeInTheDocument();
    expect(screen.queryByText(/Hệ thống đang gặp sự cố/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Hãy chọn lại kế hoạch và khái niệm/)).not.toBeInTheDocument();
  });

  it('still clears an invalid deep-link into the manual picker for an input rejection', async () => {
    vi.mocked(interviewApi.startInterview).mockRejectedValue(inputError());

    render(<InterviewPage />);

    expect(
      await screen.findByText(/Không thể tự mở phiên kiểm tra từ liên kết vừa rồi/)
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Mạng máy tính/ })).toBeInTheDocument();
    expect(screen.queryByText('Khái niệm cần kiểm tra')).not.toBeInTheDocument();
    expect(screen.queryByText(/Hệ thống đang gặp sự cố/)).not.toBeInTheDocument();
  });

  it('uses the same system-error state when opening a new session after ending an old one', async () => {
    const user = userEvent.setup();
    vi.mocked(interviewApi.startInterview)
      .mockResolvedValueOnce(existingSession())
      .mockRejectedValueOnce(systemError());
    vi.mocked(interviewApi.abandonInterview).mockResolvedValue({
      session: { ...SESSION, status: 'abandoned', endedAt: '2026-09-01T08:05:00.000Z' },
      conceptCompleted: null,
    } satisfies AbandonInterviewResponse);

    render(<InterviewPage />);

    await user.click(await screen.findByRole('button', { name: 'Kết thúc và chấm phần đã làm' }));

    expect(
      await screen.findByText(/Hệ thống đang gặp sự cố nên chưa mở được phiên kiểm tra/)
    ).toBeInTheDocument();
    expect(interviewApi.abandonInterview).toHaveBeenCalledWith('session-existing');
    expect(interviewApi.startInterview).toHaveBeenNthCalledWith(2, {
      planId: 'plan-1',
      conceptIds: ['c-1', 'c-2'],
    });
  });
});
