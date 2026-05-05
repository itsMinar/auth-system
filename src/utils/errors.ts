export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INVALID_CREDENTIALS'
  | 'INVALID_TOKEN'
  | 'TOKEN_EXPIRED'
  | 'EMAIL_NOT_VERIFIED'
  | 'ACCOUNT_DISABLED'
  | 'OAUTH_ERROR'
  | 'EMAIL_SEND_FAILED'
  | 'INTERNAL_ERROR';

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly message: string,
    public readonly statusCode: number,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message: string, details?: unknown) {
    return new AppError('VALIDATION_ERROR', message, 400, details);
  }

  static unauthorized(message = 'Unauthorized') {
    return new AppError('UNAUTHORIZED', message, 401);
  }

  static forbidden(message = 'Forbidden') {
    return new AppError('FORBIDDEN', message, 403);
  }

  static notFound(message = 'Not found') {
    return new AppError('NOT_FOUND', message, 404);
  }

  static conflict(message: string) {
    return new AppError('CONFLICT', message, 409);
  }

  static invalidCredentials() {
    return new AppError(
      'INVALID_CREDENTIALS',
      'Invalid email or password',
      401
    );
  }

  static invalidToken(message = 'Invalid or expired token') {
    return new AppError('INVALID_TOKEN', message, 401);
  }

  static emailNotVerified() {
    return new AppError(
      'EMAIL_NOT_VERIFIED',
      'Please verify your email address before signing in',
      403
    );
  }

  static accountDisabled() {
    return new AppError(
      'ACCOUNT_DISABLED',
      'Your account has been disabled',
      403
    );
  }

  static internal(message = 'Internal server error') {
    return new AppError('INTERNAL_ERROR', message, 500);
  }
}
