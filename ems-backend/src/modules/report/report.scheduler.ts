import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ReportService } from './report.service';

@Injectable()
export class ReportSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReportSchedulerService.name);
  private intervalId: NodeJS.Timeout | null = null;
  private runningWeekly = false;
  private runningDaily = false;

  constructor(private readonly reportService: ReportService) {}

  onModuleInit() {
    this.checkSchedules();
    this.intervalId = setInterval(() => {
      void this.checkSchedules();
    }, 60_000);
  }

  onModuleDestroy() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private async checkSchedules() {
    const now = new Date();

    if (
      now.getDay() === 0 &&
      now.getHours() === 21 &&
      now.getMinutes() === 0 &&
      !this.runningWeekly
    ) {
      this.runningWeekly = true;
      try {
        await this.reportService.runWeeklyMisReport();
      } catch (error) {
        this.logger.error(
          'Weekly MIS scheduler failed.',
          error instanceof Error ? error.stack : undefined,
        );
      } finally {
        this.runningWeekly = false;
      }
    }

    if (now.getHours() === 18 && now.getMinutes() === 0 && !this.runningDaily) {
      this.runningDaily = true;
      try {
        await this.reportService.runDailyPendingReport();
      } catch (error) {
        this.logger.error(
          'Daily pending scheduler failed.',
          error instanceof Error ? error.stack : undefined,
        );
      } finally {
        this.runningDaily = false;
      }
    }
  }
}
