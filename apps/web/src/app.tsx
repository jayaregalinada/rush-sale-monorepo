import { useRushSale } from './hooks/use-rush-sale';

export function App() {
  const { sale, userId, message, canBuy, isLoading, isBuying, buy } = useRushSale();

  return (
    <main style={{ fontFamily: 'system-ui', maxWidth: 480, margin: '4rem auto', padding: 16 }}>
      <h1>Rush Sale</h1>
      {isLoading && <p>Loading…</p>}
      {sale && (
        <>
          <h2>{sale.product}</h2>
          <p>
            Status: <strong>{sale.status}</strong>
          </p>
          <p>
            Remaining: <strong>{sale.remaining ?? '—'}</strong>
          </p>
          <p style={{ color: '#888', fontSize: 12 }}>buyer: {userId}</p>
          <button onClick={buy} disabled={!canBuy} style={{ padding: '8px 16px' }}>
            {isBuying ? 'Buying…' : 'Buy now'}
          </button>
          {message && <p style={{ marginTop: 16 }}>{message}</p>}
        </>
      )}
    </main>
  );
}
