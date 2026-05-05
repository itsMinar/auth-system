import { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../utils/jwt";
import { AppError } from "../utils/errors";
import { AuthenticatedRequest } from "../types";
import { db } from "../db";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";

export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      throw AppError.unauthorized("Authorization header missing or malformed");
    }

    const token = authHeader.slice(7);
    const payload = verifyAccessToken(token);

    // Lightweight DB check to ensure user still exists and is active
    const user = await db.query.users.findFirst({
      where: eq(users.id, payload.sub),
      columns: {
        id: true,
        email: true,
        name: true,
        emailVerified: true,
        isActive: true,
      },
    });

    if (!user) throw AppError.unauthorized("User no longer exists");
    if (!user.isActive) throw AppError.accountDisabled();

    (req as AuthenticatedRequest).user = {
      id: user.id,
      email: user.email,
      name: user.name,
      emailVerified: user.emailVerified,
    };

    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Require email to be verified.
 * Must be used AFTER authenticate middleware.
 */
export function requireVerifiedEmail(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authReq = req as AuthenticatedRequest;
  if (!authReq.user.emailVerified) {
    next(AppError.emailNotVerified());
    return;
  }
  next();
}
