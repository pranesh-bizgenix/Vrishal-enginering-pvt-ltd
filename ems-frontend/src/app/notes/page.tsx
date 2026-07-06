'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getToken } from '../lib/api';
import { clearAuth } from '../lib/auth';
import { getWorkspaceNavItems, routeSection } from '../lib/workspace';
import { canManageTeamRecords, isAdminRole } from '../lib/hierarchy';
import { DashboardSidebar, DashboardTopbar } from '../../components/DashboardShell';
import { PaginationBar } from '../../components/PaginationBar';
import type { DashboardResponse, NavItem, PaginatedResponse, SectionKey, TaskNoteHistoryRow } from '../dashboard/types';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
}

function EmptyState({ message }: { message: string }) {
  return <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">{message}</div>;
}

export default function NotesPage() {
  const router = useRouter();
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [noteRows, setNoteRows] = useState<TaskNoteHistoryRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [totalNotes, setTotalNotes] = useState(0);

  const loadData = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const [dashboardData, taskData] = await Promise.all([
        api<DashboardResponse>('/dashboard'),
        api<PaginatedResponse<TaskNoteHistoryRow>>(`/tasks/notes-history?page=${page}&perPage=${perPage}`),
      ]);
      setDashboard(dashboardData);
      setNoteRows(taskData.items);
      setTotalNotes(taskData.total);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Unable to load notes.';
      setError(message);
      if (message.toLowerCase().includes('unauthorized')) {
        clearAuth();
        router.replace('/auth/login');
      }
    } finally {
      setBusy(false);
    }
  }, [page, perPage, router]);

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

  const totalPages = Math.max(1, Math.ceil(totalNotes / perPage));
  useEffect(() => {
    setPage(1);
  }, [perPage]);

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

  async function handleRunReport() {
    try {
      await api('/reports/run-scheduled', { method: 'POST' });
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'Unable to trigger reports.');
    }
  }

  return (
    <main className="min-h-screen bg-[#edf2f7] text-slate-900 lg:flex">
      <DashboardSidebar activeSection="notes" navItems={navItems} onClose={() => setSidebarOpen(false)} onSelect={handleSection} open={sidebarOpen} />
      <div className="flex min-w-0 flex-1 flex-col">
        <DashboardTopbar canRunReport={isAdmin} initials={initials} userEmail={me?.email ?? ''} userName={me?.name ?? 'Admin'} onLogout={handleLogout} onMenuOpen={() => setSidebarOpen(true)} onRunReport={handleRunReport} subtitle="Task Management System" title="Notes" />
        <section className="px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
          {error ? <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.06)] sm:p-6 lg:p-7">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-4">
                <button
                  onClick={() => router.push('/tasks')}
                  className="mt-1 rounded-full border border-gray-300 p-2 transition hover:bg-gray-100"
                  type="button"
                >
                  <ArrowLeftIcon className="h-5 w-5 text-gray-700" />
                </button>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                    Notes Module
                  </p>
                  <h1 className="mt-1 text-2xl sm:text-3xl font-semibold text-slate-900">
                    Task Notes History
                  </h1>
                  <p className="mt-1 text-sm text-slate-500 max-w-xl">
                    Track note updates, timestamps, and who made each task change.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => router.push('/tasks')}
                className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Back to Tasks
              </button>
            </div>
            <div className="mt-6">
              {noteRows.length ? (
                <div className="overflow-hidden rounded-[24px] border border-slate-200">
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200 text-sm">
                      <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.2em] text-slate-500">
                        <tr>
                          <th className="px-4 py-4 font-semibold">Task</th>
                          <th className="px-4 py-4 font-semibold">Project</th>
                          <th className="px-4 py-4 font-semibold">Note</th>
                          <th className="px-4 py-4 font-semibold">Updated By</th>
                          <th className="px-4 py-4 font-semibold">Timestamp</th>
                          <th className="px-4 py-4 font-semibold">State</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 bg-white">
                        {noteRows.map(({ taskId, taskTitle, projectName, taskStatus, note }) => (
                          <tr key={note.id} className="align-top">
                            <td className="px-4 py-4">
                              <button className="text-left font-semibold text-slate-900 transition hover:text-blue-600" onClick={() => router.push(`/tasks/${taskId}/edit`)} type="button">
                                {taskTitle}
                              </button>
                            </td>
                            <td className="px-4 py-4 text-slate-700">{projectName}</td>
                            <td className="px-4 py-4 text-slate-700">{note.message}</td>
                            <td className="px-4 py-4 text-slate-700">{note.createdByName}</td>
                            <td className="px-4 py-4 text-slate-700">{formatDateTime(note.createdAt)}</td>
                            <td className="px-4 py-4">
                              <span className={[ 'inline-flex rounded-full px-3 py-1 text-xs font-semibold', note.markDone || taskStatus === 'COMPLETED' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700' ].join(' ')}>
                                {note.markDone || taskStatus === 'COMPLETED' ? 'Done Update' : 'Open Update'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="border-t border-slate-200 bg-slate-50 p-4">
                    <PaginationBar
                      busy={busy}
                      itemLabel="Notes"
                      page={page}
                      perPage={perPage}
                      total={totalNotes}
                      totalPages={totalPages}
                      pageSizeOptions={[10, 25, 50, 100]}
                      onPageChange={setPage}
                      onPerPageChange={setPerPage}
                    />
                  </div>
                </div>
              ) : <EmptyState message="No task notes are available yet." />}
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}
