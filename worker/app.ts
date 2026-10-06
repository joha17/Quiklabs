/**
 * API de la plataforma (Hono) sobre Cloudflare D1. Se crea con sus dependencias (base de datos, secreto, reloj) para
 * poder probarla en Node con SQLite. Rutas bajo `/api`:
 *   auth      login · logout · me · session · password
 *   admin     overview · users (+ import, reset-password, unlock) · courses (+ roster, enrollments, gradebook)
 *             enrollments · license · audit
 *   teacher   courses · courses/:id/labs · courses/:id/gradebook · courses/:id/submissions
 *             submissions/:id/data (estado y cinta para repetir el intento) · submissions/:id/replay
 *   student   courses · submissions (la nota la calcula el servidor)
 */
import { Hono, type Context, type MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { signSession, verifySession } from './core/crypto';
import { Repo, type SqlDb } from './core/repo';
import {
  ApiError, accessBlock, adminCourses, auditLog, changePassword, createCourse, createUser, enroll, gradebook, importStudents,
  login, me, overview, resetPassword, roster, setCourseLabs, setEnrollmentStatus, studentCourses, studentSubmissions, submit,
  courseSubmissions, recordReplay, submissionReplayData, teacherCourses, unlockUser, updateCourse, updateLicense, updateUser,
} from './core/service';
import { publicUser, type Role, type User } from './core/types';

export interface AppDeps {
  db: SqlDb;
  secret: string;
  now?: () => Date;
}

export const COOKIE = 'ql_session';
const SESSION_HOURS = 8;

type Vars = { user: User };
type C = Context<{ Variables: Vars }>;

export function createApp(deps: AppDeps) {
  const now = deps.now ?? (() => new Date());
  const repo = new Repo(deps.db);
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
    setCookie(c, COOKIE, token, { httpOnly: true, sameSite: 'Lax', path: '/', maxAge: SESSION_HOURS * 3600, secure: url.protocol === 'https:' || url.hostname === 'localhost' });
  };

  /** Usuario de la cookie si la sesión sigue valiendo; si no, el motivo. */
  const resolve = async (c: C): Promise<{ user: User } | { reason: string }> => {
    const token = getCookie(c, COOKIE);
    const claims = token ? await verifySession(token, deps.secret, Math.floor(now().getTime() / 1000)) : null;
    if (!claims) return { reason: token ? 'SESSION_EXPIRED' : 'NOT_AUTHENTICATED' };
    const u = await repo.userById(claims.sub);
    if (!u || u.tokenVersion !== claims.ver) return { reason: 'SESSION_EXPIRED' };
    const block = await accessBlock(repo, u, now());
    return block ? { reason: block } : { user: u };
  };

  /** Sesión válida, usuario activo, con acceso vigente y sin cambio de contraseña pendiente (salvo `allowPending`). */
  const auth = (opts: { roles?: Role[]; allowPending?: boolean } = {}): MiddlewareHandler<{ Variables: Vars }> => async (c, next) => {
    const r = await resolve(c);
    if ('reason' in r) {
      if (r.reason !== 'NOT_AUTHENTICATED') deleteCookie(c, COOKIE, { path: '/' });
      throw new ApiError(r.reason === 'NOT_AUTHENTICATED' || r.reason === 'SESSION_EXPIRED' ? 401 : 403, r.reason);
    }
    if (r.user.mustChangePassword && !opts.allowPending) throw new ApiError(403, 'MUST_CHANGE_PASSWORD');
    if (opts.roles && !opts.roles.includes(r.user.role)) throw new ApiError(403, 'FORBIDDEN');
    c.set('user', r.user);
    await next();
  };
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
    const u = await login(repo, email, password, now());
    await issue(c, u);
    return c.json(await me(repo, u, now()));
  });
  app.post('/auth/logout', (c) => {
    deleteCookie(c, COOKIE, { path: '/' });
    return c.json({ ok: true });
  });
  app.get('/auth/me', auth({ allowPending: true }), async (c) => c.json(await me(repo, c.get('user'), now())));
  /** Estado de la sesión sin error HTTP: la portada lo consulta en cada visita (un 401 ensuciaría la consola). */
  app.get('/auth/session', async (c) => {
    const r = await resolve(c);
    if ('reason' in r) {
      if (r.reason === 'NOT_AUTHENTICATED') return c.json({ me: null });
      deleteCookie(c, COOKIE, { path: '/' });
      return c.json({ me: null, reason: r.reason });
    }
    return c.json({ me: await me(repo, r.user, now()) });
  });
  app.post('/auth/password', auth({ allowPending: true }), async (c) => {
    const { current, next } = await body<{ current?: string; next?: string }>(c);
    if (!current || !next) throw new ApiError(400, 'MISSING_FIELDS');
    const u = c.get('user');
    await changePassword(repo, u, current, next);
    await issue(c, u);
    return c.json(await me(repo, u, now()));
  });

  // ── Administración ──
  const admin = auth({ roles: ['admin'] });
  app.get('/admin/overview', admin, async (c) => c.json(await overview(repo, now())));
  app.get('/admin/users', admin, async (c) => c.json((await repo.users()).map(publicUser)));
  app.post('/admin/users', admin, async (c) => {
    const r = await createUser(repo, c.get('user'), await body(c), now());
    return c.json({ user: publicUser(r.user), temporaryPassword: r.temporaryPassword }, 201);
  });
  app.patch('/admin/users/:id', admin, async (c) => c.json(publicUser(await updateUser(repo, c.get('user'), c.req.param('id'), await body(c)))));
  app.post('/admin/users/:id/reset-password', admin, async (c) => c.json({ temporaryPassword: await resetPassword(repo, c.get('user'), c.req.param('id')) }));
  app.post('/admin/users/:id/unlock', admin, async (c) => {
    await unlockUser(repo, c.get('user'), c.req.param('id'));
    return c.json({ ok: true });
  });
  app.post('/admin/users/import', admin, async (c) => {
    const { csv, courseId } = await body<{ csv?: string; courseId?: string | null }>(c);
    if (!csv) throw new ApiError(400, 'MISSING_CSV');
    return c.json(await importStudents(repo, c.get('user'), csv, courseId || null, now()));
  });
  app.get('/admin/courses', admin, async (c) => c.json(await adminCourses(repo)));
  app.post('/admin/courses', admin, async (c) => c.json(await createCourse(repo, c.get('user'), await body(c)), 201));
  app.patch('/admin/courses/:id', admin, async (c) => c.json(await updateCourse(repo, c.get('user'), c.req.param('id'), await body(c))));
  app.get('/admin/courses/:id/roster', admin, async (c) => c.json(await roster(repo, c.req.param('id'))));
  app.get('/admin/courses/:id/gradebook', admin, async (c) => c.json(await gradebook(repo, c.get('user'), c.req.param('id'))));
  app.post('/admin/courses/:id/enrollments', admin, async (c) => {
    const { studentIds } = await body<{ studentIds?: string[] }>(c);
    if (!Array.isArray(studentIds) || studentIds.length === 0) throw new ApiError(400, 'MISSING_STUDENTS');
    await enroll(repo, c.get('user'), c.req.param('id'), studentIds, now());
    return c.json(await roster(repo, c.req.param('id')));
  });
  app.patch('/admin/enrollments/:id', admin, async (c) => {
    const { status } = await body<{ status?: 'active' | 'withdrawn' | 'completed' }>(c);
    if (!status) throw new ApiError(400, 'MISSING_STATUS');
    await setEnrollmentStatus(repo, c.get('user'), c.req.param('id'), status, now());
    return c.json({ ok: true });
  });
  app.get('/admin/license', admin, async (c) => c.json(await repo.license()));
  app.patch('/admin/license', admin, async (c) => c.json(await updateLicense(repo, c.get('user'), await body(c))));
  app.get('/admin/audit', admin, async (c) => {
    const limit = Math.min(500, Number(c.req.query('limit') ?? 200) || 200);
    return c.json(await auditLog(repo, limit));
  });

  // ── Docentes ──
  const teacher = auth({ roles: ['teacher'] });
  app.get('/teacher/courses', teacher, async (c) => c.json(await teacherCourses(repo, c.get('user'), now())));
  app.put('/teacher/courses/:id/labs', teacher, async (c) => {
    const { labs } = await body<{ labs?: unknown }>(c);
    if (!Array.isArray(labs)) throw new ApiError(400, 'MISSING_LABS');
    return c.json(await setCourseLabs(repo, c.get('user'), c.req.param('id'), labs));
  });
  app.get('/teacher/courses/:id/gradebook', teacher, async (c) => c.json(await gradebook(repo, c.get('user'), c.req.param('id'))));
  // Revisión de entregas (también para el administrador): problemas detectados y repetición del intento.
  const reviewer = auth({ roles: ['teacher', 'admin'] });
  app.get('/teacher/courses/:id/submissions', reviewer, async (c) => c.json(await courseSubmissions(repo, c.get('user'), c.req.param('id'))));
  app.get('/teacher/submissions/:id/data', reviewer, async (c) => c.json(await submissionReplayData(repo, c.get('user'), c.req.param('id'))));
  app.post('/teacher/submissions/:id/replay', reviewer, async (c) => c.json(await recordReplay(repo, c.get('user'), c.req.param('id'), await body(c))));

  // ── Estudiantes ──
  const student = auth({ roles: ['student'] });
  app.get('/student/courses', student, async (c) => c.json(await studentCourses(repo, c.get('user'), now())));
  app.get('/student/submissions', student, async (c) => c.json(await studentSubmissions(repo, c.get('user'))));
  app.post('/student/submissions', student, async (c) => c.json(await submit(repo, c.get('user'), await body(c), now()), 201));

  return app;
}
