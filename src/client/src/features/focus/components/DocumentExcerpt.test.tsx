import { render, screen } from '@/utils/test-utils';
import { describe, it, expect } from 'vitest';
import { DocumentExcerpt } from './DocumentExcerpt';
import type { ConceptSourceExcerpt } from '@/features/study-planner/types/concept';

function source(over: Partial<ConceptSourceExcerpt> = {}): ConceptSourceExcerpt {
  return {
    documentId: 'doc-1',
    filename: 'ctdl.pdf',
    kind: 'pdf',
    pageFrom: 41,
    pageTo: 43,
    excerpt: 'Ngăn xếp là cấu trúc dữ liệu tuyến tính theo nguyên tắc LIFO.',
    ...over,
  };
}

/**
 * Mức "Trích đoạn" của FS-04 (#227). Tô SÁNG CẢ ĐOẠN (excerpt = câu định nghĩa verbatim), không tô
 * lẻ tên khái niệm bên trong, và KHÔNG có tiêu đề mục bịa — chỉ tên tệp + trang + câu trích.
 */
describe('DocumentExcerpt (FS-04)', () => {
  it('tô sáng nguyên câu trích trong một <mark> duy nhất', () => {
    const { container } = render(<DocumentExcerpt sources={[source()]} />);
    const marks = container.querySelectorAll('mark');
    expect(marks).toHaveLength(1);
    expect(marks[0].textContent).toBe(
      'Ngăn xếp là cấu trúc dữ liệu tuyến tính theo nguyên tắc LIFO.'
    );
  });

  it('hiện tên tệp và neo trang dựng từ pageFrom/pageTo, KHÔNG dựng tiêu đề mục giả', () => {
    const { container } = render(<DocumentExcerpt sources={[source()]} />);
    expect(screen.getByText('ctdl.pdf')).toBeInTheDocument();
    expect(screen.getByText('tr. 41–43')).toBeInTheDocument();
    // Không có heading nào — tiêu đề mục tài liệu là dữ liệu schema không có, không được bịa.
    expect(container.querySelector('h1,h2,h3,h4,h5,h6')).toBeNull();
  });

  it('nhiều nguồn → mỗi nguồn một khối docbar riêng, xếp theo thứ tự truyền vào', () => {
    render(
      <DocumentExcerpt
        sources={[
          source({ documentId: 'a', filename: 'chuong-1.pdf', pageFrom: 41, pageTo: 41 }),
          source({ documentId: 'b', filename: 'chuong-2.pdf', pageFrom: 88, pageTo: 88 }),
        ]}
      />
    );
    expect(screen.getByText('chuong-1.pdf')).toBeInTheDocument();
    expect(screen.getByText('chuong-2.pdf')).toBeInTheDocument();
    expect(screen.getByText('tr. 41')).toBeInTheDocument();
    expect(screen.getByText('tr. 88')).toBeInTheDocument();
  });

  it('nguồn có neo trang nhưng không có câu trích → nói rõ, không để trống', () => {
    const { container } = render(<DocumentExcerpt sources={[source({ excerpt: null })]} />);
    expect(container.querySelector('mark')).toBeNull();
    expect(screen.getByText(/chỉ có neo vị trí/)).toBeInTheDocument();
  });
});
