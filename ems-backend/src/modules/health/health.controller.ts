import { Controller, Get } from '@nestjs/common';
import { HealthService } from './health.service';

@Controller('ems')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('health')
  getHealth() {
    return this.healthService.getHealth();
  }
}
