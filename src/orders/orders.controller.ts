import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { CreateOrderDto } from './dto/create-order.dto';
import { FilterOrdersDto } from './dto/filter-orders.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrdersService } from './orders.service';

@ApiTags('Orders')
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @ResponseMessage('Pedido creado correctamente')
  @ApiOperation({ summary: 'Crear pedido' })
  create(@Body() dto: CreateOrderDto) {
    return this.ordersService.create(dto);
  }

  @Get()
  @ResponseMessage('Pedidos obtenidos')
  @ApiOperation({ summary: 'Listar pedidos' })
  findAll(@Query() filter: FilterOrdersDto) {
    return this.ordersService.findAll(filter);
  }

  @Get(':id')
  @ResponseMessage('Pedido obtenido')
  @ApiOperation({ summary: 'Consultar pedido por ID' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.ordersService.findOne(id);
  }

  @Patch(':id/status')
  @ResponseMessage('Estado del pedido actualizado')
  @ApiOperation({ summary: 'Cambiar estado del pedido' })
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.ordersService.updateStatus(id, dto.status);
  }
}
