import { NextFunction, Request, Response } from 'express';
import { AuthenticatedRequest } from '../../types';
import { noContent, success } from '../../utils/response';
import * as usersService from './users.service';

export async function getMe(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const user = await usersService.getProfile(authReq.user.id);
    success(res, { user });
  } catch (err) {
    next(err);
  }
}

export async function updateMe(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const { name, avatarUrl } = req.body;
    const user = await usersService.updateProfile(authReq.user.id, {
      name,
      avatarUrl,
    });
    success(res, { user });
  } catch (err) {
    next(err);
  }
}

export async function deleteMe(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    await usersService.deactivateAccount(authReq.user.id);
    noContent(res);
  } catch (err) {
    next(err);
  }
}
