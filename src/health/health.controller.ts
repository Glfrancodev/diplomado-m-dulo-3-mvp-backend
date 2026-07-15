import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { HealthService } from './health.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ResponseMessage('Servicio operativo')
  @ApiOperation({ summary: 'Estado del servicio y la base de datos' })
  check() {
    return this.healthService.check();
  }
}
