/**
 * Worker de Cloudflare: `/api/*` va a la API de la plataforma; todo lo demás lo sirven los archivos estáticos de Vite
 * (wrangler.jsonc: `assets.run_worker_first`). Los datos viven en D1 (`DB`) y la sesión se firma con
 * `SESSION_SECRET` (secreto de Wrangler; en local, `.dev.vars`). Las fotos del ocular, en R2 (`PHOTOS`).
 */
import { createApp } from './app';
import type { SqlDb } from './core/repo';
import type { PhotoStore } from './core/service';

interface Env {
  ASSETS: { fetch(req: Request): Promise<Response> };
  DB: D1Database;
  PHOTOS?: R2Bucket;
  SESSION_SECRET?: string;
}

/** R2 como almacén de las fotos del ocular. */
const r2Store = (b: R2Bucket): PhotoStore => ({
  put: async (key, bytes, contentType) => void (await b.put(key, bytes, { httpMetadata: { contentType } })),
  get: async (key) => {
    const o = await b.get(key);
    return o ? { body: o.body, contentType: o.httpMetadata?.contentType ?? 'application/octet-stream' } : null;
  },
  delete: (key) => b.delete(key),
});

let cached: { secret: string; app: ReturnType<typeof createApp> } | null = null;

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
    if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) {
      return Response.json({ error: 'SERVER_NOT_CONFIGURED' }, { status: 503 });
    }
    if (!cached || cached.secret !== env.SESSION_SECRET) {
      cached = { secret: env.SESSION_SECRET, app: createApp({ db: env.DB as unknown as SqlDb, secret: env.SESSION_SECRET, photos: env.PHOTOS ? r2Store(env.PHOTOS) : undefined }) };
    }
    return cached.app.fetch(req);
  },
};
