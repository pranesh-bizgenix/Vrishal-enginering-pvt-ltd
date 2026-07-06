import { Injectable } from '@nestjs/common';
import { CoreService } from '../core/core.service';

@Injectable()
export class MetaService {
  constructor(private readonly emsService: CoreService) {}

  getMeta() {
    return this.emsService.getMeta();
  }
}
