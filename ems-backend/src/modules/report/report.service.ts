import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { QueryRunner } from 'typeorm';
import {
  AppDataSource,
  ensureDataSourceInitialized,
} from '../../database/data-source';
import { CoreService } from '../core/core.service';
import { WhatsappService } from './whatsapp.service';

const ADMIN_REPORT_ROLES = ['SA1'];

type MisSummary = {
  generatedAt: string;
  activeProjects: number;
  stageBreakdown: {
    pending: number;
    inProgress: number;
    completed: number;
  };
  employeeTaskBreakdown: Array<{
    employeeId: string;
    employeeName: string;
    pending: number;
    completed: number;
  }>;
  overdueProjects: Array<{
    id: string;
    name: string;
    dueDate: string | null;
    pendingTasks: number;
  }>;
};

type DailyPendingSummary = {
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

type MonthlyReportSummary = {
  generatedAt: string;
  month: string;
  periodStart: string;
  periodEnd: string;
  totalTasks: number;
  pendingTasks: number;
  ongoingTasks: number;
  completedTasks: number;
  overdueTasks: number;
  completionRate: number;
  employeeTaskBreakdown: Array<{
    employeeId: string;
    employeeName: string;
    pending: number;
    ongoing: number;
    completed: number;
    overdue: number;
  }>;
  taskDetails: Array<{
    title: string;
    projectName: string;
    employeeNames: string;
    status: string;
    dueDate: string | null;
    createdAt: string;
    overdue: boolean;
  }>;
};

type ReportPeriod = {
  start: Date;
  end: Date;
};

@Injectable()
export class ReportService implements OnModuleInit, OnModuleDestroy {
  private reportSchedulerTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly emsService: CoreService,
    private readonly whatsappService: WhatsappService,
  ) {}

  onModuleInit() {
    void this.runDueAutomaticReports();
    this.reportSchedulerTimer = setInterval(() => {
      void this.runDueAutomaticReports();
    }, 60_000);
  }

  onModuleDestroy() {
    if (this.reportSchedulerTimer) {
      clearInterval(this.reportSchedulerTimer);
      this.reportSchedulerTimer = null;
    }
  }

  private getIndiaDateTimeParts(value = new Date()) {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(value);
    const map = Object.fromEntries(
      parts
        .filter((part) => part.type !== 'literal')
        .map((part) => [part.type, part.value]),
    );

    return {
      year: Number(map.year),
      month: Number(map.month),
      day: Number(map.day),
      weekday: map.weekday,
      hour: Number(map.hour),
      minute: Number(map.minute),
    };
  }

  private isIndiaMonthEnd(parts: ReturnType<ReportService['getIndiaDateTimeParts']>) {
    return parts.day === new Date(parts.year, parts.month, 0).getDate();
  }

  private async runDueAutomaticReports() {
    const parts = this.getIndiaDateTimeParts();

    try {
      if (
        parts.weekday !== 'Sun' &&
        parts.hour === 18 &&
        parts.minute === 0
      ) {
        await this.runDailyPendingReport();
      }

      if (parts.weekday === 'Sun' && parts.hour === 21 && parts.minute === 0) {
        await this.runWeeklyMisReport();
      }

      if (
        this.isIndiaMonthEnd(parts) &&
        parts.hour === 19 &&
        parts.minute === 0
      ) {
        await this.runMonthlyReport();
      }
    } catch (error) {
      console.error('Automatic report scheduler failed', error);
    }
  }

  private async query<T = unknown>(
    sql: string,
    params?: unknown[],
  ): Promise<T[]> {
    await ensureDataSourceInitialized();
    return AppDataSource.query(sql, params) as Promise<T[]>;
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

  private async getRecipientPhonesByRoles(
    roles: string[],
    emails?: string[],
    employeeIds?: string[],
  ) {
    const normalizedEmails = (emails || [])
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean);
    const normalizedEmployeeIds = (employeeIds || []).filter(Boolean);
    const rows = await this.query<
      Array<{ phone: string | null }> extends (infer T)[] ? T : never
    >(
      `SELECT e.phone
       FROM employees e
       LEFT JOIN users u
         ON u.employee_id = e.id
        AND u.deleted_at IS NULL
       WHERE e.deleted_at IS NULL
         AND e.is_active = TRUE
         AND (
           (
             COALESCE(array_length($3::uuid[], 1), 0) > 0
             AND e.id = ANY($3::uuid[])
           )
           OR (
             COALESCE(array_length($3::uuid[], 1), 0) = 0
             AND
             COALESCE(array_length($2::varchar[], 1), 0) > 0
             AND LOWER(u.email) = ANY($2::varchar[])
           )
           OR (
             COALESCE(array_length($3::uuid[], 1), 0) = 0
             AND
             COALESCE(array_length($2::varchar[], 1), 0) = 0
             AND e.roles && $1::varchar[]
           )
         )`,
      [roles, normalizedEmails, normalizedEmployeeIds],
    );

    return Array.from(
      new Set(
        rows
          .map((row) => this.normalizeWhatsappPhone(row.phone || ''))
          .filter(Boolean),
      ),
    );
  }

  private async insertNotificationLog(
    category: string,
    message: string,
    status: 'SENT' | 'FAILED',
    recipientRoles: string[],
  ) {
    await this.query(
      `INSERT INTO notification_logs (id, category, message, status, channel, recipient_roles, created_at)
       VALUES ($1, $2, $3, $4, 'WHATSAPP', $5::jsonb, $6)`,
      [
        randomUUID(),
        category,
        message,
        status,
        JSON.stringify(recipientRoles),
        new Date().toISOString(),
      ],
    );
  }

  private async hasLogForWindow(
    category: string,
    startIso: string,
    endIso: string,
  ) {
    const rows = await this.query<
      Array<{ count: string }> extends (infer T)[] ? T : never
    >(
      `SELECT COUNT(*)::text AS count
       FROM notification_logs
       WHERE category = $1
         AND created_at >= $2
         AND created_at < $3`,
      [category, startIso, endIso],
    );

    return Number(rows[0]?.count || '0') > 0;
  }

  private getAutomaticReportLockKey(
    category: string,
    startIso: string,
    endIso: string,
  ) {
    return `${category}:${startIso}:${endIso}`;
  }

  private async acquireAutomaticReportLock(lockKey: string) {
    await ensureDataSourceInitialized();
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();

    const rows = await queryRunner.query(
      `SELECT pg_try_advisory_lock(hashtext($1)) AS locked`,
      [lockKey],
    );
    const locked = rows[0]?.locked === true || rows[0]?.locked === 't';

    if (!locked) {
      await queryRunner.release();
      return null;
    }

    return queryRunner;
  }

  private async releaseAutomaticReportLock(
    queryRunner: QueryRunner,
    lockKey: string,
  ) {
    try {
      await queryRunner.query(`SELECT pg_advisory_unlock(hashtext($1))`, [
        lockKey,
      ]);
    } finally {
      await queryRunner.release();
    }
  }

  private getDayPeriod(value = new Date()): ReportPeriod {
    const start = new Date(value);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, end };
  }

  private getWeekToDatePeriod(value = new Date()): ReportPeriod {
    const start = new Date(value);
    start.setHours(0, 0, 0, 0);
    const day = start.getDay();
    start.setDate(start.getDate() - (day === 0 ? 6 : day - 1));
    const end = new Date(value);
    end.setHours(0, 0, 0, 0);
    end.setDate(end.getDate() + 1);
    return { start, end };
  }

  private getMonthToDatePeriod(value = new Date()): ReportPeriod {
    const start = new Date(value.getFullYear(), value.getMonth(), 1);
    const end = new Date(value);
    end.setHours(0, 0, 0, 0);
    end.setDate(end.getDate() + 1);
    return { start, end };
  }

  private async buildMisSummary(period?: ReportPeriod): Promise<MisSummary> {
    const params = period ? [period.start.toISOString(), period.end.toISOString()] : undefined;
    const taskPeriodFilter = period ? 'AND t.created_at >= $1::timestamptz AND t.created_at < $2::timestamptz' : '';
    const projectPeriodFilter = period ? 'AND p.created_at >= $1::timestamptz AND p.created_at < $2::timestamptz' : '';
    const [
      activeProjectRows,
      taskBreakdownRows,
      overdueRows,
      employeeTaskRows,
    ] = await Promise.all([
      this.query<Array<{ count: string }> extends (infer T)[] ? T : never>(
        `SELECT COUNT(*)::text AS count
         FROM projects p
         WHERE p.deleted_at IS NULL
           AND p.active = TRUE
           AND p.project_status <> 'COMPLETED'
           ${projectPeriodFilter}`,
        params,
      ),
      this.query<
        Array<{ status: string; count: string }> extends (infer T)[] ? T : never
      >(
        `SELECT status, COUNT(*)::text AS count
         FROM tasks t
         INNER JOIN projects p ON p.id = t.project_id
         WHERE t.deleted_at IS NULL
           AND p.deleted_at IS NULL
           AND p.active = TRUE
           AND p.project_status <> 'COMPLETED'
           ${taskPeriodFilter}
         GROUP BY status`,
        params,
      ),
      this.query<
        Array<{
          id: string;
          name: string;
          dueDate: string | null;
          pendingTasks: string;
        }> extends (infer T)[]
          ? T
          : never
      >(
        `SELECT
           p.id,
           p.name,
           p.due_date AS "dueDate",
           COUNT(t.id)::text AS "pendingTasks"
         FROM projects p
         LEFT JOIN tasks t
           ON t.project_id = p.id
          AND t.deleted_at IS NULL
          AND t.status <> 'COMPLETED'
         WHERE p.deleted_at IS NULL
           AND p.active = TRUE
           AND p.project_status <> 'COMPLETED'
           AND p.due_date IS NOT NULL
           AND p.due_date < NOW()
           ${projectPeriodFilter}
         GROUP BY p.id, p.name, p.due_date
         ORDER BY p.due_date ASC`,
        params,
      ),
      this.query<
        Array<{
          employeeId: string;
          employeeName: string;
          pending: string;
          completed: string;
        }> extends (infer T)[]
          ? T
          : never
      >(
        `SELECT
           e.id AS "employeeId",
           e.name AS "employeeName",
           COUNT(*) FILTER (WHERE t.status = 'PENDING')::text AS "pending",
           COUNT(*) FILTER (WHERE t.status = 'COMPLETED')::text AS "completed"
         FROM employees e
         LEFT JOIN task_assignments ta ON ta.employee_id = e.id
         LEFT JOIN tasks t
           ON t.id = ta.task_id
          AND t.deleted_at IS NULL
          ${taskPeriodFilter}
         LEFT JOIN projects p
           ON p.id = t.project_id
          AND p.deleted_at IS NULL
          AND p.active = TRUE
          AND p.project_status <> 'COMPLETED'
         WHERE e.deleted_at IS NULL
           AND e.is_active = TRUE
         GROUP BY e.id, e.name
         ORDER BY e.name ASC`,
        params,
      ),
    ]);

    const stageBreakdown = {
      pending: 0,
      inProgress: 0,
      completed: 0,
    };

    for (const row of taskBreakdownRows) {
      if (row.status === 'PENDING')
        stageBreakdown.pending = Number(row.count || '0');
      if (row.status === 'IN_PROGRESS')
        stageBreakdown.inProgress = Number(row.count || '0');
      if (row.status === 'COMPLETED')
        stageBreakdown.completed = Number(row.count || '0');
    }

    return {
      generatedAt: new Date().toISOString(),
      activeProjects: Number(activeProjectRows[0]?.count || '0'),
      stageBreakdown,
      employeeTaskBreakdown: employeeTaskRows.map((row) => ({
        employeeId: row.employeeId,
        employeeName: row.employeeName,
        pending: Number(row.pending || '0'),
        completed: Number(row.completed || '0'),
      })),
      overdueProjects: overdueRows.map((row) => ({
        id: row.id,
        name: row.name,
        dueDate: row.dueDate,
        pendingTasks: Number(row.pendingTasks || '0'),
      })),
    };
  }

  private async buildDailySummary(period = this.getDayPeriod()): Promise<DailyPendingSummary> {
    const params = [period.start.toISOString(), period.end.toISOString()];
    const [totalRows, projectRows, employeeRows] = await Promise.all([
      this.query<Array<{ count: string }> extends (infer T)[] ? T : never>(
        `SELECT COUNT(*)::text AS count
         FROM tasks t
         INNER JOIN projects p ON p.id = t.project_id
         WHERE t.deleted_at IS NULL
           AND t.status <> 'COMPLETED'
           AND p.deleted_at IS NULL
           AND p.active = TRUE
           AND p.project_status <> 'COMPLETED'
           AND t.created_at >= $1::timestamptz
           AND t.created_at < $2::timestamptz`,
        params,
      ),
      this.query<
        Array<{
          projectId: string;
          projectName: string;
          pendingTasks: string;
        }> extends (infer T)[]
          ? T
          : never
      >(
        `SELECT
           p.id AS "projectId",
           p.name AS "projectName",
           COUNT(t.id)::text AS "pendingTasks"
         FROM projects p
         LEFT JOIN tasks t
           ON t.project_id = p.id
          AND t.deleted_at IS NULL
          AND t.status <> 'COMPLETED'
          AND t.created_at >= $1::timestamptz
          AND t.created_at < $2::timestamptz
         WHERE p.deleted_at IS NULL
           AND p.active = TRUE
           AND p.project_status <> 'COMPLETED'
         GROUP BY p.id, p.name
         ORDER BY p.name ASC`,
        params,
      ),
      this.query<
        Array<{
          employeeId: string;
          employeeName: string;
          pending: string;
          completed: string;
        }> extends (infer T)[]
          ? T
          : never
      >(
        `SELECT
           e.id AS "employeeId",
           e.name AS "employeeName",
           COUNT(*) FILTER (WHERE t.status = 'PENDING')::text AS "pending",
           COUNT(*) FILTER (WHERE t.status = 'COMPLETED')::text AS "completed"
         FROM employees e
         LEFT JOIN task_assignments ta ON ta.employee_id = e.id
         LEFT JOIN tasks t
           ON t.id = ta.task_id
          AND t.deleted_at IS NULL
          AND t.created_at >= $1::timestamptz
          AND t.created_at < $2::timestamptz
         LEFT JOIN projects p
           ON p.id = t.project_id
          AND p.deleted_at IS NULL
          AND p.active = TRUE
          AND p.project_status <> 'COMPLETED'
         WHERE e.deleted_at IS NULL
           AND e.is_active = TRUE
         GROUP BY e.id, e.name
         ORDER BY e.name ASC`,
        params,
      ),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      totalPendingTasks: Number(totalRows[0]?.count || '0'),
      projects: projectRows.map((row) => ({
        projectId: row.projectId,
        projectName: row.projectName,
        pendingTasks: Number(row.pendingTasks || '0'),
      })),
      employeeTaskBreakdown: employeeRows.map((row) => ({
        employeeId: row.employeeId,
        employeeName: row.employeeName,
        pending: Number(row.pending || '0'),
        completed: Number(row.completed || '0'),
      })),
    };
  }

  private async buildMonthlyReportSummary(): Promise<MonthlyReportSummary> {
    const now = new Date();
    const { start: periodStart, end: periodEnd } = this.getMonthToDatePeriod(now);
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const periodParams = [periodStart.toISOString(), periodEnd.toISOString()];
    const [totalRows, employeeRows, taskRows] = await Promise.all([
      this.query<
        Array<{
          total: string;
          pending: string;
          ongoing: string;
          completed: string;
          overdue: string;
        }> extends (infer T)[]
          ? T
          : never
      >(
        `SELECT
           COUNT(t.id)::text AS total,
           COUNT(t.id) FILTER (WHERE t.status = 'PENDING')::text AS pending,
           COUNT(t.id) FILTER (WHERE t.status = 'IN_PROGRESS')::text AS ongoing,
           COUNT(t.id) FILTER (WHERE t.status = 'COMPLETED')::text AS completed,
           COUNT(t.id) FILTER (WHERE t.status <> 'COMPLETED' AND t.due_date IS NOT NULL AND t.due_date < NOW())::text AS overdue
         FROM tasks t
         INNER JOIN projects p ON p.id = t.project_id
          WHERE t.deleted_at IS NULL
            AND p.deleted_at IS NULL
            AND t.created_at >= $1::timestamptz
            AND t.created_at < $2::timestamptz`,
        periodParams,
      ),
      this.query<
        Array<{
          employeeId: string;
          employeeName: string;
          pending: string;
          ongoing: string;
          completed: string;
          overdue: string;
        }> extends (infer T)[]
          ? T
          : never
      >(
        `SELECT
           e.id AS "employeeId",
           e.name AS "employeeName",
           COUNT(t.id) FILTER (WHERE t.status = 'PENDING')::text AS pending,
           COUNT(t.id) FILTER (WHERE t.status = 'IN_PROGRESS')::text AS ongoing,
           COUNT(t.id) FILTER (WHERE t.status = 'COMPLETED')::text AS completed,
           COUNT(t.id) FILTER (WHERE t.status <> 'COMPLETED' AND t.due_date IS NOT NULL AND t.due_date < NOW())::text AS overdue
         FROM employees e
         LEFT JOIN task_assignments ta ON ta.employee_id = e.id
          LEFT JOIN tasks t
            ON t.id = ta.task_id
           AND t.deleted_at IS NULL
           AND t.created_at >= $1::timestamptz
           AND t.created_at < $2::timestamptz
          WHERE e.deleted_at IS NULL
            AND e.is_active = TRUE
          GROUP BY e.id, e.name
          ORDER BY e.name ASC`,
        periodParams,
      ),
      this.query<
        Array<{
          title: string;
          projectName: string;
          employeeNames: string | null;
          status: string;
          dueDate: string | null;
          createdAt: string;
          overdue: boolean;
        }> extends (infer T)[]
          ? T
          : never
      >(
        `SELECT
           t.title,
           p.name AS "projectName",
           COALESCE(STRING_AGG(DISTINCT e.name, ', '), 'Unassigned') AS "employeeNames",
           t.status,
           t.due_date AS "dueDate",
           t.created_at AS "createdAt",
           (t.status <> 'COMPLETED' AND t.due_date IS NOT NULL AND t.due_date < NOW()) AS overdue
         FROM tasks t
         INNER JOIN projects p ON p.id = t.project_id
         LEFT JOIN task_assignments ta ON ta.task_id = t.id
         LEFT JOIN employees e ON e.id = ta.employee_id AND e.deleted_at IS NULL
         WHERE t.deleted_at IS NULL
           AND p.deleted_at IS NULL
           AND t.created_at >= $1::timestamptz
           AND t.created_at < $2::timestamptz
         GROUP BY t.id, t.title, p.name, t.status, t.due_date, t.created_at
         ORDER BY t.created_at ASC, t.due_date ASC NULLS LAST`,
        periodParams,
      ),
    ]);

    const totals = totalRows[0];
    const totalTasks = Number(totals?.total || '0');
    const completedTasks = Number(totals?.completed || '0');

    return {
      generatedAt: now.toISOString(),
      month,
      periodStart: periodStart.toISOString(),
      periodEnd: new Date(periodEnd.getTime() - 1).toISOString(),
      totalTasks,
      pendingTasks: Number(totals?.pending || '0'),
      ongoingTasks: Number(totals?.ongoing || '0'),
      completedTasks,
      overdueTasks: Number(totals?.overdue || '0'),
      completionRate: totalTasks
        ? Math.round((completedTasks / totalTasks) * 100)
        : 0,
      employeeTaskBreakdown: employeeRows.map((row) => ({
        employeeId: row.employeeId,
        employeeName: row.employeeName,
        pending: Number(row.pending || '0'),
        ongoing: Number(row.ongoing || '0'),
        completed: Number(row.completed || '0'),
        overdue: Number(row.overdue || '0'),
      })),
      taskDetails: taskRows.map((row) => ({
        title: row.title,
        projectName: row.projectName,
        employeeNames: row.employeeNames || 'Unassigned',
        status: row.status,
        dueDate: row.dueDate,
        createdAt: row.createdAt,
        overdue: row.overdue,
      })),
    };
  }

  private buildMisWhatsappMessage(summary: MisSummary) {
    const employeeBreakdown = this.buildMisEmployeeTaskBreakdown(summary);
    const overdueText = this.buildMisOverdueProjectList(summary);

    return [
      'Weekly MIS Report',
      '',
      `Total active projects: ${summary.activeProjects}`,
      '',
      `Task wise:\n${employeeBreakdown}`,
      '',
      `Overdue projects:\n${overdueText}`,
      '',
      'Thanks',
    ].join('\n');
  }

  private buildMisEmployeeTaskBreakdown(summary: MisSummary) {
    return summary.employeeTaskBreakdown.length
      ? summary.employeeTaskBreakdown
          .map(
            (employee) =>
              `${employee.employeeName}: Pending ${employee.pending}, Completed ${employee.completed}`,
          )
          .join('\n')
      : 'No employee task data';
  }

  private buildMisEmployeeTaskTemplateValue(summary: MisSummary) {
    return summary.employeeTaskBreakdown.length
      ? summary.employeeTaskBreakdown
          .map(
            (employee) =>
              `${employee.employeeName}: Pending ${employee.pending}, Completed ${employee.completed}`,
          )
          .join(', ')
      : 'No employee task data';
  }

  private buildMisOverdueProjectList(summary: MisSummary) {
    return summary.overdueProjects.length
      ? summary.overdueProjects
          .map(
            (project) => `- ${project.name}: ${project.pendingTasks} pending`,
          )
          .join('\n')
      : 'No overdue projects';
  }

  private buildMisOverdueProjectTemplateValue(summary: MisSummary) {
    return summary.overdueProjects.length
      ? summary.overdueProjects
          .map((project) => `${project.name}: ${project.pendingTasks} pending`)
          .join(', ')
      : 'No overdue projects';
  }

  private buildDailyWhatsappMessage(summary: DailyPendingSummary) {
    const pendingProjects = summary.projects
      .filter((project) => project.pendingTasks > 0)
      .map((project) => `${project.projectName}: ${project.pendingTasks}`)
      .join('\n');
    const employeePending = this.buildDailyEmployeeTaskBreakdown(summary);

    return [
      'Daily Pending Summary',
      '',
      `Open tasks: ${summary.totalPendingTasks}`,
      '',
      'Project wise pending:',
      pendingProjects || 'No pending tasks',
      '',
      'Employee wise task details:',
      employeePending,
      '',
      'Thanks',
    ].join('\n');
  }

  private buildDailyEmployeeTaskBreakdown(summary: DailyPendingSummary) {
    const employeesWithTodayData = summary.employeeTaskBreakdown.filter(
      (employee) => employee.pending > 0 || employee.completed > 0,
    );
    return employeesWithTodayData.length
      ? employeesWithTodayData
          .map(
            (employee) =>
              `${employee.employeeName}: Pending ${employee.pending}, Completed ${employee.completed}`,
          )
          .join('\n')
      : 'No employee task data';
  }

  private buildDailyProjectTemplateValue(summary: DailyPendingSummary) {
    return (
      summary.projects
        .filter((project) => project.pendingTasks > 0)
        .map((project) => `${project.projectName}: ${project.pendingTasks}`)
        .join(', ') || 'No pending tasks'
    );
  }

  private buildDailyEmployeeTaskTemplateValue(summary: DailyPendingSummary) {
    const employeesWithTodayData = summary.employeeTaskBreakdown.filter(
      (employee) => employee.pending > 0 || employee.completed > 0,
    );
    return employeesWithTodayData.length
      ? employeesWithTodayData
          .map(
            (employee) =>
              `${employee.employeeName}: Pending ${employee.pending}, Completed ${employee.completed}`,
          )
          .join(', ')
      : 'No employee task data';
  }

  private buildMonthlyEmployeeTaskBreakdown(summary: MonthlyReportSummary) {
    return summary.employeeTaskBreakdown.length
      ? summary.employeeTaskBreakdown
          .map(
            (employee) =>
              `${employee.employeeName}: Pending ${employee.pending}, Ongoing ${employee.ongoing}, Completed ${employee.completed}, Overdue ${employee.overdue}`,
          )
          .join('\n')
      : 'No employee task data';
  }

  private buildMonthlyEmployeeTaskTemplateValue(summary: MonthlyReportSummary) {
    return summary.employeeTaskBreakdown.length
      ? summary.employeeTaskBreakdown
          .map(
            (employee) =>
              `${employee.employeeName}: Pending ${employee.pending}, Ongoing ${employee.ongoing}, Completed ${employee.completed}, Overdue ${employee.overdue}`,
          )
          .join(', ')
      : 'No employee task data';
  }

  private buildMonthlyWhatsappMessage(summary: MonthlyReportSummary) {
    return [
      'Monthly TMS Report',
      '',
      `Month: ${summary.month}`,
      `Total tasks: ${summary.totalTasks}`,
      `Pending tasks: ${summary.pendingTasks}`,
      `Ongoing tasks: ${summary.ongoingTasks}`,
      `Completed tasks: ${summary.completedTasks}`,
      `Overdue tasks: ${summary.overdueTasks}`,
      `Completion rate: ${summary.completionRate}%`,
      '',
      `Team wise performance:\n${this.buildMonthlyEmployeeTaskBreakdown(summary)}`,
      '',
      'Thanks',
    ].join('\n');
  }

  private escapePdfText(value: string) {
    return value
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)');
  }

  private wrapPdfText(value: string, maxChars: number) {
    const words = value.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let current = '';

    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (next.length > maxChars && current) {
        lines.push(current);
        current = word;
      } else {
        current = next;
      }
    }

    if (current) {
      lines.push(current);
    }

    return lines.length ? lines : [''];
  }

  private formatReportDate(value?: string | null) {
    if (!value) {
      return '-';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '-';
    }

    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  private formatReportDateTime(value?: string | null) {
    if (!value) {
      return '-';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '-';
    }

    return date.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  private formatTaskStatus(value: string) {
    if (value === 'COMPLETED') return 'Done';
    if (value === 'IN_PROGRESS') return 'Ongoing';
    return 'Pending';
  }

  private buildPdfDocument(pageContents: string[]) {
    const objects: string[] = [];
    const pageObjectIds = pageContents.map((_, index) => 4 + index * 2);

    objects.push('<< /Type /Catalog /Pages 2 0 R >>');
    objects.push(
      `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageContents.length} >>`,
    );
    objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

    pageContents.forEach((content, index) => {
      const pageObjectId = 4 + index * 2;
      const contentObjectId = pageObjectId + 1;
      const contentLength = Buffer.byteLength(content, 'utf8');
      objects.push(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObjectId} 0 R >>`,
      );
      objects.push(
        `<< /Length ${contentLength} >>\nstream\n${content}\nendstream`,
      );
    });

    let pdf = '%PDF-1.4\n';
    const offsets: number[] = [0];

    objects.forEach((object, index) => {
      offsets.push(Buffer.byteLength(pdf, 'utf8'));
      pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    });

    const xrefOffset = Buffer.byteLength(pdf, 'utf8');
    pdf += `xref\n0 ${objects.length + 1}\n`;
    pdf += '0000000000 65535 f \n';
    for (let index = 1; index < offsets.length; index += 1) {
      pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

    return Buffer.from(pdf, 'utf8');
  }

  private buildMonthlyReportPdf(summary: MonthlyReportSummary) {
    const pageContents: string[] = [];
    let content: string[] = [];
    let page = 1;
    let y = 760;
    const pageWidth = 595;
    const left = 38;
    const right = 557;
    const contentWidth = right - left;
    const bottom = 62;
    const periodLabel = `${this.formatReportDate(summary.periodStart)} to ${this.formatReportDate(summary.periodEnd)}`;

    const addRaw = (command: string) => {
      content.push(command);
    };
    const setFill = (r: number, g: number, b: number) => {
      addRaw(`${r} ${g} ${b} rg`);
    };
    const setStroke = (r: number, g: number, b: number) => {
      addRaw(`${r} ${g} ${b} RG`);
    };
    const rect = (
      x: number,
      yValue: number,
      width: number,
      height: number,
      mode: 'f' | 'S' = 'f',
    ) => {
      addRaw(`${x} ${yValue} ${width} ${height} re ${mode}`);
    };
    const addTextAt = (text: string, x: number, yValue: number, size = 10) => {
      addRaw(
        `BT /F1 ${size} Tf 1 0 0 1 ${x} ${yValue} Tm (${this.escapePdfText(text)}) Tj ET`,
      );
    };
    const addText = (text: string, x = left, size = 10, lineHeight = 16) => {
      addRaw(
        `BT /F1 ${size} Tf 1 0 0 1 ${x} ${y} Tm (${this.escapePdfText(text)}) Tj ET`,
      );
      y -= lineHeight;
    };
    const ensureSpace = (height: number, title?: string) => {
      if (y - height >= bottom) {
        return;
      }
      finishPage();
      startPage();
      if (title) {
        addSectionTitle(title);
      }
    };
    const addSectionTitle = (title: string) => {
      ensureSpace(28);
      setFill(0.08, 0.16, 0.29);
      addText(title, left, 15, 22);
      setFill(0, 0, 0);
    };
    const finishPage = () => {
      setFill(0.94, 0.96, 0.98);
      rect(0, 0, pageWidth, 46);
      setFill(0.38, 0.45, 0.56);
      addTextAt(`Page ${page}`, 510, 25, 8);
      pageContents.push(content.join('\n'));
      page += 1;
    };
    const startPage = () => {
      content = [];
      y = 760;
      setFill(0.05, 0.12, 0.23);
      rect(0, 792, pageWidth, 50);
      setFill(1, 1, 1);
      addTextAt('Monthly TMS Report', left, 798, 20);
      addTextAt(`Period: ${periodLabel}`, 370, 817, 9);
      addTextAt(
        `Generated: ${this.formatReportDateTime(summary.generatedAt)}`,
        370,
        802,
        9,
      );
      setFill(0, 0, 0);
    };
    const addKpiCard = (
      x: number,
      title: string,
      value: string,
      color: [number, number, number],
    ) => {
      setFill(0.98, 0.99, 1);
      rect(x, y - 54, 96, 50);
      setStroke(0.84, 0.88, 0.94);
      rect(x, y - 54, 96, 50, 'S');
      setFill(color[0], color[1], color[2]);
      addTextAt(value, x + 10, y - 24, 18);
      setFill(0.38, 0.45, 0.56);
      addTextAt(title, x + 10, y - 42, 8);
      setFill(0, 0, 0);
    };
    const addEmployeeTableHeader = () => {
      setFill(0.91, 0.95, 1);
      rect(left, y - 21, contentWidth, 22);
      setFill(0.12, 0.22, 0.38);
      addTextAt('Employee', left + 10, y - 14, 9);
      addTextAt('Pending', 315, y - 14, 9);
      addTextAt('Ongoing', 380, y - 14, 9);
      addTextAt('Done', 445, y - 14, 9);
      addTextAt('Overdue', 500, y - 14, 9);
      setFill(0, 0, 0);
      y -= 25;
    };
    const addTaskTableHeader = () => {
      setFill(0.91, 0.95, 1);
      rect(left, y - 21, contentWidth, 22);
      setFill(0.12, 0.22, 0.38);
      addTextAt('Task / Project', left + 10, y - 14, 8);
      addTextAt('Employee', 250, y - 14, 8);
      addTextAt('Status', 370, y - 14, 8);
      addTextAt('Due Date', 430, y - 14, 8);
      addTextAt('Flag', 500, y - 14, 8);
      setFill(0, 0, 0);
      y -= 25;
    };

    startPage();

    addSectionTitle('Summary');
    addText(`Current month-to-date data from ${periodLabel}.`, left, 10, 20);
    addKpiCard(
      left,
      'Total tasks',
      String(summary.totalTasks),
      [0.07, 0.2, 0.4],
    );
    addKpiCard(
      left + 106,
      'Completed',
      String(summary.completedTasks),
      [0.06, 0.5, 0.3],
    );
    addKpiCard(
      left + 212,
      'Pending',
      String(summary.pendingTasks),
      [0.88, 0.48, 0.12],
    );
    addKpiCard(
      left + 318,
      'Ongoing',
      String(summary.ongoingTasks),
      [0.12, 0.36, 0.8],
    );
    addKpiCard(
      left + 424,
      'Overdue',
      String(summary.overdueTasks),
      [0.82, 0.16, 0.16],
    );
    y -= 76;

    addSectionTitle('Employee Wise Performance');
    if (summary.employeeTaskBreakdown.length) {
      addEmployeeTableHeader();
      for (const employee of summary.employeeTaskBreakdown) {
        ensureSpace(24, 'Employee Wise Performance');
        if (y > 735) {
          addEmployeeTableHeader();
        }
        setFill(1, 1, 1);
        rect(left, y - 17, contentWidth, 20);
        setStroke(0.88, 0.91, 0.95);
        rect(left, y - 17, contentWidth, 20, 'S');
        setFill(0.1, 0.14, 0.22);
        addTextAt(employee.employeeName.slice(0, 42), left + 10, y - 10, 9);
        addTextAt(String(employee.pending), 325, y - 10, 9);
        addTextAt(String(employee.ongoing), 390, y - 10, 9);
        addTextAt(String(employee.completed), 455, y - 10, 9);
        addTextAt(String(employee.overdue), 515, y - 10, 9);
        y -= 20;
      }
    } else {
      addText('No employee task data', left + 10, 10, 18);
    }

    y -= 18;
    addSectionTitle('Task Details');
    if (summary.taskDetails.length) {
      addTaskTableHeader();
      for (const task of summary.taskDetails) {
        const titleLines = this.wrapPdfText(
          `${task.title} / ${task.projectName}`,
          36,
        ).slice(0, 2);
        const employeeLines = this.wrapPdfText(task.employeeNames, 18).slice(
          0,
          2,
        );
        const rowHeight =
          Math.max(titleLines.length, employeeLines.length, 1) * 11 + 18;
        ensureSpace(rowHeight + 6, 'Task Details');
        if (y > 735) {
          addTaskTableHeader();
        }
        setFill(1, 1, 1);
        rect(left, y - rowHeight + 4, contentWidth, rowHeight);
        setStroke(0.88, 0.91, 0.95);
        rect(left, y - rowHeight + 4, contentWidth, rowHeight, 'S');
        setFill(0.1, 0.14, 0.22);
        titleLines.forEach((line, index) =>
          addTextAt(line, left + 10, y - 10 - index * 11, 8),
        );
        employeeLines.forEach((line, index) =>
          addTextAt(line, 250, y - 10 - index * 11, 8),
        );
        addTextAt(this.formatTaskStatus(task.status), 370, y - 10, 8);
        addTextAt(this.formatReportDate(task.dueDate), 430, y - 10, 8);
        setFill(
          task.overdue ? 0.82 : 0.06,
          task.overdue ? 0.16 : 0.5,
          task.overdue ? 0.16 : 0.3,
        );
        addTextAt(task.overdue ? 'Overdue' : 'OK', 500, y - 10, 8);
        setFill(0, 0, 0);
        y -= rowHeight;
      }
    } else {
      addText(
        'No task data found for this month-to-date period.',
        left + 10,
        10,
        18,
      );
    }

    finishPage();
    return this.buildPdfDocument(pageContents);
  }

  private async dispatchWhatsappTemplateReport(
    category: string,
    recipientRoles: string[],
    templateName: string,
    parameters: string[],
    logMessage: string,
    recipientEmails?: string[],
    recipientEmployeeIds?: string[],
  ) {
    const recipients = await this.getRecipientPhonesByRoles(
      recipientRoles,
      recipientEmails,
      recipientEmployeeIds,
    );
    const delivery = await this.whatsappService.sendTemplate(recipients, {
      name: templateName,
      parameters,
    });
    const finalLogMessage = delivery.detail
      ? `${logMessage} (${delivery.detail})`
      : logMessage;
    await this.insertNotificationLog(
      category,
      finalLogMessage,
      delivery.status,
      recipientRoles,
    );
    return delivery;
  }

  private async dispatchWhatsappDocumentTemplateReport(
    category: string,
    recipientRoles: string[],
    templateName: string,
    bodyParameters: string[],
    document: { filename: string; buffer: Buffer; mimeType?: string },
    logMessage: string,
    recipientEmails?: string[],
    recipientEmployeeIds?: string[],
  ) {
    const recipients = await this.getRecipientPhonesByRoles(
      recipientRoles,
      recipientEmails,
      recipientEmployeeIds,
    );
    const delivery = await this.whatsappService.sendDocumentTemplate(
      recipients,
      {
        name: templateName,
        bodyParameters,
        document,
      },
    );
    const finalLogMessage = delivery.detail
      ? `${logMessage} (${delivery.detail})`
      : logMessage;
    await this.insertNotificationLog(
      category,
      finalLogMessage,
      delivery.status,
      recipientRoles,
    );
    return delivery;
  }

  getMisSummary(authorization?: string) {
    return this.emsService.getMisSummary(authorization);
  }

  getDailySummary(authorization?: string) {
    return this.emsService.getDailyPendingSummary(authorization);
  }

  getNotificationLogs(
    authorization?: string,
    page = 1,
    perPage = 25,
    employeeId?: string,
  ) {
    return this.emsService.getNotificationLogs(
      authorization,
      page,
      perPage,
      employeeId,
    );
  }

  async runWeeklyMisReport(force = false) {
    const now = new Date();
    const { start, end } = this.getDayPeriod(now);
    const weeklyPeriod = this.getWeekToDatePeriod(now);
    const category = 'Weekly MIS Auto';
    const startIso = start.toISOString();
    const endIso = end.toISOString();
    const lockKey = this.getAutomaticReportLockKey(category, startIso, endIso);
    const lockRunner = force
      ? null
      : await this.acquireAutomaticReportLock(lockKey);

    if (!force && !lockRunner) {
      return { success: true, skipped: true };
    }

    try {
      if (!force && (await this.hasLogForWindow(category, startIso, endIso))) {
        return { success: true, skipped: true };
      }

      const weeklyMis = await this.buildMisSummary(weeklyPeriod);
      const delivery = await this.dispatchWhatsappTemplateReport(
        category,
        ADMIN_REPORT_ROLES,
        'weekly_mis_reports',
        [
          String(weeklyMis.activeProjects),
          this.buildMisEmployeeTaskTemplateValue(weeklyMis),
          this.buildMisOverdueProjectTemplateValue(weeklyMis),
        ],
        this.buildMisWhatsappMessage(weeklyMis),
      );

      return {
        success: delivery.status === 'SENT',
        skipped: false,
        weeklyMis,
        delivery,
      };
    } finally {
      if (lockRunner) {
        await this.releaseAutomaticReportLock(lockRunner, lockKey);
      }
    }
  }

  async runMonthlyReport(force = false) {
    const now = new Date();
    const { start, end } = this.getMonthToDatePeriod(now);
    const category = 'Monthly TMS Auto';
    const startIso = start.toISOString();
    const endIso = end.toISOString();
    const lockKey = this.getAutomaticReportLockKey(category, startIso, endIso);
    const lockRunner = force
      ? null
      : await this.acquireAutomaticReportLock(lockKey);

    if (!force && !lockRunner) {
      return { success: true, skipped: true };
    }

    try {
      if (!force && (await this.hasLogForWindow(category, startIso, endIso))) {
        return { success: true, skipped: true };
      }

      const monthlyReport = await this.buildMonthlyReportSummary();
      const monthlyPdf = this.buildMonthlyReportPdf(monthlyReport);
      const delivery = await this.dispatchWhatsappDocumentTemplateReport(
        category,
        ADMIN_REPORT_ROLES,
        'monthly_tms_report',
        [monthlyReport.month],
        {
          filename: `monthly-tms-report-${monthlyReport.month}.pdf`,
          buffer: monthlyPdf,
          mimeType: 'application/pdf',
        },
        this.buildMonthlyWhatsappMessage(monthlyReport),
      );

      return {
        success: delivery.status === 'SENT',
        skipped: false,
        monthlyReport,
        delivery,
      };
    } finally {
      if (lockRunner) {
        await this.releaseAutomaticReportLock(lockRunner, lockKey);
      }
    }
  }

  async runDailyPendingReport(force = false) {
    const now = new Date();
    const { start, end } = this.getDayPeriod(now);
    const category = 'Daily Pending Auto';
    const startIso = start.toISOString();
    const endIso = end.toISOString();
    const lockKey = this.getAutomaticReportLockKey(category, startIso, endIso);
    const lockRunner = force
      ? null
      : await this.acquireAutomaticReportLock(lockKey);

    if (!force && !lockRunner) {
      return { success: true, skipped: true };
    }

    try {
      if (!force && (await this.hasLogForWindow(category, startIso, endIso))) {
        return { success: true, skipped: true };
      }

      const dailyPending = await this.buildDailySummary({ start, end });
      const [delivery] = await Promise.all([
        this.dispatchWhatsappTemplateReport(
          category,
          ADMIN_REPORT_ROLES,
          'daily_pending_summarys',
          [
            String(dailyPending.totalPendingTasks),
            `${this.buildDailyProjectTemplateValue(dailyPending)} | Employee-wise: ${this.buildDailyEmployeeTaskTemplateValue(dailyPending)}`,
          ],
          this.buildDailyWhatsappMessage(dailyPending),
        ),
      ]);

      return {
        success: delivery.status === 'SENT',
        skipped: false,
        dailyPending,
        delivery,
      };
    } finally {
      if (lockRunner) {
        await this.releaseAutomaticReportLock(lockRunner, lockKey);
      }
    }
  }

  // async runWesakEventInvite() {
  //   const category = 'Wesak Event Invite Manual';
  //   const delivery = await this.dispatchWhatsappStaticTemplate(category, ['ADMIN'], 'wesak_event_invite');

  //   return {
  //     success: delivery.status === 'SENT',
  //     delivery,
  //   };
  // }

  async runScheduledReports(authorization?: string) {
    const currentEmployee =
      await this.emsService.requireReportAccess(authorization);
    const manualReportRoles = currentEmployee.roles.filter(
      (role) => role === 'SA1' || role === 'SA2',
    );
    const manualReportEmails = [currentEmployee.email].filter(Boolean);
    const manualReportEmployeeIds = [currentEmployee.id].filter(Boolean);

    const now = new Date();
    const [weeklyMis, dailyPending, monthlyReport] = await Promise.all([
      this.buildMisSummary(this.getWeekToDatePeriod(now)),
      this.buildDailySummary(this.getDayPeriod(now)),
      this.buildMonthlyReportSummary(),
    ]);

    const [
      weeklyDelivery,
      dailyDelivery,
      monthlyDelivery,
      // , wesakEventDelivery
    ] = await Promise.all([
      this.dispatchWhatsappTemplateReport(
        'Weekly MIS Manual',
        manualReportRoles,
        'weekly_mis_reports',
        [
          String(weeklyMis.activeProjects),
          this.buildMisEmployeeTaskTemplateValue(weeklyMis),
          this.buildMisOverdueProjectTemplateValue(weeklyMis),
        ],
        this.buildMisWhatsappMessage(weeklyMis),
        manualReportEmails,
        manualReportEmployeeIds,
      ),
      this.dispatchWhatsappTemplateReport(
        'Daily Pending Manual',
        manualReportRoles,
        'daily_pending_summarys',
        [
          String(dailyPending.totalPendingTasks),
          `${this.buildDailyProjectTemplateValue(dailyPending)} | Employee-wise: ${this.buildDailyEmployeeTaskTemplateValue(dailyPending)}`,
        ],
        this.buildDailyWhatsappMessage(dailyPending),
        manualReportEmails,
        manualReportEmployeeIds,
      ),
      this.dispatchWhatsappDocumentTemplateReport(
        'Monthly TMS Manual',
        manualReportRoles,
        'monthly_tms_report',
        [monthlyReport.month],
        {
          filename: `monthly-tms-report-${monthlyReport.month}.pdf`,
          buffer: this.buildMonthlyReportPdf(monthlyReport),
          mimeType: 'application/pdf',
        },
        this.buildMonthlyWhatsappMessage(monthlyReport),
        manualReportEmails,
        manualReportEmployeeIds,
      ),
    ]);

    return {
      success: [weeklyDelivery, dailyDelivery, monthlyDelivery].every(
        (delivery) => delivery.status === 'SENT',
      ),
      weeklyMis,
      dailyPending,
      monthlyReport,
      weeklyDelivery,
      dailyDelivery,
      monthlyDelivery,
      // wesakEventDelivery,
    };
  }
}
