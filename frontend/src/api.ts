const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:3000';

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
  departments: {
    departmentId: string;
    totalQuantity: number;
    updatedAt: string;
    updatedBy: string | null;
  }[];
};

export type DepartmentLunch = {
  id: string;
  departmentId: string;
  date: string;
  totalQuantity: number;
  updatedAt: string | null;
  updatedBy: string | null;
};

async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${input}`, init);
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || 'Request failed');
  }
  return (await response.json()) as T;
}

export async function login(username: string, password: string) {
  return fetchJson<LoginResponse>('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
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

export async function setDepartmentLunch(
  date: string,
  totalQuantity: number,
  token: string,
) {
  return fetchJson<DepartmentLunch>('/lunch/department', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ date, totalQuantity }),
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

export { API_BASE };

