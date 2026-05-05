import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import {
  apiLimiter,
  authLimiter,
  refreshLimiter,
} from './middleware/rateLimiter';
import authRouter from './modules/auth/auth.router';
import usersRouter from './modules/users/users.router';
import logger from './utils/logger';

export function createApp() {
  const app = express();

  // ── Security Headers ─────────────────────────────────────────────────────────
  app.use(helmet());
  app.set('trust proxy', 1);

  // ── CORS ─────────────────────────────────────────────────────────────────────
  app.use(
    cors({
      origin: env.CLIENT_URL,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    })
  );

  // ── Body Parsing ──────────────────────────────────────────────────────────────
  app.use(express.json({ limit: '10kb' }));
  app.use(express.urlencoded({ extended: true, limit: '10kb' }));
  app.use(cookieParser());

  // ── Request logging middleware ───────────────────────────────────────────────
  app.use((req, _res, next) => {
    logger.info(
      `${req.method} - ${req.url} - ${req.ip} - ${req.get('user-agent')}`
    );
    next();
  });

  // ── Health Check ──────────────────────────────────────────────────────────────
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // ── API Rate Limiting ─────────────────────────────────────────────────────────
  app.use('/api', apiLimiter);
  app.use('/api/auth/login', authLimiter);
  app.use('/api/auth/register', authLimiter);
  app.use('/api/auth/forgot-password', authLimiter);
  app.use('/api/auth/reset-password', authLimiter);
  app.use('/api/auth/refresh', refreshLimiter);

  // ── Routes ────────────────────────────────────────────────────────────────────
  app.use('/api/auth', authRouter);
  app.use('/api/users', usersRouter);

  // ── 404 & Error Handling ──────────────────────────────────────────────────────
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
