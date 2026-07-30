import { eq } from 'drizzle-orm';
import { db } from '../../db';
import { users } from '../../db/schema';
import { AppError } from '../../utils/errors';

export async function getProfile(userId: string) {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
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

  if (!user) throw AppError.notFound('User not found');

  return user;
}

export async function updateProfile(
  userId: string,
  data: { name?: string; avatarUrl?: string | null }
) {
  const [updated] = await db
    .update(users)
    .set({
      ...(data.name !== undefined && { name: data.name }),
      ...(data.avatarUrl !== undefined && { avatarUrl: data.avatarUrl }),
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))
    .returning({
      id: users.id,
      email: users.email,
      name: users.name,
      avatarUrl: users.avatarUrl,
      emailVerified: users.emailVerified,
      updatedAt: users.updatedAt,
    });

  return updated;
}

export async function deactivateAccount(userId: string) {
  await db.update(users).set({ isActive: false }).where(eq(users.id, userId));
}
