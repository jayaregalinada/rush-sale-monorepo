import type { z } from 'zod';
import type { createSaleSchema } from './create-sale-schema';

export type CreateSaleDto = z.infer<typeof createSaleSchema>;
