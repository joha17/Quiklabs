/**
 * B10 en la plataforma, de punta a punta contra el API real: el docente abre la práctica, el estudiante entrega un intento grabado,
 * el servidor recalcula la nota y el docente repite la cinta. También lo que debe rechazarse.
 */
import { describe, expect, it, vi } from 'vitest';
import type { TapeEntry } from '../../practices/grading';

const rec = { world: null as unknown, entries: [] as TapeEntry[], depth: 0 };

vi.mock('../../simulation/animal-world/world', async (orig) => {
  const m = await orig<typeof import('../../simulation/animal-world/world')>();
  return {
    ...m,
    dispatchAnimal: (w: never, c: never) => {
      if (w === rec.world && rec.depth === 0) rec.entries.push([(w as { tick: number }).tick, JSON.parse(JSON.stringify(c))]);
      rec.depth++;
      try {
        return m.dispatchAnimal(w, c);
      } finally {
        rec.depth--;
      }
    },
  };
});

const { createApp, COOKIE } = await import('../../../worker/app');
const { freshDb } = await import('../helpers/sqlite-d1');
const { packJson, unpackJson } = await import('../../../worker/core/pack');
const { replayTape } = await import('../../practices/grading');
const { evaluateB10 } = await import('../../practices/practice-b10/rubric');
const { emptyB10Notebook } = await import('../../practices/practice-b10/notebook');
const h = await import('../helpersB10');

const COURSE = 'c_qg1_01';
const LAURA = ['laura.mendez@uni.example', 'Docente2026!'] as const;
const VALERIA = ['valeria.solano@estudiante.uni.example', 'Quimica2026!'] as const;
const CAMILA = ['camila.araya@estudiante.uni.example', 'Quimica2026!'] as const;
const CARLOS = ['carlos.rojas@uni.example', 'Docente2026!'] as const;

