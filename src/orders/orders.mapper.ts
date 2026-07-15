import { OrderStatus } from '../common/enums/order-status.enum';
import { OrderProduct } from './entities/order-product.entity';
import { Order } from './entities/order.entity';

export interface OrderItemResponse {
  id: string;
  productId: string;
  amount: number;
  unitPrice: number;
  subTotal: number;
}

export interface OrderSummaryResponse {
  id: string;
  customerId: string;
  status: OrderStatus;
  total: number;
  createdAt: Date;
}

export interface OrderDetailResponse extends OrderSummaryResponse {
  items: OrderItemResponse[];
}

/** Pedido sin líneas (listados). */
export function toOrderSummary(order: Order): OrderSummaryResponse {
  return {
    id: order.id,
    customerId: order.customerId,
    status: order.status,
    total: order.total,
    createdAt: order.createdAt,
  };
}

/** Pedido completo con líneas (crear, detalle). */
export function toOrderDetail(order: Order): OrderDetailResponse {
  return {
    ...toOrderSummary(order),
    items: (order.items ?? []).map(toOrderItem),
  };
}

function toOrderItem(item: OrderProduct): OrderItemResponse {
  return {
    id: item.id,
    productId: item.productId,
    amount: item.amount,
    unitPrice: item.unitPrice,
    subTotal: item.subTotal,
  };
}
