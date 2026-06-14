const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;

/**
 * Renders a millisecond span as a compact `2d 03h 04m 05s` countdown, dropping
 * leading units that are zero so short spans stay readable. Negative spans clamp
 * to zero — the caller decides what "elapsed" means.
 */
export function formatCountdown(milliseconds: number): string {
  const clamped = Math.max(0, milliseconds);
  const totalSeconds = Math.floor(clamped / MS_PER_SECOND);
  const seconds = totalSeconds % SECONDS_PER_MINUTE;
  const minutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE) % MINUTES_PER_HOUR;
  const hours = Math.floor(totalSeconds / (SECONDS_PER_MINUTE * MINUTES_PER_HOUR)) % HOURS_PER_DAY;
  const days = Math.floor(totalSeconds / (SECONDS_PER_MINUTE * MINUTES_PER_HOUR * HOURS_PER_DAY));

  const parts = [
    { value: days, suffix: 'd' },
    { value: hours, suffix: 'h' },
    { value: minutes, suffix: 'm' },
    { value: seconds, suffix: 's' },
  ];
  const firstSignificant = parts.findIndex((part) => part.value > 0);
  const visible = firstSignificant === -1 ? parts.slice(-1) : parts.slice(firstSignificant);

  return visible.map((part) => `${String(part.value).padStart(2, '0')}${part.suffix}`).join(' ');
}
