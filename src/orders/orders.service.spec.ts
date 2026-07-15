import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, EntityManager, QueryRunner, Repository } from 'typeorm';
import { OrderStatus } from '../common/enums/order-status.enum';
import { BusinessRuleException } from '../common/exceptions/business.exception';
import { Customer } from '../customers/entities/customer.entity';
import { Product } from '../products/entities/product.entity';
import { OrderProduct } from './entities/order-product.entity';
import { Order } from './entities/order.entity';
import { OrdersService } from './orders.service';

/**
 * Estado en memoria que simula la base de datos para las pruebas de reglas
 * de negocio. El EntityManager mockeado lee/escribe sobre estos mapas.
 */
interface DbState {
  customers: Map<string, Customer>;
  products: Map<string, Product>;
}

function buildManagerMock(state: DbState): EntityManager {
  const manager: Partial<EntityManager> = {
    findOne: jest.fn(
      async (entity: any, options: { where: { id: string } }) => {
        const id = options.where.id;
        if (entity === Customer) return state.customers.get(id) ?? null;
        if (entity === Product) return state.products.get(id) ?? null;
        return null;
      },
    ) as any,
    create: jest.fn((_entity: any, data: any) => ({ ...data })) as any,
    save: jest.fn(async (entity: any, data?: any) => {
      // Soporta save(entity, data) y save(data).
      const payload = data ?? entity;
      if (payload instanceof Product || payload?.stock !== undefined) {
        if (payload.id) state.products.set(payload.id, payload as Product);
      }
      if (!payload.id) payload.id = 'generated-id';
      return payload;
    }) as any,
  };
  return manager as EntityManager;
}

describe('OrdersService (reglas de negocio)', () => {
  let service: OrdersService;
  let state: DbState;
  let manager: EntityManager;
  let ordersRepo: jest.Mocked<Repository<Order>>;

  const CUSTOMER_ID = 'cust-1';
  const PRODUCT_ID = 'prod-1';

  beforeEach(async () => {
    state = {
      customers: new Map<string, Customer>(),
      products: new Map<string, Product>(),
    };
    state.customers.set(CUSTOMER_ID, {
      id: CUSTOMER_ID,
      fullName: 'Cliente Activo',
      email: 'activo@example.com',
      phone: null,
      isActive: true,
      createdAt: new Date(),
      orders: [],
    });
    state.products.set(PRODUCT_ID, {
      id: PRODUCT_ID,
      name: 'Teclado',
      description: null,
      price: 100,
      stock: 10,
      isActive: true,
      createdAt: new Date(),
    });

    manager = buildManagerMock(state);

    const queryRunner: Partial<QueryRunner> = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      manager,
    };

    const dataSourceMock: Partial<DataSource> = {
      createQueryRunner: jest.fn(() => queryRunner as QueryRunner),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: DataSource, useValue: dataSourceMock },
        {
          provide: getRepositoryToken(Order),
          useValue: { find: jest.fn(), findOne: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(OrdersService);
    ordersRepo = module.get(getRepositoryToken(Order));
  });

  it('crea el pedido, calcula el total y descuenta stock', async () => {
    const result = await service.create({
      customerId: CUSTOMER_ID,
      items: [{ productId: PRODUCT_ID, amount: 3 }],
    });

    expect(result.total).toBe(300);
    expect(result.items[0].unitPrice).toBe(100);
    expect(result.items[0].subTotal).toBe(300);
    expect(result.status).toBe(OrderStatus.PENDING);
    // Stock 10 -> 7
    expect(state.products.get(PRODUCT_ID)!.stock).toBe(7);
  });

  it('falla si el cliente está inactivo y no toca el stock', async () => {
    state.customers.get(CUSTOMER_ID)!.isActive = false;

    await expect(
      service.create({
        customerId: CUSTOMER_ID,
        items: [{ productId: PRODUCT_ID, amount: 1 }],
      }),
    ).rejects.toBeInstanceOf(BusinessRuleException);

    expect(state.products.get(PRODUCT_ID)!.stock).toBe(10);
  });

  it('falla por stock insuficiente y no modifica el stock', async () => {
    await expect(
      service.create({
        customerId: CUSTOMER_ID,
        items: [{ productId: PRODUCT_ID, amount: 999 }],
      }),
    ).rejects.toBeInstanceOf(BusinessRuleException);

    expect(state.products.get(PRODUCT_ID)!.stock).toBe(10);
  });

  it('falla si un producto no existe o está inactivo', async () => {
    state.products.get(PRODUCT_ID)!.isActive = false;

    await expect(
      service.create({
        customerId: CUSTOMER_ID,
        items: [{ productId: PRODUCT_ID, amount: 1 }],
      }),
    ).rejects.toBeInstanceOf(BusinessRuleException);
  });

  it('rechaza una transición de estado inválida (PENDING -> DELIVERED)', async () => {
    const order = {
      id: 'order-1',
      customerId: CUSTOMER_ID,
      status: OrderStatus.PENDING,
      total: 100,
      items: [],
      createdAt: new Date(),
    } as unknown as Order;
    (manager.findOne as jest.Mock).mockResolvedValueOnce(order);

    await expect(
      service.updateStatus('order-1', OrderStatus.DELIVERED),
    ).rejects.toBeInstanceOf(BusinessRuleException);
  });

  it('al cancelar un pedido restaura el stock', async () => {
    const order = {
      id: 'order-1',
      customerId: CUSTOMER_ID,
      status: OrderStatus.CONFIRMED,
      total: 200,
      items: [
        {
          id: 'item-1',
          orderId: 'order-1',
          productId: PRODUCT_ID,
          amount: 2,
          unitPrice: 100,
          subTotal: 200,
          createdAt: new Date(),
        } as OrderProduct,
      ],
      createdAt: new Date(),
    } as unknown as Order;
    // 1ª llamada: cargar el pedido; 2ª: cargar el producto a restaurar.
    (manager.findOne as jest.Mock)
      .mockResolvedValueOnce(order)
      .mockResolvedValueOnce(state.products.get(PRODUCT_ID));

    const result = await service.updateStatus('order-1', OrderStatus.CANCELLED);

    expect(result.status).toBe(OrderStatus.CANCELLED);
    // Stock 10 -> 12 (restaura las 2 unidades).
    expect(state.products.get(PRODUCT_ID)!.stock).toBe(12);
  });

  it('lanza 404 si el pedido a actualizar no existe', async () => {
    (manager.findOne as jest.Mock).mockResolvedValueOnce(null);

    await expect(
      service.updateStatus('no-existe', OrderStatus.CONFIRMED),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('findAll delega en el repositorio con orden y tope', async () => {
    ordersRepo.find.mockResolvedValueOnce([]);
    await service.findAll({});
    expect(ordersRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        order: { createdAt: 'DESC' },
        take: 200,
      }),
    );
  });
});
