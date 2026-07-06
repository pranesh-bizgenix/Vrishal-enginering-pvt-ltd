import { Module } from '@nestjs/common';
import { CoreModule } from '../core/core.module';
import { MetaController } from './meta.controller';
import { MetaService } from './meta.service';

@Module({
  imports: [CoreModule],
  controllers: [MetaController],
  providers: [MetaService],
})
export class MetaModule {}
