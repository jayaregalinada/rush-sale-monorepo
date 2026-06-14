import { useNow } from '../hooks/use-now';
import { formatCountdown } from '../lib/format-countdown';

interface CountdownProps {
  label: string;
  targetIso: string;
}

/** Live `label 02h 04m 05s` line that ticks down to an ISO target each second. */
export function Countdown({ label, targetIso }: CountdownProps) {
  const now = useNow();
  const remaining = new Date(targetIso).getTime() - now;

  return (
    <p className="countdown">
      <span className="countdown__label">{label}</span>
      <span className="countdown__value">{formatCountdown(remaining)}</span>
    </p>
  );
}
