import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { act, render, screen, waitFor, within } from '@/utils/test-utils';
import HistoryPage from './HistoryPage';
import { focusSessionApi } from '@/features/focus/api/focus.api';
import { historyApi } from '@/features/history/api/history.api';
import { planApi } from '@/features/study-planner/api/plan.api';
import { toast } from 'sonner';
import type { FocusSessionListItem } from '@/features/focus/types/focus.types';
import type { InterviewSessionListItem } from '@/features/history/types/history.types';
import type { PlanSummary } from '@/features/study-planner/types/concept';

// Cả ba nguồn của màn đều mock: `/interviews` (tab kia), `/plans` (tên kế hoạch + bộ lọc), và
// `/focus-sessions` (tab này). Không có backend trong jsdom.
vi.mock('@/features/focus/api/focus.api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/focus/api/focus.api')>();
  return {
    ...actual,
    focusSessionApi: { list: vi.fn(), end: vi.fn() },
    // Hai hàm thuần phân loại/mapping lỗi giữ bản thật. Mock từng che việc call-site truyền nhầm
    // context, và sau đó còn làm fixture 404 terminal giả trang thành lỗi có thể retry.
  };
});
vi.mock('@/features/history/api/history.api', () => ({
  historyApi: { listInterviews: vi.fn() },
  PAGE_SIZE: 20,
}));
vi.mock('@/features/study-planner/api/plan.api', () => ({
  planApi: { listPlans: vi.fn() },
}));

// 🔴 Nguồn thứ TƯ, thiếu cho tới #468: chọn một phiên làm `SessionDetailPanel` gọi
// `interviewApi` qua `useSessionDetail`. Không mock ⇒ tệp này phát lời gọi MẠNG THẬT tới
// `VITE_API_BASE_URL` (mặc định `http://localhost:3001`) — 5 lượt mỗi lần chạy, đo được.
//
// Hệ quả: kết quả của suite khớp nối với việc **có ai đang nghe cổng đó hay không**, một biến
// nằm NGOÀI repo. CI (cổng trống ⇒ `ECONNREFUSED` ⇒ nhánh `.catch`) xanh vĩnh viễn; máy dev
// đang chạy server thì lời gọi thoát ra THÀNH CÔNG, payload lạ vào state, và component ném lúc
// render (`SessionDetailPanel.tsx:109` đọc `detail.summary.summary.text`). Đo được: dựng một
// stub trả `200 {"data":{"foo":1}}` ở 3001 ⇒ `2 failed | 10 passed`, `Errors 2`.
//
// Đây KHÔNG phải unhandled rejection: `useSessionDetail` có `.catch()`. Nó là Uncaught
// Exception lúc render. Vá theo lý do sai thì bẫy này mọc lại ở tệp khác.
vi.mock('@/features/interview/api/interview.api', () => ({
  interviewApi: {
    getInterview: vi.fn(),
    getSummary: vi.fn(),
    resumeInterview: vi.fn(),
    abandonInterview: vi.fn(),
  },
  getInterviewErrorMessage: () => 'lỗi',
}));

// Hai hook danh sách gọi `toast.error` trong nhánh `.catch` của `loadMore` (#450) — cùng chỗ ba
// hook khác trong repo đã đặt toast của chúng. Mock để đọc được CHUỖI, không chỉ "có toast".
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const listFocus = vi.mocked(focusSessionApi.list);
const endFocus = vi.mocked(focusSessionApi.end);
const listInterviews = vi.mocked(historyApi.listInterviews);
const listPlans = vi.mocked(planApi.listPlans);
const toastError = vi.mocked(toast.error);
const toastSuccess = vi.mocked(toast.success);

function focusSession(over: Partial<FocusSessionListItem> = {}): FocusSessionListItem {
  return {
    id: 'fs-1',
    planId: 'plan-1',
    concepts: [{ id: 'c-1', name: 'Ngăn xếp' }],
    status: 'completed',
    durationMinutes: 25,
    focusedSeconds: 1500,
    awayCount: 0,
    pomodorosCompleted: 1,
    strictMode: false,
    startedAt: new Date().toISOString(),
    endedAt: new Date().toISOString(),
    ...over,
  };
}

