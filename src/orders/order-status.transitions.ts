import { OrderStatus } from '../common/enums/order-status.enum';

/** Transiciones de estado permitidas para un pedido. */
export const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.PENDING]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  [OrderStatus.CONFIRMED]: [OrderStatus.DELIVERED, OrderStatus.CANCELLED],
  [OrderStatus.DELIVERED]: [],
  [OrderStatus.CANCELLED]: [],
};

export function isTransitionAllowed(
  from: OrderStatus,
  to: OrderStatus,
): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}
