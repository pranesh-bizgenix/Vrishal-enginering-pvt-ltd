import { Injectable } from '@nestjs/common';
import { CoreService } from '../core/core.service';

@Injectable()
export class HealthService {
  constructor(private readonly emsService: CoreService) {}

  getHealth() {
    return this.emsService.getHealth();
  }
}
