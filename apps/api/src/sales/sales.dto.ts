import { z } from 'zod';

export const createSaleSchema = z
  .object({
    id: z.string().min(1).max(64),
    product: z.string().min(1),
    initialStock: z.number().int().positive(),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
  })
  .refine((s) => s.endsAt > s.startsAt, {
    message: 'endsAt must be after startsAt',
    path: ['endsAt'],
  });

export type CreateSaleDto = z.infer<typeof createSaleSchema>;
