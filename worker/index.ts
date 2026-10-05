/**
 * Worker de Cloudflare: `/api/*` va a la API de la plataforma; todo lo demás lo sirven los archivos estáticos de Vite
 * (wrangler.jsonc: `assets.run_worker_first`). Los datos viven en KV (`DATA`) y la sesión se firma con
 * `SESSION_SECRET` (secreto de Wrangler; en local, `.dev.vars`).
 */
import { createApp } from './app';
import type { KvLike } from './core/store';
import type { Db } from './core/types';
import seed from './seed/data.json';

interface Env {
  ASSETS: { fetch(req: Request): Promise<Response> };
  DATA: KvLike;
  SESSION_SECRET?: string;
}

let cached: { secret: string; app: ReturnType<typeof createApp> } | null = null;

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
    if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) {
      return Response.json({ error: 'SERVER_NOT_CONFIGURED' }, { status: 503 });
    }
    if (!cached || cached.secret !== env.SESSION_SECRET) {
      cached = { secret: env.SESSION_SECRET, app: createApp({ kv: env.DATA, secret: env.SESSION_SECRET, seed: seed as Db }) };
    }
    return cached.app.fetch(req);
  },
};
