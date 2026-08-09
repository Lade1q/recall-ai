import fs from 'fs';
import path from 'path';

/**
 * Abstract interface for file storage operations.
 * MVP uses LocalStorageService; production will use R2StorageService.
 */
export interface StorageService {
  /** Upload a file and return a storage key (relative, portable). */
  upload(localFilePath: string, destinationKey: string): Promise<string>;
  /**
   * Read a stored file's bytes. Resolves to `null` when nothing is stored under the key —
   * a DB row can outlive its object (SP-04 replaces `fileKey` in place, a manual cleanup
   * empties `uploads/`), and callers must be able to tell that apart from a read failure.
   *
   * Buffer, not a stream: uploads are capped at 10MB by `upload.middleware`, and a Buffer
   * keeps the contract portable to R2's `GetObjectCommand` without leaking stream plumbing
   * into every caller.
   */
  read(fileKey: string): Promise<Buffer | null>;
  /** Delete a file by its storage key. */
  delete(fileKey: string): Promise<void>;
}

const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads');

/**
 * Local filesystem storage for MVP/development.
 * Uses async non-blocking file operations and supports cross-device migrations.
 */
export class LocalStorageService implements StorageService {
  async upload(localFilePath: string, destinationKey: string): Promise<string> {
    const destPath = path.join(UPLOAD_DIR, destinationKey);
    const destDir = path.dirname(destPath);

    // Ensure parent directory exists
    await fs.promises.mkdir(destDir, { recursive: true });

    // Copy + Unlink to prevent EXDEV errors when staging is on a different partition
    await fs.promises.copyFile(localFilePath, destPath);
    await fs.promises.unlink(localFilePath);

    return destinationKey;
  }

  async read(fileKey: string): Promise<Buffer | null> {
    // `fileKey` comes from `documents.file_key` (written by `upload` above), never from the
    // request — but resolve-and-check anyway so a malformed row can't escape UPLOAD_DIR.
    const filePath = path.resolve(UPLOAD_DIR, fileKey);
    if (filePath !== UPLOAD_DIR && !filePath.startsWith(UPLOAD_DIR + path.sep)) {
      return null;
    }

    try {
      return await fs.promises.readFile(filePath);
    } catch (error) {
      // A missing object is a legitimate answer ("nothing here"), not a failure to report.
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  async delete(fileKey: string): Promise<void> {
    const filePath = path.join(UPLOAD_DIR, fileKey);
    try {
      await fs.promises.unlink(filePath);
    } catch (error) {
      // Ignore if file does not exist (ENOENT)
      if (error && typeof error === 'object' && 'code' in error && error.code !== 'ENOENT') {
        throw error;
      }
    }
  }
}

// Future Sprint 4: Cloudflare R2 Storage Service Stub
// export class R2StorageService implements StorageService {
//   private s3: S3Client;
//   constructor() {
//     this.s3 = new S3Client({
//       region: 'auto',
//       endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
//       credentials: {
//         accessKeyId: process.env.R2_ACCESS_KEY_ID!,
//         secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
//       },
//     });
//   }
//   async upload(localFilePath: string, destinationKey: string): Promise<string> { ... }
//   async delete(fileKey: string): Promise<void> { ... }
// }

/**
 * Factory: returns the appropriate StorageService based on environment.
 */
export function createStorageService(): StorageService {
  // Sprint 4: if (process.env.STORAGE_PROVIDER === 'r2') return new R2StorageService();
  return new LocalStorageService();
}
