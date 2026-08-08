'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getToken, TaskType } from '../lib/api';
import { clearAuth } from '../lib/auth';
import { getWorkspaceNavItems, routeSection } from '../lib/workspace';
import { canManageTeamRecords, canRunReports, getTaskAssignableEmployees, isAdminRole } from '../lib/hierarchy';
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
  dueDate: string;
  requireProof: boolean;
  qualityRating: Task['qualityRating'] | '';
  ncItems: string[];
};

const fieldClassName = 'w-full rounded-2xl border border-emerald-100 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-[#8fc740] focus:ring-2 focus:ring-[#dff1c5] disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400';
const primaryButtonClassName = 'inline-flex items-center justify-center rounded-2xl bg-[#8fc740] px-5 py-3 text-sm font-bold text-[#123b76] shadow-[0_14px_28px_rgba(143,199,64,0.24)] transition hover:bg-[#7fb337] hover:shadow-[0_16px_32px_rgba(143,199,64,0.3)] disabled:cursor-not-allowed disabled:opacity-60';
const secondaryButtonClassName = 'inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-6 py-3 text-sm font-bold text-slate-700 shadow-sm transition hover:border-[#8fc740] hover:bg-[#f6fbef] hover:text-[#123b76]';
const taskFormInitial = {
  projectId: '',
  dueDate: '',
  type: 'SIMPLE' as TaskType,
  status: 'PENDING' as Task['status'],
  requireProof: false,
  assignedEmployeeIds: [] as string[],
};

const taskItemInitial = (): TaskItemDraft => ({
  id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
  title: '',
  description: '',
  dueDate: '',
  requireProof: false,
  qualityRating: '',
  ncItems: [],
});

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

function formatNoteDate(value: string) {
  return new Date(value).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  });
}

function formatKolkataDateTimeInput(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const getPart = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || '';

  return `${getPart('year')}-${getPart('month')}-${getPart('day')}T${getPart('hour')}:${getPart('minute')}`;
}

const TASK_DESCRIPTION_NOTE_PREFIX = 'TASK_DESCRIPTION -';

function isTaskDescriptionNote(message: string) {
  return message.trim().startsWith(TASK_DESCRIPTION_NOTE_PREFIX);
}

