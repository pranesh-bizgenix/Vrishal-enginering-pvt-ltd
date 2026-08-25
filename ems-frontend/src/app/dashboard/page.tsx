'use client';

import { startTransition, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getToken } from '../lib/api';
import { clearAuth } from '../lib/auth';
import { getWorkspaceNavItems, routeSection } from '../lib/workspace';
import { canManageTeamRecords, canRunReports, getDirectLeaderEmployeeIds, getEmployeeScopeIds, getVisibleEmployeeIdsForViewer, isAdminRole, itemMatchesEmployeeScope } from '../lib/hierarchy';
import { DashboardSidebar, DashboardTopbar } from '../../components/DashboardShell';
import type { DashboardResponse, Employee, NavItem, NotificationLog, PaginatedResponse, Project, SectionKey, Task } from './types';

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
      {message}
    </div>
  );
}

function OverviewCard({ label, value }: { label: string; value: number }) {
  return (
    <article className="rounded-[24px] border border-slate-200 bg-white/90 p-4 shadow-sm backdrop-blur sm:p-3">
      <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">{label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-[2.2rem]">{value}</p>
    </article>
  );
}

type ChartRow = {
  label: string;
  value: number;
  tone: string;
  color: string;
};

type BarChartRow = {
  label: string;
  value: number;
  tone: string;
  tasks?: Task[];
};

function DonutGraphCard({
  title,
  subtitle,
  rows,
  totalLabel,
  emptyMessage,
}: {
  title: string;
  subtitle: string;
  rows: ChartRow[];
  totalLabel: string;
  emptyMessage: string;
}) {
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  const largestRow = rows.reduce<ChartRow | null>((current, row) => (!current || row.value > current.value ? row : current), null);
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const chartSegments = rows.reduce<Array<{ row: ChartRow; length: number; dashOffset: number }>>((segments, row) => {
    if (!row.value || !total) {
      return segments;
    }

    const usedLength = segments.reduce((sum, segment) => sum + segment.length, 0);
    const length = (row.value / total) * circumference;
    return [...segments, { row, length, dashOffset: -usedLength }];
  }, []);

  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-semibold text-slate-950">{total}</p>
          <p className="text-xs font-medium text-slate-400">{totalLabel}</p>
        </div>
      </div>

      {total ? (
        <>
          <div className="mt-5 grid gap-5 sm:grid-cols-[132px_minmax(0,1fr)] sm:items-center">
            <div className="relative mx-auto h-[132px] w-[132px]">
              <svg className="h-full w-full -rotate-90" viewBox="0 0 120 120" role="img" aria-label={title}>
                <circle cx="60" cy="60" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="14" />
                {chartSegments.map(({ row, length, dashOffset }) => {
                  return (
                    <circle
                      key={row.label}
                      cx="60"
                      cy="60"
                      r={radius}
                      fill="none"
                      stroke={row.color}
                      strokeDasharray={`${length} ${circumference - length}`}
                      strokeDashoffset={dashOffset}
                      strokeLinecap="butt"
                      strokeWidth="14"
                    >
                      <title>{`${row.label}: ${row.value}`}</title>
                    </circle>
                  );
                })}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-2xl font-semibold text-slate-950">{total}</span>
                <span className="text-xs font-medium text-slate-400">tasks</span>
              </div>
            </div>
            <div className="space-y-2">
              {rows.map((row) => {
                const percentage = Math.round((row.value / total) * 100);
                return (
                  <div key={row.label} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2" title={`${row.label}: ${row.value}`}>
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="flex min-w-0 items-center gap-2 font-medium text-slate-700">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: row.color }} />
                        <span className="truncate">{row.label}</span>
                      </span>
                      <span className="shrink-0 font-semibold text-slate-950">{row.value}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{percentage}% of all tasks</p>
                  </div>
                );
              })}
            </div>
          </div>
          <p className="mt-4 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">
            Most common: <span className="font-semibold text-slate-950">{largestRow?.label}</span> ({largestRow?.value})
          </p>
        </>
      ) : (
        <div className="mt-5">
          <EmptyState message={emptyMessage} />
        </div>
      )}
    </div>
  );
}

