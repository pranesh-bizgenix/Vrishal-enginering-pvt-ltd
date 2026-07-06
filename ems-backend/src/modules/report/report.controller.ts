import { Controller, Get, Headers, Post, Query } from '@nestjs/common';
import { ReportService } from './report.service';

@Controller('reports')
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  @Get('mis-summary')
  getMisSummary(@Headers('authorization') authorization?: string) {
    return this.reportService.getMisSummary(authorization);
  }

  @Get('daily-summary')
  getDailySummary(@Headers('authorization') authorization?: string) {
    return this.reportService.getDailySummary(authorization);
  }

  @Get('notification-logs')
  getNotificationLogs(
    @Headers('authorization') authorization?: string,
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
    @Query('employeeId') employeeId?: string,
  ) {
    return this.reportService.getNotificationLogs(
      authorization,
      Number(page || 1),
      Number(perPage || 25),
      employeeId,
    );
  }

  @Post('run-scheduled')
  runScheduledReports(@Headers('authorization') authorization?: string) {
    return this.reportService.runScheduledReports(authorization);
  }
}
