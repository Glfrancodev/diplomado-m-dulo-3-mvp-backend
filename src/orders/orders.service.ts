import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, FindOptionsWhere, Repository } from 'typeorm';
import { OrderStatus } from '../common/enums/order-status.enum';
import { BusinessRuleException } from '../common/exceptions/business.exception';
import { Customer } from '../customers/entities/customer.entity';
import { Product } from '../products/entities/product.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { FilterOrdersDto } from './dto/filter-orders.dto';
import { OrderProduct } from './entities/order-product.entity';
import { Order } from './entities/order.entity';
import { isTransitionAllowed } from './order-status.transitions';
import {
  OrderDetailResponse,
  OrderSummaryResponse,
  toOrderDetail,
  toOrderSummary,
} from './orders.mapper';

const LIST_LIMIT = 200; // tope defensivo (no es paginación)

@Injectable()
export class OrdersService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Order)
    private readonly ordersRepo: Repository<Order>,
  ) {}

  async create(dto: CreateOrderDto): Promise<OrderDetailResponse> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const manager = queryRunner.manager;

      // 1. Cliente existe y está activo.
      const customer = await manager.findOne(Customer, {
        where: { id: dto.customerId },
      });
      if (!customer || !customer.isActive) {
        throw new BusinessRuleException([
          {
            field: 'customerId',
            message: 'El cliente no existe o está inactivo',
          },
        ]);
      }

      // 2. Validar productos + stock y construir líneas.
      const items: OrderProduct[] = [];
      let total = 0;
      for (const line of dto.items) {
        const product = await manager.findOne(Product, {
          where: { id: line.productId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!product || !product.isActive) {
          throw new BusinessRuleException([
            {
              field: null,
              message: `El producto ${line.productId} no existe o está inactivo`,
            },
          ]);
        }
        if (product.stock < line.amount) {
          throw new BusinessRuleException([
            {
              field: null,
              message: `Stock insuficiente para '${product.name}' (disponible: ${product.stock}, solicitado: ${line.amount})`,
            },
          ]);
        }

        const unitPrice = product.price;
        const subTotal = Number((unitPrice * line.amount).toFixed(2));
        total = Number((total + subTotal).toFixed(2));

        const item = manager.create(OrderProduct, {
          productId: product.id,
          amount: line.amount,
          unitPrice,
          subTotal,
        });
        items.push(item);

        // 3. Descontar stock.
        product.stock -= line.amount;
        await manager.save(product);
      }

      // 4. Crear pedido PENDING con sus líneas.
      const order = manager.create(Order, {
        customerId: customer.id,
        status: OrderStatus.PENDING,
        total,
        items,
      });
      const saved = await manager.save(order);

      await queryRunner.commitTransaction();
      return toOrderDetail(saved);
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async findAll(filter: FilterOrdersDto): Promise<OrderSummaryResponse[]> {
    const where: FindOptionsWhere<Order> = {};
    if (filter.status !== undefined) where.status = filter.status;
    if (filter.customerId !== undefined) where.customerId = filter.customerId;

    const orders = await this.ordersRepo.find({
      where,
      order: { createdAt: 'DESC' },
      take: LIST_LIMIT,
    });
    return orders.map(toOrderSummary);
  }

  async findOne(id: string): Promise<OrderDetailResponse> {
    const order = await this.loadOrderWithItems(id);
    return toOrderDetail(order);
  }

  async updateStatus(
    id: string,
    status: OrderStatus,
  ): Promise<OrderSummaryResponse> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const manager = queryRunner.manager;
      const order = await manager.findOne(Order, {
        where: { id },
        relations: { items: true },
      });
      if (!order) {
        throw new NotFoundException('Pedido no encontrado');
      }

      if (!isTransitionAllowed(order.status, status)) {
        throw new BusinessRuleException([
          {
            field: 'status',
            message: `Transición inválida: de ${order.status} a ${status}`,
          },
        ]);
      }

      // Al cancelar, restaurar stock de cada línea.
      if (status === OrderStatus.CANCELLED) {
        for (const item of order.items) {
          const product = await manager.findOne(Product, {
            where: { id: item.productId },
            lock: { mode: 'pessimistic_write' },
          });
          if (product) {
            product.stock += item.amount;
            await manager.save(product);
          }
        }
      }

      order.status = status;
      const saved = await manager.save(order);

      await queryRunner.commitTransaction();
      return toOrderSummary(saved);
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  private async loadOrderWithItems(id: string): Promise<Order> {
    const order = await this.ordersRepo.findOne({
      where: { id },
      relations: { items: true },
      order: { items: { createdAt: 'ASC' } },
    });
    if (!order) {
      throw new NotFoundException('Pedido no encontrado');
    }
    return order;
  }
}
