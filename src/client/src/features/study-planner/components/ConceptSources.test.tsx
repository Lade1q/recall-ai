import { render, screen } from '@/utils/test-utils';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HighlightedExcerpt, ConceptSourceList } from './ConceptSources';
import { planApi } from '../api/plan.api';
import type { ConceptSourceExcerpt } from '../types/concept';

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

/**
 * Link "Mở tài liệu" (Issue #203) — tầng thứ hai của C5: mở nguyên văn tài liệu để đối chiếu
 * trích đoạn, khác với #210 chỉ tô sáng bên trong trích đoạn.
 */
describe('ConceptSourceList — link mở tài liệu (Issue #203)', () => {
  const PLAN_ID = 'plan-uuid';

  function source(overrides: Partial<ConceptSourceExcerpt> = {}): ConceptSourceExcerpt {
    return {
      documentId: 'doc-uuid',
      filename: 'Giải thuật.pdf',
      kind: 'pdf',
      pageFrom: 41,
      pageTo: 43,
      excerpt: 'Ngăn xếp hoạt động theo LIFO.',
      ...overrides,
    };
  }

  function renderList(sources: ConceptSourceExcerpt[]) {
    return render(
      <ConceptSourceList
        planId={PLAN_ID}
        sources={sources}
        conceptName="Ngăn xếp"
        prerequisiteNames={[]}
      />
    );
  }

  it('PDF có trang → link kèm đúng số trang', () => {
    renderList([source()]);

    expect(screen.getByRole('button', { name: 'Mở tài liệu tại trang 41' })).toBeInTheDocument();
  });

  it('PDF không có trang → link không kèm trang', () => {
    renderList([source({ pageFrom: null, pageTo: null })]);

    expect(screen.getByRole('button', { name: 'Mở tài liệu' })).toBeInTheDocument();
  });

  /**
   * Ca này là chỗ hai gạch đầu dòng của AC giao nhau, và dữ liệu thật CÓ ca này: tài liệu dán
   * text vẫn được đánh `pageFrom` lúc phân tích. Gạch "ảnh/text không kèm trang" thắng vì cụ
   * thể hơn — không trình xem nào nhảy tới "trang 3" của một tệp .txt, hứa rồi mở ra đầu tệp
   * còn tệ hơn không hứa.
   */
  it.each([
    ['text', 'pasted-text.txt'],
    ['image', 'slide.png'],
  ] as const)('%s dù có pageFrom → link KHÔNG kèm trang', (kind, filename) => {
    renderList([source({ kind, filename, pageFrom: 3, pageTo: 3 })]);

    expect(screen.getByRole('button', { name: 'Mở tài liệu' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /trang 3/ })).toBeNull();
  });

  it('Mỗi trích đoạn một link riêng — số trang thuộc về đúng đoạn của nó', () => {
    renderList([source({ pageFrom: 41, pageTo: 41 }), source({ pageFrom: 118, pageTo: 118 })]);

    expect(screen.getByRole('button', { name: 'Mở tài liệu tại trang 41' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mở tài liệu tại trang 118' })).toBeInTheDocument();
  });

  it('Khái niệm không có nguồn (#172 thêm tay) → không render link nào', () => {
    renderList([]);

    expect(screen.queryByRole('button', { name: /Mở tài liệu/ })).toBeNull();
    expect(screen.getByText('Không có trích đoạn gốc.')).toBeInTheDocument();
  });

  describe('mở tab', () => {
    const openedTab = { location: { href: '' }, opener: {} as unknown, close: vi.fn() };

    beforeEach(() => {
      openedTab.location.href = '';
      vi.stubGlobal('open', vi.fn().mockReturnValue(openedTab));
    });

    afterEach(() => {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    });

    /**
     * Cái bẫy chính của tính năng này: `window.open` chỉ được phép trong lúc còn "user
     * activation". Nếu await xong mới mở thì với tệp lớn trình duyệt chặn popup âm thầm —
     * bấm vào không có gì xảy ra. Test giữ promise treo để chứng minh tab được mở TRƯỚC.
     */
    it('mở tab ngay trong cú bấm, trước khi tải xong blob', async () => {
      vi.spyOn(planApi, 'getDocumentFile').mockReturnValue(new Promise(() => {}));
      renderList([source()]);

      screen.getByRole('button', { name: 'Mở tài liệu tại trang 41' }).click();

      expect(window.open).toHaveBeenCalledWith('', '_blank');
      expect(planApi.getDocumentFile).toHaveBeenCalledWith(PLAN_ID, 'doc-uuid');
    });

    it('tải xong → điều hướng tab sang blob kèm #page=N', async () => {
      vi.spyOn(planApi, 'getDocumentFile').mockResolvedValue(new Blob(['%PDF']));
      vi.stubGlobal('URL', {
        ...URL,
        createObjectURL: () => 'blob:fake',
        revokeObjectURL: vi.fn(),
      });
      renderList([source()]);

      screen.getByRole('button', { name: 'Mở tài liệu tại trang 41' }).click();
      await vi.waitFor(() => expect(openedTab.location.href).toBe('blob:fake#page=41'));
    });

    it('tải lỗi → đóng tab trắng và báo chưa mở được', async () => {
      vi.spyOn(planApi, 'getDocumentFile').mockRejectedValue(new Error('network'));
      renderList([source()]);

      screen.getByRole('button', { name: 'Mở tài liệu tại trang 41' }).click();

      expect(await screen.findByText(/Chưa mở được tài liệu/)).toBeInTheDocument();
      expect(openedTab.close).toHaveBeenCalled();
    });

    /**
     * Popup bị chặn thì DỪNG hẳn, không lấy tab hiện tại làm phương án hai. Khối nguồn này
     * cũng sống trong panel edit mode, nơi có thể đang có sửa đổi đồ thị chưa lưu — điều hướng
     * tab hiện tại sang PDF là xoá sạch chỗ đó. Test khoá cả hai vế: có báo, và không đụng vào
     * `location` cũng không tải file về vô ích.
     */
    it('popup bị chặn → báo rõ, KHÔNG điều hướng tab hiện tại (giữ sửa đổi chưa lưu)', async () => {
      vi.stubGlobal('open', vi.fn().mockReturnValue(null));
      vi.spyOn(planApi, 'getDocumentFile').mockResolvedValue(new Blob(['%PDF']));
      const hrefBefore = window.location.href;
      renderList([source()]);

      screen.getByRole('button', { name: 'Mở tài liệu tại trang 41' }).click();

      expect(await screen.findByText(/chặn cửa sổ mới/)).toBeInTheDocument();
      expect(window.location.href).toBe(hrefBefore);
      expect(planApi.getDocumentFile).not.toHaveBeenCalled();
    });
  });
});
