const LOCAL_API_PORT = '5010';
const PRODUCTION_API_URL = '/api';

export type Role = 'SA1' | 'SA2' | 'ADMIN' | 'LEADER' | 'EMPLOYEE';
export type TaskType = 'SIMPLE';

const TOKEN_KEY = 'ems-token';

function resolveApiUrl() {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }

  if (typeof window !== 'undefined') {
    const { hostname } = window.location;

    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      /^10\./.test(hostname) ||
      /^192\.168\./.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
    ) {
      return `${window.location.protocol}//${hostname}:${LOCAL_API_PORT}/api`;
    }

    return PRODUCTION_API_URL;
  }

  return `http://localhost:${LOCAL_API_PORT}/api`;
}

export const API_URL = resolveApiUrl();
const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? API_URL;

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  token?: string,
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `API error ${res.status}`);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  const text = await res.text();
  if (!text) {
    return undefined as T;
  }

  return JSON.parse(text) as T;
}

export function getToken() {
  if (typeof window === 'undefined') {
    return '';
  }
  return window.localStorage.getItem(TOKEN_KEY) ?? '';
}

export function setToken(token: string) {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(TOKEN_KEY, token);
  }
}

export function clearToken() {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(TOKEN_KEY);
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || 'Request failed');
  }

  return response.json() as Promise<T>;
}
