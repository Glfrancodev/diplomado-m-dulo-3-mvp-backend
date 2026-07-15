import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import {
  ApiErrorDetail,
  ApiResponse,
} from '../interfaces/api-response.interface';

/**
 * Filtro global de errores. Produce SIEMPRE el mismo envelope que el éxito,
 * con `data: null` (salvo que la excepción aporte un `data` explícito, p. ej.
 * /health) y `errors` siempre con >= 1 elemento { field, message }.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const isHttp = exception instanceof HttpException;
    const status = isHttp ? exception.getStatus() : 500;

    let message = defaultMessageFor(status);
    let errors: ApiErrorDetail[] = [
      { field: null, message: 'Error interno del servidor' },
    ];
    let data: unknown = null;

    if (isHttp) {
      const body = exception.getResponse();
      if (typeof body === 'string') {
        errors = [{ field: null, message: body }];
      } else {
        const b = body as {
          message?: string | string[];
          errors?: ApiErrorDetail[];
          data?: unknown;
        };
        if (b.data !== undefined) {
          data = b.data;
        }
        if (Array.isArray(b.errors) && b.errors.length > 0) {
          // Validación o regla de negocio ya formateada como { field, message }.
          message = typeof b.message === 'string' ? b.message : message;
          errors = b.errors;
        } else {
          const raw = b.message;
          errors = Array.isArray(raw)
            ? raw.map((m) => ({ field: null, message: m }))
            : [{ field: null, message: raw ?? message }];
        }
      }
    } else {
      // Error no controlado: log para diagnóstico, respuesta genérica al cliente.
      this.logger.error(
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const payload: ApiResponse = {
      success: false,
      statusCode: status,
      message,
      data: data ?? null,
      errors,
      timestamp: new Date().toISOString(),
      path: req.url,
    };

    res.status(status).json(payload);
  }
}

function defaultMessageFor(status: number): string {
  const map: Record<number, string> = {
    400: 'Solicitud inválida',
    401: 'No autorizado',
    403: 'Prohibido',
    404: 'Recurso no encontrado',
    409: 'Conflicto',
    422: 'Entidad no procesable',
    503: 'Servicio no disponible',
  };
  return map[status] ?? 'Error interno del servidor';
}
