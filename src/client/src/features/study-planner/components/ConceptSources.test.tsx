import { render, screen } from '@/utils/test-utils';
import { describe, it, expect } from 'vitest';
import { HighlightedExcerpt } from './ConceptSources';

/**
 * Logic tô sáng trong trích đoạn (Issue #210) là chỗ ràng buộc C5 ("AI không bịa") và đường
 * truy ngược AE-07 trở nên nhìn thấy được — nên nó cần test riêng, không dựa vào test của
 * ConceptGraph. Hai tầng nhấn phải phân biệt đúng: tiên quyết = nền (chính), khái niệm đang
 * xem = gạch chân chấm (phụ).
 */
describe('HighlightedExcerpt (Issue #210 — tô sáng nguồn trích)', () => {
  const PRIMARY = 'bg-remediate/16'; // tầng chính: tên tiên quyết
  const SECONDARY = 'decoration-dotted'; // tầng phụ: tên khái niệm đang xem

  it('Tên tiên quyết trong đoạn → tô ở tầng chính (có nền)', () => {
    render(
      <HighlightedExcerpt
        text="Ngăn xếp dùng để lưu lời gọi hàm"
        conceptName="Đệ quy"
        prerequisiteNames={['Ngăn xếp']}
      />
    );

    const mark = screen.getByText('Ngăn xếp');
    expect(mark.tagName).toBe('MARK');
    expect(mark).toHaveClass(PRIMARY);
    expect(mark).not.toHaveClass(SECONDARY);
  });

  it('Tên khái niệm đang xem trong đoạn → tô ở tầng phụ (gạch chân, không nền)', () => {
    render(<HighlightedExcerpt text="Đệ quy là kỹ thuật hàm tự gọi" conceptName="Đệ quy" />);

    const mark = screen.getByText('Đệ quy');
    expect(mark.tagName).toBe('MARK');
    expect(mark).toHaveClass(SECONDARY, 'underline');
    expect(mark).not.toHaveClass(PRIMARY);
  });

  it('Cả hai loại trong cùng đoạn → phân tầng đúng từng tên', () => {
    render(
      <HighlightedExcerpt
        text="Đệ quy cần Ngăn xếp để hoạt động"
        conceptName="Đệ quy"
        prerequisiteNames={['Ngăn xếp']}
      />
    );

    expect(screen.getByText('Đệ quy')).toHaveClass(SECONDARY);
    expect(screen.getByText('Ngăn xếp')).toHaveClass(PRIMARY);
  });

  it('Tên lồng nhau → ưu tiên tên dài hơn, không tô lồng', () => {
    render(
      <HighlightedExcerpt
        text="The Functional Requirements doc"
        conceptName="Functional Requirements"
        prerequisiteNames={['Requirements']}
      />
    );

    // Khớp trọn "Functional Requirements" (tên đang xem, tầng phụ)...
    expect(screen.getByText('Functional Requirements')).toHaveClass(SECONDARY);
    // ...và KHÔNG tách riêng "Requirements" thành một mark lồng bên trong.
    expect(screen.queryByText('Requirements', { exact: true })).toBeNull();
  });

  it('Khớp không phân biệt hoa thường', () => {
    render(<HighlightedExcerpt text="an array of items" conceptName="Array" />);

    const mark = screen.getByText('array');
    expect(mark.tagName).toBe('MARK');
  });

  it('Tên chứa ký tự đặc biệt của RegExp → escape đúng, khớp literal', () => {
    render(<HighlightedExcerpt text="Dùng Mảng (1 chiều) để lưu" conceptName="Mảng (1 chiều)" />);

    // Nếu không escape, "(1 chiều)" sẽ là nhóm bắt / dấu ngoặc lệch → throw hoặc khớp sai.
    expect(screen.getByText('Mảng (1 chiều)').tagName).toBe('MARK');
  });

  it('Không có tên nào khớp → trả nguyên văn, không có <mark>', () => {
    const { container } = render(
      <HighlightedExcerpt
        text="Nội dung không liên quan"
        conceptName="Đệ quy"
        prerequisiteNames={['Ngăn xếp']}
      />
    );

    expect(container.querySelectorAll('mark')).toHaveLength(0);
    expect(container.textContent).toBe('Nội dung không liên quan');
  });
});
