/**
 * Genera `worker/seed/seed.sql` (datos ficticios de la beta) con las contraseñas ya convertidas en hash.
 * Uso: `npm run seed`, luego `npm run db:setup` (local). Las contraseñas en claro están en docs/BETA.md.
 * Cargar el seed en una base que ya tiene datos falla (claves únicas): no pisa lo que el administrador cambió.
 */
import { writeFileSync } from 'node:fs';
import { webcrypto as crypto } from 'node:crypto';
import { toSql } from './to-sql.mjs';

const ITER = 30000;
const b64 = (u) => Buffer.from(u).toString('base64url');
async function hash(pw) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITER }, key, 256);
  return `pbkdf2$sha256$${ITER}$${b64(salt)}$${b64(new Uint8Array(bits))}`;
}

const T0 = '2026-07-01T06:00:00.000Z';
const user = async (id, role, email, name, pw, extra = {}) => ({
  id, role, email, name, code: extra.code, status: extra.status ?? 'active', passwordHash: await hash(pw),
  mustChangePassword: extra.mustChange ?? false, tokenVersion: 1, failedLogins: 0, lockedUntil: null, createdAt: T0, lastLoginAt: null,
});

const STUDENT_PW = 'Quimica2026!';
const students = [
  ['u_est01', 'B60101', 'Valeria Solano Mora', 'valeria.solano'],
  ['u_est02', 'B60102', 'Andrés Jiménez Castro', 'andres.jimenez'],
  ['u_est03', 'B60103', 'María José Vargas Rojas', 'mariajose.vargas'],
  ['u_est04', 'B60104', 'Diego Hernández Alfaro', 'diego.hernandez'],
  ['u_est05', 'B60105', 'Camila Araya Quesada', 'camila.araya'],
  ['u_est06', 'B60106', 'Sebastián Mora Villalobos', 'sebastian.mora'],
  ['u_est07', 'B60107', 'Daniela Chaves Brenes', 'daniela.chaves'],
  ['u_est08', 'B60108', 'José Pablo Ramírez Soto', 'josepablo.ramirez'],
  ['u_est09', 'B50109', 'Lucía Fernández Pérez', 'lucia.fernandez'],
  ['u_est10', 'B60110', 'Mateo Calderón Ulate', 'mateo.calderon'],
];

const users = [
  await user('u_admin', 'admin', 'admin@quiklabs.example', 'Administración Quiklabs', 'Admin#Quiklabs2026'),
  await user('u_doc01', 'teacher', 'laura.mendez@uni.example', 'Dra. Laura Méndez Ruiz', 'Docente2026!', { code: 'D-1042' }),
  await user('u_doc02', 'teacher', 'carlos.rojas@uni.example', 'Lic. Carlos Rojas Picado', 'Docente2026!', { code: 'D-1077' }),
];
for (const [id, code, name, mail] of students) {
  users.push(await user(id, 'student', `${mail}@estudiante.uni.example`, name, STUDENT_PW, {
    code,
    // Casos de la beta: primer ingreso con cambio obligatorio, cuenta suspendida, matrícula de un curso ya cerrado.
    mustChange: id === 'u_est08',
    status: id === 'u_est07' ? 'suspended' : 'active',
  }));
}

