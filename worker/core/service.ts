/**
 * Reglas de la plataforma académica (sin dependencias de Cloudflare: se prueban en Node).
 *
 * - Nadie se registra: el administrador da de alta a docentes y estudiantes (licencia de la universidad).
 * - Un estudiante solo entra mientras tenga una matrícula activa en un curso vigente y la licencia esté vigente;
 *   solo abre las prácticas que su curso tiene abiertas en ese momento.
 * - Contraseñas asignadas por el administrador se cambian en el primer ingreso; 5 intentos fallidos bloquean 15 min.
 * - Toda acción del administrador o del docente queda en la auditoría.
 */
import { hashPassword, passwordProblem, temporaryPassword, verifyPassword } from './crypto';
import {
  LAB_IDS, publicUser,
  type AuditEntry, type Course, type CourseLab, type Db, type Enrollment, type EnrollmentStatus, type LabId, type LabMode,
  type License, type Me, type Role, type Submission, type User, type UserStatus,
} from './types';

export class ApiError extends Error {
  constructor(public status: number, public code: string, public detail?: Record<string, unknown>) {
    super(code);
  }
}

export const MAX_FAILED_LOGINS = 5;
export const LOCK_MINUTES = 15;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MODES: LabMode[] = ['PRACTICE', 'GUIDED', 'EVALUATION'];
/** Hash de relleno: se verifica igual cuando el correo no existe, para no revelar qué cuentas hay. */
const DUMMY_HASH = 'pbkdf2$sha256$30000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

