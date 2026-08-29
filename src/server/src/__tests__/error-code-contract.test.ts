import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The client↔server error-code contract, pinned by reading both trees off disk.
 *
 * Why this file exists: the server's error `code` is a **cross-tree API**, and nothing enforced
 * it. `apiClient.ts` has no global mapper (only the refresh interceptor), so an unmapped code
 * falls through every `getXErrorMessage` default and the user is told *"Đã xảy ra lỗi, vui lòng
 * thử lại."* — no reason, no next step. Adding a code server-side was an **invisible** operation:
 * the server suite stayed green, the client suite stayed green, and the user silently lost the
 * sentence the server had carefully written for them.
 *
 * That is not hypothetical. `PLAN_NOT_ACTIVE` (#350) shipped with a Vietnamese, action-bearing
 * message that the client never rendered, and the sweep that followed found two **ghost** cases —
 * `SESSION_NOT_ACTIVE` and `NO_ACTIVE_CONCEPTS` — client branches with ready-written Vietnamese
 * copy for codes the server has never once emitted. The reverse check below is what catches those;
 * a forward-only check would have left them sitting there forever.
 *
 * ⚠️ **This test reads files, it does not import them** — no DB, no API key, no Prisma client
 * (SDP risk R05). It also deliberately parses with regexes rather than a TS AST: the thing being
 * pinned is a set of string literals, and a parser dependency would be a heavier promise than the
 * check is worth.
 *
 * **When this test fails, the fix is usually in the client, not here.** Add a `case` to the mapper
 * that owns the endpoint. Only add to `INTENTIONALLY_GENERIC` when a generic message is genuinely
 * the right thing to show — and write down why, because the next person will ask.
 */

const SERVER_SRC = join(__dirname, '..');
const CLIENT_SRC = join(__dirname, '../../../client/src');

/**
 * Codes the client is **allowed** to leave on the generic fallback, each with the reason. The
 * reason is the payload of this list — an allowlist of bare strings would decay into a list of
 * "codes someone once skipped".
 *
 * The bar for belonging here: either the user cannot act on a specific message anyway (bugs,
 * misconfiguration, auth plumbing), or the state is not reachable from the UI as it is built.
 * "It would be nice to have" is not a reason to leave a code here.
 */
const INTENTIONALLY_GENERIC: Readonly<Record<string, string>> = {
  // --- Bugs or plumbing: a specific sentence would tell the user something they cannot act on.
  BAD_REQUEST: 'errorHandler.ts, malformed JSON body — a client bug, not a user action.',
  INTERNAL_ERROR: 'errorHandler.ts catch-all for unexpected throws. Generic is the honest answer.',
  SERVER_ERROR: 'auth.middleware.ts, missing JWT secret — misconfiguration, not user-facing.',
  SERVER_CONFIG_ERROR: 'jwt.ts / auth.service.ts, missing signing keys. Same as SERVER_ERROR.',
  UPLOAD_ERROR: 'errorHandler.ts, non-size multer failure. The user retries; the reason is ours.',
  FORBIDDEN: "plan.service.ts, another user's plan. The UI never offers a link to one.",

  // --- Graph editing (PUT /graph). No mapper exists for this surface; the editor surfaces
  // failures inline against the offending node/edge rather than through a toast.
  DAG_CYCLE: 'graph.service.ts — the graph editor reports cycles inline, not via a toast.',
  DUPLICATE_CONCEPT: 'graph.service.ts — same inline surface as DAG_CYCLE.',
  INVALID_EDGE_REFERENCE: 'graph.service.ts — same inline surface as DAG_CYCLE.',

  // --- Interview internals. These guard the answer/turn state machine, and every one of them is
  // reachable only when the client and server disagree about the current turn — which the client
  // resolves by refetching authoritative state (`fetchAuthoritativeState`), not by reading a
  // sentence. Kept generic on purpose.
  ANSWER_IN_PROGRESS: 'interview.service.ts — double-submit race; the client refetches state.',
  NO_PENDING_QUESTION: 'interview.service.ts — client/server turn disagreement; same handling.',
  TURN_LIMIT_REACHED: 'interview.service.ts — the UI stops offering the input at the limit.',
  FALLBACK_MODE_ACTIVE: 'interview.service.ts — AE-05 mode disagreement; client refetches.',
  NOT_IN_FALLBACK_MODE: 'interview.service.ts — the mirror of FALLBACK_MODE_ACTIVE.',
  CONCEPT_NOT_IN_SESSION:
    'session-note.service.ts — a note pinned to a concept outside its own ' +
    'session. Not reachable from the UI, which only ever offers the current session.',
  SESSION_NOT_COMPLETED:
    'session-summary.service.ts — /summary before the session ends. The UI ' +
    'only routes there after completion.',

  // --- Known debt, deliberately not fixed under the pre-freeze scope (2026-08-16). Both give the
  // user a wrong instruction, but both need an abnormal state to reach, so neither is a one-click
  // path. Fix these when the freeze lifts; do not delete the entries without fixing them.
  REANALYZE_NOT_ALLOWED:
    'DEBT: plan.service.ts — three distinct reasons behind one code. Needs a ' +
    'mapper on the plan-detail surface. Requires an already-running analysis to reach.',
  DOCUMENT_FILE_MISSING:
    'DEBT: document.service.ts — the file vanished from disk under a plan ' +
    'that still references it. Abnormal state; no one-click path.',
  STATUS_TRANSITION_NOT_ALLOWED:
    'DEBT: plan.service.ts — archive/unarchive from a status that ' +
    'forbids it. The UI hides the control in exactly those statuses.',
  WRONG_PASSWORD: 'DEBT: user.service.ts — the change-password form has no mapper yet.',
};

/** `getInterviewErrorMessage` handles every Gemini failure by prefix, not case-by-case. */
const HANDLED_PREFIXES = ['AI_'];

function walk(dir: string, accept: (path: string) => boolean): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist') continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      if (entry === '__tests__') continue;
      out.push(...walk(path, accept));
    } else if (accept(path)) {
      out.push(path);
    }
  }
  return out;
}

