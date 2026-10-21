/**
 * Balance del líquido de montaje (§3.2, §6.6-8): lo que había en el gotero = gotero + montajes + residuos + derrames +
 * evaporado. Tolerancia numérica absoluta 1e-6 mL; nunca se crea ni se pierde líquido.
 */
export interface FluidLedger {
  initialMl: number;
  reservoirMl: number;
  mountMl: number;
  wasteMl: number;
  spilledMl: number;
  evaporatedMl: number;
}

export const ledgerError = (f: FluidLedger) => f.initialMl - (f.reservoirMl + f.mountMl + f.wasteMl + f.spilledMl + f.evaporatedMl);

export const FLUID_TOLERANCE_ML = 1e-6;