function planSummary(over: Partial<PlanSummary> = {}): PlanSummary {
  return {
    id: 'plan-1',
    name: 'Kế hoạch A',
    deadline: null,
    status: 'active',
    conceptCount: 1,
    masteryDistribution: { strong: 0, learning: 0, weak: 0, untested: 1 },
    analysisStatus: 'done',
    analysisStartedAt: null,
    analysisErrorMessage: null,
    document: null,
    createdAt: new Date(2026, 7, 1).toISOString(),
    reviewQueueConceptCount: 1,
    ...over,
  };
}

/** Mở màn rồi chuyển sang tab "Phiên học" — mặc định của khung là tab Phiên kiểm tra. */
async function openFocusTab() {
  render(<HistoryPage />);
  await userEvent.click(screen.getByRole('tab', { name: 'Phiên học' }));
}

function interviewSession(id: string): InterviewSessionListItem {
  return {
    id,
    startedAt: new Date(2026, 7, 30, 19, 5).toISOString(),
    endedAt: new Date(2026, 7, 30, 19, 30).toISOString(),
    status: 'completed',
    fallbackMode: false,
    plan: { id: 'plan-1', name: 'Mạng máy tính' },
    conceptTotal: 3,
    averageMasteryScore: 0.62,
    concepts: [],
  };
}

/** Trang ĐẦY của mỗi tab — `hasMore` chỉ suy được từ `page.length === PAGE_SIZE`. */
const focusPage = (prefix: string) =>
  Array.from({ length: 20 }, (_, i) => focusSession({ id: `${prefix}-${i}` }));
const interviewPage = (prefix: string) =>
  Array.from({ length: 20 }, (_, i) => interviewSession(`${prefix}-${i}`));

const focusRows = () =>
  within(screen.getByRole('region', { name: 'Danh sách phiên học' })).getAllByRole('article');

beforeEach(() => {
  toastError.mockReset();
  toastSuccess.mockReset();
  listFocus.mockReset();
  endFocus.mockReset();
  listInterviews.mockReset().mockResolvedValue([]);
  listPlans.mockReset().mockResolvedValue([]);
});

