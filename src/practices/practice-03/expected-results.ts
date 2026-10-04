/**
 * Resultados esperados (§12) y diccionario docente de descriptores equivalentes. Nunca se muestran antes de entregar.
 * Los descriptores aceptados cubren variaciones razonables de tono (dispositivo, concentración, iluminación).
 */
import type { SolutionRow } from './definition';
import type { FlameRow } from './notebook';

export const EXPECTED_32: Record<FlameRow, { color: string[]; shape: string[]; luminosity: string[]; soot?: string[] }> = {
  initial: { color: ['amarillo', 'amarillo_anaranjado'], shape: ['irregular'], luminosity: ['luminosa'] },
  capsule1: { color: ['amarillo', 'amarillo_anaranjado'], shape: ['irregular'], luminosity: ['luminosa'], soot: ['negro'] },
  airOpen: { color: ['azul', 'azul_palido'], shape: ['dos_conos'], luminosity: ['no_luminosa', 'poco_luminosa'] },
  capsule2: { color: ['azul', 'azul_palido'], shape: ['dos_conos'], luminosity: ['no_luminosa', 'poco_luminosa'], soot: ['no', 'gris_tenue'] },
};

/** Cuadro 3.3 por catión (la fila de la incógnita usa la identidad sorteada). */
export const EXPECTED_BY_CATION: Record<string, { solutionColor: string[]; noFilter: string[]; filter: string[] }> = {
  'Na+': { solutionColor: ['incolora'], noFilter: ['amarillo', 'amarillo_anaranjado', 'anaranjado'], filter: ['oscura', 'sin_cambio', 'azul', 'violeta'] },
  'K+': { solutionColor: ['incolora'], noFilter: ['lila', 'violeta'], filter: ['lila', 'violeta'] },
  'Ca2+': { solutionColor: ['incolora'], noFilter: ['rojo_anaranjado', 'anaranjado', 'rojo'], filter: ['oscura', 'violeta', 'lila', 'rojo'] },
  'Cu2+': { solutionColor: ['azul_verdosa_palida'], noFilter: ['verde_azulado', 'verde'], filter: ['verde_azulado', 'azul', 'oscura'] },
  'Li+': { solutionColor: ['incolora'], noFilter: ['carmin', 'rojo'], filter: ['oscura', 'rojo', 'carmin', 'lila', 'violeta'] },
  'Ba2+': { solutionColor: ['incolora'], noFilter: ['verde', 'amarillo_verdoso'], filter: ['verde_azulado', 'oscura', 'azul'] },
  MIX: { solutionColor: ['incolora'], noFilter: ['amarillo', 'amarillo_anaranjado', 'anaranjado'], filter: ['lila', 'violeta'] },
};

export const ROW_CATION: Record<Exclude<SolutionRow, 'sol_unknown'>, string> = {
  sol_nacl: 'Na+', sol_kcl: 'K+', sol_cacl2: 'Ca2+', sol_cucl2: 'Cu2+', sol_licl: 'Li+', sol_bacl2: 'Ba2+', sol_mix: 'MIX',
};

/** Candidatos razonables para emisión entre 500 y 530 nm (§12.3). */
export const GREEN_CANDIDATES = ['Cu2+', 'Ba2+'];
