import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { Product } from './entities/product.entity';

const LIST_LIMIT = 200; // tope defensivo (no es paginación)

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly repo: Repository<Product>,
  ) {}

  async create(dto: CreateProductDto): Promise<Product> {
    const product = this.repo.create({
      name: dto.name,
      description: dto.description ?? null,
      price: dto.price,
      stock: dto.stock,
    });
    return this.repo.save(product);
  }

  async findAll(filter: { isActive?: boolean }): Promise<Product[]> {
    const where: FindOptionsWhere<Product> =
      filter.isActive === undefined ? {} : { isActive: filter.isActive };
    return this.repo.find({
      where,
      order: { createdAt: 'DESC' },
      take: LIST_LIMIT,
    });
  }

  async findOne(id: string): Promise<Product> {
    const product = await this.repo.findOne({ where: { id } });
    if (!product) {
      throw new NotFoundException('Producto no encontrado');
    }
    return product;
  }

  async update(id: string, dto: UpdateProductDto): Promise<Product> {
    const product = await this.findOne(id);
    if (dto.name !== undefined) product.name = dto.name;
    if (dto.description !== undefined)
      product.description = dto.description ?? null;
    if (dto.price !== undefined) product.price = dto.price;
    if (dto.stock !== undefined) product.stock = dto.stock;
    return this.repo.save(product);
  }

  async deactivate(id: string): Promise<Product> {
    const product = await this.findOne(id);
    product.isActive = false;
    return this.repo.save(product);
  }
}
