/**
 * Reglas de la plataforma académica sobre la base de datos (D1/SQLite, vía `Repo`). Sin dependencias de Cloudflare:
 * se prueban en Node con SQLite.
 *
 * - Nadie se registra: el administrador da de alta a docentes y estudiantes (licencia de la universidad).
 * - Un estudiante solo entra mientras tenga una matrícula activa en un curso vigente y la licencia esté vigente;
 *   solo abre las prácticas que su curso tiene abiertas en ese momento.
 * - Contraseñas asignadas por el administrador se cambian en el primer ingreso; 5 intentos fallidos bloquean 15 min.
 * - Toda acción del administrador o del docente queda en la auditoría (en el mismo lote atómico que el cambio).
 */
import { hashPassword, passwordProblem, temporaryPassword, verifyPassword } from './crypto';
import type { Repo, SqlStmt } from './repo';
import {
  LAB_IDS, publicUser,
  type AuditEntry, type Course, type CourseLab, type Enrollment, type EnrollmentStatus, type LabId, type LabMode,
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

function auditEntry(actorId: string, action: string, target?: string, detail?: string): AuditEntry {
  return { id: rid('a'), at: iso(new Date()), actorId, action, target, detail };
}

const audit = (repo: Repo, actorId: string, action: string, target?: string, detail?: string) => repo.auditStmt(auditEntry(actorId, action, target, detail));

// ─────────────────────────── Acceso ───────────────────────────

export function licenseActive(l: License, now: Date): boolean {
  return within(now, l.validFrom, l.validTo);
}

export function courseLive(c: Course, now: Date): boolean {
  return !c.archived && within(now, c.startsAt, c.endsAt);
}

/** Motivo por el que un usuario (con la contraseña correcta) no puede entrar, o null. */
export async function accessBlock(repo: Repo, u: User, now: Date): Promise<string | null> {
  if (u.status !== 'active') return 'ACCOUNT_SUSPENDED';
  if (u.role === 'admin') return null;
  if (!licenseActive(await repo.license(), now)) return 'LICENSE_INACTIVE';
  if (u.role === 'student' && (await repo.liveEnrollments(u.id, iso(now))).length === 0) return 'NOT_ENROLLED';
  return null;
}

export async function labsFor(repo: Repo, u: User, now: Date): Promise<Me['labs']> {
  if (u.role !== 'student') return LAB_IDS.map((labId) => ({ labId, courseId: null, mode: null, closesAt: null }));
  const out: Me['labs'] = [];
  for (const e of await repo.liveEnrollments(u.id, iso(now))) {
    const c = (await repo.courseById(e.courseId))!;
    for (const l of c.labs) if (within(now, l.opensAt, l.closesAt)) out.push({ labId: l.labId, courseId: c.id, mode: l.mode, closesAt: l.closesAt });
  }
  return out;
}

export async function me(repo: Repo, u: User, now: Date): Promise<Me> {
  const l = await repo.license();
  return { user: publicUser(u), labs: await labsFor(repo, u, now), license: { institution: l.institution, validTo: l.validTo, active: licenseActive(l, now) } };
}

export async function findUser(repo: Repo, id: string): Promise<User> {
  const u = await repo.userById(id);
  if (!u) throw new ApiError(404, 'USER_NOT_FOUND');
  return u;
}

async function findCourse(repo: Repo, id: string): Promise<Course> {
  const c = await repo.courseById(id);
  if (!c) throw new ApiError(404, 'COURSE_NOT_FOUND');
  return c;
}

// ─────────────────────────── Autenticación ───────────────────────────

/** Verifica credenciales y devuelve el usuario si puede entrar; si no, lanza el motivo (y guarda los contadores). */
export async function login(repo: Repo, emailRaw: string, password: string, now: Date): Promise<User> {
  const u = await repo.userByEmail(emailRaw.trim().toLowerCase());
  if (!u) {
    await verifyPassword(password, DUMMY_HASH);
    throw new ApiError(401, 'INVALID_CREDENTIALS');
  }
  if (u.lockedUntil && new Date(u.lockedUntil) > now) throw new ApiError(423, 'ACCOUNT_LOCKED', { until: u.lockedUntil });
  if (!(await verifyPassword(password, u.passwordHash))) {
    const failed = u.failedLogins + 1;
    if (failed >= MAX_FAILED_LOGINS) {
      await repo.run([repo.updateUserStmt(u.id, { failedLogins: 0, lockedUntil: iso(new Date(now.getTime() + LOCK_MINUTES * 60_000)) })!, audit(repo, u.id, 'auth.locked', u.id)]);
    } else await repo.updateUser(u.id, { failedLogins: failed });
    throw new ApiError(401, 'INVALID_CREDENTIALS');
  }
  if (u.failedLogins || u.lockedUntil) await repo.updateUser(u.id, { failedLogins: 0, lockedUntil: null });
  // El motivo de bloqueo solo se revela a quien sabe la contraseña.
  const block = await accessBlock(repo, u, now);
  if (block) throw new ApiError(403, block);
  u.lastLoginAt = iso(now);
  u.failedLogins = 0;
  u.lockedUntil = null;
  await repo.updateUser(u.id, { lastLoginAt: u.lastLoginAt });
  return u;
}

export async function changePassword(repo: Repo, u: User, current: string, next: string) {
  if (!(await verifyPassword(current, u.passwordHash))) throw new ApiError(400, 'WRONG_CURRENT_PASSWORD');
  const p = passwordProblem(next);
  if (p) throw new ApiError(400, p);
  if (current === next) throw new ApiError(400, 'PASSWORD_UNCHANGED');
  u.passwordHash = await hashPassword(next);
  u.mustChangePassword = false;
  u.tokenVersion += 1;
  await repo.run([repo.updateUserStmt(u.id, { passwordHash: u.passwordHash, mustChangePassword: false, tokenVersion: u.tokenVersion })!, audit(repo, u.id, 'auth.passwordChanged', u.id)]);
}

// ─────────────────────────── Administración: usuarios ───────────────────────────

export interface UserInput {
  role: Role;
  email: string;
  name: string;
  code?: string;
}

async function checkUserInput(repo: Repo, input: Partial<UserInput>, selfId?: string) {
  if (input.email !== undefined) {
    const email = input.email.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) throw new ApiError(400, 'INVALID_EMAIL');
    const other = await repo.userByEmail(email);
    if (other && other.id !== selfId) throw new ApiError(409, 'EMAIL_TAKEN');
  }
  if (input.name !== undefined && input.name.trim().length < 3) throw new ApiError(400, 'INVALID_NAME');
  if (input.role !== undefined && !['admin', 'teacher', 'student'].includes(input.role)) throw new ApiError(400, 'INVALID_ROLE');
  if (input.code !== undefined && input.code.trim()) {
    const other = await repo.userByCode(input.code.trim());
    if (other && other.id !== selfId) throw new ApiError(409, 'CODE_TAKEN');
  }
}