function getTaskDescriptionNoteText(message: string) {
  return isTaskDescriptionNote(message)
    ? message.trim().slice(TASK_DESCRIPTION_NOTE_PREFIX.length).trim()
    : message;
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
  const [currentTask, setCurrentTask] = useState<Task | null>(null);
  const [noteMessage, setNoteMessage] = useState('');
  const [sendingNote, setSendingNote] = useState(false);
  const [permissionPopupOpen, setPermissionPopupOpen] = useState(false);
  const accessToastShownRef = useRef(false);

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
        const formattedTaskDueDate = taskData.dueDate ? formatKolkataDateTimeInput(taskData.dueDate) : '';
        setCurrentTask(taskData);
        setTaskForm({
          projectId: taskData.projectId,
          dueDate: formattedTaskDueDate,
          type: taskData.type,
          status: taskData.status,
          requireProof: Boolean(taskData.requireProof),
          assignedEmployeeIds: taskData.assignedEmployeeIds.filter((employeeId) => employeeData.some((employee) => employee.id === employeeId)),
        });
        setTaskItems([
          {
            id: taskData.id,
            title: taskData.title,
            description: taskData.description,
            dueDate: formattedTaskDueDate,
            requireProof: Boolean(taskData.requireProof),
            qualityRating: taskData.qualityRating || '',
            ncItems: taskData.ncItems?.length ? taskData.ncItems : [],
          },
        ]);
        setTaskMediaByItemId({ [taskData.id]: taskData.media || [] });
      } else {
        setCurrentTask(null);
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
  const isSuperAdmin = Boolean(me?.roles.includes('SA1') || me?.roles.includes('SA2'));
  const canDeleteRecords = Boolean(me?.roles.includes('SA1'));
  const canManage = canManageTeamRecords(me?.roles ?? []);
  const isAssignedToMe = Boolean(me && taskForm.assignedEmployeeIds.includes(me.id));
  const isAssignedByMe = Boolean(me && currentTask?.createdByEmployeeId === me.id);
  const canEditCurrentTask =
    isSuperAdmin ||
    isAssignedToMe ||
    isAssignedByMe;
  const canUseTaskEditor = mode === 'create' ? Boolean(me) : canEditCurrentTask;
  const canEditTaskDetails =
    mode === 'create' ||
    Boolean(
      me &&
        (isSuperAdmin ||
          currentTask?.createdByEmployeeId === me.id ||
          (!currentTask?.createdByEmployeeId && canManage)),
    );
  const canChangeTaskStatus =
    canEditTaskDetails ||
    (mode === 'edit' && isAssignedToMe && currentTask?.status !== 'COMPLETED');
  const navItems = useMemo<NavItem[]>(() => getWorkspaceNavItems(canManage, isAdmin, me?.roles ?? []), [canManage, isAdmin, me?.roles]);
  const initials = me?.name?.trim()?.charAt(0)?.toUpperCase() || 'A';
  const selectableEmployees = useMemo(
    () => getTaskAssignableEmployees(employees, me, taskForm.assignedEmployeeIds),
    [employees, me, taskForm.assignedEmployeeIds],
  );
  const selectedEmployeesLabel = taskForm.assignedEmployeeIds.length
    ? employees
        .filter((employee) => taskForm.assignedEmployeeIds.includes(employee.id))
        .map((employee) => employee.name)
        .join(', ')
    : 'Select employees';
  const assignedByName =
    employees.find((employee) => employee.id === currentTask?.createdByEmployeeId)?.name ||
    currentTask?.notes.find((note) => note.message.toLowerCase().includes('created this task'))?.createdByName ||
    'Not available';
  const taskDescriptionNotes = useMemo(
    () => (currentTask?.notes || []).filter((note) => isTaskDescriptionNote(note.message)),
    [currentTask?.notes],
  );
  const taskSubmittedDone = Boolean(currentTask?.notes.some((note) => note.markDone));
  const canEditCompletedTaskDetails = Boolean(me?.roles.includes('SA1'));
  const completedTaskLocked = mode === 'edit' && currentTask?.status === 'COMPLETED' && !canEditCompletedTaskDetails;
  const taskDetailsLocked = mode === 'edit' && (!canEditTaskDetails || completedTaskLocked);
  const canAddTaskDescriptionDiscussion = mode === 'edit' && Boolean(currentTask) && (isSuperAdmin || isAssignedToMe || isAssignedByMe);
  const assignedProofRequired = mode === 'edit' && Boolean(currentTask?.requireProof) && (isAssignedToMe || taskDetailsLocked);
  const isAssignedSubmitOnly =
    mode === 'edit' &&
    isAssignedToMe &&
    !canEditTaskDetails &&
    currentTask?.status !== 'COMPLETED' &&
    !taskSubmittedDone;
  const shouldShowPermissionPopup = permissionPopupOpen;

  useEffect(() => {
    if (!dashboard || canUseTaskEditor || accessToastShownRef.current) {
      return;
    }

    accessToastShownRef.current = true;
    setPermissionPopupOpen(true);
    dispatchToast('warning', mode === 'create' ? 'Please log in to create tasks.' : 'You can edit only tasks assigned to you.');
  }, [canUseTaskEditor, dashboard, mode]);

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

  function showPermissionPopupForLockedTask() {
    if (!taskDetailsLocked) {
      return false;
    }

    setEmployeesOpen(false);
    setPermissionPopupOpen(true);
    return true;
  }

  function toggleSelection(list: string[], id: string) {
    return list.includes(id) ? list.filter((item) => item !== id) : [...list, id];
  }

  function updateTaskItem(itemId: string, field: 'title' | 'description' | 'dueDate' | 'qualityRating', value: string) {
    setTaskItems((current) => current.map((item) => (item.id === itemId ? { ...item, [field]: value } : item)));
  }

  function updateDefaultDueDate(value: string) {
    setTaskForm((current) => ({ ...current, dueDate: value }));

    if (mode === 'edit') {
      setTaskItems((current) => current.map((item, index) => (index === 0 ? { ...item, dueDate: value } : item)));
    }
  }

  function updateTaskItemProofRequired(itemId: string, requireProof: boolean) {
    setTaskItems((current) => current.map((item) => (item.id === itemId ? { ...item, requireProof } : item)));
  }

  function addNcItem(itemId: string) {
    setTaskItems((current) => current.map((item) => (item.id === itemId ? { ...item, ncItems: [...item.ncItems, ''] } : item)));
  }

  function formatDateTime(value: string | null) {
  return value ? new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'Not set';
}

  function updateNcItem(itemId: string, ncIndex: number, value: string) {
    setTaskItems((current) =>
      current.map((item) =>
        item.id === itemId
          ? { ...item, ncItems: item.ncItems.map((nc, index) => (index === ncIndex ? value : nc)) }
          : item,
      ),
    );
  }

  function removeNcItem(itemId: string, ncIndex: number) {
    setTaskItems((current) =>
      current.map((item) =>
        item.id === itemId
          ? { ...item, ncItems: item.ncItems.filter((_, index) => index !== ncIndex) }
          : item,
      ),
    );
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

    const existingTaskRowLocked = mode === 'edit' && taskItems[0]?.id === itemId && !canEditTaskDetails;
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

    const media = (await Promise.all(selectedFiles.map(readFileAsTaskMedia))).map((item) => ({
      ...item,
      createdById: me?.id || null,
    }));
    const nextMedia = [...(taskMediaByItemId[itemId] || []), ...media];
    setTaskMediaByItemId((current) => ({
      ...current,
      [itemId]: nextMedia,
    }));

    if (taskDetailsLocked && assignedProofRequired && taskId) {
      try {
        const updatedTask = await api<Task>(`/tasks/${taskId}`, {
          method: 'PATCH',
          body: JSON.stringify({ media: nextMedia }),
        });
        setCurrentTask(updatedTask);
        setTaskMediaByItemId({ [updatedTask.id]: updatedTask.media || [] });
      } catch (uploadError) {
        setError(uploadError instanceof Error ? uploadError.message : 'Unable to upload proof file/photo.');
      }
    }
  }

  function removeTaskMedia(itemId: string, mediaId: string) {
    setTaskMediaByItemId((current) => ({
      ...current,
      [itemId]: (current[itemId] || []).filter((media) => (media.id || media.url) !== mediaId),
    }));
  }

  function canRemoveTaskMedia(_media: TaskMedia) {
    return canDeleteRecords;
  }

  async function submitTaskNote() {
    const message = noteMessage.trim();
    if (!taskId || !message || !canAddTaskDescriptionDiscussion) {
      return;
    }

    setSendingNote(true);
    setError('');
    try {
      const updatedTask = await api<Task>(`/tasks/${taskId}/notes`, {
        method: 'POST',
        body: JSON.stringify({ message: `${TASK_DESCRIPTION_NOTE_PREFIX} ${message}` }),
      });
      setCurrentTask(updatedTask);
      setNoteMessage('');
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'Unable to add description.');
    } finally {
      setSendingNote(false);
    }
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
      if (!isAssignedSubmitOnly) {
        if (!taskForm.assignedEmployeeIds.length) {
          dispatchToast('warning', 'Assign at least one employee before saving.');
          throw new Error('Assign at least one employee before saving.');
        }
        const missingDueDate = validTaskItems.some((item) => !(item.dueDate || taskForm.dueDate));
        if (missingDueDate) {
          dispatchToast('warning', 'Due date is required for every task.');
          throw new Error('Due date is required for every task.');
        }
      }

      if (mode === 'edit' && taskId) {
        const editItem = validTaskItems[0];
        if (isAssignedSubmitOnly) {
          const proofMedia = taskMediaByItemId[editItem.id] || [];
          if (assignedProofRequired && !proofMedia.length) {
            dispatchToast('warning', 'Upload at least one proof file or photo before submitting.');
            throw new Error('Upload at least one proof file or photo before submitting.');
          }

          if (proofMedia.length) {
            await api(`/tasks/${taskId}`, {
              method: 'PATCH',
              body: JSON.stringify({ media: proofMedia }),
            });
          }
          await api(`/tasks/${taskId}/notes`, {
            method: 'POST',
            body: JSON.stringify({
              message: assignedProofRequired
                ? `${me?.name || 'Assigned user'} submitted work for approval with proof attachment.`
                : `${me?.name || 'Assigned user'} submitted work for approval.`,
              markDone: true,
            }),
          });
          router.push('/tasks');
          return;
        }
        if (taskDetailsLocked && canChangeTaskStatus) {
          if (isAssignedToMe && !canEditTaskDetails && taskForm.status === 'COMPLETED') {
            const proofMedia = taskMediaByItemId[editItem.id] || [];
            if (assignedProofRequired && !proofMedia.length) {
              dispatchToast('warning', 'Upload at least one proof file or photo before submitting.');
              throw new Error('Upload at least one proof file or photo before submitting.');
            }
            if (proofMedia.length) {
              await api(`/tasks/${taskId}`, {
                method: 'PATCH',
                body: JSON.stringify({ media: proofMedia }),
              });
            }
            await api(`/tasks/${taskId}/notes`, {
              method: 'POST',
              body: JSON.stringify({
                message: assignedProofRequired
                  ? `${me?.name || 'Assigned user'} submitted work for approval with proof attachment.`
                  : `${me?.name || 'Assigned user'} submitted work for approval.`,
                markDone: true,
              }),
            });
            router.push('/tasks');
            return;
          }
          await api(`/tasks/${taskId}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: taskForm.status }),
          });
          router.push('/tasks');
          return;
        }
        const payload = {
          title: editItem?.title || '',
          description: editItem?.description || '',
          projectId: taskForm.projectId,
          dueDate: editItem?.dueDate || taskForm.dueDate || null,
          type: taskForm.type,
          status: taskForm.status,
          assignedEmployeeIds: taskForm.assignedEmployeeIds,
          media: taskMediaByItemId[editItem.id] || [],
          requireProof: editItem.requireProof,
          qualityRating: editItem?.qualityRating || null,
          ncItems: editItem?.ncItems.filter((item) => item.trim()) || [],
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
                  dueDate: item.dueDate || taskForm.dueDate || null,
                  type: taskForm.type,
                  status: taskForm.status,
                  assignedEmployeeIds: taskForm.assignedEmployeeIds,
                  media: taskMediaByItemId[item.id] || [],
                  requireProof: item.requireProof,
                  qualityRating: item.qualityRating || null,
                  ncItems: item.ncItems.filter((nc) => nc.trim()),
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
                dueDate: item.dueDate || taskForm.dueDate || null,
                type: taskForm.type,
                status: taskForm.status,
                assignedEmployeeIds: taskForm.assignedEmployeeIds,
                media: taskMediaByItemId[item.id] || [],
                requireProof: item.requireProof,
                qualityRating: item.qualityRating || null,
                ncItems: item.ncItems.filter((nc) => nc.trim()),
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

  return (
    <main className="min-h-screen bg-[#f4f9ec] text-slate-900 lg:flex">
      {shouldShowPermissionPopup ? (
        <>
          <div className="fixed inset-0 z-[9998] bg-slate-950/20" />
          <div className="fixed left-1/2 top-1/2 z-[9999] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-amber-200 bg-white px-5 py-5 text-center shadow-[0_18px_45px_rgba(15,23,42,0.18)]">
            <p className="text-base font-bold text-amber-800">No permission</p>
            <p className="mt-2 text-sm text-slate-600">You do not have permission to edit this task.</p>
            <button
              type="button"
              onClick={() => setPermissionPopupOpen(false)}
              className="mt-4 inline-flex h-10 items-center justify-center rounded-xl bg-[#8fc740] px-5 text-sm font-bold text-[#123b76] shadow-sm transition hover:bg-[#7fb337]"
            >
              Close
            </button>
          </div>
        </>
      ) : null}
      <DashboardSidebar activeSection="tasks" navItems={navItems} onClose={() => setSidebarOpen(false)} onSelect={handleSection} open={sidebarOpen} />
      <div className="flex min-w-0 flex-1 flex-col">
        <DashboardTopbar canRunReport={canRunReports(me?.roles ?? [])} initials={initials} userEmail={me?.email ?? ''} userName={me?.name ?? 'Admin'} onLogout={handleLogout} onMenuOpen={() => setSidebarOpen(true)} onRunReport={handleRunReport} subtitle="Task Management System" title={mode === 'edit' ? 'Edit Task' : 'Create Task'} />
        <section className="px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
          {error ? <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
          <section className="rounded-[28px] border border-[#d8ecbb] bg-white p-5 shadow-[0_22px_55px_rgba(72,116,28,0.09)] sm:p-6 lg:p-7">
            <form className="space-y-4" onSubmit={submitTask}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-bold uppercase tracking-[0.28em] text-[#6f9e2c]">Task Module</p>
                  <h1 className="mt-2 text-xl font-semibold text-slate-950 sm:text-2xl">{mode === 'edit' ? 'Update Task' : 'Create Task'}</h1>
                  <p className="mt-1 text-sm text-slate-500">{isAssignedSubmitOnly ? 'Review the assigned task, upload proof, then submit done for approval.' : 'Assign a task, manage owners, track status, and keep note history.'}</p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button className={secondaryButtonClassName} onClick={() => router.push('/tasks')} type="button">Cancel</button>
                  <button className={primaryButtonClassName} disabled={saving || (taskDetailsLocked && !isAssignedSubmitOnly && !canChangeTaskStatus)} type="submit">{saving ? 'Saving...' : isAssignedSubmitOnly ? 'Submit Done' : mode === 'edit' ? 'Update Task' : 'Create Task'}</button>
                </div>
              </div>

              <div className="grid gap-5 md:grid-cols-3">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-slate-700">Project</label>
                  <select
                    className="h-11 w-full rounded-xl border border-emerald-100 bg-white px-4 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#8fc740] focus:ring-2 focus:ring-[#dff1c5] disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                    onChange={(event) => setTaskForm({ ...taskForm, projectId: event.target.value })}
                    disabled={taskDetailsLocked}
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
                  <label className="block text-sm font-medium text-slate-700">Default Due Date <span className="text-red-500">*</span></label>
                  <input
                    className="h-11 w-full rounded-xl border border-emerald-100 bg-white px-4 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#8fc740] focus:ring-2 focus:ring-[#dff1c5] disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                    onChange={(event) => updateDefaultDueDate(event.target.value)}
                    disabled={taskDetailsLocked}
                    type="datetime-local"
                    value={taskForm.dueDate}
                  />
                  <p className="mt-1 text-xs text-slate-500">Used only when a task row does not have its own due date.</p>
                </div>
              </div>

              {!isAssignedSubmitOnly ? <div className="rounded-[26px] border border-[#d8ecbb] bg-[#f8fcf1] p-4 sm:p-5">
                <p className="text-sm font-medium text-slate-700">Assign Employees <span className="text-red-500">*</span></p>
                <div className="relative mt-4" ref={employeesDropdownRef}>
                  <button
                    type="button"
                    onClick={() => {
                      if (showPermissionPopupForLockedTask()) {
                        return;
                      }
                      setEmployeesOpen((current) => !current);
                    }}
                    className={[
                      'flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm shadow-sm transition',
                      taskDetailsLocked
                        ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                        : 'border-[#d8ecbb] bg-white text-slate-900 hover:border-[#8fc740] hover:bg-[#fbfef7]',
                    ].join(' ')}
                  >
                    <span className={['truncate pr-3', taskDetailsLocked ? 'text-slate-400' : 'text-slate-700'].join(' ')}>{selectedEmployeesLabel}</span>
                    {employeesOpen ? <ChevronUpIcon className="h-5 w-5 text-slate-500" /> : <ChevronDownIcon className="h-5 w-5 text-slate-500" />}
                  </button>

                  {employeesOpen && !taskDetailsLocked ? (
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
              </div> : (
                <div className="rounded-[26px] border border-[#d8ecbb] bg-[#f8fcf1] p-4 sm:p-5">
                  <p className="text-sm font-medium text-slate-700">Assigned Employees</p>
                  <p className="mt-2 rounded-2xl border border-[#d8ecbb] bg-white px-4 py-3 text-sm text-slate-700">{selectedEmployeesLabel}</p>
                </div>
              )}

              {mode === 'edit' ? (
                <div className="grid gap-3 rounded-[26px] border border-[#d8ecbb] bg-white p-4 sm:grid-cols-2 sm:p-5">
                  <div className="rounded-2xl bg-[#f8fcf1] px-4 py-3">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Assigned By</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{assignedByName}</p>
                  </div>
                  <div className="rounded-2xl bg-[#f8fcf1] px-4 py-3">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Assigned To</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{selectedEmployeesLabel}</p>
                  </div>
                </div>
              ) : null}

              <div className="rounded-[26px] border border-[#d8ecbb] bg-[#f8fcf1] p-4 sm:p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-lg font-semibold text-slate-900">Project Tasks</p>
                    <p className="text-sm text-slate-500">{mode === 'edit' ? 'Update the existing task details below.' : 'Start with Task 1, then click add button for Task 2, Task 3, and more.'}</p>
                  </div>
                  {!isAssignedSubmitOnly ? <button type="button" onClick={addTaskItem} disabled={taskDetailsLocked} className="inline-flex shrink-0 items-center gap-2 rounded-full border border-[#8fc740] bg-white px-5 py-3 text-sm font-bold text-[#123b76] shadow-sm transition hover:bg-[#f6fbef] disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400">
                    <PlusIcon className="h-4 w-4" />
                    Add Task
                  </button> : null}
                </div>
                <div className="mt-5 space-y-4">
                  {taskItems.map((item, index) => {
                    const proofUploadDisabled = taskDetailsLocked ? !assignedProofRequired : false;
                    return (
                    <div key={item.id} className="space-y-3 rounded-[24px] border border-[#d8ecbb] bg-white p-4 shadow-[0_10px_26px_rgba(72,116,28,0.05)]">
                      <p className="text-sm font-semibold text-slate-800">{mode === 'edit' && index === 0 ? 'Task Details' : `Task ${index + 1}`}</p>
                      <label className="flex items-center gap-3 rounded-2xl border border-[#d8ecbb] bg-[#fbfef7] px-4 py-3 text-sm font-semibold text-slate-800">
                          <input
                            checked={item.requireProof}
                            disabled={taskDetailsLocked}
                            onChange={(event) => updateTaskItemProofRequired(item.id, event.target.checked)}
                            type="checkbox"
                          />
                          <span>Require proof file/photo when assigned user marks done.</span>
                        </label>
                      <label className="block">
                        <span className="block text-sm font-medium text-slate-700">Task Title <span className="text-red-500">*</span></span>
                        <input className={fieldClassName} value={item.title} onChange={(event) => updateTaskItem(item.id, 'title', event.target.value)} disabled={taskDetailsLocked} placeholder={mode === 'edit' && index === 0 ? 'Enter task title' : `Enter task ${index + 1} title`} />
                      </label>
                      <label className="block">
                        <span className="block text-sm font-medium text-slate-700">Task Description</span>
                        <input className={fieldClassName} value={item.description} onChange={(event) => updateTaskItem(item.id, 'description', event.target.value)} disabled={taskDetailsLocked} placeholder={mode === 'edit' && index === 0 ? 'Enter task description' : `Enter task ${index + 1} description`} />
                      </label>
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <input
                          className="h-[50px] rounded-2xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none transition focus:border-[#8fc740] focus:ring-2 focus:ring-[#dff1c5] disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                          disabled={taskDetailsLocked}
                          onChange={(event) => updateTaskItem(item.id, 'dueDate', event.target.value)}
                          required={!isAssignedSubmitOnly && !taskForm.dueDate}
                          type="datetime-local"
                          value={item.dueDate}
                        />
                        <select
                          className="h-[50px] rounded-2xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none transition focus:border-[#8fc740] focus:ring-2 focus:ring-[#dff1c5] disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                          disabled={taskDetailsLocked}
                          onChange={(event) => updateTaskItem(item.id, 'qualityRating', event.target.value)}
                          value={item.qualityRating || ''}
                        >
                          <option value="">Select quality</option>
                          <option value="GOOD">Good</option>
                          <option value="GREAT">Great</option>
                          <option value="OUTSTANDING">Outstanding</option>
                          <option value="LMB">LMB</option>
                        </select>
                        <select
                          className="h-[50px] rounded-2xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none transition focus:border-[#8fc740] focus:ring-2 focus:ring-[#dff1c5] disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                          value={mode === 'edit' && index === 0 ? taskForm.status : 'PENDING'}
                          disabled={!canChangeTaskStatus || (mode === 'edit' && index > 0)}
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
                        <button
                          type="button"
                          onClick={() => addNcItem(item.id)}
                          disabled={taskDetailsLocked}
                          className="inline-flex h-[50px] items-center justify-center rounded-2xl border border-[#8fc740] bg-white px-4 text-sm font-bold text-[#123b76] transition hover:bg-[#f6fbef] disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                        >
                          Add NC
                        </button>
                      </div>
                      {item.ncItems.length ? (
                        <div className="space-y-2 rounded-2xl border border-[#d8ecbb] bg-[#fbfef7] p-3">
                          <p className="text-sm font-semibold text-slate-800">NC entries</p>
                          {item.ncItems.map((nc, ncIndex) => (
                            <div key={`${item.id}-nc-${ncIndex}`} className="flex flex-col gap-2 sm:flex-row">
                              <input
                                className={fieldClassName}
                                disabled={taskDetailsLocked}
                                onChange={(event) => updateNcItem(item.id, ncIndex, event.target.value)}
                                placeholder={`NC ${ncIndex + 1}`}
                                value={nc}
                              />
                              <button
                                type="button"
                                onClick={() => removeNcItem(item.id, ncIndex)}
                                disabled={taskDetailsLocked}
                                className="inline-flex h-11 items-center justify-center rounded-2xl border border-red-100 bg-red-50 px-4 text-sm font-semibold text-red-600 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                              >
                                Remove
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : null}
                      <div className="grid gap-3 lg:grid-cols-[minmax(220px,1.2fr)_auto] lg:items-center">
                        <input
                          className={[
                            'block h-[50px] w-full min-w-0 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition file:mr-3 file:h-8 file:rounded-xl file:border-0 file:bg-[#8fc740] file:px-3 file:text-sm file:font-semibold file:text-[#123b76] hover:file:bg-[#7fb337] focus:border-[#8fc740] focus:ring-2 focus:ring-[#dff1c5]',
                            proofUploadDisabled ? 'cursor-not-allowed bg-slate-100 text-slate-400 opacity-60 file:bg-slate-200 file:text-slate-500 hover:file:bg-slate-200' : '',
                          ].join(' ')}
                          type="file"
                          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.rtf,.ppt,.pptx"
                          multiple
                          disabled={proofUploadDisabled}
                          onChange={(event) => {
                            if (proofUploadDisabled) {
                              dispatchToast('warning', assignedProofRequired ? 'Proof upload is disabled for this task.' : 'Assigned by did not require proof file/photo for this task.');
                              event.currentTarget.value = '';
                              return;
                            }
                            void handleTaskFilesChange(item.id, event.target.files);
                            event.currentTarget.value = '';
                          }}
                        />
                        {taskDetailsLocked && !assignedProofRequired ? (
                          <p className="text-xs font-medium text-slate-500 lg:col-span-2">Assigned by did not require proof file/photo for this task.</p>
                        ) : taskDetailsLocked && assignedProofRequired ? (
                          <p className="text-xs font-medium text-slate-500 lg:col-span-2">Proof file/photo upload is enabled because assigned by required proof.</p>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => removeTaskItem(item.id)}
                          disabled={taskDetailsLocked || !canRemoveTaskItem(item.id)}
                          className={[
                            'inline-flex h-[50px] items-center justify-center gap-2 rounded-2xl border px-4 text-sm font-medium transition',
                            taskDetailsLocked || !canRemoveTaskItem(item.id) ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400' : 'border-[#d8ecbb] bg-white text-slate-700 hover:border-[#8fc740] hover:bg-[#f6fbef] hover:text-[#123b76]',
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
                                  {canRemoveTaskMedia(media) ? (
                                    <button
                                      type="button"
                                      onClick={() => removeTaskMedia(item.id, media.id || media.url)}
                                      className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-red-100 bg-red-50 text-red-600 transition hover:border-red-200 hover:bg-red-100"
                                      aria-label={`Remove ${getTaskMediaLabel(media)}`}
                                    >
                                      <TrashIcon className="h-4 w-4" />
                                    </button>
                                  ) : null}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : null}
                    </div>
                    );
                  })}
                </div>
              </div>

              {mode === 'edit' && currentTask ? (
                <div className="rounded-[26px] border border-[#d8ecbb] bg-[#f8fcf1] p-4 sm:p-5">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <p className="text-lg font-semibold text-slate-900">Task Description Discussion</p>
                      <p className="text-sm text-slate-500">Your notes show on the right, other people&apos;s notes show on the left.</p>
                    </div>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#42601c]">
                      {taskDescriptionNotes.length} description{taskDescriptionNotes.length === 1 ? '' : 's'}
                    </span>
                  </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
                    <textarea
                      className="min-h-[96px] w-full resize-y rounded-2xl border border-emerald-100 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-[#8fc740] focus:ring-2 focus:ring-[#dff1c5]"
                      onChange={(event) => setNoteMessage(event.target.value)}
                      placeholder="Add description note"
                      disabled={!canAddTaskDescriptionDiscussion}
                      value={noteMessage}
                    />
                    <button
                      type="button"
                      onClick={() => void submitTaskNote()}
                      disabled={sendingNote || !noteMessage.trim() || !canAddTaskDescriptionDiscussion}
                      className="inline-flex min-h-[48px] items-center justify-center rounded-2xl bg-[#8fc740] px-6 py-3 text-sm font-bold text-[#123b76] shadow-[0_14px_28px_rgba(143,199,64,0.22)] transition hover:bg-[#7fb337] disabled:cursor-not-allowed disabled:opacity-60 sm:self-end"
                    >
                      {sendingNote ? 'Adding...' : 'Add Description'}
                    </button>
                  </div>
                  <div className="mt-5 max-h-[420px] space-y-3 overflow-y-auto rounded-3xl border border-[#d8ecbb] bg-white p-3 sm:p-4">
                    {taskDescriptionNotes.length ? (
                      [...taskDescriptionNotes]
                        .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())
                        .map((note) => {
                          const isMine = Boolean(me?.id && note.createdById === me.id);
                          return (
                            <div key={note.id} className={['flex', isMine ? 'justify-end' : 'justify-start'].join(' ')}>
                              <div
                                className={[
                                  'max-w-[82%] rounded-3xl px-4 py-3 text-sm shadow-sm',
                                  isMine
                                    ? 'rounded-br-md bg-[#8fc740] text-[#123b76]'
                                    : 'rounded-bl-md border border-slate-200 bg-slate-50 text-slate-700',
                                ].join(' ')}
                              >
                                <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] opacity-75">
                                  <span>{isMine ? 'You' : note.createdByName}</span>
                                  <span>{formatNoteDate(note.createdAt)}</span>
                                </div>
                                <p className="whitespace-pre-wrap leading-6">{getTaskDescriptionNoteText(note.message)}</p>
                              </div>
                            </div>
                          );
                        })
                    ) : (
                      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                        No task descriptions added yet.
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
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
