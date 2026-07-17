'use client';

import { FormEvent, ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getToken, Role } from '../lib/api';
import { clearAuth } from '../lib/auth';
import { getWorkspaceNavItems, routeSection } from '../lib/workspace';
import { canManageTeamRecords, canRunReports, formatRoleName, getAssignableRolesForViewer, isAdminRole, roleOrder } from '../lib/hierarchy';
import { DashboardSidebar, DashboardTopbar } from '../../components/DashboardShell';
import type { DashboardResponse, Employee, Meta, NavItem, SectionKey } from '../dashboard/types';
import { ChevronUpIcon, ChevronDownIcon } from '@heroicons/react/24/outline';

type EmployeeEditorProps = {
  employeeId?: string;
  mode: 'create' | 'edit';
};

type PermissionRole = 'admin' | 'manager' | 'employee';

type EmployeeEditorRecord = Employee & {
  role?: string;
  isActive?: boolean;
  hasLoginAccess?: boolean;
  loginEmail?: string;
  permissionRoles?: string[];
};

type EmployeeFormState = {
  name: string;
  email: string;
  phone: string;
  password: string;
  roles: Role[];
  role: string;
  isActive: boolean;
  loginEnabled: boolean;
  loginEmail: string;
  loginPassword: string;
  permissionRole: PermissionRole;
};

function getInitialState(employee?: EmployeeEditorRecord): EmployeeFormState {
  const roles: Role[] = employee?.roles?.length ? employee.roles : ['EMPLOYEE'];
  const firstRole = roles[0]?.toLowerCase() ?? 'EMPLOYEE';
  const permissionRole = employee?.permissionRoles?.[0];

  return {
    name: employee?.name || '',
    email: employee?.email || '',
    phone: employee?.phone || '',
    password: '',
    roles,
    role: employee?.role || firstRole,
    isActive: employee?.isActive ?? employee?.active ?? true,
    loginEnabled: Boolean(employee?.hasLoginAccess),
    loginEmail: employee?.loginEmail || employee?.email || '',
    loginPassword: '',
    permissionRole:
      permissionRole === 'admin' || permissionRole === 'manager' || permissionRole === 'employee'
        ? permissionRole
        : 'employee',
  };
}

const fieldClassName = 'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400';
const primaryButtonClassName = 'inline-flex items-center justify-center rounded-2xl bg-blue-600 px-4 text-sm font-medium text-white transition hover:bg-blue-700';
const secondaryButtonClassName = 'inline-flex items-center justify-center rounded-2xl border border-red-400 bg-white px-12 py-3 text-xl font-bold text-red-600 transition hover:bg-slate-50';
const roleFallback: Role[] = roleOrder;

const createInitialForm = (): EmployeeFormState => getInitialState();

function canEditEmployeeRecord(viewer: Employee | undefined, employee: EmployeeEditorRecord | null, mode: 'create' | 'edit') {
  if (!viewer) {
    return false;
  }

  if (mode === 'create') {
    return viewer.roles.includes('SA1') || viewer.roles.includes('SA2');
  }

  if (!employee) {
    return false;
  }

  if (viewer.roles.includes('SA1')) {
    return true;
  }

  return viewer.roles.includes('SA2') && !employee.roles.includes('SA1');
}

function formatRoleLabel(role: Role) {
  return formatRoleName(role);
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}

