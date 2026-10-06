/**
 * Plataforma académica (beta): API real (Hono) sobre SQLite con el esquema de D1 (migrations/) y los datos ficticios
 * del repositorio (worker/seed/seed.sql), con la fecha fija del 5 de octubre de 2026.
 */
import { describe, expect, it } from 'vitest';
import { createApp, COOKIE } from '../../../worker/app';
import { freshDb } from '../helpers/sqlite-d1';
import { packJson, unpackJson } from '../../../worker/core/pack';
import { replayTape, type AttemptSnapshot, type AttemptTape, type TapeEntry } from '../../practices/grading';
import { evaluateP4 } from '../../practices/practice-04/rubric';
import { emptyP4Notebook } from '../../practices/practice-04/notebook';
import type { P4Command } from '../../simulation/reaction-world/commands';
import { cmd4, run4, world4 } from '../helpers4';
const SECRET = 'x'.repeat(48);
const PW = { admin: 'Admin#Quiklabs2026', teacher: 'Docente2026!', student: 'Quimica2026!' };
const EMAIL = {
  admin: 'admin@quiklabs.example',
  laura: 'laura.mendez@uni.example',
  carlos: 'carlos.rojas@uni.example',
  valeria: 'valeria.solano@estudiante.uni.example',
  camila: 'camila.araya@estudiante.uni.example',
  daniela: 'daniela.chaves@estudiante.uni.example',
  josepablo: 'josepablo.ramirez@estudiante.uni.example',
  lucia: 'lucia.fernandez@estudiante.uni.example',
  mateo: 'mateo.calderon@estudiante.uni.example',
};

/** Un intento real de la Práctica 4 grabado como lo haría el runtime: estado final, cinta y cuerpo de la entrega. */
async function p4Attempt(mode: 'EVALUATION' | 'PRACTICE' = 'EVALUATION') {
  const options = { mode, seed: 4711 };
  const w = world4(options);
  const entries: TapeEntry[] = [];
  const c = (cmd: P4Command) => {
    entries.push([w.tick, structuredClone(cmd)]);
    cmd4(w, cmd);
  };
  c({ type: 'confirmPpe' });
  c({ type: 'inspect', target: 'beaker' });
  run4(w, 3);
  c({ type: 'inspect', target: 'extinguisher' });
  run4(w, 2);
  const notebook = emptyP4Notebook();
  const snapshot: AttemptSnapshot = { world: JSON.parse(JSON.stringify({ ...w, events: [] })), notebook, ppe: true, mode };
  const attemptId = `p4-${(4711).toString(36)}-t`;
  const tape: AttemptTape = { v: 1, labId: 'p4', attemptId, options, entries };
  const expected = evaluateP4(structuredClone(snapshot.world) as typeof w, notebook, { ppeConfirmed: true });
  const body = async () => ({
    courseId: 'c_qg1_01', labId: 'p4', mode: 'EVALUATION', attemptId, clientScore: expected.total,
    snapshot: await packJson(snapshot), tapeOptions: options, tape: await packJson(tape),
  });
  return { snapshot, tape, expected, body };
}

function platform(nowIso = '2026-10-05T18:00:00.000Z') {
  let now = new Date(nowIso);
  const db = freshDb();
  const app = createApp({ db, secret: SECRET, now: () => now });
  const call = async (method: string, path: string, opts: { body?: unknown; cookie?: string; raw?: string; type?: string } = {}) => {
    const headers: Record<string, string> = {};
    if (opts.cookie) headers.cookie = `${COOKIE}=${opts.cookie}`;
    if (opts.body !== undefined || opts.raw !== undefined) headers['content-type'] = opts.type ?? 'application/json';
    const res = await app.request(`http://localhost/api${path}`, { method, headers, body: opts.raw ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined) });
    const set = res.headers.get('set-cookie') ?? '';
    const token = new RegExp(`${COOKIE}=([^;]*)`).exec(set)?.[1];
    const json = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
    return { status: res.status, json: json as Record<string, unknown> & Array<Record<string, unknown>>, token };
  };
  const loginAs = async (email: string, password: string) => {
    const r = await call('POST', '/auth/login', { body: { email, password } });
    return { ...r, cookie: r.token! };
  };
  return { call, loginAs, setNow: (iso: string) => (now = new Date(iso)), db };
}

