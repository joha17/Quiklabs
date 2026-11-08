/**
 * Calibrador (pie de rey) de nonio, reutilizable (F101 §4, §6). Modelo instrumental puro en milímetros y newtons:
 *
 * - La mordaza móvil se desplaza por la regla (junta prismática 0–150 mm). Lo que se pide desde el gesto es una
 *   POSICIÓN OBJETIVO del cursor (`targetMm`); el contacto con la pieza la detiene y el exceso se convierte en fuerza
 *   de contacto (resorte del pulgar), nunca en interpenetración.
 * - La fuerza deforma elásticamente el conjunto mordazas + pieza: la apertura real queda por debajo de la extensión
 *   de la pieza en `F (1/k_mordaza + 1/k_pieza)` (F101-E02).
 * - La pieza oblicua entre las mordazas presenta su extensión PROYECTADA (F101-E03), no su diámetro.
 * - La escala muestra apertura + sesgo de cero, cuantizada a la resolución del nonio; leer con el ojo fuera de la
 *   normal de la escala corre la coincidencia una división (paralaje, F101-E06).
 */

export interface CaliperParams {
  rangeMm: number;
  resolutionMm: number;
  /** Rigidez del pulgar: N por mm de recorrido pedido más allá del contacto. */
  thumbNPerMm: number;
  /** Rigidez de las mordazas (N/mm); Infinity en el modo curricular ideal. */
  jawNPerMm: number;
  /** Fuerza máxima que el pulgar puede aplicar (N). */
  maxForceN: number;
  /** Fuerza de contacto recomendada: por encima se considera excesiva (N). */
  forceLimitN: number;
  /** Ángulo entre la vista y la normal de la escala a partir del cual hay paralaje (°). */
  parallaxDeg: number;
}

export interface CaliperPart {
  id: string;
  /** Extensión verdadera de la pieza a lo largo de las mordazas, sin inclinar (mm). */
  extentMm: number;
  /** Dimensión transversal que aparece al inclinarla (mm). */
  crossMm: number;
  /** Rigidez de la pieza (N/mm): metales ≫ nylon. */
  stiffNPerMm: number;
  /** Inclinación de la pieza respecto de las mordazas (°). */
  tiltDeg: number;
}

export interface CaliperState {
  jawMm: number;
  forceN: number;
  locked: boolean;
  zeroBiasMm: number;
  zeroChecked: boolean;
  part: CaliperPart | null;
}

export function newCaliper(zeroBiasMm = 0): CaliperState {
  return { jawMm: 30, forceN: 0, locked: false, zeroBiasMm, zeroChecked: false, part: null };
}

/** Extensión proyectada de la pieza oblicua entre caras paralelas: L cos θ + w |sen θ| (mm). */
export function projectedExtentMm(part: CaliperPart): number {
  const t = (part.tiltDeg * Math.PI) / 180;
  return part.extentMm * Math.abs(Math.cos(t)) + part.crossMm * Math.abs(Math.sin(t));
}

/** Aplica un objetivo del cursor (gesto o teclado). Devuelve el estado modificado en el sitio. */
export function setCaliperTarget(c: CaliperState, targetMm: number, p: CaliperParams): void {
  if (c.locked) return;
  const contact = c.part ? projectedExtentMm(c.part) : 0;
  const target = Math.min(p.rangeMm, targetMm);
  if (target >= contact) {
    c.jawMm = target;
    c.forceN = 0;
    return;
  }
  const F = Math.min(p.maxForceN, (contact - target) * p.thumbNPerMm);
  c.forceN = F;
  const compliance = (Number.isFinite(p.jawNPerMm) ? 1 / p.jawNPerMm : 0) + (c.part ? 1 / c.part.stiffNPerMm : 1 / Math.max(1, p.jawNPerMm));
  c.jawMm = Math.max(0, contact - F * compliance);
}

/** Soltar el pulgar sin bloquear: la fuerza se relaja y el cursor queda en el contacto. */
export function releaseCaliperThumb(c: CaliperState): void {
  if (c.locked || c.forceN <= 0) return;
  c.forceN = 0;
  c.jawMm = c.part ? projectedExtentMm(c.part) : 0;
}

/** Lo que indica la escala (mm, sin cuantizar): apertura real + sesgo de cero. */
export const caliperIndicationMm = (c: CaliperState) => c.jawMm + c.zeroBiasMm;

/** Lectura cuantizada al nonio con el paralaje de la vista (±1 división). */
export function caliperReadingMm(c: CaliperState, p: CaliperParams, viewDeg: number): { value: number; parallax: boolean } {
  const parallax = Math.abs(viewDeg) > p.parallaxDeg;
  const shift = parallax ? Math.sign(viewDeg) * p.resolutionMm : 0;
  const q = Math.round((caliperIndicationMm(c) + shift) / p.resolutionMm) * p.resolutionMm;
  return { value: Number(q.toFixed(3)), parallax };
}
