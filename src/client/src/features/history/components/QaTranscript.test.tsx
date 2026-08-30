import { describe, expect, it } from 'vitest';

import type {
  InterviewTurnResponse,
  SessionSummaryResponse,
} from '@/features/interview/types/interview.types';
import { render, screen } from '@/utils/test-utils';
import { QaTranscript } from './QaTranscript';

function turn(
  id: string,
  conceptId: string,
  conceptName: string,
  turnIndex: number,
  score: number | null
): InterviewTurnResponse {
  return {
    id,
    conceptId,
    conceptName,
    turnIndex,
    questionText: `Câu hỏi ${id}`,
    questionType: turnIndex === 1 ? 'recall' : 'application',
    answerText: score === null ? null : `Câu trả lời ${id}`,
    score,
    feedback: score === null ? null : `Nhận xét ${id}`,
    verdict: score === null ? null : score >= 0.7 ? 'deep' : 'shallow',
    askedAt: `2026-08-30T10:0${turnIndex}:00.000Z`,
    answeredAt: score === null ? null : `2026-08-30T10:0${turnIndex + 1}:00.000Z`,
    sourceCitation: null,
    mode: null,
    countsTowardMastery: true,
  };
}

/** Lượt gợi ý: được chấm, vẫn hiện, nhưng không vào công thức (#392 (c)). */
function hintTurn(
  id: string,
  conceptId: string,
  conceptName: string,
  turnIndex: number,
  score: number
): InterviewTurnResponse {
  return {
    ...turn(id, conceptId, conceptName, turnIndex, score),
    mode: 'hint',
    countsTowardMastery: false,
  };
}

