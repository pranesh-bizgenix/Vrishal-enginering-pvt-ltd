'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getToken } from '../lib/api';
import { clearAuth } from '../lib/auth';
import { getWorkspaceNavItems, routeSection } from '../lib/workspace';
import { canCreateProjects, canManageTeamRecords, canRunReports, canViewerSeeEmployee, getEmployeeScopeIds, isAdminRole, itemMatchesEmployeeScope } from '../lib/hierarchy';
import { DashboardSidebar, DashboardTopbar } from '../../components/DashboardShell';
import { PaginationBar } from '../../components/PaginationBar';
import type { DashboardResponse, Employee, NavItem, PaginatedResponse, Project, SectionKey } from '../dashboard/types';
import { EyeIcon, ArrowPathIcon, PlusIcon, XMarkIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';

type ProjectMenuState = {
  projectId: string;
  top: number;
  left: number;
};

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

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'Not set';
}

function EmptyState({ message }: { message: string }) {
  return <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">{message}</div>;
}

function formatProjectStatus(status: Project['projectStatus']) {
  return status
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/(^|\\s)\\S/g, (char) => char.toUpperCase());
}

const statusStyles = {
  NOT_STARTED: "bg-gray-100 text-gray-500",
  STARTED: "bg-blue-100 text-blue-600",
  RUNNING: "bg-yellow-100 text-yellow-600",
  RUNNING_FINAL_STAGE: "bg-orange-100 text-orange-600",
  COMPLETED: "bg-green-100 text-green-600",
};

