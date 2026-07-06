import type { Role } from '../lib/api';

export type Employee = {
  id: string;
  name: string;
  email: string;
  phone: string;
  roles: Role[];
  active: boolean;
  hasLoginAccess?: boolean;
  loginEmail?: string;
  permissionRoles?: string[];
  leaderId?: string | null;
  leaderName?: string | null;
  leaderActive?: boolean | null;
  currentProjectIds: string[];
  projectHistoryIds: string[];
};

export type TaskTypeLocal = 'SIMPLE';
export type ProjectStatus = 'NOT_STARTED' | 'STARTED' | 'RUNNING' | 'RUNNING_FINAL_STAGE' | 'COMPLETED';

export type TaskNote = {
  id: string;
  message: string;
  createdAt: string;
  markDone: boolean;
  createdById: string | null;
  createdByName: string;
};

export type TaskMedia = {
  id?: string;
  type: 'DOCUMENT' | 'PHOTO';
  url: string;
  label?: string;
  mimeType?: string;
};
export type Task = {
  id: string;
  title: string;
  description: string;
  type: TaskTypeLocal;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  projectId: string;
  projectName: string;
  assignedEmployeeIds: string[];
  assignedEmployees: Employee[];
  createdAt?: string | null;
  dueDate: string | null;
  notes: TaskNote[];
  media?: TaskMedia[];
};

export type Project = {
  id: string;
  name: string;
  projectType: string;
  description: string;
  projectStatus: ProjectStatus;
  active: boolean;
  dueDate: string | null;
  assignedEmployeeIds: string[];
  assignedEmployees: Employee[];
  tasks: Task[];
  notes: Array<{ id: string; message: string; createdAt: string }>;
};

export type NotificationLog = {
  id: string;
  category: string;
  message: string;
  status: 'SENT' | 'FAILED';
  channel: 'WHATSAPP' | 'SYSTEM';
  recipientRoles: string[];
  createdAt: string;
};

export type PaginatedResponse<T> = {
  items: T[];
  total: number;
  page: number;
  perPage: number;
};

export type TaskNoteHistoryRow = {
  taskId: string;
  taskTitle: string;
  projectName: string;
  taskStatus: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
  note: TaskNote;
};

export type MisSummary = {
  generatedAt: string;
  activeProjects: number;
  stageBreakdown: {
    pending: number;
    inProgress: number;
    completed: number;
  };
  overdueProjects: Array<{
    id: string;
    name: string;
    dueDate: string | null;
    pendingTasks: number;
  }>;
  employeeTaskBreakdown: Array<{
    employeeId: string;
    employeeName: string;
    employeeEmail?: string;
    assignedProjects: number;
    assigned: number;
    pending: number;
    ongoing: number;
    completed: number;
    beforeDue: number;
    afterDue: number;
  }>;
};

export type DailyPendingSummary = {
  generatedAt: string;
  totalPendingTasks: number;
  projects: Array<{
    projectId: string;
    projectName: string;
    pendingTasks: number;
  }>;
  employeeTaskBreakdown: Array<{
    employeeId: string;
    employeeName: string;
    pending: number;
    completed: number;
  }>;
};

export type DashboardResponse = {
  employee: Employee;
  totals: {
    activeProjects: number;
    activeEmployees: number;
    visibleTasks: number;
    taskNotifications: number;
  };
  tasksByStatus: {
    pending: number;
    inProgress: number;
    completed: number;
  };
  assignedTasks: Task[];
  pendingTasks: Task[];
  completedTasks: Task[];
  overdueProjects: Project[];
  projectPendingSummary: Array<{
    projectId: string;
    projectName: string;
    pendingTasks: number;
  }>;
  recentNotifications: NotificationLog[];
};

export type Meta = {
  roles: Role[];
  taskTypes: TaskTypeLocal[];
};

export type SectionKey =
  | 'overview'
  | 'tasks'
  | 'notes'
  | 'projects'
  | 'mis'
  | 'activity'
  | 'employees';

export type NavItem = {
  key: SectionKey;
  label: string;
};
