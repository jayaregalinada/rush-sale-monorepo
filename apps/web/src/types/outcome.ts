/** Purchase outcome discriminator (mirrors the API). */
export type Outcome =
  | 'SUCCESS'
  | 'ALREADY_PURCHASED'
  | 'SOLD_OUT'
  | 'NOT_ACTIVE_UPCOMING'
  | 'NOT_ACTIVE_ENDED'
  | 'NOT_READY';
