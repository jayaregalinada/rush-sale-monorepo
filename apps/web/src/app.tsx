import { BuyButton } from './components/buy-button';
import { BuyerField } from './components/buyer-field';
import { Countdown } from './components/countdown';
import { OutcomeBanner } from './components/outcome-banner';
import { StatusBadge } from './components/status-badge';
import { StockMeter } from './components/stock-meter';
import { useRushSale } from './hooks/use-rush-sale';

export function App() {
  const {
    sale,
    userId,
    setUserId,
    lastOutcome,
    canBuy,
    buyDisabledReason,
    isLoading,
    isBuying,
    buy,
  } = useRushSale();

  return (
    <main className="page">
      <section className="card">
        <header className="card__header">
          <p className="card__eyebrow">Rush Sale</p>
          {sale && <StatusBadge status={sale.status} />}
        </header>

        {isLoading && <p className="card__loading">Loading sale…</p>}

        {sale && (
          <>
            <h1 className="card__title">{sale.product}</h1>

            {sale.status === 'UPCOMING' && (
              <Countdown label="Starts in" targetIso={sale.startsAt} />
            )}
            {sale.status === 'ACTIVE' && <Countdown label="Ends in" targetIso={sale.endsAt} />}

            <StockMeter initialStock={sale.initialStock} remaining={sale.remaining} />

            <BuyerField value={userId} disabled={isBuying} onChange={setUserId} />

            <BuyButton
              disabled={!canBuy}
              isBuying={isBuying}
              reason={buyDisabledReason}
              onClick={buy}
            />

            {lastOutcome && <OutcomeBanner outcome={lastOutcome} />}
          </>
        )}
      </section>
    </main>
  );
}
