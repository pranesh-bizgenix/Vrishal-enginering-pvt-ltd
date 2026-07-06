'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getToken, TaskType } from '../lib/api';
import { clearAuth } from '../lib/auth';
import { getWorkspaceNavItems, routeSection } from '../lib/workspace';
import { canManageTeamRecords, getAssignableEmployeesForViewer, isAdminRole } from '../lib/hierarchy';
import { DashboardSidebar, DashboardTopbar } from '../../components/DashboardShell';
import type { DashboardResponse, Employee, NavItem, Project, SectionKey, Task, TaskMedia } from '../dashboard/types';
import { ChevronDownIcon, ChevronUpIcon, DocumentIcon, EyeIcon, PhotoIcon, PlusIcon, TrashIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { dispatchToast } from '../lib/customToast';

type TaskEditorProps = {
  mode: 'create' | 'edit';
  taskId?: string;
};

type TaskItemDraft = {
  id: string;
  title: string;
  description: string;
};

const fieldClassName = 'w-full rounded-2xl border border-emerald-100 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-[#8fc740] focus:ring-2 focus:ring-[#dff1c5]';
const primaryButtonClassName = 'inline-flex items-center justify-center rounded-2xl bg-[#8fc740] px-5 py-3 text-sm font-bold text-[#123b76] shadow-[0_14px_28px_rgba(143,199,64,0.24)] transition hover:bg-[#7fb337] hover:shadow-[0_16px_32px_rgba(143,199,64,0.3)] disabled:cursor-not-allowed disabled:opacity-60';
const secondaryButtonClassName = 'inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-6 py-3 text-sm font-bold text-slate-700 shadow-sm transition hover:border-[#8fc740] hover:bg-[#f6fbef] hover:text-[#123b76]';
const taskFormInitial = {
  projectId: '',
  dueDate: '',
  type: 'SIMPLE' as TaskType,
  status: 'PENDING' as Task['status'],
  assignedEmployeeIds: [] as string[],
};

const taskItemInitial = (): TaskItemDraft => ({
  id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
  title: '',
  description: '',
});

function EmptyState({ message }: { message: string }) {
  return <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">{message}</div>;
}

function formatTaskStatusLabel(status: Task['status']) {
  if (status === 'IN_PROGRESS') {
    return 'Ongoing';
  }

  return status
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/(^|\s)\S/g, (char) => char.toUpperCase());
}

function getTaskMediaType(file: File): TaskMedia['type'] {
  return file.type.startsWith('image/') ? 'PHOTO' : 'DOCUMENT';
}

function isSupportedTaskFile(file: File) {
  const fileName = file.name.toLowerCase();
  const documentExtensions = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.csv', '.txt', '.rtf', '.ppt', '.pptx'];
  return file.type.startsWith('image/') || documentExtensions.some((extension) => fileName.endsWith(extension));
}

function readFileAsTaskMedia(file: File): Promise<TaskMedia> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve({
        id: crypto.randomUUID(),
        type: getTaskMediaType(file),
        url: String(reader.result || ''),
        label: file.name,
        mimeType: file.type,
      });
    };
    reader.onerror = () => reject(reader.error || new Error('Unable to read selected file.'));
    reader.readAsDataURL(file);
  });
}

function getTaskMediaLabel(media: TaskMedia) {
  return media.label || (media.type === 'DOCUMENT' ? 'Document file' : 'Photo file');
}

