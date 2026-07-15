import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async check(): Promise<{ database: 'up' }> {
    try {
      await this.dataSource.query('SELECT 1');
      return { database: 'up' };
    } catch (err) {
      this.logger.error(err instanceof Error ? err.message : String(err));
      throw new ServiceUnavailableException({
        message: 'Servicio no disponible',
        data: { database: 'down' },
        errors: [{ field: null, message: 'La base de datos no responde' }],
      });
    }
  }
}
