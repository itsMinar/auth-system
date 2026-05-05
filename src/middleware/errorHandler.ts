import { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import { AppError } from '../utils/errors';
import logger from '../utils/logger';
import { errorResponse } from '../utils/response';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  // Known application errors
  if (err instanceof AppError) {
    errorResponse(res, err.statusCode, err.code, err.message, err.details);
    return;
  }

  // Log unexpected errors
  logger.error('Unhandled error:', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  // Don't leak internals in production
  const message =
    env.NODE_ENV === 'production'
      ? 'An unexpected error occurred'
      : err.message;

  errorResponse(res, 500, 'INTERNAL_ERROR', message);
}

export function notFoundHandler(req: Request, res: Response): void {
  errorResponse(
    res,
    404,
    'NOT_FOUND',
    `Route ${req.method} ${req.path} not found`
  );
}
