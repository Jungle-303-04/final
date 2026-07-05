// API 접근 단일 지점 — 뷰/컴포넌트의 직접 fetch 금지 (docs/fd/03 D5)
import { mockRequest } from '@/shared/lib/mock/router';

export type ApiErrorKind = 'unauthorized' | 'forbidden' | 'not_found' | 'invalid' | 'rate_limited' | 'server' | 'network';
export class ApiError extends Error {
  kind: ApiErrorKind; status: number; detail: string;
  constructor(status: number, detail: string) {
    super(detail);
    this.status = status; this.detail = detail;
    this.kind = status === 401 ? 'unauthorized' : status === 403 ? 'forbidden' : status === 404 ? 'not_found'
      : status === 422 || status === 409 ? 'invalid' : status === 429 ? 'rate_limited' : status >= 500 ? 'server' : 'network';
  }
}

export const API_MODE = (import.meta.env.VITE_API_MODE ?? 'mock') as 'mock' | 'real';
const BASE = import.meta.env.VITE_API_BASE ?? '/api';

let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: () => void) { onUnauthorized = fn; }

export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  if (API_MODE === 'mock') return mockRequest<T>(method, path, body);
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method, credentials: 'include',
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch { throw new ApiError(0, '네트워크 오류'); }
  if (!res.ok) {
    if (res.status === 401) onUnauthorized?.();
    const detail = await res.json().then(j => j.detail ?? res.statusText).catch(() => res.statusText);
    throw new ApiError(res.status, String(detail));
  }
  return res.status === 204 ? (undefined as T) : res.json();
}
export const get = <T>(p: string) => api<T>('GET', p);
export const post = <T>(p: string, b?: unknown) => api<T>('POST', p, b);
export const put = <T>(p: string, b?: unknown) => api<T>('PUT', p, b);
export const del = <T>(p: string) => api<T>('DELETE', p);
