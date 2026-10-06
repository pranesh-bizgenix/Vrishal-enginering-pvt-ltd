'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getToken } from '../lib/api';
import { clearAuth } from '../lib/auth';
import { getWorkspaceNavItems, routeSection } from '../lib/workspace';
import { canManageTeamRecords, canRunReports, canViewerSeeEmployee, formatRoleName, getHighestRolePower, isAdminRole } from '../lib/hierarchy';
import { DashboardSidebar, DashboardTopbar } from '../../components/DashboardShell';
import type { DashboardResponse, Employee, NavItem, PaginatedResponse, SectionKey, Task } from '../dashboard/types';

function formatRole(role: string) {
  return formatRoleName(role);
}

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleDateString('en-IN') : 'No due date';
}

function StatCard({ label, value, helper }: { label: string; value: string | number; helper: string }) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-white/92 p-4 shadow-[0_16px_35px_rgba(15,23,42,0.06)] backdrop-blur sm:p-5">
      <p className="text-[11px] font-bold uppercase tracking-[0.26em] text-[#6f9e2c]">{label}</p>
      <p className="mt-3 break-words text-2xl font-semibold tracking-[-0.03em] text-slate-950 sm:text-2xl">{value}</p>
      <p className="mt-1 text-sm leading-6 text-slate-500">{helper}</p>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 px-4 py-8 text-center text-sm text-slate-500">{message}</div>;
}

