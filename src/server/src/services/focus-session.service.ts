import { Prisma } from '@prisma/client';
import type { FocusSession } from '@prisma/client';
import prisma from '../config/prisma';
import { AppError } from '../middleware/errorHandler';
import { buildInactivePlanMessage } from './scheduling.service';
import { CreateFocusSessionInput, EndFocusSessionInput } from '../schemas/focus-session.schema';
import {
  CreateFocusSessionResponse,
  EndFocusSessionResponse,
  FocusSessionListItem,
} from '../types/focus-session.types';

/** `focusedSeconds` không được vượt 8 giờ (28800s) — cùng ngưỡng dùng để coi 1 phiên `running` là bỏ dở. */
const STALE_SESSION_HOURS = 8;

function toConceptIds(value: Prisma.JsonValue): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

/**
 * Ràng buộc duy nhất `focus_sessions_one_running_per_user` (partial index, migration
 * 20260821181401) - Prisma báo lỗi này qua `P2002` giống mọi unique constraint khác, dù
 * constraint không nằm trong `schema.prisma`. Cùng cách kiểm tra với `interview.service.ts`.
 *
 * Review #421 (Quân) — `error.code === 'P2002'` một mình không phân biệt được constraint nào vi
 * phạm. Hôm nay không nuốt nhầm được (khoá duy nhất khác của `FocusSession` chỉ là `id`, va uuid
 * không xảy ra), nhưng là rủi ro hồi quy: thêm `@@unique` khác lên `focus_sessions` sau này sẽ
 * khiến nhánh này báo "bạn đã có phiên đang chạy" cho một vi phạm hoàn toàn khác.
 *
 * Siết bằng cách đọc tên constraint từ thông điệp lỗi gốc của driver — **đo LIVE** (không đoán
 * theo docs Prisma <7 `error.meta?.target`, thứ **không tồn tại** với driver adapter của Prisma 7
 * đang dùng ở đây): `error.meta` thật trông như
 * `{ driverAdapterError: { cause: { originalMessage: 'duplicate key value violates unique
 * constraint "focus_sessions_one_running_per_user"', constraint: { fields: ['user_id'] } } } }`.
 * Không có field nào chỉ chứa mỗi tên constraint, nên so trong `originalMessage` là tín hiệu
 * chính xác nhất hiện có — `constraint.fields` một mình (`['user_id']`) không đủ, đúng lo ngại
 * ban đầu của review.
 *
 * Hình dạng này thuộc nội bộ driver adapter, có thể đổi giữa các bản Prisma. Khi không đọc được
 * `originalMessage` (hình dạng đã đổi), mặc định coi là vi phạm CỦA CONSTRAINT NÀY — giữ hành vi
 * cũ trước review, đúng mức rủi ro "nhẹ" mà review xếp loại, thay vì lặng lẽ nuốt một lỗi.
 *
 * Review #421 round 2 (Quân) — nhánh fallback này không có test nào giữ, và đảo `return true`
 * thành `return false` vẫn xanh 912/912: một lần nâng Prisma đổi hình dạng lỗi sẽ khiến việc
 * siết này tắt lặng lẽ (mọi `P2002` rơi vào nhánh fallback), mock trong test vẫn giữ hình dạng cũ
 * nên CI không phát hiện được. `console.warn` ở đây là để production ít nhất CÒN KÊU khi guard
 * tự tắt — "đã siết" và "siết đã hỏng" phải phân biệt được ở log, không chỉ ở code.
 */
function isFocusSessionRaceViolation(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
    return false;
  }
  const meta = error.meta as
    { driverAdapterError?: { cause?: { originalMessage?: unknown } } } | undefined;
  const originalMessage = meta?.driverAdapterError?.cause?.originalMessage;
  if (typeof originalMessage !== 'string') {
    console.warn(
      '[focus-session] P2002 without a readable driver error message — cannot confirm this is ' +
        'the focus_sessions_one_running_per_user race; treating it as one (fallback, see ' +
        'isFocusSessionRaceViolation docstring). Prisma internals may have changed shape.'
    );
    return true;
  }
  return originalMessage.includes('focus_sessions_one_running_per_user');
}

