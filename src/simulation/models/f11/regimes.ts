/**
 * Regímenes de validez de F11 (§3): p = ρ g h vale para un líquido homogéneo y quieto (sin oleaje, sin mezcla ni
 * perfil de densidad, sonda libre de paredes y de burbujas); Arquímedes con el cuerpo quieto, libre (sin hilo tenso ni
 * apoyo en el fondo o en otro objeto) y el volumen desplazado recogido sin derrame. Una lectura con esas banderas no
 * entra a la tabla del modelo ideal.
 */
export type FluidRegime = 'hydrostatic' | 'stratified' | 'invalid';
export type BodyRegime = 'archimedes' | 'invalid';

const FLUID_INVALID = ['WAVES', 'MIXED', 'BUBBLE', 'WALL', 'UNSTABLE', 'DRIFT', 'UNPLUGGED', 'CLIPPED', 'POST_IMPACT', 'RHO_CHANGED', 'CONFIG_CHANGED'];
const BODY_INVALID = ['WAVES', 'MOVING', 'STACKED', 'TETHERED', 'ON_BOTTOM', 'UNSTABLE', 'OBLIQUE', 'NOT_PRIMED', 'SPILL', 'CLIPPED'];

export function classifyPressureReading(flags: string[]): FluidRegime {
  if (flags.some((f) => FLUID_INVALID.includes(f))) return 'invalid';
  if (flags.includes('STRATIFIED')) return 'stratified';
  return 'hydrostatic';
}

export const classifyBodyReading = (flags: string[]): BodyRegime => (flags.some((f) => BODY_INVALID.includes(f)) ? 'invalid' : 'archimedes');
