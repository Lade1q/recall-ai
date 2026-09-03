import { describe, expect, it } from 'vitest';

import { render, screen } from '@/utils/test-utils';
import { TurnHistory } from './TurnHistory';
import type { InterviewQueueItemResponse, InterviewTurnResponse } from '../types/interview.types';

/**
 * Dòng minh bạch điều phối (`SystemNote`) suy từ transcript. Truy ngược trong phiên (03/09) tạo
 * ra một trạng thái mà transcript MỘT MÌNH đọc sai: lượt kế mang `conceptId` khác, y hệt ca
 * "khái niệm đã chốt điểm, sang khái niệm kế" — nhưng ở đây khái niệm CHƯA chốt điểm gì cả.
 *
 * Đây là lưới cho đúng chỗ đó. Không có nó, câu "Đã chốt điểm khái niệm này" hiện ra trên đúng
 * màn mà ràng buộc C4 đang được trưng cho người chấm xem.
 */

const C = 'concept-dfs';
const P = 'concept-adjlist';

function turn(over: Partial<InterviewTurnResponse> & { id: string }): InterviewTurnResponse {
  return {
    conceptId: C,
    conceptName: 'Duyệt đồ thị DFS',
    turnIndex: 1,
    questionText: 'DFS đi theo thứ tự nào?',
    questionType: 'recall',
    answerText: 'Không nhớ',
    score: 0.1,
    feedback: 'Chưa đúng.',
    verdict: 'wrong',
    askedAt: '2026-09-03T10:00:00.000Z',
    answeredAt: '2026-09-03T10:01:00.000Z',
    mode: 'initial',
    countsTowardMastery: true,
    sourceCitation: null,
    source: 'ai',
    canAppeal: true,
    gradingFeedback: null,
    ...over,
  };
}

const QUEUE_WITH_HOP: InterviewQueueItemResponse[] = [
  {
    conceptId: P,
    name: 'Danh sách kề',
    hop: 1,
    viaConceptId: C,
    viaConceptName: 'Duyệt đồ thị DFS',
  },
  { conceptId: C, name: 'Duyệt đồ thị DFS', hop: 0, viaConceptId: null, viaConceptName: null },
];

const QUEUE_PLAIN: InterviewQueueItemResponse[] = [
  { conceptId: C, name: 'Duyệt đồ thị DFS', hop: 0, viaConceptId: null, viaConceptName: null },
  { conceptId: P, name: 'Danh sách kề', hop: 0, viaConceptId: null, viaConceptName: null },
];

const HOPPED_TO = turn({
  id: 't2',
  conceptId: P,
  conceptName: 'Danh sách kề',
  verdict: null,
  score: null,
  feedback: null,
  answerText: null,
});

describe('SystemNote khi phiên truy ngược sang khái niệm nền', () => {
  it('KHÔNG nói "đã chốt điểm" — khái niệm vừa sai chưa được chấm', () => {
    render(
      <TurnHistory
        turns={[turn({ id: 't1' }), HOPPED_TO]}
        currentTurnId="t2"
        maxTurnsPerConcept={3}
        fallbackMode={false}
        queue={QUEUE_WITH_HOP}
      />
    );

    expect(screen.queryByText(/Đã chốt điểm khái niệm này/)).not.toBeInTheDocument();
    expect(screen.getByText(/chưa chốt điểm/)).toBeInTheDocument();
  });

  it('gọi tên cả khái niệm nền lẫn khái niệm nó là nền của', () => {
    render(
      <TurnHistory
        turns={[turn({ id: 't1' }), HOPPED_TO]}
        currentTurnId="t2"
        maxTurnsPerConcept={3}
        fallbackMode={false}
        queue={QUEUE_WITH_HOP}
      />
    );

    const note = screen.getByText(/truy ngược đồ thị khái niệm/i).closest('div');
    expect(note).toHaveTextContent('Danh sách kề');
    expect(note).toHaveTextContent('là nền của');
    expect(note).toHaveTextContent('Duyệt đồ thị DFS');
  });

  it('vẫn nói "đã chốt điểm" khi chuyển khái niệm BÌNH THƯỜNG — cùng transcript, khác hàng đợi', () => {
    // Đối chứng cô lập đúng MỘT biến: transcript y hệt ca trên, chỉ `queue` đổi. Nếu ca này
    // cũng ra câu truy ngược thì nhánh mới đang bắt bừa, không phải bắt đúng.
    render(
      <TurnHistory
        turns={[turn({ id: 't1', verdict: 'deep', score: 0.9 }), HOPPED_TO]}
        currentTurnId="t2"
        maxTurnsPerConcept={3}
        fallbackMode={false}
        queue={QUEUE_PLAIN}
      />
    );

    expect(screen.getByText(/Đã chốt điểm khái niệm này/)).toBeInTheDocument();
    expect(screen.queryByText(/truy ngược đồ thị khái niệm/i)).not.toBeInTheDocument();
  });

  it('không nhận nhầm một khái niệm nền được kéo vào từ khái niệm KHÁC', () => {
    render(
      <TurnHistory
        turns={[turn({ id: 't1' }), HOPPED_TO]}
        currentTurnId="t2"
        maxTurnsPerConcept={3}
        fallbackMode={false}
        queue={[
          {
            conceptId: P,
            name: 'Danh sách kề',
            hop: 1,
            viaConceptId: 'concept-khac',
            viaConceptName: 'Khái niệm khác',
          },
          {
            conceptId: C,
            name: 'Duyệt đồ thị DFS',
            hop: 0,
            viaConceptId: null,
            viaConceptName: null,
          },
        ]}
      />
    );

    expect(screen.queryByText(/truy ngược đồ thị khái niệm/i)).not.toBeInTheDocument();
  });
});

