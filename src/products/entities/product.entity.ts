import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { decimalTransformer } from '../../common/transformers/decimal.transformer';

@Entity('products')
@Index(['createdAt'])
@Index(['isActive'])
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 150 })
  name: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description: string | null;

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: decimalTransformer,
  })
  price: number;

  @Column({ type: 'int' })
  stock: number;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
