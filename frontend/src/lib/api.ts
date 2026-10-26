/** Tiny typed API client. All calls go to the same origin (Vite proxies /api). */

const TOKEN_KEY = 'cc_token';

/**
 * Token storage with a memory fallback: some embedded preview environments
 * block or partition localStorage (opaque-origin iframes, strict privacy
 * modes). If storage throws, keep the token in memory so the session still
 * works for the lifetime of the page.
 */
let memoryToken: string | null = null;

function storageAvailable(): Storage | null {
  try {
    const probe = '__cc_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    return null;
  }
}
const store = typeof window !== 'undefined' ? storageAvailable() : null;

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function getToken(): string | null {
  try {
    return (store && store.getItem(TOKEN_KEY)) || memoryToken;
  } catch {
    return memoryToken;
  }
}
export function setToken(token: string) {
  memoryToken = token;
  try {
    store?.setItem(TOKEN_KEY, token);
  } catch {
    /* memory-only session */
  }
}
export function clearToken() {
  memoryToken = null;
  try {
    store?.removeItem(TOKEN_KEY);
  } catch {
    /* nothing to clear */
  }
}

/** Session token headers sent on every authenticated request.
 *  X-Session-Token survives proxies that strip the Authorization header. */
function tokenHeaders(token: string | null): Record<string, string> {
  if (!token) return {};
  return { Authorization: `Bearer ${token}`, 'X-Session-Token': token };
}

export type ApiOptions = Omit<RequestInit, 'body'> & { body?: unknown; form?: FormData };

export async function api<T = any>(path: string, options: ApiOptions = {}): Promise<T> {
  const { form, ...rest } = options;
  const headers: Record<string, string> = {
    ...(rest.headers as Record<string, string>),
    ...tokenHeaders(getToken()),
  };
  let body = rest.body;
  if (form) {
    body = form;
  } else if (body !== undefined && typeof body !== 'string') {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(body);
  } else if (typeof body === 'string' && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(`/api${path}`, { ...rest, headers, body: body as BodyInit | undefined });
  if (res.status === 401 && !path.startsWith('/auth/login')) {
    clearToken();
    window.dispatchEvent(new CustomEvent('cc:unauthorized'));
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, (data && data.error) || `Request failed (${res.status})`);
  }
  return data as T;
}

/** Authenticated download that respects Bearer tokens (fetch, not <a href>). */
export async function downloadFile(fileId: string): Promise<Blob> {
  const res = await fetch(`/api/files/${fileId}`, { headers: tokenHeaders(getToken()) });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(res.status, (data && data.error) || 'Download failed');
  }
  return res.blob();
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
