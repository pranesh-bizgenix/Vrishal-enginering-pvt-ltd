import { Module } from '@nestjs/common';
import { AuthModule } from './modules/auth/auth.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { EmployeeModule } from './modules/employee/employee.module';
import { HealthModule } from './modules/health/health.module';
import { MetaModule } from './modules/meta/meta.module';
import { ProjectModule } from './modules/project/project.module';
import { ReportModule } from './modules/report/report.module';
import { TaskModule } from './modules/task/task.module';

@Module({
  imports: [
    AuthModule,
    DashboardModule,
    EmployeeModule,
    HealthModule,
    MetaModule,
    ProjectModule,
    ReportModule,
    TaskModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
