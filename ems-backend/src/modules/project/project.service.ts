import { Injectable } from '@nestjs/common';
import { CoreService } from '../core/core.service';
import type { ProjectStatus } from '../core/core.service';

@Injectable()
export class ProjectService {
  constructor(private readonly emsService: CoreService) {}

  getProjects(
    authorization?: string,
    options?: {
      page?: number;
      perPage?: number;
      search?: string;
      employeeIds?: string[];
    },
  ) {
    return this.emsService.getProjects(authorization, options);
  }

  getProjectById(
    authorization: string | undefined,
    projectId: string,
    options?: { includeTasks?: boolean },
  ) {
    return this.emsService.getProjectById(authorization, projectId, options);
  }

  createProject(
    authorization: string | undefined,
    payload: {
      name: string;
      projectType?: string;
      description?: string;
      dueDate?: string | null;
      projectStatus?: ProjectStatus;
      assignedEmployeeIds?: string[];
    },
  ) {
    return this.emsService.createProject(authorization, payload);
  }

  updateProject(
    authorization: string | undefined,
    projectId: string,
    payload: {
      name?: string;
      projectType?: string;
      description?: string;
      dueDate?: string | null;
      projectStatus?: ProjectStatus;
      assignedEmployeeIds?: string[];
    },
  ) {
    return this.emsService.updateProject(authorization, projectId, payload);
  }

  deleteProject(authorization: string | undefined, projectId: string) {
    return this.emsService.deleteProject(authorization, projectId);
  }
}
