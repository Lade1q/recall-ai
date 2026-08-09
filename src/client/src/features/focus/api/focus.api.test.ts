import { describe, expect, it } from 'vitest';
import { getFocusSessionErrorMessage, isTerminalFocusSessionError } from './focus.api';

// axios `isAxiosError` only checks `payload.isAxiosError === true`, so plain
// objects shaped like an axios error are enough here.
const axiosErr = (status: number, code?: string) => ({
  isAxiosError: true,
  response: { status, data: code ? { error: { code } } : undefined },
});

const networkErr = { isAxiosError: true, response: undefined };

describe('getFocusSessionErrorMessage', () => {
  it('returns generic message for a non-axios error', () => {
    expect(getFocusSessionErrorMessage(new Error('x'))).toBe('Đã xảy ra lỗi, vui lòng thử lại.');
  });

  it('returns the network message when there is no response', () => {
    expect(getFocusSessionErrorMessage(networkErr)).toBe(
      'Không kết nối được tới máy chủ. Vui lòng thử lại.'
    );
  });

  it('maps NOT_FOUND to the session-not-found message by default', () => {
    expect(getFocusSessionErrorMessage(axiosErr(404, 'NOT_FOUND'))).toBe(
      'Không tìm thấy phiên học này.'
    );
  });

  it('maps NOT_FOUND to the session-not-found message for the "end" context', () => {
    expect(getFocusSessionErrorMessage(axiosErr(404, 'NOT_FOUND'), 'end')).toBe(
      'Không tìm thấy phiên học này.'
    );
  });

  it('maps NOT_FOUND to the plan-not-found message for the "create" context', () => {
    const msg = getFocusSessionErrorMessage(axiosErr(404, 'NOT_FOUND'), 'create');
    expect(msg).toBe('Không tìm thấy kế hoạch cho phiên học này. Vui lòng tải lại trang.');
    expect(msg).toContain('kế hoạch');
    // distinct from the default/end NOT_FOUND message
    expect(msg).not.toBe(getFocusSessionErrorMessage(axiosErr(404, 'NOT_FOUND')));
  });

  it('maps ALREADY_ENDED to its own message', () => {
    expect(getFocusSessionErrorMessage(axiosErr(409, 'ALREADY_ENDED'))).toBe(
      'Phiên này đã kết thúc trước đó. Vui lòng tải lại trang.'
    );
  });

  it('maps FOCUSED_SECONDS_EXCEEDS_ELAPSED to its own message', () => {
    expect(getFocusSessionErrorMessage(axiosErr(400, 'FOCUSED_SECONDS_EXCEEDS_ELAPSED'))).toBe(
      'Thời gian tập trung ghi nhận không hợp lệ. Vui lòng tải lại trang.'
    );
  });

  it('maps INVALID_CONCEPT_IDS to its own message', () => {
    expect(getFocusSessionErrorMessage(axiosErr(400, 'INVALID_CONCEPT_IDS'))).toBe(
      'Khái niệm không thuộc kế hoạch đã chọn.'
    );
  });

  it('maps VALIDATION_ERROR to its own message', () => {
    expect(getFocusSessionErrorMessage(axiosErr(422, 'VALIDATION_ERROR'))).toBe(
      'Thông tin gửi lên chưa hợp lệ.'
    );
  });

  it('returns non-empty, distinct Vietnamese strings for each mapped code', () => {
    const messages = [
      getFocusSessionErrorMessage(axiosErr(409, 'ALREADY_ENDED')),
      getFocusSessionErrorMessage(axiosErr(400, 'FOCUSED_SECONDS_EXCEEDS_ELAPSED')),
      getFocusSessionErrorMessage(axiosErr(400, 'INVALID_CONCEPT_IDS')),
      getFocusSessionErrorMessage(axiosErr(422, 'VALIDATION_ERROR')),
    ];
    for (const m of messages) {
      expect(m.length).toBeGreaterThan(0);
    }
    expect(new Set(messages).size).toBe(messages.length);
  });

  it('falls back to the generic message for an unknown code', () => {
    expect(getFocusSessionErrorMessage(axiosErr(400, 'SOMETHING_ELSE'))).toBe(
      'Đã xảy ra lỗi, vui lòng thử lại.'
    );
  });
});

describe('isTerminalFocusSessionError', () => {
  it('treats 4xx responses as terminal', () => {
    expect(isTerminalFocusSessionError(axiosErr(404))).toBe(true);
    expect(isTerminalFocusSessionError(axiosErr(400))).toBe(true);
    expect(isTerminalFocusSessionError(axiosErr(409))).toBe(true);
    expect(isTerminalFocusSessionError(axiosErr(422))).toBe(true);
  });

  it('treats 5xx responses as non-terminal (retryable)', () => {
    expect(isTerminalFocusSessionError(axiosErr(500))).toBe(false);
    expect(isTerminalFocusSessionError(axiosErr(503))).toBe(false);
  });

  it('treats a network error (no response) as non-terminal', () => {
    expect(isTerminalFocusSessionError(networkErr)).toBe(false);
  });

  it('treats a non-axios error as non-terminal', () => {
    expect(isTerminalFocusSessionError(new Error('boom'))).toBe(false);
  });
});