function platform() {
  const app = createApp({ db: freshDb(), secret: 'x'.repeat(48), now: () => new Date('2026-10-20T18:00:00.000Z') });
  const call = async (method: string, path: string, cookie?: string, body?: unknown) => {
    const headers: Record<string, string> = {};
    if (cookie) headers.cookie = `${COOKIE}=${cookie}`;
    if (body !== undefined) headers['content-type'] = 'application/json';
    const res = await app.request(`http://localhost/api${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    const token = new RegExp(`${COOKIE}=([^;]*)`).exec(res.headers.get('set-cookie') ?? '')?.[1];
    const json = (res.headers.get('content-type')?.includes('json') ? await res.json() : null) as any;
    return { status: res.status, json, token };
  };
  const login = async ([email, password]: readonly [string, string]) => {
    const r = await call('POST', '/auth/login', undefined, { email, password });
    return { json: r.json, cookie: r.token! };
  };
  const openB10 = async (cookie: string, mode = 'PRACTICE', opensAt = '2026-10-01T06:00:00.000Z', closesAt = '2026-12-12T05:59:00.000Z') => {
    const courses = (await call('GET', '/teacher/courses', cookie)).json as Array<{ id: string; labs: Array<{ labId: string }> }>;
    const course = courses.find((c) => c.id === COURSE)!;
    const labs = [...course.labs.filter((l) => l.labId !== 'b10'), { labId: 'b10', opensAt, closesAt, mode }];
    return call('PUT', `/teacher/courses/${COURSE}/labs`, cookie, { labs });
  };
  return { call, login, openB10 };
}

/** El intento ideal grabado como lo haría el runtime. */
function attempt(seed = 2610, mode: 'PRACTICE' | 'EVALUATION' = 'PRACTICE') {
  const options = { mode, seed, scenarios: [] };
  rec.entries = [];
  const w0 = h.worldB10(options);
  rec.world = w0;
  const out = h.idealRouteB10(w0);
  rec.world = null;
  const notebook = emptyB10Notebook('t');
  h.fillNotebookB10(out.w, notebook, out.res);
  const snapshot = { world: JSON.parse(JSON.stringify({ ...out.w, events: [] })), notebook, ppe: true, mode };
  const attemptId = `b10-${seed.toString(36)}-t`;
  const tape = { v: 1 as const, labId: 'b10' as const, attemptId, options, entries: rec.entries };
  const expected = evaluateB10(structuredClone(snapshot.world), notebook).total;
  const body = async (over: Record<string, unknown> = {}) => ({
    courseId: COURSE, labId: 'b10', mode, attemptId, clientScore: expected,
    snapshot: await packJson(snapshot), tapeOptions: options, tape: await packJson(tape), ...over,
  });
  return { expected, body, snapshot };
}

describe('B10 en la plataforma', () => {
  it('abrir, entregar, calificar en el servidor, ver en el libro y repetir la cinta', async () => {
    const p = platform();
    const laura = await p.login(LAURA);
    const before = await p.login(VALERIA);
    expect(before.json.labs.map((l: { labId: string }) => l.labId)).not.toContain('b10');
    expect((await p.openB10(laura.cookie)).status).toBe(200);
    const v = await p.login(VALERIA);
    expect(v.json.labs.map((l: { labId: string }) => l.labId)).toContain('b10');

    const a = attempt();
    const sub = await p.call('POST', '/student/submissions', v.cookie, await a.body());
    expect(sub.status).toBeLessThan(300);
    expect(sub.json.score).toBeCloseTo(a.expected, 5);
    expect(sub.json.score).toBeGreaterThan(0.85);
    expect(sub.json.issues).toEqual([]);

    const list = (await p.call('GET', `/teacher/courses/${COURSE}/submissions`, laura.cookie)).json as Array<Record<string, unknown>>;
    expect(list.find((x) => x.id === sub.json.id)).toMatchObject({ labId: 'b10', hasTape: true, grading: 'SERVER' });

    const data = (await p.call('GET', `/teacher/submissions/${sub.json.id}/data`, laura.cookie)).json;
    const out = await replayTape(await unpackJson(data.tape), await unpackJson(data.snapshot), {
      total: data.submission.score, needsTeacherReview: [],
      components: data.submission.components.map((c: { key: string; score: number; weight: number }) => ({ id: c.key, score: c.score, weight: c.weight, items: [] })),
    });
    expect(out).toMatchObject({ status: 'OK', exactState: true });
    const saved = await p.call('POST', `/teacher/submissions/${sub.json.id}/replay`, laura.cookie, out);
    expect(saved.json.replay).toMatchObject({ status: 'OK', exactState: true });

    const carlos = await p.login(CARLOS);
    expect((await p.call('GET', `/teacher/submissions/${sub.json.id}/data`, carlos.cookie)).json.error).toBe('NOT_YOUR_COURSE');
  }, 120000);

  it('sin abrir, o fuera de su curso, no se puede entregar', async () => {
    const p = platform();
    const a = attempt();
    const v = await p.login(VALERIA);
    expect((await p.call('POST', '/student/submissions', v.cookie, await a.body())).status).toBeGreaterThanOrEqual(400);
    await p.openB10((await p.login(LAURA)).cookie);
    const c = await p.login(CAMILA);
    expect((await p.call('POST', '/student/submissions', c.cookie, await a.body())).status).toBeGreaterThanOrEqual(400);
  }, 120000);

  it('la práctica cerrada rechaza la entrega', async () => {
    const p = platform();
    await p.openB10((await p.login(LAURA)).cookie, 'PRACTICE', '2026-10-01T06:00:00.000Z', '2026-10-10T06:00:00.000Z');
    const v = await p.login(VALERIA);
    expect((await p.call('POST', '/student/submissions', v.cookie, await attempt().body())).status).toBeGreaterThanOrEqual(400);
  }, 120000);

  it('la nota del navegador se ignora, y una entrega en práctica no vale donde se exige evaluación', async () => {
    const p = platform();
    await p.openB10((await p.login(LAURA)).cookie);
    const v = await p.login(VALERIA);
    const a = attempt();
    const inflated = await p.call('POST', '/student/submissions', v.cookie, await a.body({ clientScore: 1 }));
    expect(inflated.json.score).toBeCloseTo(a.expected, 5);
    expect(inflated.json.issues).toContain('CLIENT_SCORE_MISMATCH');

    const q = platform();
    await q.openB10((await q.login(LAURA)).cookie, 'EVALUATION');
    const v2 = await q.login(VALERIA);
    const r = await q.call('POST', '/student/submissions', v2.cookie, await attempt().body({ mode: 'EVALUATION' }));
    expect(r.status >= 400 || r.json.issues?.includes('MODE_MISMATCH')).toBe(true);
  }, 120000);
});
