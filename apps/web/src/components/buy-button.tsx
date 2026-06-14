interface BuyButtonProps {
  disabled: boolean;
  isBuying: boolean;
  reason: string | null;
  onClick: () => void;
}

/** Primary call-to-action plus the reason it is unavailable, when it is. */
export function BuyButton({ disabled, isBuying, reason, onClick }: BuyButtonProps) {
  return (
    <div className="buy">
      <button className="buy__button" type="button" disabled={disabled} onClick={onClick}>
        {isBuying ? 'Securing…' : 'Buy now'}
      </button>
      {disabled && reason && <span className="buy__reason">{reason}</span>}
    </div>
  );
}