export function TaskEditor({ mode, taskId }: TaskEditorProps) {
  const router = useRouter();
  const employeesDropdownRef = useRef<HTMLDivElement | null>(null);
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [taskForm, setTaskForm] = useState(taskFormInitial);
  const [taskItems, setTaskItems] = useState<TaskItemDraft[]>([taskItemInitial()]);
  const [taskMediaByItemId, setTaskMediaByItemId] = useState<Record<string, TaskMedia[]>>({});
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [employeesOpen, setEmployeesOpen] = useState(false);
  const [error, setError] = useState('');
  const [previewMedia, setPreviewMedia] = useState<TaskMedia | null>(null);

  const loadData = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const requests: Array<Promise<unknown>> = [
        api<DashboardResponse>('/dashboard'),
        api<Employee[]>('/employees'),
        api<Project[]>('/projects'),
      ];
      if (mode === 'edit' && taskId) {
        requests.push(api<Task>(`/tasks/${taskId}`));
      }

      const [dashboardData, employeeData, projectData, taskData] = await Promise.all(requests) as [DashboardResponse, Employee[], Project[], Task | undefined];
      setDashboard(dashboardData);
      setEmployees(employeeData);
      setProjects(projectData);

      if (mode === 'edit' && taskData) {
        setTaskForm({
          projectId: taskData.projectId,
          dueDate: taskData.dueDate ? taskData.dueDate.slice(0, 16) : '',
          type: taskData.type,
          status: taskData.status,
          assignedEmployeeIds: taskData.assignedEmployeeIds.filter((employeeId) => employeeData.some((employee) => employee.id === employeeId)),
        });
        setTaskItems([
          {
            id: taskData.id,
            title: taskData.title,
            description: taskData.description,
          },
        ]);
        setTaskMediaByItemId({ [taskData.id]: taskData.media || [] });
      } else {
        const initialTaskItem = taskItemInitial();
        const initialAssignedEmployeeIds =
          canManageTeamRecords(dashboardData.employee.roles)
            ? []
            : [dashboardData.employee.id];
        setTaskForm((current) => ({
          ...current,
          projectId: current.projectId || projectData[0]?.id || '',
          assignedEmployeeIds: current.assignedEmployeeIds.length ? current.assignedEmployeeIds : initialAssignedEmployeeIds,
        }));
        setTaskItems([initialTaskItem]);
        setTaskMediaByItemId({ [initialTaskItem.id]: [] });
      }
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Unable to load task form.';
      setError(message);
      if (message.toLowerCase().includes('unauthorized')) {
        clearAuth();
        router.replace('/auth/login');
      }
    } finally {
      setBusy(false);
    }
  }, [mode, router, taskId]);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/auth/login');
      return;
    }
    void loadData();
  }, [loadData, router]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!employeesDropdownRef.current?.contains(event.target as Node)) {
        setEmployeesOpen(false);
      }
    }
    if (!employeesOpen) {
      return;
    }
    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [employeesOpen]);

  useEffect(() => {
    if (!previewMedia) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setPreviewMedia(null);
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [previewMedia]);

  const me = dashboard?.employee;
  const isAdmin = isAdminRole(me?.roles ?? []);
  const canManage = canManageTeamRecords(me?.roles ?? []);
  const canEditCurrentTask = canManage || Boolean(me && taskForm.assignedEmployeeIds.includes(me.id));
  const canUseTaskEditor = mode === 'create' ? Boolean(me) : canEditCurrentTask;
  const navItems = useMemo<NavItem[]>(() => getWorkspaceNavItems(canManage, isAdmin, me?.roles ?? []), [canManage, isAdmin, me?.roles]);
  const initials = me?.name?.trim()?.charAt(0)?.toUpperCase() || 'A';
  const selectableEmployees = useMemo(
    () => getAssignableEmployeesForViewer(employees, me, taskForm.assignedEmployeeIds),
    [employees, me, taskForm.assignedEmployeeIds],
  );
  const selectedEmployeesLabel = taskForm.assignedEmployeeIds.length
    ? employees
        .filter((employee) => taskForm.assignedEmployeeIds.includes(employee.id))
        .map((employee) => employee.name)
        .join(', ')
    : 'Select employees';

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

  function toggleSelection(list: string[], id: string) {
    return list.includes(id) ? list.filter((item) => item !== id) : [...list, id];
  }

  function updateTaskItem(itemId: string, field: 'title' | 'description', value: string) {
    setTaskItems((current) => current.map((item) => (item.id === itemId ? { ...item, [field]: value } : item)));
  }

  function addTaskItem() {
    const nextTaskItem = taskItemInitial();
    setTaskItems((current) => [...current, nextTaskItem]);
    setTaskMediaByItemId((current) => ({ ...current, [nextTaskItem.id]: [] }));
  }

  function canRemoveTaskItem(itemId: string) {
    if (taskItems.length === 1) {
      return false;
    }

    const existingTaskRowLocked = mode === 'edit' && taskItems[0]?.id === itemId && !isAdmin;
    return !existingTaskRowLocked;
  }

  function removeTaskItem(itemId: string) {
    if (!canRemoveTaskItem(itemId)) {
      return;
    }
    setTaskItems((current) => (current.length > 1 ? current.filter((item) => item.id !== itemId) : current));
    setTaskMediaByItemId((current) => {
      const next = { ...current };
      delete next[itemId];
      return next;
    });
  }

  async function handleTaskFilesChange(itemId: string, files: FileList | null) {
    const allFiles = Array.from(files || []);
    const selectedFiles = allFiles.filter(isSupportedTaskFile);

    if (allFiles.length && selectedFiles.length !== allFiles.length) {
      dispatchToast('warning', 'Only document and photo files are allowed.');
    }

    if (!selectedFiles.length) {
      return;
    }

    const media = await Promise.all(selectedFiles.map(readFileAsTaskMedia));
    setTaskMediaByItemId((current) => ({
      ...current,
      [itemId]: [...(current[itemId] || []), ...media],
    }));
  }

  function removeTaskMedia(itemId: string, mediaId: string) {
    setTaskMediaByItemId((current) => ({
      ...current,
      [itemId]: (current[itemId] || []).filter((media) => (media.id || media.url) !== mediaId),
    }));
  }


  async function submitTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const validTaskItems = taskItems.filter((item) => item.title.trim());
      if (!validTaskItems.length) {
        dispatchToast('warning', 'Add at least one task title before saving.');
        throw new Error('Add at least one task title before saving.');
      }

      if (mode === 'edit' && taskId) {
        const editItem = validTaskItems[0];
        const payload = {
          title: editItem?.title || '',
          description: editItem?.description || '',
          projectId: taskForm.projectId,
          dueDate: taskForm.dueDate || null,
          type: taskForm.type,
          status: taskForm.status,
          assignedEmployeeIds: taskForm.assignedEmployeeIds,
          media: taskMediaByItemId[editItem.id] || [],
        };
        await api(`/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify(payload) });

        const extraTaskItems = validTaskItems.slice(1);
        if (extraTaskItems.length) {
          await Promise.all(
            extraTaskItems.map((item) =>
              api('/tasks', {
                method: 'POST',
                body: JSON.stringify({
                  title: item.title,
                  description: item.description,
                  projectId: taskForm.projectId,
                  dueDate: taskForm.dueDate || null,
                  type: taskForm.type,
                  status: taskForm.status,
                  assignedEmployeeIds: taskForm.assignedEmployeeIds,
                  media: taskMediaByItemId[item.id] || [],
                }),
              }),
            ),
          );
        }
      } else {
        await Promise.all(
          validTaskItems.map((item) =>
            api('/tasks', {
              method: 'POST',
              body: JSON.stringify({
                title: item.title,
                description: item.description,
                projectId: taskForm.projectId,
                dueDate: taskForm.dueDate || null,
                type: taskForm.type,
                status: taskForm.status,
                assignedEmployeeIds: taskForm.assignedEmployeeIds,
                media: taskMediaByItemId[item.id] || [],
              }),
            }),
          ),
        );
      }
      router.push('/tasks');
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'Unable to save task.');
    } finally {
      setSaving(false);
    }
  }

  if (!dashboard) {
    return <main className="flex min-h-screen items-center justify-center bg-[#edf2f7] px-6 py-10"><div className="rounded-3xl border border-slate-200 bg-white px-6 py-5 text-sm text-slate-500 shadow-sm">{busy ? 'Loading task form...' : error || 'Preparing task page...'}</div></main>;
  }

  if (!canUseTaskEditor) {
    return <main className="flex min-h-screen items-center justify-center bg-[#edf2f7] px-6 py-10"><EmptyState message={mode === 'create' ? 'Please log in to create tasks.' : 'You can edit only tasks assigned to you.'} /></main>;
  }

  return (
    <main className="min-h-screen bg-[#f4f9ec] text-slate-900 lg:flex">
      <DashboardSidebar activeSection="tasks" navItems={navItems} onClose={() => setSidebarOpen(false)} onSelect={handleSection} open={sidebarOpen} />
      <div className="flex min-w-0 flex-1 flex-col">
        <DashboardTopbar canRunReport={isAdmin} initials={initials} userEmail={me?.email ?? ''} userName={me?.name ?? 'Admin'} onLogout={handleLogout} onMenuOpen={() => setSidebarOpen(true)} onRunReport={handleRunReport} subtitle="Task Management System" title={mode === 'edit' ? 'Edit Task' : 'Create Task'} />
        <section className="px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
          {error ? <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
          <section className="rounded-[28px] border border-[#d8ecbb] bg-white p-5 shadow-[0_22px_55px_rgba(72,116,28,0.09)] sm:p-6 lg:p-7">
            <form className="space-y-4" onSubmit={submitTask}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-bold uppercase tracking-[0.28em] text-[#6f9e2c]">Task Module</p>
                  <h1 className="mt-2 text-xl font-semibold text-slate-950 sm:text-2xl">{mode === 'edit' ? 'Update Task' : 'Create Task'}</h1>
                  <p className="mt-1 text-sm text-slate-500">Assign a task, manage owners, track status, and keep note history.</p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button className={secondaryButtonClassName} onClick={() => router.push('/tasks')} type="button">Cancel</button>
                  <button className={primaryButtonClassName} disabled={saving} type="submit">{saving ? 'Saving...' : mode === 'edit' ? 'Update Task' : 'Create Task'}</button>
                </div>
              </div>

              <div className="grid gap-5 md:grid-cols-3">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-slate-700">Project</label>
                  <select
                    className="h-11 w-full rounded-xl border border-emerald-100 bg-white px-4 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#8fc740] focus:ring-2 focus:ring-[#dff1c5]"
                    onChange={(event) => setTaskForm({ ...taskForm, projectId: event.target.value })}
                    value={taskForm.projectId}
                  >
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                </div>


                <div className="space-y-2">
                  <label className="block text-sm font-medium text-slate-700">Task Due Date</label>
                  <input
                    className="h-11 w-full rounded-xl border border-emerald-100 bg-white px-4 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#8fc740] focus:ring-2 focus:ring-[#dff1c5]"
                    onChange={(event) => setTaskForm({ ...taskForm, dueDate: event.target.value })}
                    type="datetime-local"
                    value={taskForm.dueDate}
                  />
                </div>
              </div>

              <div className="rounded-[26px] border border-[#d8ecbb] bg-[#f8fcf1] p-4 sm:p-5">
                <p className="text-sm font-medium text-slate-700">Assign Employees</p>
                <div className="relative mt-4" ref={employeesDropdownRef}>
                  <button
                    type="button"
                    onClick={() => setEmployeesOpen((current) => !current)}
                    className="flex w-full items-center justify-between rounded-2xl border border-[#d8ecbb] bg-white px-4 py-3 text-left text-sm text-slate-900 shadow-sm transition hover:border-[#8fc740] hover:bg-[#fbfef7]"
                  >
                    <span className="truncate pr-3 text-slate-700">{selectedEmployeesLabel}</span>
                    {employeesOpen ? <ChevronUpIcon className="h-5 w-5 text-slate-500" /> : <ChevronDownIcon className="h-5 w-5 text-slate-500" />}
                  </button>

                  {employeesOpen ? (
                    <div className="absolute left-0 right-0 z-20 mt-2 max-h-72 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-3 shadow-lg">
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {selectableEmployees.map((employee) => (
                          <label key={employee.id} className="flex items-center gap-3 rounded-2xl border border-[#d8ecbb] bg-[#f8fcf1] px-3 py-3 text-sm text-slate-700 transition hover:border-[#8fc740] hover:bg-white">
                            <input
                              checked={taskForm.assignedEmployeeIds.includes(employee.id)}
                              onChange={() =>
                                setTaskForm({
                                  ...taskForm,
                                  assignedEmployeeIds: toggleSelection(taskForm.assignedEmployeeIds, employee.id),
                                })
                              }
                              type="checkbox"
                            />
                            <span>{employee.name}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="rounded-[26px] border border-[#d8ecbb] bg-[#f8fcf1] p-4 sm:p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-lg font-semibold text-slate-900">Project Tasks</p>
                    <p className="text-sm text-slate-500">{mode === 'edit' ? 'Update the existing task details below.' : 'Start with Task 1, then click add button for Task 2, Task 3, and more.'}</p>
                  </div>
                  <button type="button" onClick={addTaskItem} className="inline-flex shrink-0 items-center gap-2 rounded-full border border-[#8fc740] bg-white px-5 py-3 text-sm font-bold text-[#123b76] shadow-sm transition hover:bg-[#f6fbef]">
                    <PlusIcon className="h-4 w-4" />
                    Add Task
                  </button>
                </div>
                <div className="mt-5 space-y-4">
                  {taskItems.map((item, index) => (
                    <div key={item.id} className="space-y-3 rounded-[24px] border border-[#d8ecbb] bg-white p-4 shadow-[0_10px_26px_rgba(72,116,28,0.05)]">
                      <p className="text-sm font-semibold text-slate-800">{mode === 'edit' && index === 0 ? 'Task Details' : `Task ${index + 1}`}</p>
                      <input className={fieldClassName} value={item.title} onChange={(event) => updateTaskItem(item.id, 'title', event.target.value)} placeholder={mode === 'edit' && index === 0 ? 'Enter task title' : `Enter task ${index + 1} title`} />
                      <input className={fieldClassName} value={item.description} onChange={(event) => updateTaskItem(item.id, 'description', event.target.value)} placeholder={mode === 'edit' && index === 0 ? 'Enter task description' : `Enter task ${index + 1} description`} />
                      <div className="grid gap-3 lg:grid-cols-[minmax(140px,0.6fr)_minmax(220px,1.2fr)_auto] lg:items-center">
                        <select
                          className="h-[50px] rounded-2xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none transition focus:border-[#8fc740] focus:ring-2 focus:ring-[#dff1c5]"
                          value={mode === 'edit' && index === 0 ? taskForm.status : 'PENDING'}
                          disabled={mode === 'edit' && index > 0}
                          onChange={(event) => {
                            if (mode === 'edit' && index > 0) {
                              return;
                            }
                            setTaskForm({
                              ...taskForm,
                              status: event.target.value as Task['status'],
                            });
                          }}
                        >
                          {(['PENDING', 'IN_PROGRESS', 'COMPLETED'] as Task['status'][]).map((status) => (
                            <option key={status} value={status}>{formatTaskStatusLabel(status)}</option>
                          ))}
                        </select>
                        <input
                          className="block h-[50px] w-full min-w-0 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition file:mr-3 file:h-8 file:rounded-xl file:border-0 file:bg-[#8fc740] file:px-3 file:text-sm file:font-semibold file:text-[#123b76] hover:file:bg-[#7fb337] focus:border-[#8fc740] focus:ring-2 focus:ring-[#dff1c5]"
                          type="file"
                          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.rtf,.ppt,.pptx"
                          multiple
                          onChange={(event) => {
                            void handleTaskFilesChange(item.id, event.target.files);
                            event.currentTarget.value = '';
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => removeTaskItem(item.id)}
                          disabled={!canRemoveTaskItem(item.id)}
                          className={[
                            'inline-flex h-[50px] items-center justify-center gap-2 rounded-2xl border px-4 text-sm font-medium transition',
                            !canRemoveTaskItem(item.id) ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400' : 'border-[#d8ecbb] bg-white text-slate-700 hover:border-[#8fc740] hover:bg-[#f6fbef] hover:text-[#123b76]',
                          ].join(' ')}
                        >
                          <XMarkIcon className="h-4 w-4" />
                          Remove
                        </button>
                      </div>
                      {(taskMediaByItemId[item.id] || []).length ? (
                          <div className="space-y-2 rounded-2xl border border-[#d8ecbb] bg-[#fbfef7] p-3">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-sm font-semibold text-slate-800">Task attachments</p>
                              <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#42601c]">
                                {(taskMediaByItemId[item.id] || []).length} file{(taskMediaByItemId[item.id] || []).length === 1 ? '' : 's'}
                              </span>
                            </div>
                            {(taskMediaByItemId[item.id] || []).map((media) => (
                              <div key={media.id || media.url} className="flex flex-col gap-3 rounded-2xl border border-[#d8ecbb] bg-white px-3 py-3 text-sm text-[#42601c] sm:flex-row sm:items-center">
                                <div className="flex min-w-0 flex-1 items-center gap-3">
                                  {media.type === 'PHOTO' ? (
                                    media.url ? (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover ring-1 ring-[#d8ecbb]" src={media.url} />
                                    ) : (
                                      <PhotoIcon className="h-6 w-6 shrink-0 text-[#6f9e2c]" />
                                    )
                                  ) : (
                                    <DocumentIcon className="h-6 w-6 shrink-0 text-[#6f9e2c]" />
                                  )}
                                  <span className="min-w-0 flex-1 truncate font-medium">
                                    {getTaskMediaLabel(media)}
                                  </span>
                                </div>
                                <div className="flex gap-2 sm:justify-end">
                                  <button
                                    type="button"
                                    onClick={() => setPreviewMedia(media)}
                                    className="inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-[#8fc740] px-4 text-xs font-bold uppercase tracking-[0.12em] text-[#123b76] transition hover:bg-[#7fb337]"
                                  >
                                    <EyeIcon className="h-4 w-4" />
                                    Preview
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => removeTaskMedia(item.id, media.id || media.url)}
                                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-red-100 bg-red-50 text-red-600 transition hover:border-red-200 hover:bg-red-100"
                                    aria-label={`Remove ${getTaskMediaLabel(media)}`}
                                  >
                                    <TrashIcon className="h-4 w-4" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : null}
                    </div>
                  ))}
                </div>
              </div>
            </form>

          </section>
        </section>
      </div>
      {previewMedia ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 py-6 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={`${getTaskMediaLabel(previewMedia)} preview`}>
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
                <XMarkIcon className="h-5 w-5" />
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
                  <iframe className="h-full w-full" src={previewMedia.url} title={getTaskMediaLabel(previewMedia)} />
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