describe('SystemNote khi chuỗi truy ngược QUAY LẠI khái niệm đang dở', () => {
  /**
   * Chiều ngược của cú hop, và là chỗ lời hứa "rồi quay lại" được xác nhận. Không có nhánh này
   * thì dòng hệ thống ghi "chuyển sang khái niệm tiếp theo" — không sai, vì nền vừa chốt điểm
   * thật — nhưng tiêu đề khái niệm cũ hiện lại kèm "Lượt 2" mà không có Lượt 1 kề bên, và sinh
   * viên không có câu nào nối hai chỗ đó với nhau.
   */
  const BASE_LAST = turn({
    id: 't2',
    conceptId: P,
    conceptName: 'Danh sách kề',
    turnIndex: 3,
    verdict: 'deep',
    score: 0.9,
  });
  const BACK_ON_C = turn({
    id: 't3',
    conceptId: C,
    conceptName: 'Duyệt đồ thị DFS',
    turnIndex: 2,
    verdict: null,
    score: null,
    feedback: null,
    answerText: null,
  });

  it('🔴 nói rõ là QUAY LẠI khái niệm cũ, kèm số lượt nó tiếp tục từ đó', () => {
    render(
      <TurnHistory
        turns={[turn({ id: 't1' }), BASE_LAST, BACK_ON_C]}
        currentTurnId="t3"
        maxTurnsPerConcept={3}
        fallbackMode={false}
        queue={QUEUE_WITH_HOP}
      />
    );

    // Khớp theo cụm RIÊNG của câu quay lại, không theo chữ "quay lại": chính dòng hop ở trên
    // ("…rồi quay lại") cũng chứa nó, nên một regex rộng bắt được cả hai và phép đo mất khả
    // năng phân biệt — đo được: cả hai test dưới đây cùng đỏ vì cái đó chứ không vì mã.
    const note = screen.getByText(/Đã chốt điểm khái niệm nền/).closest('div');
    expect(note).toHaveTextContent('quay lại');
    expect(note).toHaveTextContent('Duyệt đồ thị DFS');
    // Số lượt là phần trả lời cho "vì sao tiêu đề cũ hiện lại mà bắt đầu từ Lượt 2".
    expect(note).toHaveTextContent('lượt 2/3');
  });

  it('🔴 KHÔNG dùng câu quay lại cho một khái niệm nền chuyển sang nền KHÁC', () => {
    // Đối chứng cô lập một biến: cùng hình dạng transcript, chỉ khác chỗ lượt kế thuộc về khái
    // niệm nào. Nền → nền anh em là chuyển khái niệm bình thường, chưa phải quay lại.
    const SIBLING = turn({
      id: 't3',
      conceptId: 'concept-nen-2',
      conceptName: 'Ngăn xếp',
      turnIndex: 1,
      verdict: null,
      score: null,
      feedback: null,
      answerText: null,
    });

    render(
      <TurnHistory
        turns={[turn({ id: 't1' }), BASE_LAST, SIBLING]}
        currentTurnId="t3"
        maxTurnsPerConcept={3}
        fallbackMode={false}
        queue={[
          ...QUEUE_WITH_HOP,
          {
            conceptId: 'concept-nen-2',
            name: 'Ngăn xếp',
            hop: 1,
            viaConceptId: C,
            viaConceptName: 'Duyệt đồ thị DFS',
          },
        ]}
      />
    );

    expect(screen.queryByText(/Đã chốt điểm khái niệm nền/)).not.toBeInTheDocument();
    // Vắng mặt phải hỏi riêng: dòng hop cũ VẪN phải còn (nó thuộc lượt t1), nếu không thì test
    // trên có thể xanh chỉ vì cả hai dòng đều biến mất.
    expect(screen.getByText(/truy ngược đồ thị khái niệm/i)).toBeInTheDocument();
  });
});
