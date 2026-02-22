const API_BASE = import.meta.env.VITE_BANK_API_BASE || 'http://localhost:3000';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

export function getToken(): string | null {
  return sessionStorage.getItem('zn_bank_token');
}

export function setToken(token: string): void {
  sessionStorage.setItem('zn_bank_token', token);
}

export function clearToken(): void {
  sessionStorage.removeItem('zn_bank_token');
}

export function getDeviceFingerprint(): string | null {
  return sessionStorage.getItem('zn_device_fingerprint');
}

export function setDeviceFingerprint(fingerprint: string): void {
  sessionStorage.setItem('zn_device_fingerprint', fingerprint);
}

export function clearDeviceFingerprint(): void {
  sessionStorage.removeItem('zn_device_fingerprint');
}

export async function request<T>(path: string, method: HttpMethod, body?: unknown): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || response.statusText);
  }

  return response.json() as Promise<T>;
}

export async function get<T>(path: string): Promise<T> {
  return request<T>(path, 'GET');
}

export async function post<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, 'POST', body);
}
