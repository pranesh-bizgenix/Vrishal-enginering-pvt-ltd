import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  createHmac,
  randomUUID,
  scryptSync,
  timingSafeEqual,
  randomBytes,
} from 'crypto';
import {
  AppDataSource,
  ensureDataSourceInitialized,
} from '../../database/data-source';
import { WhatsappService } from '../report/whatsapp.service';

export type Role = 'SA1' | 'SA2' | 'ADMIN' | 'LEADER' | 'EMPLOYEE';
export type TaskType = 'SIMPLE';
export type ProjectStatus =
  | 'NOT_STARTED'
  | 'STARTED'
  | 'RUNNING'
  | 'RUNNING_FINAL_STAGE'
  | 'COMPLETED';
type TaskStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
type TaskMediaType = 'DOCUMENT' | 'PHOTO';

type TaskMediaPayload = {
  id?: string;
  type: TaskMediaType;
  url: string;
  label?: string;
  mimeType?: string;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ListQueryOptions = {
  page?: number;
  perPage?: number;
  search?: string;
  openOnly?: boolean;
  employeeIds?: string[];
};

type UserRow = {
  userId: string;
  employeeId: string;
  email: string;
  password: string;
  userRoles: string[] | null;
  employeeRoles: string[] | null;
  name: string | null;
  phone: string | null;
  isActive: boolean | null;
  deletedAt: string | null;
};

type EmployeeListRow = {
  userId: string | null;
  employeeId: string;
  archivedEmail?: string;
  email: string | null;
  password: string | null;
  userRoles: string[] | null;
  employeeRoles: string[] | null;
  name: string | null;
  phone: string | null;
  isActive: boolean | null;
  deletedAt: string | null;
  leaderId?: string | null;
  leaderName?: string | null;
  leaderActive?: boolean | null;
};

type EmployeeRecord = {
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

type NotificationRecord = {
  id: string;
  category: string;
  message: string;
  status: 'SENT' | 'FAILED';
  channel: 'WHATSAPP' | 'SYSTEM';
  recipientRoles: string[];
  createdAt: string;
};

type TokenPayload = {
  id: string;
  email: string;
};

type ProjectRow = {
  id: string;
  name: string;
  code: string;
  projectType: string | null;
  description: string | null;
  projectStatus: ProjectStatus;
  active: boolean;
  dueDate: string | null;
  createdAt: string;
};

type ProjectAssignmentRow = {
  projectId: string;
  employeeId: string;
};

type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  type: TaskType;
  status: TaskStatus;
  projectId: string;
  dueDate: string | null;
  createdAt: string;
};

type TaskAssignmentRow = {
  taskId: string;
  employeeId: string;
};

type TaskNoteRow = {
  id: string;
  taskId: string;
  employeeId: string | null;
  message: string;
  createdAt: string;
  markDone: boolean;
  employeeName: string | null;
};

type TaskMediaRow = {
  id: string;
  taskId: string;
  type: TaskMediaType;
  url: string;
  label: string | null;
  mimeType: string | null;
  createdAt: string;
};

const ROLE_POWER: Record<Role, number> = {
  SA1: 5,
  SA2: 4,
  ADMIN: 3,
  LEADER: 2,
  EMPLOYEE: 1,
};
const ROLE_OPTIONS: Role[] = ['SA1', 'SA2', 'ADMIN', 'LEADER', 'EMPLOYEE'];
const TASK_ADMIN_WHATSAPP_ROLES: Role[] = ['SA1', 'SA2', 'ADMIN'];

@Injectable()
export class CoreService {
  private employees = new Map<string, EmployeeRecord>();
  private readonly notifications: NotificationRecord[] = [];

  constructor(private readonly whatsappService: WhatsappService) {}

  private async query<T = unknown>(
    sql: string,
    params?: unknown[],
  ): Promise<T[]> {
    await ensureDataSourceInitialized();
    return AppDataSource.query(sql, params) as Promise<T[]>;
  }

  private hashPassword(password: string) {
    const salt = randomBytes(16).toString('hex');
    const hash = scryptSync(password, salt, 64).toString('hex');
    return `${salt}:${hash}`;
  }

  private passwordsMatch(password: string, storedPassword: string) {
    const [salt, storedHash] = storedPassword.split(':');

    if (!salt || !storedHash) {
      return storedPassword === password;
    }

    const derivedHash = scryptSync(password, salt, 64);
    const storedHashBuffer = Buffer.from(storedHash, 'hex');

    if (storedHashBuffer.length !== derivedHash.length) {
      return false;
    }

    return timingSafeEqual(storedHashBuffer, derivedHash);
  }

  private buildToken(payload: TokenPayload) {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = createHmac(
      'sha256',
      process.env.JWT_SECRET || 'tmSsupersecretkey',
    )
      .update(body)
      .digest('hex');
    return `${body}.${signature}`;
  }

  private parseToken(authorization?: string) {
    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Unauthorized');
    }

    const token = authorization.slice('Bearer '.length).trim();
    const [body, signature] = token.split('.');
    const expectedSignature = createHmac(
      'sha256',
      process.env.JWT_SECRET || 'tmSsupersecretkey',
    )
      .update(body)
      .digest('hex');

    if (!body || !signature || signature !== expectedSignature) {
      throw new UnauthorizedException('Unauthorized');
    }

    return JSON.parse(
      Buffer.from(body, 'base64url').toString('utf8'),
    ) as TokenPayload;
  }

  private formatName(email: string) {
    const localPart = email.split('@')[0] || 'admin';
    return (
      localPart
        .split(/[._-]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ') || 'Admin User'
    );
  }

  private formatStatusLabel(value: string) {
    return value
      .toLowerCase()
      .replace(/_/g, ' ')
      .replace(/(^|\s)\S/g, (char) => char.toUpperCase());
  }

  private buildProjectCode(name: string) {
    const normalized = name
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40);
    const suffix = Date.now().toString().slice(-6);
    return `${normalized || 'PROJECT'}_${suffix}`;
  }

  private normalizeRoles(roles?: string[] | null, email?: string): Role[] {
    if (email?.trim().toLowerCase() === 'admin@sjsangath.com') {
      return ['SA1'];
    }

    const normalized = (roles || [])
      .map((role) => role?.toUpperCase())
      .filter((role): role is Role => ROLE_OPTIONS.includes(role as Role));

    if (normalized.length) {
      return normalized;
    }

    return ['EMPLOYEE'];
  }

  private buildEmployeeRecord(
    row: EmployeeListRow,
    currentProjectIds: string[],
    projectHistoryIds: string[],
  ) {
    const email =
      row.email?.trim().toLowerCase() ||
      row.archivedEmail?.trim().toLowerCase() ||
      '';
    const roles = this.normalizeRoles(
      row.employeeRoles || row.userRoles,
      email,
    );

    return {
      id: row.employeeId,
      name: row.name?.trim() || (email ? this.formatName(email) : 'Employee'),
      email,
      phone: row.phone || '',
      roles,
      active: row.isActive ?? true,
      hasLoginAccess: Boolean(row.userId && email),
      loginEmail: email || undefined,
      permissionRoles: (row.userRoles || row.employeeRoles || []).map((role) =>
        role.toLowerCase(),
      ),
      leaderId: row.leaderId || null,
      leaderName: row.leaderActive === false ? null : row.leaderName || null,
      leaderActive: row.leaderActive ?? null,
      currentProjectIds,
      projectHistoryIds,
    } satisfies EmployeeRecord;
  }

  private async ensureEmployeeHierarchyColumn() {
    await this.query(
      `ALTER TABLE employees
       ADD COLUMN IF NOT EXISTS leader_id UUID NULL REFERENCES employees(id) ON DELETE SET NULL`,
    );
  }

  private async fetchUserEmployeeRows(
    userId?: string,
    employeeId?: string,
    email?: string,
  ) {
    const conditions = ['u.deleted_at IS NULL', 'e.deleted_at IS NULL'];
    const params: unknown[] = [];

    if (userId) {
      params.push(userId);
      conditions.push(`u.id = $${params.length}`);
    }

    if (employeeId) {
      params.push(employeeId);
      conditions.push(`e.id = $${params.length}`);
    }

    if (email) {
      params.push(email.trim().toLowerCase());
      conditions.push(`LOWER(u.email) = LOWER($${params.length})`);
    }

    return this.query<UserRow>(
      `SELECT
         u.id AS "userId",
         u.employee_id AS "employeeId",
         u.email,
         u.password,
         u.roles AS "userRoles",
         e.roles AS "employeeRoles",
         e.name,
         e.phone,
         e.is_active AS "isActive",
         u.deleted_at AS "deletedAt"
       FROM users u
       INNER JOIN employees e ON e.id = u.employee_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY u.created_at DESC`,
      params,
    );
  }
  private async fetchAnyUserEmployeeRow(employeeId: string) {
    const rows = await this.query<UserRow>(
      `SELECT
         u.id AS "userId",
         u.employee_id AS "employeeId",
         u.email,
         u.password,
         u.roles AS "userRoles",
         e.roles AS "employeeRoles",
         e.name,
         e.phone,
         e.is_active AS "isActive",
         u.deleted_at AS "deletedAt"
       FROM users u
       INNER JOIN employees e ON e.id = u.employee_id
       WHERE e.deleted_at IS NULL AND e.id = $1
       ORDER BY u.created_at DESC`,
      [employeeId],
    );

    return rows[0];
  }

  private async fetchEmployeeListRows(employeeId?: string) {
    await this.ensureEmployeeHierarchyColumn();
    const params: unknown[] = [];
    const where = ['e.deleted_at IS NULL'];

    if (employeeId) {
      params.push(employeeId);
      where.push(`e.id = $${params.length}`);
    }

    return this.query<EmployeeListRow>(
      `SELECT
         u.id AS "userId",
         e.id AS "employeeId",
         u.email,
         archived_user.email AS "archivedEmail",
         u.password,
         u.roles AS "userRoles",
         e.roles AS "employeeRoles",
         e.name,
         e.phone,
         e.is_active AS "isActive",
         e.leader_id AS "leaderId",
         leader.name AS "leaderName",
         leader.is_active AS "leaderActive",
         u.deleted_at AS "deletedAt"
       FROM employees e
       LEFT JOIN users u ON u.employee_id = e.id AND u.deleted_at IS NULL
       LEFT JOIN employees leader ON leader.id = e.leader_id AND leader.deleted_at IS NULL
       LEFT JOIN LATERAL (
         SELECT email
         FROM users archived_user_inner
         WHERE archived_user_inner.employee_id = e.id
         ORDER BY archived_user_inner.updated_at DESC NULLS LAST, archived_user_inner.created_at DESC
         LIMIT 1
       ) archived_user ON TRUE
       WHERE ${where.join(' AND ')}
       ORDER BY e.created_at DESC`,
      params,
    );
  }

  private async fetchProjectRows(projectIds?: string[]) {
    if (projectIds?.length) {
      return this.query<ProjectRow>(
        `SELECT id, name, code, project_type AS "projectType", description, project_status AS "projectStatus", active, due_date AS "dueDate", created_at AS "createdAt"
         FROM projects
         WHERE deleted_at IS NULL AND id = ANY($1::uuid[])
         ORDER BY created_at DESC`,
        [projectIds],
      );
    }

    return this.query<ProjectRow>(
      `SELECT id, name, code, project_type AS "projectType", description, project_status AS "projectStatus", active, due_date AS "dueDate", created_at AS "createdAt"
       FROM projects
       WHERE deleted_at IS NULL
       ORDER BY created_at DESC`,
    );
  }

  private async fetchProjectAssignments(projectIds?: string[]) {
    if (projectIds?.length) {
      return this.query<ProjectAssignmentRow>(
        `SELECT project_id AS "projectId", employee_id AS "employeeId"
         FROM project_assignments
         WHERE project_id = ANY($1::uuid[])
         ORDER BY created_at ASC`,
        [projectIds],
      );
    }

    return this.query<ProjectAssignmentRow>(
      `SELECT project_id AS "projectId", employee_id AS "employeeId"
       FROM project_assignments
       ORDER BY created_at ASC`,
    );
  }

  private async fetchTaskRows(taskIds?: string[]) {
    if (taskIds?.length) {
      return this.query<TaskRow>(
        `SELECT id, title, description, type, status, project_id AS "projectId", due_date AS "dueDate", created_at AS "createdAt"
         FROM tasks
         WHERE deleted_at IS NULL AND id = ANY($1::uuid[])
         ORDER BY created_at DESC`,
        [taskIds],
      );
    }

    return this.query<TaskRow>(
      `SELECT id, title, description, type, status, project_id AS "projectId", due_date AS "dueDate", created_at AS "createdAt"
       FROM tasks
       WHERE deleted_at IS NULL
       ORDER BY created_at DESC`,
    );
  }

  private async fetchTaskAssignments(taskIds?: string[]) {
    if (taskIds?.length) {
      return this.query<TaskAssignmentRow>(
        `SELECT task_id AS "taskId", employee_id AS "employeeId"
         FROM task_assignments
         WHERE task_id = ANY($1::uuid[])
         ORDER BY created_at ASC`,
        [taskIds],
      );
    }

    return this.query<TaskAssignmentRow>(
      `SELECT task_id AS "taskId", employee_id AS "employeeId"
       FROM task_assignments
       ORDER BY created_at ASC`,
    );
  }

  private async fetchTaskNotes(taskIds?: string[]) {
    if (taskIds?.length) {
      return this.query<TaskNoteRow>(
        `SELECT
           tn.id,
           tn.task_id AS "taskId",
           tn.employee_id AS "employeeId",
           tn.message,
           tn.created_at AS "createdAt",
           tn.mark_done AS "markDone",
           e.name AS "employeeName"
         FROM task_notes tn
         LEFT JOIN employees e ON e.id = tn.employee_id
         WHERE tn.task_id = ANY($1::uuid[])
         ORDER BY tn.created_at DESC`,
        [taskIds],
      );
    }

    return this.query<TaskNoteRow>(
      `SELECT
         tn.id,
         tn.task_id AS "taskId",
         tn.employee_id AS "employeeId",
         tn.message,
         tn.created_at AS "createdAt",
         tn.mark_done AS "markDone",
         e.name AS "employeeName"
       FROM task_notes tn
       LEFT JOIN employees e ON e.id = tn.employee_id
       ORDER BY tn.created_at DESC`,
    );
  }

  private async ensureTaskMediaTable() {
    await this.query(
      `CREATE TABLE IF NOT EXISTS task_media (
        id UUID PRIMARY KEY,
        task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        type VARCHAR(20) NOT NULL,
        url TEXT NOT NULL,
        label VARCHAR(255),
        mime_type VARCHAR(255),
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`,
    );
  }

  private async ensureTaskNotesEmployeeColumn() {
    await this.query(
      `ALTER TABLE task_notes
       ADD COLUMN IF NOT EXISTS employee_id UUID NULL REFERENCES employees(id) ON DELETE SET NULL`,
    );
    await this.query(
      `CREATE INDEX IF NOT EXISTS idx_task_notes_employee_id ON task_notes (employee_id)`,
    );
  }

  private async fetchTaskMedia(taskIds?: string[]) {
    await this.ensureTaskMediaTable();
    if (taskIds?.length) {
      return this.query<TaskMediaRow>(
        `SELECT
           id,
           task_id AS "taskId",
           type,
           url,
           label,
           mime_type AS "mimeType",
           created_at AS "createdAt"
         FROM task_media
         WHERE task_id = ANY($1::uuid[])
         ORDER BY created_at ASC`,
        [taskIds],
      );
    }

    return this.query<TaskMediaRow>(
      `SELECT
         id,
         task_id AS "taskId",
         type,
         url,
         label,
         mime_type AS "mimeType",
         created_at AS "createdAt"
       FROM task_media
       ORDER BY created_at ASC`,
    );
  }

  private normalizeTaskMedia(media?: TaskMediaPayload[]) {
    if (!Array.isArray(media)) {
      return [];
    }

    return media
      .filter(
        (item) =>
          item &&
          (item.type === 'DOCUMENT' || item.type === 'PHOTO') &&
          typeof item.url === 'string' &&
          item.url.trim(),
      )
      .map((item) => ({
        id: item.id && UUID_PATTERN.test(item.id) ? item.id : randomUUID(),
        type: item.type,
        url: item.url.trim(),
        label: item.label?.trim() || null,
        mimeType: item.mimeType?.trim() || null,
      }));
  }

  private async replaceTaskMedia(taskId: string, media?: TaskMediaPayload[]) {
    if (!Array.isArray(media)) {
      return;
    }

    await this.ensureTaskMediaTable();
    await this.query(`DELETE FROM task_media WHERE task_id = $1`, [taskId]);
    const now = new Date().toISOString();
    for (const item of this.normalizeTaskMedia(media)) {
      await this.query(
        `INSERT INTO task_media (id, task_id, type, url, label, mime_type, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [item.id, taskId, item.type, item.url, item.label, item.mimeType, now],
      );
    }
  }

  private async appendTaskNote(
    taskId: string,
    employeeId: string | null,
    message: string,
    markDone = false,
  ) {
    await this.ensureTaskNotesEmployeeColumn();
    const now = new Date().toISOString();
    await this.query(
      `INSERT INTO task_notes (id, task_id, employee_id, message, created_at, mark_done)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [randomUUID(), taskId, employeeId, message.trim(), now, markDone],
    );
  }

  private async syncEmployeesFromDatabase() {
    const [rows, assignmentRows] = await Promise.all([
      this.fetchEmployeeListRows(),
      this.query<
        Array<{
          employeeId: string;
          projectId: string;
          active: boolean;
        }>[number]
      >(
        `SELECT pa.employee_id AS "employeeId", pa.project_id AS "projectId", p.active AS "active"
         FROM project_assignments pa
         INNER JOIN projects p ON p.id = pa.project_id
         WHERE p.deleted_at IS NULL`,
      ),
    ]);

    const currentProjectsByEmployee = new Map<string, string[]>();
    const historyProjectsByEmployee = new Map<string, string[]>();

    assignmentRows.forEach((row) => {
      const history = historyProjectsByEmployee.get(row.employeeId) || [];
      history.push(row.projectId);
      historyProjectsByEmployee.set(row.employeeId, history);

      if (row.active) {
        const current = currentProjectsByEmployee.get(row.employeeId) || [];
        current.push(row.projectId);
        currentProjectsByEmployee.set(row.employeeId, current);
      }
    });

    const nextEmployees = new Map<string, EmployeeRecord>();
    rows.forEach((row) => {
      nextEmployees.set(
        row.employeeId,
        this.buildEmployeeRecord(
          row,
          currentProjectsByEmployee.get(row.employeeId) || [],
          historyProjectsByEmployee.get(row.employeeId) || [],
        ),
      );
    });

    this.employees = nextEmployees;
    return Array.from(nextEmployees.values());
  }

  private getLeaderTeamEmployeeIds(employeeId: string) {
    return Array.from(this.employees.values())
      .filter(
        (employee) =>
          employee.active &&
          employee.leaderId === employeeId &&
          employee.roles.includes('EMPLOYEE') &&
          !employee.roles.includes('LEADER'),
      )
      .map((employee) => employee.id);
  }

  private getVisibleEmployeeScope(employee: EmployeeRecord) {
    if (employee.roles.includes('SA1')) {
      return null;
    }

    const power = this.getHighestRolePower(employee.roles);
    if (power >= ROLE_POWER.ADMIN) {
      return new Set(
        Array.from(this.employees.values())
          .filter((item) => item.id === employee.id || this.getHighestRolePower(item.roles) < power)
          .map((item) => item.id),
      );
    }

    if (employee.roles.includes('LEADER')) {
      return new Set([
        employee.id,
        ...this.getLeaderTeamEmployeeIds(employee.id),
      ]);
    }

    return new Set([employee.id]);
  }

  private getHighestRolePower(roles: Role[]) {
    return roles.reduce((highest, role) => Math.max(highest, ROLE_POWER[role] || 0), 0);
  }

  private getAssignableRolesForEmployee(employee: EmployeeRecord) {
    const power = this.getHighestRolePower(employee.roles);
    return ROLE_OPTIONS.filter((role) => ROLE_POWER[role] < power);
  }

  private itemMatchesEmployeeScope(
    assignedEmployeeIds: string[],
    scope: Set<string> | null,
  ) {
    return (
      !scope || assignedEmployeeIds.some((employeeId) => scope.has(employeeId))
    );
  }

  private getRequestedEmployeeScope(
    visibleScope: Set<string> | null,
    employeeIds?: string[],
  ) {
    const requestedIds = (employeeIds || [])
      .map((employeeId) => employeeId.trim())
      .filter((employeeId) => UUID_PATTERN.test(employeeId));

    if (!requestedIds.length) {
      return visibleScope;
    }

    const requestedScope = new Set(requestedIds);
    if (!visibleScope) {
      return requestedScope;
    }

    return new Set(requestedIds.filter((employeeId) => visibleScope.has(employeeId)));
  }

  private async getCurrentEmployee(authorization?: string) {
    const payload = this.parseToken(authorization);
    const rows = await this.fetchUserEmployeeRows(payload.id);
    const row = rows[0];

    if (!row) {
      throw new UnauthorizedException('Unauthorized');
    }
    if (row.isActive === false) {
      throw new UnauthorizedException('Employee is inactive.');
    }

    const employees = await this.syncEmployeesFromDatabase();
    const employee = employees.find((item) => item.id === row.employeeId);
    if (!employee) {
      throw new UnauthorizedException('Unauthorized');
    }

    return employee;
  }

  private async buildTaskViews(taskRows?: TaskRow[]) {
    await this.syncEmployeesFromDatabase();
    const tasks = taskRows || (await this.fetchTaskRows());
    if (!tasks.length) {
      return [];
    }

    const projectIds = Array.from(new Set(tasks.map((task) => task.projectId)));
    const taskIds = tasks.map((task) => task.id);
    const [projectRows, assignmentRows, noteRows, mediaRows] =
      await Promise.all([
        this.fetchProjectRows(projectIds),
        this.fetchTaskAssignments(taskIds),
        this.fetchTaskNotes(taskIds),
        this.fetchTaskMedia(taskIds),
      ]);

    const projectsById = new Map(
      projectRows.map((project) => [project.id, project]),
    );
    const assignmentsByTask = new Map<string, string[]>();
    assignmentRows.forEach((row) => {
      const items = assignmentsByTask.get(row.taskId) || [];
      items.push(row.employeeId);
      assignmentsByTask.set(row.taskId, items);
    });

    const notesByTask = new Map<string, TaskNoteRow[]>();
    noteRows.forEach((row) => {
      const items = notesByTask.get(row.taskId) || [];
      items.push(row);
      notesByTask.set(row.taskId, items);
    });

    const mediaByTask = new Map<string, TaskMediaRow[]>();
    mediaRows.forEach((row) => {
      const items = mediaByTask.get(row.taskId) || [];
      items.push(row);
      mediaByTask.set(row.taskId, items);
    });

    return tasks.map((task) => {
      const project = projectsById.get(task.projectId);
      const assignedEmployeeIds = assignmentsByTask.get(task.id) || [];
      const assignedEmployees = assignedEmployeeIds
        .map((id) => this.employees.get(id))
        .filter((employee): employee is EmployeeRecord => Boolean(employee));

      return {
        id: task.id,
        title: task.title,
        description: task.description || '',
        type: task.type,
        status: task.status,
        projectId: task.projectId,
        projectName: project?.name || 'Unassigned project',
        assignedEmployeeIds,
        assignedEmployees,
        dueDate: task.dueDate,
        notes: (notesByTask.get(task.id) || []).map((note) => ({
          id: note.id,
          message: note.message,
          createdAt: note.createdAt,
          markDone: note.markDone,
          createdById: note.employeeId,
          createdByName: note.employeeName?.trim() || 'Unknown employee',
        })),
        media: (mediaByTask.get(task.id) || []).map((media) => ({
          id: media.id,
          type: media.type,
          url: media.url,
          label: media.label || undefined,
          mimeType: media.mimeType || undefined,
        })),
      };
    });
  }

  private async buildProjectViews(projectRows?: ProjectRow[]) {
    await this.syncEmployeesFromDatabase();
    const projects = projectRows || (await this.fetchProjectRows());
    if (!projects.length) {
      return [];
    }

    const projectIds = projects.map((project) => project.id);
    const [assignmentRows, taskRows] = await Promise.all([
      this.fetchProjectAssignments(projectIds),
      this.query<TaskRow>(
        `SELECT id, title, description, type, status, project_id AS "projectId", due_date AS "dueDate", created_at AS "createdAt"
         FROM tasks
         WHERE deleted_at IS NULL AND project_id = ANY($1::uuid[])
         ORDER BY created_at DESC`,
        [projectIds],
      ),
    ]);

    const projectAssignments = new Map<string, string[]>();
    assignmentRows.forEach((row) => {
      const items = projectAssignments.get(row.projectId) || [];
      items.push(row.employeeId);
      projectAssignments.set(row.projectId, items);
    });

    const taskViews = await this.buildTaskViews(taskRows);

    return projects.map((project) => {
      const assignedEmployeeIds = projectAssignments.get(project.id) || [];
      const assignedEmployees = assignedEmployeeIds
        .map((id) => this.employees.get(id))
        .filter((employee): employee is EmployeeRecord => Boolean(employee));

      return {
        id: project.id,
        name: project.name,
        projectType: project.projectType || '',
        description: project.description || '',
        projectStatus: project.projectStatus || 'NOT_STARTED',
        active: project.active,
        dueDate: project.dueDate,
        assignedEmployeeIds,
        assignedEmployees,
        tasks: taskViews.filter((task) => task.projectId === project.id),
        notes: [],
      };
    });
  }

  private addNotification(
    category: string,
    message: string,
    status: 'SENT' | 'FAILED' = 'SENT',
    channel: 'WHATSAPP' | 'SYSTEM' = 'WHATSAPP',
    recipientRoles: string[] = [],
  ) {
    const record = {
      id: randomUUID(),
      category,
      message,
      status,
      channel,
      recipientRoles,
      createdAt: new Date().toISOString(),
    } satisfies NotificationRecord;

    this.notifications.unshift(record);
    this.notifications.splice(20);

    void this.query(
      `INSERT INTO notification_logs (id, category, message, status, channel, recipient_roles, created_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
      [
        record.id,
        record.category,
        record.message,
        record.status,
        record.channel,
        JSON.stringify(record.recipientRoles),
        record.createdAt,
      ],
    ).catch(() => undefined);
  }

  private normalizeWhatsappPhone(phone: string) {
    const digits = (phone || '').replace(/\D/g, '');
    const countryCode =
      (process.env.WHATSAPP_DEFAULT_COUNTRY_CODE || '91').replace(/\D/g, '') ||
      '91';

    if (!digits) {
      return '';
    }

    if (digits.length === 10) {
      return `+${countryCode}${digits}`;
    }

    if (digits.length > 10) {
      return `+${digits}`;
    }

    return '';
  }

  private getActiveWhatsappRecipients(employees: EmployeeRecord[]) {
    return Array.from(
      new Set(
        employees
          .filter((employee) => employee.active)
          .map((employee) => this.normalizeWhatsappPhone(employee.phone || ''))
          .filter(Boolean),
      ),
    );
  }

  private async resolveTaskWhatsappAudience() {
    await this.syncEmployeesFromDatabase();
    const allEmployees = Array.from(this.employees.values());

    const managerEmployees = allEmployees.filter((employee) =>
      employee.roles.some((role) => TASK_ADMIN_WHATSAPP_ROLES.includes(role)),
    );

    return {
      recipients: this.getActiveWhatsappRecipients(managerEmployees),
      recipientRoles: [...TASK_ADMIN_WHATSAPP_ROLES],
    };
  }

  private async sendTaskWhatsappNotification(
    category: string,
    taskView: Awaited<ReturnType<CoreService['getTaskById']>>,
    message: string,
  ) {
    const audience = await this.resolveTaskWhatsappAudience();
    const delivery = await this.whatsappService.sendMessage(
      audience.recipients,
      message,
    );
    const logMessage = delivery.detail
      ? `${message} (${delivery.detail})`
      : message;
    this.addNotification(
      category,
      logMessage,
      delivery.status,
      'WHATSAPP',
      audience.recipientRoles,
    );
    return delivery;
  }

  private async sendTaskWhatsappTemplateNotification(
    category: string,
    taskView: Awaited<ReturnType<CoreService['getTaskById']>>,
    templateName: string,
    parameters: string[],
    logMessage: string,
  ) {
    const audience = await this.resolveTaskWhatsappAudience();
    const delivery = await this.whatsappService.sendTemplate(
      audience.recipients,
      {
        name: templateName,
        parameters,
      },
    );
    const finalLogMessage = delivery.detail
      ? `${logMessage} (${delivery.detail})`
      : logMessage;
    this.addNotification(
      category,
      finalLogMessage,
      delivery.status,
      'WHATSAPP',
      audience.recipientRoles,
    );
    return delivery;
  }

  private buildTaskWhatsappMessage(
    action: string,
    taskView: Awaited<ReturnType<CoreService['getTaskById']>>,
    actorName: string,
    extraLine?: string,
  ) {
    const assignedEmployees =
      taskView.assignedEmployees.map((employee) => employee.name).join(', ') ||
      'None';

    return [
      `Task: ${taskView.title}`,
      `Project: ${taskView.projectName}`,
      `Assigned: ${assignedEmployees}`,
      `Status: ${taskView.status}`,
      `Updated by: ${actorName}`,
      extraLine || '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  private normalizePage(page = 1) {
    return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  }

  private normalizePerPage(perPage = 25) {
    const normalized =
      Number.isFinite(perPage) && perPage > 0 ? Math.floor(perPage) : 25;
    return Math.min(Math.max(normalized, 1), 100);
  }

  private paginateItems<T>(items: T[], page = 1, perPage = 25) {
    const safePage = this.normalizePage(page);
    const safePerPage = this.normalizePerPage(perPage);
    const offset = (safePage - 1) * safePerPage;

    return {
      items: items.slice(offset, offset + safePerPage),
      total: items.length,
      page: safePage,
      perPage: safePerPage,
    };
  }

  private async fetchPaginatedProjectViews(
    scope: Set<string> | null,
    options: ListQueryOptions,
  ) {
    const safePage = this.normalizePage(options.page);
    const safePerPage = this.normalizePerPage(options.perPage);
    const offset = (safePage - 1) * safePerPage;
    const params: unknown[] = [];
    const where = ['p.deleted_at IS NULL'];
    const search = options.search?.trim().toLowerCase() || '';

    if (scope) {
      params.push(Array.from(scope));
      where.push(
        `EXISTS (
          SELECT 1 FROM project_assignments scoped_pa
          WHERE scoped_pa.project_id = p.id AND scoped_pa.employee_id = ANY($${params.length}::uuid[])
        )`,
      );
    }

    if (search) {
      params.push(`%${search}%`);
      const searchParam = `$${params.length}`;
      where.push(
        `(LOWER(p.name) LIKE ${searchParam}
          OR LOWER(COALESCE(p.project_type, '')) LIKE ${searchParam}
          OR LOWER(COALESCE(p.description, '')) LIKE ${searchParam}
          OR LOWER(COALESCE(p.project_status, '')) LIKE ${searchParam}
          OR EXISTS (
            SELECT 1
            FROM project_assignments search_pa
            INNER JOIN employees search_employee ON search_employee.id = search_pa.employee_id
            WHERE search_pa.project_id = p.id
              AND search_employee.deleted_at IS NULL
              AND LOWER(search_employee.name) LIKE ${searchParam}
          ))`,
      );
    }

    const [countRow] = await this.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM projects p
       WHERE ${where.join(' AND ')}`,
      params,
    );

    params.push(safePerPage, offset);
    const limitParam = `$${params.length - 1}`;
    const offsetParam = `$${params.length}`;
    const rows = await this.query<ProjectRow>(
      `SELECT id, name, code, project_type AS "projectType", description, project_status AS "projectStatus", active, due_date AS "dueDate", created_at AS "createdAt"
       FROM projects p
       WHERE ${where.join(' AND ')}
       ORDER BY p.created_at DESC
       LIMIT ${limitParam} OFFSET ${offsetParam}`,
      params,
    );

    return {
      items: await this.buildProjectViews(rows),
      total: Number(countRow?.count || '0'),
      page: safePage,
      perPage: safePerPage,
    };
  }

  private async fetchPaginatedTaskViews(
    scope: Set<string> | null,
    options: ListQueryOptions,
  ) {
    const safePage = this.normalizePage(options.page);
    const safePerPage = this.normalizePerPage(options.perPage);
    const offset = (safePage - 1) * safePerPage;
    const params: unknown[] = [];
    const where = ['t.deleted_at IS NULL'];
    const search = options.search?.trim().toLowerCase() || '';

    if (scope) {
      params.push(Array.from(scope));
      where.push(
        `EXISTS (
          SELECT 1 FROM task_assignments scoped_ta
          WHERE scoped_ta.task_id = t.id AND scoped_ta.employee_id = ANY($${params.length}::uuid[])
        )`,
      );
    }

    if (options.openOnly) {
      where.push(`t.status <> 'COMPLETED'`);
    }

    if (search) {
      params.push(`%${search}%`);
      const searchParam = `$${params.length}`;
      where.push(
        `(LOWER(t.title) LIKE ${searchParam}
          OR LOWER(COALESCE(t.description, '')) LIKE ${searchParam}
          OR LOWER(COALESCE(t.status, '')) LIKE ${searchParam}
          OR LOWER(COALESCE(t.type, '')) LIKE ${searchParam}
          OR LOWER(COALESCE(p.name, '')) LIKE ${searchParam}
          OR EXISTS (
            SELECT 1
            FROM task_assignments search_ta
            INNER JOIN employees search_employee ON search_employee.id = search_ta.employee_id
            WHERE search_ta.task_id = t.id
              AND search_employee.deleted_at IS NULL
              AND LOWER(search_employee.name) LIKE ${searchParam}
          ))`,
      );
    }

    const fromClause = `
      FROM tasks t
      LEFT JOIN projects p ON p.id = t.project_id AND p.deleted_at IS NULL
      WHERE ${where.join(' AND ')}`;
    const [countRow] = await this.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count ${fromClause}`,
      params,
    );

    params.push(safePerPage, offset);
    const limitParam = `$${params.length - 1}`;
    const offsetParam = `$${params.length}`;
    const rows = await this.query<TaskRow>(
      `SELECT t.id, t.title, t.description, t.type, t.status, t.project_id AS "projectId", t.due_date AS "dueDate", t.created_at AS "createdAt"
       ${fromClause}
       ORDER BY t.created_at DESC
       LIMIT ${limitParam} OFFSET ${offsetParam}`,
      params,
    );

    return {
      items: await this.buildTaskViews(rows),
      total: Number(countRow?.count || '0'),
      page: safePage,
      perPage: safePerPage,
    };
  }

  private getNotificationLogText(log: NotificationRecord) {
    return `${log.category}\n${log.message}`.toLowerCase();
  }

  private notificationTextIncludes(text: string, value?: string | null) {
    const normalized = value?.trim().toLowerCase();
    return Boolean(normalized && text.includes(normalized));
  }

  private notificationMatchesEmployeeScope(
    log: NotificationRecord,
    scope: Set<string> | null,
    taskViews: Awaited<ReturnType<CoreService['buildTaskViews']>>,
  ) {
    if (!scope) {
      return true;
    }

    if (!log.category.startsWith('Task')) {
      return false;
    }

    const text = this.getNotificationLogText(log);
    const scopedEmployees = Array.from(scope)
      .map((employeeId) => this.employees.get(employeeId))
      .filter((employee): employee is EmployeeRecord => Boolean(employee));

    if (
      scopedEmployees.some(
        (employee) =>
          this.notificationTextIncludes(text, employee.name) ||
          this.notificationTextIncludes(text, employee.email),
      )
    ) {
      return true;
    }

    return taskViews.some(
      (task) =>
        task.assignedEmployeeIds.some((employeeId) => scope.has(employeeId)) &&
        this.notificationTextIncludes(text, task.title),
    );
  }

  private async fetchNotificationLogs(
    page = 1,
    perPage = 25,
    scope: Set<string> | null = null,
  ) {
    const safePage = this.normalizePage(page);
    const safePerPage = this.normalizePerPage(perPage);
    const offset = (safePage - 1) * safePerPage;
    const taskViews = scope ? await this.buildTaskViews() : [];

    try {
      const [items, countRows] = await Promise.all([
        this.query<NotificationRecord>(
          `SELECT id, category, message, status, channel, recipient_roles AS "recipientRoles", created_at AS "createdAt"
           FROM notification_logs
           WHERE channel = 'WHATSAPP'
             AND (category LIKE 'Task%' OR category LIKE 'Weekly MIS%' OR category LIKE 'Monthly TMS%' OR category LIKE 'Daily Pending%')
           ORDER BY created_at DESC`,
        ),
        this.query<Array<{ count: string }> extends (infer T)[] ? T : never>(
          `SELECT COUNT(*)::text AS count
           FROM notification_logs
           WHERE channel = 'WHATSAPP'
             AND (category LIKE 'Task%' OR category LIKE 'Weekly MIS%' OR category LIKE 'Monthly TMS%' OR category LIKE 'Daily Pending%')`,
        ),
      ]);
      const filtered = scope
        ? items.filter((item) =>
            this.notificationMatchesEmployeeScope(item, scope, taskViews),
          )
        : items;

      return {
        items: filtered.slice(offset, offset + safePerPage),
        total: scope ? filtered.length : Number(countRows[0]?.count || '0'),
        page: safePage,
        perPage: safePerPage,
      };
    } catch {
      const filtered = this.notifications.filter(
        (item) =>
          item.channel === 'WHATSAPP' && item.category.startsWith('Task'),
      );
      const scoped = scope
        ? filtered.filter((item) =>
            this.notificationMatchesEmployeeScope(item, scope, taskViews),
          )
        : filtered;
      const items = scoped.slice(offset, offset + safePerPage);
      return {
        items,
        total: scoped.length,
        page: safePage,
        perPage: safePerPage,
      };
    }
  }

  private canManageRecords(employee: EmployeeRecord) {
    return this.getHighestRolePower(employee.roles) >= ROLE_POWER.ADMIN;
  }

  async requireAdminAccess(authorization?: string) {
    const employee = await this.getCurrentEmployee(authorization);
    if (!this.canManageRecords(employee)) {
      throw new UnauthorizedException('Admin access is required.');
    }

    return employee;
  }

  private canCreateEditTeamRecords(employee: EmployeeRecord) {
    return this.getHighestRolePower(employee.roles) >= ROLE_POWER.LEADER;
  }

  async login(email: string, password: string) {
    const result = await this.fetchUserEmployeeRows(
      undefined,
      undefined,
      email,
    );
    const user = result[0];

    if (!user || !this.passwordsMatch(password, user.password)) {
      throw new UnauthorizedException('Invalid email or password.');
    }
    if (user.isActive === false) {
      throw new UnauthorizedException('Employee is inactive.');
    }

    const employee = this.buildEmployeeRecord(user, [], []);
    this.employees.set(employee.id, employee);

    return {
      message: 'Login successful',
      data: {
        access_token: this.buildToken({
          id: user.userId,
          email: employee.email,
        }),
        id: employee.id,
        name: employee.name,
        email: employee.email,
        roles: employee.roles,
        companyKey: 'company_1',
      },
    };
  }

  getMeta() {
    return {
      roles: ROLE_OPTIONS,
      taskTypes: ['SIMPLE'],
    };
  }

  async getEmployees(authorization?: string, options?: ListQueryOptions) {
    const currentEmployee = await this.getCurrentEmployee(authorization);
    await this.syncEmployeesFromDatabase();
    const scope = this.getVisibleEmployeeScope(currentEmployee);
    const search = options?.search?.trim().toLowerCase() || '';
    const employees = Array.from(this.employees.values())
      .filter((employee) => this.itemMatchesEmployeeScope([employee.id], scope))
      .filter((employee) => {
        if (!search) {
          return true;
        }

        return [
          employee.name,
          employee.email,
          employee.phone,
          employee.leaderName,
          employee.roles.join(' '),
        ]
          .filter(Boolean)
          .some((value) => value?.toLowerCase().includes(search));
      });

    if (options?.page) {
      return this.paginateItems(employees, options.page, options.perPage);
    }

    return employees;
  }

  async getLeaders(authorization?: string) {
    const currentEmployee = await this.getCurrentEmployee(authorization);
    const scope = this.getVisibleEmployeeScope(currentEmployee);
    const employees = await this.syncEmployeesFromDatabase();
    return employees.filter(
      (employee) =>
        employee.active &&
        this.getHighestRolePower(employee.roles) >= ROLE_POWER.LEADER &&
        this.itemMatchesEmployeeScope([employee.id], scope),
    );
  }

  async updateMyLeader(
    authorization: string | undefined,
    payload: { leaderId?: string | null },
  ) {
    const currentEmployee = await this.getCurrentEmployee(authorization);
    await this.ensureEmployeeHierarchyColumn();

    const leaderId = payload.leaderId || null;
    if (leaderId === currentEmployee.id) {
      throw new BadRequestException('You cannot select yourself as leader.');
    }

    if (leaderId) {
      const leaders = await this.getLeaders(authorization);
      if (!leaders.some((leader) => leader.id === leaderId)) {
        throw new NotFoundException('Leader not found.');
      }
    }

    await this.query(
      `UPDATE employees
       SET leader_id = $2,
           updated_at = $3
       WHERE id = $1 AND deleted_at IS NULL`,
      [currentEmployee.id, leaderId, new Date().toISOString()],
    );

    const employees = await this.syncEmployeesFromDatabase();
    return employees.find((employee) => employee.id === currentEmployee.id);
  }

  async createEmployee(
    authorization: string | undefined,
    payload: {
      name: string;
      email?: string;
      phone?: string;
      password?: string;
      roles?: Role[];
      active?: boolean;
      loginEnabled?: boolean;
      loginEmail?: string;
      permissionRoles?: string[];
    },
  ) {
    const currentEmployee = await this.getCurrentEmployee(authorization);
    if (!this.canCreateEditTeamRecords(currentEmployee)) {
      throw new UnauthorizedException(
        'Only leader-level or higher users can create employees.',
      );
    }

    await this.ensureEmployeeHierarchyColumn();

    const id = randomUUID();
    const now = new Date().toISOString();
    const requestedRoles = this.normalizeRoles(
      payload.roles?.length ? payload.roles : ['EMPLOYEE'],
      payload.email,
    );
    const allowedRoles = this.getAssignableRolesForEmployee(currentEmployee);
    const roles = requestedRoles.filter((role) => allowedRoles.includes(role));
    const normalizedRoles = roles.length ? roles : ['EMPLOYEE'];
    const active = typeof payload.active === 'boolean' ? payload.active : true;
    const loginEnabled = Boolean(payload.loginEnabled);
    const employeeEmail =
      payload.email?.trim().toLowerCase() ||
      payload.loginEmail?.trim().toLowerCase() ||
      '';
    const loginEmail =
      payload.loginEmail?.trim().toLowerCase() || employeeEmail;

    await this.query(
      `INSERT INTO employees (id, name, roles, is_active, phone, leader_id, created_at, updated_at, deleted_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        id,
        payload.name.trim(),
        normalizedRoles,
        active,
        payload.phone?.trim() || '',
        currentEmployee.roles.includes('LEADER') &&
        this.getHighestRolePower(currentEmployee.roles) === ROLE_POWER.LEADER
          ? currentEmployee.id
          : null,
        now,
        now,
        null,
      ],
    );

    if (loginEnabled) {
      if (!loginEmail) {
        throw new BadRequestException(
          'Login email is required when login access is enabled.',
        );
      }
      if (!payload.password?.trim()) {
        throw new BadRequestException(
          'Login password is required when login access is enabled.',
        );
      }

      await this.query(
        `INSERT INTO users (id, email, password, roles, employee_id, created_at, updated_at, deleted_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          id,
          loginEmail,
          this.hashPassword(payload.password),
          normalizedRoles,
          id,
          now,
          now,
          null,
        ],
      );
    }

    const employees = await this.syncEmployeesFromDatabase();
    const employee = employees.find((item) => item.id === id);
    if (!employee) {
      throw new NotFoundException('Employee not found after create.');
    }

    this.addNotification('Employee', `Created employee ${employee.name}.`);
    return employee;
  }

  async updateEmployee(
    authorization: string | undefined,
    employeeId: string,
    payload: {
      name?: string;
      email?: string;
      phone?: string;
      password?: string;
      roles?: Role[];
      active?: boolean;
      loginEnabled?: boolean;
      loginEmail?: string;
      permissionRoles?: string[];
    },
  ) {
    const currentEmployee = await this.getCurrentEmployee(authorization);
    if (!this.canCreateEditTeamRecords(currentEmployee)) {
      throw new UnauthorizedException(
        'Only leader-level or higher users can update employees.',
      );
    }
    await this.ensureEmployeeHierarchyColumn();
    const existingEmployeeRows = await this.fetchEmployeeListRows(employeeId);
    const existingEmployee = existingEmployeeRows[0];
    const existingUserRows = await this.fetchUserEmployeeRows(
      undefined,
      employeeId,
    );
    const existingUser = existingUserRows[0];
    const archivedUser = await this.fetchAnyUserEmployeeRow(employeeId);

    if (!existingEmployee) {
      throw new NotFoundException('Employee not found.');
    }

    const visibleScope = this.getVisibleEmployeeScope(currentEmployee);
    if (!this.itemMatchesEmployeeScope([employeeId], visibleScope)) {
      throw new UnauthorizedException(
        'You do not have access to update this employee.',
      );
    }

    const nextName =
      payload.name?.trim() || existingEmployee.name || 'Employee';
    const nextPhone = payload.phone?.trim() ?? existingEmployee.phone ?? '';
    const requestedNextRoles = this.normalizeRoles(
      payload.roles?.length
        ? payload.roles
        : existingEmployee.employeeRoles || existingEmployee.userRoles,
      existingEmployee.email || undefined,
    );
    const allowedRoles = this.getAssignableRolesForEmployee(currentEmployee);
    const nextRoles = requestedNextRoles.filter((role) => allowedRoles.includes(role));
    const normalizedNextRoles = nextRoles.length ? nextRoles : ['EMPLOYEE'];
    const nextActive =
      typeof payload.active === 'boolean'
        ? payload.active
        : (existingEmployee.isActive ?? true);
    const nextLoginEnabled =
      typeof payload.loginEnabled === 'boolean'
        ? payload.loginEnabled
        : Boolean(existingUser || archivedUser);
    const nextEmail =
      payload.email?.trim().toLowerCase() ||
      existingEmployee.email ||
      existingUser?.email ||
      archivedUser?.email ||
      '';
    const nextLoginEmail =
      payload.loginEmail?.trim().toLowerCase() ||
      existingUser?.email ||
      archivedUser?.email ||
      nextEmail;
    const nextPassword = payload.password?.trim()
      ? this.hashPassword(payload.password)
      : existingUser?.password || archivedUser?.password;
    const now = new Date().toISOString();

    await this.query(
      `UPDATE employees
       SET name = $2,
           roles = $3,
           is_active = $4,
           phone = $5,
           updated_at = $6
       WHERE id = $1 AND deleted_at IS NULL`,
      [employeeId, nextName, normalizedNextRoles, nextActive, nextPhone, now],
    );

    if (nextLoginEnabled) {
      if (!nextLoginEmail) {
        throw new BadRequestException(
          'Login email is required when login access is enabled.',
        );
      }
      if (!nextPassword) {
        throw new BadRequestException(
          'Login password is required when login access is enabled.',
        );
      }

      if (existingUser || archivedUser) {
        await this.query(
          `UPDATE users
           SET email = $2,
               password = $3,
               roles = $4,
               updated_at = $5,
               deleted_at = NULL
           WHERE employee_id = $1`,
          [employeeId, nextLoginEmail, nextPassword, nextRoles, now],
        );
      } else {
        await this.query(
          `INSERT INTO users (id, email, password, roles, employee_id, created_at, updated_at, deleted_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            employeeId,
            nextLoginEmail,
            nextPassword,
            nextRoles,
            employeeId,
            now,
            now,
            null,
          ],
        );
      }
    } else {
      await this.query(
        `UPDATE users
         SET deleted_at = $2,
             updated_at = $2
         WHERE employee_id = $1 AND deleted_at IS NULL`,
        [employeeId, now],
      );
    }

    const employees = await this.syncEmployeesFromDatabase();
    const employee = employees.find((item) => item.id === employeeId);
    if (!employee) {
      throw new NotFoundException('Employee not found after update.');
    }

    this.addNotification('Employee', `${employee.name} updated successfully.`);
    return employee;
  }

  async deleteEmployee(authorization: string | undefined, employeeId: string) {
    const currentEmployee = await this.getCurrentEmployee(authorization);
    if (!this.canManageRecords(currentEmployee)) {
      throw new UnauthorizedException('Only admin-level users can delete employees.');
    }
    if (currentEmployee.id === employeeId) {
      throw new UnauthorizedException('You cannot delete your own account.');
    }

    const existingRows = await this.fetchUserEmployeeRows(
      undefined,
      employeeId,
    );
    const employeeRow = existingRows[0];
    if (!employeeRow) {
      throw new NotFoundException('Employee not found.');
    }

    const now = new Date().toISOString();
    await this.query(
      `UPDATE employees
       SET is_active = FALSE,
           deleted_at = $2,
           updated_at = $2
       WHERE id = $1 AND deleted_at IS NULL`,
      [employeeId, now],
    );

    await this.query(
      `UPDATE users
       SET deleted_at = $2,
           updated_at = $2
       WHERE employee_id = $1 AND deleted_at IS NULL`,
      [employeeId, now],
    );

    await this.syncEmployeesFromDatabase();
    this.addNotification(
      'Employee',
      `${employeeRow.name || this.formatName(employeeRow.email)} was soft deleted.`,
    );
    return { success: true };
  }

  async getProjects(authorization?: string, options?: ListQueryOptions) {
    const employee = await this.getCurrentEmployee(authorization);
    const scope = this.getVisibleEmployeeScope(employee);
    const requestedScope = this.getRequestedEmployeeScope(scope, options?.employeeIds);

    if (options?.page) {
      return this.fetchPaginatedProjectViews(requestedScope, options);
    }

    const projects = await this.buildProjectViews();

    const search = options?.search?.trim().toLowerCase() || '';
    const visibleProjects = projects
      .filter((project) =>
        this.itemMatchesEmployeeScope(project.assignedEmployeeIds, requestedScope),
      )
      .filter((project) => {
        if (!search) {
          return true;
        }

        return [
          project.name,
          project.projectType,
          project.description,
          project.projectStatus,
          project.assignedEmployees
            .map((assignedEmployee) => assignedEmployee.name)
            .join(' '),
        ]
          .filter(Boolean)
          .some((value) => value?.toLowerCase().includes(search));
      });

    return visibleProjects;
  }

  async createProject(
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
    const currentEmployee = await this.getCurrentEmployee(authorization);
    if (!this.canCreateEditTeamRecords(currentEmployee)) {
      throw new UnauthorizedException(
        'Only leader-level or higher users can create projects.',
      );
    }
    await this.syncEmployeesFromDatabase();
    const visibleScope = this.getVisibleEmployeeScope(currentEmployee);
    const assignedEmployeeIds = visibleScope
      ? (payload.assignedEmployeeIds || []).filter((employeeId) =>
          visibleScope.has(employeeId),
        )
      : payload.assignedEmployeeIds || [];

    const id = randomUUID();
    const now = new Date().toISOString();
    await this.query(
      `INSERT INTO projects (id, name, code, project_type, description, project_status, active, due_date, created_at, updated_at, deleted_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        id,
        payload.name.trim(),
        this.buildProjectCode(payload.name),
        payload.projectType?.trim() || '',
        payload.description?.trim() || '',
        payload.projectStatus || 'NOT_STARTED',
        true,
        payload.dueDate || null,
        now,
        now,
        null,
      ],
    );

    for (const employeeId of assignedEmployeeIds) {
      await this.query(
        `INSERT INTO project_assignments (project_id, employee_id, created_at)
         VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING`,
        [id, employeeId, now],
      );
    }

    this.addNotification('Project', `Created project ${payload.name.trim()}.`);
    const projects = await this.buildProjectViews(
      await this.fetchProjectRows([id]),
    );
    return projects[0];
  }

  async updateProject(
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
    const currentEmployee = await this.getCurrentEmployee(authorization);
    if (!this.canCreateEditTeamRecords(currentEmployee)) {
      throw new UnauthorizedException(
        'Only leader-level or higher users can update projects.',
      );
    }

    const projectRows = await this.fetchProjectRows([projectId]);
    const existing = projectRows[0];
    if (!existing) {
      throw new NotFoundException('Project not found.');
    }
    const visibleScope = this.getVisibleEmployeeScope(currentEmployee);
    const existingProjectViews = await this.buildProjectViews(projectRows);
    if (
      !existingProjectViews[0] ||
      !this.itemMatchesEmployeeScope(
        existingProjectViews[0].assignedEmployeeIds,
        visibleScope,
      )
    ) {
      throw new UnauthorizedException(
        'You do not have access to update this project.',
      );
    }

    const now = new Date().toISOString();
    await this.query(
      `UPDATE projects
       SET name = $2,
           code = $3,
           project_type = $4,
           description = $5,
           project_status = $6,
           due_date = $7,
           updated_at = $8
       WHERE id = $1 AND deleted_at IS NULL`,
      [
        projectId,
        payload.name?.trim() || existing.name,
        existing.code,
        payload.projectType?.trim() ?? existing.projectType ?? '',
        payload.description?.trim() ?? existing.description ?? '',
        payload.projectStatus || existing.projectStatus || 'NOT_STARTED',
        Object.prototype.hasOwnProperty.call(payload, 'dueDate')
          ? payload.dueDate
          : existing.dueDate,
        now,
      ],
    );

    if (payload.assignedEmployeeIds) {
      const nextAssignedEmployeeIds = visibleScope
        ? payload.assignedEmployeeIds.filter((employeeId) =>
            visibleScope.has(employeeId),
          )
        : payload.assignedEmployeeIds;
      await this.query(
        `DELETE FROM project_assignments WHERE project_id = $1`,
        [projectId],
      );
      for (const employeeId of nextAssignedEmployeeIds) {
        await this.query(
          `INSERT INTO project_assignments (project_id, employee_id, created_at)
           VALUES ($1, $2, $3)
           ON CONFLICT DO NOTHING`,
          [projectId, employeeId, now],
        );
      }
    }

    this.addNotification(
      'Project',
      `Updated project ${payload.name?.trim() || existing.name}.`,
    );
    const projects = await this.buildProjectViews(
      await this.fetchProjectRows([projectId]),
    );
    return projects[0];
  }
  async getTasks(authorization?: string, options?: ListQueryOptions) {
    const employee = await this.getCurrentEmployee(authorization);
    const scope = this.getVisibleEmployeeScope(employee);

    if (options?.page) {
      return this.fetchPaginatedTaskViews(scope, options);
    }

    const taskViews = await this.buildTaskViews();

    const search = options?.search?.trim().toLowerCase() || '';
    const visibleTasks = taskViews
      .filter((task) =>
        this.itemMatchesEmployeeScope(task.assignedEmployeeIds, scope),
      )
      .filter((task) => {
        if (options?.openOnly && task.status === 'COMPLETED') {
          return false;
        }

        if (!search) {
          return true;
        }

        return [
          task.title,
          task.description,
          task.projectName,
          task.status,
          task.type,
          task.assignedEmployees
            .map((assignedEmployee) => assignedEmployee.name)
            .join(' '),
        ]
          .filter(Boolean)
          .some((value) => value?.toLowerCase().includes(search));
      });

    return visibleTasks;
  }

  async getTaskById(authorization: string | undefined, taskId: string) {
    const currentEmployee = await this.getCurrentEmployee(authorization);
    const rows = await this.fetchTaskRows([taskId]);
    const task = rows[0];
    if (!task) {
      throw new NotFoundException('Task not found.');
    }

    const views = await this.buildTaskViews([task]);
    const view = views[0];
    if (!view) {
      throw new NotFoundException('Task not found.');
    }

    if (
      !this.itemMatchesEmployeeScope(
        view.assignedEmployeeIds,
        this.getVisibleEmployeeScope(currentEmployee),
      )
    ) {
      throw new UnauthorizedException('You do not have access to this task.');
    }

    return view;
  }

  async createTask(
    authorization: string | undefined,
    payload: {
      title: string;
      description?: string;
      type?: TaskType;
      projectId: string;
      dueDate?: string | null;
      assignedEmployeeIds?: string[];
      media?: TaskMediaPayload[];
    },
  ) {
    const currentEmployee = await this.getCurrentEmployee(authorization);
    await this.syncEmployeesFromDatabase();

    const projectRows = await this.fetchProjectRows([payload.projectId]);
    const project = projectRows[0];
    if (!project) {
      throw new NotFoundException('Project not found.');
    }

    const visibleScope = this.getVisibleEmployeeScope(currentEmployee);
    const requestedAssignedEmployeeIds = payload.assignedEmployeeIds?.length
      ? payload.assignedEmployeeIds
      : this.canManageRecords(currentEmployee)
        ? []
        : [currentEmployee.id];
    const assignedEmployeeIds = visibleScope
      ? requestedAssignedEmployeeIds.filter((employeeId) =>
          visibleScope.has(employeeId),
        )
      : requestedAssignedEmployeeIds;
    if (
      !this.canManageRecords(currentEmployee) &&
      !assignedEmployeeIds.length
    ) {
      assignedEmployeeIds.push(currentEmployee.id);
    }

    const id = randomUUID();
    const now = new Date().toISOString();
    await this.query(
      `INSERT INTO tasks (id, title, description, type, status, project_id, due_date, created_at, updated_at, deleted_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        id,
        payload.title.trim(),
        payload.description?.trim() || '',
        payload.type || 'SIMPLE',
        'PENDING',
        payload.projectId,
        payload.dueDate || null,
        now,
        now,
        null,
      ],
    );

    for (const employeeId of assignedEmployeeIds) {
      await this.query(
        `INSERT INTO task_assignments (task_id, employee_id, created_at)
         VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING`,
        [id, employeeId, now],
      );
    }

    await this.replaceTaskMedia(id, payload.media || []);

    await this.appendTaskNote(
      id,
      currentEmployee.id,
      `${currentEmployee.name} created this task.`,
    );
    const taskView = await this.getTaskById(authorization, id);
    await this.sendTaskWhatsappTemplateNotification(
      'Task',
      taskView,
      'task_created_notification',
      [
        taskView.title,
        taskView.projectName,
        taskView.assignedEmployees
          .map((employee) => employee.name)
          .join(', ') || 'None',
      ],
      this.buildTaskWhatsappMessage('Created', taskView, currentEmployee.name),
    );
    return taskView;
  }

  async updateTask(
    authorization: string | undefined,
    taskId: string,
    payload: {
      title?: string;
      description?: string;
      type?: TaskType;
      status?: TaskStatus;
      projectId?: string;
      dueDate?: string | null;
      assignedEmployeeIds?: string[];
      media?: TaskMediaPayload[];
    },
  ) {
    const currentEmployee = await this.getCurrentEmployee(authorization);
    const existingRows = await this.fetchTaskRows([taskId]);
    const existing = existingRows[0];
    if (!existing) {
      throw new NotFoundException('Task not found.');
    }

    const previousView = await this.getTaskById(authorization, taskId);
    const nextProjectId = payload.projectId || existing.projectId;
    const projectRows = await this.fetchProjectRows([nextProjectId]);
    if (!projectRows[0]) {
      throw new NotFoundException('Project not found.');
    }

    const now = new Date().toISOString();
    await this.query(
      `UPDATE tasks
       SET title = $2,
           description = $3,
           type = $4,
           status = $5,
           project_id = $6,
           due_date = $7,
           updated_at = $8
       WHERE id = $1 AND deleted_at IS NULL`,
      [
        taskId,
        payload.title?.trim() || existing.title,
        payload.description?.trim() ?? existing.description ?? '',
        payload.type || existing.type,
        payload.status || existing.status,
        nextProjectId,
        Object.prototype.hasOwnProperty.call(payload, 'dueDate')
          ? payload.dueDate
          : existing.dueDate,
        now,
      ],
    );

    if (payload.assignedEmployeeIds) {
      await this.query(`DELETE FROM task_assignments WHERE task_id = $1`, [
        taskId,
      ]);
      for (const employeeId of payload.assignedEmployeeIds) {
        await this.query(
          `INSERT INTO task_assignments (task_id, employee_id, created_at)
           VALUES ($1, $2, $3)
           ON CONFLICT DO NOTHING`,
          [taskId, employeeId, now],
        );
      }
    }

    await this.replaceTaskMedia(taskId, payload.media);

    const nextView = await this.getTaskById(authorization, taskId);
    const changeSummary: string[] = [];
    if ((payload.title?.trim() || existing.title) !== existing.title) {
      changeSummary.push(`title to "${nextView.title}"`);
    }
    if (
      (payload.description?.trim() ?? existing.description ?? '') !==
      (existing.description ?? '')
    ) {
      changeSummary.push('description');
    }
    if ((payload.type || existing.type) !== existing.type) {
      changeSummary.push(`type to ${nextView.type}`);
    }
    if ((payload.status || existing.status) !== existing.status) {
      changeSummary.push(`status to ${nextView.status}`);
    }
    if (nextProjectId !== existing.projectId) {
      changeSummary.push(`project to ${nextView.projectName}`);
    }
    const nextDueDate = Object.prototype.hasOwnProperty.call(payload, 'dueDate')
      ? payload.dueDate
      : existing.dueDate;
    if ((nextDueDate || null) !== (existing.dueDate || null)) {
      changeSummary.push(`due date to ${nextView.dueDate || 'Not set'}`);
    }
    if (payload.assignedEmployeeIds) {
      const previousAssigned = [...previousView.assignedEmployeeIds]
        .sort()
        .join(',');
      const nextAssigned = [...nextView.assignedEmployeeIds].sort().join(',');
      if (previousAssigned !== nextAssigned) {
        changeSummary.push(
          `assignees to ${nextView.assignedEmployees.map((employee) => employee.name).join(', ') || 'None'}`,
        );
      }
    }
    if (payload.media) {
      const previousMedia = (previousView.media || [])
        .map((item) => item.id || item.url)
        .sort()
        .join(',');
      const nextMedia = (nextView.media || [])
        .map((item) => item.id || item.url)
        .sort()
        .join(',');
      if (previousMedia !== nextMedia) {
        changeSummary.push('attachments');
      }
    }

    if (changeSummary.length) {
      await this.appendTaskNote(
        taskId,
        currentEmployee.id,
        `${currentEmployee.name} updated ${changeSummary.join(', ')}.`,
        (payload.status || existing.status) === 'COMPLETED' &&
          existing.status !== 'COMPLETED',
      );
    }

    await this.sendTaskWhatsappTemplateNotification(
      'Task',
      nextView,
      'task_update_notifications',
      [
        nextView.title,
        nextView.assignedEmployees
          .map((employee) => employee.name)
          .join(', ') || 'None',
        this.formatStatusLabel(nextView.status),
      ],
      this.buildTaskWhatsappMessage(
        'Updated',
        nextView,
        currentEmployee.name,
        `Changes: ${changeSummary.join(', ') || 'Task details updated.'}`,
      ),
    );
    return nextView;
  }

  async updateTaskStatus(
    authorization: string | undefined,
    taskId: string,
    payload: { status: TaskStatus },
  ) {
    return this.updateTask(authorization, taskId, { status: payload.status });
  }

  async addTaskNote(
    authorization: string | undefined,
    taskId: string,
    payload: { message: string; markDone?: boolean },
  ) {
    const currentEmployee = await this.getCurrentEmployee(authorization);
    const existingRows = await this.fetchTaskRows([taskId]);
    const task = existingRows[0];
    if (!task) {
      throw new NotFoundException('Task not found.');
    }

    const taskView = await this.getTaskById(authorization, taskId);
    if (
      !this.itemMatchesEmployeeScope(
        taskView.assignedEmployeeIds,
        this.getVisibleEmployeeScope(currentEmployee),
      )
    ) {
      throw new UnauthorizedException(
        'You do not have access to add notes to this task.',
      );
    }

    const message = payload.message?.trim();
    if (!message) {
      throw new BadRequestException('Task note is required.');
    }

    await this.appendTaskNote(
      taskId,
      currentEmployee.id,
      message,
      Boolean(payload.markDone),
    );
    const nextView = await this.getTaskById(authorization, taskId);
    await this.sendTaskWhatsappNotification(
      'Task Note',
      nextView,
      this.buildTaskWhatsappMessage(
        payload.markDone ? 'Marked Complete' : 'Note Updated',
        nextView,
        currentEmployee.name,
        `Note: ${message}`,
      ),
    );
    return nextView;
  }

  async deleteTask(authorization: string | undefined, taskId: string) {
    const currentEmployee = await this.getCurrentEmployee(authorization);
    if (!this.canManageRecords(currentEmployee)) {
      throw new UnauthorizedException(
        'You do not have access to delete tasks.',
      );
    }

    const existingRows = await this.fetchTaskRows([taskId]);
    const task = existingRows[0];
    if (!task) {
      throw new NotFoundException('Task not found.');
    }

    const taskView = await this.getTaskById(authorization, taskId);

    await this.query(`DELETE FROM tasks WHERE id = $1`, [taskId]);

    await this.sendTaskWhatsappNotification(
      'Task',
      taskView,
      this.buildTaskWhatsappMessage('Deleted', taskView, currentEmployee.name),
    );
    return { success: true };
  }

  async deleteProject(authorization: string | undefined, projectId: string) {
    const currentEmployee = await this.getCurrentEmployee(authorization);
    if (!this.canManageRecords(currentEmployee)) {
      throw new UnauthorizedException(
        'You do not have access to delete projects.',
      );
    }

    const projectRows = await this.fetchProjectRows([projectId]);
    const project = projectRows[0];
    if (!project) {
      throw new NotFoundException('Project not found.');
    }

    const now = new Date().toISOString();
    await this.query(
      `UPDATE projects SET active = FALSE, deleted_at = $2, updated_at = $2 WHERE id = $1 AND deleted_at IS NULL`,
      [projectId, now],
    );

    this.addNotification(
      'Project',
      `Removed project ${project.name}.`,
      'SENT',
      'WHATSAPP',
      TASK_ADMIN_WHATSAPP_ROLES,
    );
    return { success: true };
  }

  async getMisSummary(authorization?: string) {
    const employee = await this.getCurrentEmployee(authorization);
    const [projectViews, taskViews] = await Promise.all([
      this.buildProjectViews(),
      this.buildTaskViews(),
    ]);
    const scope = this.getVisibleEmployeeScope(employee);
    const assignedProjects = projectViews.filter((project) =>
      this.itemMatchesEmployeeScope(project.assignedEmployeeIds, scope),
    );
    const visibleProjects = assignedProjects.filter(
      (project) => project.projectStatus !== 'COMPLETED',
    );
    const visibleProjectIds = new Set(
      visibleProjects.map((project) => project.id),
    );
    const assignedTasks = taskViews.filter((task) =>
      this.itemMatchesEmployeeScope(task.assignedEmployeeIds, scope),
    );
    const visibleTasks = assignedTasks.filter((task) =>
      visibleProjectIds.has(task.projectId),
    );
    const overdueProjects = visibleProjects.filter(
      (project) =>
        project.dueDate &&
        new Date(project.dueDate).getTime() < Date.now() &&
        project.active,
    );
    const activeEmployees = Array.from(this.employees.values()).filter(
      (item) => item.active && this.itemMatchesEmployeeScope([item.id], scope),
    );

    return {
      generatedAt: new Date().toISOString(),
      activeProjects: visibleProjects.filter((project) => project.active)
        .length,
      stageBreakdown: {
        pending: visibleTasks.filter((task) => task.status === 'PENDING')
          .length,
        inProgress: visibleTasks.filter((task) => task.status === 'IN_PROGRESS')
          .length,
        completed: visibleTasks.filter((task) => task.status === 'COMPLETED')
          .length,
      },
      overdueProjects: overdueProjects.map((project) => ({
        id: project.id,
        name: project.name,
        dueDate: project.dueDate,
        pendingTasks: visibleTasks.filter(
          (task) =>
            task.projectId === project.id && task.status !== 'COMPLETED',
        ).length,
      })),
      employeeTaskBreakdown: activeEmployees.map((item) => {
        const employeeTasks = visibleTasks.filter((task) =>
          task.assignedEmployeeIds.includes(item.id),
        );
        return {
          employeeId: item.id,
          employeeName: item.name,
          employeeEmail: item.email,
          assignedProjects: visibleProjects.filter((project) =>
            project.assignedEmployeeIds.includes(item.id),
          ).length,
          assigned: employeeTasks.length,
          pending: employeeTasks.filter((task) => task.status === 'PENDING')
            .length,
          ongoing: employeeTasks.filter((task) => task.status === 'IN_PROGRESS')
            .length,
          completed: employeeTasks.filter((task) => task.status === 'COMPLETED')
            .length,
          beforeDue: employeeTasks.filter((task) => {
            if (task.status !== 'COMPLETED' || !task.dueDate) {
              return false;
            }
            const completedAt = task.notes
              .filter((note) => note.markDone)
              .sort(
                (left, right) =>
                  new Date(left.createdAt).getTime() -
                  new Date(right.createdAt).getTime(),
              )[0]?.createdAt;
            return Boolean(
              completedAt &&
              new Date(completedAt).getTime() <=
                new Date(task.dueDate).getTime(),
            );
          }).length,
          afterDue: employeeTasks.filter((task) => {
            if (task.status !== 'COMPLETED' || !task.dueDate) {
              return false;
            }
            const completedAt = task.notes
              .filter((note) => note.markDone)
              .sort(
                (left, right) =>
                  new Date(left.createdAt).getTime() -
                  new Date(right.createdAt).getTime(),
              )[0]?.createdAt;
            return Boolean(
              completedAt &&
              new Date(completedAt).getTime() >
                new Date(task.dueDate).getTime(),
            );
          }).length,
        };
      }),
    };
  }

  async getDailyPendingSummary(authorization?: string) {
    const employee = await this.getCurrentEmployee(authorization);
    const [projectViews, taskViews] = await Promise.all([
      this.buildProjectViews(),
      this.buildTaskViews(),
    ]);
    const scope = this.getVisibleEmployeeScope(employee);
    const assignedProjects = projectViews.filter((project) =>
      this.itemMatchesEmployeeScope(project.assignedEmployeeIds, scope),
    );
    const visibleProjects = assignedProjects.filter(
      (project) => project.projectStatus !== 'COMPLETED',
    );
    const visibleProjectIds = new Set(
      visibleProjects.map((project) => project.id),
    );
    const assignedTasks = taskViews.filter((task) =>
      this.itemMatchesEmployeeScope(task.assignedEmployeeIds, scope),
    );
    const visibleTasks = assignedTasks.filter((task) =>
      visibleProjectIds.has(task.projectId),
    );
    const activeEmployees = Array.from(this.employees.values()).filter(
      (item) => item.active && this.itemMatchesEmployeeScope([item.id], scope),
    );
    return {
      generatedAt: new Date().toISOString(),
      totalPendingTasks: visibleTasks.filter(
        (task) => task.status !== 'COMPLETED',
      ).length,
      projects: visibleProjects.map((project) => ({
        projectId: project.id,
        projectName: project.name,
        pendingTasks: visibleTasks.filter(
          (task) =>
            task.projectId === project.id && task.status !== 'COMPLETED',
        ).length,
      })),
      employeeTaskBreakdown: activeEmployees.map((item) => {
        const employeeTasks = visibleTasks.filter((task) =>
          task.assignedEmployeeIds.includes(item.id),
        );
        return {
          employeeId: item.id,
          employeeName: item.name,
          pending: employeeTasks.filter((task) => task.status !== 'COMPLETED')
            .length,
          completed: employeeTasks.filter((task) => task.status === 'COMPLETED')
            .length,
        };
      }),
    };
  }

  async getTaskNotesHistory(authorization?: string, page = 1, perPage = 25) {
    const employee = await this.getCurrentEmployee(authorization);
    const taskViews = await this.buildTaskViews();
    const scope = this.getVisibleEmployeeScope(employee);
    const visibleTaskViews = taskViews.filter((task) =>
      this.itemMatchesEmployeeScope(task.assignedEmployeeIds, scope),
    );

    const noteRows = visibleTaskViews
      .flatMap((task) =>
        task.notes.map((note) => ({
          taskId: task.id,
          taskTitle: task.title,
          projectName: task.projectName,
          taskStatus: task.status,
          note,
        })),
      )
      .sort(
        (left, right) =>
          new Date(right.note.createdAt).getTime() -
          new Date(left.note.createdAt).getTime(),
      );

    const safePage = this.normalizePage(page);
    const safePerPage = this.normalizePerPage(perPage);
    const offset = (safePage - 1) * safePerPage;

    return {
      items: noteRows.slice(offset, offset + safePerPage),
      total: noteRows.length,
      page: safePage,
      perPage: safePerPage,
    };
  }

  async getNotificationLogs(
    authorization?: string,
    page = 1,
    perPage = 25,
    employeeId?: string,
  ) {
    const employee = await this.getCurrentEmployee(authorization);
    const selectedEmployeeId = employeeId?.trim();

    if (selectedEmployeeId) {
      const selectedEmployee = this.employees.get(selectedEmployeeId);
      if (!selectedEmployee || selectedEmployee.active === false) {
        throw new BadRequestException('Selected employee is not available.');
      }

      const isManager = this.canManageRecords(employee);
      const leaderTeamIds = employee.roles.includes('LEADER')
        ? this.getLeaderTeamEmployeeIds(employee.id)
        : [];
      const canViewSelected =
        isManager ||
        selectedEmployeeId === employee.id ||
        leaderTeamIds.includes(selectedEmployeeId);

      if (!canViewSelected) {
        throw new UnauthorizedException('Unauthorized');
      }

      return this.fetchNotificationLogs(
        page,
        perPage,
        new Set([selectedEmployeeId]),
      );
    }

    if (this.canManageRecords(employee)) {
      return this.fetchNotificationLogs(page, perPage);
    }

    return this.fetchNotificationLogs(page, perPage, new Set([employee.id]));
  }
  async runScheduledReports(authorization?: string) {
    await this.getCurrentEmployee(authorization);
    const weeklyMis = await this.getMisSummary(authorization);
    const dailyPending = await this.getDailyPendingSummary(authorization);

    this.addNotification(
      'Report',
      `Weekly MIS prepared with ${weeklyMis.activeProjects} active projects.`,
      'SENT',
      'WHATSAPP',
      TASK_ADMIN_WHATSAPP_ROLES,
    );
    this.addNotification(
      'Report',
      `Daily pending summary prepared with ${dailyPending.totalPendingTasks} open tasks.`,
      'SENT',
      'WHATSAPP',
      TASK_ADMIN_WHATSAPP_ROLES,
    );
    return { success: true, weeklyMis, dailyPending };
  }

  async getDashboard(authorization?: string) {
    const employee = await this.getCurrentEmployee(authorization);
    const notificationScope = this.canManageRecords(employee)
      ? null
      : new Set([employee.id]);
    const [projectViews, allTaskViews, notificationLogsPage] =
      await Promise.all([
        this.buildProjectViews(),
        this.buildTaskViews(),
        this.fetchNotificationLogs(1, 20, notificationScope),
      ]);
    const employees = Array.from(this.employees.values());
    const activeProjectViews = projectViews.filter(
      (project) => project.active && project.projectStatus !== 'COMPLETED',
    );
    const scope = this.getVisibleEmployeeScope(employee);
    const visibleTaskViews = allTaskViews.filter((task) =>
      this.itemMatchesEmployeeScope(task.assignedEmployeeIds, scope),
    );
    const pendingTasks = visibleTaskViews.filter(
      (task) => task.status === 'PENDING',
    );
    const inProgressTasks = visibleTaskViews.filter(
      (task) => task.status === 'IN_PROGRESS',
    );
    const completedTasks = visibleTaskViews.filter(
      (task) => task.status === 'COMPLETED',
    );
    const activeEmployees = employees.filter((item) => item.active);
    const visibleProjects = activeProjectViews.filter((project) =>
      this.itemMatchesEmployeeScope(project.assignedEmployeeIds, scope),
    );
    const overdueProjects = visibleProjects.filter(
      (project) =>
        project.dueDate &&
        new Date(project.dueDate).getTime() < Date.now() &&
        project.active,
    );

    return {
      employee,
      totals: {
        activeProjects: visibleProjects.length,
        activeEmployees: scope
          ? activeEmployees.filter((item) => scope.has(item.id)).length
          : activeEmployees.length,
        visibleTasks: visibleTaskViews.length,
        taskNotifications: notificationLogsPage.total,
      },
      tasksByStatus: {
        pending: pendingTasks.length,
        inProgress: inProgressTasks.length,
        completed: completedTasks.length,
      },
      assignedTasks: visibleTaskViews,
      pendingTasks,
      completedTasks,
      overdueProjects,
      projectPendingSummary: visibleProjects.map((project) => ({
        projectId: project.id,
        projectName: project.name,
        pendingTasks: visibleTaskViews.filter(
          (task) =>
            task.projectId === project.id && task.status !== 'COMPLETED',
        ).length,
      })),
      recentNotifications: notificationLogsPage.items,
    };
  }

  getHealth() {
    return {
      module: 'core',
      status: 'ok',
    };
  }
}