/**
 * So khớp phiên `running` đã có với plan/conceptIds vừa gửi lên - dùng chung cho nhánh
 * pre-check (tìm thấy trước khi tạo) và nhánh #328 (P2002 - phiên do request khác thắng race
 * tạo ra, refetch được sau khi INSERT của request này bị partial unique index chặn).
 */
function toExistingSessionResponse(
  existing: FocusSession,
  planId: string | null,
  conceptIds: string[]
): CreateFocusSessionResponse {
  const existingConceptIds = toConceptIds(existing.conceptIds);
  const isSameRequest =
    existing.planId === planId &&
    existingConceptIds.length === conceptIds.length &&
    existingConceptIds.every((id) => conceptIds.includes(id));

  if (!isSameRequest) {
    throw new AppError(
      'You already have a focus session running for a different plan or concept. End it before starting a new one.',
      409,
      'SESSION_ALREADY_RUNNING'
    );
  }

  return {
    created: false,
    id: existing.id,
    planId: existing.planId,
    conceptIds: existingConceptIds,
    status: existing.status,
    strictMode: existing.strictMode,
    startedAt: existing.startedAt,
  };
}

/**
 * Ownership check dùng chung — trả 404 (không phải 403) khi session không tồn tại hoặc
 * không thuộc user, để không lộ sự tồn tại của session cho người không sở hữu.
 *
 * Export để `session-note.service.ts` (FS-05) dùng lại đúng MỘT chỗ kiểm quyền phiên: 4 endpoint
 * ghi chú lồng dưới `/focus-sessions/:id` đều phải qua cùng cánh cửa này trước khi chạm bảng
 * `session_notes`, nếu không mỗi endpoint tự viết lại điều kiện sở hữu là chỗ để lọt 404↔403.
 */
export async function getOwnedFocusSessionOrThrow(userId: string, id: string) {
  const session = await prisma.focusSession.findUnique({ where: { id } });
  if (!session || session.userId !== userId) {
    throw new AppError('Focus session not found', 404, 'NOT_FOUND');
  }
  return session;
}

/**
 * Phiên `running` quá 8 giờ không có `endedAt` được coi là bỏ dở — xử lý lười (lazy reap) tại
 * mọi điểm vào đọc/ghi phiên (`listFocusSessions` và `endFocusSession`), không cần cron.
 * `UPDATE ... started_at + interval` là phép cộng tương đối giữa hai cột, Prisma Client API
 * không biểu diễn được nên dùng raw SQL tham số hoá (ngoại lệ hợp lệ theo
 * coding-conventions.md §5.3).
 */
async function reapStaleSessions(userId: string): Promise<void> {
  await prisma.$executeRaw`
    UPDATE focus_sessions
    SET status = 'cancelled', duration_minutes = 0, ended_at = started_at + make_interval(hours => ${STALE_SESSION_HOURS})
    WHERE user_id = ${userId}::uuid
      AND status = 'running'
      AND ended_at IS NULL
      AND started_at < now() - make_interval(hours => ${STALE_SESSION_HOURS})
  `;
}

/**
 * Bắt đầu phiên học Pomodoro (FS-01 bước 1-3). Nếu có `planId`, plan phải thuộc user và
 * mọi `conceptIds` phải thuộc đúng plan đó. Không có `planId` (phiên tự do) thì bỏ qua bước
 * đối chiếu vì không có gì để kiểm tra.
 *
 * Chống trùng (#328): trước khi tạo, tìm phiên `running` của user (scope toàn user, không
 * theo plan/concept — một người chỉ "tập trung" được một lúc, cùng giả định `reapStaleSessions`
 * đã dùng).
 *
 * - Phiên đang có **khớp đúng** plan + conceptIds vừa gửi (double-click, hai tab cùng một mục)
 *   → trả lại nguyên phiên đó (`created: false`), giống pattern resume của `startInterview`
 *   (`interview.service.ts:881`).
 * - Phiên đang có ở **plan/concept khác** → `409 SESSION_ALREADY_RUNNING`, KHÔNG trả phiên đó
 *   về như thể nó là phiên vừa yêu cầu. Review #371: bản đầu trả nguyên phiên cũ trong mọi
 *   trường hợp — client duy nhất (`FocusPage.tsx`) không đọc `created`/so khớp lại, nên hiện
 *   UI của concept vừa bấm trong khi đồng hồ/lịch sử ghi vào concept của phiên cũ, âm thầm
 *   sai lệch dữ liệu học tập. 409 buộc client phải xử lý tường minh thay vì tự tưởng đã vào
 *   đúng phiên.
 *
 * Chốt app-level ở trên (`findFirst`) thu hẹp race window (double-click, mở tab trước-sau)
 * nhưng không đóng tuyệt đối cho N request thực sự đồng thời trong cùng một round-trip DB —
 * `reap → findFirst → create` không nằm trong transaction. Lớp đó do partial unique index
 * `focus_sessions_one_running_per_user` (`WHERE status = 'running'`, migration 20260821181401)
 * chặn ở DB; request thua cuộc ăn `P2002`, refetch phiên thắng và xử lý y hệt nhánh existing
 * (xem `toExistingSessionResponse` và nhánh catch bên dưới) — xem thảo luận trong issue #328.
 */
