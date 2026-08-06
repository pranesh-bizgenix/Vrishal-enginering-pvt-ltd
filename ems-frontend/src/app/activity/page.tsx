'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getToken } from '../lib/api';
import { clearAuth } from '../lib/auth';
import { getWorkspaceNavItems, routeSection } from '../lib/workspace';
import { canManageTeamRecords, canRunReports, canViewerSeeEmployee, formatRoleName, getHighestRolePower, isAdminRole } from '../lib/hierarchy';
import { DashboardSidebar, DashboardTopbar } from '../../components/DashboardShell';
import { PaginationBar } from '../../components/PaginationBar';
import type { DashboardResponse, Employee, NavItem, NotificationLog, PaginatedResponse, SectionKey } from '../dashboard/types';

function formatDateTime(value: string | null) {
  return value ? new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'Not set';
}

function EmptyState({ message }: { message: string }) {
  return <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">{message}</div>;
}

function extractAssignedPeople(message: string) {
  const assignedLine = message
    .split(/\r?\n/)
    .find((line) => line.trim().toLowerCase().startsWith('assigned:'));

  if (!assignedLine) {
    return '';
  }

  const value = assignedLine.replace(/^assigned:\s*/i, '').trim();
  return value && value.toLowerCase() !== 'none' ? value : '';
}

