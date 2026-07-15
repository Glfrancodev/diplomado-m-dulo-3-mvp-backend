import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { OrderStatus } from '../../common/enums/order-status.enum';

export class FilterOrdersDto {
  @ApiPropertyOptional({ enum: OrderStatus })
  @IsOptional()
  @IsEnum(OrderStatus, {
    message: 'status debe ser uno de: PENDING, CONFIRMED, DELIVERED, CANCELLED',
  })
  status?: OrderStatus;

  @ApiPropertyOptional({ example: '3f2a9c10-4b7e-4c2a-9a1e-8d5f0b1c2d3e' })
  @IsOptional()
  @IsUUID('4', { message: 'customerId debe ser un UUID válido' })
  customerId?: string;
}
