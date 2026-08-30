import { describe, expect, it } from 'vitest';

import { render, screen } from '@/utils/test-utils';
import { ScoreBreakdown } from './ScoreBreakdown';
import type {
  SessionSummaryConceptResponse,
  SessionSummaryTurnResponse,
} from '../types/interview.types';

/**
 * Khối "cách tính điểm" của màn kết quả cuối phiên. Trước #392 nó chưa có tệp test nào — đo đột
 * biến: bỏ hẳn bộ lọc lượt gợi ý vẫn xanh 500/500. Nên hai ca dưới đây là lưới đầu tiên của nó.
 */
function summaryTurn(
  turnIndex: number,
  score: number,
  over: Partial<SessionSummaryTurnResponse> = {}
): SessionSummaryTurnResponse {
  return {
    turnIndex,
    score,
    verdict: score >= 0.7 ? 'deep' : 'shallow',
    mode: null,
    countsTowardMastery: true,
    ...over,
  };
}

function concept(turns: SessionSummaryTurnResponse[], masteryScore: number) {
  return {
    conceptId: 'c1',
    name: 'Ngăn xếp',
    masteryScore,
    turns,
  } satisfies SessionSummaryConceptResponse;
}

describe('ScoreBreakdown — công thức trọng số (#392)', () => {
  it('ba lượt thường: công thức dùng đủ ba trọng số gốc', () => {
    render(
      <ScoreBreakdown
        concepts={[concept([summaryTurn(1, 1.0), summaryTurn(2, 0.5), summaryTurn(3, 0.0)], 0.35)]}
        turns={[]}
        reviewSchedule={[]}
      />
    );

    expect(screen.getByText(/1\.00 ×0\.2/)).toBeInTheDocument();
    expect(screen.getByText(/0\.50 ×0\.3/)).toBeInTheDocument();
    expect(screen.getByText(/0\.00 ×0\.5/)).toBeInTheDocument();
  });

  /**
   * 🔴 Lượt gợi ý bị loại khỏi công thức, và số lượt đã hỏi vẫn được nói ra kèm lý do — nếu
   * không, người đọc thấy "3 lượt" mà đếm được 2 số hạng và kết luận app tính thiếu.
   *
   * Đây cũng là chỗ dễ hỏng nhất của hướng (c) ở client: trọng số phải bám VỊ TRÍ SAU KHI NÉN.
   * Lượt 3 ăn trọng số thứ HAI (0.3 gốc, 0.6 sau chuẩn hoá), không phải 0.5.
   */
  it('🔴 loại lượt gợi ý khỏi công thức và nói ra là đã loại', () => {
    render(
      <ScoreBreakdown
        concepts={[
          concept(
            [
              summaryTurn(1, 0.4),
              summaryTurn(2, 0.9, { mode: 'hint', countsTowardMastery: false }),
              summaryTurn(3, 0.8),
            ],
            0.64
          ),
        ]}
        turns={[]}
        reviewSchedule={[]}
      />
    );

    // Số lượt ĐÃ HỎI vẫn là 3, kèm câu nói vì sao công thức chỉ có hai số hạng.
    expect(screen.getByText(/3 lượt · 1 lượt gợi ý không tính/)).toBeInTheDocument();
    // Hai số hạng, chuẩn hoá lại về [0.4, 0.6] — KHÔNG phải [0.2, 0.5] theo turnIndex.
    expect(screen.getByText(/0\.40 ×0\.4/)).toBeInTheDocument();
    expect(screen.getByText(/0\.80 ×0\.6/)).toBeInTheDocument();
    // Điểm 0.90 của lượt gợi ý không được xuất hiện trong công thức.
    expect(screen.queryByText(/0\.90 ×/)).not.toBeInTheDocument();
    // Và ba lượt đã hỏi thì KHÔNG phải "kết thúc sớm" — nó chạy hết thang.
    expect(screen.queryByText(/kết thúc sớm/)).not.toBeInTheDocument();
  });
});
