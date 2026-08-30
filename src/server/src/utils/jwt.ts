import jwt, { SignOptions } from 'jsonwebtoken';
import { AppError } from '../middleware/errorHandler';

export interface JwtPayload {
  userId: string;
  email: string;
  /**
   * Which generation of the user's credentials this token belongs to; see
   * `User.tokenVersion`. Bumped when the password changes, so a token minted
   * before the change can be told apart from one minted after it.
   *
   * OPTIONAL ON PURPOSE, and the reason is the only interesting thing about
   * this field. Every token in circulation before this shipped carries no such
   * claim, so at runtime the value is `undefined` for them. Declaring it
   * required would let `verifyToken`'s unchecked cast below hand callers a
   * `number` that is actually missing, and a plain `!==` against a stored 0
   * would then reject every pre-existing session at once. Optional forces the
   * caller to say what a missing claim means — which `isTokenVersionCurrent`
   * does, in one place.
   */
  tokenVersion?: number;
}

/**
 * Does this token still belong to the current generation of the user's
 * credentials?
 *
 * A token with no claim is treated as generation 0, which is what the column
 * defaults to, so every session that predates this feature keeps working. That
 * coalescing is the whole point of the function: it is the line that decides
 * whether shipping password-change revocation is invisible to logged-in users
 * or signs all of them out, and it is easier to get right once here than at
 * each call site.
 *
 * Pure — no database, no environment. The database read that supplies
 * `storedVersion` belongs to the caller.
 */
export function isTokenVersionCurrent(
  claimedVersion: number | undefined,
  storedVersion: number
): boolean {
  return (claimedVersion ?? 0) === storedVersion;
}

/**
 * Generate an access token.
 */
export function generateAccessToken(payload: JwtPayload): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new AppError(
      'JWT_SECRET is not defined in environment variables',
      500,
      'SERVER_CONFIG_ERROR'
    );
  }
  const expiresIn = process.env.JWT_ACCESS_EXPIRES_IN || '15m';
  return jwt.sign(payload, secret, { expiresIn: expiresIn as SignOptions['expiresIn'] });
}

/**
 * Generate a refresh token.
 */
export function generateRefreshToken(payload: JwtPayload): string {
  const secret = process.env.JWT_REFRESH_SECRET;
  if (!secret) {
    throw new AppError(
      'JWT_REFRESH_SECRET is not defined in environment variables',
      500,
      'SERVER_CONFIG_ERROR'
    );
  }
  const expiresIn = process.env.JWT_REFRESH_EXPIRES_IN || '7d';
  return jwt.sign(payload, secret, { expiresIn: expiresIn as SignOptions['expiresIn'] });
}

/**
 * Verify and decode a JWT token.
 * Throws if the token is invalid or expired.
 */
export function verifyToken(token: string, secret: string): JwtPayload {
  return jwt.verify(token, secret) as JwtPayload;
}
