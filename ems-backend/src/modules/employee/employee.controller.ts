import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { EmployeeService } from './employee.service';

@Controller('employees')
export class EmployeeController {
  constructor(private readonly employeeService: EmployeeService) {}

  @Get()
  getEmployees(
    @Headers('authorization') authorization?: string,
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
    @Query('search') search?: string,
  ) {
    return this.employeeService.getEmployees(authorization, {
      page: page ? Number(page) : undefined,
      perPage: perPage ? Number(perPage) : undefined,
      search,
    });
  }

  @Get('leaders')
  getLeaders(@Headers('authorization') authorization?: string) {
    return this.employeeService.getLeaders(authorization);
  }

  @Patch('me/leader')
  updateMyLeader(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: { leaderId?: string | null },
  ) {
    return this.employeeService.updateMyLeader(authorization, body);
  }

  @Post()
  createEmployee(
    @Headers('authorization') authorization: string | undefined,
    @Body()
    body: {
      name: string;
      email: string;
      phone?: string;
      password: string;
      roles?: Array<'SA1' | 'SA2' | 'ADMIN' | 'LEADER' | 'EMPLOYEE'>;
    },
  ) {
    return this.employeeService.createEmployee(authorization, body);
  }

  @Patch(':employeeId')
  updateEmployee(
    @Headers('authorization') authorization: string | undefined,
    @Param('employeeId') employeeId: string,
    @Body()
    body: {
      name?: string;
      email?: string;
      phone?: string;
      password?: string;
      roles?: Array<'SA1' | 'SA2' | 'ADMIN' | 'LEADER' | 'EMPLOYEE'>;
      active?: boolean;
    },
  ) {
    return this.employeeService.updateEmployee(authorization, employeeId, body);
  }

  @Delete(':employeeId')
  deleteEmployee(
    @Headers('authorization') authorization: string | undefined,
    @Param('employeeId') employeeId: string,
  ) {
    return this.employeeService.deleteEmployee(authorization, employeeId);
  }
}
