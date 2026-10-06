/**
 * Base de datos de prueba: SQLite de Node (`node:sqlite`) con la misma interfaz mínima que Cloudflare D1 (`SqlDb`),
 * las migraciones de migrations/ y los datos ficticios de worker/seed/seed.sql. Así las pruebas de la API ejecutan las
 * mismas consultas SQL que producción.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import type { SqlDb, SqlStmt } from '../../../worker/core/repo';

const ROOT = new URL('../../../', import.meta.url);

class Stmt implements SqlStmt {
  constructor(private db: DatabaseSync, private sql: string, private params: SQLInputValue[] = []) {}
  bind(...values: unknown[]): SqlStmt {
    return new Stmt(this.db, this.sql, values.map((v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : (v as SQLInputValue))));
  }
  async first<T>(): Promise<T | null> {
    return (this.db.prepare(this.sql).get(...this.params) as T | undefined) ?? null;
  }
  async all<T>(): Promise<{ results: T[] }> {
    return { results: this.db.prepare(this.sql).all(...this.params) as T[] };
  }
  async run(): Promise<unknown> {
    return this.db.prepare(this.sql).run(...this.params);
  }
  /** Ejecución síncrona para los lotes (dentro de una transacción). */
  exec() {
    return this.db.prepare(this.sql).run(...this.params);
  }
}

class SqliteD1 implements SqlDb {
  constructor(readonly raw: DatabaseSync) {}
  prepare(sql: string): SqlStmt {
    return new Stmt(this.raw, sql);
  }
  /** Como D1: el lote es atómico (todo o nada). */
  async batch(stmts: SqlStmt[]): Promise<unknown[]> {
    this.raw.exec('BEGIN');
    try {
      const out = stmts.map((s) => (s as Stmt).exec());
      this.raw.exec('COMMIT');
      return out;
    } catch (e) {
      this.raw.exec('ROLLBACK');
      throw e;
    }
  }
}

export function freshDb(opts: { seed?: boolean } = {}): SqliteD1 {
  const raw = new DatabaseSync(':memory:');
  raw.exec('PRAGMA foreign_keys = ON');
  const dir = new URL('migrations/', ROOT);
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) raw.exec(readFileSync(new URL(f, dir), 'utf8'));
  if (opts.seed !== false) raw.exec(readFileSync(new URL('worker/seed/seed.sql', ROOT), 'utf8'));
  return new SqliteD1(raw);
}