function InsightBarGraphCard({
  title,
  subtitle,
  rows,
  totalLabel,
  emptyMessage,
}: {
  title: string;
  subtitle: string;
  rows: BarChartRow[];
  totalLabel: string;
  emptyMessage: string;
}) {
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  const maxValue = Math.max(...rows.map((row) => row.value), 1);

  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-semibold text-slate-950">{total}</p>
          <p className="text-xs font-medium text-slate-400">{totalLabel}</p>
        </div>
      </div>

      {total ? (
        <div className="mt-6">
          <div className="grid h-48 grid-cols-4 items-end gap-2 sm:grid-cols-8 sm:gap-3">
            {rows.map((row) => {
              const height = Math.max((row.value / maxValue) * 100, row.value ? 12 : 0);
              return (
                <div key={row.label} className="flex h-full min-w-0 flex-col justify-end gap-2">
                  <div className="flex flex-1 items-end rounded-t-2xl bg-slate-100 px-1.5 pt-2">
                    <div
                      className={`w-full rounded-t-xl ${row.tone} shadow-sm transition-all`}
                      style={{ height: `${height}%` }}
                      title={`${row.label}: ${row.value}`}
                    />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-semibold text-slate-950">{row.value}</p>
                    <p className="truncate text-[11px] font-medium text-slate-500">{row.label}</p>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-5 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">
            Highest focus: <span className="font-semibold text-slate-950">{rows.reduce((top, row) => (row.value > top.value ? row : top), rows[0]).label}</span>
          </p>
        </div>
      ) : (
        <div className="mt-5">
          <EmptyState message={emptyMessage} />
        </div>
      )}
    </div>
  );
}

function formatDisplayLabel(value?: string | null) {
  if (!value) {
    return 'Not Set';
  }

  if (value === 'IN_PROGRESS') {
    return 'Ongoing';
  }

  return value
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/(^|\s)\S/g, (char) => char.toUpperCase());
}

function formatShortDay(value: Date) {
  return value.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

function isToday(value: string | null | undefined) {
  if (!value) {
    return false;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return false;
  }

  const today = new Date();
  return date.getFullYear() === today.getFullYear()
    && date.getMonth() === today.getMonth()
    && date.getDate() === today.getDate();
}

function formatTaskDate(value: string | null | undefined, includeTime = false) {
  if (!value) {
    return 'Not set';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Not set';
  }

  return new Intl.DateTimeFormat('en-IN', includeTime
    ? { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }
    : { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

type PerformancePeriod = 'all' | 'day' | 'week' | 'month';

function getIsoWeekKey(value: string | null | undefined) {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const normalized = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = normalized.getUTCDay() || 7;
  normalized.setUTCDate(normalized.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(normalized.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((normalized.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${normalized.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function getCurrentPeriodValue(period: PerformancePeriod) {
  const now = new Date();
  if (period === 'day') {
    return now.toISOString().slice(0, 10);
  }

  if (period === 'month') {
    return now.toISOString().slice(0, 7);
  }

  if (period === 'week') {
    return getIsoWeekKey(now.toISOString());
  }

  return '';
}

function taskMatchesPeriod(task: Task, period: PerformancePeriod, value: string) {
  if (period === 'all') {
    return true;
  }

  if (!value) {
    return false;
  }

  const source = task.dueDate || task.createdAt || '';
  if (period === 'day') {
    return source.slice(0, 10) === value;
  }

  if (period === 'month') {
    return source.slice(0, 7) === value;
  }

  return getIsoWeekKey(source) === value;
}

function projectMatchesPeriod(project: Project, period: PerformancePeriod, value: string) {
  if (period === 'all') {
    return true;
  }

  if (!value) {
    return false;
  }

  const source = project.dueDate || '';
  if (!source) {
    return false;
  }

  if (period === 'day') {
    return source.slice(0, 10) === value;
  }

  if (period === 'month') {
    return source.slice(0, 7) === value;
  }

  return getIsoWeekKey(source) === value;
}

function dateMatchesPeriod(value: string | null | undefined, period: PerformancePeriod, periodValue: string) {
  if (period === 'all') {
    return true;
  }

  if (!value || !periodValue) {
    return false;
  }

  if (period === 'day') {
    return value.slice(0, 10) === periodValue;
  }

  if (period === 'month') {
    return value.slice(0, 7) === periodValue;
  }

  return getIsoWeekKey(value) === periodValue;
}

export default function DashboardPage() {
  const router = useRouter();
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [error, setError] = useState('');
  const [loadedAt, setLoadedAt] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [performancePeriod, setPerformancePeriod] = useState<PerformancePeriod>('all');
  const [performancePeriodValue, setPerformancePeriodValue] = useState('');
  const [selectedPersonId, setSelectedPersonId] = useState(() => (typeof window === 'undefined' ? '' : window.localStorage.getItem('ems-dashboard-person-scope') || ''));
  const [notificationLogsPage, setNotificationLogsPage] = useState<PaginatedResponse<NotificationLog> | null>(null);
  const [notificationLogsScopeKey, setNotificationLogsScopeKey] = useState('');

  const loadData = useCallback(async () => {
    setError('');

    try {
      const [dashboardData, taskData, projectData, employeeData] = await Promise.all([
        api<DashboardResponse>('/dashboard'),
        api<Task[]>('/tasks'),
        api<Project[]>('/projects'),
        api<Employee[]>('/employees'),
      ]);

      startTransition(() => {
        setDashboard(dashboardData);
        setTasks(taskData);
        setProjects(projectData);
        setEmployees(employeeData);
        setLoadedAt(Date.now());
        setNotificationLogsPage({
          items: dashboardData.recentNotifications,
          total: dashboardData.totals.taskNotifications,
          page: 1,
          perPage: dashboardData.recentNotifications.length || 20,
        });
        setNotificationLogsScopeKey('');
      });
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message.replace(/^Error:\s*/, '') : 'Failed to load dashboard.';
      setError(message);

      if (message.toLowerCase().includes('unauthorized')) {
        clearAuth();
        router.replace('/auth/login');
      }
    }
  }, [router]);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/auth/login');
      return;
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData();
  }, [loadData, router]);

  const me = dashboard?.employee;
  const isAdmin = isAdminRole(me?.roles ?? []);
  const isSuperAdmin = Boolean(me?.roles.includes('SA1') || me?.roles.includes('SA2'));
  const isLeader = Boolean(me?.roles.includes('LEADER'));
  const canManage = canManageTeamRecords(me?.roles ?? []);
  const canViewAllDashboardData = isSuperAdmin;
  const navItems = useMemo<NavItem[]>(() => getWorkspaceNavItems(canManage, isAdmin, me?.roles ?? []), [canManage, isAdmin, me?.roles]);
  const initials = me?.name?.trim()?.charAt(0)?.toUpperCase() || 'A';

  const leaderEmployeeIds = useMemo(
    () => getDirectLeaderEmployeeIds(employees, me?.id),
    [employees, me?.id],
  );

  const accessibleEmployeeIds = useMemo(() => getVisibleEmployeeIdsForViewer(employees, me), [employees, me]);

  const basePeriodTasks = useMemo(
    () =>
      tasks.filter(
        (task) =>
          taskMatchesPeriod(task, performancePeriod, performancePeriodValue) &&
          itemMatchesEmployeeScope(task.assignedEmployeeIds, accessibleEmployeeIds),
      ),
    [accessibleEmployeeIds, performancePeriod, performancePeriodValue, tasks],
  );

  const basePeriodProjects = useMemo(
    () =>
      projects.filter(
        (project) =>
          projectMatchesPeriod(project, performancePeriod, performancePeriodValue) &&
          itemMatchesEmployeeScope(project.assignedEmployeeIds, accessibleEmployeeIds),
      ),
    [accessibleEmployeeIds, performancePeriod, performancePeriodValue, projects],
  );
  const activeBaseProjectIds = useMemo(
    () => new Set(basePeriodProjects.filter((project) => project.active && project.projectStatus !== 'COMPLETED').map((project) => project.id)),
    [basePeriodProjects],
  );

  const selectedPerson = useMemo(
    () => {
      if (!me) {
        return null;
      }

      return (
      employees.find((employee) => {
        if (employee.id !== selectedPersonId) {
          return false;
        }

        if (isAdmin) {
          return employee.id !== me.id;
        }

        return isLeader && leaderEmployeeIds.has(employee.id);
      }) || null
      );
    },
    [employees, isAdmin, isLeader, leaderEmployeeIds, me, selectedPersonId],
  );
  const selectedScopeEmployeeIds = useMemo(() => {
    if (selectedPerson) {
      return getEmployeeScopeIds(employees, selectedPerson);
    }

    if (me && !isAdmin) {
      return new Set([me.id]);
    }

    return null;
  }, [employees, isAdmin, me, selectedPerson]);

  const filteredTasks = useMemo(
    () =>
      basePeriodTasks
        .filter((task) => task.projectId ? activeBaseProjectIds.has(task.projectId) : true)
        .filter((task) => selectedScopeEmployeeIds ? itemMatchesEmployeeScope(task.assignedEmployeeIds, selectedScopeEmployeeIds) : true),
    [activeBaseProjectIds, basePeriodTasks, selectedScopeEmployeeIds],
  );

  const filteredProjects = useMemo(
    () =>
      selectedScopeEmployeeIds
        ? basePeriodProjects.filter((project) => itemMatchesEmployeeScope(project.assignedEmployeeIds, selectedScopeEmployeeIds))
        : basePeriodProjects,
    [basePeriodProjects, selectedScopeEmployeeIds],
  );
  const visibleEmployees = useMemo(
    () => {
      if (!me) {
        return [];
      }

      if (selectedScopeEmployeeIds) {
        return employees.filter((employee) => selectedScopeEmployeeIds.has(employee.id));
      }

      if (isAdmin) {
        return employees;
      }

      if (isLeader) {
        return employees.filter((employee) => employee.id === me.id || leaderEmployeeIds.has(employee.id));
      }

      return employees.filter((employee) => employee.id === me.id);
    },
    [employees, isAdmin, isLeader, leaderEmployeeIds, me, selectedScopeEmployeeIds],
  );

  const activeVisibleEmployees = useMemo(
    () =>
      visibleEmployees.filter(
        (employee) => employee.active !== false,
      ),
    [visibleEmployees],
  );

  const sidebarPeopleFilter = useMemo(
    () => {
      if (!me || (!isAdmin && !isLeader)) {
        return [];
      }

      const people = isAdmin
        ? employees.filter((employee) => employee.id !== me.id)
        : employees.filter((employee) => leaderEmployeeIds.has(employee.id));

      return people
        .sort((left, right) => {
          const leftRank = left.roles.includes('LEADER') ? 0 : 1;
          const rightRank = right.roles.includes('LEADER') ? 0 : 1;
          return leftRank - rightRank || left.name.localeCompare(right.name);
        })
        .map((employee) => {
          const scopeIds = employee.roles.includes('LEADER')
            ? new Set([
                employee.id,
                ...employees
                  .filter((teamMember) => getDirectLeaderEmployeeIds(employees, employee.id).has(teamMember.id))
                  .map((teamMember) => teamMember.id),
              ])
            : new Set([employee.id]);

          return {
            id: employee.id,
            name: employee.name,
            roleLabel: employee.roles.includes('LEADER') ? 'Leader Team' : 'Employee',
            leaderName: employee.leaderName || 'Unassigned',
            projectCount: basePeriodProjects.filter((project) => project.assignedEmployeeIds.some((employeeId) => scopeIds.has(employeeId))).length,
            taskCount: basePeriodTasks.filter((task) => task.status !== 'COMPLETED' && activeBaseProjectIds.has(task.projectId) && task.assignedEmployeeIds.some((employeeId) => scopeIds.has(employeeId))).length,
          };
        });
    },
    [activeBaseProjectIds, basePeriodProjects, basePeriodTasks, employees, isAdmin, isLeader, leaderEmployeeIds, me],
  );

  useEffect(() => {
    if (!me || !selectedPersonId) {
      return;
    }

    const canUsePersonFilter = isSuperAdmin;
    if (!canUsePersonFilter || !sidebarPeopleFilter.some((person) => person.id === selectedPersonId)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedPersonId('');
      window.localStorage.removeItem('ems-dashboard-person-scope');
    }
  }, [isSuperAdmin, me, selectedPersonId, sidebarPeopleFilter]);

  const selectedNotificationEmployeeId = useMemo(() => {
    if (!selectedPersonId || !me || !isSuperAdmin) {
      return '';
    }

    return sidebarPeopleFilter.some((person) => person.id === selectedPersonId) ? selectedPersonId : '';
  }, [isSuperAdmin, me, selectedPersonId, sidebarPeopleFilter]);

  const notificationScopeKey = selectedNotificationEmployeeId || (isSuperAdmin ? 'all' : me?.id || '');

  useEffect(() => {
    if (!dashboard || !me || !notificationScopeKey) {
      return;
    }

    let active = true;
    const currentDashboard = dashboard;
    const selectedPersonQuery = selectedNotificationEmployeeId ? `&employeeId=${encodeURIComponent(selectedNotificationEmployeeId)}` : '';

    async function loadNotificationLogsCount() {
      try {
        const logData = await api<PaginatedResponse<NotificationLog>>(`/reports/notification-logs?page=1&perPage=100${selectedPersonQuery}`);
        if (active) {
          setNotificationLogsPage(logData);
          setNotificationLogsScopeKey(notificationScopeKey);
        }
      } catch (loadError) {
        const message = loadError instanceof Error ? loadError.message : '';
        if (message.toLowerCase().includes('unauthorized')) {
          clearAuth();
          router.replace('/auth/login');
        }

        if (active) {
          setNotificationLogsPage({
            items: selectedNotificationEmployeeId ? [] : currentDashboard.recentNotifications,
            total: selectedNotificationEmployeeId ? 0 : currentDashboard.totals.taskNotifications,
            page: 1,
            perPage: selectedNotificationEmployeeId ? 100 : currentDashboard.recentNotifications.length || 20,
          });
          setNotificationLogsScopeKey(notificationScopeKey);
        }
      }
    }

    void loadNotificationLogsCount();

    return () => {
      active = false;
    };
  }, [dashboard, me, notificationScopeKey, router, selectedNotificationEmployeeId]);
  const filteredActiveProjects = useMemo(
    () => filteredProjects.filter((project) => project.active && project.projectStatus !== 'COMPLETED'),
    [filteredProjects],
  );
  const filteredCompletedProjects = useMemo(
    () => filteredProjects.filter((project) => project.projectStatus === 'COMPLETED').length,
    [filteredProjects],
  );
  const filteredOverdueProjects = useMemo(() => {
    const now = loadedAt || 0;
    return filteredProjects.filter((project) => project.projectStatus !== 'COMPLETED' && project.dueDate && new Date(project.dueDate).getTime() < now);
  }, [filteredProjects, loadedAt]);
  const activeProjectTaskProjectIds = useMemo(
    () =>
      new Set(
        filteredProjects
          .filter((project) => project.active && project.projectStatus !== 'COMPLETED')
          .map((project) => project.id),
      ),
    [filteredProjects],
  );
  const activeProjectTasks = useMemo(
    () => filteredTasks.filter((task) => activeProjectTaskProjectIds.has(task.projectId)),
    [activeProjectTaskProjectIds, filteredTasks],
  );
  // The Task Overview is personal for every role. Leaders and admins may still
  // access their team's data elsewhere, but these three counters show only tasks
  // directly assigned to the signed-in employee.
  const myTasksByStatus = useMemo(() => {
    const myTasks = me
      ? activeProjectTasks.filter((task) => task.assignedEmployeeIds.includes(me.id))
      : [];

    return {
      pending: myTasks.filter((task) => task.status === 'PENDING').length,
      inProgress: myTasks.filter((task) => task.status === 'IN_PROGRESS').length,
      completed: myTasks.filter((task) => task.status === 'COMPLETED').length,
    };
  }, [activeProjectTasks, me]);
  const overdueTaskCount = useMemo(() => {
    const now = loadedAt || 0;
    return activeProjectTasks.filter((task) => task.status !== 'COMPLETED' && task.dueDate && new Date(task.dueDate).getTime() < now).length;
  }, [activeProjectTasks, loadedAt]);
  const completedOverdueTaskCount = useMemo(() => {
    const now = loadedAt || 0;
    return activeProjectTasks.filter((task) => task.status === 'COMPLETED' && task.dueDate && new Date(task.dueDate).getTime() < now).length;
  }, [activeProjectTasks, loadedAt]);
  const filteredTaskNotificationsCount = (() => {
    const canUseScopedLogs = notificationLogsPage && notificationLogsScopeKey === notificationScopeKey;
    const notificationItems = canUseScopedLogs ? notificationLogsPage.items : dashboard?.recentNotifications || [];

    if (performancePeriod === 'all') {
      if (canUseScopedLogs) {
        return notificationLogsPage.total;
      }

      return selectedNotificationEmployeeId ? 0 : dashboard?.totals.taskNotifications ?? 0;
    }

    return notificationItems.filter((notification) => dateMatchesPeriod(notification.createdAt, performancePeriod, performancePeriodValue)).length;
  })();

  const employeesWithoutTasksCount = useMemo(
    () =>
      activeVisibleEmployees.filter(
        (employee) => employee.roles.some((role) => role === 'ADMIN' || role === 'LEADER' || role === 'EMPLOYEE'),
      ).length,
    [activeVisibleEmployees],
  );
  const statusChartRows = useMemo<ChartRow[]>(() => [
    { label: 'Pending', value: myTasksByStatus.pending, tone: 'bg-amber-500', color: '#f59e0b' },
    { label: 'Ongoing', value: myTasksByStatus.inProgress, tone: 'bg-blue-500', color: '#3b82f6' },
    { label: 'Completed', value: myTasksByStatus.completed, tone: 'bg-emerald-500', color: '#10b981' },
  ], [myTasksByStatus.completed, myTasksByStatus.inProgress, myTasksByStatus.pending]);
  const overdueTaskChartRows = useMemo<ChartRow[]>(() => [
    { label: 'Not Done', value: overdueTaskCount, tone: 'bg-rose-500', color: '#e11d48' },
    { label: 'Done', value: completedOverdueTaskCount, tone: 'bg-emerald-500', color: '#10b981' },
  ], [completedOverdueTaskCount, overdueTaskCount]);
  const priorityChartRows = useMemo<ChartRow[]>(() => [
    { label: 'Low', value: activeProjectTasks.filter((task) => (task.priority || 'LOW') === 'LOW').length, tone: 'bg-emerald-500', color: '#10b981' },
    { label: 'Medium', value: activeProjectTasks.filter((task) => task.priority === 'MEDIUM').length, tone: 'bg-amber-500', color: '#f59e0b' },
    { label: 'High', value: activeProjectTasks.filter((task) => task.priority === 'HIGH').length, tone: 'bg-orange-500', color: '#f97316' },
    { label: 'Critical', value: activeProjectTasks.filter((task) => task.priority === 'CRITICAL').length, tone: 'bg-red-500', color: '#ef4444' },
  ], [activeProjectTasks]);
  const qualityChartRows = useMemo<ChartRow[]>(() => [
    { label: 'Good', value: activeProjectTasks.filter((task) => task.qualityRating === 'GOOD').length, tone: 'bg-emerald-500', color: '#10b981' },
    { label: 'Great', value: activeProjectTasks.filter((task) => task.qualityRating === 'GREAT').length, tone: 'bg-blue-500', color: '#3b82f6' },
    { label: 'Outstanding', value: activeProjectTasks.filter((task) => task.qualityRating === 'OUTSTANDING').length, tone: 'bg-[#8fc740]', color: '#8fc740' },
    { label: 'LMB', value: activeProjectTasks.filter((task) => task.qualityRating === 'LMB').length, tone: 'bg-rose-500', color: '#e11d48' },
    { label: 'Not Rated', value: activeProjectTasks.filter((task) => !task.qualityRating).length, tone: 'bg-slate-400', color: '#94a3b8' },
  ], [activeProjectTasks]);
  const dueOutlookRows = useMemo<BarChartRow[]>(() => {
    const now = loadedAt ? new Date(loadedAt) : new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const openTasks = activeProjectTasks
      .filter((task) => task.status !== 'COMPLETED' && task.dueDate)
      .sort((left, right) => new Date(left.dueDate || '').getTime() - new Date(right.dueDate || '').getTime());
    const overdueTasks = openTasks.filter((task) => new Date(task.dueDate || '').getTime() < startOfToday.getTime());
    const rows: BarChartRow[] = [
      {
        label: 'Overdue',
        value: overdueTasks.length,
        tone: 'bg-rose-500',
        tasks: overdueTasks,
      },
    ];

    for (let index = 0; index < 7; index += 1) {
      const dayStart = new Date(startOfToday);
      dayStart.setDate(startOfToday.getDate() + index);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayStart.getDate() + 1);
      const dayTasks = openTasks.filter((task) => {
        const dueAt = new Date(task.dueDate || '').getTime();
        return dueAt >= dayStart.getTime() && dueAt < dayEnd.getTime();
      });
      rows.push({
        label: index === 0 ? 'Today' : formatShortDay(dayStart),
        value: dayTasks.length,
        tone: index === 0 ? 'bg-amber-500' : 'bg-[#8fc740]',
        tasks: dayTasks,
      });
    }

    return rows;
  }, [activeProjectTasks, loadedAt]);

  const employeePerformanceRows = useMemo(() => {
    if (!me) {
      return [];
    }

    const systemAdminEmployeeId = employees.find(
      (employee) =>
        employee.email?.trim().toLowerCase() === 'admin@sjsangath.com' ||
        employee.name?.trim().toLowerCase() === 'admin',
    )?.id;
    const employeesToShow = activeVisibleEmployees.filter(
      (employee) =>
        employee.id !== systemAdminEmployeeId &&
        !employee.roles.some((role) => role === 'SA1' || role === 'SA2') &&
        itemMatchesEmployeeScope([employee.id], accessibleEmployeeIds),
    );
    const now = loadedAt || 0;

    return employeesToShow.map((employee) => {
      const assignedTasks = filteredTasks.filter((task) => task.assignedEmployeeIds.includes(employee.id));
      const completedTasks = assignedTasks.filter((task) => task.status === 'COMPLETED');
      const pendingTasks = assignedTasks.filter((task) => task.status === 'PENDING');
      const ongoingTasks = assignedTasks.filter((task) => task.status === 'IN_PROGRESS');
      const openTasks = assignedTasks.filter((task) => task.status !== 'COMPLETED');
      const overdueTasks = openTasks.filter((task) => task.dueDate && new Date(task.dueDate).getTime() < now);
      const assignedProjects = filteredActiveProjects.filter((project) => project.assignedEmployeeIds.includes(employee.id)).length;

      return {
        employeeId: employee.id,
        employeeName: employee.name,
        roles: employee.roles,
        assignedProjects,
        assignedTasks: assignedTasks.length,
        completedTasks: completedTasks.length,
        pendingTasks: pendingTasks.length,
        ongoingTasks: ongoingTasks.length,
        overdueTasks: overdueTasks.length,
        completionRate: assignedTasks.length ? Math.round((completedTasks.length / assignedTasks.length) * 100) : 0,
      };
    }).sort((left, right) => right.assignedTasks - left.assignedTasks || left.employeeName.localeCompare(right.employeeName));
  }, [accessibleEmployeeIds, activeVisibleEmployees, employees, filteredActiveProjects, filteredTasks, loadedAt, me]);
  const averageCompletionRate = employeePerformanceRows.length
    ? Math.round(employeePerformanceRows.reduce((sum, employee) => sum + employee.completionRate, 0) / employeePerformanceRows.length)
    : 0;

  const todayPendingTasks = useMemo(() => {
    if (!me || isAdmin || isLeader) {
      return [];
    }

    return tasks
      .filter(
        (task) =>
          task.assignedEmployeeIds.includes(me.id)
          && activeBaseProjectIds.has(task.projectId)
          && task.status !== 'COMPLETED'
          && isToday(task.createdAt),
      )
      .sort((left, right) => new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime());
  }, [activeBaseProjectIds, isAdmin, isLeader, me, tasks]);

  function handlePersonScopeChange(employeeId: string) {
    setSelectedPersonId(employeeId);
    if (employeeId) {
      window.localStorage.setItem('ems-dashboard-person-scope', employeeId);
    } else {
      window.localStorage.removeItem('ems-dashboard-person-scope');
    }
  }

  function handleLogout() {
    clearAuth();
    router.replace('/auth/login');
  }

  function handleSection(section: SectionKey) {
    setSidebarOpen(false);
    routeSection(router, section);
  }

  function handlePeriodChange(period: PerformancePeriod) {
    setPerformancePeriod(period);
    setPerformancePeriodValue(getCurrentPeriodValue(period));
  }

  async function triggerReports() {
    try {
      await api('/reports/run-scheduled', { method: 'POST' });
      await loadData();
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'Unable to trigger reports.');
    }
  }

  return (
    <main className="min-h-screen bg-[#edf2f7] text-slate-900 lg:flex">
      <DashboardSidebar
        activeSection="overview"
        navItems={navItems}
        onClose={() => setSidebarOpen(false)}
        onSelect={handleSection}
        open={sidebarOpen}
        peopleFilter={sidebarPeopleFilter}
        // peopleFilterTitle={isAdmin ? 'Leaders & Employees' : 'My Employees'}
        selectedPersonId={selectedPersonId}
        onSelectPerson={handlePersonScopeChange}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <DashboardTopbar
          canRunReport={canRunReports(me?.roles ?? [])}
          initials={initials}
          userEmail={me?.email ?? ''}
          userName={me?.name ?? 'Admin'}
          onLogout={handleLogout}
          onMenuOpen={() => setSidebarOpen(true)}
          onRunReport={triggerReports}
          peopleFilter={sidebarPeopleFilter}
          // peopleFilterTitle={isAdmin ? 'Leaders & Employees' : 'My Employees'}
          selectedPersonId={selectedPersonId}
          onSelectPerson={handlePersonScopeChange}
          subtitle="Task Management System"
          title="Dashboard"
        />

        <section className="px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
          {error ? (
            <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <div className="space-y-6">
            <section className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-[0_20px_55px_rgba(15,23,42,0.08)]">
              <div className="bg-[radial-gradient(circle_at_top_left,_rgba(147,197,253,0.35),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(251,191,36,0.18),_transparent_26%),white] px-5 py-6 sm:px-7 sm:py-8 lg:px-10 lg:py-10">
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_360px]">
                  <div>
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <p className="text-sm font-medium uppercase tracking-[0.35em] text-[#010048]">TMS Dashboard</p>
                    </div>
                    <h1 className="mt-4 max-w-2xl text-4xl font-semibold leading-tight">
                      See where every project stands, and what needs attention next.
                    </h1>
                    <p className="mt-5 max-w-3xl text-base leading-8 text-slate-600 sm:text-lg">
                      {canViewAllDashboardData
                        ? 'See employee-wise tasks, pending work, completed work, and assigned projects across the whole system.'
                        : 'See only your assigned tasks, pending work, completed work, and project assignments.'}
                    </p>

                    <div className="mt-8 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                      <OverviewCard label="Total Projects" value={filteredProjects.length} />
                      <OverviewCard label="Active Projects" value={filteredActiveProjects.length} />
                      <OverviewCard label="Completed Projects" value={filteredCompletedProjects} />
                      <OverviewCard label="Available Employees" value={employeesWithoutTasksCount} />
                    </div>
                  </div>

                  <div className="rounded-[28px] border border-slate-200 bg-white/90 p-4 shadow-sm backdrop-blur sm:p-5">
                    <div className="flex w-full flex-col gap-2 mb-3 sm:w-auto sm:flex-row">
                        <select
                          className="h-11 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 sm:w-[150px]"
                          onChange={(event) => handlePeriodChange(event.target.value as PerformancePeriod)}
                          value={performancePeriod}
                        >
                          <option value="all">All Time</option>
                          <option value="day">Day Wise</option>
                          <option value="week">Week Wise</option>
                          <option value="month">Month Wise</option>
                        </select>
                        {performancePeriod !== 'all' ? (
                          <input
                            className="h-11 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 sm:w-[180px]"
                            onChange={(event) => setPerformancePeriodValue(event.target.value)}
                            type={performancePeriod === 'day' ? 'date' : performancePeriod === 'week' ? 'week' : 'month'}
                            value={performancePeriodValue}
                          />
                        ) : null}
                      </div>
                    <p className="text-xs uppercase tracking-[0.38em] text-slate-500">Task Overview</p>
                    <div className="mt-5 overflow-hidden rounded-[24px] border border-slate-200 bg-slate-50">
                      {([
                        ['My pending tasks', myTasksByStatus.pending],
                        ['My ongoing tasks', myTasksByStatus.inProgress],
                        ['My completed tasks', myTasksByStatus.completed],
                        ['Task Notifications', filteredTaskNotificationsCount],
                        ['Overdue projects', filteredOverdueProjects.length],
                      ].filter((item): item is [string, number] => Boolean(item))).map(([label, value], index, rows) => (
                        <div key={String(label)} className={['flex items-center justify-between gap-4 px-4 py-5 text-sm sm:px-6', index < rows.length - 1 ? 'border-b border-slate-200' : ''].join(' ')}>
                          <span className="text-slate-700">{label}</span>
                          <span className="text-2xl font-semibold tracking-[-0.04em] text-slate-950">{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </section>
            {!isAdmin && !isLeader ? (
              <section className="overflow-hidden rounded-[28px] border border-[#cfe3aa] bg-white shadow-[0_18px_45px_rgba(43,74,20,0.08)]">
                <div className="flex flex-col gap-4 border-b border-[#dce9c4] bg-[#f4fae9] px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#8fc740] text-xl font-semibold text-[#123b76]">
                      {todayPendingTasks.length}
                    </div>
                    <div>
                      <h2 className="text-xl font-semibold text-slate-950">Assigned Today</h2>
                      <p className="mt-1 text-sm text-slate-600">New tasks assigned today that still need your attention.</p>
                    </div>
                  </div>
                  <button
                    className="h-10 rounded-xl border border-[#b9d589] bg-white px-4 text-sm font-semibold text-[#123b76] transition hover:bg-[#eef7df]"
                    onClick={() => router.push('/tasks')}
                    type="button"
                  >
                    View all tasks
                  </button>
                </div>

                <div className="p-5 sm:p-6">
                  {todayPendingTasks.length ? (
                    <div className="grid gap-3 xl:grid-cols-2">
                      {todayPendingTasks.map((task) => (
                        <article key={task.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-[#b9d589] hover:shadow-md sm:p-5">
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <p className="truncate text-base font-semibold text-slate-950">{task.title}</p>
                              <p className="mt-1 truncate text-sm text-slate-500">{task.projectName || 'No project'}</p>
                            </div>
                            <span className={task.status === 'IN_PROGRESS'
                              ? 'shrink-0 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700'
                              : 'shrink-0 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700'}>
                              {formatDisplayLabel(task.status)}
                            </span>
                          </div>
                          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 text-sm">
                            <div>
                              <p className="text-xs font-medium text-slate-400">Assigned</p>
                              <p className="mt-1 font-medium text-slate-700">{formatTaskDate(task.createdAt, true)}</p>
                            </div>
                            <div>
                              <p className="text-xs font-medium text-slate-400">Due date</p>
                              <p className="mt-1 font-medium text-slate-700">{formatTaskDate(task.dueDate)}</p>
                            </div>
                          </div>
                          <div className="mt-3 flex items-center justify-between gap-3">
                            <span className="text-xs font-semibold text-slate-500">{formatDisplayLabel(task.priority)} priority</span>
                            <button
                              className="text-sm font-semibold text-[#123b76] hover:text-[#38661b]"
                              onClick={() => router.push('/tasks')}
                              type="button"
                            >
                              Open task
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-[#cfe3aa] bg-[#fbfdf7] px-5 py-8 text-center">
                      <p className="font-semibold text-slate-800">No new pending tasks today</p>
                      <p className="mt-1 text-sm text-slate-500">You are clear of newly assigned work for today.</p>
                    </div>
                  )}
                </div>
              </section>
            ) : null}
            <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.06)] sm:p-6 lg:p-7">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-slate-950 sm:text-2xl">Workload Graphs</h2>
                  <p className="mt-1 text-sm text-slate-500">Quick view of task status, priority, and overdue work.</p>
                </div>
              </div>
              <div className="mt-5 grid gap-5 xl:grid-cols-2">
                <DonutGraphCard
                  title="Task Status"
                  subtitle="Pending, running, and completed work."
                  rows={statusChartRows}
                  totalLabel="Total tasks"
                  emptyMessage="No task status data available yet."
                />
                <DonutGraphCard
                  title="Overdue Tasks"
                  subtitle="Overdue tasks against current open and completed work."
                  rows={overdueTaskChartRows}
                  totalLabel="Total tasks"
                  emptyMessage="No overdue task data available yet."
                />
                <DonutGraphCard
                  title="Task Priority"
                  subtitle="Low, medium, high, and critical work."
                  rows={priorityChartRows}
                  totalLabel="Total tasks"
                  emptyMessage="No priority data available yet."
                />
                <DonutGraphCard
                  title="Task Quality"
                  subtitle="Quality ratings across visible task work."
                  rows={qualityChartRows}
                  totalLabel="rated tasks"
                  emptyMessage="No task quality data available yet."
                />
                <div className="xl:col-span-2">
                  <InsightBarGraphCard
                    title="7-Day Due Outlook"
                    subtitle="Open tasks due now and across the next week."
                    rows={dueOutlookRows}
                    totalLabel="open tasks"
                    emptyMessage="No upcoming due tasks available yet."
                  />
                </div>
              </div>
            </section>
            <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.06)] sm:p-6 lg:p-7">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-slate-950 sm:text-2xl">Performance Evaluation</h2>
                  <p className="mt-1 text-sm text-slate-500">Employee-wise roles, project count, task count, completed, pending, <br />overdue, and completion rate by day, week, or month.</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-semibold text-slate-950">{averageCompletionRate}%</p>
                  <p className="text-xs font-medium text-slate-400">Avg rate</p>
                </div>
              </div>
              <div className="mt-6 overflow-hidden rounded-[24px] border border-slate-200">
                {employeePerformanceRows.length ? (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200 text-sm">
                      <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.2em] text-slate-500">
                        <tr>
                          <th className="px-4 py-4 font-semibold">Employee</th>
                          <th className="px-4 py-4 font-semibold">Roles</th>
                          <th className="px-4 py-4 font-semibold">Projects</th>
                          <th className="px-4 py-4 font-semibold">Assigned</th>
                          <th className="px-4 py-4 font-semibold">Completed</th>
                          <th className="px-4 py-4 font-semibold">Pending</th>
                          <th className="px-4 py-4 font-semibold">Ongoing</th>
                          <th className="px-4 py-4 font-semibold">Overdue</th>
                          <th className="px-4 py-4 font-semibold">Rate</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 bg-white">
                        {employeePerformanceRows.map((employee) => (
                          <tr key={employee.employeeId}>
                            <td className="px-4 py-4 font-medium text-slate-900">{employee.employeeName}</td>
                            <td className="px-4 py-4 text-slate-700">{employee.roles.map((role) => formatDisplayLabel(role)).join(', ')}</td>
                            <td className="px-4 py-4 text-slate-700">{employee.assignedProjects}</td>
                            <td className="px-4 py-4 text-slate-700">{employee.assignedTasks}</td>
                            <td className="px-4 py-4 text-emerald-700">{employee.completedTasks}</td>
                            <td className="px-4 py-4 text-amber-700">{employee.pendingTasks}</td>
                            <td className="px-4 py-4 text-blue-700">{employee.ongoingTasks}</td>
                            <td className="px-4 py-4 text-rose-700">{employee.overdueTasks}</td>
                            <td className="px-4 py-4">
                              <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{employee.completionRate}%</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-4">
                    <EmptyState message="No performance data available yet." />
                  </div>
                )}
              </div>
            </section>
            {/* <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.8fr)]">
              <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.06)] sm:p-6 lg:p-7">
                <div>
                  <h2 className="text-xl font-semibold text-slate-950 sm:text-2xl">{canManage ? 'System Task Feed' : 'My Recent Tasks'}</h2>
                  <p className="mt-1 text-sm text-slate-500">{canManage ? 'Latest tasks visible across all employees' : 'Latest work visible in your workspace'}</p>
                </div>
                <div className="mt-6 space-y-4">
                  {dashboard.assignedTasks.length ? (
                    dashboard.assignedTasks.slice(0, 5).map((task) => (
                      <article key={task.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-4 sm:px-5">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="text-lg font-semibold text-slate-950">{task.title}</p>
                            <p className="mt-1 text-sm text-slate-500">{task.projectName}</p>
                            <p className="mt-2 text-sm text-slate-600">{task.description || 'No description provided.'}</p>
                          </div>
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{formatDisplayLabel(task.status)}</span>
                        </div>
                      </article>
                    ))
                  ) : (
                    <EmptyState message="No tasks available yet." />
                  )}
                </div>
              </section>
              
            </div> */}
          </div>
        </section>
      </div>
    </main>
  );
}
