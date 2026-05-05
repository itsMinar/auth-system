import { Response } from 'express';
import { ApiError, ApiSuccess } from '../types';

export function success<T>(
  res: Response,
  data: T,
  options: { message?: string; statusCode?: number } = {}
): Response {
  const { message, statusCode = 200 } = options;
  const body: ApiSuccess<T> = {
    success: true,
    data,
    ...(message && { message }),
  };
  return res.status(statusCode).json(body);
}

export function created<T>(res: Response, data: T, message?: string): Response {
  return success(res, data, { statusCode: 201, message });
}

export function noContent(res: Response): Response {
  return res.status(204).send();
}

export function errorResponse(
  res: Response,
  statusCode: number,
  code: string,
  message: string,
  details?: unknown
): Response {
  const body: ApiError = {
    success: false,
    error: { code, message, ...(details !== undefined && { details }) },
  };
  return res.status(statusCode).json(body);
}
