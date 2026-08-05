import type { Prisma } from '@prisma/client';
import prisma from '../config/prisma';
import { AppError } from '../middleware/errorHandler';
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
 * Ownership check dùng chung — trả 404 (không phải 403) khi session không tồn tại hoặc
 * không thuộc user, để không lộ sự tồn tại của session cho người không sở hữu.
 */
async function getOwnedFocusSessionOrThrow(userId: string, id: string) {
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
      select: { id: true, userId: true },
    });
    if (!plan || plan.userId !== userId) {
      throw new AppError('Plan not found', 404, 'NOT_FOUND');
    }

    const matchingCount = await prisma.concept.count({
      where: { planId: input.planId, id: { in: conceptIds } },
    });
    if (matchingCount !== conceptIds.length) {
      throw new AppError('conceptIds must belong to the given planId', 400, 'INVALID_CONCEPT_IDS');
    }
  }

  const session = await prisma.focusSession.create({
    data: {
      userId,
      planId: input.planId ?? null,
      conceptIds,
      strictMode: input.strictMode ?? false,
    },
  });

  return {
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
