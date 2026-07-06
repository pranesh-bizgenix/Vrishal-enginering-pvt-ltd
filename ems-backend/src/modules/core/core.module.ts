import { Module } from '@nestjs/common';
import { CoreService } from './core.service';
import { WhatsappService } from '../report/whatsapp.service';

@Module({
  providers: [CoreService, WhatsappService],
  exports: [CoreService],
})
export class CoreModule {}
