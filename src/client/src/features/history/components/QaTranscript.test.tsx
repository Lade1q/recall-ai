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
