/**
 * Result codes returned by the Gate Lua script. Single source of truth: the Lua is built
 * by interpolating these (see gate-lua.ts) and the service switches on them, so the script
 * and the TypeScript can never drift apart.
 */
export const GateCode = {
  SUCCESS: 'SUCCESS',
  ALREADY_PURCHASED: 'ALREADY_PURCHASED',
  SOLD_OUT: 'SOLD_OUT',
  NOT_READY: 'NOT_READY',
} as const;

export type GateCode = (typeof GateCode)[keyof typeof GateCode];
