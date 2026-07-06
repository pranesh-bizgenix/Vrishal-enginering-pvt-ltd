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
import { ProjectService } from './project.service';
import type { ProjectStatus } from '../core/core.service';

@Controller('projects')
export class ProjectController {
  constructor(private readonly projectService: ProjectService) {}

  @Get()
  getProjects(
    @Headers('authorization') authorization?: string,
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
    @Query('search') search?: string,
    @Query('employeeIds') employeeIds?: string,
  ) {
    return this.projectService.getProjects(authorization, {
      page: page ? Number(page) : undefined,
      perPage: perPage ? Number(perPage) : undefined,
      search,
      employeeIds: employeeIds ? employeeIds.split(',') : undefined,
    });
  }

  @Post()
  createProject(
    @Headers('authorization') authorization: string | undefined,
    @Body()
    body: {
      name: string;
      projectType?: string;
      description?: string;
      dueDate?: string | null;
      projectStatus?: ProjectStatus;
      assignedEmployeeIds?: string[];
    },
  ) {
    return this.projectService.createProject(authorization, body);
  }

  @Patch(':projectId')
  updateProject(
    @Headers('authorization') authorization: string | undefined,
    @Param('projectId') projectId: string,
    @Body()
    body: {
      name?: string;
      projectType?: string;
      description?: string;
      dueDate?: string | null;
      projectStatus?: ProjectStatus;
      assignedEmployeeIds?: string[];
    },
  ) {
    return this.projectService.updateProject(authorization, projectId, body);
  }

  @Delete(':projectId')
  deleteProject(
    @Headers('authorization') authorization: string | undefined,
    @Param('projectId') projectId: string,
  ) {
    return this.projectService.deleteProject(authorization, projectId);
  }
}
