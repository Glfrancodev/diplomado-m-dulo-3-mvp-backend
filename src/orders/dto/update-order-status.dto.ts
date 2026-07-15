import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { OrderStatus } from '../../common/enums/order-status.enum';

export class UpdateOrderStatusDto {
  @ApiProperty({ enum: OrderStatus, example: OrderStatus.CONFIRMED })
  @IsEnum(OrderStatus, {
    message: 'status debe ser uno de: PENDING, CONFIRMED, DELIVERED, CANCELLED',
  })
  status: OrderStatus;
}