describe('autenticación', () => {
  it('no existe registro público: solo login', async () => {
    const p = platform();
    expect((await p.call('POST', '/auth/register', { body: { email: 'x@y.z', password: 'Abcdefghij1' } })).status).toBe(404);
    expect((await p.call('POST', '/auth/signup', { body: {} })).status).toBe(404);
  });

  it('el estado de la sesión no da error HTTP: null sin sesión, el usuario con sesión y el motivo si dejó de valer', async () => {
    const p = platform();
    expect(await p.call('GET', '/auth/session')).toMatchObject({ status: 200, json: { me: null } });
    const a = await p.loginAs(EMAIL.admin, PW.admin);
    expect(((await p.call('GET', '/auth/session', { cookie: a.cookie })).json.me as { user: { role: string } }).user.role).toBe('admin');
    const v = await p.loginAs(EMAIL.valeria, PW.student);
    await p.call('PATCH', '/admin/users/u_est01', { cookie: a.cookie, body: { status: 'suspended' } });
    expect((await p.call('GET', '/auth/session', { cookie: v.cookie })).json).toEqual({ me: null, reason: 'SESSION_EXPIRED' });
  });

  it('admin entra; contraseña o correo equivocados dan el mismo error; 5 fallos bloquean 15 min', async () => {
    const p = platform();
    const ok = await p.loginAs(EMAIL.admin, PW.admin);
    expect(ok.status).toBe(200);
    expect(ok.json.user).toMatchObject({ role: 'admin', email: EMAIL.admin });
    expect(JSON.stringify(ok.json)).not.toContain('passwordHash');
    expect((await p.call('POST', '/auth/login', { body: { email: 'nadie@uni.example', password: 'x' } })).json.error).toBe('INVALID_CREDENTIALS');
    for (let i = 0; i < 5; i++) expect((await p.call('POST', '/auth/login', { body: { email: EMAIL.laura, password: 'mala' } })).json.error).toBe('INVALID_CREDENTIALS');
    const locked = await p.call('POST', '/auth/login', { body: { email: EMAIL.laura, password: PW.teacher } });
    expect(locked.status).toBe(423);
    p.setNow('2026-10-05T18:16:00.000Z');
    expect((await p.loginAs(EMAIL.laura, PW.teacher)).status).toBe(200);
  });

  it('estudiantes: solo con matrícula activa en un curso vigente; suspendidos no entran', async () => {
    const p = platform();
    expect((await p.loginAs(EMAIL.valeria, PW.student)).status).toBe(200);
    expect((await p.loginAs(EMAIL.lucia, PW.student)).json.error).toBe('NOT_ENROLLED'); // curso 2026-I terminado
    expect((await p.loginAs(EMAIL.mateo, PW.student)).json.error).toBe('NOT_ENROLLED'); // retirado
    expect((await p.loginAs(EMAIL.daniela, PW.student)).json.error).toBe('ACCOUNT_SUSPENDED');
    // El motivo solo se revela con la contraseña correcta.
    expect((await p.loginAs(EMAIL.lucia, 'mala')).json.error).toBe('INVALID_CREDENTIALS');
  });

  it('primer ingreso: la contraseña asignada debe cambiarse antes de usar la plataforma', async () => {
    const p = platform();
    const s = await p.loginAs(EMAIL.josepablo, PW.student);
    expect((s.json.user as { mustChangePassword: boolean }).mustChangePassword).toBe(true);
    expect((await p.call('GET', '/student/courses', { cookie: s.cookie })).json.error).toBe('MUST_CHANGE_PASSWORD');
    expect((await p.call('POST', '/auth/password', { cookie: s.cookie, body: { current: PW.student, next: 'corta1' } })).json.error).toBe('PASSWORD_TOO_SHORT');
    const ch = await p.call('POST', '/auth/password', { cookie: s.cookie, body: { current: PW.student, next: 'NuevaClave2026' } });
    expect(ch.status).toBe(200);
    // La sesión anterior queda invalidada; la nueva ficha funciona.
    expect((await p.call('GET', '/student/courses', { cookie: s.cookie })).json.error).toBe('SESSION_EXPIRED');
    expect((await p.call('GET', '/student/courses', { cookie: ch.token })).status).toBe(200);
    expect((await p.loginAs(EMAIL.josepablo, 'NuevaClave2026')).status).toBe(200);
  });

  it('las escrituras exigen JSON (protección CSRF) y la ficha alterada se rechaza', async () => {
    const p = platform();
    expect((await p.call('POST', '/auth/login', { raw: `email=${EMAIL.admin}&password=${PW.admin}`, type: 'application/x-www-form-urlencoded' })).status).toBe(415);
    const a = await p.loginAs(EMAIL.admin, PW.admin);
    const forged = a.cookie.replace(/.$/, (ch) => (ch === 'A' ? 'B' : 'A'));
    expect((await p.call('GET', '/admin/users', { cookie: forged })).status).toBe(401);
    expect((await p.call('GET', '/admin/users')).status).toBe(401);
  });
});

