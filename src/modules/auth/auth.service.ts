import { and, eq, gt } from 'drizzle-orm';
import { db } from '../../db';
import {
  oauthAccounts,
  refreshTokens,
  users,
  verificationTokens,
  type User,
} from '../../db/schema';
import {
  type AuthResponse,
  type OAuthProfile,
  type PublicUser,
  type TokenPair,
} from '../../types';
import { generateSecureToken, hashToken } from '../../utils/crypto';
import {
  sendPasswordResetEmail,
  sendVerificationEmail,
} from '../../utils/email';
import { AppError } from '../../utils/errors';
import { buildTokenPair, verifyRefreshToken } from '../../utils/jwt';
import {
  comparePassword,
  hashPassword,
  validatePasswordStrength,
} from '../../utils/password';

// ── Helpers ───────────────────────────────────────────────────────────────────

function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt,
  };
}

interface SessionMeta {
  userAgent?: string;
  ipAddress?: string;
}

async function createSession(
  userId: string,
  email: string,
  meta: SessionMeta,
  family?: string
): Promise<TokenPair> {
  const {
    tokenPair,
    jti,
    expiresAt,
    family: tokenFamily,
  } = buildTokenPair(userId, email, family);

  // Store hashed refresh token
  await db.insert(refreshTokens).values({
    id: jti,
    userId,
    tokenHash: hashToken(tokenPair.refreshToken),
    family: tokenFamily,
    userAgent: meta.userAgent,
    ipAddress: meta.ipAddress,
    expiresAt,
  });

  // Update last login
  await db
    .update(users)
    .set({ lastLoginAt: new Date() })
    .where(eq(users.id, userId));

  return tokenPair;
}

// ── Register ──────────────────────────────────────────────────────────────────

export async function register(
  email: string,
  password: string,
  name: string,
  meta: SessionMeta
): Promise<AuthResponse> {
  // Check password strength
  const { valid, errors } = validatePasswordStrength(password);
  if (!valid) {
    throw AppError.badRequest('Password does not meet requirements', errors);
  }

  // Check duplicate email
  const existing = await db.query.users.findFirst({
    where: eq(users.email, email),
  });
  if (existing) {
    throw AppError.conflict('An account with this email already exists');
  }

  const passwordHash = await hashPassword(password);

  const [user] = await db
    .insert(users)
    .values({ email, name, passwordHash })
    .returning();

  // Send email verification
  await issueEmailVerification(user.id, email, name);

  const tokens = await createSession(user.id, user.email, meta);

  return { user: toPublicUser(user), tokens };
}

// ── Login ─────────────────────────────────────────────────────────────────────

export async function login(
  email: string,
  password: string,
  meta: SessionMeta
): Promise<AuthResponse> {
  const user = await db.query.users.findFirst({
    where: eq(users.email, email),
  });

  // Always compare to prevent timing attacks even if user not found
  const dummyHash =
    '$2a$12$invalidhashinvalidhashinvalidhashinvalidhashinvalidhash';
  const isValid = await comparePassword(
    password,
    user?.passwordHash ?? dummyHash
  );

  if (!user || !isValid || !user.passwordHash) {
    throw AppError.invalidCredentials();
  }

  if (!user.isActive) throw AppError.accountDisabled();

  const tokens = await createSession(user.id, user.email, meta);
  return { user: toPublicUser(user), tokens };
}

// ── Refresh Token ─────────────────────────────────────────────────────────────

