'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, getToken } from '../../lib/api';
import { clearAuth } from '../../lib/auth';
import { getWorkspaceNavItems, routeSection } from '../../lib/workspace';
import { canManageTeamRecords, canRunReports, isAdminRole } from '../../lib/hierarchy';
import { DashboardSidebar, DashboardTopbar } from '../../../components/DashboardShell';
import { PdfDocumentPreview } from '../../../components/PdfDocumentPreview';
import type { DashboardResponse, NavItem, PaginatedResponse, Project, SectionKey, Task, TaskMedia } from '../../dashboard/types';
import { ArrowLeftIcon, TrashIcon } from '@heroicons/react/24/outline';

const PROJECT_TASKS_PER_PAGE = 10;

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

function getTaskMediaType(file: File): TaskMedia['type'] {
  return file.type.startsWith('image/') ? 'PHOTO' : 'DOCUMENT';
}

function isSupportedTaskFile(file: File) {
  return file.type.startsWith('image/') || /\.(pdf|docx?|xlsx?|csv|txt|rtf|pptx?)$/i.test(file.name);
}

function readFileAsTaskMedia(file: File, createdById?: string | null): Promise<TaskMedia> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({
      id: crypto.randomUUID(),
      type: getTaskMediaType(file),
      url: String(reader.result || ''),
      label: file.name,
      mimeType: file.type,
      createdById: createdById || null,
    });
    reader.onerror = () => reject(reader.error || new Error('Unable to read file.'));
    reader.readAsDataURL(file);
  });
}