describe('roles y permisos', () => {
  it('cada rol solo accede a sus rutas', async () => {
    const p = platform();
    const st = await p.loginAs(EMAIL.valeria, PW.student);
    const te = await p.loginAs(EMAIL.laura, PW.teacher);
    expect((await p.call('GET', '/admin/users', { cookie: st.cookie })).status).toBe(403);
    expect((await p.call('GET', '/admin/users', { cookie: te.cookie })).status).toBe(403);
    expect((await p.call('GET', '/teacher/courses', { cookie: st.cookie })).status).toBe(403);
    expect((await p.call('GET', '/student/courses', { cookie: te.cookie })).status).toBe(403);
  });

  it('prácticas visibles según el curso y sus fechas de apertura', async () => {
    const p = platform();
    const labs = (r: { json: Record<string, unknown> }) => (r.json.labs as Array<{ labId: string }>).map((l) => l.labId).sort();
    expect(labs(await p.loginAs(EMAIL.valeria, PW.student))).toEqual(['p2', 'p3', 'p4', 'p5', 'p6']); // grupo 01
    expect(labs(await p.loginAs(EMAIL.camila, PW.student))).toEqual(['p2', 'p3', 'p5', 'p6']); // grupo 02: P4 abre el 12/10
    expect(labs(await p.loginAs(EMAIL.laura, PW.teacher))).toEqual(['p2', 'p3', 'p4', 'p5', 'p6']);
  });
});

