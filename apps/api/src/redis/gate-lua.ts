import { GateCode } from './gate-code';

/**
 * The Gate. One indivisible operation; Redis is single-threaded so Oversell and
 * double-buys are structurally impossible — there is no race window (ADR-0001).
 *
 *   KEYS[1] = stock counter   KEYS[2] = buyers SET   KEYS[3] = reservation stream
 *   ARGV[1] = buyerId         ARGV[2] = saleId
 *
 * Returns a flat array whose first element is a `GateCode`:
 *   { NOT_READY }                        stock key absent → not seeded yet (≠ sold out)
 *   { ALREADY_PURCHASED }                buyer already holds a reservation
 *   { SOLD_OUT, 0 }                      stock exhausted
 *   { SUCCESS, <remaining>, <streamId> } reservation created + enqueued
 *
 * Codes are interpolated from `GateCode` so the script and the TypeScript stay in lockstep.
 */
export const GATE_LUA = `
if redis.call('EXISTS', KEYS[1]) == 0 then
  return { '${GateCode.NOT_READY}' }
end

if redis.call('SISMEMBER', KEYS[2], ARGV[1]) == 1 then
  return { '${GateCode.ALREADY_PURCHASED}' }
end

local stock = tonumber(redis.call('GET', KEYS[1]))
if stock <= 0 then
  return { '${GateCode.SOLD_OUT}', 0 }
end

local remaining = redis.call('DECR', KEYS[1])
redis.call('SADD', KEYS[2], ARGV[1])
local streamId = redis.call('XADD', KEYS[3], '*', 'saleId', ARGV[2], 'buyerId', ARGV[1])
return { '${GateCode.SUCCESS}', remaining, streamId }
`;