export function EmployeeEditor({ employeeId, mode }: EmployeeEditorProps) {
  const router = useRouter();
  const rolesDropdownRef = useRef<HTMLDivElement | null>(null);
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [meta, setMeta] = useState<Meta>({ roles: roleFallback, taskTypes: ['SIMPLE'] });
  const [form, setForm] = useState<EmployeeFormState>(createInitialForm);
  const [saving, setSaving] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [rolesOpen, setRolesOpen] = useState(false);
  const [error, setError] = useState('');
  const [editingEmployee, setEditingEmployee] = useState<EmployeeEditorRecord | null>(null);

  const loadData = useCallback(async () => {
    setError('');

    try {
      const requests: Array<Promise<unknown>> = [api<DashboardResponse>('/dashboard'), api<Meta>('/meta')];
      if (mode === 'edit') {
        requests.push(api<Employee[]>('/employees'));
      }

      const [dashboardData, metaData, employeeData] = (await Promise.all(requests)) as [DashboardResponse, Meta, Employee[] | undefined];

      setDashboard(dashboardData);
      setMeta({
        ...metaData,
        roles: metaData.roles.length ? metaData.roles : roleFallback,
      });

      if (mode === 'edit') {
        const currentEmployee = employeeData?.find((employee) => employee.id === employeeId) as EmployeeEditorRecord | undefined;
        if (!currentEmployee) {
          setError('Employee not found.');
          return;
        }

        setEditingEmployee(currentEmployee);
        setForm(getInitialState(currentEmployee));
      }
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Unable to load employee page.';
      setError(message);
      if (message.toLowerCase().includes('unauthorized')) {
        clearAuth();
        router.replace('/auth/login');
      }
    }
  }, [employeeId, mode, router]);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/auth/login');
      return;
    }

    void loadData();
  }, [loadData, router]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!rolesDropdownRef.current?.contains(event.target as Node)) {
        setRolesOpen(false);
      }
    }

    if (!rolesOpen) {
      return;
    }

    document.addEventListener('mousedown', handlePointerDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [rolesOpen]);

  const me = dashboard?.employee;
  const isAdmin = isAdminRole(me?.roles ?? []);
  const canManage = canManageTeamRecords(me?.roles ?? []);
  const initials = me?.name?.trim()?.charAt(0)?.toUpperCase() || 'A';
  const isEditingSelf = mode === 'edit' && Boolean(employeeId && me?.id === employeeId);
  const canEditEmployee = canEditEmployeeRecord(me, editingEmployee, mode);
  const navItems: NavItem[] = getWorkspaceNavItems(canManage, isAdmin, me?.roles ?? []);
  const assignableRoles = getAssignableRolesForViewer(me?.roles ?? []);
  const roleOptions = (meta.roles.length ? meta.roles : roleFallback).filter((role) => assignableRoles.includes(role));
  const selectedRolesLabel = form.roles.length ? form.roles.map(formatRoleLabel).join(', ') : 'Select roles';

  function handleSection(section: SectionKey) {
    setSidebarOpen(false);
    routeSection(router, section);
  }

  function handleLogout() {
    clearAuth();
    router.replace('/auth/login');
  }

  function updateField<K extends keyof EmployeeFormState>(field: K, value: EmployeeFormState[K]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function toggleRole(role: Role) {
    setForm((current) => ({
      ...current,
      roles: current.roles.includes(role)
        ? current.roles.filter((item) => item !== role)
        : [...current.roles, role],
    }));
  }

  async function handleRunReport() {
    try {
      await api('/reports/run-scheduled', { method: 'POST' });
    } catch (reportError) {
      setError(reportError instanceof Error ? reportError.message : 'Unable to trigger reports.');
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEditEmployee) {
      setError(mode === 'edit' ? 'You do not have permission to edit this employee.' : 'You do not have permission to create employees.');
      return;
    }
    const trimmedName = form.name.trim();
    if (!trimmedName) {
      setError('Employee Name is required.');
      return;
    }
    if (!form.roles.length) {
      setError('Assign Roles is required.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const primaryEmail = form.email.trim() || (form.loginEnabled ? form.loginEmail.trim() : '');
      const payload = {
        name: trimmedName,
        email: primaryEmail,
        phone: form.phone,
        roles: form.roles,
        active: form.isActive,
        loginEnabled: form.loginEnabled,
        loginEmail: form.loginEnabled ? form.loginEmail.trim() || primaryEmail || undefined : undefined,
        permissionRoles: form.loginEnabled ? [form.permissionRole] : undefined,
        role: form.role,
      } as {
        name: string;
        email: string;
        phone: string;
        roles: Role[];
        active: boolean;
        loginEnabled: boolean;
        loginEmail?: string;
        permissionRoles?: PermissionRole[];
        role: string;
        password?: string;
      };

      const nextPassword = form.loginEnabled ? form.loginPassword.trim() || form.password.trim() : form.password.trim();
      if (nextPassword) {
        payload.password = nextPassword;
      }

      if (mode === 'edit' && employeeId) {
        await api(`/employees/${employeeId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });

        if (isEditingSelf && !form.isActive) {
          clearAuth();
          router.replace('/auth/login');
          return;
        }
      } else {
        await api('/employees', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }

      router.push('/employees');
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'Unable to save employee.');
    } finally {
      setSaving(false);
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
          canRunReport={canRunReports(me?.roles ?? [])}
          initials={initials}
          userEmail={me?.email ?? ''}
          userName={me?.name ?? 'Admin'}
          onLogout={handleLogout}
          onMenuOpen={() => setSidebarOpen(true)}
          onRunReport={handleRunReport}
          subtitle="Task Management System"
          title={mode === 'edit' ? 'Edit Employee' : 'Create Employee'}
        />

        <section className="px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
          {dashboard && !canEditEmployee ? (
            <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700">
              {mode === 'edit' ? 'You can view this employee, but you do not have permission to edit.' : 'Only SA1 or SA2 can create employees.'}
            </div>
          ) : null}
          {error ? (
            <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.06)] sm:p-6 lg:p-7">
            <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="text-xl font-semibold text-slate-950 sm:text-2xl">
                  {mode === 'edit' ? 'Update Employee' : 'Create Employee'}
                </h1>
                <p className="mt-1 text-sm text-slate-500">
                  {mode === 'edit'
                    ? 'Edit employee details, roles, and login access.'
                    : 'Add a new team member with roles and login access.'}
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <button className={secondaryButtonClassName} onClick={() => router.push('/employees')} type="button">
                  Cancel
                </button>
                <button className={primaryButtonClassName} disabled={saving || !canEditEmployee} type="submit">
                  {saving ? 'Saving...' : mode === 'edit' ? 'Update Employee' : 'Create Employee'}
                </button>
              </div>
            </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Employee Name">
                  <input
                    className={fieldClassName}
                    disabled={!canEditEmployee}
                    onChange={(event) => updateField('name', event.target.value)}
                    placeholder="Employee name"
                    value={form.name}
                  />
                </Field>
                <div className="relative" ref={rolesDropdownRef}>
                  <Field label="Assign Roles">
                    <button
                      aria-expanded={rolesOpen}
                      className={`${fieldClassName} flex items-center justify-between gap-3 pr-12 text-left`}
                      onClick={() => {
                        if (!canEditEmployee) {
                          return;
                        }
                        setRolesOpen((current) => !current);
                      }}
                      type="button"
                    >
                      <span className={form.roles.length ? 'text-slate-900' : 'text-slate-400'}>
                        {selectedRolesLabel}
                      </span>
                    </button>
                    {rolesOpen ? (
                      <ChevronUpIcon className="pointer-events-none absolute right-3 top-[52px] h-5 w-5 -translate-y-1/2 text-slate-400" />
                    ) : (
                      <ChevronDownIcon className="pointer-events-none absolute right-3 top-[52px] h-5 w-5 -translate-y-1/2 text-slate-400" />
                    )}
                  </Field>

                  {rolesOpen && canEditEmployee ? (
                    <div className="absolute left-0 right-0 z-20 mt-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_18px_45px_rgba(15,23,42,0.12)]">
                      <div className="grid gap-2 md:grid-cols-2">
                        {roleOptions.map((role) => (
                          <label key={role} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700 transition hover:border-slate-300 hover:bg-slate-100">
                            <input
                              checked={form.roles.includes(role)}
                              disabled={!canEditEmployee}
                              onChange={() => toggleRole(role)}
                              type="checkbox"
                            />
                            <span>{formatRoleLabel(role)}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Phone Number">
                  <div className="flex overflow-hidden rounded-2xl border border-slate-200 bg-white focus-within:border-slate-400">
                    <span className="inline-flex items-center border-r border-slate-200 bg-slate-50 px-4 text-sm text-slate-600">
                      +91
                    </span>
                    <input
                      className="w-full bg-transparent px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400"
                      disabled={!canEditEmployee}
                      inputMode="numeric"
                      maxLength={10}
                      onChange={(event) => updateField('phone', event.target.value.replace(/\D/g, '').slice(0, 10))}
                      placeholder="10-digit phone number"
                      value={form.phone}
                    />
                  </div>
                </Field>
              </div>

              <label className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
                <input
                  checked={form.isActive}
                  disabled={!canEditEmployee}
                  onChange={(event) => updateField('isActive', event.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                  type="checkbox"
                />
                Mark this employee as active
              </label>

              <div className="space-y-4 rounded-3xl border border-slate-200 bg-slate-50 p-5">
                <label className="flex items-center gap-3 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.loginEnabled}
                    disabled={!canEditEmployee}
                    onChange={(e) => updateField('loginEnabled', e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  Enable login access for this employee
                </label>

                {form.loginEnabled ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Login Email">
                      <input
                        type="email"
                        value={form.loginEmail}
                        disabled={!canEditEmployee}
                        onChange={(e) => updateField('loginEmail', e.target.value)}
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none"
                        required={form.loginEnabled}
                        placeholder="Enter email"
                      />
                    </Field>
                    <Field label={mode === 'create' ? 'Login Password' : 'Reset Password'}>
                      <input
                        type="password"
                        value={form.loginPassword}
                        disabled={!canEditEmployee}
                        onChange={(e) => updateField('loginPassword', e.target.value)}
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none"
                        placeholder={mode === 'create' ? 'Enter password' : 'Leave blank to keep current password'}
                        required={mode === 'create' && form.loginEnabled && !form.password.trim()}
                      />
                    </Field>
                    {/* <Field label="Permission Role">
                      <select
                        value={form.permissionRole}
                        onChange={(e) => updateField('permissionRole', e.target.value as PermissionRole)}
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none"
                      >
                        <option value="admin">Admin</option>
                        <option value="manager">Manager</option>
                        <option value="employee">Employee</option>
                      </select>
                    </Field> */}
                  </div>
                ) : null}
              </div>
            </form>
          </section>
        </section>
      </div>
    </main>
  );
}
















