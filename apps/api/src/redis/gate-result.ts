import type { GateCode } from './gate-code';

/** Parsed outcome of a Gate reservation attempt. */
export interface GateResult {
  code: GateCode;
  remaining?: number;
  reservationId?: string;
}
