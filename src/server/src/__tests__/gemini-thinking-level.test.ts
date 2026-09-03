const mockCreate = jest.fn();

jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    interactions: { create: mockCreate },
    files: { upload: jest.fn(), get: jest.fn() },
  })),
}));

/**
 * `thinking_level` is read from the environment, and the SDK types the field as
 * `'minimal' | 'low' | 'medium' | 'high' | (string & {})` — that trailing `string & {}` means
 * a typo compiles, so nothing but a runtime check stands between a misspelled env var and an
 * HTTP 400 on every AI call.
 *
 * These cases therefore assert the value that actually reaches `interactions.create`, not the
 * value the service says it resolved. The two are only the same while the wiring is right, and
 * the wiring is the thing under test.
 */
const OK_EXTRACT = {
  concepts: [{ name: 'Stack', difficulty: 1 }],
  edges: [],
  language_detected: 'en',
};

/** Re-imports the service with the given env, so its import-time resolution runs again. */
function loadServiceWith(env: Record<string, string | undefined>) {
  const saved = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(env)) {
    saved.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  let service!: typeof import('../services/gemini.service');
  jest.isolateModules(() => {
    // `import` is hoisted and evaluated once, but this module resolves its config AT IMPORT TIME
    // — re-importing it under a different environment is the whole point here, and that needs a
    // runtime require.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    service = require('../services/gemini.service');
  });

  for (const [key, value] of saved) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return service;
}

/** The `thinking_level` on the single call the mocked SDK received. */
function sentThinkingLevel(): unknown {
  expect(mockCreate).toHaveBeenCalledTimes(1);
  return mockCreate.mock.calls[0]?.[0]?.generation_config?.thinking_level;
}

beforeEach(() => {
  mockCreate.mockReset();
  mockCreate.mockResolvedValue({ output_text: JSON.stringify(OK_EXTRACT) });
});

const UNSET = {
  GEMINI_THINKING_EXTRACT: undefined,
  GEMINI_THINKING_LINK: undefined,
  GEMINI_THINKING_INTERVIEW: undefined,
};

describe('thinking_level env configuration', () => {
  it('defaults to low for extract_concepts and medium for link_topics', async () => {
    const service = loadServiceWith(UNSET);

    await service.extractConcepts({ kind: 'text', text: 'A stack is LIFO.' });
    expect(sentThinkingLevel()).toBe('low');

    mockCreate.mockClear();
    await service.linkTopics('## a.pdf\n- Stack');
    expect(sentThinkingLevel()).toBe('medium');
  });

  it('sends the configured level for each call surface independently', async () => {
    const service = loadServiceWith({
      ...UNSET,
      GEMINI_THINKING_EXTRACT: 'high',
      GEMINI_THINKING_LINK: 'minimal',
    });

    await service.extractConcepts({ kind: 'text', text: 'A stack is LIFO.' });
    expect(sentThinkingLevel()).toBe('high');

    mockCreate.mockClear();
    await service.linkTopics('## a.pdf\n- Stack');
    expect(sentThinkingLevel()).toBe('minimal');
  });

  it('accepts surrounding whitespace and any casing', async () => {
    const service = loadServiceWith({ ...UNSET, GEMINI_THINKING_EXTRACT: '  HIGH  ' });

    await service.extractConcepts({ kind: 'text', text: 'A stack is LIFO.' });
    expect(sentThinkingLevel()).toBe('high');
  });

  it('falls back to the default and warns when the value is misspelled', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const service = loadServiceWith({ ...UNSET, GEMINI_THINKING_LINK: 'meduim' });

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('GEMINI_THINKING_LINK'));

    await service.linkTopics('## a.pdf\n- Stack');
    // The point of the fallback: a typo must not reach the API, where it is a 400 on every call.
    expect(sentThinkingLevel()).toBe('medium');
    warn.mockRestore();
  });

  it('falls back on an empty value rather than sending an empty string', async () => {
    const service = loadServiceWith({ ...UNSET, GEMINI_THINKING_EXTRACT: '   ' });

    await service.extractConcepts({ kind: 'text', text: 'A stack is LIFO.' });
    expect(sentThinkingLevel()).toBe('low');
  });
});
