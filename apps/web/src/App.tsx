import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { getStatus, purchase, type Outcome } from './api';

const SALE_ID = import.meta.env.VITE_SALE_ID ?? 'launch-2026';

const MESSAGES: Record<Outcome, string> = {
  SUCCESS: '🎉 Secured! The item is yours.',
  ALREADY_PURCHASED: 'You already secured one — only one per buyer.',
  SOLD_OUT: 'Sold out. Better luck next drop.',
  NOT_ACTIVE_UPCOMING: 'Not started yet. Hang tight.',
  NOT_ACTIVE_ENDED: 'This sale has ended.',
  NOT_READY: 'Warming up — try again in a moment.',
};

export function App() {
  // Random per-tab buyer id (no auth in this exercise).
  const userId = useMemo(() => `user-${Math.random().toString(36).slice(2, 10)}`, []);
  const [msg, setMsg] = useState<string | null>(null);

  const status = useQuery({
    queryKey: ['status', SALE_ID],
    queryFn: () => getStatus(SALE_ID),
    refetchInterval: 1000,
  });

  const buy = useMutation({
    mutationFn: () => purchase(SALE_ID, userId),
    onSuccess: (r) => {
      setMsg(MESSAGES[r.outcome]);
      void status.refetch();
    },
  });

  const s = status.data;
  const canBuy = s?.status === 'ACTIVE' && (s?.remaining ?? 0) > 0 && !buy.isPending;

  return (
    <main style={{ fontFamily: 'system-ui', maxWidth: 480, margin: '4rem auto', padding: 16 }}>
      <h1>Rush Sale</h1>
      {status.isLoading && <p>Loading…</p>}
      {s && (
        <>
          <h2>{s.product}</h2>
          <p>
            Status: <strong>{s.status}</strong>
          </p>
          <p>
            Remaining: <strong>{s.remaining ?? '—'}</strong>
          </p>
          <p style={{ color: '#888', fontSize: 12 }}>buyer: {userId}</p>
          <button onClick={() => buy.mutate()} disabled={!canBuy} style={{ padding: '8px 16px' }}>
            {buy.isPending ? 'Buying…' : 'Buy now'}
          </button>
          {msg && <p style={{ marginTop: 16 }}>{msg}</p>}
        </>
      )}
    </main>
  );
}
