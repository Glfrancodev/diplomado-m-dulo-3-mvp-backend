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
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductsService } from './products.service';

@ApiTags('Products')
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @ResponseMessage('Producto creado correctamente')
  @ApiOperation({ summary: 'Crear producto' })
  create(@Body() dto: CreateProductDto) {
    return this.productsService.create(dto);
  }

  @Get()
  @ResponseMessage('Productos obtenidos')
  @ApiOperation({ summary: 'Listar productos' })
  findAll(@Query() filter: ActiveFilterDto) {
    return this.productsService.findAll(filter);
  }

  @Get(':id')
  @ResponseMessage('Producto obtenido')
  @ApiOperation({ summary: 'Consultar producto por ID' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.productsService.findOne(id);
  }

  @Patch(':id')
  @ResponseMessage('Producto actualizado')
  @ApiOperation({ summary: 'Actualizar precio/stock del producto' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.productsService.update(id, dto);
  }

  @Patch(':id/deactivate')
  @ResponseMessage('Producto desactivado')
  @ApiOperation({ summary: 'Desactivar producto (baja lógica)' })
  deactivate(@Param('id', ParseUUIDPipe) id: string) {
    return this.productsService.deactivate(id);
  }
}
