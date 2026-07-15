import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateCustomerDto {
  @ApiProperty({ example: 'María López' })
  @IsString({ message: 'El nombre es obligatorio' })
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  @MaxLength(150, { message: 'El nombre no puede superar 150 caracteres' })
  fullName: string;

  @ApiProperty({ example: 'maria.lopez@example.com' })
  @IsEmail({}, { message: 'El email no es válido' })
  @MaxLength(180, { message: 'El email no puede superar 180 caracteres' })
  email: string;

  @ApiPropertyOptional({ example: '+591 70012345', nullable: true })
  @IsOptional()
  @IsString({ message: 'El teléfono debe ser texto' })
  @MaxLength(30, { message: 'El teléfono no puede superar 30 caracteres' })
  phone?: string | null;
}
