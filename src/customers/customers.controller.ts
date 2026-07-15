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
import { ActiveFilterDto } from '../common/dto/active-filter.dto';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

@ApiTags('Customers')
@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Post()
  @ResponseMessage('Cliente creado correctamente')
  @ApiOperation({ summary: 'Crear cliente' })
  create(@Body() dto: CreateCustomerDto) {
    return this.customersService.create(dto);
  }

  @Get()
  @ResponseMessage('Clientes obtenidos')
  @ApiOperation({ summary: 'Listar clientes' })
  findAll(@Query() filter: ActiveFilterDto) {
    return this.customersService.findAll(filter);
  }

  @Get(':id')
  @ResponseMessage('Cliente obtenido')
  @ApiOperation({ summary: 'Consultar cliente por ID' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.customersService.findOne(id);
  }

  @Patch(':id')
  @ResponseMessage('Cliente actualizado')
  @ApiOperation({ summary: 'Actualizar datos del cliente' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    return this.customersService.update(id, dto);
  }

  @Patch(':id/deactivate')
  @ResponseMessage('Cliente desactivado')
  @ApiOperation({ summary: 'Desactivar cliente (baja lógica)' })
  deactivate(@Param('id', ParseUUIDPipe) id: string) {
    return this.customersService.deactivate(id);
  }
}