async function newUser(repo: Repo, input: UserInput, now: Date): Promise<{ user: User; temporaryPassword: string }> {
  await checkUserInput(repo, input);
  const temp = temporaryPassword();
  const user: User = {
    id: rid('u'), role: input.role, email: input.email.trim().toLowerCase(), name: input.name.trim(), code: input.code?.trim() || undefined,
    status: 'active', passwordHash: await hashPassword(temp), mustChangePassword: true, tokenVersion: 1, failedLogins: 0,
    lockedUntil: null, createdAt: iso(now), lastLoginAt: null,
  };
  return { user, temporaryPassword: temp };
}

export async function createUser(repo: Repo, actor: User, input: UserInput, now: Date): Promise<{ user: User; temporaryPassword: string }> {
  const r = await newUser(repo, input, now);
  await repo.run([repo.insertUserStmt(r.user), audit(repo, actor.id, 'user.create', r.user.id, `${r.user.role} ${r.user.email}`)]);
  return r;
}

export async function updateUser(repo: Repo, actor: User, id: string, patch: Partial<UserInput> & { status?: UserStatus }): Promise<User> {
  const u = await findUser(repo, id);
  await checkUserInput(repo, patch, id);
  const losesAdmin = u.role === 'admin' && ((patch.role && patch.role !== 'admin') || patch.status === 'suspended');
  if (losesAdmin && u.id === actor.id) throw new ApiError(400, 'CANNOT_DEMOTE_SELF');
  if (losesAdmin && (await repo.countActiveAdmins()) <= 1) throw new ApiError(400, 'LAST_ADMIN');
  if (patch.role && patch.role !== u.role && (await repo.hasActiveEnrollment(u.id))) throw new ApiError(400, 'HAS_ACTIVE_ENROLLMENTS');
  const next: Partial<User> = {};
  if (patch.email !== undefined) next.email = patch.email.trim().toLowerCase();
  if (patch.name !== undefined) next.name = patch.name.trim();
  if (patch.code !== undefined) next.code = patch.code.trim() || undefined;
  let bump = false;
  if (patch.role !== undefined && patch.role !== u.role) {
    next.role = patch.role;
    bump = true;
  }
  if (patch.status !== undefined && patch.status !== u.status) {
    next.status = patch.status;
    bump = true; // suspender cierra las sesiones abiertas
  }
  if (bump) next.tokenVersion = u.tokenVersion + 1;
  // Un `code` vacío queda como undefined y updateUserStmt lo guarda como NULL.
  const stmt = repo.updateUserStmt(u.id, next);
  await repo.run([...(stmt ? [stmt] : []), audit(repo, actor.id, 'user.update', u.id, JSON.stringify(patch))]);
  return { ...u, ...next };
}