export async function refreshAccessToken(
  rawToken: string,
  meta: SessionMeta
): Promise<TokenPair> {
  const payload = verifyRefreshToken(rawToken);

  const tokenHash = hashToken(rawToken);

  const storedToken = await db.query.refreshTokens.findFirst({
    where: eq(refreshTokens.tokenHash, tokenHash),
    with: { user: true },
  });

  // Token reuse detection: if family exists but this token is revoked → revoke entire family
  if (!storedToken) {
    // Check if family exists (reuse attack)
    const familyTokens = await db.query.refreshTokens.findMany({
      where: eq(refreshTokens.family, payload.family),
    });
    if (familyTokens.length > 0) {
      // Revoke entire family
      await db
        .update(refreshTokens)
        .set({ isRevoked: true })
        .where(eq(refreshTokens.family, payload.family));
      throw AppError.invalidToken(
        'Token reuse detected — all sessions revoked'
      );
    }
    throw AppError.invalidToken('Refresh token not found');
  }

  if (storedToken.isRevoked) {
    // Revoke entire family
    await db
      .update(refreshTokens)
      .set({ isRevoked: true })
      .where(eq(refreshTokens.family, storedToken.family));
    throw AppError.invalidToken('Token reuse detected — all sessions revoked');
  }

  if (storedToken.expiresAt < new Date()) {
    throw new AppError('TOKEN_EXPIRED', 'Refresh token has expired', 401);
  }

  if (!storedToken.user.isActive) throw AppError.accountDisabled();

  // Revoke the used refresh token (rotation)
  await db
    .update(refreshTokens)
    .set({ isRevoked: true })
    .where(eq(refreshTokens.id, storedToken.id));

  // Issue new token pair in same family
  return createSession(
    storedToken.userId,
    storedToken.user.email,
    meta,
    storedToken.family
  );
}

// ── Logout ────────────────────────────────────────────────────────────────────

export async function logout(rawToken: string): Promise<void> {
  const tokenHash = hashToken(rawToken);
  await db
    .update(refreshTokens)
    .set({ isRevoked: true })
    .where(eq(refreshTokens.tokenHash, tokenHash));
}

export async function logoutAllDevices(userId: string): Promise<void> {
  await db
    .update(refreshTokens)
    .set({ isRevoked: true })
    .where(eq(refreshTokens.userId, userId));
}

// ── Email Verification ────────────────────────────────────────────────────────

async function issueEmailVerification(
  userId: string,
  email: string,
  name: string
): Promise<void> {
  const token = generateSecureToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

  await db.insert(verificationTokens).values({
    userId,
    tokenHash,
    type: 'email_verification',
    expiresAt,
  });

  await sendVerificationEmail(email, name, token);
}

export async function verifyEmail(rawToken: string): Promise<void> {
  const tokenHash = hashToken(rawToken);

  const record = await db.query.verificationTokens.findFirst({
    where: and(
      eq(verificationTokens.tokenHash, tokenHash),
      eq(verificationTokens.type, 'email_verification')
    ),
    with: { user: true },
  });

  if (!record || record.usedAt) {
    throw AppError.invalidToken('Invalid or already used verification link');
  }

  if (record.expiresAt < new Date()) {
    throw new AppError('TOKEN_EXPIRED', 'Verification link has expired', 401);
  }

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ emailVerified: true })
      .where(eq(users.id, record.userId));

    await tx
      .update(verificationTokens)
      .set({ usedAt: new Date() })
      .where(eq(verificationTokens.id, record.id));
  });
}

export async function resendVerificationEmail(userId: string): Promise<void> {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) throw AppError.notFound('User not found');
  if (user.emailVerified)
    throw AppError.badRequest('Email is already verified');

  await issueEmailVerification(user.id, user.email, user.name);
}

// ── Password Reset ────────────────────────────────────────────────────────────

export async function forgotPassword(email: string): Promise<void> {
  const user = await db.query.users.findFirst({
    where: eq(users.email, email),
  });

  // Always succeed (don't leak whether email exists)
  if (!user || !user.passwordHash) return;

  const token = generateSecureToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1h

  await db.insert(verificationTokens).values({
    userId: user.id,
    tokenHash,
    type: 'password_reset',
    expiresAt,
  });

  await sendPasswordResetEmail(user.email, user.name, token);
}

