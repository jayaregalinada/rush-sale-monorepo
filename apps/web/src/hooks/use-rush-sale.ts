import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api/api';
import { SALE_ID } from '../constants/sale-id';
import type { Outcome } from '../types/outcome';
import type { SaleStatus } from '../types/sale-status';

const STATUS_POLL_MS = 1000;
const EMPTY_STOCK = 0;

/**
 * Groups all Rush Sale state — buyer identity, live status polling, the purchase mutation
 * and the resulting outcome — plus the reason a purchase is currently unavailable, so the
 * component is left as pure composition/markup.
 */
export function useRushSale() {
  const [userId, setUserId] = useState('');
  const [lastOutcome, setLastOutcome] = useState<Outcome | null>(null);

  const status = useQuery({
    queryKey: ['status', SALE_ID],
    queryFn: () => api.getStatus(SALE_ID),
    refetchInterval: STATUS_POLL_MS,
  });

  const buy = useMutation({
    mutationFn: () => api.purchase(SALE_ID, userId.trim()),
    onSuccess: (result) => {
      setLastOutcome(result.outcome);
      void status.refetch();
    },
  });

  const sale = status.data;
  const identifier = userId.trim();
  const buyDisabledReason = _reasonPurchaseUnavailable(sale, identifier, buy.isPending);
  const canBuy = buyDisabledReason === null;

  return {
    sale,
    userId,
    setUserId,
    lastOutcome,
    canBuy,
    buyDisabledReason,
    isLoading: status.isLoading,
    isBuying: buy.isPending,
    buy: () => buy.mutate(),
  };
}

/** Null means "go ahead"; any string is buyer-facing copy for why the button is locked. */
function _reasonPurchaseUnavailable(
  sale: SaleStatus | undefined,
  identifier: string,
  isBuying: boolean,
): string | null {
  if (isBuying) {
    return 'Securing your reservation…';
  }

  if (!sale) {
    return 'Loading sale…';
  }

  if (identifier.length === EMPTY_STOCK) {
    return 'Enter an identifier to buy.';
  }

  if (sale.status === 'UPCOMING') {
    return "The sale hasn't started yet.";
  }

  if (sale.status === 'ENDED') {
    return 'This sale has ended.';
  }

  if ((sale.remaining ?? EMPTY_STOCK) <= EMPTY_STOCK) {
    return 'Sold out.';
  }

  return null;
}