export default function ProjectViewPage() {
  const params = useParams<{ projectId: string }>();
  const router = useRouter();
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [projectTasks, setProjectTasks] = useState<Task[]>([]);
  const [taskPage, setTaskPage] = useState(1);
  const [taskSearch, setTaskSearch] = useState('');
  const [totalProjectTasks, setTotalProjectTasks] = useState(0);
  const [taskDrafts, setTaskDrafts] = useState<Record<string, TaskDraft>>({});
  const [updatingTasks, setUpdatingTasks] = useState(false);
  const [uploadingTaskId, setUploadingTaskId] = useState<string | null>(null);
  const [removingTaskId, setRemovingTaskId] = useState<string | null>(null);
  const [confirmTask, setConfirmTask] = useState<Task | null>(null);
  const [confirmUpdateOpen, setConfirmUpdateOpen] = useState(false);
  const [previewMedia, setPreviewMedia] = useState<TaskMedia | null>(null);
  const [proofPopupMessage, setProofPopupMessage] = useState('');
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
        api<Project>(`/projects/${params.projectId}?includeTasks=false`),
      ]);
      const canSeeAllTasks = dashboardData.employee.roles.includes('SA1') || dashboardData.employee.roles.includes('SA2');
      const employeeFilter = canSeeAllTasks ? '' : `&employeeIds=${encodeURIComponent(dashboardData.employee.id)}`;
      const searchFilter = taskSearch.trim() ? `&search=${encodeURIComponent(taskSearch.trim())}` : '';
      const taskData = await api<PaginatedResponse<Task>>(
        `/tasks?projectId=${encodeURIComponent(params.projectId)}&page=${taskPage}&perPage=${PROJECT_TASKS_PER_PAGE}${employeeFilter}${searchFilter}`,
      );
      setDashboard(dashboardData);
      setProject(projectData);
      setProjectTasks(taskData.items);
      setTotalProjectTasks(taskData.total);
      setTaskDrafts(
        taskData.items
          ? Object.fromEntries(
              taskData.items.map((task) => [
                task.id,
                {
                  title: task.title,
                  description: task.description || '',
                  completed: isTaskChecked(task),
                },
              ]),
            )
          : {},
      );
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Unable to load project details.';
      setError(message);
      if (message.toLowerCase().includes('unauthorized')) {
        clearAuth();
        router.replace('/auth/login');
      }
    }
  }, [params?.projectId, router, taskPage, taskSearch]);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/auth/login');
      return;
    }
    void loadData();
  }, [loadData, router]);

  useEffect(() => {
    setTaskPage(1);
  }, [taskSearch]);

  const me = dashboard?.employee;
  const isAdmin = isAdminRole(me?.roles ?? []);
  const canEditProject = Boolean(me?.roles.includes('SA1'));
  const canViewAllProjectTasks = Boolean(me?.roles.includes('SA1') || me?.roles.includes('SA2'));
  const canManage = canManageTeamRecords(me?.roles ?? []);
  const navItems = useMemo<NavItem[]>(() => getWorkspaceNavItems(canManage, isAdmin, me?.roles ?? []), [canManage, isAdmin, me?.roles]);
  const initials = me?.name?.trim()?.charAt(0)?.toUpperCase() || 'A';
  const canToggleTaskStatus = useCallback((task: Task) => Boolean(
    me && (canViewAllProjectTasks || task.assignedEmployeeIds.includes(me.id)),
  ), [canViewAllProjectTasks, me]);
  const visibleProjectTasks = useMemo(() => {
    if (!project || !me) {
      return [];
    }

    if (canViewAllProjectTasks) {
      return projectTasks;
    }

    return projectTasks.filter((task) => task.assignedEmployeeIds.includes(me.id));
  }, [canViewAllProjectTasks, me, project, projectTasks]);
  const totalTaskPages = Math.max(1, Math.ceil(totalProjectTasks / PROJECT_TASKS_PER_PAGE));
  const canUpdateVisibleTasks = visibleProjectTasks.some((task) => canEditProject || canToggleTaskStatus(task));
  const employeeTaskSummary = useMemo(() => {
    if (!project || !me) {
      return [];
    }

    const employeesToShow = canViewAllProjectTasks ? project.assignedEmployees : project.assignedEmployees.filter((employee) => employee.id === me.id);

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
  }, [canViewAllProjectTasks, me, project, visibleProjectTasks]);

  useEffect(() => {
    setOpenEmployeeSections((current) => {
      const next: Record<string, boolean> = {};
      employeeTaskSummary.forEach(({ employee }) => {
        next[employee.id] = current[employee.id] ?? false;
      });
      return next;
    });
  }, [employeeTaskSummary]);

  function updateTaskDraft(task: Task, changes: Partial<TaskDraft>) {
    setTaskDrafts((current) => ({
      ...current,
      [task.id]: {
        ...(current[task.id] ?? {
          title: task.title,
          description: task.description || '',
          completed: isTaskChecked(task),
        }),
        ...changes,
      },
    }));
  }

  function getTaskDraft(task: Task) {
    return taskDrafts[task.id] ?? {
      title: task.title,
      description: task.description || '',
      completed: isTaskChecked(task),
    };
  }

  function getTaskMediaLabel(media: TaskMedia) {
    return media.label || (media.type === 'PHOTO' ? 'Photo file' : 'Document file');
  }

  function getAssignedToLabel(task: Task) {
    return task.assignedEmployees.map((employee) => employee.name).join(', ') || 'Not assigned';
  }

  function isTaskApproved(task: Task) {
    return task.notes.some((note) => note.message.trim().toLowerCase().startsWith('approved by'));
  }

  function isTaskSubmittedDone(task: Task) {
    return task.notes.some((note) => note.markDone);
  }

  function isTaskApproveWaiting(task: Task) {
    return isTaskSubmittedDone(task) && !isTaskApproved(task);
  }

  function isTaskChecked(task: Task) {
    return isTaskApproved(task) || task.status === 'COMPLETED' || isTaskApproveWaiting(task);
  }

  function canApproveTask(task: Task) {
    return Boolean(me && isTaskApproveWaiting(task) && (task.createdByEmployeeId === me.id || me.roles.includes('SA1')));
  }

  function taskHasProofMedia(task: Task) {
    return Boolean((task.media || []).length);
  }

  function showProofPopup(message: string) {
    setProofPopupMessage(message);
  }

  function toggleTaskCompleted(task: Task) {
    if (!canToggleTaskStatus(task)) {
      return;
    }

    const draft = getTaskDraft(task);
    const nextCompleted = !draft.completed;
    if (nextCompleted && task.requireProof && !taskHasProofMedia(task)) {
      showProofPopup('First upload proof file/photo before marking this task complete.');
      return;
    }

    updateTaskDraft(task, { completed: nextCompleted });
  }

  async function handleTaskFilesChange(task: Task, files: FileList | null) {
    const allFiles = Array.from(files || []);
    const selectedFiles = allFiles.filter(isSupportedTaskFile);

    if (!task.requireProof) {
      setError('Assigned by did not require proof file/photo for this task.');
      return;
    }

    if (!canToggleTaskStatus(task)) {
      setError('You do not have permission to upload proof for this task.');
      return;
    }

    if (allFiles.length && selectedFiles.length !== allFiles.length) {
      setError('Only document and photo files are allowed.');
    }

    if (!selectedFiles.length) {
      return;
    }

    setUploadingTaskId(task.id);
    setError('');
    setSuccessMessage('');
    try {
      const uploadedMedia = await Promise.all(selectedFiles.map((file) => readFileAsTaskMedia(file, me?.id)));
      const nextMedia = [...(task.media || []), ...uploadedMedia];
      const updatedTask = await api<Task>(`/tasks/${task.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ media: nextMedia }),
      });
      setSuccessMessage('Proof file/photo uploaded.');
      await loadData();
      setProjectTasks((current) => current.map((item) => (item.id === updatedTask.id ? updatedTask : item)));
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Unable to upload proof file/photo.');
    } finally {
      setUploadingTaskId(null);
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
    if (!visibleProjectTasks.some((task) => canEditProject || canToggleTaskStatus(task))) {
      setError('You do not have permission to update these tasks.');
      return;
    }
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

    const changedTasks = visibleProjectTasks.filter((task) => {
      const draft = getTaskDraft(task);
      const checkedFromDatabase = isTaskChecked(task);
      if (canEditProject) {
        return (
          draft.title.trim() !== task.title ||
          draft.description !== (task.description || '') ||
          draft.completed !== checkedFromDatabase
        );
      }

      if (!canToggleTaskStatus(task)) {
        return false;
      }

      return draft.completed !== checkedFromDatabase;
    });

    const permittedChangedTasks = changedTasks.filter((task) => canEditProject || canToggleTaskStatus(task));

    if (!permittedChangedTasks.length) {
      setConfirmUpdateOpen(false);
      setError('No task changes to update.');
      return;
    }

    const invalidTask = permittedChangedTasks.find((task) => canEditProject && !getTaskDraft(task).title.trim());
    if (invalidTask) {
      setConfirmUpdateOpen(false);
      setError('Task title is required.');
      return;
    }

    const missingProofTask = permittedChangedTasks.find((task) => {
      const draft = getTaskDraft(task);
      return draft.completed && task.status !== 'COMPLETED' && task.requireProof && !taskHasProofMedia(task);
    });
    if (missingProofTask) {
      setConfirmUpdateOpen(false);
      showProofPopup('First upload proof file/photo before marking this task complete.');
      return;
    }

    setUpdatingTasks(true);
    setError('');
    setSuccessMessage('');
    try {
      await Promise.all(
        permittedChangedTasks.map((task) => {
          const draft = getTaskDraft(task);
          const checkedFromDatabase = isTaskChecked(task);
          if (draft.completed && !checkedFromDatabase && task.assignedEmployeeIds.includes(me?.id || '') && !isTaskSubmittedDone(task)) {
            return api(`/tasks/${task.id}/notes`, {
              method: 'POST',
              body: JSON.stringify({
                message: task.requireProof
                  ? `${me?.name || 'Assigned user'} submitted work for approval with proof attachment.`
                  : `${me?.name || 'Assigned user'} submitted work for approval.`,
                markDone: true,
              }),
            });
          }
          if (draft.completed && canApproveTask(task)) {
            return api(`/tasks/${task.id}/approve`, { method: 'POST' });
          }
          const body = canEditProject
            ? {
                title: draft.title.trim(),
                description: draft.description.trim(),
                status: draft.completed ? 'COMPLETED' : 'PENDING',
              }
            : {
                status: draft.completed ? 'COMPLETED' : 'PENDING',
              };
          return api(`/tasks/${task.id}`, {
            method: 'PATCH',
            body: JSON.stringify(body),
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
        <DashboardTopbar canRunReport={canRunReports(me?.roles ?? [])} initials={initials} userEmail={me?.email ?? ''} userName={me?.name ?? 'Admin'} onLogout={handleLogout} onMenuOpen={() => setSidebarOpen(true)} onRunReport={handleRunReport} subtitle="Task Management System" title="Project View" />
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
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs uppercase tracking-[0.25em] text-slate-500">Tasks</p><p className="mt-2 text-lg font-semibold text-slate-950">{totalProjectTasks}</p></div>
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
                    disabled={updatingTasks || !canUpdateVisibleTasks}
                    className="inline-flex items-center gap-2 rounded-full border border-blue-600 bg-blue-600 px-5 py-3 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:border-blue-300 disabled:bg-blue-300"
                  >
                    {updatingTasks ? 'Updating...' : 'Update'}
                  </button>
                </div>
              </div>
              <div className="mt-5">
                <label className="block text-sm font-medium text-slate-700">Search Tasks</label>
                <div className="relative mt-2">
                  <input
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 pr-12 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400"
                    onChange={(event) => setTaskSearch(event.target.value)}
                    placeholder="Search task title, description, status, or assigned person"
                    value={taskSearch}
                  />
                  {taskSearch ? (
                    <button
                      type="button"
                      onClick={() => setTaskSearch('')}
                      className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-sm font-bold text-slate-500 transition hover:bg-red-50 hover:text-red-600"
                      aria-label="Clear task search"
                    >
                      x
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="mt-5 space-y-4">
                {visibleProjectTasks.length ? visibleProjectTasks.map((task) => {
                  const draft = getTaskDraft(task);
                  const canToggleStatus = canEditProject || canToggleTaskStatus(task);
                  const taskMedia = task.media || [];
                  const hasProofMedia = taskMedia.length > 0;
                  const canUploadProof = Boolean(task.requireProof && canToggleStatus && !hasProofMedia);
                  const approveWaiting = isTaskApproveWaiting(task);
                  const taskApproved = isTaskApproved(task);
                  const showApproveButton = canApproveTask(task);
                  return (
                    <div key={task.id} className="rounded-[24px] border border-slate-200 bg-white p-4">
                      <div className="grid gap-3 lg:grid-cols-[auto_minmax(0,1fr)_auto_auto_auto] lg:items-center">
                        <label className="flex h-[56px] items-center justify-center gap-3 rounded-[22px] border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-700">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-slate-300"
                            checked={draft.completed}
                            disabled={!canToggleStatus}
                            onChange={() => toggleTaskCompleted(task)}
                          />
                        </label>
                        <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                          <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Assigned To</p>
                          <p className="mt-1 font-semibold text-slate-900">{getAssignedToLabel(task)}</p>
                        </div>
                        {approveWaiting ? (
                          <div className="inline-flex h-[56px] items-center justify-center rounded-[22px] border border-amber-200 bg-amber-50 px-4 text-sm font-semibold text-amber-700">
                            Approve Pending
                          </div>
                        ) : taskApproved || task.status === 'COMPLETED' ? (
                          <div className="inline-flex h-[56px] items-center justify-center rounded-[22px] border border-emerald-200 bg-emerald-50 px-4 text-sm font-semibold text-emerald-700">
                            Complete
                          </div>
                        ) : null}
                        {showApproveButton ? (
                          <button
                            type="button"
                            onClick={async () => {
                              setUpdatingTasks(true);
                              setError('');
                              try {
                                await api(`/tasks/${task.id}/approve`, { method: 'POST' });
                                setSuccessMessage('Task approved successfully.');
                                await loadData();
                              } catch (approvalError) {
                                setError(approvalError instanceof Error ? approvalError.message : 'Unable to approve task.');
                              } finally {
                                setUpdatingTasks(false);
                              }
                            }}
                            disabled={updatingTasks}
                            className="inline-flex h-[56px] items-center justify-center rounded-[22px] border border-[#7fb632] bg-[#8fc740] px-5 text-sm font-bold text-[#123b76] transition hover:bg-[#7fb632] disabled:cursor-wait disabled:opacity-60"
                          >
                            {updatingTasks ? 'Approving...' : 'Approve'}
                          </button>
                        ) : null}
                        {canEditProject ? (
                          <button
                            type="button"
                            onClick={() => openRemoveConfirm(task)}
                            className="inline-flex h-[56px] w-[56px] items-center justify-center rounded-[22px] border border-red-200 bg-red-50 text-red-600 transition hover:bg-red-100"
                            aria-label={`Remove ${task.title}`}
                          >
                            <TrashIcon className="h-5 w-5" />
                          </button>
                        ) : null}
                      </div>
                      <label className="mt-3 block">
                        <span className="mb-2 block text-xs font-medium text-slate-700">Task Title <span className="text-red-500">*</span></span>
                        <input
                          className="min-h-[56px] w-full rounded-[22px] border border-slate-200 bg-white px-6 py-4 text-base text-slate-900 outline-none"
                          disabled={!canEditProject}
                          value={draft.title}
                          onChange={(event) => updateTaskDraft(task, { title: event.target.value })}
                          placeholder="Task title"
                        />
                      </label>
                      <label className="mt-3 block">
                        <span className="mb-2 block text-xs font-medium text-slate-700">Task Description <span className="text-red-500">*</span></span>
                        <textarea
                          className="min-h-[96px] w-full resize-y rounded-[22px] border border-slate-200 bg-white px-6 py-4 text-base text-slate-900 outline-none"
                          disabled={!canEditProject}
                          value={draft.description}
                          onChange={(event) => updateTaskDraft(task, { description: event.target.value })}
                          placeholder="Task description"
                        />
                      </label>
                      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                        <div>
                          <input
                            className={[
                              'block h-[48px] w-full min-w-0 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition file:mr-3 file:h-8 file:rounded-xl file:border-0 file:bg-[#8fc740] file:px-3 file:text-sm file:font-semibold file:text-[#123b76] hover:file:bg-[#7fb337] focus:border-[#8fc740] focus:ring-2 focus:ring-[#dff1c5]',
                              !canUploadProof ? 'cursor-not-allowed bg-slate-100 text-slate-400 opacity-60 file:bg-slate-200 file:text-slate-500 hover:file:bg-slate-200' : '',
                            ].join(' ')}
                            type="file"
                            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.rtf,.ppt,.pptx"
                            multiple
                            disabled={!canUploadProof || uploadingTaskId === task.id}
                            onChange={(event) => {
                              void handleTaskFilesChange(task, event.target.files);
                              event.currentTarget.value = '';
                            }}
                          />
                          <p className="mt-1 text-xs font-medium text-slate-500">
                            {task.requireProof
                              ? hasProofMedia
                                ? 'Proof file/photo uploaded. Choose file disabled.'
                                : 'Proof file/photo required. Upload first, then mark complete and update.'
                              : 'Proof file/photo not required for this task.'}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600">
                            {uploadingTaskId === task.id ? 'Uploading...' : `${taskMedia.length} file${taskMedia.length === 1 ? '' : 's'}`}
                          </span>
                          {taskMedia.length ? (
                            <button
                              type="button"
                              onClick={() => setPreviewMedia(taskMedia[0])}
                              className="rounded-full bg-[#f1f8e8] px-3 py-2 text-xs font-semibold text-[#42601c] transition hover:bg-[#dff1c5]"
                            >
                              Preview
                            </button>
                          ) : null}
                        </div>
                      </div>
                      {taskMedia.length ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {taskMedia.map((media) => (
                            <button
                              key={media.id || media.url}
                              type="button"
                              onClick={() => setPreviewMedia(media)}
                              className="max-w-full truncate rounded-full bg-[#f1f8e8] px-3 py-1 text-xs font-semibold text-[#42601c] transition hover:bg-[#dff1c5]"
                            >
                              Preview: {getTaskMediaLabel(media)}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                }) : <EmptyState message={isAdmin ? 'No tasks added to this project yet.' : 'No assigned tasks found for you in this project.'} />}
              </div>
              <div className="mt-5 flex flex-col gap-3 border-t border-slate-200 pt-4 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
                <p>
                  Showing {totalProjectTasks ? (taskPage - 1) * PROJECT_TASKS_PER_PAGE + 1 : 0}
                  {' - '}
                  {Math.min(taskPage * PROJECT_TASKS_PER_PAGE, totalProjectTasks)} of {totalProjectTasks} tasks
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setTaskPage((current) => Math.max(1, current - 1))}
                    disabled={taskPage <= 1}
                    className="rounded-full border border-slate-300 bg-white px-4 py-2 font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
                  >
                    Previous
                  </button>
                  <span className="rounded-full bg-white px-4 py-2 font-semibold text-slate-700">
                    Page {taskPage} / {totalTaskPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setTaskPage((current) => Math.min(totalTaskPages, current + 1))}
                    disabled={taskPage >= totalTaskPages}
                    className="rounded-full border border-slate-300 bg-white px-4 py-2 font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
                  >
                    Next
                  </button>
                </div>
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

      {proofPopupMessage ? (
        <div className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-950/35 px-4">
          <div className="w-full max-w-md rounded-[28px] border border-amber-200 bg-white p-6 text-center shadow-[0_24px_70px_rgba(15,23,42,0.18)]">
            <p className="text-sm font-medium uppercase tracking-[0.28em] text-amber-500">Proof Required</p>
            <h2 className="mt-3 text-2xl font-semibold text-slate-950">Upload first</h2>
            <p className="mt-3 text-sm leading-7 text-slate-600">{proofPopupMessage}</p>
            <button
              type="button"
              onClick={() => setProofPopupMessage('')}
              className="mt-6 inline-flex items-center justify-center rounded-2xl bg-[#8fc740] px-6 py-3 text-sm font-bold text-[#123b76] transition hover:bg-[#7fb337]"
            >
              Close
            </button>
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

      {previewMedia ? (
        <div className="fixed inset-0 z-[230] flex items-center justify-center bg-slate-950/55 px-4 py-6 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={`${getTaskMediaLabel(previewMedia)} preview`}>
          <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-[26px] border border-white/70 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.28)]">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-5">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-slate-950">{getTaskMediaLabel(previewMedia)}</p>
                <p className="text-xs font-medium text-slate-500">{previewMedia.type === 'PHOTO' ? 'Photo preview' : 'Document preview'}</p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewMedia(null)}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                aria-label="Close preview"
              >
                x
              </button>
            </div>
            <div className="min-h-0 flex-1 bg-slate-100 p-3 sm:p-4">
              {previewMedia.type === 'PHOTO' ? (
                <div className="flex max-h-[72vh] min-h-[320px] items-center justify-center overflow-auto rounded-2xl bg-white">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img alt={getTaskMediaLabel(previewMedia)} className="max-h-[72vh] max-w-full object-contain" src={previewMedia.url} />
                </div>
              ) : (
                <div className="h-[72vh] overflow-hidden rounded-2xl border border-slate-200 bg-white">
                  <PdfDocumentPreview className="h-full w-full" url={previewMedia.url} title={getTaskMediaLabel(previewMedia)} />
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
