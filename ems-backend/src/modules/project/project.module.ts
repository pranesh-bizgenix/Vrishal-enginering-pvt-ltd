import { Module } from '@nestjs/common';
import { CoreModule } from '../core/core.module';
import { ProjectController } from './project.controller';
import { ProjectService } from './project.service';

@Module({
  imports: [CoreModule],
  controllers: [ProjectController],
  providers: [ProjectService],
})
export class ProjectModule {}