export async function createFocusSession(
  userId: string,
  input: CreateFocusSessionInput
): Promise<CreateFocusSessionResponse> {
  // Dedupe trước khi đối chiếu: id trùng lặp trong body không tương ứng với hàng nào thêm
  // trong DB, so trực tiếp input.conceptIds.length sẽ làm matchingCount lệch và bị 400 oan.
  const conceptIds = [...new Set(input.conceptIds)];

  if (input.planId) {
    const plan = await prisma.studyPlan.findUnique({
      where: { id: input.planId },
      select: { id: true, userId: true, status: true },
    });
    if (!plan || plan.userId !== userId) {
      throw new AppError('Plan not found', 404, 'NOT_FOUND');
    }
    if (plan.status !== 'active') {
      throw new AppError(buildInactivePlanMessage(plan.status), 409, 'PLAN_NOT_ACTIVE');
    }

    const matchingCount = await prisma.concept.count({
      where: { planId: input.planId, id: { in: conceptIds } },
    });
    if (matchingCount !== conceptIds.length) {
      throw new AppError('conceptIds must belong to the given planId', 400, 'INVALID_CONCEPT_IDS');
    }
  }

  // Reap trước khi kiểm — một phiên bỏ dở >8 giờ (tab đóng không end) không được phép khoá
  // vĩnh viễn việc bắt đầu phiên mới.
  await reapStaleSessions(userId);

  const planId = input.planId ?? null;

  const existing = await prisma.focusSession.findFirst({
    where: { userId, status: 'running' },
    orderBy: { startedAt: 'desc' },
  });
  if (existing) {
    return toExistingSessionResponse(existing, planId, conceptIds);
  }

  let session: FocusSession;
  try {
    session = await prisma.focusSession.create({
      data: {
        userId,
        planId,
        conceptIds,
        strictMode: input.strictMode ?? false,
      },
    });
  } catch (error) {
    if (!isFocusSessionRaceViolation(error)) throw error;

    // #328: N request thực sự đồng thời (cùng round-trip DB, vd. Promise.all) có thể cùng
    // vượt qua findFirst ở trên rồi cùng INSERT - reap-findFirst-create không nằm trong 1
    // transaction. Partial unique index `focus_sessions_one_running_per_user` chặn ở DB;
    // request thua cuộc refetch phiên vừa được request thắng tạo, xử lý y hệt nhánh existing.
    const winner = await prisma.focusSession.findFirst({
      where: { userId, status: 'running' },
      orderBy: { startedAt: 'desc' },
    });
    // Phiên thắng race đã kết thúc/bị reap ngay sau đó - race cực hiếm, không nuốt lỗi gốc.
    if (!winner) throw error;
    return toExistingSessionResponse(winner, planId, conceptIds);
  }

  return {
    created: true,
    id: session.id,
    planId: session.planId,
    conceptIds: toConceptIds(session.conceptIds),
    status: session.status,
    strictMode: session.strictMode,
    startedAt: session.startedAt,
  };
}

