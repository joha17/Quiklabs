/**
 * Formato de la cinta de un intento (sin dependencias: lo importa el runtime de cada práctica sin arrastrar la
 * simulación de las demás). La repetición y la calificación están en `grading.ts`.
 */
export type GradedLab = 'p2' | 'p3' | 'p4' | 'p5' | 'p6' | 'p10';

/** Marca de la cinta: al reanudar, la aplicación deja el mundo en estado seguro (`sanitizeOnResume*`). */
export const RESUME = '#resume';

/** `[tic, comando]`: el comando se aplicó cuando el mundo estaba en ese tic (antes del paso siguiente). */
export type TapeEntry = [tick: number, cmd: unknown];

/** Cinta de un intento: opciones de creación del mundo y todos los comandos, en orden. */
export interface AttemptTape {
  v: 1;
  labId: GradedLab;
  attemptId: string;
  options: unknown;
  entries: TapeEntry[];
}

/** Estado final entregado: el mundo (sin la lista de eventos) y lo necesario para evaluarlo. */
export interface AttemptSnapshot {
  world: unknown;
  notebook: unknown;
  /** Confirmación del EPP en la interfaz (la P2 no la guarda en el mundo). */
  ppe: boolean;
  /** Modo de la práctica (`settings.mode`). */
  mode: string;
}
