import type { BannerTone } from '../types/banner-tone';
import type { Outcome } from '../types/outcome';

/** Maps each purchase outcome to the banner tone that frames it for the buyer. */
export const OUTCOME_TONE: Record<Outcome, BannerTone> = {
  SUCCESS: 'success',
  ALREADY_PURCHASED: 'info',
  SOLD_OUT: 'error',
  NOT_ACTIVE_UPCOMING: 'info',
  NOT_ACTIVE_ENDED: 'warning',
  NOT_READY: 'warning',
};
