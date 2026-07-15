import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class OrderItemDto {
  @ApiProperty({ example: 'a1b2c3d4-1111-2222-3333-444455556666' })
  @IsUUID('4', { message: 'productId debe ser un UUID válido' })
  productId: string;

  @ApiProperty({ example: 2 })
  @IsInt({ message: 'La cantidad debe ser un número entero' })
  @Min(1, { message: 'La cantidad debe ser al menos 1' })
  amount: number;
}

export class CreateOrderDto {
  @ApiProperty({ example: '3f2a9c10-4b7e-4c2a-9a1e-8d5f0b1c2d3e' })
  @IsUUID('4', { message: 'customerId debe ser un UUID válido' })
  customerId: string;

  @ApiProperty({ type: [OrderItemDto] })
  @IsArray({ message: 'items debe ser una lista' })
  @ArrayMinSize(1, { message: 'Debe incluir al menos 1 producto' })
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];
}
