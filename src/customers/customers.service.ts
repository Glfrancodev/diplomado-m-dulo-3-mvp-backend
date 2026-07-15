import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { UniqueConflictException } from '../common/exceptions/business.exception';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { Customer } from './entities/customer.entity';

const LIST_LIMIT = 200; // tope defensivo (no es paginación)

@Injectable()
export class CustomersService {
  constructor(
    @InjectRepository(Customer)
    private readonly repo: Repository<Customer>,
  ) {}

  async create(dto: CreateCustomerDto): Promise<Customer> {
    await this.assertEmailAvailable(dto.email);
    const customer = this.repo.create({
      fullName: dto.fullName,
      email: dto.email,
      phone: dto.phone ?? null,
    });
    return this.repo.save(customer);
  }

  async findAll(filter: { isActive?: boolean }): Promise<Customer[]> {
    const where: FindOptionsWhere<Customer> =
      filter.isActive === undefined ? {} : { isActive: filter.isActive };
    return this.repo.find({
      where,
      order: { createdAt: 'DESC' },
      take: LIST_LIMIT,
    });
  }

  async findOne(id: string): Promise<Customer> {
    const customer = await this.repo.findOne({ where: { id } });
    if (!customer) {
      throw new NotFoundException('Cliente no encontrado');
    }
    return customer;
  }

  async update(id: string, dto: UpdateCustomerDto): Promise<Customer> {
    const customer = await this.findOne(id);
    if (dto.email && dto.email !== customer.email) {
      await this.assertEmailAvailable(dto.email);
      customer.email = dto.email;
    }
    if (dto.fullName !== undefined) customer.fullName = dto.fullName;
    if (dto.phone !== undefined) customer.phone = dto.phone ?? null;
    return this.repo.save(customer);
  }

  async deactivate(id: string): Promise<Customer> {
    const customer = await this.findOne(id);
    customer.isActive = false;
    return this.repo.save(customer);
  }

  private async assertEmailAvailable(email: string): Promise<void> {
    const existing = await this.repo.findOne({ where: { email } });
    if (existing) {
      throw new UniqueConflictException(
        'email',
        'Ya existe un cliente con ese email',
      );
    }
  }
}