describe('administración', () => {
  it('alta de docente y estudiante con contraseña temporal, matrícula y primer ingreso', async () => {
    const p = platform();
    const a = await p.loginAs(EMAIL.admin, PW.admin);
    const t = await p.call('POST', '/admin/users', { cookie: a.cookie, body: { role: 'teacher', email: 'Nueva.Docente@uni.example', name: 'MSc. Ana Solís', code: 'D-2001' } });
    expect(t.status).toBe(201);
    expect((t.json.user as { email: string }).email).toBe('nueva.docente@uni.example');
    expect((await p.call('POST', '/admin/users', { cookie: a.cookie, body: { role: 'student', email: 'nueva.docente@uni.example', name: 'Duplicado' } })).json.error).toBe('EMAIL_TAKEN');
    const s = await p.call('POST', '/admin/users', { cookie: a.cookie, body: { role: 'student', email: 'nuevo@estudiante.uni.example', name: 'Pedro Nuevo', code: 'C01234' } });
    const sid = (s.json.user as { id: string }).id;
    // Sin matrícula todavía no puede entrar.
    expect((await p.loginAs('nuevo@estudiante.uni.example', s.json.temporaryPassword as string)).json.error).toBe('NOT_ENROLLED');
    expect((await p.call('POST', '/admin/courses/c_qg1_02/enrollments', { cookie: a.cookie, body: { studentIds: [sid] } })).status).toBe(200);
    const first = await p.loginAs('nuevo@estudiante.uni.example', s.json.temporaryPassword as string);
    expect(first.status).toBe(200);
    expect((first.json.user as { mustChangePassword: boolean }).mustChangePassword).toBe(true);
    const audit = await p.call('GET', '/admin/audit', { cookie: a.cookie });
    expect((audit.json as unknown as Array<{ action: string }>).map((e) => e.action)).toEqual(expect.arrayContaining(['user.create', 'enrollment.add']));
  });

  it('suspender, restablecer contraseña y no quedarse sin administradores', async () => {
    const p = platform();
    const a = await p.loginAs(EMAIL.admin, PW.admin);
    const v = await p.loginAs(EMAIL.valeria, PW.student);
    expect((await p.call('PATCH', '/admin/users/u_est01', { cookie: a.cookie, body: { status: 'suspended' } })).status).toBe(200);
    expect((await p.call('GET', '/student/courses', { cookie: v.cookie })).status).toBe(401); // sesión cerrada al suspender
    expect((await p.call('PATCH', '/admin/users/u_est01', { cookie: a.cookie, body: { status: 'active' } })).status).toBe(200);
    const reset = await p.call('POST', '/admin/users/u_est01/reset-password', { cookie: a.cookie, body: {} });
    expect((await p.loginAs(EMAIL.valeria, PW.student)).json.error).toBe('INVALID_CREDENTIALS');
    expect((await p.loginAs(EMAIL.valeria, reset.json.temporaryPassword as string)).status).toBe(200);
    expect((await p.call('PATCH', '/admin/users/u_admin', { cookie: a.cookie, body: { role: 'teacher' } })).json.error).toBe('CANNOT_DEMOTE_SELF');
  });

  it('importa el padrón en CSV, matricula y respeta el cupo de la licencia', async () => {
    const p = platform();
    const a = await p.loginAs(EMAIL.admin, PW.admin);
    const csv = 'carné,nombre,correo\nC10001,Ana Prueba Uno,ana.uno@estudiante.uni.example\nC10002,Beto Prueba Dos,beto.dos@estudiante.uni.example\nD-1042,Laura,laura.mendez@uni.example\nfila incompleta';
    const r = await p.call('POST', '/admin/users/import', { cookie: a.cookie, body: { csv, courseId: 'c_qg1_02' } });
    expect((r.json.created as unknown[]).length).toBe(2);
    expect(r.json.enrolled).toBe(2);
    expect((r.json.skipped as Array<{ reason: string }>).map((x) => x.reason)).toEqual(['NOT_A_STUDENT', 'MISSING_FIELDS']);
    const ov = await p.call('GET', '/admin/overview', { cookie: a.cookie });
    const used = (ov.json.seats as { used: number }).used;
    expect((await p.call('PATCH', '/admin/license', { cookie: a.cookie, body: { studentSeats: used - 1 } })).json.error).toBe('SEATS_BELOW_USAGE');
    await p.call('PATCH', '/admin/license', { cookie: a.cookie, body: { studentSeats: used } });
    expect((await p.call('POST', '/admin/courses/c_qg1_01/enrollments', { cookie: a.cookie, body: { studentIds: ['u_est10'] } })).json.error).toBe('NO_SEATS_LEFT');
  });

  it('licencia vencida: docentes y estudiantes no entran; el administrador sí', async () => {
    const p = platform('2027-07-02T12:00:00.000Z');
    expect((await p.loginAs(EMAIL.laura, PW.teacher)).json.error).toBe('LICENSE_INACTIVE');
    expect((await p.loginAs(EMAIL.admin, PW.admin)).status).toBe(200);
  });
});

