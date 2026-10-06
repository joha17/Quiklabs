/**
 * Acceso a datos sobre Cloudflare D1 (SQLite). `SqlDb` es el subconjunto de la API de D1 que se usa, así las pruebas
 * pueden correr las mismas consultas sobre `node:sqlite` (ver `src/tests/helpers/sqlite-d1.ts`).
 * Las filas se convierten a los tipos de `types.ts`; las operaciones de varias sentencias van en `batch` (atómico).
 */
import type { AuditEntry, Course, CourseLab, Enrollment, EnrollmentStatus, LabId, License, Submission, User } from './types';

export interface SqlStmt {
  bind(...values: unknown[]): SqlStmt;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}

export interface SqlDb {
  prepare(sql: string): SqlStmt;
  batch(stmts: SqlStmt[]): Promise<unknown[]>;
}

type Row = Record<string, unknown>;
const str = (v: unknown) => (v === null || v === undefined ? null : String(v));

function toUser(r: Row): User {
  return {
    id: String(r.id), role: r.role as User['role'], email: String(r.email), name: String(r.name), code: str(r.code) ?? undefined,
    status: r.status as User['status'], passwordHash: String(r.password_hash), mustChangePassword: !!r.must_change_password,
    tokenVersion: Number(r.token_version), failedLogins: Number(r.failed_logins), lockedUntil: str(r.locked_until),
    createdAt: String(r.created_at), lastLoginAt: str(r.last_login_at),
  };
}

const USER_COLS: Record<string, string> = {
  role: 'role', email: 'email', name: 'name', code: 'code', status: 'status', passwordHash: 'password_hash',
  mustChangePassword: 'must_change_password', tokenVersion: 'token_version', failedLogins: 'failed_logins',
  lockedUntil: 'locked_until', lastLoginAt: 'last_login_at',
};

const toDb = (v: unknown) => (typeof v === 'boolean' ? (v ? 1 : 0) : v === undefined ? null : v);

function toEnrollment(r: Row): Enrollment {
  return { id: String(r.id), courseId: String(r.course_id), studentId: String(r.student_id), status: r.status as EnrollmentStatus, enrolledAt: String(r.enrolled_at), updatedAt: String(r.updated_at) };
}

function toSubmission(r: Row): Submission {
  return {
    id: String(r.id), userId: String(r.user_id), courseId: String(r.course_id), labId: r.lab_id as LabId, mode: r.mode as Submission['mode'],
    attemptId: String(r.attempt_id), score: Number(r.score), components: JSON.parse(String(r.components ?? '[]')) as Submission['components'],
    durationS: Number(r.duration_s), submittedAt: String(r.submitted_at),
  };
}

export class Repo {
  constructor(private db: SqlDb) {}

  // ── Licencia ──
  async license(): Promise<License> {
    const r = await this.db.prepare('SELECT institution, valid_from, valid_to, student_seats FROM license WHERE id = 1').first();
    if (!r) throw new Error('LICENSE_MISSING');
    return { institution: String(r.institution), validFrom: String(r.valid_from), validTo: String(r.valid_to), studentSeats: Number(r.student_seats) };
  }

  async setLicense(l: License) {
    await this.db.prepare('UPDATE license SET institution = ?, valid_from = ?, valid_to = ?, student_seats = ? WHERE id = 1')
      .bind(l.institution, l.validFrom, l.validTo, l.studentSeats).run();
  }

  // ── Usuarios ──
  async userById(id: string): Promise<User | null> {
    const r = await this.db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
    return r ? toUser(r) : null;
  }

  async userByEmail(email: string): Promise<User | null> {
    const r = await this.db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
    return r ? toUser(r) : null;
  }

  async userByCode(code: string): Promise<User | null> {
    const r = await this.db.prepare('SELECT * FROM users WHERE code = ?').bind(code).first();
    return r ? toUser(r) : null;
  }

  async users(): Promise<User[]> {
    const { results } = await this.db.prepare('SELECT * FROM users ORDER BY role, name').all();
    return results.map(toUser);
  }

