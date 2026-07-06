import type { Employee } from '../dashboard/types';
import type { Role } from './api';

export const rolePower: Record<Role, number> = {
  SA1: 5,
  SA2: 4,
  ADMIN: 3,
  LEADER: 2,
  EMPLOYEE: 1,
};

export const roleOrder: Role[] = ['SA1', 'SA2', 'ADMIN', 'LEADER', 'EMPLOYEE'];

export function getHighestRolePower(roles: Role[] = []) {
  return roles.reduce((highest, role) => Math.max(highest, rolePower[role] || 0), 0);
}

export function isAdminRole(roles: Role[] = []) {
  return getHighestRolePower(roles) >= rolePower.ADMIN;
}

export function canManageTeamRecords(roles: Role[] = []) {
  return getHighestRolePower(roles) >= rolePower.LEADER;
}

export function formatRoleName(role: Role | string) {
  if (role === 'SA1') return 'Super Admin 1';
  if (role === 'SA2') return 'Super Admin 2';
  if (role === 'ADMIN') return 'Admin';
  if (role === 'LEADER') return 'Leader';
  if (role === 'EMPLOYEE') return 'Employee';
  return role.replace(/_/g, ' ');
}

export function getAssignableRolesForViewer(roles: Role[] = []) {
  const viewerPower = getHighestRolePower(roles);
  return roleOrder.filter((role) => rolePower[role] < viewerPower);
}

export function canViewerSeeEmployee(viewer: Employee | null | undefined, employee: Employee) {
  if (!viewer) {
    return false;
  }

  if (viewer.id === employee.id) {
    return true;
  }

  const viewerPower = getHighestRolePower(viewer.roles);
  if (viewerPower >= rolePower.ADMIN) {
    return getHighestRolePower(employee.roles) < viewerPower;
  }

  if (viewer.roles.includes('LEADER')) {
    return employee.leaderId === viewer.id && employee.roles.includes('EMPLOYEE') && !employee.roles.includes('LEADER');
  }

  return false;
}

export function getDirectLeaderEmployeeIds(employees: Employee[], leaderId?: string) {
  if (!leaderId) {
    return new Set<string>();
  }

  return new Set(
    employees
      .filter(
        (employee) =>
          employee.active !== false &&
          employee.leaderId === leaderId &&
          employee.roles.includes('EMPLOYEE') &&
          !employee.roles.includes('LEADER'),
      )
      .map((employee) => employee.id),
  );
}

export function getEmployeeScopeIds(employees: Employee[], selectedEmployee?: Employee | null) {
  if (!selectedEmployee) {
    return null;
  }

  if (selectedEmployee.roles.includes('LEADER')) {
    return new Set([
      selectedEmployee.id,
      ...getDirectLeaderEmployeeIds(employees, selectedEmployee.id),
    ]);
  }

  return new Set([selectedEmployee.id]);
}

export function getVisibleEmployeeIdsForViewer(employees: Employee[], viewer?: Employee | null) {
  if (!viewer) {
    return new Set<string>();
  }

  if (viewer.roles.includes('SA1')) {
    return null;
  }

  const viewerPower = getHighestRolePower(viewer.roles);
  if (viewerPower >= rolePower.ADMIN) {
    return new Set(employees.filter((employee) => canViewerSeeEmployee(viewer, employee)).map((employee) => employee.id));
  }

  if (viewer.roles.includes('LEADER')) {
    return new Set([
      viewer.id,
      ...getDirectLeaderEmployeeIds(employees, viewer.id),
    ]);
  }

  return new Set([viewer.id]);
}

export function getAssignableEmployeesForViewer(
  employees: Employee[],
  viewer?: Employee | null,
  selectedEmployeeIds: string[] = [],
) {
  if (!viewer) {
    return [];
  }

  const selectedIds = new Set(selectedEmployeeIds);
  const isSelectable = (employee: Employee) => employee.active !== false || selectedIds.has(employee.id);

  if (viewer.roles.includes('SA1')) {
    return employees.filter(isSelectable);
  }

  const viewerPower = getHighestRolePower(viewer.roles);
  if (viewerPower >= rolePower.ADMIN) {
    return employees.filter((employee) => canViewerSeeEmployee(viewer, employee) && isSelectable(employee));
  }

  if (viewer.roles.includes('LEADER')) {
    const teamIds = getDirectLeaderEmployeeIds(employees, viewer.id);
    return employees.filter((employee) => (employee.id === viewer.id || teamIds.has(employee.id)) && isSelectable(employee));
  }

  return employees.filter((employee) => employee.id === viewer.id && isSelectable(employee));
}

export function itemMatchesEmployeeScope(assignedEmployeeIds: string[], scopeIds: Set<string> | null) {
  return !scopeIds || assignedEmployeeIds.some((employeeId) => scopeIds.has(employeeId));
}
