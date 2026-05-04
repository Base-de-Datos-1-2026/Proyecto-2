import { treaty } from '@elysia/eden';
import type { App } from '../../backend/src/index';

// Eden client — gives full end-to-end type safety between frontend and backend.
// The App type is imported directly from the backend so both sides stay in sync
// automatically. If a route changes on the backend, TypeScript will catch it here.
export const client = treaty<App>(
  import.meta.env.VITE_API_URL?.replace('/api', '') ?? 'http://localhost:3000',
  {
    fetch: { credentials: 'include' },
  },
);

// ─── Typed helpers ────────────────────────────────────────────────────────────
// These wrappers extract the data from Eden responses and throw on error,
// matching the same interface used by the rest of the frontend code.

export async function request<T>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  // Fall back to raw fetch for paths not covered by Eden (e.g. CSV download)
  const base = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api';
  const response = await fetch(`${base}${path}`, {
    method: options.method ?? 'GET',
    credentials: 'include',
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(payload.error ?? 'Error de servidor');
  }

  return payload as T;
}

export async function requestList<T>(path: string): Promise<T[]> {
  const response = await request<{ data?: T[] }>(path);
  return response.data ?? [];
}

// ─── Eden typed calls ─────────────────────────────────────────────────────────
// Use these where you want full type safety and error handling via Eden.

export async function edenGet<T>(
  call: () => Promise<{ data: { data?: T[] } | null; error: { value: string } | null }>,
): Promise<T[]> {
  const { data, error } = await call();
  if (error) throw new Error(String(error.value));
  return (data?.data ?? []) as T[];
}

export async function edenPost<T>(
  call: () => Promise<{ data: T | null; error: { value: string } | null }>,
): Promise<T> {
  const { data, error } = await call();
  if (error) throw new Error(String(error.value));
  return data as T;
}

// Re-export apiBase for CSV download in dashboard
export const apiBase = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api';