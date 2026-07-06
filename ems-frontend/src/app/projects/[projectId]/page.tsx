'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, getToken } from '../../lib/api';
import { clearAuth } from '../../lib/auth';
import { getWorkspaceNavItems, routeSection } from '../../lib/workspace';
import { canManageTeamRecords, isAdminRole } from '../../lib/hierarchy';
import { DashboardSidebar, DashboardTopbar } from '../../../components/DashboardShell';
import type { DashboardResponse, NavItem, Project, SectionKey, Task } from '../../dashboard/types';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';

function EmptyState({ message }: { message: string }) {
  return <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">{message}</div>;
}

function formatLabel(value: string) {
  return value.toLowerCase().replace(/_/g, ' ').replace(/(^|\s)\S/g, (char) => char.toUpperCase());
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'Not set';
}

type TaskDraft = {
  title: string;
  description: string;
  completed: boolean;
};

export default function ProjectViewPage() {
  const params = useParams<{ projectId: string }>();
  const router = useRouter();
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [taskDrafts, setTaskDrafts] = useState<Record<string, TaskDraft>>({});
  const [updatingTasks, setUpdatingTasks] = useState(false);
  const [removingTaskId, setRemovingTaskId] = useState<string | null>(null);
  const [confirmTask, setConfirmTask] = useState<Task | null>(null);
  const [confirmUpdateOpen, setConfirmUpdateOpen] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [openEmployeeSections, setOpenEmployeeSections] = useState<Record<string, boolean>>({});

  const loadData = useCallback(async () => {
    if (!params?.projectId) {
      return;
    }

    setError('');
    try {
      const [dashboardData, projectData] = await Promise.all([
        api<DashboardResponse>('/dashboard'),
        api<Project[]>('/projects'),
      ]);
      setDashboard(dashboardData);
      const currentProject = projectData.find((item) => item.id === params.projectId) || null;
      setProject(currentProject);
      setTaskDrafts(
        currentProject
          ? Object.fromEntries(
              currentProject.tasks.map((task) => [
                task.id,
                {
                  title: task.title,
                  description: task.description || '',
                  completed: task.status === 'COMPLETED',
                },
              ]),
            )
          : {},
      );
      if (!currentProject) {
        setError('Project not found.');
      }
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Unable to load project details.';
      setError(message);
      if (message.toLowerCase().includes('unauthorized')) {
        clearAuth();
        router.replace('/auth/login');
      }
    }
  }, [params?.projectId, router]);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/auth/login');
      return;
    }
    void loadData();
  }, [loadData, router]);

  const me = dashboard?.employee;
  const isAdmin = isAdminRole(me?.roles ?? []);
  const canManage = canManageTeamRecords(me?.roles ?? []);
  const navItems = useMemo<NavItem[]>(() => getWorkspaceNavItems(canManage, isAdmin, me?.roles ?? []), [canManage, isAdmin, me?.roles]);
  const initials = me?.name?.trim()?.charAt(0)?.toUpperCase() || 'A';
  const visibleProjectTasks = useMemo(() => {
    if (!project || !me) {
      return [];
    }

    if (isAdmin) {
      return project.tasks;
    }

    return project.tasks.filter((task) => task.assignedEmployeeIds.includes(me.id));
  }, [isAdmin, me, project]);
  const employeeTaskSummary = useMemo(() => {
    if (!project || !me) {
      return [];
    }

    const employeesToShow = isAdmin ? project.assignedEmployees : project.assignedEmployees.filter((employee) => employee.id === me.id);

    return employeesToShow.map((employee) => {
      const employeeTasks = visibleProjectTasks.filter((task) => task.assignedEmployeeIds.includes(employee.id));
      const pendingTasks = employeeTasks.filter((task) => task.status !== 'COMPLETED');
      const completedTasks = employeeTasks.filter((task) => task.status === 'COMPLETED');

      return {
        employee,
        pendingTasks,
        completedTasks,
      };
    });
  }, [isAdmin, me, project, visibleProjectTasks]);

  useEffect(() => {
    setOpenEmployeeSections((current) => {
      const next: Record<string, boolean> = {};
      employeeTaskSummary.forEach(({ employee }) => {
        next[employee.id] = current[employee.id] ?? false;
      });
      return next;
    });
  }, [employeeTaskSummary]);

  function updateTaskDraft(taskId: string, changes: Partial<TaskDraft>) {
    setTaskDrafts((current) => ({
      ...current,
      [taskId]: {
        ...(current[taskId] ?? { title: '', description: '', completed: false }),
        ...changes,
      },
    }));
  }

  function getTaskDraft(task: Task) {
    return taskDrafts[task.id] ?? {
      title: task.title,
      description: task.description || '',
      completed: task.status === 'COMPLETED',
    };
  }

  function handleSection(section: SectionKey) {
    setSidebarOpen(false);
    routeSection(router, section);
  }

  function handleLogout() {
    clearAuth();
    router.replace('/auth/login');
  }

  function toggleEmployeeSection(employeeId: string) {
    setOpenEmployeeSections((current) => ({
      ...current,
      [employeeId]: !(current[employeeId] ?? false),
    }));
  }

  async function handleRunReport() {
    try {
      await api('/reports/run-scheduled', { method: 'POST' });
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'Unable to trigger reports.');
    }
  }

  function openUpdateConfirm() {
    setSuccessMessage('');
    setConfirmUpdateOpen(true);
  }

  function closeUpdateConfirm() {
    if (updatingTasks) {
      return;
    }
    setConfirmUpdateOpen(false);
  }

  async function handleUpdateTasks() {
    if (!project) {
      return;
    }

    const changedTasks = project.tasks.filter((task) => {
      const draft = getTaskDraft(task);
      return (
        draft.title.trim() !== task.title ||
        draft.description !== (task.description || '') ||
        draft.completed !== (task.status === 'COMPLETED')
      );
    });

    if (!changedTasks.length) {
      setConfirmUpdateOpen(false);
      setError('No task changes to update.');
      return;
    }

    const invalidTask = changedTasks.find((task) => !getTaskDraft(task).title.trim());
    if (invalidTask) {
      setConfirmUpdateOpen(false);
      setError('Task title is required.');
      return;
    }

    setUpdatingTasks(true);
    setError('');
    setSuccessMessage('');
    try {
      await Promise.all(
        changedTasks.map((task) => {
          const draft = getTaskDraft(task);
          return api(`/tasks/${task.id}`, {
            method: 'PATCH',
            body: JSON.stringify({
              title: draft.title.trim(),
              description: draft.description.trim(),
              status: draft.completed ? 'COMPLETED' : 'PENDING',
            }),
          });
        }),
      );
      setConfirmUpdateOpen(false);
      setSuccessMessage('Update successfully.');
      await loadData();
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'Unable to update tasks.');
    } finally {
      setUpdatingTasks(false);
    }
  }

  function openRemoveConfirm(task: Task) {
    setSuccessMessage('');
    setConfirmTask(task);
  }

  function closeRemoveConfirm() {
    if (removingTaskId) {
      return;
    }
    setConfirmTask(null);
  }

  async function submitRemoveTask() {
    if (!confirmTask) {
      return;
    }

    setRemovingTaskId(confirmTask.id);
    setError('');
    setSuccessMessage('');
    try {
      await api(`/tasks/${confirmTask.id}`, { method: 'DELETE' });
      setConfirmTask(null);
      setSuccessMessage('Remove successfully.');
      await loadData();
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'Unable to remove task.');
    } finally {
      setRemovingTaskId(null);
    }
  }

  return (
    <main className="min-h-screen bg-[#edf2f7] text-slate-900 lg:flex">
      <DashboardSidebar activeSection="projects" navItems={navItems} onClose={() => setSidebarOpen(false)} onSelect={handleSection} open={sidebarOpen} />
      <div className="flex min-w-0 flex-1 flex-col">
        <DashboardTopbar canRunReport={isAdmin} initials={initials} userEmail={me?.email ?? ''} userName={me?.name ?? 'Admin'} onLogout={handleLogout} onMenuOpen={() => setSidebarOpen(true)} onRunReport={handleRunReport} subtitle="Task Management System" title="Project View" />
        <section className="px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
          {error ? <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
          {successMessage ? <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{successMessage}</div> : null}
          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.06)] sm:p-6 lg:p-7">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-4">
                <button
                  onClick={() => router.push('/projects')}
                  className="rounded-full border border-gray-300 p-2 transition hover:bg-gray-100"
                  type="button"
                >
                  <ArrowLeftIcon className="h-5 w-5 text-gray-700" />
                </button>
                <div>
                  <p className="text-sm font-medium uppercase tracking-[0.3em] text-slate-400">Project Module</p>
                  <h1 className="mt-2 text-3xl font-semibold text-slate-900">{project?.name}</h1>
                  <p className="mt-2 text-sm text-slate-500">{project?.description || 'No description provided.'}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => router.push('/projects')}
                className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Back to Projects
              </button>
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs uppercase tracking-[0.25em] text-slate-500">Status</p><p className="mt-2 text-lg font-semibold text-slate-950">{formatLabel(project?.projectStatus ? project.projectStatus : 'Not added')}</p></div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs uppercase tracking-[0.25em] text-slate-500">Due Date</p><p className="mt-2 text-lg font-semibold text-slate-950">{formatDate(project?.dueDate ? project.dueDate : 'Not added')}</p></div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs uppercase tracking-[0.25em] text-slate-500">Employees</p><p className="mt-2 text-lg font-semibold text-slate-950">{project?.assignedEmployees.length}</p></div>
            </div>

            <section className="mt-8 rounded-[26px] border border-slate-200 bg-slate-50 p-4 sm:p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-lg font-semibold text-slate-900">Project Tasks</p>
                  <p className="text-sm text-slate-500">Update the existing task details below.</p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => router.push(`/tasks/new?projectId=${project?.id}`)}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    + Add Task
                  </button>
                  <button
                    type="button"
                    onClick={openUpdateConfirm}
                    disabled={updatingTasks}
                    className="inline-flex items-center gap-2 rounded-full border border-blue-600 bg-blue-600 px-5 py-3 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:border-blue-300 disabled:bg-blue-300"
                  >
                    {updatingTasks ? 'Updating...' : 'Update'}
                  </button>
                </div>
              </div>
              <div className="mt-5 space-y-4">
                {visibleProjectTasks.length ? visibleProjectTasks.map((task) => {
                  const draft = getTaskDraft(task);
                  return (
                    <div key={task.id} className="rounded-[24px] border border-slate-200 bg-white p-4">
                      <div className="grid gap-3 lg:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-center">
                        <label className="flex h-[56px] items-center justify-center rounded-[22px] border border-slate-200 bg-slate-50 px-4">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-slate-300"
                            checked={draft.completed}
                            onChange={() => updateTaskDraft(task.id, { completed: !draft.completed })}
                          />
                        </label>
                        <input
                          className="h-[56px] w-full rounded-[22px] border border-slate-200 bg-white px-6 text-base text-slate-900 outline-none"
                          value={draft.title}
                          onChange={(event) => updateTaskDraft(task.id, { title: event.target.value })}
                          placeholder="Task title"
                        />
                        <input
                          className="h-[56px] w-full rounded-[22px] border border-slate-200 bg-white px-6 text-base text-slate-900 outline-none"
                          value={draft.description}
                          onChange={(event) => updateTaskDraft(task.id, { description: event.target.value })}
                          placeholder="Task description"
                        />
                        <button
                          type="button"
                          onClick={() => openRemoveConfirm(task)}
                          disabled={!isAdmin}
                          className={[
                            'inline-flex h-[56px] items-center justify-center gap-2 rounded-[22px] border px-6 text-base font-medium transition',
                            isAdmin
                              ? 'border-red-200 bg-red-50 text-red-600 hover:bg-red-100'
                              : 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400',
                          ].join(' ')}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  );
                }) : <EmptyState message={isAdmin ? 'No tasks added to this project yet.' : 'No assigned tasks found for you in this project.'} />}
              </div>
            </section>

            <section className="mt-8 space-y-6">
              {employeeTaskSummary.length ? employeeTaskSummary.map(({ employee, pendingTasks, completedTasks }) => (
                <section key={employee.id} className="rounded-[24px] border border-slate-200 bg-slate-50 p-4 sm:p-5">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="text-xl font-semibold text-slate-950">{employee.name}</h2>
                      <p className="text-sm text-slate-500">{employee.roles.map((role) => formatLabel(role)).join(', ')}</p>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <span className="rounded-full bg-amber-100 px-3 py-1 font-semibold text-amber-700">Pending {pendingTasks.length}</span>
                      <span className="rounded-full bg-emerald-100 px-3 py-1 font-semibold text-emerald-700">Completed {completedTasks.length}</span>
                      <button
                        type="button"
                        onClick={() => toggleEmployeeSection(employee.id)}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-600 transition hover:bg-slate-100"
                        aria-label={openEmployeeSections[employee.id] ?? false ? 'Close employee tasks' : 'Open employee tasks'}
                      >
                        <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4 fill-current">
                          {(openEmployeeSections[employee.id] ?? false)
                            ? <path d="M5.2 12.3 10 7.5l4.8 4.8H5.2Z" />
                            : <path d="M5.2 7.7 10 12.5l4.8-4.8H5.2Z" />}
                        </svg>
                      </button>
                    </div>
                  </div>

                  {(openEmployeeSections[employee.id] ?? false) ? (
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
                  ) : null}
                </section>
              )) : <EmptyState message="No assigned employees found for this project." />}
            </section>
          </section>
        </section>
      </div>

      {confirmTask ? (
        <div className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-950/35 px-4">
          <div className="w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_24px_70px_rgba(15,23,42,0.18)]">
            <p className="text-sm font-medium uppercase tracking-[0.28em] text-slate-400">Project Module</p>
            <h2 className="mt-3 text-2xl font-semibold text-slate-950">Remove Task</h2>
            <p className="mt-3 text-sm leading-7 text-slate-600">Submit this task removal?</p>
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              <p className="font-semibold text-slate-900">{confirmTask.title}</p>
              <p className="mt-1">{confirmTask.projectName}</p>
            </div>
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={closeRemoveConfirm}
                disabled={Boolean(removingTaskId)}
                className="inline-flex items-center justify-center rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submitRemoveTask()}
                disabled={Boolean(removingTaskId)}
                className="inline-flex items-center justify-center rounded-2xl bg-red-600 px-5 py-3 text-sm font-medium text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-300"
              >
                {removingTaskId ? 'Submitting...' : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmUpdateOpen ? (
        <div className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-950/35 px-4">
          <div className="w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_24px_70px_rgba(15,23,42,0.18)]">
            <p className="text-sm font-medium uppercase tracking-[0.28em] text-slate-400">Project Module</p>
            <h2 className="mt-3 text-2xl font-semibold text-slate-950">Update Tasks</h2>
            <p className="mt-3 text-sm leading-7 text-slate-600">Submit these project task updates?</p>
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={closeUpdateConfirm}
                disabled={Boolean(updatingTasks)}
                className="inline-flex items-center justify-center rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleUpdateTasks()}
                disabled={Boolean(updatingTasks)}
                className="inline-flex items-center justify-center rounded-2xl bg-blue-600 px-5 py-3 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
              >
                {updatingTasks ? 'Submitting...' : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
