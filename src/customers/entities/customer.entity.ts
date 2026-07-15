import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Order } from '../../orders/entities/order.entity';

@Entity('customers')
@Index(['createdAt'])
@Index(['isActive'])
export class Customer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 150 })
  fullName: string;

  @Column({ type: 'varchar', length: 180, unique: true })
  email: string;

  @Column({ type: 'varchar', length: 30, nullable: true })
  phone: string | null;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @OneToMany(() => Order, (order) => order.customer)
  orders: Order[];
}
