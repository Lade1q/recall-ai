import { beforeEach, describe, expect, it, vi } from 'vitest';

import { render, screen } from '@/utils/test-utils';
import InterviewSessionPage from './InterviewSessionPage';
import { useInterviewSession } from '@/features/interview/hooks/useInterviewSession';
import type {
  InterviewSessionState,
  InterviewTurnResponse,
} from '@/features/interview/types/interview.types';

/**
 * Tệp test ĐẦU TIÊN của `pages/verify/`, và nó ra đời vì một lý do đo được: ba đột biến ở call
 * site của dải lượt — `weightLabelFor(undefined)` (không hàng nào hiện trọng số),
 * `weightLabelFor(turns[0])` (mọi hàng hiện trọng số của lượt 1), và bỏ hẳn lời gọi — đều **hợp
 * kiểu** và đều **sống qua cả suite**, vì thư mục này chưa có tệp test nào.
 *
 * Kiểu đã làm hết phần nó làm được: nó chặn được "trao nhầm ĐẠI LƯỢNG" (số thay vì lượt). Nó
 * không chặn được "trao nhầm LƯỢT". Phần đó chỉ một test render đóng được — và đây đúng là màn
 * vừa ship một con số sai lên bề mặt sinh viên đang làm bài.
 */
vi.mock('@/features/interview/hooks/useInterviewSession', () => ({
  useInterviewSession: vi.fn(),
}));
vi.mock('@/features/interview/api/interview.api', () => ({
  interviewApi: { getSummary: vi.fn(), abandon: vi.fn() },
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));

const CONCEPT = { id: 'c1', name: 'Ngăn xếp' };

function makeTurn(
  id: string,
  turnIndex: number,
  countsTowardMastery: boolean
): InterviewTurnResponse {
  return {
    id,
    conceptId: CONCEPT.id,
    conceptName: CONCEPT.name,
    turnIndex,
    questionText: `Câu hỏi ${turnIndex}`,
    questionType: 'recall',
    answerText: 'trả lời',
    score: 0.5,
    feedback: 'nhận xét',
    verdict: 'shallow',
    askedAt: `2026-08-30T10:0${turnIndex}:00.000Z`,
    answeredAt: `2026-08-30T10:0${turnIndex + 1}:00.000Z`,
    mode: countsTowardMastery ? 'initial' : 'hint',
    countsTowardMastery,
    sourceCitation: null,
    source: 'ai',
    // Lượt gợi ý không khiếu nại được — khớp `isTurnAppealable` phía server.
    canAppeal: countsTowardMastery,
    gradingFeedback: null,
  };
}

/** Lượt đã được HỎI nhưng chưa chấm — có `mode`, chưa có `verdict`. */
function makeUngraded(
  id: string,
  turnIndex: number,
  countsTowardMastery: boolean
): InterviewTurnResponse {
  return {
    ...makeTurn(id, turnIndex, countsTowardMastery),
    answerText: null,
    score: null,
    feedback: null,
    verdict: null,
    answeredAt: null,
  };
}

function session(turnIndex: number | null): InterviewSessionState {
  return {
    id: 'session-1',
    planId: 'plan-1',
    status: 'active',
    fallbackMode: false,
    startedAt: '2026-08-30T10:00:00.000Z',
    endedAt: null,
    queue: [
      {
        conceptId: CONCEPT.id,
        name: CONCEPT.name,
        hop: 0,
        viaConceptId: null,
        viaConceptName: null,
      },
    ],
    currentConcept: CONCEPT,
    progress: {
      conceptIndex: 0,
      conceptTotal: 1,
      completedConcepts: 0,
      turnIndex,
      maxTurnsPerConcept: 3,
    },
  };
}

function mountWith(
  turns: InterviewTurnResponse[],
  turnIndex: number | null,
  sessionOverride?: Partial<InterviewSessionState>
) {
  vi.mocked(useInterviewSession).mockReturnValue({
    session: { ...session(turnIndex), ...sessionOverride },
    currentQuestion: null,
    turns,
    fallback: null,
    isLoading: false,
    isSubmitting: false,
    error: null,
    submit: vi.fn(),
    submitSelfGrade: vi.fn(),
    pause: vi.fn(),
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useInterviewSession>);

  render(<InterviewSessionPage />, {
    authUser: { id: 'u1', email: 'a@b.c', name: null, createdAt: '2026-01-01T00:00:00Z' },
  });
}

/** Nhãn trọng số của từng hàng trên dải, theo thứ tự hiển thị. `null` = hàng không có nhãn. */
function railWeights(): (string | null)[] {
  const heading = screen.getByText(/^Lượt — /);
  const rail = heading.parentElement as HTMLElement;
  return [...rail.querySelectorAll('[class*="divide-y"] > div')].map((row) => {
    const text = row.textContent ?? '';
    const match = text.match(/×[\d.]+/);
    return match ? match[0] : null;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('InterviewSessionPage — dải lượt và trọng số (#392 (c))', () => {
  /**
   * 🔴 Ca đã ship hỏng: lượt 3 hiện `×0.5` trong khi màn Lịch sử hiện `0.3` cho cùng lượt đó.
   * Lượt gợi ý không có nhãn, và lượt SAU nó tụt xuống slot thứ hai.
   */
  it('🔴 t1 tính · t2 gợi ý · t3 tính ⇒ ×0.2 / không nhãn / ×0.3', () => {
    mountWith([makeTurn('t1', 1, true), makeTurn('t2', 2, false), makeTurn('t3', 3, true)], 3);

    expect(railWeights()).toEqual(['×0.2', null, '×0.3']);
  });

  /** Đối chứng: không có lượt gợi ý thì trục nén trùng trục thô, và dải hiện đủ ba trọng số. */
  it('không có lượt gợi ý ⇒ ×0.2 / ×0.3 / ×0.5', () => {
    mountWith([makeTurn('t1', 1, true), makeTurn('t2', 2, true), makeTurn('t3', 3, true)], 3);

    expect(railWeights()).toEqual(['×0.2', '×0.3', '×0.5']);
  });

  /**
   * Dải lượt câm cho lượt chưa chấm vì **chính nó lọc `verdict !== null`** trước khi tra — một
   * lựa chọn hiển thị, KHÔNG phải vì slot chưa biết được (`mode` ghi lúc tạo câu hỏi). Ca dưới
   * đây dùng lượt VẮNG MẶT khỏi transcript; ca "có mặt nhưng chưa chấm" nằm ở describe kế tiếp,
   * nơi header nói còn dải lượt im.
   */
  it('lượt vắng mặt trong transcript ⇒ không nhãn', () => {
    mountWith([makeTurn('t1', 1, true)], 2);

    expect(railWeights()).toEqual(['×0.2', null, null]);
  });
});

/** Chuỗi của header `Lượt N/3 · trọng số X`, lấy nguyên văn để hỏi được cả có lẫn không. */
function headerText(): string {
  const el = [...document.querySelectorAll('span')].find((node) =>
    /Lượt \d+\/\d+/.test(node.textContent ?? '')
  );
  return el?.textContent ?? '';
}

/**
 * Header đọc transcript KHÔNG lọc `verdict`, nên nó nói được trọng số của một lượt chưa chấm —
 * và trước bản vá blocker nó nói `0.5` cho đúng lượt mà công thức nhân `0.6`.
 *
 * Đo được: đột biến `)(currentTurnRow)` → `)(turns[0])` **sống 515/515**, vì tệp test này chỉ
 * bám tiêu đề `Lượt — <khái niệm>` của dải lượt.
 */
describe('InterviewSessionPage — header trọng số (#392 (c))', () => {
  const withHint = () => [
    makeTurn('t1', 1, true),
    makeTurn('t2', 2, false),
    makeUngraded('t3', 3, true),
  ];

  it('🔴 t3 chưa chấm sau một lượt gợi ý ⇒ header nói 0.3', () => {
    mountWith(withHint(), 3);

    expect(headerText()).toContain('trọng số 0.3');
  });

  /**
   * Hỏi RIÊNG sự vắng mặt. `0.5` là con số bản trước blocker in ra ở đúng chỗ này; "có 0.3"
   * không tự suy ra "không có 0.5" — hai mệnh đề, hai assertion.
   */
  it('🔴 và KHÔNG in 0.5 — con số của trục thô', () => {
    mountWith(withHint(), 3);

    expect(headerText()).not.toContain('0.5');
  });
});

describe('InterviewSessionPage — vai tiêu đề của trạng thái đang kiểm (#387)', () => {
  /**
   * Quyết định 02/09: tiêu đề thật của màn là KHÁI NIỆM đang kiểm, không phải tên màn
   * trên thanh trên. Trước đó `h1` nằm ở nhãn thanh trên (16px) trong khi `h2` ngay dưới
   * là 21px — thứ bậc chạy ngược.
   *
   * Test này ghim VAI (thẻ nào mang `h1`), KHÔNG ghim cỡ: cỡ do `heading-scale.test.ts`
   * canh. Đừng đọc nó thành "đã kiểm h1 là phần tử chữ lớn nhất trang".
   *
   * Ghim CHỮ trong thẻ chứ không ghim số lượng: đếm suông vẫn xanh nếu ai đó đổi nhầm
   * sang thẻ khác mà tổng vẫn còn đúng một `h1`.
   */
  it('🔴 đúng MỘT h1, và nó mang tên khái niệm', () => {
    mountWith([makeTurn('t1', 1, true)], 1);

    const h1s = screen.getAllByRole('heading', { level: 1 });
    expect(h1s.map((el) => el.textContent)).toEqual([CONCEPT.name]);
  });

  /**
   * Vắng mặt phải hỏi riêng: nhãn thanh trên vẫn PHẢI hiện ra (không phải bị xoá), chỉ
   * thôi không còn là heading. Hai vế này sai theo hai hướng khác nhau nên tách hai assert.
   */
  it('🔴 nhãn thanh trên còn hiện, nhưng KHÔNG còn là heading', () => {
    mountWith([makeTurn('t1', 1, true)], 1);

    expect(screen.getByText('Kiểm tra vấn đáp')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Kiểm tra vấn đáp' })).toBeNull();
  });
});

describe('InterviewSessionPage — hàng đợi khái niệm bám theo chỉ số của hàng đợi ĐÃ LƯU', () => {
  /**
   * `progress.conceptIndex` là chỉ số vào hàng đợi **đã lưu**, còn rail vẽ theo `session.queue`.
   * Chừng nào server còn trả đúng một dòng cho mỗi entry thì hai thứ đó không thể lệch — nên
   * hợp đồng phải được ghim ở đây, không phải ghim ở "server nhớ đừng lọc".
   *
   * Ca kích hoạt: `PUT /graph` xoá CỨNG một hàng Concept giữa phiên. Server trả `name: null`
   * cho entry đó thay vì bỏ nó đi; bỏ đi thì rail đánh lại chỉ số và tô sáng lệch một dòng.
   */
  /** Các dòng của rail, lấy qua tiêu đề mục thay vì qua chuỗi class — class Tailwind có ngoặc
   *  vuông nên không dùng được trong selector thuộc tính, và một selector không khớp sẽ trả
   *  mảng ngắn ĐÚNG BẰNG cái bug đang tìm. */
  const rows = () => {
    const heading = screen.getByText('Hàng đợi khái niệm');
    const list = heading.nextElementSibling as HTMLElement;
    return [...list.children];
  };

  function mountQueue(conceptIndex: number) {
    mountWith([makeTurn('t1', 1, true)], 1, {
      queue: [
        { conceptId: 'gone', name: null, hop: 0, viaConceptId: null, viaConceptName: null },
        {
          conceptId: CONCEPT.id,
          name: CONCEPT.name,
          hop: 0,
          viaConceptId: null,
          viaConceptName: null,
        },
        {
          conceptId: 'c3',
          name: 'Hàng đợi',
          hop: 1,
          viaConceptId: CONCEPT.id,
          viaConceptName: CONCEPT.name,
        },
      ],
      progress: {
        conceptIndex,
        conceptTotal: 3,
        completedConcepts: conceptIndex,
        turnIndex: 1,
        maxTurnsPerConcept: 3,
      },
    });
  }

  it('🔴 tô sáng đúng dòng mà `conceptIndex` trỏ tới, kể cả khi dòng TRƯỚC nó mất tên', () => {
    mountQueue(1);

    const current = rows().filter((row) => row.getAttribute('aria-current') === 'step');
    expect(current).toHaveLength(1);
    // Đọc riêng DÒNG TÊN chứ không đọc `textContent` cả hàng: hàng của `c3` mang phụ đề
    // "nền của Ngăn xếp", nên `toContain(CONCEPT.name)` trên cả hàng sẽ XANH kể cả khi tô sáng
    // nhảy sang đúng hàng đó — đo được: assert cũ sống sót qua đột biến "lọc bỏ entry mất tên".
    const nameLine = current[0]?.querySelectorAll('span')[1]?.textContent;
    expect(nameLine).toBe(CONCEPT.name);
  });

  it('🔴 entry mất tên VẪN chiếm một dòng, và dòng đó nói ra là nó sẽ bị bỏ qua', () => {
    mountQueue(1);

    // Ghim SỐ DÒNG: đây chính là thứ mà việc lọc ở server làm hụt đi, và cũng là thứ khiến
    // "Khái niệm 2/3" đứng trên một rail 2 dòng.
    expect(rows()).toHaveLength(3);
    expect(screen.getByText(/Khái niệm đã bị xoá khỏi kế hoạch/)).toBeInTheDocument();
  });

  it('🔴 dòng do truy ngược kéo vào nói rõ nó là nền của khái niệm nào', () => {
    mountQueue(1);

    expect(screen.getByText(`nền của ${CONCEPT.name}`)).toBeInTheDocument();
  });
});
