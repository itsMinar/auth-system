import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { validate } from '../../middleware/validate';
import { AuthenticatedRequest } from '../../types';
import * as controller from './auth.controller';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  refreshTokenSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from './auth.schemas';

const router = Router();

// ── Public Routes ──────────────────────────────────────────────────────────────

// Email/Password auth
router.post('/register', validate(registerSchema), controller.register);
router.post('/login', validate(loginSchema), controller.login);
router.post('/refresh', validate(refreshTokenSchema), controller.refreshToken);
router.post('/logout', controller.logout);

// Email verification
router.get(
  '/verify-email',
  validate(verifyEmailSchema),
  controller.verifyEmail
);

// Password reset
router.post(
  '/forgot-password',
  validate(forgotPasswordSchema),
  controller.forgotPassword
);
router.post(
  '/reset-password',
  validate(resetPasswordSchema),
  controller.resetPassword
);

// OAuth: Google
router.get('/oauth/google', controller.googleRedirect);
router.get('/oauth/google/callback', controller.googleCallback);

// OAuth: GitHub
router.get('/oauth/github', controller.githubRedirect);
router.get('/oauth/github/callback', controller.githubCallback);

// ── Authenticated Routes ───────────────────────────────────────────────────────

router.post('/logout-all', authenticate, (req, res, next) =>
  controller.logoutAll(req as AuthenticatedRequest, res, next)
);

router.post('/resend-verification', authenticate, (req, res, next) =>
  controller.resendVerification(req as AuthenticatedRequest, res, next)
);

router.put(
  '/change-password',
  authenticate,
  validate(changePasswordSchema),
  (req, res, next) =>
    controller.changePassword(req as AuthenticatedRequest, res, next)
);

// Sessions management
router.get('/sessions', authenticate, (req, res, next) =>
  controller.getSessions(req as AuthenticatedRequest, res, next)
);

router.delete('/sessions/:sessionId', authenticate, (req, res, next) =>
  controller.revokeSession(req as AuthenticatedRequest, res, next)
);

export default router;
