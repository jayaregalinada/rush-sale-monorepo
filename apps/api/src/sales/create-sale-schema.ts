import { z } from 'zod';

export const createSaleSchema = z
  .object({
    id: z.string().min(1).max(64),
    product: z.string().min(1),
    // Product image URL; omit for an image-less sale.
    imageUrl: z.string().url().optional(),
    initialStock: z.number().int().positive(),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
  })
  .refine((sale) => sale.endsAt > sale.startsAt, {
    message: 'endsAt must be after startsAt',
    path: ['endsAt'],
  });