describe('docentes y estudiantes', () => {
  it('entregas: solo prácticas abiertas del propio curso; el docente ve el libro de calificaciones de su grupo', async () => {
    const p = platform();
    const v = await p.loginAs(EMAIL.valeria, PW.student);
    const a = await p4Attempt();
    const ok = await p.call('POST', '/student/submissions', { cookie: v.cookie, body: await a.body() });
    expect(ok.status).toBe(201);
    // La nota es la que calcula el servidor con la rúbrica, no la que envía el navegador.
    expect(ok.json.score).toBeCloseTo(a.expected.total, 9);
    expect(ok.json).toMatchObject({ grading: 'SERVER', issues: [], replay: null });
    // Reenviar el mismo intento lo reemplaza.
    await p.call('POST', '/student/submissions', { cookie: v.cookie, body: await a.body() });
    expect((await p.call('GET', '/student/submissions', { cookie: v.cookie })).json.filter((s) => s.labId === 'p4')).toHaveLength(1);
    const c = await p.loginAs(EMAIL.camila, PW.student);
    expect((await p.call('POST', '/student/submissions', { cookie: c.cookie, body: { ...(await a.body()), courseId: 'c_qg1_02' } })).json.error).toBe('LAB_CLOSED');
    expect((await p.call('POST', '/student/submissions', { cookie: c.cookie, body: { ...(await a.body()), courseId: 'c_qg1_01', labId: 'p2' } })).json.error).toBe('NOT_ENROLLED');
    const laura = await p.loginAs(EMAIL.laura, PW.teacher);
    const gb = await p.call('GET', '/teacher/courses/c_qg1_01/gradebook', { cookie: laura.cookie });
    const row = (gb.json.rows as Array<{ student: { id: string }; cells: Record<string, { best: number } | null> }>).find((r) => r.student.id === 'u_est01')!;
    expect(row.cells.p4?.best).toBeCloseTo(a.expected.total, 9);
    expect(row.cells.p2?.best).toBeCloseTo(0.91);
    const carlos = await p.loginAs(EMAIL.carlos, PW.teacher);
    expect((await p.call('GET', '/teacher/courses/c_qg1_01/gradebook', { cookie: carlos.cookie })).json.error).toBe('NOT_YOUR_COURSE');
  });

  it('la nota enviada por el navegador se ignora y un estado manipulado queda marcado', async () => {
    const p = platform();
    const v = await p.loginAs(EMAIL.valeria, PW.student);
    const a = await p4Attempt();
    const r = await p.call('POST', '/student/submissions', { cookie: v.cookie, body: { ...(await a.body()), clientScore: 1, score: 1, components: [{ key: 'safety', score: 1, weight: 1 }] } });
    expect(r.json.score).toBeCloseTo(a.expected.total, 9);
    expect(r.json.issues).toEqual(['CLIENT_SCORE_MISMATCH']);
    // Cambiar los parámetros del mundo (p. ej., la concentración) o la semilla.
    const forged = structuredClone(a.snapshot);
    (forged.world as { params: { ambientC: number } }).params.ambientC += 5;
    const f = await p.call('POST', '/student/submissions', { cookie: v.cookie, body: { ...(await a.body()), snapshot: await packJson(forged) } });
    expect(f.json.issues).toContain('FIXED_STATE_CHANGED');
    const s = await p.call('POST', '/student/submissions', { cookie: v.cookie, body: { ...(await a.body()), attemptId: 'p4-zz-1' } });
    expect(s.json.issues).toContain('SEED_MISMATCH');
    // En Evaluación, un intento creado en modo Práctica.
    const prac = await p4Attempt('PRACTICE');
    expect((await p.call('POST', '/student/submissions', { cookie: v.cookie, body: await prac.body() })).json.issues).toContain('MODE_MISMATCH');
    // Sin estado o con un estado ilegible no hay entrega.
    expect((await p.call('POST', '/student/submissions', { cookie: v.cookie, body: { courseId: 'c_qg1_01', labId: 'p4', mode: 'EVALUATION', attemptId: 'x', score: 1 } })).json.error).toBe('INVALID_SUBMISSION');
    expect((await p.call('POST', '/student/submissions', { cookie: v.cookie, body: { ...(await a.body()), snapshot: 'bm8gZXMgZ3ppcA==' } })).json.error).toBe('INVALID_SNAPSHOT');
    expect((await p.call('POST', '/student/submissions', { cookie: v.cookie, body: { ...(await a.body()), snapshot: await packJson({ world: { tick: 1 }, notebook: {} }) } })).json.error).toBe('INVALID_SNAPSHOT');
  });

  it('el docente repite el intento en su navegador y el resultado queda en la entrega y en la auditoría', async () => {
    const p = platform();
    const v = await p.loginAs(EMAIL.valeria, PW.student);
    const a = await p4Attempt();
    const sub = (await p.call('POST', '/student/submissions', { cookie: v.cookie, body: await a.body() })).json;
    const laura = await p.loginAs(EMAIL.laura, PW.teacher);
    const list = (await p.call('GET', '/teacher/courses/c_qg1_01/submissions', { cookie: laura.cookie })).json;
    expect(list.find((x) => x.id === sub.id)).toMatchObject({ studentName: 'Valeria Solano Mora', hasTape: true, grading: 'SERVER' });
    const data = (await p.call('GET', `/teacher/submissions/${sub.id}/data`, { cookie: laura.cookie })).json as unknown as { snapshot: string; tape: string; submission: { score: number; components: Array<{ key: string; score: number; weight: number }> } };
    const out = await replayTape(await unpackJson<AttemptTape>(data.tape), await unpackJson<AttemptSnapshot>(data.snapshot), {
      total: data.submission.score, needsTeacherReview: [], components: data.submission.components.map((c) => ({ id: c.key, score: c.score, weight: c.weight, items: [] })),
    });
    expect(out).toMatchObject({ status: 'OK', exactState: true });
    const saved = await p.call('POST', `/teacher/submissions/${sub.id}/replay`, { cookie: laura.cookie, body: out });
    expect(saved.json.replay).toMatchObject({ status: 'OK', exactState: true, by: 'u_doc01' });
    const carlos = await p.loginAs(EMAIL.carlos, PW.teacher);
    expect((await p.call('GET', `/teacher/submissions/${sub.id}/data`, { cookie: carlos.cookie })).json.error).toBe('NOT_YOUR_COURSE');
    expect((await p.call('POST', `/teacher/submissions/${sub.id}/replay`, { cookie: laura.cookie, body: { status: 'GREAT' } })).json.error).toBe('INVALID_REPLAY');
    const admin = await p.loginAs(EMAIL.admin, PW.admin);
    const log = (await p.call('GET', '/admin/audit', { cookie: admin.cookie })).json;
    expect(log.some((e) => e.action === 'submission.replay' && e.target === sub.id && e.detail?.toString().startsWith('OK'))).toBe(true);
  });

  it('el docente abre una práctica de su grupo y queda disponible para sus estudiantes', async () => {
    const p = platform();
    const carlos = await p.loginAs(EMAIL.carlos, PW.teacher);
    const courses = await p.call('GET', '/teacher/courses', { cookie: carlos.cookie });
    const course = (courses.json as unknown as Array<{ id: string; labs: Array<{ labId: string; opensAt: string }> }>)[0];
    const labs = course.labs.map((l) => (l.labId === 'p4' ? { ...l, opensAt: '2026-10-05T06:00:00.000Z' } : l));
    expect((await p.call('PUT', `/teacher/courses/${course.id}/labs`, { cookie: carlos.cookie, body: { labs } })).status).toBe(200);
    const c = await p.loginAs(EMAIL.camila, PW.student);
    expect((c.json.labs as Array<{ labId: string }>).map((l) => l.labId)).toContain('p4');
  });
});