  async usersByIds(ids: string[]): Promise<User[]> {
    if (ids.length === 0) return [];
    const { results } = await this.db.prepare(`SELECT * FROM users WHERE id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all();
    return results.map(toUser);
  }

  insertUserStmt(u: User): SqlStmt {
    return this.db.prepare(`INSERT INTO users (id, role, email, name, code, status, password_hash, must_change_password, token_version, failed_logins, locked_until, created_at, last_login_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(u.id, u.role, u.email, u.name, u.code ?? null, u.status, u.passwordHash, u.mustChangePassword ? 1 : 0, u.tokenVersion, u.failedLogins, u.lockedUntil, u.createdAt, u.lastLoginAt);
  }

  /** Actualiza solo los campos indicados (lista blanca de columnas). */
  updateUserStmt(id: string, patch: Partial<User>): SqlStmt | null {
    const cols = Object.keys(patch).filter((k) => USER_COLS[k]);
    if (cols.length === 0) return null;
    return this.db.prepare(`UPDATE users SET ${cols.map((k) => `${USER_COLS[k]} = ?`).join(', ')} WHERE id = ?`)
      .bind(...cols.map((k) => toDb(patch[k as keyof User])), id);
  }

  async updateUser(id: string, patch: Partial<User>) {
    await this.updateUserStmt(id, patch)?.run();
  }

  async countActiveAdmins(): Promise<number> {
    const r = await this.db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND status = 'active'").first();
    return Number(r?.n ?? 0);
  }

  // ── Cursos ──
  private async assemble(rows: Row[]): Promise<Course[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => String(r.id));
    const ph = ids.map(() => '?').join(',');
    const [t, l] = await Promise.all([
      this.db.prepare(`SELECT course_id, teacher_id FROM course_teachers WHERE course_id IN (${ph}) ORDER BY teacher_id`).bind(...ids).all(),
      this.db.prepare(`SELECT * FROM course_labs WHERE course_id IN (${ph}) ORDER BY lab_id`).bind(...ids).all(),
    ]);
    return rows.map((r) => ({
      id: String(r.id), code: String(r.code), name: String(r.name), term: String(r.term), group: String(r.grp),
      startsAt: String(r.starts_at), endsAt: String(r.ends_at), archived: !!r.archived,
      teacherIds: t.results.filter((x) => x.course_id === r.id).map((x) => String(x.teacher_id)),
      labs: l.results.filter((x) => x.course_id === r.id).map((x) => ({ labId: x.lab_id as LabId, opensAt: String(x.opens_at), closesAt: String(x.closes_at), mode: x.mode as CourseLab['mode'] })),
    }));
  }

  async courses(): Promise<Course[]> {
    const { results } = await this.db.prepare('SELECT * FROM courses ORDER BY term DESC, code, grp').all();
    return this.assemble(results);
  }

  async courseById(id: string): Promise<Course | null> {
    const r = await this.db.prepare('SELECT * FROM courses WHERE id = ?').bind(id).first();
    return r ? (await this.assemble([r]))[0] : null;
  }

  async coursesOfTeacher(teacherId: string): Promise<Course[]> {
    const { results } = await this.db.prepare(`SELECT c.* FROM courses c JOIN course_teachers t ON t.course_id = c.id
      WHERE t.teacher_id = ? AND c.archived = 0 ORDER BY c.term DESC, c.code, c.grp`).bind(teacherId).all();
    return this.assemble(results);
  }

  async courseExists(code: string, term: string, group: string, exceptId?: string): Promise<boolean> {
    const r = await this.db.prepare('SELECT id FROM courses WHERE code = ? AND term = ? AND grp = ? AND id <> ?').bind(code, term, group, exceptId ?? '').first();
    return !!r;
  }

  private labsStmts(courseId: string, labs: CourseLab[]): SqlStmt[] {
    return [
      this.db.prepare('DELETE FROM course_labs WHERE course_id = ?').bind(courseId),
      ...labs.map((l) => this.db.prepare('INSERT INTO course_labs (course_id, lab_id, opens_at, closes_at, mode) VALUES (?, ?, ?, ?, ?)').bind(courseId, l.labId, l.opensAt, l.closesAt, l.mode)),
    ];
  }

  private teachersStmts(courseId: string, teacherIds: string[]): SqlStmt[] {
    return [
      this.db.prepare('DELETE FROM course_teachers WHERE course_id = ?').bind(courseId),
      ...teacherIds.map((t) => this.db.prepare('INSERT INTO course_teachers (course_id, teacher_id) VALUES (?, ?)').bind(courseId, t)),
    ];
  }

  async saveCourse(c: Course, isNew: boolean, extra: SqlStmt[] = []) {
    const head = isNew
      ? this.db.prepare('INSERT INTO courses (id, code, name, term, grp, starts_at, ends_at, archived) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(c.id, c.code, c.name, c.term, c.group, c.startsAt, c.endsAt, c.archived ? 1 : 0)
      : this.db.prepare('UPDATE courses SET code = ?, name = ?, term = ?, grp = ?, starts_at = ?, ends_at = ?, archived = ? WHERE id = ?')
        .bind(c.code, c.name, c.term, c.group, c.startsAt, c.endsAt, c.archived ? 1 : 0, c.id);
    await this.db.batch([head, ...this.teachersStmts(c.id, c.teacherIds), ...this.labsStmts(c.id, c.labs), ...extra]);
  }

  async setCourseLabs(courseId: string, labs: CourseLab[], extra: SqlStmt[] = []) {
    await this.db.batch([...this.labsStmts(courseId, labs), ...extra]);
  }

  async activeCounts(): Promise<Record<string, number>> {
    const { results } = await this.db.prepare("SELECT course_id, COUNT(*) AS n FROM enrollments WHERE status = 'active' GROUP BY course_id").all();
    return Object.fromEntries(results.map((r) => [String(r.course_id), Number(r.n)]));
  }

  // ── Matrículas ──
  async enrollmentById(id: string): Promise<Enrollment | null> {
    const r = await this.db.prepare('SELECT * FROM enrollments WHERE id = ?').bind(id).first();
    return r ? toEnrollment(r) : null;
  }

  async enrollment(courseId: string, studentId: string): Promise<Enrollment | null> {
    const r = await this.db.prepare('SELECT * FROM enrollments WHERE course_id = ? AND student_id = ?').bind(courseId, studentId).first();
    return r ? toEnrollment(r) : null;
  }

  async hasActiveEnrollment(studentId: string): Promise<boolean> {
    return !!(await this.db.prepare("SELECT 1 FROM enrollments WHERE student_id = ? AND status = 'active' LIMIT 1").bind(studentId).first());
  }

  /** Matrículas activas en cursos vigentes (no archivados y dentro de sus fechas). */
  async liveEnrollments(studentId: string, nowIso: string): Promise<Enrollment[]> {
    const { results } = await this.db.prepare(`SELECT e.* FROM enrollments e JOIN courses c ON c.id = e.course_id
      WHERE e.student_id = ? AND e.status = 'active' AND c.archived = 0 AND c.starts_at <= ? AND c.ends_at >= ?`).bind(studentId, nowIso, nowIso).all();
    return results.map(toEnrollment);
  }

  async seatsUsed(): Promise<number> {
    const r = await this.db.prepare("SELECT COUNT(DISTINCT student_id) AS n FROM enrollments WHERE status = 'active'").first();
    return Number(r?.n ?? 0);
  }

  insertEnrollmentStmt(e: Enrollment): SqlStmt {
    return this.db.prepare('INSERT INTO enrollments (id, course_id, student_id, status, enrolled_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(e.id, e.courseId, e.studentId, e.status, e.enrolledAt, e.updatedAt);
  }

  enrollmentStatusStmt(id: string, status: EnrollmentStatus, at: string): SqlStmt {
    return this.db.prepare('UPDATE enrollments SET status = ?, updated_at = ? WHERE id = ?').bind(status, at, id);
  }

  async roster(courseId: string) {
    const { results } = await this.db.prepare(`SELECT e.id AS enrollment_id, e.status, u.id, u.name, u.email, u.code, u.last_login_at
      FROM enrollments e JOIN users u ON u.id = e.student_id WHERE e.course_id = ? ORDER BY u.name COLLATE NOCASE`).bind(courseId).all();
    return results.map((r) => ({
      enrollmentId: String(r.enrollment_id), status: r.status as EnrollmentStatus, id: String(r.id), name: String(r.name), email: String(r.email),
      code: str(r.code) ?? undefined, lastLoginAt: str(r.last_login_at),
    }));
  }

  // ── Entregas ──
  upsertSubmissionStmt(s: Submission): SqlStmt {
    return this.db.prepare(`INSERT INTO submissions (id, user_id, course_id, lab_id, mode, attempt_id, score, components, duration_s, submitted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (user_id, attempt_id) DO UPDATE SET course_id = excluded.course_id, lab_id = excluded.lab_id, mode = excluded.mode,
        score = excluded.score, components = excluded.components, duration_s = excluded.duration_s, submitted_at = excluded.submitted_at`)
      .bind(s.id, s.userId, s.courseId, s.labId, s.mode, s.attemptId, s.score, JSON.stringify(s.components), s.durationS, s.submittedAt);
  }

  async submissionByAttempt(userId: string, attemptId: string): Promise<Submission | null> {
    const r = await this.db.prepare('SELECT * FROM submissions WHERE user_id = ? AND attempt_id = ?').bind(userId, attemptId).first();
    return r ? toSubmission(r) : null;
  }

  async submissionsOf(userId: string): Promise<Submission[]> {
    const { results } = await this.db.prepare('SELECT * FROM submissions WHERE user_id = ? ORDER BY submitted_at DESC').bind(userId).all();
    return results.map(toSubmission);
  }

  /** Mejor nota, número de entregas y última fecha por estudiante y práctica de un curso. */
  async gradeSummary(courseId: string) {
    const { results } = await this.db.prepare(`SELECT user_id, lab_id, MAX(score) AS best, COUNT(*) AS attempts, MAX(submitted_at) AS last_at
      FROM submissions WHERE course_id = ? GROUP BY user_id, lab_id`).bind(courseId).all();
    return results.map((r) => ({ userId: String(r.user_id), labId: String(r.lab_id), best: Number(r.best), attempts: Number(r.attempts), lastAt: String(r.last_at) }));
  }

  // ── Auditoría y resumen ──
  auditStmt(e: AuditEntry): SqlStmt {
    return this.db.prepare('INSERT INTO audit (id, at, actor_id, action, target, detail) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(e.id, e.at, e.actorId, e.action, e.target ?? null, e.detail ?? null);
  }

  async audit(limit: number): Promise<AuditEntry[]> {
    const { results } = await this.db.prepare('SELECT * FROM audit ORDER BY at DESC, rowid DESC LIMIT ?').bind(limit).all();
    return results.map((r) => ({ id: String(r.id), at: String(r.at), actorId: String(r.actor_id), action: String(r.action), target: str(r.target) ?? undefined, detail: str(r.detail) ?? undefined }));
  }

  async counts() {
    const r = await this.db.prepare(`SELECT
      (SELECT COUNT(*) FROM users WHERE role = 'admin') AS admins,
      (SELECT COUNT(*) FROM users WHERE role = 'teacher') AS teachers,
      (SELECT COUNT(*) FROM users WHERE role = 'student') AS students,
      (SELECT COUNT(*) FROM users WHERE status = 'suspended') AS suspended,
      (SELECT COUNT(*) FROM courses) AS courses,
      (SELECT COUNT(*) FROM submissions) AS submissions`).first();
    return {
      admins: Number(r?.admins ?? 0), teachers: Number(r?.teachers ?? 0), students: Number(r?.students ?? 0),
      suspended: Number(r?.suspended ?? 0), courses: Number(r?.courses ?? 0), submissions: Number(r?.submissions ?? 0),
    };
  }

  async liveCourseCount(nowIso: string): Promise<number> {
    const r = await this.db.prepare('SELECT COUNT(*) AS n FROM courses WHERE archived = 0 AND starts_at <= ? AND ends_at >= ?').bind(nowIso, nowIso).first();
    return Number(r?.n ?? 0);
  }

  async run(stmts: SqlStmt[]) {
    if (stmts.length) await this.db.batch(stmts);
  }

  prepare(sql: string) {
    return this.db.prepare(sql);
  }
}
