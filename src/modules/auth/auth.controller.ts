import { NextFunction, Request, Response } from 'express';
import { env } from '../../config/env';
import { AuthenticatedRequest } from '../../types';
import { AppError } from '../../utils/errors';
import { created, noContent, success } from '../../utils/response';
import * as authService from './auth.service';
import {
  exchangeGitHubCode,
  exchangeGoogleCode,
  generateOAuthState,
  getGitHubAuthUrl,
  getGoogleAuthUrl,
  validateOAuthState,
} from './oauth.providers';

// ── Helper Function to Extract Meta Information ──────────────

function getSessionMeta(req: Request) {
  return {
    userAgent: req.headers['user-agent'],
    ipAddress:
      (Array.isArray(req.headers['x-forwarded-for'])
        ? req.headers['x-forwarded-for'][0]
        : req.headers['x-forwarded-for']
      )
        ?.split(',')[0]
        .trim() ?? req.socket.remoteAddress,
  };
}

// ── Register ──────────────────────────────────────────────────────────────────

export async function register(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { email, password, name } = req.body;
    const result = await authService.register(
      email,
      password,
      name,
      getSessionMeta(req)
    );
    created(
      res,
      result,
      'Account created. Please check your email to verify your account.'
    );
  } catch (err) {
    next(err);
  }
}

// ── Login ─────────────────────────────────────────────────────────────────────

export async function login(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { email, password } = req.body;
    const result = await authService.login(
      email,
      password,
      getSessionMeta(req)
    );
    success(res, result);
  } catch (err) {
    next(err);
  }
}

// ── Refresh Token ─────────────────────────────────────────────────────────────

export async function refreshToken(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { refreshToken: token } = req.body;
    const tokens = await authService.refreshAccessToken(
      token,
      getSessionMeta(req)
    );
    success(res, { tokens });
  } catch (err) {
    next(err);
  }
}

// ── Logout ────────────────────────────────────────────────────────────────────

export async function logout(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { refreshToken: token } = req.body;
    if (token) await authService.logout(token);
    noContent(res);
  } catch (err) {
    next(err);
  }
}

export async function logoutAll(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    await authService.logoutAllDevices(req.user.id);
    noContent(res);
  } catch (err) {
    next(err);
  }
}

// ── Email Verification ────────────────────────────────────────────────────────

export async function verifyEmail(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { token } = req.query as { token: string };
    await authService.verifyEmail(token);
    success(res, null, { message: 'Email verified successfully' });
  } catch (err) {
    next(err);
  }
}

export async function resendVerification(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    await authService.resendVerificationEmail(req.user.id);
    success(res, null, { message: 'Verification email sent' });
  } catch (err) {
    next(err);
  }
}

// ── Password Reset ────────────────────────────────────────────────────────────

export async function forgotPassword(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { email } = req.body;
    await authService.forgotPassword(email);
    // Always return same response (don't leak email existence)
    success(res, null, {
      message: 'If that email exists, a reset link has been sent',
    });
  } catch (err) {
    next(err);
  }
}

export async function resetPassword(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { token, password } = req.body;
    await authService.resetPassword(token, password);
    success(res, null, { message: 'Password reset successfully' });
  } catch (err) {
    next(err);
  }
}

export async function changePassword(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { currentPassword, newPassword } = req.body;
    await authService.changePassword(req.user.id, currentPassword, newPassword);
    success(res, null, { message: 'Password changed successfully' });
  } catch (err) {
    next(err);
  }
}

// ── Sessions ──────────────────────────────────────────────────────────────────

export async function getSessions(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const sessions = await authService.getUserSessions(req.user.id);
    success(res, { sessions });
  } catch (err) {
    next(err);
  }
}

export async function revokeSession(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const sessionId = req.params['sessionId'] as string;
    await authService.revokeSession(req.user.id, sessionId);
    noContent(res);
  } catch (err) {
    next(err);
  }
}

// ── OAuth: Google ─────────────────────────────────────────────────────────────

export function googleRedirect(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    const state = generateOAuthState();
    res.redirect(getGoogleAuthUrl(state));
  } catch (err) {
    next(err);
  }
}

export async function googleCallback(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { code, state, error } = req.query as Record<string, string>;

    if (error) {
      return res.redirect(
        `${env.CLIENT_URL}/auth/error?error=${encodeURIComponent(error)}`
      ) as any;
    }

    if (!state || !validateOAuthState(state)) {
      throw AppError.badRequest('Invalid OAuth state');
    }

    if (!code) throw AppError.badRequest('Authorization code missing');

    const profile = await exchangeGoogleCode(code);
    const result = await authService.handleOAuthLogin(
      profile,
      getSessionMeta(req)
    );

    // Redirect to client with tokens in query params (or use a short-lived code)
    const params = new URLSearchParams({
      accessToken: result.tokens.accessToken,
      refreshToken: result.tokens.refreshToken,
    });
    res.redirect(`${env.CLIENT_URL}/auth/callback?${params.toString()}`);
  } catch (err) {
    next(err);
  }
}

// ── OAuth: GitHub ─────────────────────────────────────────────────────────────

export function githubRedirect(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    const state = generateOAuthState();
    res.redirect(getGitHubAuthUrl(state));
  } catch (err) {
    next(err);
  }
}

export async function githubCallback(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { code, state, error } = req.query as Record<string, string>;

    if (error) {
      return res.redirect(
        `${env.CLIENT_URL}/auth/error?error=${encodeURIComponent(error)}`
      ) as any;
    }

    if (!state || !validateOAuthState(state)) {
      throw AppError.badRequest('Invalid OAuth state');
    }

    if (!code) throw AppError.badRequest('Authorization code missing');

    const profile = await exchangeGitHubCode(code);
    const result = await authService.handleOAuthLogin(
      profile,
      getSessionMeta(req)
    );

    const params = new URLSearchParams({
      accessToken: result.tokens.accessToken,
      refreshToken: result.tokens.refreshToken,
    });
    res.redirect(`${env.CLIENT_URL}/auth/callback?${params.toString()}`);
  } catch (err) {
    next(err);
  }
}
