/**
 * Regímenes de validez de F06 (§3): la ley de Hooke y U_el = ½ k x² valen en el tramo lineal (x ≤ x_lin) de un resorte
 * sin daño; la conservación K + U_g + U_el vale sin roce ni amortiguamiento; un ensayo empujado, con el resorte suelto,
 * la masa cambiada en marcha o después de un golpe ya no describe el modelo ideal.
 */
export type EnergyRegime = 'conservative' | 'dissipative' | 'invalid';

const INVALID = ['NONLINEAR', 'DAMAGED', 'DETACHED', 'PUSHED', 'MASS_CHANGED', 'POST_IMPACT', 'CONFIG_CHANGED', 'UNPLUGGED', 'CLIPPED'];

/** Clasifica un ensayo por sus banderas y por si tenía el patín o el amortiguador activos. */
export function classifyRun(flags: string[], losses: boolean): EnergyRegime {
  if (flags.some((f) => INVALID.includes(f))) return 'invalid';
  return losses ? 'dissipative' : 'conservative';
}

/** ¿La compresión queda en el tramo lineal del resorte? */
export const inLinearRange = (x: number, xLin: number) => Number.isFinite(x) && Math.abs(x) <= xLin + 1e-9;