const iso = (d: Date) => d.toISOString();
const rid = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`;
const within = (now: Date, from: string, to: string) => now >= new Date(from) && now <= new Date(to);

export function audit(db: Db, actorId: string, action: string, target?: string, detail?: string) {
  const e: AuditEntry = { id: rid('a'), at: iso(new Date()), actorId, action, target, detail };
  db.audit.push(e);
}

// ─────────────────────────── Acceso ───────────────────────────

export function licenseActive(db: Db, now: Date): boolean {
  return within(now, db.license.validFrom, db.license.validTo);
}

export function courseLive(c: Course, now: Date): boolean {
  return !c.archived && within(now, c.startsAt, c.endsAt);
}

/** Matrículas activas en cursos vigentes. */
export function activeEnrollments(db: Db, studentId: string, now: Date): Enrollment[] {
  return db.enrollments.filter((e) => {
    if (e.studentId !== studentId || e.status !== 'active') return false;
    const c = db.courses.find((x) => x.id === e.courseId);
    return !!c && courseLive(c, now);
  });
}

/** Motivo por el que un usuario (con la contraseña correcta) no puede entrar, o null. */
export function accessBlock(db: Db, u: User, now: Date): string | null {
  if (u.status !== 'active') return 'ACCOUNT_SUSPENDED';
  if (u.role === 'admin') return null;
  if (!licenseActive(db, now)) return 'LICENSE_INACTIVE';
  if (u.role === 'student' && activeEnrollments(db, u.id, now).length === 0) return 'NOT_ENROLLED';
  return null;
}

export function labsFor(db: Db, u: User, now: Date): Me['labs'] {
  if (u.role !== 'student') return LAB_IDS.map((labId) => ({ labId, courseId: null, mode: null, closesAt: null }));
  const out: Me['labs'] = [];
  for (const e of activeEnrollments(db, u.id, now)) {
    const c = db.courses.find((x) => x.id === e.courseId)!;
    for (const l of c.labs) if (within(now, l.opensAt, l.closesAt)) out.push({ labId: l.labId, courseId: c.id, mode: l.mode, closesAt: l.closesAt });
  }
  return out;
}

export function me(db: Db, u: User, now: Date): Me {
  return {
    user: publicUser(u),
    labs: labsFor(db, u, now),
    license: { institution: db.license.institution, validTo: db.license.validTo, active: licenseActive(db, now) },
  };
}

export function findUser(db: Db, id: string): User {
  const u = db.users.find((x) => x.id === id);
  if (!u) throw new ApiError(404, 'USER_NOT_FOUND');
  return u;
}

function findCourse(db: Db, id: string): Course {
  const c = db.courses.find((x) => x.id === id);
  if (!c) throw new ApiError(404, 'COURSE_NOT_FOUND');
  return c;
}

// ─────────────────────────── Autenticación ───────────────────────────

/** Verifica credenciales. Devuelve el usuario si puede entrar; si no, lanza el motivo. Modifica contadores en `db`. */
export async function login(db: Db, emailRaw: string, password: string, now: Date): Promise<User> {
  const email = emailRaw.trim().toLowerCase();
  const u = db.users.find((x) => x.email === email);
  if (!u) {
    await verifyPassword(password, DUMMY_HASH);
    throw new ApiError(401, 'INVALID_CREDENTIALS');
  }
  if (u.lockedUntil && new Date(u.lockedUntil) > now) throw new ApiError(423, 'ACCOUNT_LOCKED', { until: u.lockedUntil });
  if (!(await verifyPassword(password, u.passwordHash))) {
    u.failedLogins += 1;
    if (u.failedLogins >= MAX_FAILED_LOGINS) {
      u.failedLogins = 0;
      u.lockedUntil = iso(new Date(now.getTime() + LOCK_MINUTES * 60_000));
      audit(db, u.id, 'auth.locked', u.id);
    }
    throw new ApiError(401, 'INVALID_CREDENTIALS');
  }
  u.failedLogins = 0;
  u.lockedUntil = null;
  // El motivo de bloqueo solo se revela a quien sabe la contraseña.
  const block = accessBlock(db, u, now);
  if (block) throw new ApiError(403, block);
  u.lastLoginAt = iso(now);
  return u;
}

export async function changePassword(db: Db, u: User, current: string, next: string) {
  if (!(await verifyPassword(current, u.passwordHash))) throw new ApiError(400, 'WRONG_CURRENT_PASSWORD');
  const p = passwordProblem(next);
  if (p) throw new ApiError(400, p);
  if (current === next) throw new ApiError(400, 'PASSWORD_UNCHANGED');
  u.passwordHash = await hashPassword(next);
  u.mustChangePassword = false;
  u.tokenVersion += 1;
  audit(db, u.id, 'auth.passwordChanged', u.id);
}

// ─────────────────────────── Administración: usuarios ───────────────────────────

export interface UserInput {
  role: Role;
  email: string;
  name: string;
  code?: string;
}

function checkUserInput(db: Db, input: Partial<UserInput>, selfId?: string) {
  if (input.email !== undefined) {
    const email = input.email.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) throw new ApiError(400, 'INVALID_EMAIL');
    if (db.users.some((x) => x.email === email && x.id !== selfId)) throw new ApiError(409, 'EMAIL_TAKEN');
  }
  if (input.name !== undefined && input.name.trim().length < 3) throw new ApiError(400, 'INVALID_NAME');
  if (input.role !== undefined && !['admin', 'teacher', 'student'].includes(input.role)) throw new ApiError(400, 'INVALID_ROLE');
  if (input.code !== undefined && input.code && db.users.some((x) => x.code === input.code!.trim() && x.id !== selfId)) throw new ApiError(409, 'CODE_TAKEN');
}

export async function createUser(db: Db, actor: User, input: UserInput, now: Date): Promise<{ user: User; temporaryPassword: string }> {
  checkUserInput(db, input);
  const temp = temporaryPassword();
  const u: User = {
    id: rid('u'), role: input.role, email: input.email.trim().toLowerCase(), name: input.name.trim(), code: input.code?.trim() || undefined,
    status: 'active', passwordHash: await hashPassword(temp), mustChangePassword: true, tokenVersion: 1, failedLogins: 0,
    lockedUntil: null, createdAt: iso(now), lastLoginAt: null,
  };
  db.users.push(u);
  audit(db, actor.id, 'user.create', u.id, `${u.role} ${u.email}`);
  return { user: u, temporaryPassword: temp };
}

export function updateUser(db: Db, actor: User, id: string, patch: Partial<UserInput> & { status?: UserStatus }) {
  const u = findUser(db, id);
  checkUserInput(db, patch, id);
  const admins = db.users.filter((x) => x.role === 'admin' && x.status === 'active');
  const losesAdmin = u.role === 'admin' && ((patch.role && patch.role !== 'admin') || patch.status === 'suspended');
  if (losesAdmin && u.id === actor.id) throw new ApiError(400, 'CANNOT_DEMOTE_SELF');
  if (losesAdmin && admins.length <= 1) throw new ApiError(400, 'LAST_ADMIN');
  if (patch.role && patch.role !== u.role && db.enrollments.some((e) => e.studentId === u.id && e.status === 'active')) throw new ApiError(400, 'HAS_ACTIVE_ENROLLMENTS');
  if (patch.email !== undefined) u.email = patch.email.trim().toLowerCase();
  if (patch.name !== undefined) u.name = patch.name.trim();
  if (patch.code !== undefined) u.code = patch.code.trim() || undefined;
  if (patch.role !== undefined && patch.role !== u.role) {
    u.role = patch.role;
    u.tokenVersion += 1;
  }
  if (patch.status !== undefined && patch.status !== u.status) {
    u.status = patch.status;
    u.tokenVersion += 1; // suspender cierra las sesiones abiertas
  }
  audit(db, actor.id, 'user.update', u.id, JSON.stringify(patch));
  return u;
}

export async function resetPassword(db: Db, actor: User, id: string): Promise<string> {
  const u = findUser(db, id);
  const temp = temporaryPassword();
  u.passwordHash = await hashPassword(temp);
  u.mustChangePassword = true;
  u.tokenVersion += 1;
  u.failedLogins = 0;
  u.lockedUntil = null;
  audit(db, actor.id, 'user.resetPassword', u.id);
  return temp;
}

export function unlockUser(db: Db, actor: User, id: string) {
  const u = findUser(db, id);
  u.failedLogins = 0;
  u.lockedUntil = null;
  audit(db, actor.id, 'user.unlock', u.id);
}

/** Estudiantes con matrícula activa (ocupan cupo de la licencia). */
export function seatsUsed(db: Db): number {
  return new Set(db.enrollments.filter((e) => e.status === 'active').map((e) => e.studentId)).size;
}

/**
 * Importación del padrón (CSV `carné,nombre,correo`, con o sin encabezado). Crea a los estudiantes que no existen y,
 * si se indica un curso, los matricula. Devuelve las contraseñas temporales de los nuevos (solo esta vez).
 */
export async function importStudents(db: Db, actor: User, csv: string, courseId: string | null, now: Date) {
  const created: Array<{ code: string; name: string; email: string; temporaryPassword: string }> = [];
  const enrolled: string[] = [];
  const skipped: Array<{ line: number; reason: string; text: string }> = [];
  if (courseId) findCourse(db, courseId);
  const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (let i = 0; i < lines.length; i++) {
    const cells = lines[i].split(/[;,\t]/).map((c) => c.trim().replace(/^"|"$/g, ''));
    if (i === 0 && /correo|email|carn/i.test(lines[i])) continue;
    const [code, name, email] = cells;
    if (!code || !name || !email) {
      skipped.push({ line: i + 1, reason: 'MISSING_FIELDS', text: lines[i] });
      continue;
    }
    let u = db.users.find((x) => x.email === email.toLowerCase() || (x.code && x.code === code));
    if (u && u.role !== 'student') {
      skipped.push({ line: i + 1, reason: 'NOT_A_STUDENT', text: lines[i] });
      continue;
    }
    if (!u) {
      try {
        const r = await createUser(db, actor, { role: 'student', email, name, code }, now);
        u = r.user;
        created.push({ code, name, email: u.email, temporaryPassword: r.temporaryPassword });
      } catch (e) {
        skipped.push({ line: i + 1, reason: e instanceof ApiError ? e.code : 'ERROR', text: lines[i] });
        continue;
      }
    }
    if (courseId) {
      try {
        enroll(db, actor, courseId, [u.id], now);
        enrolled.push(u.id);
      } catch (e) {
        skipped.push({ line: i + 1, reason: e instanceof ApiError ? e.code : 'ERROR', text: lines[i] });
      }
    }
  }
  audit(db, actor.id, 'user.import', courseId ?? undefined, `${created.length} nuevos, ${enrolled.length} matriculados, ${skipped.length} omitidos`);
  return { created, enrolled: enrolled.length, skipped };
}

// ─────────────────────────── Administración: licencia, cursos y matrículas ───────────────────────────

export function updateLicense(db: Db, actor: User, patch: Partial<License>) {
  const next = { ...db.license, ...patch };
  if (isNaN(Date.parse(next.validFrom)) || isNaN(Date.parse(next.validTo)) || next.validTo <= next.validFrom) throw new ApiError(400, 'INVALID_DATES');
  if (!Number.isInteger(next.studentSeats) || next.studentSeats < 0) throw new ApiError(400, 'INVALID_SEATS');
  if (next.studentSeats < seatsUsed(db)) throw new ApiError(400, 'SEATS_BELOW_USAGE', { used: seatsUsed(db) });
  db.license = next;
  audit(db, actor.id, 'license.update', undefined, JSON.stringify(patch));
}

export interface CourseInput {
  code: string;
  name: string;
  term: string;
  group: string;
  teacherIds: string[];
  startsAt: string;
  endsAt: string;
  labs: CourseLab[];
  archived?: boolean;
}

function checkLabs(labs: CourseLab[]) {
  const seen = new Set<string>();
  for (const l of labs) {
    if (!LAB_IDS.includes(l.labId) || seen.has(l.labId)) throw new ApiError(400, 'INVALID_LAB');
    seen.add(l.labId);
    if (!MODES.includes(l.mode)) throw new ApiError(400, 'INVALID_MODE');
    if (isNaN(Date.parse(l.opensAt)) || isNaN(Date.parse(l.closesAt)) || l.closesAt <= l.opensAt) throw new ApiError(400, 'INVALID_LAB_DATES', { labId: l.labId });
  }
}

function checkCourse(db: Db, c: CourseInput, selfId?: string) {
  if (!c.code?.trim() || !c.name?.trim() || !c.term?.trim() || !c.group?.trim()) throw new ApiError(400, 'MISSING_FIELDS');
  if (isNaN(Date.parse(c.startsAt)) || isNaN(Date.parse(c.endsAt)) || c.endsAt <= c.startsAt) throw new ApiError(400, 'INVALID_DATES');
  for (const t of c.teacherIds) if (db.users.find((u) => u.id === t)?.role !== 'teacher') throw new ApiError(400, 'INVALID_TEACHER', { id: t });
  if (db.courses.some((x) => x.id !== selfId && x.code === c.code.trim() && x.term === c.term.trim() && x.group === c.group.trim())) throw new ApiError(409, 'COURSE_EXISTS');
  checkLabs(c.labs);
}

export function createCourse(db: Db, actor: User, input: CourseInput): Course {
  checkCourse(db, input);
  const c: Course = { id: rid('c'), ...input, code: input.code.trim(), name: input.name.trim(), term: input.term.trim(), group: input.group.trim(), archived: !!input.archived };
  db.courses.push(c);
  audit(db, actor.id, 'course.create', c.id, `${c.code} ${c.term} G${c.group}`);
  return c;
}

export function updateCourse(db: Db, actor: User, id: string, patch: Partial<CourseInput>): Course {
  const c = findCourse(db, id);
  const next = { ...c, ...patch };
  checkCourse(db, next, id);
  Object.assign(c, next);
  audit(db, actor.id, 'course.update', c.id, JSON.stringify(Object.keys(patch)));
  return c;
}

export function enroll(db: Db, actor: User, courseId: string, studentIds: string[], now: Date) {
  findCourse(db, courseId);
  for (const sid of studentIds) {
    const s = findUser(db, sid);
    if (s.role !== 'student') throw new ApiError(400, 'NOT_A_STUDENT', { id: sid });
    const existing = db.enrollments.find((e) => e.courseId === courseId && e.studentId === sid);
    const takesSeat = !db.enrollments.some((e) => e.studentId === sid && e.status === 'active');
    if (takesSeat && seatsUsed(db) >= db.license.studentSeats) throw new ApiError(409, 'NO_SEATS_LEFT', { seats: db.license.studentSeats });
    if (existing) {
      if (existing.status !== 'active') {
        existing.status = 'active';
        existing.updatedAt = iso(now);
      }
      continue;
    }
    db.enrollments.push({ id: rid('e'), courseId, studentId: sid, status: 'active', enrolledAt: iso(now), updatedAt: iso(now) });
  }
  audit(db, actor.id, 'enrollment.add', courseId, studentIds.join(','));
}

export function setEnrollmentStatus(db: Db, actor: User, enrollmentId: string, status: EnrollmentStatus, now: Date) {
  const e = db.enrollments.find((x) => x.id === enrollmentId);
  if (!e) throw new ApiError(404, 'ENROLLMENT_NOT_FOUND');
  if (!['active', 'withdrawn', 'completed'].includes(status)) throw new ApiError(400, 'INVALID_STATUS');
  if (status === 'active' && e.status !== 'active') enroll(db, actor, e.courseId, [e.studentId], now);
  e.status = status;
  e.updatedAt = iso(now);
  audit(db, actor.id, 'enrollment.status', e.id, status);
}

export function overview(db: Db, now: Date) {
  const count = (role: Role) => db.users.filter((u) => u.role === role).length;
  return {
    users: { admin: count('admin'), teacher: count('teacher'), student: count('student'), suspended: db.users.filter((u) => u.status === 'suspended').length },
    courses: { total: db.courses.length, live: db.courses.filter((c) => courseLive(c, now)).length },
    seats: { used: seatsUsed(db), total: db.license.studentSeats },
    license: { ...db.license, active: licenseActive(db, now) },
    submissions: db.submissions.length,
  };
}

// ─────────────────────────── Docentes ───────────────────────────

function teacherCourse(db: Db, teacher: User, courseId: string): Course {
  const c = findCourse(db, courseId);
  if (teacher.role !== 'admin' && !c.teacherIds.includes(teacher.id)) throw new ApiError(403, 'NOT_YOUR_COURSE');
  return c;
}

export function teacherCourses(db: Db, teacher: User, now: Date) {
  return db.courses
    .filter((c) => c.teacherIds.includes(teacher.id) && !c.archived)
    .map((c) => ({ ...c, live: courseLive(c, now), students: roster(db, c.id) }));
}

export function roster(db: Db, courseId: string) {
  return db.enrollments
    .filter((e) => e.courseId === courseId)
    .map((e) => {
      const u = db.users.find((x) => x.id === e.studentId)!;
      return { enrollmentId: e.id, status: e.status, id: u.id, name: u.name, email: u.email, code: u.code, lastLoginAt: u.lastLoginAt };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

export function setCourseLabs(db: Db, teacher: User, courseId: string, labs: CourseLab[]) {
  const c = teacherCourse(db, teacher, courseId);
  checkLabs(labs);
  c.labs = labs;
  audit(db, teacher.id, 'course.labs', c.id, labs.map((l) => `${l.labId}:${l.mode}`).join(','));
  return c;
}

/** Libro de calificaciones: mejor nota por estudiante y práctica, con número de entregas. */
export function gradebook(db: Db, teacher: User, courseId: string) {
  const c = teacherCourse(db, teacher, courseId);
  const students = roster(db, courseId);
  const rows = students.map((s) => {
    const cells: Record<string, { best: number; attempts: number; lastAt: string } | null> = {};
    for (const l of c.labs) {
      const subs = db.submissions.filter((x) => x.courseId === courseId && x.userId === s.id && x.labId === l.labId);
      cells[l.labId] = subs.length
        ? { best: Math.max(...subs.map((x) => x.score)), attempts: subs.length, lastAt: subs.map((x) => x.submittedAt).sort().at(-1)! }
        : null;
    }
    return { student: s, cells };
  });
  return { course: c, labs: c.labs.map((l) => l.labId), rows };
}

// ─────────────────────────── Estudiantes ───────────────────────────

export function studentCourses(db: Db, student: User, now: Date) {
  return activeEnrollments(db, student.id, now).map((e) => {
    const c = db.courses.find((x) => x.id === e.courseId)!;
    const teachers = c.teacherIds.map((t) => db.users.find((u) => u.id === t)?.name).filter(Boolean);
    return {
      id: c.id, code: c.code, name: c.name, term: c.term, group: c.group, teachers, endsAt: c.endsAt,
      labs: c.labs.map((l) => ({ ...l, open: within(now, l.opensAt, l.closesAt) })),
    };
  });
}

export interface SubmissionInput {
  courseId: string;
  labId: LabId;
  mode: LabMode;
  attemptId: string;
  score: number;
  components: Submission['components'];
  durationS: number;
}

export function submit(db: Db, student: User, input: SubmissionInput, now: Date): Submission {
  if (student.role !== 'student') throw new ApiError(403, 'ONLY_STUDENTS_SUBMIT');
  const c = db.courses.find((x) => x.id === input.courseId);
  if (!c || !activeEnrollments(db, student.id, now).some((e) => e.courseId === c.id)) throw new ApiError(403, 'NOT_ENROLLED');
  const lab = c.labs.find((l) => l.labId === input.labId);
  if (!lab) throw new ApiError(400, 'LAB_NOT_ASSIGNED');
  if (!within(now, lab.opensAt, lab.closesAt)) throw new ApiError(403, 'LAB_CLOSED');
  if (!input.attemptId || typeof input.score !== 'number' || !Number.isFinite(input.score)) throw new ApiError(400, 'INVALID_SUBMISSION');
  const clamp = (x: number) => Math.min(1, Math.max(0, x));
  const sub: Submission = {
    id: rid('s'), userId: student.id, courseId: c.id, labId: input.labId, mode: MODES.includes(input.mode) ? input.mode : lab.mode,
    attemptId: String(input.attemptId).slice(0, 80), score: clamp(input.score),
    components: (input.components ?? []).slice(0, 12).map((x) => ({ key: String(x.key).slice(0, 40), score: clamp(Number(x.score) || 0), weight: Number(x.weight) || 0 })),
    durationS: Math.max(0, Math.round(Number(input.durationS) || 0)), submittedAt: iso(now),
  };
  // Reenviar el mismo intento reemplaza la entrega anterior (no duplica).
  db.submissions = db.submissions.filter((x) => !(x.userId === student.id && x.attemptId === sub.attemptId));
  db.submissions.push(sub);
  return sub;
}

export function studentSubmissions(db: Db, student: User) {
  return db.submissions.filter((s) => s.userId === student.id).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
}
