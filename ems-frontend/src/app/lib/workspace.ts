import type { Role } from './api';
import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import type { NavItem, SectionKey } from '../dashboard/types';
import { canManageTeamRecords } from './hierarchy';

export function getWorkspaceNavItems(canManage: boolean, isAdmin: boolean, roles: Role[] = []): NavItem[] {
  const isLeader = roles.includes('LEADER');
  const hasTeamAccess = canManage || isAdmin || canManageTeamRecords(roles);
  const baseItems: NavItem[] = [
    { key: 'overview', label: 'Dashboard' },
    { key: 'projects', label: 'Projects' },
    { key: 'tasks', label: 'Tasks' },
    { key: 'mis', label: 'MIS' },
    { key: 'activity', label: 'Notification Logs' },
    { key: 'employees', label: 'Employees' },
  ];

  if (!isAdmin && !isLeader && !hasTeamAccess) {
    return baseItems;
  }

  const items: NavItem[] = [
    { key: 'overview', label: 'Dashboard' },
    { key: 'projects', label: 'Projects' },
    { key: 'tasks', label: 'Tasks' },
    { key: 'mis', label: 'MIS' },
    { key: 'activity', label: 'Notification Logs' },
    { key: 'employees', label: 'Employees' },
  ];

  return items;
}

export function getSectionPath(section: SectionKey) {
  switch (section) {
    case 'overview':
      return '/dashboard';
    case 'tasks':
      return '/tasks';
    case 'notes':
      return '/notes';
    case 'projects':
      return '/projects';
    case 'mis':
      return '/mis';
    case 'activity':
      return '/activity';
    case 'employees':
      return '/employees';
    default:
      return '/dashboard';
  }
}

export function routeSection(router: AppRouterInstance, section: SectionKey) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('ems-route-loading-start'));
  }
  router.push(getSectionPath(section));
}
