// API 접근 단일 지점 — 뷰/컴포넌트의 직접 fetch 금지 (docs/fd/03 D5)
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

export type ApiOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
};

const BASE = import.meta.env.VITE_API_BASE ?? '/api';
const CSRF_INTENT_HEADER = 'x-service-csrf';
const CSRF_INTENT_VALUE = 'same-origin';
const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: () => void) { onUnauthorized = fn; }

export async function api<T>(method: string, path: string, body?: unknown, options: ApiOptions = {}): Promise<T> {
  let res: Response;
  const requestSignal = createRequestSignal(options);
  try {
    const headers: Record<string, string> = {};
    if (body) headers['content-type'] = 'application/json';
    if (STATE_CHANGING_METHODS.has(method)) headers[CSRF_INTENT_HEADER] = CSRF_INTENT_VALUE;
    const request = fetch(`${BASE}${path}`, {
      method, credentials: 'include',
      headers: Object.keys(headers).length ? headers : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: requestSignal.signal,
    });
    res = await (requestSignal.timeout ? Promise.race([request, requestSignal.timeout]) : request);
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(0, requestSignal.timedOut() ? '요청 시간이 초과되었습니다' : '네트워크 오류');
  }
  finally { requestSignal.cancel(); }
  if (!res.ok) {
    if (res.status === 401) onUnauthorized?.();
    const detail = await res.json().then(j => j.detail ?? res.statusText).catch(() => res.statusText);
    throw new ApiError(res.status, normalizeApiDetail(res.status, String(detail)));
  }
  return res.status === 204 ? (undefined as T) : res.json();
}
export const get = <T>(p: string, options?: ApiOptions) => api<T>('GET', p, undefined, options);
export const post = <T>(p: string, b?: unknown, options?: ApiOptions) => api<T>('POST', p, b, options);
export const put = <T>(p: string, b?: unknown, options?: ApiOptions) => api<T>('PUT', p, b, options);
export const del = <T>(p: string, options?: ApiOptions) => api<T>('DELETE', p, undefined, options);

function createRequestSignal(options: ApiOptions): { signal?: AbortSignal; timeout: Promise<never> | null; cancel: () => void; timedOut: () => boolean } {
  if (!options.timeoutMs) return { signal: options.signal, timeout: null, cancel: () => undefined, timedOut: () => false };

  const controller = new AbortController();
  let timeoutReached = false;
  let timeoutId = 0;
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = window.setTimeout(() => {
      timeoutReached = true;
      controller.abort();
      reject(new ApiError(0, '요청 시간이 초과되었습니다'));
    }, options.timeoutMs);
  });
  const abortFromParent = () => controller.abort();

  if (options.signal?.aborted) {
    controller.abort();
  } else {
    options.signal?.addEventListener('abort', abortFromParent, { once: true });
  }

  return {
    signal: controller.signal,
    timeout,
    cancel: () => {
      clearTimeout(timeoutId);
      options.signal?.removeEventListener('abort', abortFromParent);
    },
    timedOut: () => timeoutReached,
  };
}

function normalizeApiDetail(status: number, detail: string): string {
  if (status === 502 || status === 503 || status === 504) return '백엔드 연결이 지연되고 있습니다';
  if (status >= 500 && /^(bad gateway|gateway timeout|service unavailable|internal server error)$/i.test(detail.trim())) {
    return '서버 응답이 불안정합니다';
  }
  return detail;
}
