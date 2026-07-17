import { Injectable } from '@nestjs/common';
import { CoreService, TaskType } from '../core/core.service';

type TaskMediaPayload = {
  id?: string;
  type: 'DOCUMENT' | 'PHOTO';
  url: string;
  label?: string;
  mimeType?: string;
  createdById?: string | null;
};

@Injectable()
export class TaskService {
  constructor(private readonly emsService: CoreService) {}

  getTasks(
    authorization?: string,
    options?: {
      page?: number;
      perPage?: number;
      search?: string;
      openOnly?: boolean;
    },
  ) {
    return this.emsService.getTasks(authorization, options);
  }

  getNotesHistory(authorization?: string, page = 1, perPage = 25) {
    return this.emsService.getTaskNotesHistory(authorization, page, perPage);
  }

  getTaskById(authorization: string | undefined, taskId: string) {
    return this.emsService.getTaskById(authorization, taskId);
  }

  createTask(
    authorization: string | undefined,
    payload: {
      title: string;
      description?: string;
      type?: TaskType;
      projectId: string;
      dueDate?: string | null;
      assignedEmployeeIds?: string[];
      media?: TaskMediaPayload[];
      requireProof?: boolean;
      qualityRating?: string | null;
      ncItems?: string[];
    },
  ) {
    return this.emsService.createTask(authorization, payload);
  }

  updateTask(
    authorization: string | undefined,
    taskId: string,
    payload: {
      title?: string;
      description?: string;
      type?: TaskType;
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
    return this.emsService.updateTask(authorization, taskId, payload);
  }

  updateTaskStatus(
    authorization: string | undefined,
    taskId: string,
    payload: { status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' },
  ) {
    return this.emsService.updateTaskStatus(authorization, taskId, payload);
  }

  addTaskNote(
    authorization: string | undefined,
    taskId: string,
    payload: { message: string; markDone?: boolean },
  ) {
    return this.emsService.addTaskNote(authorization, taskId, payload);
  }

  approveTask(authorization: string | undefined, taskId: string) {
    return this.emsService.approveTask(authorization, taskId);
  }

  deleteTask(authorization: string | undefined, taskId: string) {
    return this.emsService.deleteTask(authorization, taskId);
  }
}
