import { describe, expect, it } from 'vitest';

import { render, screen } from '@/utils/test-utils';

import { AiSummaryCard } from './AiSummaryCard';
import type { SessionSummaryReport } from '../types/interview.types';

function makeSummary(overrides: Partial<SessionSummaryReport> = {}): SessionSummaryReport {
  return {
    text: 'Bạn đã nêu đúng ý chính.',
    strengths: [],
    weaknesses: [],
    recommendations: [],
    generatedByAi: true,
    message: null,
    ...overrides,
  };
}

describe('AiSummaryCard', () => {
  it('omits the whole block when an abandoned session intentionally has no AI summary', () => {
    const { container } = render(
      <AiSummaryCard
        summary={makeSummary({
          text: null,
          generatedByAi: false,
          message: null,
        })}
      />
    );

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('heading', { name: 'Nhận xét cuối phiên' })).not.toBeInTheDocument();
    expect(screen.queryByText('Không thể tổng hợp nhận xét lúc này.')).not.toBeInTheDocument();
  });

  it('keeps the server message when AI summary generation actually fails', () => {
    render(
      <AiSummaryCard
        summary={makeSummary({
          text: null,
          generatedByAi: false,
          message: 'Dịch vụ AI tạm thời không phản hồi.',
        })}
      />
    );

    expect(screen.getByRole('heading', { name: 'Nhận xét cuối phiên' })).toBeInTheDocument();
    expect(screen.getByText('Dịch vụ AI tạm thời không phản hồi.')).toBeInTheDocument();
    expect(screen.queryByText('Không thể tổng hợp nhận xét lúc này.')).not.toBeInTheDocument();
  });

  it('keeps a generated AI summary unchanged', () => {
    render(<AiSummaryCard summary={makeSummary()} />);

    expect(screen.getByText('Bạn đã nêu đúng ý chính.')).toBeInTheDocument();
    expect(screen.getByText(/Nhận xét do AI viết/)).toBeInTheDocument();
  });
});
