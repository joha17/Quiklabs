/**
 * Registro único de laboratorios (src/labs/registry.ts): de él salen las rutas, el catálogo, la calificación, los
 * módulos de interfaz y los textos. Un laboratorio nuevo no necesita migración de la base.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ATTEMPT_ID_PATTERN, LAB_IDS, LABS, isLabId, labNumber } from '../../labs/registry';
import { ADAPTERS, GRADED_LABS, seedFromAttemptId } from '../../practices/grading';
import { freshDb } from '../helpers/sqlite-d1';

const LOCALES = new URL('../../locales/es/', import.meta.url);

describe('registro de laboratorios', () => {
  it('ids únicos, con adaptador de calificación y número de tarjeta consecutivo', () => {
    expect(new Set(LAB_IDS).size).toBe(LAB_IDS.length);
    expect(GRADED_LABS).toEqual(LAB_IDS);
    for (const [i, l] of LABS.entries()) {
      expect(ADAPTERS[l.id], l.id).toBeTruthy();
      expect(labNumber(l.id)).toBe(i + 1);
      expect(isLabId(l.id)).toBe(true);
    }
    expect(isLabId('f99')).toBe(false);
    expect(isLabId('login')).toBe(false);
  });

  it('el id de intento de cada laboratorio da su semilla', () => {
    for (const id of LAB_IDS) {
      expect(seedFromAttemptId(`${id}-zz-abc`), id).toBe(parseInt('zz', 36));
      expect(ATTEMPT_ID_PATTERN.test(`x${id}-zz-abc`), id).toBe(false);
    }
  });

  it('los archivos de textos no repiten claves de primer nivel y cada laboratorio tiene título', () => {
    const owner = new Map<string, string>();
    const merged: Record<string, unknown> = {};
    for (const f of readdirSync(LOCALES).filter((n) => n.endsWith('.json'))) {
      const json = JSON.parse(readFileSync(new URL(f, LOCALES), 'utf8')) as Record<string, unknown>;
      for (const k of Object.keys(json)) {
        expect(owner.get(k), `«${k}» está en ${owner.get(k)} y en ${f}`).toBeUndefined();
        owner.set(k, f);
      }
      Object.assign(merged, json);
    }
    const labs = (merged.menu as { labs: Record<string, { title?: string }> }).labs;
    for (const id of LAB_IDS) expect(labs[id]?.title, id).toBeTruthy();
  });

  it('course_labs acepta un laboratorio nuevo sin migración (la lista la valida el Worker)', () => {
    const db = freshDb();
    const course = db.raw.prepare('SELECT id FROM courses LIMIT 1').get() as { id: string };
    db.raw.prepare("INSERT INTO course_labs (course_id, lab_id, opens_at, closes_at, mode) VALUES (?, 'zz01', '2026-01-01', '2026-02-01', 'PRACTICE')").run(course.id);
    expect(() => db.raw.prepare("INSERT INTO course_labs (course_id, lab_id, opens_at, closes_at, mode) VALUES (?, 'zz02', '2026-01-01', '2026-02-01', 'OTRO')").run(course.id)).toThrow();
  });
});
