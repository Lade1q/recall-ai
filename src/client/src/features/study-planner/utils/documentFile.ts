import { planApi } from '../api/plan.api';

/**
 * An object URL for a stored document, plus the handle that frees it.
 *
 * `revoke` is returned rather than managed internally because the right moment to free the
 * blob is a property of *how it is displayed*, and that differs per caller — see
 * `fetchDocumentObjectUrl`.
 */
export interface DocumentObjectUrl {
  url: string;
  revoke: () => void;
}

/**
 * Turns a plan's document into something a browser can display, without ever putting the file
 * behind a plain URL.
 *
 * This indirection is not optional: the app authenticates with a Bearer token in a header
 * (`apiClient`), not a cookie, so any element that fetches by URL on its own — `<a href>`,
 * `<iframe src>` pointing at the API — sends no token and gets a 401. Fetching the bytes
 * ourselves and handing out a `blob:` URL is what makes the document displayable at all.
 *
 * Kept out of the citation panel deliberately. `<a>`-with-`#page=N` (#203) and an inline
 * `<iframe>` in a focus session (FS-04) are two ways of *showing* the same bytes, and only the
 * fetching half is common — so the common half lives here and neither presentation is baked in.
 *
 * Lifetime is the caller's, because it cannot be decided here. A caller that opens a new tab
 * has handed the URL to a document it no longer controls and must keep it alive on a timer; a
 * caller that renders its own `<iframe>` should revoke on unmount, the moment the element goes
 * away. Freeing it here — on any fixed schedule — would be wrong for one of them.
 */
export async function fetchDocumentObjectUrl(
  planId: string,
  documentId: string
): Promise<DocumentObjectUrl> {
  const blob = await planApi.getDocumentFile(planId, documentId);
  const url = URL.createObjectURL(blob);

  return { url, revoke: () => URL.revokeObjectURL(url) };
}
