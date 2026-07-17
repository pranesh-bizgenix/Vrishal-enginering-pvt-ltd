'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getToken } from '../lib/api';
import { clearAuth } from '../lib/auth';
import { getWorkspaceNavItems, routeSection } from '../lib/workspace';
import { canManageTeamRecords, canRunReports, canViewerSeeEmployee, formatRoleName, getDirectLeaderEmployeeIds, getEmployeeScopeIds, getHighestRolePower, isAdminRole, itemMatchesEmployeeScope } from '../lib/hierarchy';
import { DashboardSidebar, DashboardTopbar } from '../../components/DashboardShell';
import { PaginationBar } from '../../components/PaginationBar';
import type { DashboardResponse, Employee, NavItem, PaginatedResponse, SectionKey, Task } from '../dashboard/types';
import { ArrowPathIcon, PlusIcon, XMarkIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';

type TaskMenuState = {
  taskId: string;
  top: number;
  left: number;
};

type TaskFilters = {
  project: string;
  assignee: string;
  timelineMode: 'day' | 'month' | 'year';
  timelineValue: string;
  type: string;
  status: string;
};

const filterFieldClassName = 'h-11 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100';

function EditIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className={className}>
      <path
        d="M4.167 13.75V15.833H6.25L12.392 9.692L10.308 7.608L4.167 13.75ZM14.004 8.079L15.029 7.054C15.436 6.647 15.436 5.988 15.029 5.581L14.419 4.971C14.012 4.564 13.353 4.564 12.946 4.971L11.921 5.996L14.004 8.079Z"
        fill="currentColor"
      />
    </svg>
  );
}

function formatDateTime(value: string | null) {
  return value ? new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'Not set';
}

function getTodayDateValue() {
  const now = new Date();
  const indiaDate = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  return indiaDate.toISOString().slice(0, 10);
}

function formatFilterDateLabel(value: string) {
  return value ? new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }) : '';
}

function formatTaskLabel(value: string) {
  if (value === 'IN_PROGRESS') {
    return 'Ongoing';
  }

  return value
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/(^|\s)\S/g, (char) => char.toUpperCase());
}

function getPriorityClassName(priority: Task['priority']) {
  if (priority === 'CRITICAL') {
    return 'bg-red-100 text-red-700';
  }
  if (priority === 'HIGH') {
    return 'bg-orange-100 text-orange-700';
  }
  if (priority === 'MEDIUM') {
    return 'bg-amber-100 text-amber-700';
  }
  return 'bg-emerald-100 text-emerald-700';
}

function getTaskListStatus(task: Task) {
  return task.status;
}

function EmptyState({ message }: { message: string }) {
  return <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">{message}</div>;
}

