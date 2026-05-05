import { Router, Response, NextFunction, Request } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db";
import { users } from "../../db/schema";
import { authenticate } from "../../middleware/authenticate";
import { validate } from "../../middleware/validate";
import { success } from "../../utils/response";
import { AppError } from "../../utils/errors";
import { AuthenticatedRequest } from "../../types";

const router = Router();

// All user routes require authentication
router.use(authenticate);

const updateProfileSchema = z.object({
  body: z.object({
    name: z.string().min(2).max(100).trim().optional(),
    avatarUrl: z.string().url().optional().nullable(),
  }),
});

// GET /api/users/me
router.get("/me", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const user = await db.query.users.findFirst({
      where: eq(users.id, authReq.user.id),
      columns: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        emailVerified: true,
        createdAt: true,
        updatedAt: true,
        lastLoginAt: true,
      },
      with: {
        oauthAccounts: {
          columns: { provider: true, createdAt: true },
        },
      },
    });

    if (!user) throw AppError.notFound("User not found");

    success(res, { user });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/users/me
router.patch(
  "/me",
  validate(updateProfileSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const { name, avatarUrl } = req.body;

      const [updated] = await db
        .update(users)
        .set({
          ...(name !== undefined && { name }),
          ...(avatarUrl !== undefined && { avatarUrl }),
          updatedAt: new Date(),
        })
        .where(eq(users.id, authReq.user.id))
        .returning({
          id: users.id,
          email: users.email,
          name: users.name,
          avatarUrl: users.avatarUrl,
          emailVerified: users.emailVerified,
          updatedAt: users.updatedAt,
        });

      success(res, { user: updated });
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /api/users/me
router.delete("/me", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authReq = req as AuthenticatedRequest;
    await db.update(users).set({ isActive: false }).where(eq(users.id, authReq.user.id));
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