function summary(concepts: SessionSummaryResponse['concepts']): SessionSummaryResponse {
  return {
    sessionId: 'session-1',
    status: 'completed',
    durationMinutes: 10,
    concepts,
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

describe('QaTranscript', () => {
  it('giữ thứ tự concept từ summary, lọc concept trùng/rỗng và mở concept điểm thấp nhất', () => {
    const { container } = render(
      <QaTranscript
        turns={[
          turn('a-2', 'a', 'Khái niệm A', 2, 0.8),
          turn('b-1', 'b', 'Khái niệm B', 1, 0.3),
          turn('a-1', 'a', 'Khái niệm A', 1, 0.8),
        ]}
        summary={summary([
          {
            conceptId: 'a',
            name: 'Khái niệm A',
            masteryScore: 0.8,
            turns: [],
          },
          // Queue có thể chứa cùng concept nhiều lần; UI vẫn chỉ có một khối.
          {
            conceptId: 'a',
            name: 'Khái niệm A',
            masteryScore: 0.8,
            turns: [],
          },
          {
            conceptId: 'empty',
            name: 'Chưa từng được hỏi',
            masteryScore: null,
            turns: [],
          },
          {
            conceptId: 'b',
            name: 'Khái niệm B',
            masteryScore: 0.3,
            turns: [],
          },
        ])}
      />
    );

    const details = container.querySelectorAll('details');
    expect(details).toHaveLength(2);
    expect(details[0]).toHaveTextContent('Khái niệm A');
    expect(details[1]).toHaveTextContent('Khái niệm B');
    expect(details[0]).not.toHaveAttribute('open');
    expect(details[1]).toHaveAttribute('open');
    expect(screen.queryByText('Chưa từng được hỏi')).not.toBeInTheDocument();
  });

  it('sắp lượt theo turnIndex và hiện đúng phép chuẩn hoá trọng số cho phiên kết thúc sớm', () => {
    const { container } = render(
      <QaTranscript
        turns={[
          turn('turn-2', 'a', 'Khái niệm A', 2, 0.8),
          turn('turn-3', 'a', 'Khái niệm A', 3, null),
          turn('turn-1', 'a', 'Khái niệm A', 1, 0.2),
        ]}
        summary={summary([
          {
            conceptId: 'a',
            name: 'Khái niệm A',
            masteryScore: 0.56,
            turns: [],
          },
        ])}
      />
    );

    const transcript = container.querySelector('details');
    expect(transcript).toHaveTextContent('3/3 lượt');
    expect(transcript).toHaveTextContent('0.20 × 0.4 + 0.80 × 0.6 = 0.56');
    expect(transcript).toHaveTextContent('chia lại theo tỉ lệ thành 0.4 và 0.6');

    const questions = screen.getAllByText(/^Câu hỏi turn-/);
    expect(questions.map((node) => node.textContent)).toEqual([
      'Câu hỏi turn-1',
      'Câu hỏi turn-2',
      'Câu hỏi turn-3',
    ]);
    expect(screen.queryByText('Câu trả lời turn-3')).not.toBeInTheDocument();
  });

  it('không có summary thì giữ thứ tự transcript và mở concept đang dở ở cuối', () => {
    const { container } = render(
      <QaTranscript
        turns={[turn('a-1', 'a', 'Khái niệm A', 1, 0.8), turn('b-1', 'b', 'Khái niệm B', 1, null)]}
        summary={null}
      />
    );

    const details = container.querySelectorAll('details');
    expect(details[0]).not.toHaveAttribute('open');
    expect(details[1]).toHaveAttribute('open');
    expect(details[1]).toHaveTextContent('Khái niệm B');
    expect(details[1]).toHaveTextContent('—');
  });
});

/**
 * #392 hướng (c) ở màn Lịch sử. Hai mệnh đề, và chúng hỏng theo hai kiểu khác nhau:
 *
 * 1. Lượt gợi ý **vẫn hiện đủ** — câu hỏi, câu trả lời, điểm, nhận xét. Một bản vá "cho đúng
 *    điểm" bằng cách giấu lượt đi cũng ra đúng con số, mà lại phá chính thứ màn này tồn tại vì
 *    nó: cho sinh viên kiểm chứng điểm được tính ra sao.
 * 2. Nhưng nó **không có trọng số**, và chỗ trống đó phải được NÓI ra — bỏ trống thì người đọc
 *    kết luận app tính thiếu.
 */
describe('QaTranscript — lượt gợi ý (#392)', () => {
  const concept = { conceptId: 'c1', name: 'Ngăn xếp', masteryScore: 0.4, turns: [] };

  it('🔴 vẫn hiện lượt gợi ý, nhưng thay trọng số bằng lời giải thích', () => {
    const { container } = render(
      <QaTranscript
        turns={[turn('t1', 'c1', 'Ngăn xếp', 1, 0.4), hintTurn('t2', 'c1', 'Ngăn xếp', 2, 0.9)]}
        summary={summary([concept])}
      />
    );

    // (1) còn nguyên trong bản ghi
    expect(screen.getByText('Câu hỏi t2')).toBeInTheDocument();
    expect(screen.getByText('Nhận xét t2')).toBeInTheDocument();
    // (2) và nói rõ vì sao nó không có trọng số
    expect(screen.getByText('· lượt gợi ý, không tính điểm')).toBeInTheDocument();
    // Lượt thường vẫn giữ trọng số gốc của nó.
    expect(screen.getByText('· trọng số gốc 0.2')).toBeInTheDocument();

    // (3) Và khối CÔNG THỨC chỉ có số hạng của lượt được tính. Không có vế này thì việc lọc ở
    // `MasteryCalculation` không bị gì giữ: công thức sẽ in `0.40 × 0.4 + 0.90 × 0.6 = 0.40`,
    // tức một phép tính không ra chính con số nó vừa viết bên phải dấu bằng.
    const formula = container.querySelector('.whitespace-nowrap');
    expect(formula?.textContent).toContain('0.40 × 1.0');
    expect(formula?.textContent).not.toContain('0.90');
  });

  /**
   * Trục của trọng số là VỊ TRÍ SAU KHI NÉN, không phải `turnIndex`. Lượt 2 là gợi ý ⇒ lượt 3 ăn
   * trọng số thứ HAI (0.3). Đọc theo `turnIndex` sẽ ghi 0.5 cho một lượt đang được nhân 0.6, và
   * phép tính trên màn không cộng ra con số ngay bên cạnh nó.
   */
  it('🔴 trọng số bám vị trí trong CÔNG THỨC, không bám turnIndex', () => {
    render(
      <QaTranscript
        turns={[
          turn('t1', 'c1', 'Ngăn xếp', 1, 0.4),
          hintTurn('t2', 'c1', 'Ngăn xếp', 2, 0.9),
          turn('t3', 'c1', 'Ngăn xếp', 3, 0.8),
        ]}
        summary={summary([concept])}
      />
    );

    expect(screen.getByText('· trọng số gốc 0.2')).toBeInTheDocument();
    expect(screen.getByText('· trọng số gốc 0.3')).toBeInTheDocument();
    // 0.5 là trọng số của lượt thứ BA trong công thức — ở đây công thức chỉ có hai lượt.
    expect(screen.queryByText('· trọng số gốc 0.5')).not.toBeInTheDocument();
  });
});