export default function TasksPage() {
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [openMenu, setOpenMenu] = useState<TaskMenuState | null>(null);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [confirmTask, setConfirmTask] = useState<Task | null>(null);
  const [confirmDoneTask, setConfirmDoneTask] = useState<Task | null>(null);
  const [selectedPersonId, setSelectedPersonId] = useState(() => (typeof window === 'undefined' ? '' : window.localStorage.getItem('ems-dashboard-person-scope') || ''));
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);
  const [approvingTaskId, setApprovingTaskId] = useState<string | null>(null);
  const [submittingDoneTaskId, setSubmittingDoneTaskId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [serverSearch, setServerSearch] = useState('');
  const [totalTasks, setTotalTasks] = useState(0);
  const [filters, setFilters] = useState<TaskFilters>({
    project: '',
    assignee: '',
    timelineMode: 'month',
    timelineValue: '',
    type: '',
    status: '',
  });

  const loadData = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const query = new URLSearchParams({
        page: String(page),
        perPage: String(perPage),
      });
      if (serverSearch.trim()) {
        query.set('search', serverSearch.trim());
      }
      const [dashboardData, taskData, employeeData] = await Promise.all([
        api<DashboardResponse>('/dashboard'),
        api<PaginatedResponse<Task>>(`/tasks?${query.toString()}`),
        api<Employee[]>('/employees'),
      ]);
      setDashboard(dashboardData);
      setTasks(taskData.items);
      setTotalTasks(taskData.total);
      setEmployees(employeeData);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Unable to load tasks.';
      setError(message);
      if (message.toLowerCase().includes('unauthorized')) {
        clearAuth();
        router.replace('/auth/login');
      }
    } finally {
      setBusy(false);
    }
  }, [page, perPage, router, serverSearch]);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/auth/login');
      return;
    }
    void loadData();
  }, [loadData, router]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpenMenu(null);
      }
    }

    function handleViewportChange() {
      setOpenMenu(null);
    }

    if (openMenu) {
      document.addEventListener('mousedown', handlePointerDown);
      window.addEventListener('scroll', handleViewportChange, true);
      window.addEventListener('resize', handleViewportChange);
    }

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('scroll', handleViewportChange, true);
      window.removeEventListener('resize', handleViewportChange);
    };
  }, [openMenu]);

  const me = dashboard?.employee;
  const isAdmin = isAdminRole(me?.roles ?? []);
  const isSuperAdmin = Boolean(me?.roles.includes('SA1') || me?.roles.includes('SA2'));
  const canDeleteRecords = Boolean(me?.roles.includes('SA1'));
  const canManage = canManageTeamRecords(me?.roles ?? []);
  const totalPages = Math.max(1, Math.ceil(totalTasks / perPage));
  const navItems = useMemo<NavItem[]>(() => getWorkspaceNavItems(canManage, isAdmin, me?.roles ?? []), [canManage, isAdmin, me?.roles]);
  const initials = me?.name?.trim()?.charAt(0)?.toUpperCase() || 'A';
  const selectedPerson = useMemo(() => employees.find((employee) => employee.id === selectedPersonId) || null, [employees, selectedPersonId]);
  const selectedScopeEmployeeIds = useMemo(() => getEmployeeScopeIds(employees, selectedPerson), [employees, selectedPerson]);
  const visibleTasks = useMemo(() => {
    if (!me) {
      return [];
    }

    if (selectedScopeEmployeeIds) {
      return tasks.filter((task) => itemMatchesEmployeeScope(task.assignedEmployeeIds, selectedScopeEmployeeIds));
    }

    if (isSuperAdmin) {
      return tasks;
    }

    return tasks.filter((task) => task.createdByEmployeeId === me.id || task.assignedEmployeeIds.includes(me.id));
  }, [isSuperAdmin, me, selectedScopeEmployeeIds, tasks]);

  const sidebarPeopleFilter = useMemo(() => {
    if (!me || !canManage) {
      return [];
    }

    const people = employees.filter((employee) => employee.id !== me.id && canViewerSeeEmployee(me, employee));

    return people
      .sort((left, right) => {
        return getHighestRolePower(right.roles) - getHighestRolePower(left.roles) || left.name.localeCompare(right.name);
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
          roleLabel: employee.roles.map(formatRoleName).join(', '),
          leaderName: employee.leaderName || 'Unassigned',
          projectCount: new Set(tasks.filter((task) => task.assignedEmployeeIds.some((employeeId) => scopeIds.has(employeeId))).map((task) => task.projectId)).size,
          taskCount: tasks.filter((task) => task.status !== 'COMPLETED' && task.assignedEmployeeIds.some((employeeId) => scopeIds.has(employeeId))).length,
        };
      });
  }, [canManage, employees, me, tasks]);

  useEffect(() => {
    const savedPersonId = window.localStorage.getItem('ems-dashboard-person-scope') || '';
    if (savedPersonId) {
      setSelectedPersonId(savedPersonId);
    }
  }, []);

  useEffect(() => {
    if (selectedPersonId && sidebarPeopleFilter.length > 0 && !sidebarPeopleFilter.some((person) => person.id === selectedPersonId)) {
      setSelectedPersonId('');
      window.localStorage.removeItem('ems-dashboard-person-scope');
    }
  }, [selectedPersonId, sidebarPeopleFilter]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const projectOptions = useMemo(() => Array.from(new Set(visibleTasks.map((task) => task.projectName))).sort(), [visibleTasks]);
  const assigneeOptions = useMemo(() => Array.from(new Set(visibleTasks.flatMap((task) => task.assignedEmployees.map((employee) => employee.name)))).sort(), [visibleTasks]);
  const statusOptions = useMemo(() => ['PENDING', 'IN_PROGRESS', 'COMPLETED'], []);

  const filteredTasks = useMemo(() => {
    return visibleTasks.filter((task) => {
      const listStatus = getTaskListStatus(task);
      const timelineSource = task.dueDate || task.createdAt || '';
      const projectMatch = !filters.project || task.projectName === filters.project;
      const assigneeMatch = !filters.assignee || task.assignedEmployees.some((employee) => employee.name === filters.assignee);
      const timelineMatch = !filters.timelineValue || (
        filters.timelineMode === 'day'
          ? timelineSource.slice(0, 10) === filters.timelineValue
          : filters.timelineMode === 'month'
            ? timelineSource.slice(0, 7) === filters.timelineValue
            : timelineSource.slice(0, 4) === filters.timelineValue
      );
      const typeMatch = !filters.type || task.type === filters.type;
      const statusMatch = !filters.status || listStatus === filters.status;
      return projectMatch && assigneeMatch && timelineMatch && typeMatch && statusMatch;
    });
  }, [filters, visibleTasks]);
  const groupedTasks = useMemo(() => {
    const groups = new Map<string, { projectId: string; projectName: string; tasks: Task[] }>();

    filteredTasks.forEach((task) => {
      const existing = groups.get(task.projectId);
      if (existing) {
        existing.tasks.push(task);
        return;
      }

      groups.set(task.projectId, {
        projectId: task.projectId,
        projectName: task.projectName,
        tasks: [task],
      });
    });

    return Array.from(groups.values()).sort((left, right) => left.projectName.localeCompare(right.projectName));
  }, [filteredTasks]);

  useEffect(() => {
    setOpenGroups((current) => {
      const next: Record<string, boolean> = {};
      groupedTasks.forEach((group) => {
        next[group.projectId] = current[group.projectId] ?? false;
      });
      return next;
    });
  }, [groupedTasks]);

  useEffect(() => {
    const taskId = new URLSearchParams(window.location.search).get('taskId');
    if (!taskId) {
      return;
    }

    const targetTask = visibleTasks.find((task) => task.id === taskId);
    if (!targetTask) {
      return;
    }

    setOpenGroups((current) => ({ ...current, [targetTask.projectId]: true }));
    window.setTimeout(() => {
      document.getElementById(`task-${taskId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 150);
  }, [visibleTasks]);

  function handlePersonScopeChange(employeeId: string) {
    setSelectedPersonId(employeeId);
    if (employeeId) {
      window.localStorage.setItem('ems-dashboard-person-scope', employeeId);
    } else {
      window.localStorage.removeItem('ems-dashboard-person-scope');
    }
  }

  function handleSection(section: SectionKey) {
    setSidebarOpen(false);
    routeSection(router, section);
  }

  function handleLogout() {
    clearAuth();
    router.replace('/auth/login');
  }

  function handleActionMenuToggle(taskId: string, event: React.MouseEvent<HTMLButtonElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const nextTop = rect.bottom + 4;
    const nextLeft = Math.max(16, rect.right - 170);

    setOpenMenu((current) =>
      current?.taskId === taskId
        ? null
        : {
            taskId,
            top: nextTop,
            left: nextLeft,
          },
    );
  }

  async function handleRunReport() {
    try {
      await api('/reports/run-scheduled', { method: 'POST' });
      await loadData();
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'Unable to trigger reports.');
    }
  }


  async function deleteTask(taskId: string) {
    try {
      setDeletingTaskId(taskId);
      await api(`/tasks/${taskId}`, { method: 'DELETE' });
      setOpenMenu(null);
      setConfirmTask(null);
      await loadData();
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'Unable to delete task.');
    } finally {
      setDeletingTaskId(null);
    }
  }

  async function approveTask(taskId: string) {
    try {
      setApprovingTaskId(taskId);
      setError('');
      await api(`/tasks/${taskId}/approve`, { method: 'POST' });
      await loadData();
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'Unable to approve task.');
    } finally {
      setApprovingTaskId(null);
    }
  }

  function isTaskApproved(task: Task) {
    return task.notes.some((note) => note.message.trim().toLowerCase().startsWith('approved by'));
  }

  function isTaskSubmittedDone(task: Task) {
    return task.notes.some((note) => note.markDone);
  }

  function updateFilter<Key extends keyof TaskFilters>(key: Key, value: TaskFilters[Key]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function resetFilters() {
    setFilters({ project: '', assignee: '', timelineMode: 'month', timelineValue: '', type: '', status: '' });
  }

  function showTodayWorkTasks() {
    setFilters((current) => ({
      ...current,
      timelineMode: 'day',
      timelineValue: getTodayDateValue(),
    }));
  }

  function toggleGroup(projectId: string) {
    setOpenGroups((current) => ({
      ...current,
      [projectId]: !(current[projectId] ?? false),
    }));
  }

  function openDeleteConfirm(task: Task) {
    setOpenMenu(null);
    setConfirmTask(task);
  }

  function closeDeleteConfirm() {
    if (deletingTaskId) {
      return;
    }
    setConfirmTask(null);
  }

  function openDoneConfirm(task: Task) {
    setOpenMenu(null);
    setConfirmDoneTask(task);
  }

  function closeDoneConfirm() {
    setConfirmDoneTask(null);
  }

  async function submitDoneTask(task: Task) {
    setConfirmDoneTask(null);

    if (task.requireProof && !task.media?.length) {
      router.push(`/tasks/${task.id}/edit`);
      return;
    }

    try {
      setSubmittingDoneTaskId(task.id);
      setError('');
      await api(`/tasks/${task.id}/notes`, {
        method: 'POST',
        body: JSON.stringify({
          message: task.requireProof
            ? `${me?.name || 'Assigned user'} submitted work for approval with proof attachment.`
            : `${me?.name || 'Assigned user'} submitted work for approval.`,
          markDone: true,
        }),
      });
      await loadData();
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'Unable to submit task done.');
    } finally {
      setSubmittingDoneTaskId(null);
    }
  }

  return (
    <main className="min-h-screen bg-[#edf2f7] text-slate-900 lg:flex">
      <DashboardSidebar
        activeSection="tasks"
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
        <DashboardTopbar canRunReport={canRunReports(me?.roles ?? [])} initials={initials} userEmail={me?.email ?? ''} userName={me?.name ?? 'Admin'} onLogout={handleLogout} onMenuOpen={() => setSidebarOpen(true)} onRunReport={handleRunReport} peopleFilter={sidebarPeopleFilter} 
        // peopleFilterTitle={isAdmin ? 'Leaders & Employees' : 'My Employees'} 
        selectedPersonId={selectedPersonId} onSelectPerson={handlePersonScopeChange} subtitle="Task Management System" title="Tasks" />
        <section className="px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
          {error ? <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.06)] sm:p-6 lg:p-7">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.3em] text-slate-400">Task Module</p>
                <h1 className="mt-3 text-3xl font-semibold text-slate-900">Tasks</h1>
                <p className="mt-2 text-sm text-slate-500">Manage assigned, pending, and completed work items.</p>
              </div>
              <div className="flex flex-row gap-3">
                                <button
                  type="button"
                  onClick={() => void loadData()}
                  disabled={busy}
                  className={[
                    'inline-flex items-center gap-2 rounded-full border px-5 py-3 text-sm font-medium transition',
                    busy ? 'cursor-wait border-slate-200 bg-slate-100 text-slate-400' : 'border-slate-300 text-slate-700 hover:bg-slate-50',
                  ].join(' ')}
                >
                  <ArrowPathIcon className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />
                  {busy ? 'Refreshing...' : 'Refresh'}
                </button>
                <Link href="/notes" className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-medium text-slate-700">
                  Notes History
                </Link>
                <Link href="/tasks/new" className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-5 py-3 text-sm font-medium text-white">
                  <PlusIcon className="h-4 w-4" />
                  Create Task
                </Link>
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-3 rounded-[24px] border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
              <input
                className="h-11 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#8fc740] focus:ring-2 focus:ring-[#8fc740]/20 sm:max-w-md"
                onChange={(event) => {
                  setPage(1);
                  setServerSearch(event.target.value);
                }}
                placeholder="Search tasks, project, assignee, status"
                value={serverSearch}
              />
            </div>

            <div className="mt-6 rounded-[24px] border border-slate-200 bg-slate-50 p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-700">Filters</p>
                  <p className="mt-1 text-xs text-slate-500">Filter tasks by project, assignee, day/month/year, type, and status.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={showTodayWorkTasks} className="inline-flex items-center justify-center rounded-2xl bg-[#8fc740] px-4 py-2 text-sm font-semibold text-[#123b76] transition hover:bg-[#7fb632]">
                    Today Work
                  </button>
                  <button type="button" onClick={resetFilters} className="inline-flex items-center justify-center rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
                    Clear Filters
                  </button>
                </div>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                <select className={filterFieldClassName} onChange={(event) => updateFilter('project', event.target.value)} value={filters.project}>
                  <option value="">All Projects</option>
                  {projectOptions.map((project) => (
                    <option key={project} value={project}>{project}</option>
                  ))}
                </select>
                <select className={filterFieldClassName} onChange={(event) => updateFilter('assignee', event.target.value)} value={filters.assignee}>
                  <option value="">All Assignees</option>
                  {assigneeOptions.map((assignee) => (
                    <option key={assignee} value={assignee}>{assignee}</option>
                  ))}
                </select>
                <select
                  className={filterFieldClassName}
                  onChange={(event) => setFilters((current) => ({ ...current, timelineMode: event.target.value as TaskFilters['timelineMode'], timelineValue: '' }))}
                  value={filters.timelineMode}
                >
                  <option value="day">Day</option>
                  <option value="month">Month</option>
                  <option value="year">Year</option>
                </select>
                <input
                  className={filterFieldClassName}
                  onChange={(event) => updateFilter('timelineValue', event.target.value)}
                  placeholder={filters.timelineMode === 'year' ? 'YYYY' : undefined}
                  type={filters.timelineMode === 'day' ? 'date' : filters.timelineMode === 'month' ? 'month' : 'number'}
                  value={filters.timelineValue}
                />
                <select className={filterFieldClassName} onChange={(event) => updateFilter('status', event.target.value)} value={filters.status}>
                  <option value="">All Statuses</option>
                  {statusOptions.map((status) => (
                    <option key={status} value={status}>{formatTaskLabel(status)}</option>
                  ))}
                </select>
              </div>
              {filters.timelineMode === 'day' && filters.timelineValue ? (
                <div className="mt-4 rounded-2xl border border-[#d8ecbb] bg-white px-4 py-3 text-sm font-semibold text-slate-700">
                  {formatFilterDateLabel(filters.timelineValue)} work task list: {filteredTasks.length}
                </div>
              ) : null}
            </div>

            <div className="mt-6">
              {groupedTasks.length ? (
                <div className="space-y-6">
                  {groupedTasks.map((group) => (
                    <section key={group.projectId} className="overflow-hidden rounded-[24px] border border-slate-200">
                      <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Project</p>
                            <h2 className="mt-1 text-lg font-semibold text-slate-900">{group.projectName}</h2>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="inline-flex w-fit rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                              {group.tasks.length} {group.tasks.length === 1 ? 'Task' : 'Tasks'}
                            </span>
                            <button
                              type="button"
                              onClick={() => toggleGroup(group.projectId)}
                              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-600 transition hover:bg-slate-100"
                              aria-label={openGroups[group.projectId] ?? false ? 'Close task list' : 'Open task list'}
                            >
                              <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4 fill-current">
                                {(openGroups[group.projectId] ?? false)
                                  ? <path d="M5.2 12.3 10 7.5l4.8 4.8H5.2Z" />
                                  : <path d="M5.2 7.7 10 12.5l4.8-4.8H5.2Z" />}
                              </svg>
                            </button>
                          </div>
                        </div>
                      </div>
                      {openGroups[group.projectId] ?? false ? (
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-slate-200 text-sm">
                          <thead className="bg-white text-left text-xs uppercase tracking-[0.2em] text-slate-500">
                            <tr>
                              <th className="px-4 py-4 font-semibold">Task</th>
                              <th className="px-4 py-4 font-semibold">Assignees</th>
                              <th className="px-4 py-4 font-semibold">Due Date</th>
                              <th className="px-4 py-4 font-semibold">Priority</th>
                              {/* <th className="px-4 py-4 font-semibold">Type</th> */}
                              <th className="px-4 py-4 font-semibold">Status</th>
                              <th className="px-4 py-4 font-semibold text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200 bg-white">
                            {group.tasks.map((task) => {
                              const listStatus = getTaskListStatus(task);
                              const isAssignedToMe = task.assignedEmployeeIds.includes(me?.id || '');
                              const isCreatedByMe = Boolean(me?.id && task.createdByEmployeeId === me.id);
                              const taskApproved = isTaskApproved(task);
                              const taskSubmittedDone = isTaskSubmittedDone(task);
                              const approveWaiting = taskSubmittedDone && !taskApproved;
                              const taskComplete = taskApproved || (task.status === 'COMPLETED' && !approveWaiting);
                              const canApproveTask = approveWaiting && (isSuperAdmin || isCreatedByMe);
                              const canSubmitDone = isAssignedToMe && !taskComplete && !taskSubmittedDone;
                              const canEditTask = isSuperAdmin || isCreatedByMe || isAssignedToMe;
                              const latestActionNote = [...task.notes]
                                .reverse()
                                .find((note) => note.markDone || note.message.trim().toLowerCase().startsWith('approved by'));
                              return (
                                <tr id={`task-${task.id}`} key={task.id} className="scroll-mt-24 align-top target:bg-[#f4fae9]">
                                  <td className="px-4 py-4">
                                    <div className="min-w-[160px]">
                                      <p className="font-semibold text-slate-900">{task.title}</p>
                                      <p className="mt-1 text-slate-500">{task.description || 'No description provided.'}</p>
                                      {latestActionNote ? (
                                        <p className="mt-2 rounded-xl bg-[#f4fae9] px-3 py-2 text-xs font-medium text-slate-700">{latestActionNote.message}</p>
                                      ) : null}
                                      {task.qualityRating ? (
                                        <p className="mt-2 text-xs font-semibold text-[#6f9e2c]">Quality: {formatTaskLabel(task.qualityRating)}</p>
                                      ) : null}
                                      {task.ncItems?.length ? (
                                        <p className="mt-1 text-xs text-rose-600">NC: {task.ncItems.join(', ')}</p>
                                      ) : null}
                                    </div>
                                  </td>
                                  <td className="px-4 py-4 text-slate-700">{task.assignedEmployees.map((employee) => employee.name).join(', ') || 'None'}</td>
                                  <td className="px-4 py-4 text-slate-700">{formatDateTime(task.dueDate)}</td>
                                  <td className="px-4 py-4">
                                    <span className={['inline-flex rounded-full px-3 py-1 text-xs font-semibold', getPriorityClassName(task.priority || 'LOW')].join(' ')}>{formatTaskLabel(task.priority || 'LOW')}</span>
                                  </td>
                                  {/* <td className="px-4 py-4">
                                    <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{formatTaskLabel(task.type)}</span>
                                  </td> */}
                                  <td className="px-4 py-4">
                                    <span
                                      className={[
                                        'inline-flex rounded-full px-3 py-1 text-xs font-semibold',
                                        approveWaiting
                                          ? 'bg-amber-100 text-amber-700'
                                          : listStatus === 'COMPLETED'
                                          ? 'bg-emerald-100 text-emerald-700'
                                          : listStatus === 'IN_PROGRESS'
                                            ? 'bg-blue-100 text-blue-700'
                                            : 'bg-slate-100 text-slate-700',
                                      ].join(' ')}
                                    >
                                      {approveWaiting ? 'Approve Waiting' : listStatus === 'IN_PROGRESS' ? 'Ongoing' : formatTaskLabel(listStatus)}
                                    </span>
                                  </td>
                                  <td className="px-4 py-4 text-right">
                                    <div className="inline-flex">
                                      {canEditTask ? (
                                        <>
                                          <button
                                            className={[
                                              'inline-flex h-8 items-center gap-1.5 bg-blue-600 px-4 text-xs font-semibold uppercase tracking-[0.14em] text-white transition hover:bg-blue-700',
                                              canApproveTask || canSubmitDone || approveWaiting || taskComplete ? 'rounded-l-xl' : 'rounded-l-xl',
                                            ].join(' ')}
                                            onClick={() => router.push(`/tasks/${task.id}/edit`)}
                                            type="button"
                                          >
                                            <EditIcon className="h-6 w-4" />
                                            Edit
                                          </button>
                                          {canDeleteRecords ? (
                                            <button
                                              aria-label="Open task actions"
                                              className="inline-flex h-8 items-center rounded-r-xl border-l border-blue-500 bg-blue-600 px-3 text-white transition hover:bg-blue-700"
                                              onClick={(event) => handleActionMenuToggle(task.id, event)}
                                              type="button"
                                            >
                                              <svg viewBox="0 0 12 12" aria-hidden="true" className="h-3 w-3 fill-current">
                                                <path d="M2.2 4.2 6 8l3.8-3.8H2.2Z" />
                                              </svg>
                                            </button>
                                          ) : null}
                                          {canApproveTask ? (
                                            <button
                                              className={[
                                                'inline-flex h-8 items-center ml-2 rounded-xl border-l px-3 text-xs font-semibold uppercase transition disabled:cursor-wait disabled:opacity-60',
                                                taskApproved
                                                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                                  : 'border-[#7fb632] bg-[#8fc740] text-[#123b76] hover:bg-[#7fb632]',
                                              ].join(' ')}
                                              disabled={taskApproved || approvingTaskId === task.id}
                                              onClick={() => void approveTask(task.id)}
                                              type="button"
                                            >
                                              {taskApproved ? 'Approved' : approvingTaskId === task.id ? 'Approving...' : 'Approve'}
                                            </button>
                                          ) : null}
                                          {canSubmitDone ? (
                                            <button
                                              className="inline-flex h-8 items-center rounded-r-xl border-l border-[#7fb632] bg-[#8fc740] px-3 text-xs font-semibold uppercase text-[#123b76] transition hover:bg-[#7fb632] disabled:cursor-wait disabled:opacity-60"
                                              disabled={submittingDoneTaskId === task.id}
                                              onClick={() => openDoneConfirm(task)}
                                              type="button"
                                            >
                                              {submittingDoneTaskId === task.id ? 'Submitting...' : 'Complete'}
                                            </button>
                                          ) : null}
                                          {approveWaiting && !canApproveTask ? (
                                            <span className="inline-flex h-8 items-center rounded-r-xl border-l border-amber-200 bg-amber-50 px-3 text-xs font-semibold uppercase text-amber-700">
                                              Approve Waiting
                                            </span>
                                          ) : null}
                                          {taskComplete ? (
                                            <span className="inline-flex h-8 items-center ml-2 rounded-xl border-l border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold uppercase text-emerald-700">
                                              Complete
                                            </span>
                                          ) : null}
                                        </>
                                      ) : (
                                        canSubmitDone ? (
                                          <button
                                            className="inline-flex h-8 items-center rounded-xl bg-[#8fc740] px-1 text-xs font-semibold uppercase text-[#123b76] transition hover:bg-[#7fb632] disabled:cursor-wait disabled:opacity-60"
                                            disabled={submittingDoneTaskId === task.id}
                                            onClick={() => openDoneConfirm(task)}
                                            type="button"
                                          >
                                            {submittingDoneTaskId === task.id ? 'Submitting...' : 'Complete'}
                                          </button>
                                        ) : approveWaiting ? (
                                          <span className="inline-flex h-8 items-center rounded-xl bg-amber-50 px-4 text-xs font-semibold uppercase tracking-[0.14em] text-amber-700">
                                            Approve Waiting
                                          </span>
                                        ) : (
                                          <span className="inline-flex h-8 items-center rounded-xl bg-emerald-50 px-4 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">
                                            Complete
                                          </span>
                                        )
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      ) : null}
                    </section>
                  ))}
                </div>
              ) : <EmptyState message="No tasks match the current filters." />}
              <div className="mt-6 rounded-[24px] border border-slate-200 bg-white p-4">
                <PaginationBar
                  busy={busy}
                  itemLabel="Tasks"
                  page={page}
                  perPage={perPage}
                  total={totalTasks}
                  totalPages={totalPages}
                  onPageChange={setPage}
                  onPerPageChange={(value) => {
                    setPage(1);
                    setPerPage(value);
                  }}
                />
              </div>
            </div>
          </section>
        </section>
      </div>

      {openMenu ? (
        <div
          ref={menuRef}
          className="fixed z-[200] min-w-[170px] overflow-hidden rounded-[8px] border border-slate-200 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.18)]"
          style={{ top: openMenu.top, left: openMenu.left }}
        >
          {(() => {
            const task = filteredTasks.find((item) => item.id === openMenu.taskId) || tasks.find((item) => item.id === openMenu.taskId);
            if (!task) {
              return null;
            }

            if (!canDeleteRecords) {
              return null;
            }

            return (
              <button
                className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm font-medium text-red-600 transition hover:bg-red-50"
                onClick={() => openDeleteConfirm(task)}
                type="button"
              >
                <XMarkIcon className="h-4 w-4" />
                Delete
              </button>
            );
          })()}
        </div>
      ) : null}

      {confirmTask ? (
        <div className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-950/35 px-4">
          <div className="w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_24px_70px_rgba(15,23,42,0.18)]">
            <p className="text-sm font-medium uppercase tracking-[0.28em] text-slate-400">Task Module</p>
            <h2 className="mt-3 text-2xl font-semibold text-slate-950">Delete Task</h2>
            <p className="mt-3 text-sm leading-7 text-slate-600">Submit this task delete?</p>
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              <p className="font-semibold text-slate-900">{confirmTask.title}</p>
              <p className="mt-1">{confirmTask.projectName}</p>
            </div>
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={closeDeleteConfirm}
                disabled={Boolean(deletingTaskId)}
                className="inline-flex items-center justify-center rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void deleteTask(confirmTask.id)}
                disabled={Boolean(deletingTaskId)}
                className="inline-flex items-center justify-center rounded-2xl bg-red-600 px-5 py-3 text-sm font-medium text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-300"
              >
                {deletingTaskId ? 'Submitting...' : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmDoneTask ? (
        <div className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-950/35 px-4">
          <div className="w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_24px_70px_rgba(15,23,42,0.18)]">
            <p className="text-sm font-medium uppercase tracking-[0.28em] text-slate-400">Task Module</p>
            <h2 className="mt-3 text-2xl font-semibold text-slate-950">Complete Task</h2>
            <p className="mt-3 text-sm leading-7 text-slate-600">
              {confirmDoneTask.requireProof && !confirmDoneTask.media?.length
                ? 'This task requires an attachment. Open edit page and add Task attachments before completing.'
                : 'Submit this task as complete?'}
            </p>
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              <p className="font-semibold text-slate-900">{confirmDoneTask.title}</p>
              <p className="mt-1">{confirmDoneTask.projectName}</p>
            </div>
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={closeDoneConfirm}
                className="inline-flex items-center justify-center rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submitDoneTask(confirmDoneTask)}
                disabled={submittingDoneTaskId === confirmDoneTask.id}
                className="inline-flex items-center justify-center rounded-2xl bg-[#8fc740] px-5 py-3 text-sm font-semibold text-[#123b76] transition hover:bg-[#7fb632] disabled:cursor-wait disabled:opacity-60"
              >
                {confirmDoneTask.requireProof && !confirmDoneTask.media?.length
                  ? 'Open Edit'
                  : submittingDoneTaskId === confirmDoneTask.id
                    ? 'Submitting...'
                    : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
