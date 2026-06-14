/** Canonical Redis key layout for a sale. One place so the Gate, seeder and worker agree. */
export const saleKeys = (saleId: string) => ({
  stock: `sale:${saleId}:stock`,
  buyers: `sale:${saleId}:buyers`,
  stream: `sale:${saleId}:reservations`,
  initLock: `sale:${saleId}:init-lock`,
});
