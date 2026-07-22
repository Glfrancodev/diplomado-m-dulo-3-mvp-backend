import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory, Reflector } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AppConfig } from './config/configuration';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService<AppConfig, true>);

  // Prefijo global /api para todos los endpoints (el frontend consume /api/*).
  // Se excluye 'health' para que el healthcheck del contenedor siga en /health.
  app.setGlobalPrefix('api', { exclude: ['health'] });

  app.use(helmet());
  app.enableCors({
    origin: config.get('corsOrigin', { infer: true }),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      exceptionFactory: (validationErrors) => {
        const flatten = (
          errs: import('class-validator').ValidationError[],
          parent = '',
        ): { field: string; message: string }[] =>
          errs.flatMap((e) => {
            const field = parent ? `${parent}.${e.property}` : e.property;
            const own = Object.values(e.constraints ?? {}).map((message) => ({
              field,
              message,
            }));
            const nested = e.children?.length ? flatten(e.children, field) : [];
            return [...own, ...nested];
          });
        return new BadRequestException({
          message: 'Error de validación',
          errors: flatten(validationErrors),
        });
      },
    }),
  );

  app.useGlobalInterceptors(new TransformInterceptor(app.get(Reflector)));
  app.useGlobalFilters(new HttpExceptionFilter());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Phoenix Orders API')
    .setDescription(
      'API REST de gestión de Customers, Products y Orders (MVP).',
    )
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  const port = config.get('port', { infer: true });
  await app.listen(port);
}
void bootstrap();
