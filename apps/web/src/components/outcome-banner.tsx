import { OUTCOME_MESSAGES } from '../constants/outcome-messages';
import { OUTCOME_TONE } from '../constants/outcome-tone';
import type { Outcome } from '../types/outcome';

interface OutcomeBannerProps {
  outcome: Outcome;
}

/** Colour-coded banner translating the last purchase outcome into buyer-facing copy. */
export function OutcomeBanner({ outcome }: OutcomeBannerProps) {
  return (
    <p className={`banner banner--${OUTCOME_TONE[outcome]}`} role="status">
      {OUTCOME_MESSAGES[outcome]}
    </p>
  );
}