export default function MyAccountPage() {
  const router = useRouter();
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [totalEmployees, setTotalEmployees] = useState(0);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [totalOpenTasks, setTotalOpenTasks] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    setError('');

    try {
      const [dashboardData, employeeData, taskData] = await Promise.all([
        api<DashboardResponse>('/dashboard'),
        api<PaginatedResponse<Employee>>('/employees?page=1&perPage=100'),
        api<PaginatedResponse<Task>>('/tasks?page=1&perPage=12&openOnly=true'),
      ]);
      setDashboard(dashboardData);
      setEmployees(employeeData.items);
      setTotalEmployees(employeeData.total);
      setTasks(taskData.items);
      setTotalOpenTasks(taskData.total);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Unable to load account details.';
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
  const isLeader = Boolean(me?.roles.includes('LEADER'));
  const canManage = canManageTeamRecords(me?.roles ?? []);
  const initials = me?.name?.trim()?.charAt(0)?.toUpperCase() || 'A';
  const navItems = useMemo<NavItem[]>(() => getWorkspaceNavItems(canManage, isAdmin, me?.roles ?? []), [canManage, isAdmin, me?.roles]);
  const activeEmployees = useMemo(() => employees.filter((employee) => employee.active !== false), [employees]);
  const teamMembers = useMemo(() => {
    if (!me) return [];
    if (isAdmin) {
      return activeEmployees
        .filter((employee) => employee.id !== me.id && canViewerSeeEmployee(me, employee))
        .sort((left, right) => {
          return getHighestRolePower(right.roles) - getHighestRolePower(left.roles) || left.name.localeCompare(right.name);
        });
    }
    if (isLeader) {
      return activeEmployees
        .filter((employee) => canViewerSeeEmployee(me, employee))
        .sort((left, right) => left.name.localeCompare(right.name));
    }
    return [];
  }, [activeEmployees, isAdmin, isLeader, me]);
  const unassignedEmployees = useMemo(
    () => activeEmployees.filter((employee) => employee.roles.includes('EMPLOYEE') && getHighestRolePower(employee.roles) === 1 && !employee.leaderId),
    [activeEmployees],
  );
  const openTasks = useMemo(() => tasks.filter((task) => task.status !== 'COMPLETED'), [tasks]);
  const teamMemberIds = useMemo(() => new Set(teamMembers.map((employee) => employee.id)), [teamMembers]);
  const visibleOpenTasks = useMemo(() => {
    if (!me) return [];
    if (isAdmin) return openTasks;
    if (isLeader) return openTasks.filter((task) => task.assignedEmployeeIds.some((id) => teamMemberIds.has(id)));
    return openTasks.filter((task) => task.assignedEmployeeIds.includes(me.id));
  }, [isAdmin, isLeader, me, openTasks, teamMemberIds]);
  const leaderLabel = me?.leaderName && me.leaderActive !== false ? me.leaderName : 'Unassigned';
  const teamCount = isAdmin ? totalEmployees : teamMembers.length;
  const currentWorkCount = isAdmin ? totalOpenTasks : visibleOpenTasks.length;

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
    } catch (reportError) {
      setError(reportError instanceof Error ? reportError.message : 'Unable to trigger reports.');
    }
  }

  return (
    <main className="min-h-screen bg-[#edf2f7] text-slate-900 lg:flex">
      <DashboardSidebar activeSection="overview" navItems={navItems} onClose={() => setSidebarOpen(false)} onSelect={handleSection} open={sidebarOpen} />
      <div className="flex min-w-0 flex-1 flex-col">
        <DashboardTopbar canRunReport={canRunReports(me?.roles ?? [])} initials={initials} userEmail={me?.email ?? ''} userName={me?.name ?? 'Admin'} onLogout={handleLogout} onMenuOpen={() => setSidebarOpen(true)} onRunReport={handleRunReport} subtitle="Task Management System" title="My Account" />

        <section className="px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
          {error ? <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

          <section className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-[0_20px_55px_rgba(15,23,42,0.08)]">
            <div className="relative overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(143,199,64,0.28),_transparent_30%),radial-gradient(circle_at_top_right,_rgba(147,197,253,0.28),_transparent_28%),white] px-5 py-6 sm:px-7 sm:py-8 lg:px-10">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center">
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-[26px] border border-white bg-[#8fc740] text-3xl font-bold text-[#123b76] shadow-[0_18px_38px_rgba(15,23,42,0.14)]">{initials}</div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.36em] text-[#6f9e2c]">Profile</p>
                    <h1 className="mt-2 break-words text-3xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-4xl">{me?.name || 'Account'}</h1>
                    <p className="mt-2 break-all text-sm leading-6 text-slate-600">{me?.email || 'No email added'}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 lg:justify-end">
                  {me?.roles.map((role) => (
                    <span key={role} className="rounded-full border border-[#d8ecbb] bg-[#eef8dc] px-4 py-2 text-sm font-semibold text-[#123b76] shadow-sm">{formatRole(role)}</span>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid gap-4 bg-[#f8faf4] p-5 sm:grid-cols-2 sm:p-6 lg:grid-cols-4 lg:p-8">
              <StatCard label="Status" value={me?.active ? 'Active' : 'Inactive'} helper="Account availability" />
              <StatCard label="Leader" value={leaderLabel} helper={leaderLabel === 'Unassigned' ? 'No active leader assigned' : 'Reporting manager'} />
              <StatCard label="Team" value={teamCount} helper={isLeader || isAdmin ? 'Active mapped employees' : 'Visible to leaders'} />
              <StatCard label="Current Work" value={currentWorkCount} helper="Pending and ongoing tasks only" />
            </div>

            {/* <div className="border-t border-slate-200 bg-white px-5 py-5 sm:px-6 lg:px-8">
              <div className="rounded-[24px] border border-slate-200 bg-[linear-gradient(135deg,#ffffff,#f8faf4)] p-5 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <label className="block text-sm font-bold text-slate-900" htmlFor="profile-leader">
                      Reporting Leader
                    </label>
                    <p className="mt-2 text-sm leading-6 text-slate-500">Only active Admin and Leader users are shown here.</p>
                    <select
                      id="profile-leader"
                      className="mt-3 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-900 shadow-sm outline-none transition focus:border-[#8fc740] focus:ring-4 focus:ring-[#8fc740]/15"
                      value={selectedLeaderId}
                      onChange={(event) => setSelectedLeaderId(event.target.value)}
                    >
                      <option value="">Unassigned</option>
                      {leaderOptions.map((leader) => (
                        <option key={leader.id} value={leader.id}>
                          {leader.name} ({leader.roles.map(formatRoleName).join(', ')})
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    className="h-12 rounded-2xl bg-[#8fc740] px-6 text-sm font-semibold text-[#10233f] shadow-[0_14px_28px_rgba(143,199,64,0.28)] transition hover:-translate-y-0.5 hover:bg-[#7db52f] disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={savingLeader || selectedLeaderId === (me?.leaderId || '')}
                    onClick={handleLeaderSave}
                    type="button"
                  >
                    {savingLeader ? 'Saving...' : 'Save Leader'}
                  </button>
                </div>
              </div>
            </div> */}

            <div className="grid gap-6 border-t border-slate-200 bg-[#f8faf4] p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:p-8">
              <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-950">{isAdmin ? 'Hierarchy Overview' : isLeader ? 'My Team' : 'Reporting Details'}</h2>
                    <p className="mt-1 text-sm text-slate-500">Inactive leaders are hidden and employees become Unassigned.</p>
                  </div>
                  {isAdmin ? <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600">{unassignedEmployees.length} unassigned</span> : null}
                </div>

                <div className="mt-5 space-y-3">
                  {teamMembers.length ? teamMembers.map((employee) => (
                    <div key={employee.id} className="rounded-2xl border border-slate-200 bg-[#fbfcf9] px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-950">{employee.name}</p>
                          <p className="mt-1 break-all text-xs leading-5 text-slate-500">{employee.email || 'No email'}</p>
                          <p className="mt-1 break-all text-xs leading-5 text-slate-500">Leader: {employee.leaderName || 'Unassigned'}</p>
                        </div>
                        <span className="shrink-0 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-[#8fc740]">
                          {employee.roles.includes('LEADER') ? 'Leader' : 'Employee'}
                        </span>
                      </div>
                    </div>
                  )) : <EmptyState message={isLeader ? 'No active employees assigned to you yet.' : 'No team members to show.'} />}
                </div>
              </div>

              <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-950">Current Tasks</h2>
                    <p className="mt-1 text-sm text-slate-500">Completed tasks are hidden here so only active work is shown.</p>
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600">{visibleOpenTasks.length} open</span>
                </div>

                <div className="mt-5 space-y-3">
                  {visibleOpenTasks.length ? visibleOpenTasks.slice(0, 12).map((task) => (
                    <div key={task.id} className="rounded-2xl border border-slate-200 bg-[#fbfcf9] px-4 py-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-950">{task.title}</p>
                          <p className="mt-1 text-xs leading-5 text-slate-500">{task.projectName} | Due: {formatDate(task.dueDate)}</p>
                        </div>
                        <span className={['shrink-0 rounded-full px-3 py-1 text-xs font-semibold', task.status === 'IN_PROGRESS' ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'].join(' ')}>
                          {task.status === 'IN_PROGRESS' ? 'Ongoing' : 'Pending'}
                        </span>
                      </div>
                    </div>
                  )) : <EmptyState message="No current pending or ongoing task found." />}
                </div>
              </div>
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}
