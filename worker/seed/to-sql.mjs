/**
 * Convierte el documento de datos de la beta (formato `Db` de worker/core/types.ts: el de los datos iniciales y el que
 * vivía en Cloudflare KV) en sentencias SQL para el esquema de migrations/.
 */
const q = (v) => (v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : typeof v === 'boolean' ? (v ? '1' : '0') : `'${String(v).replace(/'/g, "''")}'`);
const row = (table, cols, vals) => `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${vals.map(q).join(', ')});`;

export function toSql(db) {
  const out = ['-- Generado por worker/seed/to-sql.mjs'];
  const l = db.license;
  out.push(row('license', ['id', 'institution', 'valid_from', 'valid_to', 'student_seats'], [1, l.institution, l.validFrom, l.validTo, l.studentSeats]));
  for (const u of db.users) {
    out.push(row('users', ['id', 'role', 'email', 'name', 'code', 'status', 'password_hash', 'must_change_password', 'token_version', 'failed_logins', 'locked_until', 'created_at', 'last_login_at'],
      [u.id, u.role, u.email, u.name, u.code ?? null, u.status, u.passwordHash, !!u.mustChangePassword, u.tokenVersion, u.failedLogins ?? 0, u.lockedUntil ?? null, u.createdAt, u.lastLoginAt ?? null]));
  }
  for (const c of db.courses) {
    out.push(row('courses', ['id', 'code', 'name', 'term', 'grp', 'starts_at', 'ends_at', 'archived'], [c.id, c.code, c.name, c.term, c.group, c.startsAt, c.endsAt, !!c.archived]));
    for (const t of c.teacherIds) out.push(row('course_teachers', ['course_id', 'teacher_id'], [c.id, t]));
    for (const lab of c.labs) out.push(row('course_labs', ['course_id', 'lab_id', 'opens_at', 'closes_at', 'mode'], [c.id, lab.labId, lab.opensAt, lab.closesAt, lab.mode]));
  }
  for (const e of db.enrollments) out.push(row('enrollments', ['id', 'course_id', 'student_id', 'status', 'enrolled_at', 'updated_at'], [e.id, e.courseId, e.studentId, e.status, e.enrolledAt, e.updatedAt]));
  for (const s of db.submissions) {
    out.push(row('submissions', ['id', 'user_id', 'course_id', 'lab_id', 'mode', 'attempt_id', 'score', 'components', 'duration_s', 'submitted_at'],
      [s.id, s.userId, s.courseId, s.labId, s.mode, s.attemptId, s.score, JSON.stringify(s.components ?? []), s.durationS ?? 0, s.submittedAt]));
  }
  for (const a of db.audit) out.push(row('audit', ['id', 'at', 'actor_id', 'action', 'target', 'detail'], [a.id, a.at, a.actorId, a.action, a.target ?? null, a.detail ?? null]));
  return `${out.join('\n')}\n`;
}
