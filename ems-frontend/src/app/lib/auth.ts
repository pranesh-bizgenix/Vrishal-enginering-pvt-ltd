'use client';

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'MANAGER' | 'EXECUTIVE' | 'VIEWER';
};

const TOKEN_KEY = 'ems-token';
const LEGACY_TOKEN_KEY = 'token';
const USER_KEY = 'ems-user';

export function saveAuth(token: string, user: AuthUser) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(LEGACY_TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  localStorage.removeItem('ems-dashboard-person-scope');
  document.cookie = `crm_token=${token}; path=/; max-age=${60 * 60 * 24 * 7}; samesite=lax`;
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(LEGACY_TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem('roles');
  localStorage.removeItem('email');
  localStorage.removeItem('companyKey');
  localStorage.removeItem('ems-dashboard-person-scope');
  document.cookie = 'crm_token=; path=/; max-age=0; samesite=lax';
}

export function getToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY) || localStorage.getItem(LEGACY_TOKEN_KEY);
}

export function getUser(): AuthUser | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}
