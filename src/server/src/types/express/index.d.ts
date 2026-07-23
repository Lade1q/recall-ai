/**
 * Extend Express Request interface to include auth-related fields.
 * Uses module augmentation pattern so TypeScript picks it up
 * without needing typeRoots config changes.
 */
declare global {
  namespace Express {
    interface Request {
      userId?: string;
      user?: { userId: string; email: string };
    }
  }
}

export {};