export async function resetPassword(repo: Repo, actor: User, id: string): Promise<string> {
  const u = await findUser(repo, id);
  const temp = temporaryPassword();
  await repo.run([
    repo.updateUserStmt(u.id, { passwordHash: await hashPassword(temp), mustChangePassword: true, tokenVersion: u.tokenVersion + 1, failedLogins: 0, lockedUntil: null })!,
    audit(repo, actor.id, 'user.resetPassword', u.id),
  ]);
  return temp;
}

export async function unlockUser(repo: Repo, actor: User, id: string) {
  const u = await findUser(repo, id);
  await repo.run([repo.updateUserStmt(u.id, { failedLogins: 0, lockedUntil: null })!, audit(repo, actor.id, 'user.unlock', u.id)]);
}

/**
 * Importación del padrón (CSV `carné,nombre,correo`, con o sin encabezado). Crea a los estudiantes que no existen y,
 * si se indica un curso, los matricula. Devuelve las contraseñas temporales de los nuevos (solo esta vez).
 */
export async function importStudents(repo: Repo, actor: User, csv: string, courseId: string | null, now: Date) {
  const created: Array<{ code: string; name: string; email: string; temporaryPassword: string }> = [];
  let enrolled = 0;
  const skipped: Array<{ line: number; reason: string; text: string }> = [];
  if (courseId) await findCourse(repo, courseId);
  const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (let i = 0; i < lines.length; i++) {
    const cells = lines[i].split(/[;,\t]/).map((c) => c.trim().replace(/^"|"$/g, ''));
    if (i === 0 && /correo|email|carn/i.test(lines[i])) continue;
    const [code, name, email] = cells;
    if (!code || !name || !email) {
      skipped.push({ line: i + 1, reason: 'MISSING_FIELDS', text: lines[i] });
      continue;
    }
    let u = (await repo.userByEmail(email.toLowerCase())) ?? (await repo.userByCode(code));
    if (u && u.role !== 'student') {
      skipped.push({ line: i + 1, reason: 'NOT_A_STUDENT', text: lines[i] });
      continue;
    }
    if (!u) {
      try {
        const r = await createUser(repo, actor, { role: 'student', email, name, code }, now);
        u = r.user;
        created.push({ code, name, email: u.email, temporaryPassword: r.temporaryPassword });
      } catch (e) {
        skipped.push({ line: i + 1, reason: e instanceof ApiError ? e.code : 'ERROR', text: lines[i] });
        continue;
      }
    }
    if (courseId) {
      try {
        await enroll(repo, actor, courseId, [u.id], now);
        enrolled += 1;
      } catch (e) {
        skipped.push({ line: i + 1, reason: e instanceof ApiError ? e.code : 'ERROR', text: lines[i] });
      }
    }
  }
  await repo.run([audit(repo, actor.id, 'user.import', courseId ?? undefined, `${created.length} nuevos, ${enrolled} matriculados, ${skipped.length} omitidos`)]);
  return { created, enrolled, skipped };
}