/**
 * Kết thúc hoặc hủy phiên (FS-01 Alt flow 1/3/4). `mastery_score`/`last_tested_at` của
 * `concepts` không bị đụng tới ở đây — đó là việc riêng của AI Examiner.
 *
 * Reap phiên treo trước khi thao tác: nếu không, một phiên `running` bị bỏ quên >8 giờ (client
 * không bao giờ gọi lại `GET`) vẫn "kết thúc" được bình thường ở đây, với `elapsedSeconds` tính
 * theo giờ thực tế lúc PATCH (rất lớn) — cho phép ghi nhận tới 8 giờ tập trung ảo vào lịch sử
 * học tập của một phiên lẽ ra đã bị coi là bỏ dở.
 */
export async function endFocusSession(
  userId: string,
  id: string,
  input: EndFocusSessionInput
): Promise<EndFocusSessionResponse> {
  await reapStaleSessions(userId);
  const session = await getOwnedFocusSessionOrThrow(userId, id);

  if (session.status !== 'running') {
    throw new AppError('Focus session has already ended', 409, 'ALREADY_ENDED');
  }

  const endedAt = new Date();
  const elapsedSeconds = Math.floor((endedAt.getTime() - session.startedAt.getTime()) / 1000);
  if (input.focusedSeconds > elapsedSeconds) {
    throw new AppError(
      'focusedSeconds must not exceed the elapsed session time',
      400,
      'FOCUSED_SECONDS_EXCEEDS_ELAPSED'
    );
  }

  // Hủy phiên: không tính thời gian vào lịch sử học tập (Alt flow 4), dù focusedSeconds
  // vẫn được lưu nguyên để giữ số liệu thô.
  const durationMinutes = input.status === 'cancelled' ? 0 : Math.floor(input.focusedSeconds / 60);
  const awayCount = input.awayCount ?? 0;
  const pomodorosCompleted = input.pomodorosCompleted ?? 0;

  const updated = await prisma.focusSession.update({
    where: { id },
    data: {
      status: input.status,
      endedAt,
      durationMinutes,
      focusedSeconds: input.focusedSeconds,
      awayCount,
      pomodorosCompleted,
    },
  });

  return {
    id: updated.id,
    status: updated.status,
    durationMinutes: updated.durationMinutes,
    focusedSeconds: updated.focusedSeconds,
    awayCount: updated.awayCount,
    pomodorosCompleted: updated.pomodorosCompleted,
    strictMode: updated.strictMode,
    startedAt: updated.startedAt,
    endedAt,
  };
}

/** Lịch sử phiên học (FS-03), mới nhất trước, kèm tên khái niệm đã ôn. */
export async function listFocusSessions(
  userId: string,
  { limit = 20, offset = 0 }: { limit?: number; offset?: number }
): Promise<FocusSessionListItem[]> {
  await reapStaleSessions(userId);

  const sessions = await prisma.focusSession.findMany({
    where: { userId },
    orderBy: { startedAt: 'desc' },
    take: limit,
    skip: offset,
  });

  const conceptIdSet = new Set<string>();
  for (const session of sessions) {
    for (const conceptId of toConceptIds(session.conceptIds)) {
      conceptIdSet.add(conceptId);
    }
  }

  // Scope theo plan.userId: một phiên tự do (không planId) không validate conceptIds ở
  // createFocusSession, nên nếu không lọc theo user ở đây, id khái niệm của người khác nhét
  // vào body sẽ resolve ra được tên thật của họ — rò rỉ dữ liệu chéo user.
  const concepts = conceptIdSet.size
    ? await prisma.concept.findMany({
        where: { id: { in: [...conceptIdSet] }, plan: { userId } },
        select: { id: true, name: true },
      })
    : [];
  const conceptNameById = new Map(concepts.map((concept) => [concept.id, concept.name]));

  return sessions.map((session) => ({
    id: session.id,
    planId: session.planId,
    concepts: toConceptIds(session.conceptIds).map((conceptId) => ({
      id: conceptId,
      name: conceptNameById.get(conceptId) ?? 'Không xác định',
    })),
    status: session.status,
    durationMinutes: session.durationMinutes,
    focusedSeconds: session.focusedSeconds,
    awayCount: session.awayCount,
    pomodorosCompleted: session.pomodorosCompleted,
    strictMode: session.strictMode,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
  }));
}
