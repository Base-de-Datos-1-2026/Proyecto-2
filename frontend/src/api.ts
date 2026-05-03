export const apiBase = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api';

export async function request<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
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
