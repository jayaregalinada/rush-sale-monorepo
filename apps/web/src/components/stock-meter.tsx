const FULL_PERCENT = 100;
const EMPTY_STOCK = 0;

interface StockMeterProps {
  initialStock: number;
  remaining: number | null;
}

/** Horizontal bar plus counts showing live stock against the sale's initial allocation. */
export function StockMeter({ initialStock, remaining }: StockMeterProps) {
  const isKnown = remaining !== null;
  const left = remaining ?? EMPTY_STOCK;
  const fillPercent =
    initialStock > EMPTY_STOCK ? (left / initialStock) * FULL_PERCENT : EMPTY_STOCK;
  const isSoldOut = isKnown && left === EMPTY_STOCK;

  return (
    <div className="meter">
      <div className="meter__track">
        <div
          className={`meter__fill ${isSoldOut ? 'meter__fill--empty' : ''}`}
          style={{ width: `${fillPercent}%` }}
        />
      </div>
      <p className="meter__counts">
        <strong className="meter__remaining">{isKnown ? left : '—'}</strong>
        <span className="meter__total">of {initialStock} left</span>
      </p>
    </div>
  );
}
