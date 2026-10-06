/**
 * Registro de entregas: cuando un estudiante entrega una práctica se envían al curso el estado final del mundo, la
 * libreta y la cinta de comandos del intento (comprimidos). La nota la calcula el servidor con la misma rúbrica; la
 * que calculó el navegador viaja solo para detectar diferencias. Docentes y administradores pueden probar las
 * prácticas sin generar entregas. Si no hay red, el intento sigue guardado en el navegador y la entrega se puede
 * reintentar.
 */
import type { Evaluation } from '../../simulation/scoring/types';
import type { AttemptSnapshot } from '../../practices/tape';
import type { LabId, LabMode } from '../../../worker/core/types';
import { packJson } from '../../../worker/core/pack';
import { api, ApiFailure } from './api';
import { labAccess, usePlatform } from './session';
import type { TapeRecorder } from './tape';

export type ReportResult = { ok: true } | { ok: false; code: string } | null;

/** Entrega del estudiante en su curso. Devuelve null si no corresponde (sin sesión de estudiante). */
export async function reportSubmission(
  labId: LabId,
  args: { mode: string; attemptId: string; evaluation: Evaluation; world: { events?: unknown[] }; notebook: unknown; ppe: boolean; tape: TapeRecorder | null },
): Promise<ReportResult> {
  const { me } = usePlatform.getState();
  if (!me || me.user.role !== 'student') return null;
  const access = labAccess(me, labId);
  if (!access?.courseId) return { ok: false, code: 'LAB_NOT_ASSIGNED' };
  const mode = (['PRACTICE', 'GUIDED', 'EVALUATION'].includes(args.mode) ? args.mode : access.mode ?? 'PRACTICE') as LabMode;
  try {
    // Los eventos son solo para la interfaz (subtítulos, sonidos): no cuentan en la evaluación.
    const snapshot: AttemptSnapshot = { world: { ...args.world, events: [] }, notebook: args.notebook, ppe: args.ppe, mode: args.mode };
    // Se serializa ya (JSON.stringify es síncrono), antes de que el mundo pueda seguir cambiando.
    const packed = packJson(snapshot);
    const tape = await args.tape?.toTape();
    await api('POST', '/student/submissions', {
      courseId: access.courseId, labId, mode, attemptId: args.attemptId, clientScore: args.evaluation.total,
      snapshot: await packed,
      tapeOptions: tape?.options ?? null,
      tape: tape ? await packJson(tape) : null,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, code: e instanceof ApiFailure ? e.code : 'ERROR' };
  }
}
