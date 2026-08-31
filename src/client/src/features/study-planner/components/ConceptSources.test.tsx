import { render, screen } from '@/utils/test-utils';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HighlightedExcerpt, ConceptSourceList, ConceptSourcesSection } from './ConceptSources';
import { ConceptDetailPanel } from './ConceptDetailPanel';
import { planApi } from '../api/plan.api';
import type { ConceptDetail, ConceptDocumentSummary, ConceptSourceExcerpt } from '../types/concept';

const PLAN_ID = 'plan-uuid';

/** Khái niệm đã lưu DB — `ConceptSourcesSection` bỏ qua id tạm `c_<timestamp>` mà không fetch. */
const CONCEPT_ID = '11111111-2222-4333-8444-555555555555';

const PLAN_DOCUMENT: ConceptDocumentSummary = {
  documentId: 'doc-uuid',
  filename: 'Giải thuật.pdf',
  kind: 'pdf',
};

function conceptDetail(over: Partial<ConceptDetail> = {}): ConceptDetail {
  return {
    id: CONCEPT_ID,
    name: 'Ngăn xếp',
    difficulty: 1,
    masteryScore: null,
    lastTestedAt: null,
    isRemediating: false,
    remediationReason: null,
    document: PLAN_DOCUMENT,
    sources: [],
    history: [],
    ...over,
  };
}

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

  function renderList(
    sources: ConceptSourceExcerpt[],
    document: ConceptDocumentSummary | null = null
  ) {
    return render(
      <ConceptSourceList
        planId={PLAN_ID}
        sources={sources}
        conceptName="Ngăn xếp"
        prerequisiteNames={[]}
        document={document}
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

  /**
   * ĐỐI CHỨNG ÂM của #493, và là vế dễ quên nhất: nhánh rỗng chỉ được mời mở tài liệu khi kế
   * hoạch THẬT SỰ có tệp. Thiếu ca này thì bản vá đi quá tay đúng thứ #378 cảnh báo — nó xoá mất
   * ranh giới giữa "khái niệm không neo được" và "kế hoạch không có tệp nào".
   */
  it('Không nguồn VÀ kế hoạch không có tài liệu → không mời mở gì cả', () => {
    renderList([], null);

    expect(screen.queryByRole('button', { name: /Mở tài liệu/ })).toBeNull();
    expect(screen.getByText('Không có trích đoạn gốc.')).toBeInTheDocument();
  });

  /**
   * Vế dương (#493). Hai nguyên nhân làm `sources` rỗng — thêm tay (#172) và khái niệm AI chỉ
   * được nhắc tên (#377) — đều là mệnh đề về NEO của khái niệm, không nói gì về việc kế hoạch có
   * tệp gốc. Trước bản vá nhánh này return sớm nên không còn đường nào tới tài liệu, dù #490 đã
   * đưa `document` vào chính response đang cầm trên tay.
   */
  it('Không nguồn NHƯNG kế hoạch có tài liệu → vẫn mở được nguyên tệp', () => {
    renderList([], PLAN_DOCUMENT);

    expect(screen.getByRole('button', { name: 'Mở tài liệu' })).toBeInTheDocument();
    expect(screen.getByText('Không có trích đoạn gốc.')).toBeInTheDocument();
  });

  /** Không neo được đoạn nào thì cũng không có trang — nút này không được hứa "tại trang N". */
  it('Nút của nhánh rỗng không bao giờ kèm số trang', () => {
    renderList([], PLAN_DOCUMENT);

    expect(screen.queryByRole('button', { name: /tại trang/ })).toBeNull();
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

    /**
     * Vế "⛔ không `#page=N`" của #493, đo ở chỗ nó thật sự tới người dùng: URL cuối cùng nạp vào
     * tab. Ca phía trên chỉ khoá NHÃN nút — nhãn không hứa trang mà URL vẫn kèm `#page=` thì lời
     * hứa sai vẫn đi lọt.
     */
    it('nhánh rỗng: blob nạp vào tab KHÔNG kèm #page', async () => {
      vi.spyOn(planApi, 'getDocumentFile').mockResolvedValue(new Blob(['%PDF']));
      vi.stubGlobal('URL', {
        ...URL,
        createObjectURL: () => 'blob:fake',
        revokeObjectURL: vi.fn(),
      });
      renderList([], PLAN_DOCUMENT);

      screen.getByRole('button', { name: 'Mở tài liệu' }).click();
      await vi.waitFor(() => expect(openedTab.location.href).toBe('blob:fake'));
    });
  });
});

/**
 * `ConceptSourceList` xanh mà dây nối vẫn có thể đứt: hai nơi tiêu thụ tự fetch, và trước #493
 * cả hai đều ném `document` đi — một nơi ngay tại `.then`, một nơi ở chỗ truyền prop. Lưới dừng ở
 * biên component thì đột biến xoá dây nối SỐNG SÓT, nên hai describe dưới đo ở đúng tầng đó.
 */
describe('ConceptSourcesSection — dây nối document từ response (#493)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function renderSection() {
    return render(
      <ConceptSourcesSection
        planId={PLAN_ID}
        conceptId={CONCEPT_ID}
        conceptName="Ngăn xếp"
        prerequisiteNames={[]}
      />
    );
  }

  it('response có document → nhánh rỗng vẫn mời mở tài liệu', async () => {
    vi.spyOn(planApi, 'getConceptDetail').mockResolvedValue(conceptDetail());
    renderSection();

    expect(await screen.findByRole('button', { name: 'Mở tài liệu' })).toBeInTheDocument();
  });

  it('response không có document → không mời mở gì', async () => {
    vi.spyOn(planApi, 'getConceptDetail').mockResolvedValue(conceptDetail({ document: null }));
    renderSection();

    // Chờ khối rỗng hiện ra TRƯỚC rồi mới khẳng định sự vắng mặt: `queryBy` trên một cây chưa
    // fetch xong luôn trả `null`, tức nó xanh cả khi bản vá hỏng.
    expect(await screen.findByText('Không có trích đoạn gốc.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Mở tài liệu/ })).toBeNull();
  });
});

describe('ConceptDetailPanel — dây nối document xuống khối nguồn (#493)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function renderPanel() {
    return render(
      <ConceptDetailPanel
        planId={PLAN_ID}
        conceptId={CONCEPT_ID}
        conceptName="Ngăn xếp"
        prerequisites={[]}
        dependents={[]}
        onClose={() => {}}
      />
    );
  }

  it('detail có document → khối nguồn rỗng vẫn mời mở tài liệu', async () => {
    vi.spyOn(planApi, 'getConceptDetail').mockResolvedValue(conceptDetail());
    renderPanel();

    expect(await screen.findByRole('button', { name: 'Mở tài liệu' })).toBeInTheDocument();
  });

  it('detail không có document → không mời mở gì', async () => {
    vi.spyOn(planApi, 'getConceptDetail').mockResolvedValue(conceptDetail({ document: null }));
    renderPanel();

    expect(await screen.findByText('Không có trích đoạn gốc.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Mở tài liệu/ })).toBeNull();
  });
});
