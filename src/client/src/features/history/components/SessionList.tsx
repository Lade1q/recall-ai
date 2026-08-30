import { Loader2 } from 'lucide-react';

import { BlockError } from '@/features/dashboard/components/BlockError';
import { SessionListItem } from './SessionListItem';
import { groupSessionsByTime } from '../utils/group-sessions';
import type { InterviewSessionListItem } from '../types/history.types';

/**
 * Cột trái: mọi phiên kiểm tra, nhóm theo mốc thời gian, mới nhất trước (SPEC_DB-03 bước #2).
 * Chọn một phiên KHÔNG rời danh sách (bước #3) — panel chi tiết nằm ngay cạnh.
 */
export function SessionList({
  sessions,
  selectedId,
  onSelect,
  loading,
  loadingMore,
  error,
  hasMore,
  onLoadMore,
  onRetry,
}: {
  sessions: InterviewSessionListItem[];
  selectedId: string | null;
  onSelect: (session: InterviewSessionListItem) => void;
  loading: boolean;
  loadingMore: boolean;
  error: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  onRetry: () => void;
}) {
  if (loading) return <SessionListSkeleton />;

  if (error) {
    return (
      <div className="bg-card border-border rounded-xl border p-4">
        <BlockError message="Không tải được danh sách phiên kiểm tra." onRetry={onRetry} />
      </div>
    );
  }

  // `now` chốt một lần cho cả lượt render: nhóm theo từng phần tử sẽ cho hai hàng cạnh nhau
  // rơi vào hai nhóm khác nhau nếu render vắt qua nửa đêm.
  const groups = groupSessionsByTime(sessions, new Date());

  return (
    <section
      className="bg-card border-border overflow-hidden rounded-xl border py-1.5"
      aria-label="Danh sách phiên kiểm tra"
    >
      {groups.map((group) => (
        <div key={group.label}>
          <h3 className="text-muted-foreground px-[18px] pb-1.5 pt-3 text-[11px] uppercase tracking-[0.06em]">
            {group.label}
          </h3>
          {group.sessions.map((session) => (
            <SessionListItem
              key={session.id}
              session={session}
              selected={session.id === selectedId}
              onSelect={() => onSelect(session)}
            />
          ))}
        </div>
      ))}

      {hasMore && (
        <button
          type="button"
          onClick={onLoadMore}
          disabled={loadingMore}
          className="border-border text-muted-foreground hover:text-foreground mt-1.5 flex w-full cursor-pointer items-center justify-center gap-2 border-t p-3 text-[13px] transition-colors disabled:cursor-default"
        >
          {loadingMore && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
          {loadingMore ? 'Đang tải…' : 'Xem thêm phiên cũ hơn'}
        </button>
      )}
    </section>
  );
}

/** Mockup không vẽ trạng thái đang tải; khung xám giữ đúng nhịp hàng để danh sách không giật. */
function SessionListSkeleton() {
  return (
    <div
      className="bg-card border-border overflow-hidden rounded-xl border py-1.5"
      aria-busy="true"
      aria-label="Đang tải danh sách phiên"
    >
      <div className="bg-muted mx-[18px] my-3 h-2.5 w-20 animate-pulse rounded" />
      {[0, 1, 2, 3].map((row) => (
        <div key={row} className="px-[18px] pb-[13px] pt-[11px]">
          <div className="flex items-baseline justify-between gap-2.5">
            <div className="bg-muted h-3 w-24 animate-pulse rounded" />
            <div className="bg-muted h-3 w-12 animate-pulse rounded" />
          </div>
          <div className="bg-muted mt-2 h-3 w-40 animate-pulse rounded" />
          <div className="mt-2 flex gap-[5px]">
            <div className="bg-muted h-4 w-24 animate-pulse rounded" />
            <div className="bg-muted h-4 w-20 animate-pulse rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}
