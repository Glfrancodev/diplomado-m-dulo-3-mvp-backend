import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateProductDto {
  @ApiProperty({ example: 'Teclado mecánico' })
  @IsString({ message: 'El nombre es obligatorio' })
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  @MaxLength(150, { message: 'El nombre no puede superar 150 caracteres' })
  name: string;

  @ApiPropertyOptional({
    example: 'Switches rojos, retroiluminado',
    nullable: true,
  })
  @IsOptional()
  @IsString({ message: 'La descripción debe ser texto' })
  @MaxLength(500, { message: 'La descripción no puede superar 500 caracteres' })
  description?: string | null;

  @ApiProperty({ example: 250.0 })
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'El precio debe ser un número con hasta 2 decimales' },
  )
  @IsPositive({ message: 'El precio debe ser mayor que 0' })
  price: number;

  @ApiProperty({ example: 40 })
  @IsInt({ message: 'El stock debe ser un número entero' })
  @Min(0, { message: 'El stock no puede ser negativo' })
  stock: number;
}