const isSource = (path: string) =>
  /\.tsx?$/.test(path) && !path.endsWith('.d.ts') && !/\.test\.tsx?$/.test(path);

/**
 * Every code the server can put on the wire, mapped to the files that emit it. Two mechanisms,
 * because the server has two: `new AppError(msg, status, 'CODE')` at the call sites, and bare
 * `code: 'CODE'` literals inside `errorHandler.ts`'s own responses (multer, malformed JSON, the
 * catch-all). Reading only the first would miss five codes that reach the client just as surely.
 */
function collectServerCodes(): Map<string, Set<string>> {
  const codes = new Map<string, Set<string>>();
  const record = (code: string | undefined, file: string) => {
    if (!code) return;
    const seen = codes.get(code) ?? new Set<string>();
    seen.add(file.slice(SERVER_SRC.length + 1));
    codes.set(code, seen);
  };
  for (const file of walk(SERVER_SRC, isSource)) {
    const source = readFileSync(file, 'utf8');
    for (const m of source.matchAll(/new AppError\([\s\S]*?,\s*\d{3},\s*'([A-Z][A-Z0-9_]*)'\s*\)/g))
      record(m[1], file);
    for (const m of source.matchAll(/\bcode:\s*'([A-Z][A-Z0-9_]*)'/g)) record(m[1], file);
  }
  return codes;
}

/**
 * Every code some client mapper actually branches on. Restricted to `*.api.ts` because that is
 * where the convention puts them — a `case 'X'` buried in a component is exactly the drift this
 * test is meant to discourage, and would not be found here.
 */
function collectClientCodes(): Map<string, Set<string>> {
  const codes = new Map<string, Set<string>>();
  const record = (code: string | undefined, file: string) => {
    if (!code) return;
    const seen = codes.get(code) ?? new Set<string>();
    seen.add(file.slice(CLIENT_SRC.length + 1));
    codes.set(code, seen);
  };
  for (const file of walk(CLIENT_SRC, (p) => isSource(p) && p.endsWith('.api.ts'))) {
    const source = readFileSync(file, 'utf8');
    for (const m of source.matchAll(/case '([A-Z][A-Z0-9_]*)':/g)) record(m[1], file);
    for (const m of source.matchAll(/code === '([A-Z][A-Z0-9_]*)'/g)) record(m[1], file);
    // The `UPLOAD_VALIDATION_CODES` idiom in plan.api.ts: a Set membership test, not a case.
    for (const set of source.matchAll(/new Set\(\[([\s\S]*?)\]\)/g))
      for (const m of (set[1] ?? '').matchAll(/'([A-Z][A-Z0-9_]*)'/g)) record(m[1], file);
  }
  return codes;
}

describe('client↔server error-code contract', () => {
  const serverCodes = collectServerCodes();
  const clientCodes = collectClientCodes();

  // Guard against the whole suite passing vacuously because a path moved or a regex stopped
  // matching. Without these two, every assertion below is trivially true over an empty set.
  it('finds both trees', () => {
    expect(serverCodes.size).toBeGreaterThan(30);
    expect(clientCodes.size).toBeGreaterThan(10);
  });

  it('has a client branch, a prefix rule, or a documented reason for every server code', () => {
    const unhandled = [...serverCodes]
      .filter(([code]) => !clientCodes.has(code))
      .filter(([code]) => !HANDLED_PREFIXES.some((prefix) => code.startsWith(prefix)))
      .filter(([code]) => !(code in INTENTIONALLY_GENERIC))
      .map(([code, files]) => `${code} (thrown in ${[...files].join(', ')})`);

    expect(unhandled).toEqual([]);
  });

  /**
   * The direction that found the ghosts. A client `case` for a code the server never emits is
   * dead copy: it reads like the state is handled, so nobody looks again, and the state it claims
   * to handle renders the generic fallback forever.
   */
  it('has no client branch for a code the server never emits', () => {
    const ghosts = [...clientCodes]
      .filter(([code]) => !serverCodes.has(code))
      .map(([code, files]) => `${code} (client case in ${[...files].join(', ')})`);

    expect(ghosts).toEqual([]);
  });

  /** An allowlist nobody prunes stops being a decision and becomes sediment. */
  it('keeps no stale entries in the generic allowlist', () => {
    const stale = Object.keys(INTENTIONALLY_GENERIC)
      .filter((code) => !serverCodes.has(code))
      .map((code) => `${code} (no longer emitted by the server — drop the entry)`);
    const superseded = Object.keys(INTENTIONALLY_GENERIC)
      .filter((code) => clientCodes.has(code))
      .map((code) => `${code} (now mapped on the client — drop the entry)`);

    expect([...stale, ...superseded]).toEqual([]);
  });

  it('gives every allowlist entry a reason', () => {
    const unexplained = Object.entries(INTENTIONALLY_GENERIC)
      .filter(([, reason]) => reason.trim().length < 20)
      .map(([code]) => code);

    expect(unexplained).toEqual([]);
  });
});