describe('HistoryPage — tab Phiên học', () => {
  it('KHÔNG có phiên nào ⇒ hiện khung rỗng với CTA sang FS-01', async () => {
    // AC #247 kê ca này ("Trạng thái rỗng dùng lại khuôn DB-03, đổi CTA sang FS-01") nhưng chưa
    // test nào chạm: đột biến làm điều kiện rỗng không bao giờ đúng vẫn xanh 441/441.
    listFocus.mockResolvedValue([]);
    await openFocusTab();

    expect(await screen.findByText('Chưa có phiên học nào')).toBeInTheDocument();
    const cta = screen.getByRole('link', { name: 'Bắt đầu phiên học đầu tiên' });
    expect(cta).toHaveAttribute('href', '/focus');
    // Khung rỗng thay CHO danh sách, không nằm cạnh nó.
    expect(screen.queryByRole('region', { name: 'Danh sách phiên học' })).not.toBeInTheDocument();
  });

  it('CÓ phiên ⇒ hiện danh sách, không hiện khung rỗng', async () => {
    // Đối chứng âm: không có ca này thì test trên không phân biệt được "điều kiện rỗng đúng"
    // với "khung rỗng luôn hiện".
    listFocus.mockResolvedValue([focusSession()]);
    await openFocusTab();

    expect(await screen.findByRole('region', { name: 'Danh sách phiên học' })).toBeInTheDocument();
    expect(screen.queryByText('Chưa có phiên học nào')).not.toBeInTheDocument();
  });

  it('phiên đang chạy ⇒ hiện lối hủy riêng và tải lại danh sách sau khi hủy', async () => {
    const running = focusSession({
      status: 'running',
      durationMinutes: 0,
      focusedSeconds: 0,
      endedAt: null,
    });
    listPlans.mockResolvedValue([planSummary()]);
    listFocus.mockResolvedValueOnce([running]).mockResolvedValueOnce([]);
    endFocus.mockResolvedValue({} as never);

    await openFocusTab();

    const current = await screen.findByRole('region', { name: 'Phiên học đang chạy' });
    expect(within(current).getByText(/Ngăn xếp/)).toBeInTheDocument();
    expect(within(current).getByText(/Bắt đầu lúc .* · Kế hoạch A/)).toBeInTheDocument();
    // Phiên running là trạng thái hiện tại, không được lẫn vào danh sách lịch sử phía dưới.
    expect(screen.queryByRole('region', { name: 'Danh sách phiên học' })).not.toBeInTheDocument();

    await userEvent.click(within(current).getByRole('button', { name: 'Hủy phiên đang chạy' }));
    expect(screen.getByText(/Thời gian của phiên này sẽ không được ghi nhận/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Hủy phiên' }));

    await waitFor(() =>
      expect(endFocus).toHaveBeenCalledWith(running.id, {
        status: 'cancelled',
        focusedSeconds: 0,
      })
    );
    expect(toastSuccess).toHaveBeenCalledWith(
      'Đã hủy phiên đang chạy. Bạn có thể bắt đầu phiên học mới.'
    );
    await waitFor(() => expect(listFocus).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Chưa có phiên học nào')).toBeInTheDocument();
  });

  it('phiên tự do không có concept ⇒ giữ nhãn phạm vi và tên fallback', async () => {
    listFocus.mockResolvedValue([
      focusSession({
        planId: null,
        concepts: [],
        status: 'running',
        endedAt: null,
      }),
    ]);

    await openFocusTab();

    const current = await screen.findByRole('region', { name: 'Phiên học đang chạy' });
    expect(
      within(current).getByRole('heading', { name: 'Phiên học tập trung' })
    ).toBeInTheDocument();
    expect(within(current).getByText(/Bắt đầu lúc .* · Phiên tự do/)).toBeInTheDocument();
  });

  it('kế hoạch chưa tra được tên ⇒ không bịa nhãn kế hoạch hoặc gọi là phiên tự do', async () => {
    listFocus.mockResolvedValue([
      focusSession({
        status: 'running',
        endedAt: null,
      }),
    ]);

    await openFocusTab();

    const current = await screen.findByRole('region', { name: 'Phiên học đang chạy' });
    expect(within(current).getByText(/^Bắt đầu lúc \d{2}:\d{2}$/)).toBeInTheDocument();
    expect(within(current).queryByText(/Phiên tự do/)).not.toBeInTheDocument();
  });

  it('hủy phiên đang chạy hỏng ⇒ giữ nguyên phiên và báo lỗi', async () => {
    const running = focusSession({ status: 'running', endedAt: null });
    listFocus.mockResolvedValue([running]);
    // Lỗi mạng Axios thật không có response: mapper phải báo mất kết nối và bộ phân loại thật
    // phải xem đây là lỗi có thể retry, nên dialog/card vẫn ở nguyên và danh sách không reload.
    endFocus.mockRejectedValue({
      isAxiosError: true,
    });

    await openFocusTab();
    await userEvent.click(
      within(await screen.findByRole('region', { name: 'Phiên học đang chạy' })).getByRole(
        'button',
        { name: 'Hủy phiên đang chạy' }
      )
    );
    await userEvent.click(screen.getByRole('button', { name: 'Hủy phiên' }));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('Không kết nối được tới máy chủ. Vui lòng thử lại.')
    );
    // Hỏng thì dialog ở lại để người dùng hiểu thao tác chưa hoàn tất; đóng dialog mới thấy lại
    // card phía sau, và card phải còn nguyên vì danh sách chưa reload.
    await userEvent.click(screen.getByRole('button', { name: 'Giữ phiên' }));
    expect(screen.getByRole('region', { name: 'Phiên học đang chạy' })).toBeInTheDocument();
    expect(listFocus).toHaveBeenCalledTimes(1);
  });

  it('đang gửi PATCH ⇒ Escape không đóng hộp xác nhận', async () => {
    const running = focusSession({ status: 'running', endedAt: null });
    listFocus.mockResolvedValueOnce([running]).mockResolvedValueOnce([]);
    let resolveEnd!: (value: unknown) => void;
    endFocus.mockReturnValue(
      new Promise((resolve) => {
        resolveEnd = resolve;
      }) as never
    );

    await openFocusTab();
    await userEvent.click(
      within(await screen.findByRole('region', { name: 'Phiên học đang chạy' })).getByRole(
        'button',
        { name: 'Hủy phiên đang chạy' }
      )
    );
    await userEvent.click(screen.getByRole('button', { name: 'Hủy phiên' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Hủy phiên' })).toBeDisabled());

    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('dialog', { name: 'Hủy phiên đang chạy?' })).toBeInTheDocument();

    // Khép promise để test không để lại một update bất đồng bộ treo qua ca kế tiếp.
    await act(async () => resolveEnd({}));
    expect(await screen.findByText('Chưa có phiên học nào')).toBeInTheDocument();
  });

  it('phiên đã được nơi khác kết thúc ⇒ tải lại thay vì giữ card running cũ', async () => {
    const running = focusSession({ status: 'running', endedAt: null });
    listFocus.mockResolvedValueOnce([running]).mockResolvedValueOnce([]);
    // 404 làm hai việc độc lập: mapper thật phải dùng context `end` để nói "phiên học", và bộ
    // phân loại thật phải coi 4xx là terminal để reload thay vì giữ card running đã cũ.
    endFocus.mockRejectedValue({
      isAxiosError: true,
      response: { status: 404, data: { error: { code: 'NOT_FOUND' } } },
    });

    await openFocusTab();
    await userEvent.click(
      within(await screen.findByRole('region', { name: 'Phiên học đang chạy' })).getByRole(
        'button',
        { name: 'Hủy phiên đang chạy' }
      )
    );
    await userEvent.click(screen.getByRole('button', { name: 'Hủy phiên' }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Không tìm thấy phiên học này.'));
    await waitFor(() => expect(listFocus).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Chưa có phiên học nào')).toBeInTheDocument();
  });

  it('đang tải ⇒ skeleton, KHÔNG loé khung rỗng', async () => {
    // Cặp với ca trên: cả hai cùng trả lời một câu hỏi "rỗng hay đang tải". Promise treo hẳn để
    // đo đúng khoảnh khắc giữa chừng.
    listFocus.mockReturnValue(new Promise(() => {}));
    await openFocusTab();

    expect(await screen.findByLabelText('Đang tải lịch sử phiên học')).toBeInTheDocument();
    expect(screen.queryByText('Chưa có phiên học nào')).not.toBeInTheDocument();
  });

  it('tải hỏng ⇒ khối lỗi có nút "Thử lại", và bấm thì gọi lại API', async () => {
    listFocus.mockRejectedValueOnce(new Error('mạng hỏng'));
    await openFocusTab();

    expect(await screen.findByText('Không tải được lịch sử phiên học.')).toBeInTheDocument();
    // Ca hỏng KHÔNG được đọc thành ca rỗng — hai câu nói hai điều khác nhau.
    expect(screen.queryByText('Chưa có phiên học nào')).not.toBeInTheDocument();

    listFocus.mockResolvedValue([focusSession()]);
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));

    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Danh sách phiên học' })).toBeInTheDocument()
    );
  });
});

/**
 * #450 — nợ dùng chung của CẢ HAI tab. Radix unmount `TabsContent` không hoạt động, và không hook
 * nào có cache, nên mỗi lần quay lại một tab là một `GET ?offset=0` mới và người dùng mất đúng
 * chỗ đang đọc. Đo LIVE ở review PR #441: 33 hàng → đổi tab → quay lại → còn 20.
 *
 * ⚠️ Mỗi ca dưới đây khẳng định TAB ĐÃ THẬT SỰ ĐỔI trước khi đo. Lượt đo đầu ở issue báo "vẫn giữ
 * 33 hàng" — sai, vì `scrollIntoView` đã đẩy tab trigger ra ngoài viewport nên cú bấm bắn trượt và
 * tab không hề đổi. Kiểm trạng thái sau thao tác, đừng kiểm chỉ kết quả.
 */
describe('HistoryPage — vòng đời tab (#450)', () => {
  const switchTo = async (name: string) => {
    await userEvent.click(screen.getByRole('tab', { name }));
    // Chốt chặn cho đúng bẫy đo ghi trong issue: nếu cú bấm trượt thì phép đo phía sau vô nghĩa.
    expect(screen.getByRole('tab', { name })).toHaveAttribute('aria-selected', 'true');
  };

  it('🔴 tab Phiên học: đổi tab rồi quay lại KHÔNG tải lại, các trang đã tải còn nguyên', async () => {
    listFocus.mockResolvedValueOnce(focusPage('a')).mockResolvedValueOnce([focusSession()]);

    await openFocusTab();
    await userEvent.click(await screen.findByRole('button', { name: 'Xem thêm phiên cũ hơn' }));
    await waitFor(() => expect(focusRows()).toHaveLength(21));

    await switchTo('Phiên kiểm tra');
    await switchTo('Phiên học');

    // Hai lời gọi: trang đầu + "Xem thêm". Lần thứ ba là dấu hiệu tab đã bị unmount rồi mount lại.
    expect(listFocus).toHaveBeenCalledTimes(2);
    // Và chiều còn lại của cùng một bản vá: giữ mount phải giữ luôn nội dung đang đọc.
    expect(focusRows()).toHaveLength(21);
  });

  it('🔴 tab Phiên kiểm tra (tab MẶC ĐỊNH) cũng sống qua lần rời đi rồi quay lại', async () => {
    // Tab mặc định vẫn bị Radix unmount khi rời sang tab kia, nên nó cần `forceMount` y như tab
    // phụ — nửa bản vá chỉ chữa được một chiều.
    listInterviews.mockResolvedValue([interviewSession('is-1')]);
    listFocus.mockResolvedValue([]);

    render(<HistoryPage />);
    await screen.findByRole('region', { name: 'Danh sách phiên kiểm tra' });

    await switchTo('Phiên học');
    await switchTo('Phiên kiểm tra');

    expect(listInterviews).toHaveBeenCalledTimes(1);
  });

  /**
   * Giá phải trả của `forceMount`, ghim thành test để nó là một quyết định chứ không phải một tai
   * nạn: cả hai nguồn bắn ngay khi mở màn, kể cả khi người dùng không bấm sang tab kia. MỘT
   * request thay vì N request mỗi lần đổi tab — cùng đánh đổi `PlansPage` đã nhận từ #436.
   */
  it('mở màn là cả hai tab cùng tải một lần, kể cả tab chưa bấm sang', async () => {
    listInterviews.mockResolvedValue([]);
    listFocus.mockResolvedValue([]);

    render(<HistoryPage />);

    await waitFor(() => expect(listFocus).toHaveBeenCalledTimes(1));
    expect(listInterviews).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('tab', { name: 'Phiên kiểm tra' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });

  /**
   * 🧪 Vế LOAD-BEARING của `forceMount`, và là phép kiểm CẤU TRÚC chứ không phải hành vi.
   *
   * Đo được: với `forceMount`, Radix **không** đặt thuộc tính `hidden` lên panel không hoạt động
   * — cả hai panel đều `hidden: false`, chỉ khác `data-state`. Nghĩa là `data-[state=inactive]:
   * hidden` là thứ DUY NHẤT giữ hai tab khỏi chồng lên nhau; gỡ class đó ra là màn hiện cả hai
   * danh sách một lúc.
   *
   * jsdom không áp CSS Tailwind nên hậu quả ấy không quan sát được ở đây — cùng lớp giới hạn với
   * `min-h` ở #446. Nên test này khoá **sự có mặt của luật ẩn**, không khoá kết quả hiển thị. Ai
   * đổi sang cơ chế ẩn khác (Radix tự đặt `hidden`, `display` inline, v.v.) phải sửa cả test này
   * — và đó chính là lúc cần đọc lại đoạn trên.
   */
  it('🧪 forceMount đi kèm luật ẩn: Radix KHÔNG tự ẩn panel không hoạt động', async () => {
    listInterviews.mockResolvedValue([]);
    listFocus.mockResolvedValue([]);

    render(<HistoryPage />);
    await waitFor(() => expect(listFocus).toHaveBeenCalledTimes(1));

    // (a) CẢ HAI panel phải mang luật ẩn. Bản cũ chỉ hỏi panel đang `inactive`, nên gỡ class ở
    // panel KIA vẫn xanh — mà panel kia sẽ thành panel ẩn ngay khi người dùng đổi tab.
    const panels = document.querySelectorAll('[data-slot="tabs-content"]');
    // ⛔ Đừng bỏ dòng này: `forEach` trên NodeList rỗng chạy 0 lần và vẫn xanh, nên phép đếm là
    // thứ duy nhất phân biệt "cả hai đều đúng" với "không tìm thấy panel nào".
    expect(panels).toHaveLength(2);
    panels.forEach((el) => expect(el).toHaveClass('data-[state=inactive]:hidden'));

    // (b) và Radix KHÔNG tự đặt `hidden` khi có `forceMount` — nên (a) là thứ duy nhất giữ hai
    // panel khỏi chồng lên nhau, chứ không phải một lớp phòng thủ thứ hai.
    const inactive = document.querySelector('[data-slot="tabs-content"][data-state="inactive"]');
    expect(inactive).not.toBeNull();
    expect(inactive).not.toHaveAttribute('hidden');
  });
});

/**
 * #450 — `forceMount` làm tab Phiên học tải NGAY khi mở màn, nên nó có thể hỏng lúc người dùng
 * còn chưa bấm sang. Đo LIVE: toast nổ về một tab chưa mở, và nút "Thử lại" mà nó bảo bấm nằm
 * trong panel ẩn — `rect 0×0`, `checkVisibility()` false, không nhận focus. Lời khuyên không thi
 * hành được, và nó tự tắt sau ~3s.
 */
describe('HistoryPage — tab chưa mở thì không được nói (#450)', () => {
  it('🔴 hỏng lúc tab còn ẩn: im lặng; bấm sang tab đó mới báo', async () => {
    listFocus.mockRejectedValue(new Error('mạng hỏng'));
    listInterviews.mockResolvedValue([]);

    render(<HistoryPage />);

    // Mốc lắng: panel ẩn vẫn ở trong DOM (`forceMount`) nên khối lỗi của nó tìm được — đợi nó
    // hiện ra rồi mới hỏi "có toast không". Hỏi ngay sau `listFocus` được gọi là hỏi trước khi
    // trạng thái lỗi kịp chảy tới.
    expect(await screen.findByText('Không tải được lịch sử phiên học.')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Phiên kiểm tra' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(toastError).not.toHaveBeenCalled();

    // Vế thứ hai, và nó là thứ phân biệt bản vá này với một cái gate "luôn im": khi người dùng
    // đã ở đúng tab thì lỗi PHẢI được nói ra — lúc đó nút "Thử lại" mới thật sự bấm được.
    await userEvent.click(screen.getByRole('tab', { name: 'Phiên học' }));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        'Không tải được lịch sử phiên học. Kiểm tra kết nối rồi thử lại.'
      )
    );
  });

  /**
   * Cùng bất biến, chiều ngược lại. Cửa sổ hẹp hơn vì đây là tab mặc định, nhưng tới được: người
   * dùng bấm sang tab Phiên học trong lúc `/interviews` còn bay, rồi nó hỏng.
   *
   * Ca này tồn tại để hai tab không mang hai luật khác nhau trong cùng một tệp — đó mới là thứ
   * người sửa sau đọc thành "chắc có lý do" rồi đi vòng qua.
   */
  it('🔴 chiều ngược lại: tab Phiên kiểm tra hỏng lúc đang ẩn cũng im lặng', async () => {
    let rejectInterviews!: (reason: unknown) => void;
    listInterviews.mockReturnValue(
      new Promise((_, reject) => {
        rejectInterviews = reject;
      })
    );
    listFocus.mockResolvedValue([]);

    render(<HistoryPage />);

    // Rời khỏi tab mặc định TRƯỚC khi `/interviews` trả lời — đó là toàn bộ cửa sổ của ca này.
    await userEvent.click(screen.getByRole('tab', { name: 'Phiên học' }));
    expect(screen.getByRole('tab', { name: 'Phiên học' })).toHaveAttribute('aria-selected', 'true');

    // Đẩy lỗi trong `act` để `setState` của nhánh `.catch` chảy hết trước khi hỏi màn hình.
    await act(async () => {
      rejectInterviews(new Error('mạng hỏng'));
    });

    expect(screen.getByText('Không tải được danh sách phiên kiểm tra.')).toBeInTheDocument();
    expect(toastError).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('tab', { name: 'Phiên kiểm tra' }));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        'Không tải được danh sách phiên kiểm tra. Kiểm tra kết nối rồi thử lại.'
      )
    );
  });
});

/**
 * #450 mục 2 — `.catch` của `loadMore` byte-identical ở hai hook, và cả hai chỉ tắt cờ quay. Người
 * dùng bấm "Xem thêm", nút quay xong, **không gì xảy ra và không ai nói gì** — không phân biệt
 * được với "hết phiên rồi".
 *
 * Phần "giữ nguyên danh sách đang đọc" là CỐ Ý và phải ở lại: mất danh sách vì một trang phụ lỗi
 * là cái giá quá đắt. Nên mỗi ca khoá cả hai vế — có tiếng nói, và không mất gì.
 */
describe('HistoryPage — "Xem thêm" hỏng thì phải nói (#450)', () => {
  it('🔴 tab Phiên học: toast báo lỗi, và danh sách đang đọc ở lại nguyên vẹn', async () => {
    listFocus.mockResolvedValueOnce(focusPage('a')).mockRejectedValueOnce(new Error('mạng hỏng'));

    await openFocusTab();
    await userEvent.click(await screen.findByRole('button', { name: 'Xem thêm phiên cũ hơn' }));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        'Không tải thêm được phiên học. Kiểm tra kết nối rồi bấm lại.'
      )
    );
    expect(focusRows()).toHaveLength(20);
    // KHÔNG được rơi vào nhánh lỗi của trang đầu: đó là chỗ nuốt mất danh sách.
    expect(screen.queryByRole('button', { name: 'Thử lại' })).not.toBeInTheDocument();
  });

  it('🔴 tab Phiên kiểm tra: cùng hành vi, câu chữ theo đúng loại phiên của nó', async () => {
    listInterviews
      .mockResolvedValueOnce(interviewPage('is'))
      .mockRejectedValueOnce(new Error('mạng hỏng'));
    listFocus.mockResolvedValue([]);

    render(<HistoryPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Xem thêm phiên cũ hơn' }));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        'Không tải thêm được phiên kiểm tra. Kiểm tra kết nối rồi bấm lại.'
      )
    );
    // Hàng của tab này là `<button>` (chọn được), không phải `<article>` như tab Phiên học.
    expect(
      within(screen.getByRole('region', { name: 'Danh sách phiên kiểm tra' })).getAllByRole(
        'button'
      )
    ).toHaveLength(21); // 20 hàng + nút "Xem thêm" vẫn còn đó để bấm lại
  });
});
