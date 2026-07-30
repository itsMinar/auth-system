import { z } from 'zod';

export const updateProfileSchema = z.object({
  body: z.object({
    name: z.string().min(2).max(100).trim().optional(),
    avatarUrl: z.string().url().optional().nullable(),
  }),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>['body'];
