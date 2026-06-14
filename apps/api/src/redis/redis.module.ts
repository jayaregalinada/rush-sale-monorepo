import { Global, Module } from '@nestjs/common';
import Redis from 'ioredis';
import { loadEnv } from '../config/load-env';
import { Gate } from './gate';
import { GATE_LUA } from './gate-lua';
import type { GateRedis } from './gate-redis';
import { REDIS } from './redis';

/** The Gate Lua script binds three KEYS (stock, buyers, stream); the rest are ARGV. */
const GATE_KEY_COUNT = 3;

function createRedis(): GateRedis {
  const client = new Redis(loadEnv().REDIS_URL, {
    maxRetriesPerRequest: null, // keep retrying through a blip rather than failing the buyer
    enableReadyCheck: true,
  }) as GateRedis;

  // defineCommand handles SCRIPT LOAD + EVALSHA transparently.
  client.defineCommand('rushGate', { numberOfKeys: GATE_KEY_COUNT, lua: GATE_LUA });

  return client;
}

@Global()
@Module({
  providers: [{ provide: REDIS, useFactory: createRedis }, Gate],
  exports: [REDIS, Gate],
})
export class RedisModule {}