export async function resetPassword(
  rawToken: string,
  newPassword: string
): Promise<void> {
  const { valid, errors } = validatePasswordStrength(newPassword);
  if (!valid)
    throw AppError.badRequest('Password does not meet requirements', errors);

  const tokenHash = hashToken(rawToken);

  const record = await db.query.verificationTokens.findFirst({
    where: and(
      eq(verificationTokens.tokenHash, tokenHash),
      eq(verificationTokens.type, 'password_reset')
    ),
  });

  if (!record || record.usedAt) {
    throw AppError.invalidToken('Invalid or already used reset link');
  }

  if (record.expiresAt < new Date()) {
    throw new AppError('TOKEN_EXPIRED', 'Reset link has expired', 401);
  }

  const passwordHash = await hashPassword(newPassword);

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.id, record.userId));

    await tx
      .update(verificationTokens)
      .set({ usedAt: new Date() })
      .where(eq(verificationTokens.id, record.id));

    // Revoke all refresh tokens (security: force re-login everywhere)
    await tx
      .update(refreshTokens)
      .set({ isRevoked: true })
      .where(eq(refreshTokens.userId, record.userId));
  });
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<void> {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user || !user.passwordHash)
    throw AppError.badRequest('No password set on account');

  const isValid = await comparePassword(currentPassword, user.passwordHash);
  if (!isValid) throw AppError.invalidCredentials();

  const { valid, errors } = validatePasswordStrength(newPassword);
  if (!valid)
    throw AppError.badRequest('Password does not meet requirements', errors);

  const passwordHash = await hashPassword(newPassword);

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.id, userId));

    // Revoke all other sessions
    await tx
      .update(refreshTokens)
      .set({ isRevoked: true })
      .where(eq(refreshTokens.userId, userId));
  });
}

// ── OAuth ─────────────────────────────────────────────────────────────────────

export async function handleOAuthLogin(
  profile: OAuthProfile,
  meta: SessionMeta
): Promise<AuthResponse> {
  // Check if OAuth account already exists
  const existingOAuth = await db.query.oauthAccounts.findFirst({
    where: and(
      eq(oauthAccounts.provider, profile.provider),
      eq(oauthAccounts.providerAccountId, profile.providerAccountId)
    ),
    with: { user: true },
  });

  if (existingOAuth) {
    // Update OAuth tokens
    await db
      .update(oauthAccounts)
      .set({
        accessToken: profile.accessToken,
        refreshToken: profile.refreshToken,
        expiresAt: profile.expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(oauthAccounts.id, existingOAuth.id));

    if (!existingOAuth.user.isActive) throw AppError.accountDisabled();

    const tokens = await createSession(
      existingOAuth.user.id,
      existingOAuth.user.email,
      meta
    );
    return { user: toPublicUser(existingOAuth.user), tokens };
  }

  // Check if a user with this email already exists (link accounts)
  const existingUser = await db.query.users.findFirst({
    where: eq(users.email, profile.email),
  });

  let user: User;

  if (existingUser) {
    user = existingUser;
  } else {
    // Create new user
    [user] = await db
      .insert(users)
      .values({
        email: profile.email,
        name: profile.name,
        avatarUrl: profile.avatarUrl,
        emailVerified: true, // OAuth emails are pre-verified
      })
      .returning();
  }

  // Link OAuth account
  await db.insert(oauthAccounts).values({
    userId: user.id,
    provider: profile.provider,
    providerAccountId: profile.providerAccountId,
    accessToken: profile.accessToken,
    refreshToken: profile.refreshToken,
    expiresAt: profile.expiresAt,
  });

  const tokens = await createSession(user.id, user.email, meta);
  return { user: toPublicUser(user), tokens };
}

// ── Sessions ──────────────────────────────────────────────────────────────────

export async function getUserSessions(userId: string) {
  const sessions = await db.query.refreshTokens.findMany({
    where: and(
      eq(refreshTokens.userId, userId),
      eq(refreshTokens.isRevoked, false),
      gt(refreshTokens.expiresAt, new Date())
    ),
    columns: {
      id: true,
      userAgent: true,
      ipAddress: true,
      createdAt: true,
      expiresAt: true,
    },
  });
  return sessions;
}

export async function revokeSession(
  userId: string,
  sessionId: string
): Promise<void> {
  const session = await db.query.refreshTokens.findFirst({
    where: and(
      eq(refreshTokens.id, sessionId),
      eq(refreshTokens.userId, userId)
    ),
  });

  if (!session) throw AppError.notFound('Session not found');

  await db
    .update(refreshTokens)
    .set({ isRevoked: true })
    .where(eq(refreshTokens.id, sessionId));
}
