import { Injectable } from '@nestjs/common';
import { CoreService } from '../core/core.service';

@Injectable()
export class AuthService {
  constructor(private readonly emsService: CoreService) {}

  login(email: string, password: string) {
    return this.emsService.login(email, password);
  }
}
