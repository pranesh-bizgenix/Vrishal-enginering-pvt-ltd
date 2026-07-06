import { Injectable } from '@nestjs/common';
import { CoreService, Role } from '../core/core.service';

@Injectable()
export class EmployeeService {
  constructor(private readonly emsService: CoreService) {}

  getEmployees(
    authorization?: string,
    options?: { page?: number; perPage?: number; search?: string },
  ) {
    return this.emsService.getEmployees(authorization, options);
  }

  getLeaders(authorization?: string) {
    return this.emsService.getLeaders(authorization);
  }

  updateMyLeader(
    authorization: string | undefined,
    payload: { leaderId?: string | null },
  ) {
    return this.emsService.updateMyLeader(authorization, payload);
  }

  createEmployee(
    authorization: string | undefined,
    payload: {
      name: string;
      email: string;
      phone?: string;
      password: string;
      roles?: Role[];
    },
  ) {
    return this.emsService.createEmployee(authorization, payload);
  }

  updateEmployee(
    authorization: string | undefined,
    employeeId: string,
    payload: {
      name?: string;
      email?: string;
      phone?: string;
      password?: string;
      roles?: Role[];
      active?: boolean;
    },
  ) {
    return this.emsService.updateEmployee(authorization, employeeId, payload);
  }

  deleteEmployee(authorization: string | undefined, employeeId: string) {
    return this.emsService.deleteEmployee(authorization, employeeId);
  }
}
