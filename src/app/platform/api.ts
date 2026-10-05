/**
 * Cliente de la API de la plataforma (`/api`, Worker de Cloudflare). La sesión viaja en una cookie httpOnly;
 * las escrituras van siempre en JSON.
 */
import type { Me } from '../../../worker/core/types';

export class ApiFailure extends Error {
  constructor(public status: number, public code: string, public detail: Record<string, unknown> = {}) {
    super(code);
  }
}

export async function api<T>(method: 'GET' | 'POST' | 'PATCH' | 'PUT', path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined || method !== 'GET' ? { 'content-type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : method !== 'GET' ? '{}' : undefined,
    });
  } catch {
    throw new ApiFailure(0, 'NETWORK_ERROR');
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const { error, ...rest } = data;
    throw new ApiFailure(res.status, typeof error === 'string' ? error : 'HTTP_' + res.status, rest);
  }
  return data as T;
}

export type { Me };
