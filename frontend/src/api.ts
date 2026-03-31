const normalizeBase = (value: string) => value.replace(/\/+$/, '');

/** Align with vite.config `base` (e.g. /meals-rmg/) so prod cannot drift from a bad VITE_PUBLIC_PREFIX. */
function publicPathFromVite(): string {
  const b = normalizeBase(import.meta.env.BASE_URL ?? '');
  return b || '/meals-rmg';
}

/** Site mount (same pathname as Vite base, no trailing slash). */
const PUBLIC_PREFIX = normalizeBase(
  import.meta.env.VITE_PUBLIC_PREFIX ?? publicPathFromVite(),
);

/** Path bases must start with / so fetch() is never resolved relative to /meals-rmg/kitchen. */
function resolveApiBase(): string {
  const raw =
    import.meta.env.VITE_API_BASE ??
    (import.meta.env.DEV
      ? `http://localhost:3000${PUBLIC_PREFIX}/api`
      : `${PUBLIC_PREFIX}/api`);
  let v = normalizeBase(String(raw).trim());
  if (!v) v = `${PUBLIC_PREFIX}/api`;
  if (v.startsWith('http://') || v.startsWith('https://')) return v;
  return v.startsWith('/') ? v : `/${v}`;
}

const API_BASE = resolveApiBase();

type LoginResponse = {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    role: string;
    name: string;
    department: string;
  };
};

export type Summary = {
  date: string;
  totalQuantity: number;
  totalActualQuantity: number;
  departments: {
    departmentId: string;
    regularQuantity: number;
    vegQuantity: number;
    totalQuantity: number;
    actualQuantity: number;
    actualUpdatedAt: string | null;
    actualUpdatedBy: string | null;
    updatedAt: string;
    updatedBy: string | null;
  }[];
};

export type DepartmentLunch = {
  id: string;
  departmentId: string;
  date: string;
  regularQuantity: number;
  vegQuantity: number;
  totalQuantity: number;
  actualQuantity: number;
  actualUpdatedAt: string | null;
  actualUpdatedBy: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
};

export type MonthlyDepartmentSummary = {
  departmentId: string;
  registeredTotal: number;
  actualTotal: number;
  variance: number;
};

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

function buildRequestUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  const relative = `${API_BASE}${p}`;
  if (relative.startsWith('http://') || relative.startsWith('https://')) {
    return relative;
  }
  if (typeof globalThis.location !== 'undefined' && relative.startsWith('/')) {
    return new URL(relative, globalThis.location.origin).href;
  }
  return relative;
}

async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  const url = buildRequestUrl(input);
  const response = await fetch(url, init);
  const text = await response.text();
  const ct = response.headers.get('content-type') ?? '';
  const looksHtml =
    ct.includes('text/html') || text.trimStart().toLowerCase().startsWith('<!');

  if (!response.ok) {
    throw new ApiError(
      response.status,
      looksHtml
        ? `API trả về HTML (${response.url}). Kiểm tra nginx → Nest và REST tại /meals-rmg/api.`
        : text || 'Request failed',
    );
  }
  if (looksHtml) {
    throw new ApiError(
      500,
      `Expected JSON from ${response.url}, got HTML. API_BASE=${API_BASE}`,
    );
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError(
      500,
      `Invalid JSON from ${response.url}: ${text.slice(0, 120)}…`,
    );
  }
}

export async function login(username: string, password: string) {
  return fetchJson<LoginResponse>('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
}

export async function refreshTokens(refreshToken: string) {
  return fetchJson<LoginResponse>('/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
}

export async function fetchLock(date: string, token: string) {
  return fetchJson<{ date: string; locked: boolean; lockedAt: string | null; lockedBy: string | null }>(
    `/lunch/lock?date=${encodeURIComponent(date)}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );
}

export async function fetchSummary(date: string, token: string) {
  return fetchJson<Summary>(`/lunch/summary?date=${encodeURIComponent(date)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function fetchDepartmentLunch(date: string, token: string) {
  return fetchJson<DepartmentLunch>(
    `/lunch/department?date=${encodeURIComponent(date)}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );
}

export async function fetchDepartmentHistory(token: string, limit = 30) {
  return fetchJson<DepartmentLunch[]>(
    `/lunch/department/history?limit=${limit}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );
}

export async function fetchAuditHistory(token: string, limit = 200) {
  return fetchJson<DepartmentLunch[]>(
    `/lunch/department/audit?limit=${limit}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );
}

export async function clearDepartmentLunch(
  date: string,
  departmentId: string,
  token: string,
) {
  return fetchJson<DepartmentLunch>('/lunch/department/clear', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ date, departmentId }),
  });
}

export async function setDepartmentLunch(
  date: string,
  regularQuantity: number,
  vegQuantity: number,
  token: string,
) {
  return fetchJson<DepartmentLunch>('/lunch/department', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ date, regularQuantity, vegQuantity }),
  });
}

export async function setLock(date: string, locked: boolean, token: string) {
  return fetchJson<{ date: string; locked: boolean; lockedAt: string | null; lockedBy: string | null }>(
    '/lunch/lock',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ date, locked }),
    },
  );
}

export async function setActualLunch(
  date: string,
  departmentId: string,
  actualQuantity: number,
  token: string,
) {
  return fetchJson<DepartmentLunch>('/lunch/actual', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ date, departmentId, actualQuantity }),
  });
}

export async function fetchMonthlySummary(month: string, token: string) {
  return fetchJson<MonthlyDepartmentSummary[]>(
    `/lunch/monthly-summary?month=${encodeURIComponent(month)}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );
}

/** Engine.IO path; backend uses MEALS_PUBLIC_PATH + /socket.io (default /meals-rmg/socket.io). */
export function getSocketIoPath(): string {
  if (API_BASE.startsWith('http')) {
    return '/socket.io';
  }
  return `${PUBLIC_PREFIX}/socket.io`;
}

/** Socket.IO namespace URL (Nest gateway is /realtime; not under /api). */
export function getSocketIoUrl(): string {
  if (API_BASE.startsWith('http')) {
    return `${new URL(API_BASE).origin}/realtime`;
  }
  return '/realtime';
}

export { API_BASE };

