import { Global, Module } from '@nestjs/common';
import Redis from 'ioredis';
import { loadEnv } from '../config/env';
import { GATE_LUA } from './gate.lua';

export const REDIS = Symbol('REDIS');

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

function createRedis(): GateRedis {
  const client = new Redis(loadEnv().REDIS_URL, {
    maxRetriesPerRequest: null, // keep retrying through a blip rather than failing the buyer
    enableReadyCheck: true,
  }) as GateRedis;

  // 3 KEYS, rest ARGV. defineCommand handles SCRIPT LOAD + EVALSHA transparently.
  client.defineCommand('rushGate', { numberOfKeys: 3, lua: GATE_LUA });
  return client;
}

@Global()
@Module({
  providers: [{ provide: REDIS, useFactory: createRedis }],
  exports: [REDIS],
})
export class RedisModule {}