describe('base de datos (esquema de D1)', () => {
  it('la base impone correos y carnés únicos aunque el código no lo revisara, y los lotes son atómicos', async () => {
    const p = platform();
    const raw = p.db.raw;
    const insert = (id: string, email: string, code: string | null) =>
      raw.prepare(`INSERT INTO users (id, role, email, name, code, status, password_hash, created_at) VALUES (?, 'student', ?, 'Duplicado', ?, 'active', 'x', '2026-10-05')`).run(id, email, code);
    expect(() => insert('u_dup1', 'VALERIA.SOLANO@estudiante.uni.example', null)).toThrow(/UNIQUE/); // correo sin distinguir mayúsculas
    expect(() => insert('u_dup2', 'otra@estudiante.uni.example', 'B60101')).toThrow(/UNIQUE/);
    // Un lote con una sentencia inválida no deja nada a medias.
    const before = (raw.prepare('SELECT COUNT(*) AS n FROM audit').get() as { n: number }).n;
    await expect(p.db.batch([
      p.db.prepare(`INSERT INTO audit (id, at, actor_id, action) VALUES ('a_x', '2026', 'u_admin', 'prueba')`),
      p.db.prepare(`INSERT INTO enrollments (id, course_id, student_id, status, enrolled_at, updated_at) VALUES ('e01', 'c', 's', 'active', 'x', 'x')`),
    ])).rejects.toThrow();
    expect((raw.prepare('SELECT COUNT(*) AS n FROM audit').get() as { n: number }).n).toBe(before);
  });

  it('las acciones del administrador quedan en tablas: usuario, matrícula y auditoría', async () => {
    const p = platform();
    const a = await p.loginAs(EMAIL.admin, PW.admin);
    const s = await p.call('POST', '/admin/users', { cookie: a.cookie, body: { role: 'student', email: 'tabla@estudiante.uni.example', name: 'Prueba Tabla', code: 'T0001' } });
    const id = (s.json.user as { id: string }).id;
    await p.call('POST', '/admin/courses/c_qg1_02/enrollments', { cookie: a.cookie, body: { studentIds: [id] } });
    expect(p.db.raw.prepare('SELECT role, must_change_password AS m FROM users WHERE id = ?').get(id)).toEqual({ role: 'student', m: 1 });
    expect(p.db.raw.prepare("SELECT status FROM enrollments WHERE course_id = 'c_qg1_02' AND student_id = ?").get(id)).toEqual({ status: 'active' });
    const actions = (p.db.raw.prepare("SELECT action FROM audit WHERE actor_id = 'u_admin' ORDER BY rowid").all() as Array<{ action: string }>).map((r) => r.action);
    expect(actions).toEqual(expect.arrayContaining(['user.create', 'enrollment.add']));
  });
});
