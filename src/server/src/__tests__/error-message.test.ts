import { toSafeErrorMessage } from '../utils/error-message';

describe('toSafeErrorMessage', () => {
  it('returns the message of an Error instance', () => {
    expect(toSafeErrorMessage(new Error('400 The document has no pages.'))).toBe(
      '400 The document has no pages.'
    );
  });

  it('stringifies a non-Error value', () => {
    expect(toSafeErrorMessage('plain string rejection')).toBe('plain string rejection');
    expect(toSafeErrorMessage(42)).toBe('42');
  });

  it('never surfaces the stack trace, only the message', () => {
    const error = new Error('AI returned an empty response');
    error.stack = `Error: AI returned an empty response\n    at secretInternalPath (/app/src/services/gemini.service.ts:106:11)`;
    expect(toSafeErrorMessage(error)).toBe('AI returned an empty response');
  });

  it('truncates a message longer than 500 chars and marks it truncated', () => {
    const longMessage = 'x'.repeat(600);
    const result = toSafeErrorMessage(new Error(longMessage));
    expect(result.length).toBe(501); // 500 chars + the ellipsis marker
    expect(result.endsWith('…')).toBe(true);
    expect(result.startsWith('x'.repeat(500))).toBe(true);
  });

  it('leaves a message at exactly the limit untouched', () => {
    const message = 'x'.repeat(500);
    expect(toSafeErrorMessage(new Error(message))).toBe(message);
  });
});
