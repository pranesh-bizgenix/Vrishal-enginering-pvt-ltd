import { Injectable } from '@nestjs/common';
import { CoreService } from '../core/core.service';

@Injectable()
export class DashboardService {
  constructor(private readonly emsService: CoreService) {}

  getDashboard(authorization?: string) {
    return this.emsService.getDashboard(authorization);
  }
}
