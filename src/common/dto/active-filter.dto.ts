import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

export class ActiveFilterDto {
  @ApiPropertyOptional({
    example: true,
    description: 'Filtra por estado activo',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }): unknown => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value; // valor no reconocido → @IsBoolean lo rechaza (400)
  })
  @IsBoolean({ message: 'isActive debe ser true o false' })
  isActive?: boolean;
}
