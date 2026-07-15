import { ValueTransformer } from 'typeorm';

/**
 * TypeORM devuelve columnas `numeric` como string. Este transformer las
 * convierte a `number` al leer, y las deja pasar tal cual al escribir.
 * No usar float/double para dinero: siempre numeric(12,2) + este transformer.
 */
export const decimalTransformer: ValueTransformer = {
  to: (value?: number | null): number | null | undefined => value,
  from: (value?: string | null): number | null | undefined =>
    value == null ? value : parseFloat(value),
};
