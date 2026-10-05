/**
 * Modelo de datos de la plataforma académica (beta). Todo vive en un solo documento JSON: los datos iniciales salen
 * de `worker/seed/data.json` y los cambios se guardan en Cloudflare KV. Compartido por el Worker y la interfaz.
 */
export type Role = 'admin' | 'teacher' | 'student';
export type UserStatus = 'active' | 'suspended';
export type LabId = 'p2' | 'p3' | 'p4';
export type LabMode = 'PRACTICE' | 'GUIDED' | 'EVALUATION';

export const LAB_IDS: LabId[] = ['p2', 'p3', 'p4'];

export interface User {
  id: string;
  role: Role;
  email: string;
  name: string;
  /** Carné universitario (estudiantes) o código de funcionario (docentes). */
  code?: string;
  status: UserStatus;
  /** `pbkdf2$sha256$<iteraciones>$<sal>$<hash>` (base64url). */
  passwordHash: string;
  /** El administrador asignó la contraseña: se pide cambiarla al ingresar. */
  mustChangePassword: boolean;
  /** Al subir este número se invalidan las sesiones abiertas (cambio de contraseña, suspensión). */
  tokenVersion: number;
  failedLogins: number;
  lockedUntil: string | null;
  createdAt: string;
  lastLoginAt: string | null;
}

/** Licencia de la universidad: vigencia y cupo de estudiantes con matrícula activa. */
export interface License {
  institution: string;
  validFrom: string;
  validTo: string;
  studentSeats: number;
}

export interface CourseLab {
  labId: LabId;
  /** Disponible para los estudiantes entre `opensAt` y `closesAt` (ISO). */
  opensAt: string;
  closesAt: string;
  mode: LabMode;
}

export interface Course {
  id: string;
  code: string;
  name: string;
  term: string;
  group: string;
  teacherIds: string[];
  startsAt: string;
  endsAt: string;
  labs: CourseLab[];
  archived: boolean;
}

export type EnrollmentStatus = 'active' | 'withdrawn' | 'completed';

export interface Enrollment {
  id: string;
  courseId: string;
  studentId: string;
  status: EnrollmentStatus;
  enrolledAt: string;
  updatedAt: string;
}

/** Entrega de una práctica: la evaluación por evidencia que calculó el simulador. */
export interface Submission {
  id: string;
  userId: string;
  courseId: string;
  labId: LabId;
  mode: LabMode;
  attemptId: string;
  /** 0…1 */
  score: number;
  /** Puntaje por componente de la rúbrica (0…1). */
  components: Array<{ key: string; score: number; weight: number }>;
  durationS: number;
  submittedAt: string;
}

export interface AuditEntry {
  id: string;
  at: string;
  actorId: string;
  action: string;
  target?: string;
  detail?: string;
}

export interface Db {
  version: number;
  license: License;
  users: User[];
  courses: Course[];
  enrollments: Enrollment[];
  submissions: Submission[];
  audit: AuditEntry[];
}

/** Usuario tal como lo ve la interfaz (sin hash ni contadores internos). */
export type PublicUser = Omit<User, 'passwordHash' | 'tokenVersion' | 'failedLogins'>;

export function publicUser(u: User): PublicUser {
  const { passwordHash: _h, tokenVersion: _t, failedLogins: _f, ...rest } = u;
  void _h;
  void _t;
  void _f;
  return rest;
}

/** Lo que devuelve `/api/auth/me`: el usuario y lo que puede abrir. */
export interface Me {
  user: PublicUser;
  /** Prácticas que puede abrir ahora (estudiantes: según matrícula y fechas; docentes y admin: todas). */
  labs: Array<{ labId: LabId; courseId: string | null; mode: LabMode | null; closesAt: string | null }>;
  license: { institution: string; validTo: string; active: boolean };
}
