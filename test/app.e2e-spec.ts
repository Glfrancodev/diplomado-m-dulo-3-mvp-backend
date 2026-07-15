import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { HttpExceptionFilter } from './../src/common/filters/http-exception.filter';
import { TransformInterceptor } from './../src/common/interceptors/transform.interceptor';
import { AppModule } from './../src/app.module';

/**
 * e2e mínimo del envelope uniforme. Requiere la base de datos levantada
 * (docker compose up -d db). Verifica /health y el sobre de un 404.
 */
describe('Phoenix Orders API (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalInterceptors(new TransformInterceptor(app.get(Reflector)));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  it('/health (GET) responde con el envelope de éxito', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body).toMatchObject({
      success: true,
      statusCode: 200,
      data: { database: 'up' },
      errors: [],
    });
    expect(res.body).toHaveProperty('timestamp');
    expect(res.body).toHaveProperty('path', '/health');
  });

  it('404 devuelve el envelope de error con errors[]', async () => {
    const res = await request(app.getHttpServer())
      .get('/customers/00000000-0000-4000-8000-000000000000')
      .expect(404);
    expect(res.body).toMatchObject({
      success: false,
      statusCode: 404,
      data: null,
    });
    expect(Array.isArray(res.body.errors)).toBe(true);
    expect(res.body.errors.length).toBeGreaterThanOrEqual(1);
  });

  afterAll(async () => {
    await app.close();
  });
});
