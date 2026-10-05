/**
 * API de la plataforma (Hono). Se crea con sus dependencias (KV, secreto, datos iniciales, reloj) para poder probarla
 * en Node con un KV en memoria. Rutas bajo `/api`:
 *   auth      login · logout · me · password
 *   admin     overview · users (+ import, reset-password, unlock) · courses (+ roster, enrollments, gradebook)
 *             enrollments · license · audit
 *   teacher   courses · courses/:id/labs · courses/:id/gradebook
 *   student   courses · submissions
 */
import { Hono, type Context, type MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { signSession, verifySession } from './core/crypto';
import { loadDb, saveDb, type KvLike } from './core/store';
import {
  ApiError, accessBlock, changePassword, createCourse, createUser, enroll, gradebook, importStudents, login, me, overview,
  resetPassword, roster, setCourseLabs, setEnrollmentStatus, studentCourses, studentSubmissions, submit, teacherCourses,
  unlockUser, updateCourse, updateLicense, updateUser,
} from './core/service';
import { publicUser, type Db, type Role, type User } from './core/types';

export interface AppDeps {
  kv: KvLike;
  secret: string;
  seed: Db;
  now?: () => Date;
}

export const COOKIE = 'ql_session';
const SESSION_HOURS = 8;

type Vars = { db: Db; user: User };
type C = Context<{ Variables: Vars }>;

export function createApp(deps: AppDeps) {
  const now = deps.now ?? (() => new Date());
  const app = new Hono<{ Variables: Vars }>().basePath('/api');

  app.onError((err, c) => {
    if (err instanceof ApiError) return c.json({ error: err.code, ...(err.detail ?? {}) }, err.status as 400);
    console.error(err);
    return c.json({ error: 'INTERNAL_ERROR' }, 500);
  });
  app.notFound((c) => c.json({ error: 'NOT_FOUND' }, 404));

  // Escrituras solo con JSON: un formulario de otro sitio no puede enviar application/json sin preflight (CSRF).
  app.use('*', async (c, next) => {
    if (c.req.method !== 'GET' && c.req.method !== 'HEAD' && !(c.req.header('content-type') ?? '').includes('application/json')) {
      throw new ApiError(415, 'JSON_REQUIRED');
    }
    await next();
  });

  const issue = async (c: C, u: User) => {
    const token = await signSession({ sub: u.id, role: u.role, ver: u.tokenVersion, exp: Math.floor(now().getTime() / 1000) + SESSION_HOURS * 3600 }, deps.secret);
    const url = new URL(c.req.url);
    setCookie(c, COOKIE, token, {
      httpOnly: true, sameSite: 'Lax', path: '/', maxAge: SESSION_HOURS * 3600,
      secure: url.protocol === 'https:' || url.hostname === 'localhost',
    });
  };

  /** Sesión válida, usuario activo, con acceso vigente y sin cambio de contraseña pendiente (salvo `allowPending`). */
  const auth = (opts: { roles?: Role[]; allowPending?: boolean } = {}): MiddlewareHandler<{ Variables: Vars }> => async (c, next) => {
    const token = getCookie(c, COOKIE);
    const claims = token ? await verifySession(token, deps.secret, Math.floor(now().getTime() / 1000)) : null;
    if (!claims) throw new ApiError(401, 'NOT_AUTHENTICATED');
    const db = await loadDb(deps.kv, deps.seed);
    const u = db.users.find((x) => x.id === claims.sub);
    if (!u || u.tokenVersion !== claims.ver) {
      deleteCookie(c, COOKIE, { path: '/' });
      throw new ApiError(401, 'SESSION_EXPIRED');
    }
    const block = accessBlock(db, u, now());
    if (block) {
      deleteCookie(c, COOKIE, { path: '/' });
      throw new ApiError(403, block);
    }
    if (u.mustChangePassword && !opts.allowPending) throw new ApiError(403, 'MUST_CHANGE_PASSWORD');
    if (opts.roles && !opts.roles.includes(u.role)) throw new ApiError(403, 'FORBIDDEN');
    c.set('db', db);
    c.set('user', u);
    await next();
  };
  const persist = (c: C) => saveDb(deps.kv, c.get('db'));
  const body = async <T>(c: C): Promise<T> => {
    try {
      return (await c.req.json()) as T;
    } catch {
      throw new ApiError(400, 'INVALID_JSON');
    }
  };

  // ── Autenticación (no hay registro: las cuentas las crea el administrador) ──
  app.post('/auth/login', async (c) => {
    const { email, password } = await body<{ email?: string; password?: string }>(c);
    if (!email || !password) throw new ApiError(400, 'MISSING_CREDENTIALS');
    const db = await loadDb(deps.kv, deps.seed);
    try {
      const u = await login(db, email, password, now());
      await saveDb(deps.kv, db);
      await issue(c, u);
      return c.json(me(db, u, now()));
    } catch (e) {
      await saveDb(deps.kv, db); // contadores de intentos fallidos y bloqueos
      throw e;
    }
  });

  app.post('/auth/logout', (c) => {
    deleteCookie(c, COOKIE, { path: '/' });
    return c.json({ ok: true });
  });

  app.get('/auth/me', auth({ allowPending: true }), (c) => c.json(me(c.get('db'), c.get('user'), now())));

  app.post('/auth/password', auth({ allowPending: true }), async (c) => {
    const { current, next } = await body<{ current?: string; next?: string }>(c);
    if (!current || !next) throw new ApiError(400, 'MISSING_FIELDS');
    const u = c.get('user');
    await changePassword(c.get('db'), u, current, next);
    await persist(c);
    await issue(c, u);
    return c.json(me(c.get('db'), u, now()));
  });

  // ── Administración ──
  const admin = auth({ roles: ['admin'] });
  app.get('/admin/overview', admin, (c) => c.json(overview(c.get('db'), now())));
  app.get('/admin/users', admin, (c) => c.json(c.get('db').users.map(publicUser)));
  app.post('/admin/users', admin, async (c) => {
    const r = await createUser(c.get('db'), c.get('user'), await body(c), now());
    await persist(c);
    return c.json({ user: publicUser(r.user), temporaryPassword: r.temporaryPassword }, 201);
  });
  app.patch('/admin/users/:id', admin, async (c) => {
    const u = updateUser(c.get('db'), c.get('user'), c.req.param('id'), await body(c));
    await persist(c);
    return c.json(publicUser(u));
  });
  app.post('/admin/users/:id/reset-password', admin, async (c) => {
    const temp = await resetPassword(c.get('db'), c.get('user'), c.req.param('id'));
    await persist(c);
    return c.json({ temporaryPassword: temp });
  });
  app.post('/admin/users/:id/unlock', admin, async (c) => {
    unlockUser(c.get('db'), c.get('user'), c.req.param('id'));
    await persist(c);
    return c.json({ ok: true });
  });
  app.post('/admin/users/import', admin, async (c) => {
    const { csv, courseId } = await body<{ csv?: string; courseId?: string | null }>(c);
    if (!csv) throw new ApiError(400, 'MISSING_CSV');
    const r = await importStudents(c.get('db'), c.get('user'), csv, courseId || null, now());
    await persist(c);
    return c.json(r);
  });
  app.get('/admin/courses', admin, (c) => {
    const db = c.get('db');
    return c.json(db.courses.map((x) => ({ ...x, enrolled: db.enrollments.filter((e) => e.courseId === x.id && e.status === 'active').length })));
  });
  app.post('/admin/courses', admin, async (c) => {
    const course = createCourse(c.get('db'), c.get('user'), await body(c));
    await persist(c);
    return c.json(course, 201);
  });
  app.patch('/admin/courses/:id', admin, async (c) => {
    const course = updateCourse(c.get('db'), c.get('user'), c.req.param('id'), await body(c));
    await persist(c);
    return c.json(course);
  });
  app.get('/admin/courses/:id/roster', admin, (c) => c.json(roster(c.get('db'), c.req.param('id'))));
  app.get('/admin/courses/:id/gradebook', admin, (c) => c.json(gradebook(c.get('db'), c.get('user'), c.req.param('id'))));
  app.post('/admin/courses/:id/enrollments', admin, async (c) => {
    const { studentIds } = await body<{ studentIds?: string[] }>(c);
    if (!Array.isArray(studentIds) || studentIds.length === 0) throw new ApiError(400, 'MISSING_STUDENTS');
    enroll(c.get('db'), c.get('user'), c.req.param('id'), studentIds, now());
    await persist(c);
    return c.json(roster(c.get('db'), c.req.param('id')));
  });
  app.patch('/admin/enrollments/:id', admin, async (c) => {
    const { status } = await body<{ status?: 'active' | 'withdrawn' | 'completed' }>(c);
    if (!status) throw new ApiError(400, 'MISSING_STATUS');
    setEnrollmentStatus(c.get('db'), c.get('user'), c.req.param('id'), status, now());
    await persist(c);
    return c.json({ ok: true });
  });
  app.get('/admin/license', admin, (c) => c.json(c.get('db').license));
  app.patch('/admin/license', admin, async (c) => {
    updateLicense(c.get('db'), c.get('user'), await body(c));
    await persist(c);
    return c.json(c.get('db').license);
  });
  app.get('/admin/audit', admin, (c) => {
    const limit = Math.min(500, Number(c.req.query('limit') ?? 200) || 200);
    return c.json(c.get('db').audit.slice(-limit).reverse());
  });

  // ── Docentes ──
  const teacher = auth({ roles: ['teacher'] });
  app.get('/teacher/courses', teacher, (c) => c.json(teacherCourses(c.get('db'), c.get('user'), now())));
  app.put('/teacher/courses/:id/labs', teacher, async (c) => {
    const { labs } = await body<{ labs?: unknown }>(c);
    if (!Array.isArray(labs)) throw new ApiError(400, 'MISSING_LABS');
    const course = setCourseLabs(c.get('db'), c.get('user'), c.req.param('id'), labs);
    await persist(c);
    return c.json(course);
  });
  app.get('/teacher/courses/:id/gradebook', teacher, (c) => c.json(gradebook(c.get('db'), c.get('user'), c.req.param('id'))));

  // ── Estudiantes ──
  const student = auth({ roles: ['student'] });
  app.get('/student/courses', student, (c) => c.json(studentCourses(c.get('db'), c.get('user'), now())));
  app.get('/student/submissions', student, (c) => c.json(studentSubmissions(c.get('db'), c.get('user'))));
  app.post('/student/submissions', student, async (c) => {
    const s = submit(c.get('db'), c.get('user'), await body(c), now());
    await persist(c);
    return c.json(s, 201);
  });

  return app;
}
