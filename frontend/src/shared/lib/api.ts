// API 접근 단일 지점 — 뷰/컴포넌트의 직접 fetch 금지 (docs/fd/03 D5)
export type ApiErrorKind = 'unauthorized' | 'forbidden' | 'not_found' | 'invalid' | 'rate_limited' | 'server' | 'network';
export class ApiError extends Error {
  kind: ApiErrorKind; status: number; detail: string; rawDetail?: unknown;
  constructor(status: number, detail: string, rawDetail?: unknown) {
    super(detail);
    this.status = status; this.detail = detail;
    this.rawDetail = rawDetail;
    this.kind = status === 401 ? 'unauthorized' : status === 403 ? 'forbidden' : status === 404 ? 'not_found'
      : status === 400 || status === 422 || status === 409 ? 'invalid' : status === 429 ? 'rate_limited' : status >= 500 ? 'server' : 'network';
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
    const rawDetail = await res.json()
      .then(j => detailPayload(j, res.statusText))
      .catch(() => res.statusText);
    const detail = apiDetailToString(rawDetail);
    throw new ApiError(res.status, normalizeApiDetail(res.status, detail), rawDetail);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}
export const get = <T>(p: string, options?: ApiOptions) => api<T>('GET', p, undefined, options);
export const post = <T>(p: string, b?: unknown, options?: ApiOptions) => api<T>('POST', p, b, options);
export const put = <T>(p: string, b?: unknown, options?: ApiOptions) => api<T>('PUT', p, b, options);
export const del = <T>(p: string, options?: ApiOptions) => api<T>('DELETE', p, undefined, options);

export async function getBlob(path: string, options: ApiOptions = {}): Promise<Blob> {
  let res: Response;
  const requestSignal = createRequestSignal(options);
  try {
    const request = fetch(`${BASE}${path}`, {
      method: 'GET',
      credentials: 'include',
      signal: requestSignal.signal,
    });
    res = await (requestSignal.timeout ? Promise.race([request, requestSignal.timeout]) : request);
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(0, requestSignal.timedOut() ? '?붿껌 ?쒓컙??珥덇낵?섏뿀?듬땲??' : '?ㅽ듃?뚰겕 ?ㅻ쪟');
  } finally {
    requestSignal.cancel();
  }
  if (!res.ok) {
    if (res.status === 401) onUnauthorized?.();
    const rawDetail = await res.json()
      .then(j => detailPayload(j, res.statusText))
      .catch(() => res.statusText);
    const detail = apiDetailToString(rawDetail);
    throw new ApiError(res.status, normalizeApiDetail(res.status, detail), rawDetail);
  }
  return res.blob();
}

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

function detailPayload(payload: unknown, fallback: string): unknown {
  if (!payload || typeof payload !== 'object') return payload ?? fallback;
  const value = payload as Record<string, unknown>;
  if (typeof value.code === 'string') return value;
  return value.detail ?? value ?? fallback;
}

function apiDetailToString(detail: unknown): string {
  if (typeof detail === 'string') return detail;
  if (detail && typeof detail === 'object') {
    const value = detail as Record<string, unknown>;
    if (value.code === 'cluster_not_connected') {
      const clusters = Array.isArray(value.clusters) ? value.clusters.map(String).join(', ') : '';
      const message = String(value.detail ?? '에이전트가 연결되지 않은 클러스터입니다');
      return clusters ? `cluster_not_connected: ${message} (${clusters})` : `cluster_not_connected: ${message}`;
    }
    if (value.code === 'has_deployments') {
      return `has_deployments: ${String(value.detail ?? '연결된 배포 정의가 있어 등록을 해제할 수 없습니다')}`;
    }
    if (Array.isArray(value.blockers) && value.blockers.length > 0) {
      const message = typeof value.message === 'string' ? value.message : typeof value.detail === 'string' ? value.detail : 'request blocked';
      return `${message}: ${value.blockers.map(String).slice(0, 4).join('; ')}`;
    }
    const message = value.detail ?? value.message;
    if (typeof message === 'string') return message;
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(detail || '요청 처리에 실패했습니다');
}
