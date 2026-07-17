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
import { TaskService } from './task.service';

type TaskMediaPayload = {
  id?: string;
  type: 'DOCUMENT' | 'PHOTO';
  url: string;
  label?: string;
  mimeType?: string;
  createdById?: string | null;
};

@Controller('tasks')
export class TaskController {
  constructor(private readonly taskService: TaskService) {}

  @Get()
  getTasks(
    @Headers('authorization') authorization?: string,
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
    @Query('search') search?: string,
    @Query('openOnly') openOnly?: string,
  ) {
    return this.taskService.getTasks(authorization, {
      page: page ? Number(page) : undefined,
      perPage: perPage ? Number(perPage) : undefined,
      search,
      openOnly: openOnly === 'true',
    });
  }

  @Get('notes-history')
  getNotesHistory(
    @Headers('authorization') authorization?: string,
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
  ) {
    return this.taskService.getNotesHistory(
      authorization,
      Number(page || 1),
      Number(perPage || 25),
    );
  }

  @Get(':taskId')
  getTaskById(
    @Headers('authorization') authorization: string | undefined,
    @Param('taskId') taskId: string,
  ) {
    return this.taskService.getTaskById(authorization, taskId);
  }

  @Post()
  createTask(
    @Headers('authorization') authorization: string | undefined,
    @Body()
    body: {
      title: string;
      description?: string;
      type?: 'SIMPLE';
      projectId: string;
      dueDate?: string | null;
      assignedEmployeeIds?: string[];
      media?: TaskMediaPayload[];
      requireProof?: boolean;
      qualityRating?: string | null;
      ncItems?: string[];
    },
  ) {
    return this.taskService.createTask(authorization, body);
  }

  @Patch(':taskId')
  updateTask(
    @Headers('authorization') authorization: string | undefined,
    @Param('taskId') taskId: string,
    @Body()
    body: {
      title?: string;
      description?: string;
      type?: 'SIMPLE';
      status?: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
      projectId?: string;
      dueDate?: string | null;
      assignedEmployeeIds?: string[];
      media?: TaskMediaPayload[];
      requireProof?: boolean;
      qualityRating?: string | null;
      ncItems?: string[];
    },
  ) {
    return this.taskService.updateTask(authorization, taskId, body);
  }

  @Patch(':taskId/status')
  updateTaskStatus(
    @Headers('authorization') authorization: string | undefined,
    @Param('taskId') taskId: string,
    @Body() body: { status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' },
  ) {
    return this.taskService.updateTaskStatus(authorization, taskId, body);
  }

  @Post(':taskId/notes')
  addTaskNote(
    @Headers('authorization') authorization: string | undefined,
    @Param('taskId') taskId: string,
    @Body() body: { message: string; markDone?: boolean },
  ) {
    return this.taskService.addTaskNote(authorization, taskId, body);
  }

  @Post(':taskId/approve')
  approveTask(
    @Headers('authorization') authorization: string | undefined,
    @Param('taskId') taskId: string,
  ) {
    return this.taskService.approveTask(authorization, taskId);
  }

  @Delete(':taskId')
  deleteTask(
    @Headers('authorization') authorization: string | undefined,
    @Param('taskId') taskId: string,
  ) {
    return this.taskService.deleteTask(authorization, taskId);
  }
}