const labs = (p4Opens) => [
  { labId: 'p2', opensAt: '2026-08-17T06:00:00.000Z', closesAt: '2026-12-12T05:59:00.000Z', mode: 'PRACTICE' },
  { labId: 'p3', opensAt: '2026-09-07T06:00:00.000Z', closesAt: '2026-12-12T05:59:00.000Z', mode: 'PRACTICE' },
  { labId: 'p4', opensAt: p4Opens, closesAt: '2026-12-12T05:59:00.000Z', mode: 'EVALUATION' },
];
const courses = [
  { id: 'c_qg1_01', code: 'QU-0100', name: 'Química General I', term: '2026-II', group: '01', teacherIds: ['u_doc01'], startsAt: '2026-08-10T06:00:00.000Z', endsAt: '2026-12-12T05:59:00.000Z', labs: labs('2026-09-28T06:00:00.000Z'), archived: false },
  { id: 'c_qg1_02', code: 'QU-0100', name: 'Química General I', term: '2026-II', group: '02', teacherIds: ['u_doc02'], startsAt: '2026-08-10T06:00:00.000Z', endsAt: '2026-12-12T05:59:00.000Z', labs: labs('2026-10-12T06:00:00.000Z'), archived: false },
  { id: 'c_qg1_2026i', code: 'QU-0100', name: 'Química General I', term: '2026-I', group: '01', teacherIds: ['u_doc01'], startsAt: '2026-03-02T06:00:00.000Z', endsAt: '2026-07-04T05:59:00.000Z', labs: [], archived: false },
];

const enr = (id, courseId, studentId, status = 'active') => ({ id, courseId, studentId, status, enrolledAt: '2026-08-03T15:00:00.000Z', updatedAt: '2026-08-03T15:00:00.000Z' });
const enrollments = [
  enr('e01', 'c_qg1_01', 'u_est01'), enr('e02', 'c_qg1_01', 'u_est02'), enr('e03', 'c_qg1_01', 'u_est03'), enr('e04', 'c_qg1_01', 'u_est04'),
  enr('e05', 'c_qg1_02', 'u_est05'), enr('e06', 'c_qg1_02', 'u_est06'), enr('e07', 'c_qg1_01', 'u_est07'), enr('e08', 'c_qg1_02', 'u_est08'),
  // Lucía aprobó en 2026-I y no está matriculada este periodo: no puede entrar.
  enr('e09', 'c_qg1_2026i', 'u_est09', 'completed'),
  // Mateo se retiró del grupo 01.
  enr('e10', 'c_qg1_01', 'u_est10', 'withdrawn'),
];

const sub = (id, userId, courseId, labId, score, at, mode = 'PRACTICE') => ({
  id, userId, courseId, labId, mode, attemptId: `seed-${id}`, score, durationS: 2400 + Math.round(score * 900), submittedAt: at,
  components: [{ key: 'safety', score: Math.min(1, score + 0.05), weight: 0.2 }, { key: 'procedure', score, weight: 0.5 }, { key: 'notebook', score: Math.max(0, score - 0.08), weight: 0.3 }],
});
const submissions = [
  sub('s01', 'u_est01', 'c_qg1_01', 'p2', 0.91, '2026-08-28T20:14:00.000Z'),
  sub('s02', 'u_est01', 'c_qg1_01', 'p3', 0.86, '2026-09-18T19:02:00.000Z'),
  sub('s03', 'u_est02', 'c_qg1_01', 'p2', 0.74, '2026-08-29T01:40:00.000Z'),
  sub('s04', 'u_est02', 'c_qg1_01', 'p2', 0.82, '2026-09-02T22:11:00.000Z'),
  sub('s05', 'u_est03', 'c_qg1_01', 'p2', 0.95, '2026-08-27T16:30:00.000Z'),
  sub('s06', 'u_est03', 'c_qg1_01', 'p3', 0.79, '2026-09-20T18:45:00.000Z'),
  sub('s07', 'u_est05', 'c_qg1_02', 'p2', 0.68, '2026-08-30T21:05:00.000Z'),
];

const db = {
  version: 1,
  license: { institution: 'Universidad Nacional de Ciencias (demo)', validFrom: '2026-07-01T06:00:00.000Z', validTo: '2027-07-01T05:59:00.000Z', studentSeats: 120 },
  users, courses, enrollments, submissions,
  audit: [{ id: 'a_seed', at: T0, actorId: 'u_admin', action: 'seed', detail: 'Datos ficticios de la beta' }],
};

writeFileSync(new URL('./seed.sql', import.meta.url), toSql(db));
console.log(`seed.sql: ${users.length} usuarios, ${courses.length} cursos, ${enrollments.length} matrículas, ${submissions.length} entregas`);
