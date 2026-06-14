import { STATUS_LABEL } from '../constants/status-label';
import { STATUS_TONE } from '../constants/status-tone';
import type { SaleStatus } from '../types/sale-status';

interface StatusBadgeProps {
  status: SaleStatus['status'];
}

/** Coloured pill announcing the sale's lifecycle status. */
export function StatusBadge({ status }: StatusBadgeProps) {
  return <span className={`badge badge--${STATUS_TONE[status]}`}>{STATUS_LABEL[status]}</span>;
}
