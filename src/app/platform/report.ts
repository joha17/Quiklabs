/**
 * Registro de entregas: cuando un estudiante entrega una práctica, la evaluación por evidencia que calculó el
 * simulador se envía al curso en el que la tiene asignada. Docentes y administradores pueden probar las prácticas sin
 * generar entregas. Si no hay red, el intento sigue guardado en el navegador y la entrega se puede reintentar.
 */
import type { Evaluation } from '../../simulation/scoring/types';
import type { LabId, LabMode } from '../../../worker/core/types';
import { api, ApiFailure } from './api';
import { labAccess, usePlatform } from './session';

export type ReportResult = { ok: true } | { ok: false; code: string } | null;

export async function reportSubmission(labId: LabId, args: { mode: string; attemptId: string; evaluation: Evaluation; durationS: number }): Promise<ReportResult> {
  const { me } = usePlatform.getState();
  if (!me || me.user.role !== 'student') return null;
  const access = labAccess(me, labId);
  if (!access?.courseId) return { ok: false, code: 'LAB_NOT_ASSIGNED' };
  const mode = (['PRACTICE', 'GUIDED', 'EVALUATION'].includes(args.mode) ? args.mode : access.mode ?? 'PRACTICE') as LabMode;
  try {
    await api('POST', '/student/submissions', {
      courseId: access.courseId, labId, mode, attemptId: args.attemptId, score: args.evaluation.total, durationS: args.durationS,
      components: args.evaluation.components.map((c) => ({ key: c.id, score: c.score, weight: c.weight })),
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, code: e instanceof ApiFailure ? e.code : 'ERROR' };
  }
}
