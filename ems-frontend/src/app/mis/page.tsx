'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getToken } from '../lib/api';
import { clearAuth } from '../lib/auth';
import { getWorkspaceNavItems, routeSection } from '../lib/workspace';
import { canManageTeamRecords, canRunReports, getDirectLeaderEmployeeIds, getEmployeeScopeIds, isAdminRole, itemMatchesEmployeeScope } from '../lib/hierarchy';
import { DashboardSidebar, DashboardTopbar } from '../../components/DashboardShell';
import type { DashboardResponse, DailyPendingSummary, Employee, MisSummary, NavItem, NotificationLog, Project, SectionKey, Task } from '../dashboard/types';

function EmptyState({ message }: { message: string }) {
  return <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">{message}</div>;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
}

type MisPeriod = 'all' | 'day' | 'week' | 'month';
type EmployeeMisReportRow = {
  employee: Employee;
  assignedProjects: Project[];
  assignedTasks: Task[];
  doneTasks: Task[];
  pendingTasks: Task[];
  ongoingTasks: Task[];
  beforeDueTasks: Task[];
  afterDueTasks: Task[];
};

function getIsoWeekKey(value: string | null | undefined) {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const normalized = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = normalized.getUTCDay() || 7;
  normalized.setUTCDate(normalized.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(normalized.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((normalized.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${normalized.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function getCurrentPeriodValue(period: MisPeriod) {
  const now = new Date();
  if (period === 'day') {
    return now.toISOString().slice(0, 10);
  }

  if (period === 'month') {
    return now.toISOString().slice(0, 7);
  }

  if (period === 'week') {
    return getIsoWeekKey(now.toISOString());
  }

  return '';
}

function dateMatchesPeriod(value: string | null | undefined, period: MisPeriod, periodValue: string) {
  if (period === 'all') {
    return true;
  }

  if (!value || !periodValue) {
    return false;
  }

  if (period === 'day') {
    return value.slice(0, 10) === periodValue;
  }

  if (period === 'month') {
    return value.slice(0, 7) === periodValue;
  }

  return getIsoWeekKey(value) === periodValue;
}

function taskMatchesPeriod(task: Task, period: MisPeriod, periodValue: string) {
  return dateMatchesPeriod(task.dueDate || task.createdAt, period, periodValue);
}

function getTaskCompletedAt(task: Task) {
  return [...(task.notes || [])]
    .filter((note) => note.markDone)
    .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())[0]?.createdAt || null;
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return 'Not set';
  }

  return new Date(value).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });
}

function formatReportLabel(value: string) {
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function getTaskMetaParts(task: Task) {
  const parts: string[] = [];
  if (task.qualityRating) {
    parts.push(`Quality: ${formatReportLabel(task.qualityRating)}`);
  }
  if (task.ncItems?.length) {
    parts.push(`NC Count: ${task.ncItems.length}`);
  }
  if (task.status !== 'COMPLETED' && task.dueDate && new Date(task.dueDate).getTime() < Date.now()) {
    parts.push('Delay: Overdue');
  }
  return parts;
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function joinTaskNames(tasks: Task[]) {
  return tasks.length
    ? tasks
        .map((task) => {
          const title = task.title?.trim() || 'Untitled task';
          const projectName = task.projectName?.trim();
          const baseName = projectName ? `${title} (${projectName})` : title;
          const meta = getTaskMetaParts(task);
          return meta.length ? `${baseName} [${meta.join(' | ')}]` : baseName;
        })
        .join(', ')
    : '-';
}

function formatTaskName(task: Task) {
  const title = task.title?.trim() || 'Untitled task';
  const projectName = task.projectName?.trim();
  const baseName = projectName ? `${title} | ${projectName}` : title;
  const meta = getTaskMetaParts(task);
  return meta.length ? `${baseName} | ${meta.join(' | ')}` : baseName;
}

function formatProjectName(project: Project) {
  return project.name?.trim() || 'Untitled project';
}



function getPeriodLabel(period: MisPeriod, periodValue: string) {
  if (period === 'all') {
    return 'All Time';
  }

  if (!periodValue) {
    return 'No period selected';
  }

  if (period === 'day') {
    return `Day Wise: ${periodValue}`;
  }

  if (period === 'week') {
    return `Week Wise: ${periodValue}`;
  }

  return `Month Wise: ${periodValue}`;
}

function sanitizePdfText(value: unknown) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .replace(/[^\x20-\x7E]/g, ' ')
    .trim();
}

function escapePdfText(value: unknown) {
  return sanitizePdfText(value)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function wrapPdfText(value: unknown, maxLength: number) {
  const words = sanitizePdfText(value).split(' ').filter(Boolean);
  const lines: string[] = [];
  let current = '';

  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxLength && current) {
      lines.push(current);
      current = word;
      return;
    }
    current = next;
  });

  if (current) {
    lines.push(current);
  }

  return lines.length ? lines : ['-'];
}

function createEmployeeMisPdf(rows: EmployeeMisReportRow[], periodLabel: string, generatedAt: string) {
  const pageWidth = 595;
  const pageHeight = 842;
  const margin = 40;
  const bottomMargin = 40;
  const lineHeight = 14;
  let y = pageHeight - margin;
  const pages: string[] = [];
  let content = '';

  function pushPage() {
    pages.push(content);
    content = '';
    y = pageHeight - margin;
  }

  function ensureSpace(height: number) {
    if (y - height < bottomMargin) {
      pushPage();
    }
  }

  function color(hex: string) {
    const value = hex.replace('#', '');
    const red = parseInt(value.slice(0, 2), 16) / 255;
    const green = parseInt(value.slice(2, 4), 16) / 255;
    const blue = parseInt(value.slice(4, 6), 16) / 255;
    return `${red.toFixed(3)} ${green.toFixed(3)} ${blue.toFixed(3)}`;
  }

  function rect(x: number, top: number, width: number, height: number, fill = '#ffffff', stroke = '#cbd5e1') {
    const bottom = top - height;
    content += `q ${color(fill)} rg ${color(stroke)} RG ${x} ${bottom} ${width} ${height} re B Q\n`;
  }

  function text(value: unknown, x: number, size = 10, fill = '#0f172a') {
    content += `BT ${color(fill)} rg /F1 ${size} Tf ${x} ${y} Td (${escapePdfText(value)}) Tj ET\n`;
  }

  function textAt(value: unknown, x: number, top: number, size = 10, fill = '#0f172a') {
    content += `BT ${color(fill)} rg /F1 ${size} Tf ${x} ${top} Td (${escapePdfText(value)}) Tj ET\n`;
  }

  function line(value: unknown, size = 10, x = margin, gap = lineHeight, fill = '#0f172a') {
    ensureSpace(gap + 4);
    text(value, x, size, fill);
    y -= gap;
  }

  function listLines(items: string[], emptyMessage: string) {
    if (!items.length) {
      return [emptyMessage];
    }

    return items.flatMap((item) => wrapPdfText(`- ${item}`, 94));
  }

  function sectionBlock(title: string, lines: string[]) {
    const maxLinesPerBlock = 13;
    const chunks: string[][] = [];
    for (let index = 0; index < lines.length; index += maxLinesPerBlock) {
      chunks.push(lines.slice(index, index + maxLinesPerBlock));
    }

    chunks.forEach((chunk, index) => {
      const titleText = index ? `${title} (continued)` : title;
      const blockHeight = 34 + chunk.length * 12;
      ensureSpace(blockHeight + 8);
      const top = y + 2;
      rect(margin, top, pageWidth - margin * 2, blockHeight, '#ffffff', '#dbe3ee');
      rect(margin, top, pageWidth - margin * 2, 22, '#f1f5f9', '#dbe3ee');
      textAt(titleText, margin + 10, top - 15, 9, '#334155');
      let lineY = top - 37;
      chunk.forEach((item) => {
        textAt(item, margin + 14, lineY, 8.5, item === 'No tasks' || item === 'No projects' ? '#94a3b8' : '#334155');
        lineY -= 12;
      });
      y -= blockHeight + 9;
    });
  }

  const totalAssigned = rows.reduce((sum, row) => sum + row.assignedTasks.length, 0);
  const totalDone = rows.reduce((sum, row) => sum + row.doneTasks.length, 0);
  const totalPending = rows.reduce((sum, row) => sum + row.pendingTasks.length, 0);
  const totalOngoing = rows.reduce((sum, row) => sum + row.ongoingTasks.length, 0);
  const totalBeforeDue = rows.reduce((sum, row) => sum + row.beforeDueTasks.length, 0);
  const totalAfterDue = rows.reduce((sum, row) => sum + row.afterDueTasks.length, 0);
  const topPerformers = [...rows]
    .sort((left, right) => right.beforeDueTasks.length - left.beforeDueTasks.length || right.doneTasks.length - left.doneTasks.length || left.employee.name.localeCompare(right.employee.name))
    .slice(0, 5);

  const headerTop = y + 16;
  rect(margin, headerTop, pageWidth - margin * 2, 96, '#eff6ff', '#bfdbfe');
  textAt('MIS MODULE', margin + 14, headerTop - 31, 8, '#2563eb');
  textAt('Employee Wise MIS Report', margin + 14, headerTop - 50, 19, '#0f172a');
  textAt(`Period: ${periodLabel}`, margin + 14, headerTop - 69, 10, '#475569');
  textAt(`Generated: ${generatedAt}`, margin + 14, headerTop - 84, 10, '#475569');
  y = headerTop - 116;

  const summaryTop = y;
  const summaryGap = 8;
  const summaryWidth = (pageWidth - margin * 2 - summaryGap * 5) / 6;
  [
    ['Employees', rows.length],
    ['Assigned', totalAssigned],
    ['Done', totalDone],
    ['Pending', totalPending],
    ['Ongoing', totalOngoing],
    ['Before / After', `${totalBeforeDue}/${totalAfterDue}`],
  ].forEach(([label, value], index) => {
    const x = margin + index * (summaryWidth + summaryGap);
    rect(x, summaryTop, summaryWidth, 50, '#f8fafc', '#e2e8f0');
    textAt(value, x + 10, summaryTop - 20, 16, '#0f172a');
    textAt(label, x + 10, summaryTop - 38, 8, '#64748b');
  });
  y -= 64;

  if (topPerformers.length) {
    const topPerformerTop = y;
    const blockHeight = 34 + topPerformers.length * 16;
    ensureSpace(blockHeight + 12);
    rect(margin, topPerformerTop, pageWidth - margin * 2, blockHeight, '#ffffff', '#dbe3ee');
    rect(margin, topPerformerTop, pageWidth - margin * 2, 24, '#f1f5f9', '#dbe3ee');
    textAt('Top Performers', margin + 10, topPerformerTop - 16, 10, '#0f172a');
    textAt('Team members who completed the most tasks on time', margin + 128, topPerformerTop - 16, 8, '#64748b');
    topPerformers.forEach((row, index) => {
      const lineY = topPerformerTop - 42 - index * 16;
      textAt(`${index + 1}. ${row.employee.name}`, margin + 14, lineY, 9, '#334155');
      textAt(`${row.beforeDueTasks.length} on time | ${row.doneTasks.length} done`, pageWidth - margin - 150, lineY, 9, '#2563eb');
    });
    y -= blockHeight + 14;
  }

  if (!rows.length) {
    rect(margin, y + 4, pageWidth - margin * 2, 46, '#f8fafc', '#cbd5e1');
    y -= 22;
    line('No employee MIS data available for this period.', 12, margin + 14, 16, '#64748b');
  }

  rows.forEach((row, index) => {
    ensureSpace(230);
    const employeeTop = y + 4;
    rect(margin, employeeTop, pageWidth - margin * 2, 106, '#ffffff', '#cbd5e1');
    rect(margin, employeeTop, pageWidth - margin * 2, 46, '#ffffff', '#e2e8f0');
    textAt(`${index + 1}. ${row.employee.name}`, margin + 14, employeeTop - 24, 14, '#0f172a');
    textAt(row.employee.email || 'No email', margin + 14, employeeTop - 40, 9, '#64748b');

    const metricTop = employeeTop - 58;
    const metricGap = 6;
    const metricWidth = (pageWidth - margin * 2 - 28 - metricGap * 6) / 7;
    [
      ['Projects', row.assignedProjects.length],
      ['Assigned', row.assignedTasks.length],
      ['Done', row.doneTasks.length],
      ['Pending', row.pendingTasks.length],
      ['Ongoing', row.ongoingTasks.length],
      ['Before Due', row.beforeDueTasks.length],
      ['After Due', row.afterDueTasks.length],
    ].forEach(([label, value], metricIndex) => {
      const x = margin + 14 + metricIndex * (metricWidth + metricGap);
      rect(x, metricTop, metricWidth, 34, '#f8fafc', '#e2e8f0');
      textAt(value, x + 7, metricTop - 14, 12, '#0f172a');
      textAt(label, x + 7, metricTop - 28, 7, '#64748b');
    });
    y = employeeTop - 122;

    sectionBlock(
      'Assigned Projects',
      listLines(row.assignedProjects.map((project) => `${formatProjectName(project)} | Due: ${formatDate(project.dueDate)}`), 'No projects'),
    );
    sectionBlock(
      'Pending Tasks',
      listLines(row.pendingTasks.map((task) => `${formatTaskName(task)} | Due: ${formatDate(task.dueDate)}`), 'No tasks'),
    );
    sectionBlock(
      'Ongoing Tasks',
      listLines(row.ongoingTasks.map((task) => `${formatTaskName(task)} | Due: ${formatDate(task.dueDate)}`), 'No tasks'),
    );
    sectionBlock(
      'Done Before Due Date',
      listLines(row.beforeDueTasks.map((task) => `${formatTaskName(task)} | Due: ${formatDate(task.dueDate)} | Done: ${formatDate(getTaskCompletedAt(task))}`), 'No tasks'),
    );
    sectionBlock(
      'Done After Due Date',
      listLines(row.afterDueTasks.map((task) => `${formatTaskName(task)} | Due: ${formatDate(task.dueDate)} | Done: ${formatDate(getTaskCompletedAt(task))}`), 'No tasks'),
    );
    sectionBlock(
      'All Done Tasks',
      listLines(row.doneTasks.map((task) => `${formatTaskName(task)} | Done: ${formatDate(getTaskCompletedAt(task))}`), 'No tasks'),
    );
    y -= 10;
  });

  if (content) {
    pushPage();
  }

  const objects: string[] = [];
  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  const pageObjectIds = pages.map((_, index) => 4 + index * 2);
  objects.push(`<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`);
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  pages.forEach((pageContent, index) => {
    const pageObjectId = 4 + index * 2;
    const contentObjectId = pageObjectId + 1;
    const pageFooter = `BT ${color('#64748b')} rg /F1 8 Tf ${pageWidth - margin - 62} 24 Td (Page ${index + 1} of ${pages.length}) Tj ET\n`;
    const decoratedContent = `${pageContent}${pageFooter}`;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObjectId} 0 R >>`);
    objects.push(`<< /Length ${decoratedContent.length} >>\nstream\n${decoratedContent}endstream`);
  });

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return new Blob([pdf], { type: 'application/pdf' });
}

export default function MisPage() {
  const router = useRouter();
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [misSummary, setMisSummary] = useState<MisSummary | null>(null);
  const [dailySummary, setDailySummary] = useState<DailyPendingSummary | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [error, setError] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [period, setPeriod] = useState<MisPeriod>('all');
  const [periodValue, setPeriodValue] = useState('');
  const [selectedPersonId, setSelectedPersonId] = useState(() => (typeof window === 'undefined' ? '' : window.localStorage.getItem('ems-dashboard-person-scope') || ''));
  const [loadedAt, setLoadedAt] = useState(0);

  const loadData = useCallback(async () => {
    setError('');
    try {
      const [dashboardData, misData, dailyData, taskData, projectData, employeeData] = await Promise.all([
        api<DashboardResponse>('/dashboard'),
        api<MisSummary>('/reports/mis-summary'),
        api<DailyPendingSummary>('/reports/daily-summary'),
        api<Task[]>('/tasks'),
        api<Project[]>('/projects'),
        api<Employee[]>('/employees'),
      ]);
      setDashboard(dashboardData);
      setMisSummary(misData);
      setDailySummary(dailyData);
      setTasks(taskData);
      setProjects(projectData);
      setEmployees(employeeData);
      setLoadedAt(Date.now());
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Unable to load MIS.';
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
  const navItems: NavItem[] = getWorkspaceNavItems(canManage, isAdmin, me?.roles ?? []);
  const initials = me?.name?.trim()?.charAt(0)?.toUpperCase() || 'A';
  const leaderEmployeeIds = useMemo(() => getDirectLeaderEmployeeIds(employees, me?.id), [employees, me?.id]);
  const selectedPerson = useMemo(() => employees.find((employee) => employee.id === selectedPersonId) || null, [employees, selectedPersonId]);
  const selectedScopeEmployeeIds = useMemo(() => {
    if (selectedPerson) {
      return getEmployeeScopeIds(employees, selectedPerson);
    }

    if (me && !isAdmin) {
      return new Set([me.id]);
    }

    return null;
  }, [employees, isAdmin, me, selectedPerson]);
  const sidebarPeopleFilter = useMemo(() => {
    if (!me || (!isAdmin && !isLeader)) {
      return [];
    }

    const people = isAdmin
      ? employees.filter((employee) => employee.id !== me.id)
      : employees.filter((employee) => leaderEmployeeIds.has(employee.id));

    return people
      .sort((left, right) => {
        const leftRank = left.roles.includes('LEADER') ? 0 : 1;
        const rightRank = right.roles.includes('LEADER') ? 0 : 1;
        return leftRank - rightRank || left.name.localeCompare(right.name);
      })
      .map((employee) => ({
        id: employee.id,
        name: employee.name,
        roleLabel: employee.roles.includes('LEADER') ? 'Leader Team' : 'Employee',
        leaderName: employee.leaderName || 'Unassigned',
        projectCount: employee.currentProjectIds?.length ?? 0,
        taskCount: 0,
      }));
  }, [employees, isAdmin, isLeader, leaderEmployeeIds, me]);
  useEffect(() => {
    if (!me || !selectedPersonId) {
      return;
    }

    if (!sidebarPeopleFilter.some((person) => person.id === selectedPersonId)) {
      setSelectedPersonId('');
      window.localStorage.removeItem('ems-dashboard-person-scope');
    }
  }, [me, selectedPersonId, sidebarPeopleFilter]);
  const filteredProjects = useMemo(
    () =>
      projects
        .filter((project) => project.projectStatus !== 'COMPLETED')
        .filter((project) => dateMatchesPeriod(project.dueDate || null, period, periodValue) || period === 'all')
        .filter((project) => selectedScopeEmployeeIds ? itemMatchesEmployeeScope(project.assignedEmployeeIds, selectedScopeEmployeeIds) : true),
    [period, periodValue, projects, selectedScopeEmployeeIds],
  );
  const filteredProjectIds = useMemo(() => new Set(filteredProjects.map((project) => project.id)), [filteredProjects]);
  const filteredTasks = useMemo(
    () =>
      tasks
        .filter((task) => taskMatchesPeriod(task, period, periodValue))
        .filter((task) => selectedScopeEmployeeIds ? itemMatchesEmployeeScope(task.assignedEmployeeIds, selectedScopeEmployeeIds) : true)
        .filter((task) => task.projectId ? filteredProjectIds.has(task.projectId) : true),
    [filteredProjectIds, period, periodValue, selectedScopeEmployeeIds, tasks],
  );
  const activeProjectsCount = useMemo(
    () => filteredProjects.filter((project) => project.active && project.projectStatus !== 'COMPLETED').length,
    [filteredProjects],
  );
  const stageBreakdown = useMemo(
    () => ({
      pending: filteredTasks.filter((task) => task.status === 'PENDING').length,
      inProgress: filteredTasks.filter((task) => task.status === 'IN_PROGRESS').length,
      completed: filteredTasks.filter((task) => task.status === 'COMPLETED').length,
    }),
    [filteredTasks],
  );
  const filteredOverdueProjects = useMemo(() => {
    const now = loadedAt;
    return filteredProjects
      .map((project) => ({
        id: project.id,
        name: project.name,
        dueDate: project.dueDate,
        pendingTasks: filteredTasks.filter((task) => task.projectId === project.id && task.status !== 'COMPLETED').length,
      }))
      .filter((project) => project.dueDate && new Date(project.dueDate).getTime() < now && project.pendingTasks > 0);
  }, [filteredProjects, filteredTasks, loadedAt]);
  const visibleDailyProjects = useMemo(
    () =>
      filteredProjects
        .map((project) => ({
          projectId: project.id,
          projectName: project.name,
          pendingTasks: filteredTasks.filter((task) => task.projectId === project.id && task.status !== 'COMPLETED').length,
        }))
        .filter((project) => project.pendingTasks > 0),
    [filteredProjects, filteredTasks],
  );
  const employeeReportRows = useMemo(() => {
    return (misSummary?.employeeTaskBreakdown || [])
      .filter((row) => selectedScopeEmployeeIds ? selectedScopeEmployeeIds.has(row.employeeId) : true)
      .filter((row) => row.employeeName.trim().toLowerCase() !== 'admin')
      .map((row) => {
        const employeeRecord = employees.find((employee) => employee.id === row.employeeId);
        return {
          row,
          employee: {
          id: row.employeeId,
          name: row.employeeName,
          email: row.employeeEmail || '',
          phone: '',
          roles: employeeRecord?.roles || ['EMPLOYEE'],
          active: true,
          currentProjectIds: [],
          projectHistoryIds: [],
          leaderId: null,
          leaderName: null,
          leaderActive: null,
        } as Employee,
        };
      })
      .filter(({ employee }) => !employee.roles.some((role) => role === 'SA1' || role === 'SA2'))
      .map(({ row, employee }) => ({
        employee,
        assignedProjects: filteredProjects.filter((project) => project.assignedEmployeeIds.includes(row.employeeId)),
        assignedTasks: filteredTasks.filter((task) => task.assignedEmployeeIds.includes(row.employeeId)),
        doneTasks: filteredTasks.filter((task) => task.assignedEmployeeIds.includes(row.employeeId) && task.status === 'COMPLETED'),
        pendingTasks: filteredTasks.filter((task) => task.assignedEmployeeIds.includes(row.employeeId) && task.status === 'PENDING'),
        ongoingTasks: filteredTasks.filter((task) => task.assignedEmployeeIds.includes(row.employeeId) && task.status === 'IN_PROGRESS'),
        beforeDueTasks: filteredTasks.filter((task) => {
          if (!task.assignedEmployeeIds.includes(row.employeeId) || task.status !== 'COMPLETED' || !task.dueDate) {
            return false;
          }

          const completedAt = getTaskCompletedAt(task);
          return Boolean(completedAt && new Date(completedAt).getTime() <= new Date(task.dueDate).getTime());
        }),
        afterDueTasks: filteredTasks.filter((task) => {
          if (!task.assignedEmployeeIds.includes(row.employeeId) || task.status !== 'COMPLETED' || !task.dueDate) {
            return false;
          }

          const completedAt = getTaskCompletedAt(task);
          return Boolean(completedAt && new Date(completedAt).getTime() > new Date(task.dueDate).getTime());
        }),
      }));
  }, [employees, filteredProjects, filteredTasks, misSummary?.employeeTaskBreakdown, selectedScopeEmployeeIds]);
  const projectTrackingRows = useMemo(() => {
    return filteredProjects
      .map((project) => {
        const projectTasks = filteredTasks.filter((task) => task.projectId === project.id);
        const pending = projectTasks.filter((task) => task.status === 'PENDING').length;
        const completed = projectTasks.filter((task) => task.status === 'COMPLETED').length;
        const ongoing = projectTasks.filter((task) => task.status === 'IN_PROGRESS').length;
        const overdue = filteredOverdueProjects.find((item) => item.id === project.id)?.pendingTasks || 0;
        return {
          project,
          total: pending + completed + ongoing,
          completed,
          pending,
          ongoing,
          overdue,
          completionRate: projectTasks.length ? Math.round((completed / projectTasks.length) * 100) : 0,
        };
      })
      .filter((row) => row.total > 0)
      .sort((left, right) => right.overdue - left.overdue || right.pending + right.ongoing - (left.pending + left.ongoing) || left.project.name.localeCompare(right.project.name));
  }, [filteredOverdueProjects, filteredProjects, filteredTasks]);
  const projectHealth = useMemo(
    () => ({
      total: projectTrackingRows.length,
      active: projectTrackingRows.filter((row) => row.project.active && row.project.projectStatus !== 'COMPLETED').length,
      completed: projectTrackingRows.filter((row) => row.project.projectStatus === 'COMPLETED').length,
      atRisk: projectTrackingRows.filter((row) => row.overdue > 0).length,
    }),
    [projectTrackingRows],
  );
  const maxProjectTaskCount = Math.max(1, ...projectTrackingRows.map((row) => row.total));
  const personalTasks = useMemo(() => {
    const focusEmployeeId = selectedPerson?.id || me?.id;
    if (!focusEmployeeId) {
      return [];
    }

    return filteredTasks
      .filter((task) => task.assignedEmployeeIds.includes(focusEmployeeId))
      .sort((left, right) => {
        const leftTime = left.dueDate ? new Date(left.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
        const rightTime = right.dueDate ? new Date(right.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
        return leftTime - rightTime || left.title.localeCompare(right.title);
      });
  }, [filteredTasks, me?.id, selectedPerson?.id]);
  const isSystemAdminUser = Boolean(me && (me.email?.trim().toLowerCase() === 'admin@sjsangath.com' || me.name?.trim().toLowerCase() === 'admin'));
  const recentNotifications = useMemo(() => {
    const periodNotifications = (dashboard?.recentNotifications || []).filter((notification) => dateMatchesPeriod(notification.createdAt, period, periodValue));
    if ((isSystemAdminUser && !selectedPerson) || !me) {
      return periodNotifications;
    }

    const assignedTerms = personalTasks.flatMap((task) => [task.title, task.projectName]).map((value) => value.trim().toLowerCase()).filter(Boolean);
    return periodNotifications.filter((notification) => {
      const message = notification.message.toLowerCase();
      const roleMatch = notification.recipientRoles.some((role) => me.roles.some((employeeRole) => employeeRole === role));
      const taskMatch = assignedTerms.some((term) => message.includes(term));
      return roleMatch || taskMatch;
    });
  }, [dashboard?.recentNotifications, isSystemAdminUser, me, period, periodValue, personalTasks, selectedPerson]);

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
      await loadData();
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'Unable to trigger reports.');
    }
  }

  function handlePeriodChange(nextPeriod: MisPeriod) {
    setPeriod(nextPeriod);
    setPeriodValue(getCurrentPeriodValue(nextPeriod));
  }

  function handlePersonScopeChange(employeeId: string) {
    setSelectedPersonId(employeeId);
    if (employeeId) {
      window.localStorage.setItem('ems-dashboard-person-scope', employeeId);
    } else {
      window.localStorage.removeItem('ems-dashboard-person-scope');
    }
  }

  function downloadEmployeeExcel() {
    const rows = employeeReportRows.map((row) => [
      row.employee.name,
      row.employee.email,
      row.assignedProjects.length,
      row.assignedProjects.map((project) => project.name?.trim()).filter(Boolean).join(', ') || '-',
      row.assignedTasks.length,
      row.doneTasks.length,
      row.pendingTasks.length,
      row.ongoingTasks.length,
      row.beforeDueTasks.length,
      joinTaskNames(row.beforeDueTasks),
      row.afterDueTasks.length,
      joinTaskNames(row.afterDueTasks),
      joinTaskNames(row.pendingTasks),
      joinTaskNames(row.ongoingTasks),
      joinTaskNames(row.doneTasks),
    ]);
    const headings = [
      'Employee',
      'Email',
      'Assigned Project Count',
      'Assigned Projects',
      'Assigned Task Count',
      'Done Task Count',
      'Pending Task Count',
      'Ongoing Task Count',
      'Done Before Due Date Count',
      'Done Before Due Date Tasks',
      'Done After Due Date Count',
      'Done After Due Date Tasks',
      'Pending Task List',
      'Ongoing Task List',
      'Done Task List',
    ];
    const html = `
      <html>
        <head>
          <meta charset="utf-8" />
        </head>
        <body>
          <table border="1">
            <thead>
              <tr>${headings.map((heading) => `<th>${escapeHtml(heading)}</th>`).join('')}</tr>
            </thead>
            <tbody>
              ${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}
            </tbody>
          </table>
        </body>
      </html>
    `;
    const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const suffix = period === 'all' ? 'all-time' : `${period}-${periodValue}`;
    link.href = url;
    link.download = `employee-wise-mis-${suffix}.xls`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function downloadEmployeePdfReport() {
    const generatedAt = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    const periodLabel = getPeriodLabel(period, periodValue);
    const blob = createEmployeeMisPdf(employeeReportRows, periodLabel, generatedAt);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const suffix = period === 'all' ? 'all-time' : `${period}-${periodValue}`;
    link.href = url;
    link.download = `employee-wise-mis-${suffix}.pdf`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="min-h-screen bg-[#edf2f7] text-slate-900 lg:flex">
      <DashboardSidebar activeSection="mis" navItems={navItems} onClose={() => setSidebarOpen(false)} onSelect={handleSection} open={sidebarOpen} peopleFilter={sidebarPeopleFilter} 
      // peopleFilterTitle={isAdmin ? 'Leaders & Employees' : 'My Employees'} 
      selectedPersonId={selectedPersonId} onSelectPerson={handlePersonScopeChange} />
      <div className="flex min-w-0 flex-1 flex-col">
        <DashboardTopbar canRunReport={canRunReports(me?.roles ?? [])} initials={initials} userEmail={me?.email ?? ''} userName={me?.name ?? 'Admin'} onLogout={handleLogout} onMenuOpen={() => setSidebarOpen(true)} onRunReport={handleRunReport} peopleFilter={sidebarPeopleFilter} 
        // peopleFilterTitle={isAdmin ? 'Leaders & Employees' : 'My Employees'} 
        selectedPersonId={selectedPersonId} onSelectPerson={handlePersonScopeChange} subtitle="Task Management System" title="MIS" />
        <section className="px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
          {error ? <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.06)] sm:p-6 lg:p-7">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.3em] text-slate-400">MIS Module</p>
                <h1 className="mt-3 text-3xl font-semibold text-slate-900">MIS Snapshot</h1>
                <p className="mt-2 text-sm text-slate-500">Filtered MIS summary and employee-wise work report.</p>
              </div>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                <select
                  className="h-11 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 sm:w-[150px]"
                  onChange={(event) => handlePeriodChange(event.target.value as MisPeriod)}
                  value={period}
                >
                  <option value="all">All Time</option>
                  <option value="day">Day Wise</option>
                  <option value="week">Week Wise</option>
                  <option value="month">Month Wise</option>
                </select>
                {period !== 'all' ? (
                  <input
                    className="h-11 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 sm:w-[180px]"
                    onChange={(event) => setPeriodValue(event.target.value)}
                    type={period === 'day' ? 'date' : period === 'week' ? 'week' : 'month'}
                    value={periodValue}
                  />
                ) : null}
                <button
                  type="button"
                  onClick={downloadEmployeeExcel}
                  className="h-11 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700"
                >
                  Download Excel
                </button>
                <button
                  type="button"
                  onClick={downloadEmployeePdfReport}
                  className="h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Pdf Report
                </button>
              </div>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl bg-slate-100 p-5"><p className="text-sm text-slate-500">Active Projects</p><p className="mt-2 text-3xl font-semibold text-slate-950">{activeProjectsCount}</p></div>
              <div className="rounded-2xl bg-slate-100 p-5"><p className="text-sm text-slate-500">Pending</p><p className="mt-2 text-3xl font-semibold text-slate-950">{stageBreakdown.pending}</p></div>
              <div className="rounded-2xl bg-slate-100 p-5"><p className="text-sm text-slate-500">Ongoing</p><p className="mt-2 text-3xl font-semibold text-slate-950">{stageBreakdown.inProgress}</p></div>
              <div className="rounded-2xl bg-slate-100 p-5"><p className="text-sm text-slate-500">Completed</p><p className="mt-2 text-3xl font-semibold text-slate-950">{stageBreakdown.completed}</p></div>
            </div>

            <div className="mt-6 grid gap-6 xl:grid-cols-2">
              <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold text-slate-900">Overdue Projects</h2>
                  <span className="text-xs text-slate-500">{formatDateTime(misSummary?.generatedAt ? misSummary?.generatedAt : "")}</span>
                </div>
                <div className="mt-4 space-y-3">
                  {filteredOverdueProjects.length ? filteredOverdueProjects.map((item) => (
                    <div key={item.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm">
                      <p className="font-semibold text-slate-900">{item.name}</p>
                      <p className="mt-1 text-slate-500">Due: {item.dueDate ? new Date(item.dueDate).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'Not set'}</p>
                      <p className="mt-1 text-slate-700">Pending tasks: {item.pendingTasks}</p>
                    </div>
                  )) : <EmptyState message="No overdue projects right now." />}
                </div>
              </div>

              <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold text-slate-900">Daily Pending Summary</h2>
                  <span className="text-xs text-slate-500">{formatDateTime(dailySummary?.generatedAt ? dailySummary?.generatedAt : "")}</span>
                </div>
                <p className="mt-3 text-sm text-slate-600">Total open tasks: <span className="font-semibold text-slate-900">{filteredTasks.filter((task) => task.status !== 'COMPLETED').length}</span></p>
                <div className="mt-4 space-y-3">
                  {visibleDailyProjects.length ? visibleDailyProjects.map((item) => (
                    <div key={item.projectId} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm">
                      <span className="text-slate-700">{item.projectName}</span>
                      <span className="font-medium text-slate-900">{item.pendingTasks} pending</span>
                    </div>
                  )) : <EmptyState message="No pending task summary available." />}
                </div>
              </div>
            </div>

            <div className="mt-6 grid gap-6 xl:grid-cols-2">
              <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">Project Health Overview</h2>
                    <p className="mt-1 text-sm text-slate-500">Track project count, risk, and completion for the selected period.</p>
                  </div>
                  <span className="text-xs text-slate-500">{getPeriodLabel(period, periodValue)}</span>
                </div>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Projects</p>
                    <p className="mt-2 text-3xl font-semibold text-slate-950">{projectHealth.total}</p>
                    <p className="mt-1 text-sm text-slate-500">{projectHealth.active} active</p>
                  </div>
                  <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                    <p className="text-xs font-medium uppercase tracking-[0.18em] text-emerald-600">Completed</p>
                    <p className="mt-2 text-3xl font-semibold text-emerald-700">{projectHealth.completed}</p>
                    <p className="mt-1 text-sm text-emerald-700">closed projects</p>
                  </div>
                  <div className="rounded-2xl border border-rose-100 bg-rose-50 p-4">
                    <p className="text-xs font-medium uppercase tracking-[0.18em] text-rose-600">At Risk</p>
                    <p className="mt-2 text-3xl font-semibold text-rose-700">{projectHealth.atRisk}</p>
                    <p className="mt-1 text-sm text-rose-700">projects with overdue tasks</p>
                  </div>
                  <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
                    <p className="text-xs font-medium uppercase tracking-[0.18em] text-blue-600">Open Tasks</p>
                    <p className="mt-2 text-3xl font-semibold text-blue-700">{stageBreakdown.pending + stageBreakdown.inProgress}</p>
                    <p className="mt-1 text-sm text-blue-700">pending + ongoing</p>
                  </div>
                </div>
              </div>

              <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Project Workload Tracker</h2>
                  <p className="mt-1 text-sm text-slate-500">Project-wise task load with completion, open work, and overdue risk.</p>
                </div>
                <div className="mt-5 space-y-4">
                  {projectTrackingRows.length ? projectTrackingRows.slice(0, 8).map((row) => (
                    <div key={row.project.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="font-semibold text-slate-950">{row.project.name}</p>
                          <p className="mt-1 text-xs text-slate-500">Due: {formatDate(row.project.dueDate)} | {row.completionRate}% complete</p>
                        </div>
                        <span className={['rounded-full px-3 py-1 text-xs font-semibold', row.overdue ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'].join(' ')}>
                          {row.overdue ? `${row.overdue} overdue` : 'On track'}
                        </span>
                      </div>
                      <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100">
                        <div className="flex h-full">
                          <div className="bg-emerald-500" style={{ width: `${(row.completed / maxProjectTaskCount) * 100}%` }} />
                          <div className="bg-blue-500" style={{ width: `${(row.ongoing / maxProjectTaskCount) * 100}%` }} />
                          <div className="bg-amber-500" style={{ width: `${(row.pending / maxProjectTaskCount) * 100}%` }} />
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
                        <span>{row.total} total</span>
                        <span>{row.completed} done</span>
                        <span>{row.ongoing} ongoing</span>
                        <span>{row.pending} pending</span>
                      </div>
                    </div>
                  )) : <EmptyState message="No project tracking data available for this period." />}
                </div>
              </div>
            </div>

            <div className="mt-6 grid gap-6 xl:grid-cols-2">
              <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold text-slate-900">Your Personal Task List</h2>
                  <span className="text-xs text-slate-500">{personalTasks.length} tasks</span>
                </div>
                <div className="mt-4 space-y-3">
                  {personalTasks.length ? personalTasks.slice(0, 8).map((task) => (
                    <div key={task.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-slate-900">{task.title}</p>
                          <p className="mt-1 text-slate-500">{task.projectName}</p>
                        </div>
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{task.status === 'IN_PROGRESS' ? 'Ongoing' : task.status.replace(/_/g, ' ')}</span>
                      </div>
                      <p className="mt-2 text-slate-600">Due date: <span className="font-medium text-slate-900">{formatDate(task.dueDate)}</span></p>
                    </div>
                  )) : <EmptyState message="No personal tasks available for this period." />}
                </div>
              </div>

              <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold text-slate-900">Recent Notifications</h2>
                  <span className="text-xs text-slate-500">{isSystemAdminUser ? 'All notifications' : 'Employee wise'}</span>
                </div>
                <div className="mt-4 space-y-3">
                  {recentNotifications.length ? recentNotifications.slice(0, 3).map((notification: NotificationLog) => (
                    <div key={notification.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm">
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-semibold text-slate-900">{notification.category}</p>
                        <span className="shrink-0 text-xs text-slate-500">{formatDateTime(notification.createdAt)}</span>
                      </div>
                      <p className="mt-2 text-slate-600">{notification.message}</p>
                    </div>
                  )) : <EmptyState message="No recent notifications available for this period." />}
                </div>
              </div>
            </div>

            <div className="mt-6 rounded-[24px] border border-slate-200 bg-slate-50 p-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Employee Wise MIS Report</h2>
                  <p className="mt-1 text-sm text-slate-500">Assigned projects, tasks, pending work, and due-date completion performance.</p>
                </div>
                <span className="text-xs text-slate-500">{employeeReportRows.length} employees</span>
              </div>
              <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                {employeeReportRows.length ? (
                  <>
                    <div className="space-y-3 p-3 md:hidden">
                      {employeeReportRows.map((row) => (
                        <article key={row.employee.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-slate-900">{row.employee.name}</p>
                            <p className="mt-1 truncate text-xs text-slate-500">{row.employee.email}</p>
                          </div>
                          <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                            {[
                              ['Projects', row.assignedProjects.length, 'text-slate-700'],
                              ['Assigned', row.assignedTasks.length, 'text-slate-700'],
                              ['Done', row.doneTasks.length, 'text-emerald-700'],
                              ['Pending', row.pendingTasks.length, 'text-amber-700'],
                              ['Ongoing', row.ongoingTasks.length, 'text-blue-700'],
                              ['Before Due', row.beforeDueTasks.length, 'text-blue-700'],
                              ['After Due', row.afterDueTasks.length, 'text-rose-700'],
                            ].map(([label, value, tone]) => (
                              <div key={String(label)} className="rounded-xl bg-slate-50 px-3 py-2">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">{label}</p>
                                <p className={['mt-1 text-xl font-semibold', String(tone)].join(' ')}>{value}</p>
                              </div>
                            ))}
                          </div>
                        </article>
                      ))}
                    </div>
                    <div className="hidden overflow-x-auto md:block">
                      <table className="min-w-full divide-y divide-slate-200 text-sm">
                      <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.16em] text-slate-500">
                        <tr>
                          <th className="px-4 py-4 font-semibold">Employee</th>
                          <th className="px-4 py-4 font-semibold">Projects</th>
                          <th className="px-4 py-4 font-semibold">Assigned</th>
                          <th className="px-4 py-4 font-semibold">Done</th>
                          <th className="px-4 py-4 font-semibold">Pending</th>
                          <th className="px-4 py-4 font-semibold">Ongoing</th>
                          <th className="px-4 py-4 font-semibold">Before Due</th>
                          <th className="px-4 py-4 font-semibold">After Due</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {employeeReportRows.map((row) => (
                          <tr key={row.employee.id}>
                            <td className="px-4 py-4">
                              <p className="font-semibold text-slate-900">{row.employee.name}</p>
                              <p className="text-xs text-slate-500">{row.employee.email}</p>
                            </td>
                            <td className="px-4 py-4 text-slate-700">{row.assignedProjects.length}</td>
                            <td className="px-4 py-4 text-slate-700">{row.assignedTasks.length}</td>
                            <td className="px-4 py-4 text-emerald-700">{row.doneTasks.length}</td>
                            <td className="px-4 py-4 text-amber-700">{row.pendingTasks.length}</td>
                            <td className="px-4 py-4 text-blue-700">{row.ongoingTasks.length}</td>
                            <td className="px-4 py-4 text-blue-700">{row.beforeDueTasks.length}</td>
                            <td className="px-4 py-4 text-rose-700">{row.afterDueTasks.length}</td>
                          </tr>
                        ))}
                      </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <div className="p-4">
                    <EmptyState message="No employee MIS data available for this period." />
                  </div>
                )}
              </div>
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}