export default function ActivityPage() {
  const router = useRouter();
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [logs, setLogs] = useState<NotificationLog[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [totalLogs, setTotalLogs] = useState(0);
  const [selectedPersonId, setSelectedPersonId] = useState(() => (typeof window === 'undefined' ? '' : window.localStorage.getItem('ems-dashboard-person-scope') || ''));

  const loadData = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const [dashboardData, employeeData] = await Promise.all([
        api<DashboardResponse>('/dashboard'),
        api<Employee[]>('/employees'),
      ]);
      const currentUser = dashboardData.employee;
      const canViewAllNotifications = currentUser.roles.includes('SA1') || currentUser.roles.includes('SA2');
      const selectableEmployees = canViewAllNotifications
        ? employeeData.filter((employee) => employee.id !== currentUser.id && canViewerSeeEmployee(currentUser, employee))
        : [];
      const safeSelectedPersonId = selectedPersonId && selectableEmployees.some((employee) => employee.id === selectedPersonId)
        ? selectedPersonId
        : '';

      if (selectedPersonId && !safeSelectedPersonId) {
        setSelectedPersonId('');
        window.localStorage.removeItem('ems-dashboard-person-scope');
      }

      const selectedPersonQuery = safeSelectedPersonId ? `&employeeId=${encodeURIComponent(safeSelectedPersonId)}` : '';
      const logData = await api<PaginatedResponse<NotificationLog>>(`/reports/notification-logs?page=${page}&perPage=${perPage}${selectedPersonQuery}`);
      setDashboard(dashboardData);
      setEmployees(employeeData);
      setLogs(logData.items.filter((item) => item.channel === 'WHATSAPP'));
      setTotalLogs(logData.total);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Unable to load activity.';
      setError(message);
      if (message.toLowerCase().includes('unauthorized')) {
        clearAuth();
        router.replace('/auth/login');
      }
    } finally {
      setBusy(false);
    }
  }, [page, perPage, router, selectedPersonId]);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/auth/login');
      return;
    }
    void loadData();
  }, [loadData, router]);

  const me = dashboard?.employee;
  const isAdmin = isAdminRole(me?.roles ?? []);
  const isSuperAdmin = Boolean(me?.roles.includes('SA1') || me?.roles.includes('SA2'));
  const canManage = canManageTeamRecords(me?.roles ?? []);
  const navItems = useMemo<NavItem[]>(() => getWorkspaceNavItems(canManage, isAdmin, me?.roles ?? []), [canManage, isAdmin, me?.roles]);
  const initials = me?.name?.trim()?.charAt(0)?.toUpperCase() || 'A';
  const selectedPerson = useMemo(() => employees.find((employee) => employee.id === selectedPersonId) || null, [employees, selectedPersonId]);
  const scopedRecipientName = selectedPerson?.name || (!isSuperAdmin ? me?.name : '');
  const sidebarPeopleFilter = useMemo(() => {
    if (!me || !isSuperAdmin) {
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
  }, [employees, isSuperAdmin, me]);
  const totalPages = Math.max(1, Math.ceil(totalLogs / perPage));
  useEffect(() => {
    setPage(1);
  }, [perPage]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  useEffect(() => {
    if (selectedPersonId && sidebarPeopleFilter.length > 0 && !sidebarPeopleFilter.some((person) => person.id === selectedPersonId)) {
      setSelectedPersonId('');
      window.localStorage.removeItem('ems-dashboard-person-scope');
    }
  }, [selectedPersonId, sidebarPeopleFilter]);

  function handleSection(section: SectionKey) {
    setSidebarOpen(false);
    routeSection(router, section);
  }

  function handleLogout() {
    clearAuth();
    router.replace('/auth/login');
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

  function formatRecipients(item: NotificationLog) {
    const roles = item.recipientRoles.length ? item.recipientRoles.join(', ') : 'System';
    const sentPerson = scopedRecipientName || extractAssignedPeople(item.message);
    return sentPerson ? `${sentPerson} (${roles})` : roles;
  }

  async function handleRunReport() {
    try {
      await api('/reports/run-scheduled', { method: 'POST' });
      await loadData();
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'Unable to trigger reports.');
    }
  }

  return (
    <main className="min-h-screen bg-[#edf2f7] text-slate-900 lg:flex">
      <DashboardSidebar activeSection="activity" navItems={navItems} onClose={() => setSidebarOpen(false)} onSelect={handleSection} open={sidebarOpen} />
      <div className="flex min-w-0 flex-1 flex-col">
        <DashboardTopbar canRunReport={canRunReports(me?.roles ?? [])} initials={initials} userEmail={me?.email ?? ''} userName={me?.name ?? 'Admin'} onLogout={handleLogout} onMenuOpen={() => setSidebarOpen(true)} onRunReport={handleRunReport} peopleFilter={sidebarPeopleFilter} 
        // peopleFilterTitle={isAdmin ? 'Leaders & Employees' : 'My Employees'} 
        selectedPersonId={selectedPersonId} onSelectPerson={canManage ? handlePersonScopeChange : undefined} subtitle="Task Management System" title="Activity" />
        <section className="px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
          {error ? <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.06)] sm:p-6 lg:p-7">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.3em] text-slate-400">Notification Module</p>
              <h1 className="mt-3 text-3xl font-semibold text-slate-900">Notification Logs</h1>
              <p className="mt-2 text-sm text-slate-500">Task and scheduled report WhatsApp delivery history with sent and failed status.</p>
            </div>
            <div className="mt-6">
              {logs.length ? (
                <div className="space-y-4">
                  {logs.map((item) => (
                    <article key={item.id} className="min-w-0 rounded-[24px] border border-slate-200 bg-white px-4 py-4 sm:px-5">
                      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <span className="min-w-0 break-words font-semibold text-slate-950">{item.category}</span>
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{item.channel}</span>
                          <span className={[
                            'rounded-full px-3 py-1 text-xs font-semibold',
                            item.status === 'SENT' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700',
                          ].join(' ')}>{item.status}</span>
                        </div>
                        <span className="shrink-0 text-xs text-slate-500 sm:text-sm">{formatDateTime(item.createdAt)}</span>
                      </div>
                      <p className="mt-2 break-words text-sm leading-7 text-slate-600">{item.message}</p>
                      <p className="mt-2 break-words text-xs text-slate-500">Recipients: {formatRecipients(item)}</p>
                    </article>
                  ))}
                  <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-4">
                    <PaginationBar
                      busy={busy}
                      itemLabel="Logs"
                      page={page}
                      perPage={perPage}
                      total={totalLogs}
                      totalPages={totalPages}
                      pageSizeOptions={[10, 25, 50, 100]}
                      onPageChange={setPage}
                      onPerPageChange={setPerPage}
                    />
                  </div>
                </div>
              ) : <EmptyState message="No notification logs yet." />}
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}
