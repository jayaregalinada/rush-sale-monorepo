import type Redis from 'ioredis';

/** ioredis augmented with the Gate registered as a typed custom command (auto EVALSHA). */
export type GateRedis = Redis & {
  rushGate(
    stockKey: string,
    buyersKey: string,
    streamKey: string,
    buyerId: string,
    saleId: string,
  ): Promise<[string, ...(string | number)[]]>;
};
