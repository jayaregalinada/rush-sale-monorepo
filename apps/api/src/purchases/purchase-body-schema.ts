import { z } from 'zod';

/** Request body for a purchase attempt. No auth in this exercise → identity is `userId`. */
export const purchaseBodySchema = z.object({ userId: z.string().min(1).max(128) });
