import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { RESPONSE_MESSAGE_KEY } from '../decorators/response-message.decorator';
import { ApiResponse } from '../interfaces/api-response.interface';

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<
  T,
  ApiResponse<T>
> {
  constructor(private readonly reflector: Reflector) {}

  intercept(
    ctx: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiResponse<T>> {
    const req = ctx.switchToHttp().getRequest<Request>();
    const res = ctx.switchToHttp().getResponse<Response>();
    const message =
      this.reflector.get<string>(RESPONSE_MESSAGE_KEY, ctx.getHandler()) ??
      'Operación exitosa';

    return next.handle().pipe(
      map((data) => ({
        success: true,
        statusCode: res.statusCode,
        message,
        data: data ?? null,
        errors: [],
        timestamp: new Date().toISOString(),
        path: req.url,
      })),
    );
  }
}
