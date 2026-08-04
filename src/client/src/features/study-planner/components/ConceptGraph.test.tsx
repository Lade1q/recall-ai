import { render, screen } from '@/utils/test-utils';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import { ConceptGraph } from './ConceptGraph';
import { Concept, ConceptEdge } from '../types/concept';

const mockEdges: ConceptEdge[] = [];

describe('ConceptGraph Regression Tests (Bug #205)', () => {
  const renderGraph = (concepts: Concept[]) => {
    return render(
      <ConceptGraph
        planId="plan-1"
        initialConcepts={concepts}
        initialEdges={mockEdges}
        mode="view"
      />
    );
  };

  describe('Scenario 1: Tất cả concept chưa có điểm (mastery_score = null)', () => {
    const untestedConcepts: Concept[] = [
      { id: '1', name: 'React Context', mastery_score: null },
      { id: '2', name: 'React Hooks', mastery_score: null },
    ];

    it('Test 1: Khi gõ từ khoá khớp, node đó nổi bật, node khác bị mờ, text cập nhật', async () => {
      renderGraph(untestedConcepts);
      const user = userEvent.setup();

      const searchInput = screen.getByPlaceholderText('Tìm khái niệm theo tên...');
      await user.type(searchInput, 'Context');

      // The nodes are rendered with label text
      const nodeContext = screen.getByText('React Context').closest('.react-flow__node');
      const nodeHooks = screen.getByText('React Hooks').closest('.react-flow__node');

      // The node container has 'is-dimmed' class if dimmed
      expect(nodeContext).not.toHaveClass('is-dimmed');
      expect(nodeHooks).toHaveClass('is-dimmed');

      // Check text counter
      expect(screen.getByText('1 / 2 khái niệm')).toBeInTheDocument();
    });

    it('Test 2: Khi gõ từ khoá không khớp, hiển thị empty state', async () => {
      renderGraph(untestedConcepts);
      const user = userEvent.setup();

      const searchInput = screen.getByPlaceholderText('Tìm khái niệm theo tên...');
      await user.type(searchInput, 'Redux');

      expect(screen.getByText('Không có khái niệm nào khớp')).toBeInTheDocument();
      expect(
        screen.getByText(/Không có khái niệm nào khớp với bộ lọc hiện tại/i)
      ).toBeInTheDocument();
    });

    it('Test 3: Dropdown chọn 4 mức mastery ở trạng thái disabled', () => {
      renderGraph(untestedConcepts);

      const filterAll = screen.getByText('Tất cả');
      const filterStrong = screen.getByText('Vững');
      const filterLearning = screen.getByText('Đang học');
      const filterWeak = screen.getByText('Yếu');
      const filterUntested = screen.getByText('Chưa kiểm tra');

      // Because all concepts are untested, the filters based on mastery band should be disabled
      expect(filterAll).toBeDisabled();
      expect(filterStrong).toBeDisabled();
      expect(filterLearning).toBeDisabled();
      expect(filterWeak).toBeDisabled();
      expect(filterUntested).toBeDisabled();
    });
  });

  describe('Scenario 2: Dữ liệu có điểm mastery', () => {
    const testedConcepts: Concept[] = [
      { id: '1', name: 'React Context', mastery_score: 0.9 }, // Strong
      { id: '2', name: 'React Hooks', mastery_score: 0.4 }, // Weak
    ];

    it('Test 4: Khi chọn filter theo một cấp độ mastery, các node tương ứng sẽ được nổi bật', async () => {
      renderGraph(testedConcepts);
      const user = userEvent.setup();

      // Ensure buttons are not disabled since we have data
      const filterWeak = screen.getByText('Yếu');
      expect(filterWeak).not.toBeDisabled();

      await user.click(filterWeak);

      const nodeContext = screen.getByText('React Context').closest('.react-flow__node');
      const nodeHooks = screen.getByText('React Hooks').closest('.react-flow__node');

      expect(nodeHooks).not.toHaveClass('is-dimmed');
      expect(nodeContext).toHaveClass('is-dimmed');

      // Also check if text count is correctly showing 1 / 2
      expect(screen.getByText('Yếu · 1 / 2 khái niệm')).toBeInTheDocument();
    });
  });
});
