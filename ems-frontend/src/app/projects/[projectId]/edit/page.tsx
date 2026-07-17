'use client';

import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, getToken } from '../../../lib/api';
import { clearAuth } from '../../../lib/auth';
import { getWorkspaceNavItems, routeSection } from '../../../lib/workspace';
import { canManageTeamRecords, canRunReports, getAssignableEmployeesForViewer, isAdminRole } from '../../../lib/hierarchy';
import { DashboardSidebar, DashboardTopbar } from '../../../../components/DashboardShell';
import type { DashboardResponse, Employee, NavItem, Project, ProjectStatus, SectionKey } from '../../../dashboard/types';
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';

const fieldClassName = 'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400';
const primaryButtonClassName = 'inline-flex items-center justify-center rounded-2xl bg-blue-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-blue-700';
const secondaryButtonClassName = 'inline-flex items-center justify-center rounded-2xl border border-red-400 bg-white px-10 py-3 text-xl font-bold text-red-600 transition hover:bg-slate-50';
const projectStatusOptions: Array<{ value: ProjectStatus; label: string }> = [
  { value: 'NOT_STARTED', label: 'Not Started' },
  { value: 'STARTED', label: 'Started' },
  { value: 'RUNNING', label: 'Running' },
  { value: 'RUNNING_FINAL_STAGE', label: 'Running Final Stage' },
  { value: 'COMPLETED', label: 'Completed' },
];

const projectFormInitial = {
  name: '',
  projectType: '',
  description: '',
  dueDate: '',
  projectStatus: 'NOT_STARTED' as ProjectStatus,
  assignedEmployeeIds: [] as string[],
};

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}

