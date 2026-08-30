import bcrypt from 'bcryptjs';
import { z } from 'zod';
import type { User } from '@prisma/client';
import prisma from '../config/prisma';
import {
  generateAccessToken,
  generateRefreshToken,
  isTokenVersionCurrent,
  verifyToken,
  type JwtPayload,
} from '../utils/jwt';
import { AppError } from '../middleware/errorHandler';
import { registerSchema, loginSchema, refreshSchema } from '../schemas/auth.schema';
import { AuthResponse, RefreshResponse, UserResponse } from '../types/auth.types';

const SALT_ROUNDS = 10;

/**
 * The claims every token in this app carries.
 *
 * Built here rather than inline at each call site because there are three of
 * them — register, login, refresh — and a claim added to two of the three is
 * worse than one added to none: tokens would then disagree about their own
 * shape depending on which door the user came through.
 */
function tokenPayloadFor(user: User): JwtPayload {
  return { userId: user.id, email: user.email, tokenVersion: user.tokenVersion };
}

/**
 * The user shape the client receives. `createdAt` is serialised to an ISO
 * string by `res.json`; the client renders it as the "Tham gia" field, which
 * showed a dash for as long as this mapper dropped the column.
 */
function toUserResponse(user: User): UserResponse {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt.toISOString(),
  };
}

/**
 * Register a new user account.
 * - Validates input with Zod
 * - Checks for duplicate email
 * - Hashes password with bcryptjs (salt rounds = 10)
 * - Creates user in DB
 * - Returns user info + token pair
 */
export async function register(data: z.infer<typeof registerSchema>): Promise<AuthResponse> {
  // Check duplicate email
  const existingUser = await prisma.user.findUnique({
    where: { email: data.email },
  });

  if (existingUser) {
    throw new AppError('Email already exists', 409, 'EMAIL_CONFLICT');
  }

  // Hash password
  const passwordHash = await bcrypt.hash(data.password, SALT_ROUNDS);

  // Create user in DB
  const user = await prisma.user.create({
    data: {
      email: data.email,
      passwordHash,
      name: data.name,
    },
  });

  // Generate tokens
  const tokenPayload = tokenPayloadFor(user);
  const accessToken = generateAccessToken(tokenPayload);
  const refreshToken = generateRefreshToken(tokenPayload);

  return {
    user: toUserResponse(user),
    accessToken,
    refreshToken,
  };
}

/**
 * Login an existing user.
 * - Finds user by email
 * - Compares password hash
 * - Returns user info + token pair
 */
export async function login(data: z.infer<typeof loginSchema>): Promise<AuthResponse> {
  // Find user by email
  const user = await prisma.user.findUnique({
    where: { email: data.email },
  });

  if (!user) {
    throw new AppError('Email or password incorrect', 401, 'UNAUTHORIZED');
  }

  // Compare password
  const isPasswordValid = await bcrypt.compare(data.password, user.passwordHash);

  if (!isPasswordValid) {
    throw new AppError('Email or password incorrect', 401, 'UNAUTHORIZED');
  }

  // Generate tokens
  const tokenPayload = tokenPayloadFor(user);
  const accessToken = generateAccessToken(tokenPayload);
  const refreshToken = generateRefreshToken(tokenPayload);

  return {
    user: toUserResponse(user),
    accessToken,
    refreshToken,
  };
}

/**
 * Refresh access token using a valid refresh token.
 * - Verifies refresh token
 * - Checks user still exists in DB
 * - Issues new access token
 */
export async function refresh(data: z.infer<typeof refreshSchema>): Promise<RefreshResponse> {
  const secret = process.env.JWT_REFRESH_SECRET;
  if (!secret) {
    throw new AppError(
      'JWT_REFRESH_SECRET is not defined in environment variables',
      500,
      'SERVER_CONFIG_ERROR'
    );
  }

  // Verify refresh token
  let decoded;
  try {
    decoded = verifyToken(data.refreshToken, secret);
  } catch {
    throw new AppError('Invalid or expired refresh token', 401, 'UNAUTHORIZED');
  }

  // Check user still exists
  const user = await prisma.user.findUnique({
    where: { id: decoded.userId },
  });

  if (!user) {
    throw new AppError('User not found', 401, 'UNAUTHORIZED');
  }

  // This is where a password change actually takes effect, and the only place
  // it can. Refresh tokens live seven days and this endpoint never rotates
  // them, so a refresh token issued before the change stays valid for the rest
  // of that week. Without this check it would keep minting fresh access tokens
  // stamped with the NEW tokenVersion — tokens that pass every later check
  // perfectly. Whoever the password change was meant to lock out would be let
  // back in through the front door.
  //
  // Reading `user.tokenVersion` is free here: the row above is already
  // loaded. That is why the check lives on this path and not in
  // `authMiddleware`, which reads no database at all — see `User.tokenVersion`
  // in schema.prisma for that trade.
  if (!isTokenVersionCurrent(decoded.tokenVersion, user.tokenVersion)) {
    throw new AppError('Invalid or expired refresh token', 401, 'UNAUTHORIZED');
  }

  // Generate new access token
  const accessToken = generateAccessToken(tokenPayloadFor(user));

  return { accessToken };
}

/**
 * Get current user info by userId.
 */
export async function getMe(userId: string): Promise<UserResponse> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new AppError('User not found', 404, 'NOT_FOUND');
  }

  return toUserResponse(user);
}
