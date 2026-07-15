import { BadRequestException, ConflictException } from '@nestjs/common';
import { ApiErrorDetail } from '../interfaces/api-response.interface';

/**
 * 400 - Regla de negocio no cumplida (stock, cliente inactivo, transición…).
 * El detalle va en `errors[]`, el `message` es solo el titular de categoría.
 */
export class BusinessRuleException extends BadRequestException {
  constructor(errors: ApiErrorDetail[]) {
    super({ message: 'Regla de negocio no cumplida', errors });
  }
}

/**
 * 409 - Conflicto de unicidad (p. ej. email duplicado).
 */
export class UniqueConflictException extends ConflictException {
  constructor(field: string | null, message: string) {
    super({ message: 'Conflicto', errors: [{ field, message }] });
  }
}
