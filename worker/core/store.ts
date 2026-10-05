/**
 * Almacenamiento de la beta: un único documento JSON en Cloudflare KV (clave `db:v1`). Si KV está vacío se parte de
 * los datos iniciales del repositorio (`worker/seed/data.json`). KV es eventualmente consistente y la última escritura
 * gana: suficiente para una beta con pocos administradores; para producción conviene una base de datos (D1).
 */
import type { Db } from './types';

export interface KvLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}

export const DB_KEY = 'db:v1';

export async function loadDb(kv: KvLike, seed: Db): Promise<Db> {
  const raw = await kv.get(DB_KEY);
  if (!raw) return structuredClone(seed);
  return JSON.parse(raw) as Db;
}

export async function saveDb(kv: KvLike, db: Db): Promise<void> {
  db.version += 1;
  // La auditoría se recorta para que el documento no crezca sin límite.
  if (db.audit.length > 2000) db.audit = db.audit.slice(-2000);
  await kv.put(DB_KEY, JSON.stringify(db));
}

/** KV en memoria (pruebas y desarrollo sin Wrangler). */
export class MemoryKv implements KvLike {
  private m = new Map<string, string>();
  async get(key: string) {
    return this.m.get(key) ?? null;
  }
  async put(key: string, value: string) {
    this.m.set(key, value);
  }
}
