import type { BannerTone } from '../types/banner-tone';
import type { SaleStatus } from '../types/sale-status';

/** Maps a sale's lifecycle status to the tone its badge is painted with. */
export const STATUS_TONE: Record<SaleStatus['status'], BannerTone> = {
  UPCOMING: 'info',
  ACTIVE: 'success',
  ENDED: 'warning',
};
