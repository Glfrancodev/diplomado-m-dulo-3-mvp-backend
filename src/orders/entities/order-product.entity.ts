import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { decimalTransformer } from '../../common/transformers/decimal.transformer';
import { Product } from '../../products/entities/product.entity';
import { Order } from './order.entity';

@Entity('order_products')
export class OrderProduct {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  orderId: string;

  @ManyToOne(() => Order, (order) => order.items, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'orderId' })
  order: Order;

  @Column({ type: 'uuid' })
  productId: string;

  @ManyToOne(() => Product, { nullable: false })
  @JoinColumn({ name: 'productId' })
  product: Product;

  @Column({ type: 'int' })
  amount: number;

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: decimalTransformer,
  })
  unitPrice: number;

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: decimalTransformer,
  })
  subTotal: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
