'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, getToken } from '../../lib/api';
import { clearAuth } from '../../lib/auth';
import { getWorkspaceNavItems, routeSection } from '../../lib/workspace';
import { canManageTeamRecords, canRunReports, formatRoleName, isAdminRole } from '../../lib/hierarchy';
import { DashboardSidebar, DashboardTopbar } from '../../../components/DashboardShell';
import type { DashboardResponse, Employee, NavItem, Project, SectionKey, Task } from '../../dashboard/types';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';

function EmptyState({ message }: { message: string }) {
  return <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">{message}</div>;
}

function formatLabel(value: string) {
  return formatRoleName(value);
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'Not set';
}

function isTaskApproved(task: Task) {
  return task.notes.some((note) => note.message.trim().toLowerCase().startsWith('approved by'));
}

export default function EmployeeViewPage() {
  const params = useParams<{ id: string }>();
  const employeeId = params?.id;
  const router = useRouter();
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const loadData = useCallback(async () => {
    if (!employeeId) {
      return;
    }

    setError('');
    try {
      const [dashboardData, employeeData, taskData, projectData] = await Promise.all([
        api<DashboardResponse>('/dashboard'),
        api<Employee[]>('/employees'),
        api<Task[]>('/tasks'),
        api<Project[]>('/projects'),
      ]);
      setDashboard(dashboardData);
      setTasks(taskData);
      setProjects(projectData);
      const currentEmployee = employeeData.find((item) => item.id === employeeId) || null;
      setEmployee(currentEmployee);
      if (!currentEmployee) {
        setError('Employee not found.');
      }
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Unable to load employee details.';
      setError(message);
      if (message.toLowerCase().includes('unauthorized')) {
        clearAuth();
        router.replace('/auth/login');
      }
    }
  }, [employeeId, router]);

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
  const canManage = canManageTeamRecords(me?.roles ?? []);
  const navItems = useMemo<NavItem[]>(() => getWorkspaceNavItems(canManage, isAdmin, me?.roles ?? []), [canManage, isAdmin, me?.roles]);
  const initials = me?.name?.trim()?.charAt(0)?.toUpperCase() || 'A';

  const assignedProjects = useMemo(() => {
    if (!employee) {
      return [];
    }
    return projects.filter((project) => project.assignedEmployeeIds.includes(employee.id));
  }, [employee, projects]);

  const employeeTasks = useMemo(() => {
    if (!employee) {
      return [];
    }
    return tasks.filter((task) => task.assignedEmployeeIds.includes(employee.id));
  }, [employee, tasks]);

  const pendingTasks = useMemo(() => employeeTasks.filter((task) => !isTaskApproved(task)), [employeeTasks]);
  const completedTasks = useMemo(() => employeeTasks.filter((task) => isTaskApproved(task)), [employeeTasks]);

  function handleSection(section: SectionKey) {
    setSidebarOpen(false);
    routeSection(router, section);
  }

  function handleLogout() {
    clearAuth();
    router.replace('/auth/login');
  }

  async function handleRunReport() {
    try {
      await api('/reports/run-scheduled', { method: 'POST' });
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'Unable to trigger reports.');
    }
  }

  return (
    <main className="min-h-screen bg-[#edf2f7] text-slate-900 lg:flex">
      <DashboardSidebar activeSection="employees" navItems={navItems} onClose={() => setSidebarOpen(false)} onSelect={handleSection} open={sidebarOpen} />
      <div className="flex min-w-0 flex-1 flex-col">
        <DashboardTopbar canRunReport={canRunReports(me?.roles ?? [])} initials={initials} userEmail={me?.email ?? ''} userName={me?.name ?? 'Admin'} onLogout={handleLogout} onMenuOpen={() => setSidebarOpen(true)} onRunReport={handleRunReport} subtitle="Task Management System" title="Employee View" />
        <section className="px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
          {error ? <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.06)] sm:p-6 lg:p-7">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-4">
                <button onClick={() => router.push('/employees')} className="p-2 rounded-full border border-gray-300 hover:bg-gray-100 transition">
                  <ArrowLeftIcon className="h-5 w-5 text-gray-700" />
                </button>
                <div>
                  <p className="text-sm font-medium uppercase tracking-[0.3em] text-slate-400">Employees Module</p>
                  <h1 className="mt-2 text-3xl font-semibold text-slate-900">{employee?.name}</h1>
                  <p className="mt-2 text-sm text-slate-500">{employee?.roles.map((role) => formatLabel(role)).join(', ')}</p>
                </div>
              </div>
              <button type="button" onClick={() => router.push('/employees')} className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
                Back to Employees
              </button>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs uppercase tracking-[0.25em] text-slate-500">Phone</p><p className="mt-2 text-lg font-semibold text-slate-950">{employee?.phone || 'Not added'}</p></div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs uppercase tracking-[0.25em] text-slate-500">Assigned Projects</p><p className="mt-2 text-lg font-semibold text-slate-950">{assignedProjects.length}</p></div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs uppercase tracking-[0.25em] text-slate-500">Pending Tasks</p><p className="mt-2 text-lg font-semibold text-slate-950">{pendingTasks.length}</p></div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs uppercase tracking-[0.25em] text-slate-500">Completed Tasks</p><p className="mt-2 text-lg font-semibold text-slate-950">{completedTasks.length}</p></div>
            </div>

            <div className="mt-8 space-y-6">
              <section className="rounded-[24px] border border-slate-200 bg-slate-50 p-4 sm:p-5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-xl font-semibold text-slate-950">{employee?.name}</h2>
                    <p className="text-sm text-slate-500">{employee?.roles.map((role) => formatLabel(role)).join(', ')}</p>
                  </div>
                  <div className="flex gap-3 text-sm">
                    <span className="rounded-full bg-amber-100 px-3 py-1 font-semibold text-amber-700">Pending {pendingTasks.length}</span>
                    <span className="rounded-full bg-emerald-100 px-3 py-1 font-semibold text-emerald-700">Completed {completedTasks.length}</span>
                  </div>
                </div>

                <div className="mt-5 grid gap-4 xl:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Pending Tasks</h3>
                    <div className="mt-4 space-y-3">
                      {pendingTasks.length ? pendingTasks.map((task) => (
                        <article key={task.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <p className="font-semibold text-slate-900">{task.title}</p>
                          <p className="mt-1 text-sm text-slate-600">{task.description || 'No description provided.'}</p>
                          <p className="mt-2 text-xs text-slate-500">Status: {formatLabel(task.status)} | Due: {formatDate(task.dueDate)}</p>
                        </article>
                      )) : <EmptyState message="No pending tasks for this employee." />}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Completed Tasks</h3>
                    <div className="mt-4 space-y-3">
                      {completedTasks.length ? completedTasks.map((task) => (
                        <article key={task.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <p className="font-semibold text-slate-900">{task.title}</p>
                          <p className="mt-1 text-sm text-slate-600">{task.description || 'No description provided.'}</p>
                          <p className="mt-2 text-xs text-slate-500">Status: {formatLabel(task.status)} | Due: {formatDate(task.dueDate)}</p>
                        </article>
                      )) : <EmptyState message="No completed tasks for this employee." />}
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}
