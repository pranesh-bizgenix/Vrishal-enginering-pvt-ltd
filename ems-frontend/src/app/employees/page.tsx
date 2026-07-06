'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, getToken } from '../lib/api';
import { clearAuth } from '../lib/auth';
import { getWorkspaceNavItems, routeSection } from '../lib/workspace';
import { canManageTeamRecords, canViewerSeeEmployee, formatRoleName, getEmployeeScopeIds, getHighestRolePower, isAdminRole } from '../lib/hierarchy';
import { DashboardSidebar, DashboardTopbar } from '../../components/DashboardShell';
import { PaginationBar } from '../../components/PaginationBar';
import type { DashboardResponse, Employee, NavItem, PaginatedResponse, SectionKey } from '../dashboard/types';
import { EyeIcon, ArrowPathIcon, PlusIcon, XMarkIcon } from '@heroicons/react/24/outline';

type EmployeeMenuState = {
  employeeId: string;
  top: number;
  left: number;
};

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
      {message}
    </div>
  );
}

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

function formatRoleLabel(role: string) {
  return formatRoleName(role);
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={[
        'inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold',
        active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700',
      ].join(' ')}
    >
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

export default function EmployeesPage() {
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [busy, setBusy] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [error, setError] = useState('');
  const [openMenu, setOpenMenu] = useState<EmployeeMenuState | null>(null);
  const [selectedPersonId, setSelectedPersonId] = useState(() => (typeof window === 'undefined' ? '' : window.localStorage.getItem('ems-dashboard-person-scope') || ''));
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [search, setSearch] = useState('');
  const [totalEmployees, setTotalEmployees] = useState(0);

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
      const [dashboardData, employeeData] = await Promise.all([
        api<DashboardResponse>('/dashboard'),
        api<PaginatedResponse<Employee>>(`/employees?${query.toString()}`),
      ]);

      setDashboard(dashboardData);
      setEmployees(employeeData.items);
      setTotalEmployees(employeeData.total);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Unable to load employees.';
      setError(message);
      if (message.toLowerCase().includes('unauthorized')) {
        clearAuth();
        router.replace('/auth/login');
      }
    } finally {
      setBusy(false);
    }
  }, [page, perPage, router, search]);

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
  const canManage = canManageTeamRecords(me?.roles ?? []);
  const initials = me?.name?.trim()?.charAt(0)?.toUpperCase() || 'A';
  const navItems: NavItem[] = getWorkspaceNavItems(canManage, isAdmin, me?.roles ?? []);
  const selectedPerson = useMemo(() => employees.find((employee) => employee.id === selectedPersonId) || null, [employees, selectedPersonId]);
  const selectedScopeEmployeeIds = useMemo(() => getEmployeeScopeIds(employees, selectedPerson), [employees, selectedPerson]);
  const visibleEmployees = useMemo(() => {
    if (!me) {
      return [];
    }

    if (selectedScopeEmployeeIds) {
      return employees.filter((employee) => selectedScopeEmployeeIds.has(employee.id));
    }

    return employees.filter((employee) => canViewerSeeEmployee(me, employee));
  }, [employees, me, selectedScopeEmployeeIds]);
  const displayedEmployeeTotal = isAdmin && !selectedScopeEmployeeIds ? totalEmployees : visibleEmployees.length;
  const totalPages = Math.max(1, Math.ceil(displayedEmployeeTotal / perPage));
  const sidebarPeopleFilter = useMemo(() => {
    if (!me || !canManage) {
      return [];
    }

    const people = employees.filter((employee) => employee.id !== me.id && canViewerSeeEmployee(me, employee));

    return people
      .sort((left, right) => {
        return getHighestRolePower(right.roles) - getHighestRolePower(left.roles) || left.name.localeCompare(right.name);
      })
      .map((employee) => ({
        id: employee.id,
        name: employee.name,
        roleLabel: employee.roles.map(formatRoleName).join(', '),
        leaderName: employee.leaderName || 'Unassigned',
        projectCount: employee.currentProjectIds?.length ?? 0,
        taskCount: 0,
      }));
  }, [canManage, employees, me]);

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

  function handlePersonScopeChange(employeeId: string) {
    setSelectedPersonId(employeeId);
    if (employeeId) {
      window.localStorage.setItem('ems-dashboard-person-scope', employeeId);
    } else {
      window.localStorage.removeItem('ems-dashboard-person-scope');
    }
    window.dispatchEvent(new CustomEvent('ems-person-scope-change', { detail: employeeId }));
  }

  function handleSection(section: SectionKey) {
    setSidebarOpen(false);
    routeSection(router, section);
  }

  function handleLogout() {
    clearAuth();
    router.replace('/auth/login');
  }

  function handleActionMenuToggle(employeeId: string, event: React.MouseEvent<HTMLButtonElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const nextTop = rect.bottom + 4;
    const nextLeft = Math.max(16, rect.right - 170);

    setOpenMenu((current) =>
      current?.employeeId === employeeId
        ? null
        : {
            employeeId,
            top: nextTop,
            left: nextLeft,
          },
    );
  }

  async function handleRunReport() {
    try {
      await api('/reports/run-scheduled', { method: 'POST' });
      await loadData();
    } catch (reportError) {
      setError(reportError instanceof Error ? reportError.message : 'Unable to trigger reports.');
    }
  }


  async function softDeleteEmployee(employee: Employee) {
    try {
      await api(`/employees/${employee.id}`, { method: 'DELETE' });
      setOpenMenu(null);
      await loadData();
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'Unable to delete employee.');
    }
  }

  return (
    <main className="min-h-screen bg-[#edf2f7] text-slate-900 lg:flex">
      <DashboardSidebar
        activeSection="employees"
        navItems={navItems}
        onClose={() => setSidebarOpen(false)}
        onSelect={handleSection}
        open={sidebarOpen}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <DashboardTopbar
          canRunReport={isAdmin}
          initials={initials}
          userEmail={me?.email ?? ''}
          userName={me?.name ?? 'Admin'}
          onLogout={handleLogout}
          onMenuOpen={() => setSidebarOpen(true)}
          onRunReport={handleRunReport}
          peopleFilter={sidebarPeopleFilter}
          peopleFilterTitle={isAdmin ? 'Leaders & Employees' : 'My Employees'}
          selectedPersonId={selectedPersonId}
          onSelectPerson={handlePersonScopeChange}
          subtitle="Task Management System"
          title="Employees"
        />

        <section className="px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
          {error ? (
            <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.06)] sm:p-6 lg:p-7">
            {!canManage ? (
              <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                You can view employees, but only ADMIN or LEADER can create or edit employees.
              </div>
            ) : null}

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.3em] text-slate-400">Employees Module</p>
                <h1 className="mt-3 text-3xl font-semibold text-slate-900">Employees</h1>
                <p className="mt-2 text-sm text-slate-500">Review current team members and update active status.</p>
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
                <Link
                  href="/employees/new"
                  className={[
                    'inline-flex items-center gap-2 rounded-full px-5 py-1 text-sm font-medium transition',
                    canManage ? 'bg-blue-600 text-white' : 'pointer-events-none bg-slate-200 text-slate-400',
                  ].join(' ')}
                  aria-disabled={!canManage}
                  tabIndex={canManage ? 0 : -1}
                >
                  <PlusIcon className="h-4 w-4" />
                  Create Employee
                </Link>
              </div>
            </div>

            <div className="mt-6 rounded-[24px] border border-slate-200">
              <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                <input
                  className="h-11 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#8fc740] focus:ring-2 focus:ring-[#8fc740]/20 sm:max-w-sm"
                  onChange={(event) => {
                    setPage(1);
                    setSearch(event.target.value);
                  }}
                  placeholder="Search employees, role, leader, phone"
                  value={search}
                />
              </div>
              {visibleEmployees.length ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-50">
                      <tr className="text-left text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                        <th className="px-6 py-4">Name</th>
                        <th className="px-6 py-4">Roles</th>
                        <th className="px-6 py-4">Projects</th>
                        <th className="px-6 py-4">WhatsApp Number</th>
                        <th className="px-6 py-4">Status</th>
                        <th className="px-6 py-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {visibleEmployees.map((employee) => (
                        <tr key={employee.id} className="align-top">
                          <td className="px-6 py-5"><p className="text-sm font-semibold text-slate-900">{employee.name}</p></td>
                          <td className="px-6 py-5 text-sm text-slate-600">{employee.roles.map(formatRoleLabel).join(', ')}</td>
                          <td className="px-6 py-5 text-sm text-slate-600">{employee.currentProjectIds.length}</td>
                          <td className="px-6 py-5 text-sm text-slate-600"><p className="mt-1">{employee.phone || 'Not added'}</p></td>
                          <td className="px-6 py-5"><StatusBadge active={employee.active} /></td>
                          <td className="px-6 py-5 text-right">
                            <div className="inline-flex items-center gap-2">
                              <div className="inline-flex">
                                <button
                                  className={[
                                    'inline-flex h-8 items-center gap-1.5 rounded-l-xl px-4 text-xs font-semibold uppercase tracking-[0.14em] transition',
                                    canManage ? 'bg-blue-600 text-white hover:bg-blue-700' : 'cursor-not-allowed bg-slate-200 text-slate-400',
                                  ].join(' ')}
                                  disabled={!canManage}
                                  onClick={() => {
                                    if (!canManage) return;
                                    router.push(`/employees/${employee.id}/edit`);
                                  }}
                                  type="button"
                                >
                                  <EditIcon className="h-6 w-4" />
                                  Edit
                                </button>
                                <button
                                  aria-label="Open employee actions"
                                  className={[
                                    'inline-flex h-8 items-center rounded-r-xl px-3 transition',
                                    canManage ? 'border-l border-blue-500 bg-blue-600 text-white hover:bg-blue-700' : 'cursor-not-allowed border-l border-slate-300 bg-slate-200 text-slate-400',
                                  ].join(' ')}
                                  disabled={!canManage}
                                  onClick={(event) => {
                                    if (!canManage) return;
                                    handleActionMenuToggle(employee.id, event);
                                  }}
                                  type="button"
                                >
                                  <svg viewBox="0 0 12 12" aria-hidden="true" className="h-3 w-3 fill-current">
                                    <path d="M2.2 4.2 6 8l3.8-3.8H2.2Z" />
                                  </svg>
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-6">
                  <EmptyState message="No employees found." />
                </div>
              )}
              <div className="border-t border-slate-200 bg-white p-4">
                <PaginationBar
                  busy={busy}
                  itemLabel="Employees"
                  page={page}
                  perPage={perPage}
                  total={displayedEmployeeTotal}
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
            const employee = visibleEmployees.find((item) => item.id === openMenu.employeeId) || employees.find((item) => item.id === openMenu.employeeId);
            if (!employee) {
              return null;
            }

            return (
              <>
                <button 
                  className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm font-medium text-[#010048] transition hover:bg-blue-50"
                  onClick={() => { setOpenMenu(null); router.push(`/employees/${employee.id}`);}}

                  type="button"
                >
                  <EyeIcon className="h-4 w-4" />
                  View
                </button>
                {isAdmin ? (
                  <button
                    className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm font-medium text-red-600 transition hover:bg-red-50"
                    onClick={() => void softDeleteEmployee(employee)}
                    type="button"
                  >
                    <XMarkIcon className="h-4 w-4" />
                    Soft Delete
                  </button>
                ) : null}
              </>
            );
          })()}
        </div>
      ) : null}
    </main>
  );
}








