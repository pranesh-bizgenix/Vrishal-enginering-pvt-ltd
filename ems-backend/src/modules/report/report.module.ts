import { Module } from '@nestjs/common';
import { CoreModule } from '../core/core.module';
import { ReportController } from './report.controller';
import { ReportSchedulerService } from './report.scheduler';
import { ReportService } from './report.service';
import { WhatsappService } from './whatsapp.service';

@Module({
  imports: [CoreModule],
  controllers: [ReportController],
  providers: [ReportService, WhatsappService, ReportSchedulerService],
})
export class ReportModule {}