// ─────────────────────────── Administración: licencia, cursos y matrículas ───────────────────────────

export async function updateLicense(repo: Repo, actor: User, patch: Partial<License>): Promise<License> {
  const next = { ...(await repo.license()), ...patch };
  if (isNaN(Date.parse(next.validFrom)) || isNaN(Date.parse(next.validTo)) || next.validTo <= next.validFrom) throw new ApiError(400, 'INVALID_DATES');
  if (!Number.isInteger(next.studentSeats) || next.studentSeats < 0) throw new ApiError(400, 'INVALID_SEATS');
  const used = await repo.seatsUsed();
  if (next.studentSeats < used) throw new ApiError(400, 'SEATS_BELOW_USAGE', { used });
  await repo.run([
    repo.prepare('UPDATE license SET institution = ?, valid_from = ?, valid_to = ?, student_seats = ? WHERE id = 1').bind(next.institution, next.validFrom, next.validTo, next.studentSeats),
    audit(repo, actor.id, 'license.update', undefined, JSON.stringify(patch)),
  ]);
  return next;
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

async function checkCourse(repo: Repo, c: CourseInput, selfId?: string) {
  if (!c.code?.trim() || !c.name?.trim() || !c.term?.trim() || !c.group?.trim()) throw new ApiError(400, 'MISSING_FIELDS');
  if (isNaN(Date.parse(c.startsAt)) || isNaN(Date.parse(c.endsAt)) || c.endsAt <= c.startsAt) throw new ApiError(400, 'INVALID_DATES');
  const teachers = await repo.usersByIds(c.teacherIds ?? []);
  for (const t of c.teacherIds ?? []) if (teachers.find((u) => u.id === t)?.role !== 'teacher') throw new ApiError(400, 'INVALID_TEACHER', { id: t });
  if (await repo.courseExists(c.code.trim(), c.term.trim(), c.group.trim(), selfId)) throw new ApiError(409, 'COURSE_EXISTS');
  checkLabs(c.labs ?? []);
}

export async function createCourse(repo: Repo, actor: User, input: CourseInput): Promise<Course> {
  await checkCourse(repo, input);
  const c: Course = {
    id: rid('c'), code: input.code.trim(), name: input.name.trim(), term: input.term.trim(), group: input.group.trim(),
    teacherIds: input.teacherIds ?? [], startsAt: input.startsAt, endsAt: input.endsAt, labs: input.labs ?? [], archived: !!input.archived,
  };
  await repo.saveCourse(c, true, [audit(repo, actor.id, 'course.create', c.id, `${c.code} ${c.term} G${c.group}`)]);
  return c;
}

export async function updateCourse(repo: Repo, actor: User, id: string, patch: Partial<CourseInput>): Promise<Course> {
  const c = await findCourse(repo, id);
  const next: Course = { ...c, ...patch, archived: patch.archived ?? c.archived };
  await checkCourse(repo, next, id);
  await repo.saveCourse(next, false, [audit(repo, actor.id, 'course.update', c.id, JSON.stringify(Object.keys(patch)))]);
  return next;
}

export async function enroll(repo: Repo, actor: User, courseId: string, studentIds: string[], now: Date) {
  await findCourse(repo, courseId);
  const license = await repo.license();
  let used = await repo.seatsUsed();
  const stmts: SqlStmt[] = [];
  for (const sid of studentIds) {
    const s = await findUser(repo, sid);
    if (s.role !== 'student') throw new ApiError(400, 'NOT_A_STUDENT', { id: sid });
    const existing = await repo.enrollment(courseId, sid);
    const takesSeat = !(await repo.hasActiveEnrollment(sid));
    if (takesSeat && used >= license.studentSeats) throw new ApiError(409, 'NO_SEATS_LEFT', { seats: license.studentSeats });
    if (takesSeat) used += 1;
    if (existing) {
      if (existing.status !== 'active') stmts.push(repo.enrollmentStatusStmt(existing.id, 'active', iso(now)));
      continue;
    }
    const e: Enrollment = { id: rid('e'), courseId, studentId: sid, status: 'active', enrolledAt: iso(now), updatedAt: iso(now) };
    stmts.push(repo.insertEnrollmentStmt(e));
  }
  await repo.run([...stmts, audit(repo, actor.id, 'enrollment.add', courseId, studentIds.join(','))]);
}

export async function setEnrollmentStatus(repo: Repo, actor: User, enrollmentId: string, status: EnrollmentStatus, now: Date) {
  const e = await repo.enrollmentById(enrollmentId);
  if (!e) throw new ApiError(404, 'ENROLLMENT_NOT_FOUND');
  if (!['active', 'withdrawn', 'completed'].includes(status)) throw new ApiError(400, 'INVALID_STATUS');
  // Reactivar ocupa un cupo si el estudiante no tiene otra matrícula activa.
  if (status === 'active' && e.status !== 'active') return enroll(repo, actor, e.courseId, [e.studentId], now);
  await repo.run([repo.enrollmentStatusStmt(e.id, status, iso(now)), audit(repo, actor.id, 'enrollment.status', e.id, status)]);
}

export async function overview(repo: Repo, now: Date) {
  const [n, license, used, live] = await Promise.all([repo.counts(), repo.license(), repo.seatsUsed(), repo.liveCourseCount(iso(now))]);
  return {
    users: { admin: n.admins, teacher: n.teachers, student: n.students, suspended: n.suspended },
    courses: { total: n.courses, live },
    seats: { used, total: license.studentSeats },
    license: { ...license, active: licenseActive(license, now) },
    submissions: n.submissions,
  };
}

export async function adminCourses(repo: Repo) {
  const [courses, counts] = await Promise.all([repo.courses(), repo.activeCounts()]);
  return courses.map((c) => ({ ...c, enrolled: counts[c.id] ?? 0 }));
}

// ─────────────────────────── Docentes ───────────────────────────

async function teacherCourse(repo: Repo, teacher: User, courseId: string): Promise<Course> {
  const c = await findCourse(repo, courseId);
  if (teacher.role !== 'admin' && !c.teacherIds.includes(teacher.id)) throw new ApiError(403, 'NOT_YOUR_COURSE');
  return c;
}

export async function teacherCourses(repo: Repo, teacher: User, now: Date) {
  const courses = await repo.coursesOfTeacher(teacher.id);
  return Promise.all(courses.map(async (c) => ({ ...c, live: courseLive(c, now), students: await repo.roster(c.id) })));
}

export const roster = (repo: Repo, courseId: string) => repo.roster(courseId);

export async function setCourseLabs(repo: Repo, teacher: User, courseId: string, labs: CourseLab[]): Promise<Course> {
  const c = await teacherCourse(repo, teacher, courseId);
  checkLabs(labs);
  await repo.setCourseLabs(c.id, labs, [audit(repo, teacher.id, 'course.labs', c.id, labs.map((l) => `${l.labId}:${l.mode}`).join(','))]);
  return { ...c, labs };
}

/** Libro de calificaciones: mejor nota por estudiante y práctica, con número de entregas. */
export async function gradebook(repo: Repo, teacher: User, courseId: string) {
  const c = await teacherCourse(repo, teacher, courseId);
  const [students, grades] = await Promise.all([repo.roster(courseId), repo.gradeSummary(courseId)]);
  const rows = students.map((s) => {
    const cells: Record<string, { best: number; attempts: number; lastAt: string } | null> = {};
    for (const l of c.labs) {
      const g = grades.find((x) => x.userId === s.id && x.labId === l.labId);
      cells[l.labId] = g ? { best: g.best, attempts: g.attempts, lastAt: g.lastAt } : null;
    }
    return { student: s, cells };
  });
  return { course: c, labs: c.labs.map((l) => l.labId), rows };
}

// ─────────────────────────── Estudiantes ───────────────────────────

export async function studentCourses(repo: Repo, student: User, now: Date) {
  const out = [];
  for (const e of await repo.liveEnrollments(student.id, iso(now))) {
    const c = (await repo.courseById(e.courseId))!;
    const teachers = (await repo.usersByIds(c.teacherIds)).map((u) => u.name);
    out.push({
      id: c.id, code: c.code, name: c.name, term: c.term, group: c.group, teachers, endsAt: c.endsAt,
      labs: c.labs.map((l) => ({ ...l, open: within(now, l.opensAt, l.closesAt) })),
    });
  }
  return out;
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

export async function submit(repo: Repo, student: User, input: SubmissionInput, now: Date): Promise<Submission> {
  if (student.role !== 'student') throw new ApiError(403, 'ONLY_STUDENTS_SUBMIT');
  const live = await repo.liveEnrollments(student.id, iso(now));
  const c = live.some((e) => e.courseId === input.courseId) ? await repo.courseById(input.courseId) : null;
  if (!c) throw new ApiError(403, 'NOT_ENROLLED');
  const lab = c.labs.find((l) => l.labId === input.labId);
  if (!lab) throw new ApiError(400, 'LAB_NOT_ASSIGNED');
  if (!within(now, lab.opensAt, lab.closesAt)) throw new ApiError(403, 'LAB_CLOSED');
  if (!input.attemptId || typeof input.score !== 'number' || !Number.isFinite(input.score)) throw new ApiError(400, 'INVALID_SUBMISSION');
  const clamp = (x: number) => Math.min(1, Math.max(0, x));
  const attemptId = String(input.attemptId).slice(0, 80);
  // Reenviar el mismo intento reemplaza la entrega anterior (no duplica) y conserva su id.
  const prev = await repo.submissionByAttempt(student.id, attemptId);
  const sub: Submission = {
    id: prev?.id ?? rid('s'), userId: student.id, courseId: c.id, labId: input.labId, mode: MODES.includes(input.mode) ? input.mode : lab.mode,
    attemptId, score: clamp(input.score),
    components: (input.components ?? []).slice(0, 12).map((x) => ({ key: String(x.key).slice(0, 40), score: clamp(Number(x.score) || 0), weight: Number(x.weight) || 0 })),
    durationS: Math.max(0, Math.round(Number(input.durationS) || 0)), submittedAt: iso(now),
  };
  await repo.run([repo.upsertSubmissionStmt(sub)]);
  return sub;
}

export const studentSubmissions = (repo: Repo, student: User) => repo.submissionsOf(student.id);

export async function auditLog(repo: Repo, limit: number) {
  return repo.audit(limit);
}
