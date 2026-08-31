import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { render, screen, waitFor } from '@/utils/test-utils';
import { SessionDetailPanel } from './SessionDetailPanel';
import { interviewApi } from '@/features/interview/api/interview.api';
import type {
  GetInterviewResponse,
  InterviewSessionStatus,
  SessionSummaryResponse,
} from '@/features/interview/types/interview.types';
import type { InterviewSessionListItem } from '../types/history.types';

vi.mock('@/features/interview/api/interview.api', () => ({
  interviewApi: {
    getInterview: vi.fn(),
    getSummary: vi.fn(),
    resumeInterview: vi.fn(),
    abandonInterview: vi.fn(),
  },
  getInterviewErrorMessage: () => 'lỗi',
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const mockedApi = vi.mocked(interviewApi);

function listItem(status: InterviewSessionStatus, fallbackMode = false): InterviewSessionListItem {
  return {
    id: 'session-1',
    startedAt: new Date(2026, 7, 13, 21, 40).toISOString(),
    endedAt: status === 'completed' ? new Date(2026, 7, 13, 22, 6).toISOString() : null,
    status,
    fallbackMode,
    plan: { id: 'plan-1', name: 'Cấu trúc dữ liệu & Giải thuật' },
    conceptTotal: 1,
    averageMasteryScore: 0.42,
    concepts: [
      {
        conceptId: 'concept-1',
        name: 'Duyệt đồ thị DFS',
        masteryBefore: null,
        masteryAfter: 0.42,
        isFirstAssessment: true,
      },
    ],
  };
}

function transcript(status: InterviewSessionStatus): GetInterviewResponse {
  return {
    session: {
      id: 'session-1',
      planId: 'plan-1',
      status,
      fallbackMode: false,
      startedAt: new Date(2026, 7, 13, 21, 40).toISOString(),
      endedAt: null,
      currentConcept: { id: 'concept-1', name: 'Duyệt đồ thị DFS' },
      progress: {
        conceptIndex: 0,
        conceptTotal: 1,
        completedConcepts: 0,
        turnIndex: 1,
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
        questionText: 'DFS duyệt một đồ thị theo thứ tự như thế nào?',
        questionType: 'recall',
        answerText: 'Đi sâu hết một nhánh rồi quay lại.',
        score: 0.42,
        feedback: 'Đúng ý chính nhưng dừng ở mô tả.',
        verdict: 'shallow',
        askedAt: new Date(2026, 7, 13, 21, 41).toISOString(),
        answeredAt: new Date(2026, 7, 13, 21, 43).toISOString(),
        sourceCitation: null,
        mode: null,
        countsTowardMastery: true,
      },
    ],
    fallback: null,
  };
}

/** Phiên bỏ dở: `summarize_session` cố tình không chạy ⇒ `text` VÀ `message` đều `null`. */
function abandonedSummary(): SessionSummaryResponse {
  return {
    sessionId: 'session-1',
    status: 'abandoned',
    durationMinutes: 14,
    concepts: [
      {
        conceptId: 'concept-1',
        name: 'Duyệt đồ thị DFS',
        masteryScore: 0.42,
        turns: [
          { turnIndex: 1, score: 0.42, verdict: 'shallow', mode: null, countsTowardMastery: true },
        ],
      },
    ],
    summary: {
      text: null,
      strengths: [],
      weaknesses: [],
      recommendations: [],
      generatedByAi: false,
      message: null,
    },
    reviewSchedule: [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SessionDetailPanel — phiên nào thì đọc API nào', () => {
  it('phiên đã đóng đọc cả transcript lẫn /summary', async () => {
    mockedApi.getInterview.mockResolvedValue(transcript('completed'));
    mockedApi.getSummary.mockResolvedValue({
      ...abandonedSummary(),
      status: 'completed',
      summary: {
        text: 'Bạn mô tả đúng cách DFS đi sâu.',
        strengths: [],
        weaknesses: [],
        recommendations: [],
        generatedByAi: true,
        message: null,
      },
    });

    render(<SessionDetailPanel session={listItem('completed')} onSessionChanged={() => {}} />);

    await waitFor(() => expect(mockedApi.getSummary).toHaveBeenCalledWith('session-1'));
    expect(mockedApi.getInterview).toHaveBeenCalledWith('session-1');
    expect(await screen.findByText(/Bạn mô tả đúng cách DFS đi sâu/)).toBeInTheDocument();
  });

  it('phiên tạm dừng KHÔNG gọi /summary — endpoint đó ném 409 cho phiên chưa đóng', async () => {
    mockedApi.getInterview.mockResolvedValue(transcript('paused'));

    render(<SessionDetailPanel session={listItem('paused')} onSessionChanged={() => {}} />);

    await waitFor(() => expect(mockedApi.getInterview).toHaveBeenCalledWith('session-1'));
    expect(mockedApi.getSummary).not.toHaveBeenCalled();
    expect(await screen.findByRole('button', { name: /Tiếp tục phiên/ })).toBeInTheDocument();
  });

  /**
   * `GET /interviews/:id` cho phiên `active` chạy máy trạng thái và có thể gọi Gemini sinh câu
   * hỏi mới. Màn Lịch sử là read-only, nên nó không được đụng vào phiên đang chạy.
   */
  it('phiên đang chạy KHÔNG gọi API nào cả', async () => {
    render(<SessionDetailPanel session={listItem('active')} onSessionChanged={() => {}} />);

    expect(await screen.findByText(/Phiên này vẫn đang mở/)).toBeInTheDocument();
    expect(mockedApi.getInterview).not.toHaveBeenCalled();
    expect(mockedApi.getSummary).not.toHaveBeenCalled();
  });

  it('lỗi tải hiện toast và khối Thử lại; retry tải lại cả transcript lẫn summary', async () => {
    mockedApi.getInterview.mockRejectedValueOnce(new Error('network down'));
    mockedApi.getSummary.mockRejectedValueOnce(new Error('network down'));

    render(<SessionDetailPanel session={listItem('completed')} onSessionChanged={() => {}} />);

    expect(await screen.findByText('Không tải được chi tiết phiên này.')).toBeInTheDocument();
    // `waitFor`, không assert thẳng: `findByText` được MutationObserver đánh thức tại COMMIT,
    // còn `toast.error` nằm trong một `useEffect` nên chỉ chạy ở nhịp passive-effect SAU đó.
    // Assert đồng bộ ngay sau `findBy*` là đọc trạng thái trước khi effect kịp chạy — thường
    // thắng, thỉnh thoảng thua, và lúc thua thì trông y như sản phẩm hỏng (#468).
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Không tải được chi tiết phiên. Kiểm tra kết nối rồi thử lại.'
      )
    );

    mockedApi.getInterview.mockResolvedValueOnce(transcript('completed'));
    mockedApi.getSummary.mockResolvedValueOnce({
      ...abandonedSummary(),
      status: 'completed',
    });
    screen.getByRole('button', { name: 'Thử lại' }).click();

    expect(await screen.findByText('Biến động mastery_score')).toBeInTheDocument();
    expect(mockedApi.getInterview).toHaveBeenCalledTimes(2);
    expect(mockedApi.getSummary).toHaveBeenCalledTimes(2);
  });
});

describe('SessionDetailPanel — AF3 phiên bỏ dở', () => {
  it('bỏ HẲN khối nhận xét, không hiện khung trống hay câu báo lỗi', async () => {
    mockedApi.getInterview.mockResolvedValue(transcript('abandoned'));
    mockedApi.getSummary.mockResolvedValue(abandonedSummary());

    render(<SessionDetailPanel session={listItem('abandoned')} onSessionChanged={() => {}} />);

    expect(await screen.findByText('Biến động mastery_score')).toBeInTheDocument();
    expect(screen.queryByText('Nhận xét cuối phiên')).not.toBeInTheDocument();
    // `AiSummaryCard` dịch `message: null` thành câu báo lỗi của UC-14 E1 kèm icon cảnh báo.
    // Phiên bỏ dở không có gì hỏng cả, nên câu đó không được xuất hiện ở đây.
    expect(screen.queryByText(/Không thể tổng hợp nhận xét lúc này/)).not.toBeInTheDocument();
  });

  it('khái niệm lần đầu hiện giá trị tuyệt đối kèm nhãn "lần đầu", không hiện +0.42', async () => {
    mockedApi.getInterview.mockResolvedValue(transcript('abandoned'));
    mockedApi.getSummary.mockResolvedValue(abandonedSummary());

    render(<SessionDetailPanel session={listItem('abandoned')} onSessionChanged={() => {}} />);

    expect(await screen.findByText('lần đầu')).toBeInTheDocument();
    expect(screen.queryByText('+0.42')).not.toBeInTheDocument();
  });
});

/**
 * Bất biến của `useSessionDetail`: **đổi phiên là panel trống ngay**, không có nhịp nào dữ liệu
 * của phiên trước nằm dưới tiêu đề của phiên vừa chọn.
 *
 * Đây là lý do hook này tồn tại thay vì dùng `useAsyncResource` — nên nó phải có test canh.
 * Test có răng: đổi khoá của hook thành hằng số (mô phỏng đúng lối `useAsyncResource` khoá vào
 * phiên đầu tiên) thì test này phải ĐỎ.
 */
describe('SessionDetailPanel — đổi phiên không được rò dữ liệu phiên cũ', () => {
  it('xoá nội dung phiên cũ ngay khi prop session đổi, trước khi phiên mới tải xong', async () => {
    const sessionB: InterviewSessionListItem = {
      ...listItem('completed'),
      id: 'session-2',
      plan: { id: 'plan-2', name: 'Hệ điều hành' },
    };

    // Phiên B cố tình KHÔNG bao giờ resolve trong bài test này: ta đo đúng khoảnh khắc giữa
    // "đã đổi phiên" và "phiên mới tải xong" — chính là khoảnh khắc dữ liệu cũ có thể rò ra.
    const never = () => new Promise<never>(() => {});
    mockedApi.getInterview.mockImplementation((id: string) =>
      id === 'session-1' ? Promise.resolve(transcript('completed')) : never()
    );
    mockedApi.getSummary.mockImplementation((id: string) =>
      id === 'session-1'
        ? Promise.resolve({ ...abandonedSummary(), status: 'completed' as const })
        : never()
    );

    const { rerender } = render(
      <SessionDetailPanel session={listItem('completed')} onSessionChanged={() => {}} />
    );

    // Phiên A đã hiện thật sự.
    expect(await screen.findByText(/DFS duyệt một đồ thị theo thứ tự/)).toBeInTheDocument();
    expect(screen.getByText(/Cấu trúc dữ liệu & Giải thuật/)).toBeInTheDocument();

    rerender(<SessionDetailPanel session={sessionB} onSessionChanged={() => {}} />);

    // KHÔNG await: phải trống ngay ở lượt render này, không phải "trống sau khi B về".
    expect(screen.queryByText(/DFS duyệt một đồ thị theo thứ tự/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Bản ghi hỏi–đáp/)).not.toBeInTheDocument();
    // Tiêu đề đã là của phiên mới, và bên dưới là khung chờ chứ không phải nội dung phiên cũ.
    expect(screen.getByText(/Hệ điều hành/)).toBeInTheDocument();
    expect(screen.getByLabelText('Đang tải chi tiết phiên')).toBeInTheDocument();
  });
});

/**
 * Ca abandon thường gặp nhất: bỏ dở đúng lúc câu kế vừa hiện. `/summary` trả cả lượt đã hỏi mà
 * chưa trả lời (`score: null`), nên đếm `turns.length` sẽ ghi "chấm trên 2/3 lượt" trong khi
 * khối phép tính ngay bên dưới chỉ tính 1 lượt — hai con số cùng nói về một khái niệm mà đá nhau.
 */
describe('SessionDetailPanel — "chấm trên N/3 lượt" chỉ đếm lượt ĐÃ CHẤM', () => {
  it('lượt đã hỏi mà chưa trả lời không được tính vào số lượt đã chấm', async () => {
    mockedApi.getInterview.mockResolvedValue({
      ...transcript('abandoned'),
      turns: [
        transcript('abandoned').turns[0]!,
        {
          ...transcript('abandoned').turns[0]!,
          id: 'turn-2',
          turnIndex: 2,
          questionText: 'Khi quay lui, thuật toán nhớ chỗ cần quay về bằng cách nào?',
          answerText: null,
          score: null,
          feedback: null,
          verdict: null,
          answeredAt: null,
        },
      ],
    });
    mockedApi.getSummary.mockResolvedValue({
      ...abandonedSummary(),
      concepts: [
        {
          conceptId: 'concept-1',
          name: 'Duyệt đồ thị DFS',
          masteryScore: 0.42,
          turns: [
            {
              turnIndex: 1,
              score: 0.42,
              verdict: 'shallow',
              mode: null,
              countsTowardMastery: true,
            },
            // Câu đã hỏi, chưa trả lời — server vẫn trả lượt này.
            { turnIndex: 2, score: null, verdict: null, mode: null, countsTowardMastery: true },
          ],
        },
      ],
    });

    render(<SessionDetailPanel session={listItem('abandoned')} onSessionChanged={() => {}} />);

    expect(await screen.findByText(/chấm trên 1\/3 lượt/)).toBeInTheDocument();
    expect(screen.queryByText(/chấm trên 2\/3 lượt/)).not.toBeInTheDocument();
  });
});

describe('SessionDetailPanel — AF4 phiên tự chấm', () => {
  it('gắn nhãn tự chấm ở đầu panel', async () => {
    mockedApi.getInterview.mockResolvedValue(transcript('completed'));
    mockedApi.getSummary.mockResolvedValue({ ...abandonedSummary(), status: 'completed' });

    render(
      <SessionDetailPanel session={listItem('completed', true)} onSessionChanged={() => {}} />
    );

    expect(await screen.findByText(/flashcard đã lưu sẵn/)).toBeInTheDocument();
  });
});