function formatDateTimeLocalInIndia(value: string | null) {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value.slice(0, 16);
  }

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${lookup.year}-${lookup.month}-${lookup.day}T${lookup.hour}:${lookup.minute}`;
}

export default function EditProjectPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = Array.isArray(params?.projectId) ? params.projectId[0] : params?.projectId;
  const router = useRouter();
  const employeeDropdownRef = useRef<HTMLDivElement | null>(null);
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [projectForm, setProjectForm] = useState(projectFormInitial);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [employeesOpen, setEmployeesOpen] = useState(false);

  const loadData = useCallback(async () => {
    if (!projectId) {
      setError('Project not found.');
      return;
    }

    setError('');
    try {
      const [dashboardData, employeeData, projectData] = await Promise.all([
        api<DashboardResponse>('/dashboard'),
        api<Employee[]>('/employees'),
        api<Project[]>('/projects'),
      ]);

      setDashboard(dashboardData);
      setEmployees(employeeData);

      const currentProject = projectData.find((project) => project.id === projectId);
      if (!currentProject) {
        setError('Project not found.');
        return;
      }

      setProjectForm({
        name: currentProject.name || '',
        projectType: currentProject.projectType || '',
        description: currentProject.description || '',
        dueDate: formatDateTimeLocalInIndia(currentProject.dueDate),
        projectStatus: currentProject.projectStatus || 'NOT_STARTED',
        assignedEmployeeIds: currentProject.assignedEmployeeIds || [],
      });
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Unable to load project form.';
      setError(message);
      if (message.toLowerCase().includes('unauthorized')) {
        clearAuth();
        router.replace('/auth/login');
      }
    }
  }, [projectId, router]);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/auth/login');
      return;
    }
    void loadData();
  }, [loadData, router]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!employeeDropdownRef.current?.contains(event.target as Node)) {
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

  const me = dashboard?.employee;
  const isAdmin = isAdminRole(me?.roles ?? []);
  const canEditProject = Boolean(me?.roles.includes('SA1'));
  const canManage = canManageTeamRecords(me?.roles ?? []);
  const navItems = useMemo<NavItem[]>(() => getWorkspaceNavItems(canManage, isAdmin, me?.roles ?? []), [canManage, isAdmin, me?.roles]);
  const initials = me?.name?.trim()?.charAt(0)?.toUpperCase() || 'A';
  const selectableEmployees = useMemo(
    () => getAssignableEmployeesForViewer(employees, me, projectForm.assignedEmployeeIds),
    [employees, me, projectForm.assignedEmployeeIds],
  );
  const selectedEmployeesLabel = projectForm.assignedEmployeeIds.length
    ? employees
        .filter((employee) => projectForm.assignedEmployeeIds.includes(employee.id))
        .map((employee) => `${employee.name}${employee.active ? '' : ' (Inactive)'}`)
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

  async function submitProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEditProject) {
      setError('Only SA1 can edit projects.');
      return;
    }
    if (!projectId) {
      setError('Project not found.');
      return;
    }

    const trimmedName = projectForm.name.trim();
    if (!trimmedName) {
      setError('Project Name is required.');
      return;
    }
    if (!projectForm.assignedEmployeeIds.length) {
      setError('Assign Employees is required.');
      return;
    }
    if (!projectForm.dueDate) {
      setError('Project Due Date is required.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await api<Project>(`/projects/${projectId}`, {
        method: 'PATCH',
        body: JSON.stringify({ ...projectForm, name: trimmedName, dueDate: projectForm.dueDate || null }),
      });
      router.push('/projects');
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'Unable to update project.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#edf2f7] text-slate-900 lg:flex">
      <DashboardSidebar activeSection="projects" navItems={navItems} onClose={() => setSidebarOpen(false)} onSelect={handleSection} open={sidebarOpen} />
      <div className="flex min-w-0 flex-1 flex-col">
        <DashboardTopbar canRunReport={canRunReports(me?.roles ?? [])} initials={initials} userEmail={me?.email ?? ''} userName={me?.name ?? 'Admin'} onLogout={handleLogout} onMenuOpen={() => setSidebarOpen(true)} onRunReport={handleRunReport} subtitle="Task Management System" title="Edit Project" />
        <section className="px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
          {dashboard && !canEditProject ? (
            <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700">
              Only SA1 can edit projects.
            </div>
          ) : null}
          {error ? <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.06)] sm:p-6 lg:p-7">
            <form className="space-y-4" onSubmit={submitProject}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium uppercase tracking-[0.3em] text-slate-400 mb-2">Project Module</p>
                  <h1 className="text-xl font-semibold text-slate-950 sm:text-2xl">Edit Project</h1>
                  <p className="mt-1 text-sm text-slate-500">Update project details, status, and assigned active employees.</p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button className={secondaryButtonClassName} onClick={() => router.push('/projects')} type="button">Cancel</button>
                  <button className={primaryButtonClassName} disabled={saving || !canEditProject} type="submit">{saving ? 'Saving...' : 'Update Project'}</button>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
              <Field label="Project Name">
                <input className={fieldClassName} disabled={!canEditProject} onChange={(event) => setProjectForm({ ...projectForm, name: event.target.value })} placeholder="Project name" required value={projectForm.name} />
              </Field>
              <Field label="Project Type">
                <input className={fieldClassName} disabled={!canEditProject} onChange={(event) => setProjectForm({ ...projectForm, projectType: event.target.value })} placeholder="Project type" value={projectForm.projectType} />
              </Field>
              <Field label="Project Status">
                <select className={fieldClassName} disabled={!canEditProject} onChange={(event) => setProjectForm({ ...projectForm, projectStatus: event.target.value as ProjectStatus })} value={projectForm.projectStatus}>
                  {projectStatusOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Project Description">
                <textarea className={`${fieldClassName} min-h-28 resize-y`} disabled={!canEditProject} onChange={(event) => setProjectForm({ ...projectForm, description: event.target.value })} placeholder="Description" value={projectForm.description} />
              </Field>
              <div className="rounded-[26px] border border-slate-200 bg-slate-50 p-4 sm:p-5">
                <div className="flex flex-col gap-2">
                  <p className="text-sm font-medium text-slate-700">Assign Employees</p>
                  <p className="text-xs text-slate-500">Inactive employees stay visible for old project history, but cannot be newly assigned.</p>
                </div>
                <div className="relative mt-4" ref={employeeDropdownRef}>
                  <button
                    type="button"
                    onClick={() => {
                      if (!canEditProject) {
                        return;
                      }
                      setEmployeesOpen((current) => !current);
                    }}
                    className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left text-sm text-slate-900 transition hover:border-slate-300"
                  >
                    <span className="truncate pr-3 text-slate-700">{selectedEmployeesLabel}</span>
                    {employeesOpen ? <ChevronUpIcon className="h-5 w-5 text-slate-500" /> : <ChevronDownIcon className="h-5 w-5 text-slate-500" />}
                  </button>
                  {employeesOpen && canEditProject ? (
                    <div className="absolute left-0 right-0 z-20 mt-2 max-h-72 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-3 shadow-lg">
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {selectableEmployees.map((employee) => {
                          const isInactiveAssigned = !employee.active && projectForm.assignedEmployeeIds.includes(employee.id);

                          return (
                            <label
                              key={employee.id}
                              className={[
                                'flex items-center gap-3 rounded-2xl border px-3 py-3 text-sm transition',
                                isInactiveAssigned
                                  ? 'border-amber-200 bg-amber-50 text-amber-700'
                                  : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-slate-100',
                              ].join(' ')}
                            >
                              <input
                                checked={projectForm.assignedEmployeeIds.includes(employee.id)}
                                disabled={!canEditProject || isInactiveAssigned}
                                onChange={() =>
                                  setProjectForm({
                                    ...projectForm,
                                    assignedEmployeeIds: toggleSelection(projectForm.assignedEmployeeIds, employee.id),
                                  })
                                }
                                type="checkbox"
                              />
                              <span>{employee.name}{employee.active ? '' : ' (Inactive)'}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
              <Field label="Due Date">
                <input className={fieldClassName} disabled={!canEditProject} onChange={(event) => setProjectForm({ ...projectForm, dueDate: event.target.value })} type="datetime-local" value={projectForm.dueDate} />
              </Field>
              </div>
            </form>
          </section>
        </section>
      </div>
    </main>
  );
}