export default function ProjectsPage() {
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [openMenu, setOpenMenu] = useState<ProjectMenuState | null>(null);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [search, setSearch] = useState('');
  const [totalProjects, setTotalProjects] = useState(0);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedPersonId, setSelectedPersonId] = useState(() => (typeof window === 'undefined' ? '' : window.localStorage.getItem('ems-dashboard-person-scope') || ''));

  const loadData = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const query = new URLSearchParams({
        page: String(page),
        perPage: String(perPage),
      });
      if (search.trim()) {
        query.set('search', search.trim());
      }
      if (selectedPersonId) {
        query.set('employeeIds', selectedPersonId);
      }
      const [dashboardData, projectData, employeeData] = await Promise.all([
        api<DashboardResponse>('/dashboard'),
        api<PaginatedResponse<Project>>(`/projects?${query.toString()}`),
        api<Employee[]>('/employees'),
      ]);
      setDashboard(dashboardData);
      setProjects(projectData.items);
      setTotalProjects(projectData.total);
      setEmployees(employeeData);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Unable to load projects.';
      setError(message);
      if (message.toLowerCase().includes('unauthorized')) {
        clearAuth();
        router.replace('/auth/login');
      }
    } finally {
      setBusy(false);
    }
  }, [page, perPage, router, search, selectedPersonId]);

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
  const canDeleteRecords = Boolean(me?.roles.includes('SA1'));
  const canEditProject = Boolean(me?.roles.includes('SA1'));
  const canManage = canManageTeamRecords(me?.roles ?? []);
  const canCreateProject = canCreateProjects(me?.roles ?? []);
  const navItems = useMemo<NavItem[]>(() => getWorkspaceNavItems(canManage, isAdmin, me?.roles ?? []), [canManage, isAdmin, me?.roles]);
  const initials = me?.name?.trim()?.charAt(0)?.toUpperCase() || 'A';
  const selectedPerson = useMemo(() => employees.find((employee) => employee.id === selectedPersonId) || null, [employees, selectedPersonId]);
  const selectedScopeEmployeeIds = useMemo(() => getEmployeeScopeIds(employees, selectedPerson), [employees, selectedPerson]);
  const sidebarPeopleFilter = useMemo(() => {
    if (!me || !canManage) {
      return [];
    }

    return employees
      .filter((employee) => employee.id !== me.id && canViewerSeeEmployee(me, employee))
      .map((employee) => ({
        id: employee.id,
        name: employee.name,
        roleLabel: employee.roles.join(', '),
        leaderName: employee.leaderName || 'Unassigned',
        projectCount: employee.currentProjectIds?.length ?? 0,
        taskCount: 0,
      }));
  }, [canManage, employees, me]);
  useEffect(() => {
    if (!me || !selectedPersonId) {
      return;
    }

    if (!sidebarPeopleFilter.some((person) => person.id === selectedPersonId)) {
      setSelectedPersonId('');
      window.localStorage.removeItem('ems-dashboard-person-scope');
    }
  }, [me, selectedPersonId, sidebarPeopleFilter]);
  const totalPages = Math.max(1, Math.ceil(totalProjects / perPage));

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  function handleSection(section: SectionKey) {
    setSidebarOpen(false);
    routeSection(router, section);
  }

  function handleLogout() {
    clearAuth();
    router.replace('/auth/login');
  }

  function handleActionMenuToggle(projectId: string, event: React.MouseEvent<HTMLButtonElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const nextTop = rect.bottom + 4;
    const nextLeft = Math.max(16, rect.right - 170);

    setOpenMenu((current) =>
      current?.projectId === projectId
        ? null
        : {
            projectId,
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

  function handlePersonScopeChange(employeeId: string) {
    setPage(1);
    setSelectedPersonId(employeeId);
    if (employeeId) {
      window.localStorage.setItem('ems-dashboard-person-scope', employeeId);
    } else {
      window.localStorage.removeItem('ems-dashboard-person-scope');
    }
  }

  function getScopedProjectTaskCount(project: Project) {
    if (!selectedScopeEmployeeIds) {
      return project.tasks.length;
    }

    return project.tasks.filter((task) => itemMatchesEmployeeScope(task.assignedEmployeeIds, selectedScopeEmployeeIds)).length;
  }

  async function deleteProject(projectId: string) {
    try {
      await api(`/projects/${projectId}`, { method: 'DELETE' });
      setOpenMenu(null);
      await loadData();
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'Unable to delete project.');
    }
  }

  return (
    <main className="min-h-screen bg-[#edf2f7] text-slate-900 lg:flex">
      <DashboardSidebar activeSection="projects" navItems={navItems} onClose={() => setSidebarOpen(false)} onSelect={handleSection} open={sidebarOpen} peopleFilter={sidebarPeopleFilter} 
      // peopleFilterTitle={isAdmin ? 'Leaders & Employees' : 'My Employees'} 
      selectedPersonId={selectedPersonId} onSelectPerson={canManage ? handlePersonScopeChange : undefined} />
      <div className="flex min-w-0 flex-1 flex-col">
        <DashboardTopbar canRunReport={canRunReports(me?.roles ?? [])} initials={initials} userEmail={me?.email ?? ''} userName={me?.name ?? 'Admin'} onLogout={handleLogout} onMenuOpen={() => setSidebarOpen(true)} onRunReport={handleRunReport} peopleFilter={sidebarPeopleFilter} 
        // peopleFilterTitle={isAdmin ? 'Leaders & Employees' : 'My Employees'} 
        selectedPersonId={selectedPersonId} onSelectPerson={canManage ? handlePersonScopeChange : undefined} subtitle="Task Management System" title="Projects" />
        <section className="px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
          {error ? <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.06)] sm:p-6 lg:p-7">
            {!canCreateProject ? (
              <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                You can view projects, but only SA1 can create projects.
              </div>
            ) : null}

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.3em] text-slate-400">Project Module</p>
                <h1 className="mt-3 text-3xl font-semibold text-slate-900">Projects</h1>
                <p className="mt-2 text-sm text-slate-500">Track delivery progress, project type, and assigned employees.</p>
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
                <Link href="/projects/new" className={['inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-medium transition', canCreateProject ? 'bg-blue-600 text-white' : 'pointer-events-none bg-slate-200 text-slate-400'].join(' ')} aria-disabled={!canCreateProject} tabIndex={canCreateProject ? 0 : -1}>
                  <PlusIcon className="h-4 w-4" />
                  Create Project
                </Link>
              </div>
            </div>
            <div className="mt-6">
              <div className="mb-4 flex flex-col gap-3 rounded-[24px] border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                <input
                  className="h-11 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#8fc740] focus:ring-2 focus:ring-[#8fc740]/20 sm:max-w-md"
                  onChange={(event) => {
                    setPage(1);
                    setSearch(event.target.value);
                  }}
                  placeholder="Search projects, type, status, employee"
                  value={search}
                />
              </div>
              {projects.length ? (
                <div className="overflow-hidden rounded-[24px] border border-slate-200">
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200 text-sm">
                      <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.2em] text-slate-500">
                        <tr>
                          <th className="px-4 py-4 font-semibold">Project</th>
                          <th className="px-4 py-4 font-semibold">Assigned Employees</th>
                          <th className="px-4 py-4 font-semibold">Due Date</th>
                          <th className="px-4 py-4 font-semibold">Tasks</th>
                          <th className="px-4 py-4 font-semibold">Status</th>
                          <th className="px-4 py-4 font-semibold text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 bg-white">
                        {projects.map((project) => (
                          <tr key={project.id} className="align-top">
                            <td className="px-4 py-4">
                              <div className="min-w-[110px]">
                                <p className="font-semibold text-slate-900">{project.name}</p>
                                {/* <p className="mt-1 text-slate-500">{project.description || 'No description provided.'}</p> */}
                              </div>
                            </td>
                            <td className="px-4 py-4 text-slate-700">{project.assignedEmployees.map((employee) => employee.name).join(', ') || 'None'}</td>
                            <td className="px-4 py-4 text-slate-700">{formatDate(project.dueDate)}</td>
                            <td className="px-4 py-4 text-slate-700">{getScopedProjectTaskCount(project)}</td>
                            <td className="px-4 py-4">
                              <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusStyles[project.projectStatus] || "bg-gray-100 text-gray-500"}`}>
                                {formatProjectStatus(project.projectStatus)}
                              </span>
                            </td>
                            <td className="px-4 py-4 text-right">
                              <div className="inline-flex">
                                <button
                                  className={[
                                    'inline-flex h-8 items-center gap-1.5 rounded-l-xl px-4 text-xs font-semibold uppercase tracking-[0.14em] transition',
                                    canEditProject ? 'bg-blue-600 text-white hover:bg-blue-700' : 'cursor-not-allowed bg-slate-200 text-slate-400',
                                  ].join(' ')}
                                  disabled={!canEditProject}
                                  onClick={() => {
                                    if (!canEditProject) return;
                                    router.push(`/projects/${project.id}/edit`);
                                  }}
                                  type="button"
                                >
                                  <EditIcon className="h-6 w-4" />
                                  Edit
                                </button>
                                <button
                                  aria-label="Open project actions"
                                  className={[
                                    'inline-flex h-8 items-center rounded-r-xl px-3 transition',
                                    'border-l border-blue-500 bg-blue-600 text-white hover:bg-blue-700',
                                  ].join(' ')}
                                  onClick={(event) => {
                                    handleActionMenuToggle(project.id, event);
                                  }}
                                  type="button"
                                >
                                  <svg viewBox="0 0 12 12" aria-hidden="true" className="h-3 w-3 fill-current">
                                    <path d="M2.2 4.2 6 8l3.8-3.8H2.2Z" />
                                  </svg>
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : <EmptyState message="No projects found." />}
              <div className="mt-4 rounded-[24px] border border-slate-200 bg-white p-4">
                <PaginationBar
                  busy={busy}
                  itemLabel="Projects"
                  page={page}
                  perPage={perPage}
                  total={totalProjects}
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
            const project = projects.find((item) => item.id === openMenu.projectId);
            if (!project) {
              return null;
            }
            return (
              <div>
                <button 
                  className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm font-medium text-[#010048] transition hover:bg-blue-50"
                  onClick={() => { setOpenMenu(null); router.push(`/projects/${project.id}`);}}

                  type="button"
                >
                  <EyeIcon className="h-4 w-4" />
                  View
                </button>
                {canDeleteRecords ? (
                  <button
                    className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm font-medium text-red-600 transition hover:bg-red-50"
                    onClick={() => void deleteProject(project.id)}
                    type="button"
                  >
                    <XMarkIcon className="h-4 w-4" />
                    Soft Delete
                  </button>
                ) : null}
              </div>
            );
          })()}
        </div>
      ) : null}
    </main>
  );
}












