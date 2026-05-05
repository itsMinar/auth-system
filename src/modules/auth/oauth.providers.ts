import { env } from '../../config/env';
import { OAuthProfile } from '../../types';
import { AppError } from '../../utils/errors';

// ── State Store (in-memory for simplicity; use Redis in production) ───────────

const stateStore = new Map<string, { createdAt: number }>();
const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export function generateOAuthState(): string {
  const state =
    Math.random().toString(36).substring(2) +
    Math.random().toString(36).substring(2);
  stateStore.set(state, { createdAt: Date.now() });
  return state;
}

export function validateOAuthState(state: string): boolean {
  const entry = stateStore.get(state);
  if (!entry) return false;
  stateStore.delete(state);
  return Date.now() - entry.createdAt < STATE_TTL_MS;
}

// ── Google OAuth ──────────────────────────────────────────────────────────────

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';

export function getGoogleAuthUrl(state: string): string {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CALLBACK_URL) {
    throw new AppError('OAUTH_ERROR', 'Google OAuth is not configured', 500);
  }

  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: env.GOOGLE_CALLBACK_URL,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'offline',
    prompt: 'select_account',
  });

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export async function exchangeGoogleCode(code: string): Promise<OAuthProfile> {
  if (
    !env.GOOGLE_CLIENT_ID ||
    !env.GOOGLE_CLIENT_SECRET ||
    !env.GOOGLE_CALLBACK_URL
  ) {
    throw new AppError('OAUTH_ERROR', 'Google OAuth is not configured', 500);
  }

  // Exchange code for tokens
  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: env.GOOGLE_CALLBACK_URL,
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenRes.ok) {
    throw new AppError('OAUTH_ERROR', 'Failed to exchange Google code', 400);
  }

  const tokenData = (await tokenRes.json()) as Record<string, any>;

  // Get user info
  const userRes = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });

  if (!userRes.ok) {
    throw new AppError('OAUTH_ERROR', 'Failed to fetch Google user info', 400);
  }

  const googleUser = (await userRes.json()) as Record<string, any>;

  if (!googleUser.email) {
    throw new AppError('OAUTH_ERROR', 'Google account has no email', 400);
  }

  return {
    provider: 'google',
    providerAccountId: googleUser.sub,
    email: googleUser.email,
    name: googleUser.name ?? googleUser.email.split('@')[0],
    avatarUrl: googleUser.picture,
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token,
    expiresAt: tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000)
      : undefined,
  };
}

// ── GitHub OAuth ──────────────────────────────────────────────────────────────

const GITHUB_AUTH_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_USER_URL = 'https://api.github.com/user';
const GITHUB_EMAILS_URL = 'https://api.github.com/user/emails';

export function getGitHubAuthUrl(state: string): string {
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CALLBACK_URL) {
    throw new AppError('OAUTH_ERROR', 'GitHub OAuth is not configured', 500);
  }

  const params = new URLSearchParams({
    client_id: env.GITHUB_CLIENT_ID,
    redirect_uri: env.GITHUB_CALLBACK_URL,
    scope: 'read:user user:email',
    state,
  });

  return `${GITHUB_AUTH_URL}?${params.toString()}`;
}

export async function exchangeGitHubCode(code: string): Promise<OAuthProfile> {
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
    throw new AppError('OAUTH_ERROR', 'GitHub OAuth is not configured', 500);
  }

  // Exchange code for tokens
  const tokenRes = await fetch(GITHUB_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({
      code,
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
    }),
  });

  if (!tokenRes.ok) {
    throw new AppError('OAUTH_ERROR', 'Failed to exchange GitHub code', 400);
  }

  const tokenData = (await tokenRes.json()) as Record<string, any>;

  if (tokenData.error) {
    throw new AppError(
      'OAUTH_ERROR',
      tokenData.error_description ?? 'OAuth error',
      400
    );
  }

  // Get user profile
  const [userRes, emailsRes] = await Promise.all([
    fetch(GITHUB_USER_URL, {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        Accept: 'application/vnd.github+json',
      },
    }),
    fetch(GITHUB_EMAILS_URL, {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        Accept: 'application/vnd.github+json',
      },
    }),
  ]);

  if (!userRes.ok) {
    throw new AppError('OAUTH_ERROR', 'Failed to fetch GitHub user info', 400);
  }

  const githubUser = (await userRes.json()) as Record<string, any>;
  let email = githubUser.email as string | null;

  // GitHub may not return email publicly; fetch from emails endpoint
  if (!email && emailsRes.ok) {
    const emails = (await emailsRes.json()) as Array<{
      email: string;
      primary: boolean;
      verified: boolean;
    }>;
    const primary = emails.find((e) => e.primary && e.verified);
    email = primary?.email ?? emails[0]?.email ?? null;
  }

  if (!email) {
    throw new AppError(
      'OAUTH_ERROR',
      'No verified email found on GitHub account. Please add a public email.',
      400
    );
  }

  return {
    provider: 'github',
    providerAccountId: String(githubUser.id),
    email,
    name: githubUser.name ?? githubUser.login ?? email.split('@')[0],
    avatarUrl: githubUser.avatar_url,
    accessToken: tokenData.access_token,
  };
}
