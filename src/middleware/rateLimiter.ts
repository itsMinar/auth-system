import { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env';
import { errorResponse } from '../utils/response';

function rateLimitHandler(req: Request, res: Response) {
  errorResponse(
    res,
    429,
    'RATE_LIMITED',
    'Too many requests, please try again later'
  );
}

/**
 * General API rate limiter
 */
export const apiLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

/**
 * Strict limiter for auth endpoints (login, register, password reset)
 */
export const authLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.AUTH_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
  // Use IP + email for login attempts to prevent targeted attacks
  keyGenerator: (req) => {
    const ip =
      (Array.isArray(req.headers['x-forwarded-for'])
        ? req.headers['x-forwarded-for'][0]
        : req.headers['x-forwarded-for']
      )
        ?.split(',')[0]
        .trim() ??
      req.socket.remoteAddress ??
      'unknown';
    const email = req.body?.email ?? '';
    return `${ip}:${email}`;
  },
});

/**
 * Light limiter for token refresh
 */
export const refreshLimiter = rateLimit({
  windowMs: 60_000, // 1 minute
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});
