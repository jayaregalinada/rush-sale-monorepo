import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '../api/api';
import { SALE_ID } from '../constants/sale-id';
import { OUTCOME_MESSAGES } from '../constants/outcome-messages';

const STATUS_POLL_MS = 1000;

/**
 * Groups all Rush Sale state — buyer identity, live status polling, the purchase mutation
 * and the resulting message — so the component is left as pure composition/markup.
 */
export function useRushSale() {
  // Random per-tab buyer id (no auth in this exercise).
  const userId = useMemo(() => `user-${Math.random().toString(36).slice(2, 10)}`, []);
  const [message, setMessage] = useState<string | null>(null);

  const status = useQuery({
    queryKey: ['status', SALE_ID],
    queryFn: () => api.getStatus(SALE_ID),
    refetchInterval: STATUS_POLL_MS,
  });

  const buy = useMutation({
    mutationFn: () => api.purchase(SALE_ID, userId),
    onSuccess: (result) => {
      setMessage(OUTCOME_MESSAGES[result.outcome]);
      void status.refetch();
    },
  });

  const sale = status.data;
  const canBuy = sale?.status === 'ACTIVE' && (sale?.remaining ?? 0) > 0 && !buy.isPending;

  return {
    sale,
    userId,
    message,
    canBuy,
    isLoading: status.isLoading,
    isBuying: buy.isPending,
    buy: () => buy.mutate(),
  };
}
