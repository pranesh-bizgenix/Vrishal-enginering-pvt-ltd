import { Module } from '@nestjs/common';
import { CoreModule } from '../core/core.module';
import { TaskController } from './task.controller';
import { TaskService } from './task.service';

@Module({
  imports: [CoreModule],
  controllers: [TaskController],
  providers: [TaskService],
})
export class TaskModule {}
