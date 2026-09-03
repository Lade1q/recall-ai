/**
 * Upload ceilings, in their own module so both the multer middleware and the error handler can
 * read them.
 *
 * They cannot live in `upload.middleware.ts`: that file imports `AppError` from
 * `errorHandler.ts`, so having the error handler import back would close an import cycle.
 */

/** Largest single file, inclusive. */
export const MAX_FILE_SIZE = 10 * 1024 * 1024;

/** Documents one plan may hold. One file = one topic, so this is also the topic-count ceiling. */
export const MAX_FILES_PER_PLAN = 8;

/**
 * Combined size of one upload. Multer cannot express this — `limits.fileSize` is per file, so 8
 * files of 10MB each pass every limit it has — which is why the controller adds up the sizes
 * itself and answers TOTAL_SIZE_EXCEEDED.
 */
export const MAX_TOTAL_UPLOAD_SIZE = 25 * 1024 * 1024;

/**
 * The field names the plan-creation route accepts files under: `files` for the current client,
 * `file` for one that has not been redeployed yet.
 *
 * The error handler needs this list to read multer's `LIMIT_UNEXPECTED_FILE` correctly. That one
 * code covers two very different things, and only `err.field` tells them apart (measured
 * 2026-09-03 against real multipart requests):
 *
 *   - `field` is one of these names  -> the client sent more files than the field accepts.
 *                                        That is TOO_MANY_FILES.
 *   - `field` is anything else       -> the client sent a field this route was never told
 *                                        about. That is a plain UPLOAD_ERROR, and mislabelling
 *                                        it TOO_MANY_FILES would be a lie about a one-file
 *                                        request.
 *
 * Note this fires BEFORE busboy's own `limits.files`, because multer checks a field's `maxCount`
 * as each file arrives — so on this route `LIMIT_FILE_COUNT` is not the code you get.
 */
export const UPLOAD_FILE_FIELDS: readonly string[] = ['files', 'file'];
