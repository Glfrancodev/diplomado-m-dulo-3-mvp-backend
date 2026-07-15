import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { OrderStatus } from '../../common/enums/order-status.enum';
import { decimalTransformer } from '../../common/transformers/decimal.transformer';
import { Customer } from '../../customers/entities/customer.entity';
import { OrderProduct } from './order-product.entity';

@Entity('orders')
@Index(['createdAt'])
@Index(['status'])
@Index(['customerId'])
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  customerId: string;

  @ManyToOne(() => Customer, (customer) => customer.orders, { nullable: false })
  @JoinColumn({ name: 'customerId' })
  customer: Customer;

  @Column({
    type: 'enum',
    enum: OrderStatus,
    default: OrderStatus.PENDING,
  })
  status: OrderStatus;

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: decimalTransformer,
  })
  total: number;

  @OneToMany(() => OrderProduct, (item) => item.order, {
    cascade: true,
    eager: false,
  })
  items: OrderProduct[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
