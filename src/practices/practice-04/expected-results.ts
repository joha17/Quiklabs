/**
 * Resultados esperados (§19, §21) calculados con lo que REALMENTE se hizo en el intento: el limitante, el color
 * final y el sobrenadante dependen de las cantidades usadas, no de la guía. Nunca se muestran antes de entregar.
 */
import type { P4World } from '../../simulation/reaction-world/types';
import { contextFor } from './index';
import { liquidMl, observedVessel, speciesMol, vesselAppearance, vesselPH } from '../../simulation/reaction-world/world';
import { deliveredMl, experimentVessels } from './evidence';
import { REAGENTS } from './definition';

export interface Expected {
  [field: string]: string[];
}

const molar = (w: P4World, reagent: string, ion: string) => (reagent === 'naohX' ? w.params.naohSingle ?? 0.1 : REAGENTS[reagent]?.molar[ion] ?? 0);

/** Color de una disolución por su transmitancia (vocabulario de la libreta). */
export function colorWord(rgb: [number, number, number], pink = 0): string {
  const [r, g, b] = rgb;
  if (pink > 0.6) return 'fucsia';
  if (pink > 0.25) return 'rosa';
  if (pink > 0.04) return 'rosa_palido';
  if (r > 0.92 && g > 0.92 && b > 0.92) return 'incolora';
  if (b < 0.5 && r > 0.8 && g > 0.6) return b < 0.25 ? 'amarilla' : 'amarillo_palido';
  if (r < 0.5 && b > 0.6) return r < 0.25 ? 'azul' : 'azul_palido';
  if (g > r && g > b) return g > 0.85 ? 'verde_palido' : 'verdosa';
  return 'incolora';
}

export function expectedResults(w: P4World): Record<'A' | 'B1' | 'B2' | 'C1' | 'Mg', Expected> {
  const ctx = contextFor(w);
  const ev = experimentVessels(w);
  // A — color final según el pH real (equivalencia ⇒ incolora; exceso de base ⇒ rosa).
  const aApp = ev.A ? vesselAppearance(w, ctx, ev.A, observedVessel(w, ev.A)) : null;
  const aFinal = aApp ? colorWord(aApp.bulkRgb, aApp.pinkBulk) : 'incolora';
  // B1 — limitante por moles entregados.
  const b1 = deliveredMl(w, ev.B1);
  const nCa = ((b1.cacl2 ?? 0) / 1000) * molar(w, 'cacl2', 'Ca^2+');
  const nCO3 = ((b1.na2co3 ?? 0) / 1000) * molar(w, 'na2co3', 'CO3^2-');
  const lim1 = Math.abs(nCa - nCO3) / Math.max(1e-12, Math.max(nCa, nCO3)) < 0.06 ? ['equivalentes', 'Ca2+', 'CO3^2-'] : nCa < nCO3 ? ['Ca2+'] : ['CO3^2-'];
  // B2 — 1:3; con 1:1 limita el OH⁻ y queda Fe³⁺ (sobrenadante amarillo).
  const b2 = deliveredMl(w, ev.B2);
  const nFe = ((b2.fecl3 ?? 0) / 1000) * 0.15;
  const nOH = ((b2.naoh15 ?? 0) / 1000) * 0.15 + ((b2.naoh10 ?? 0) / 1000) * 0.1 + ((b2.naohX ?? 0) / 1000) * (w.params.naohSingle ?? 0);
  const lim2 = nOH / 3 < nFe ? ['OH-'] : ['Fe3+'];
  const b2o = observedVessel(w, ev.B2);
  const b2Fe = b2o ? speciesMol(b2o, 'Fe^3+') + speciesMol(b2o, 'FeOH^2+') : 0;
  const sup2 = b2Fe > 1e-6 ? ['amarillo'] : ['incoloro'];
  // C1
  const nail = w.metals.nail;
  const surface = nail && nail.sandStrokes > 0 ? ['lijado'] : ['oxidado_opaco', 'brillante'];
  const c1App = ev.C1 ? vesselAppearance(w, ctx, ev.C1, observedVessel(w, ev.C1)) : null;
  const c1Final = c1App ? colorWord(c1App.bulkRgb) : 'azul';
  // Mg
  const cap = observedVessel(w, 'capsule');
  const capApp = cap ? vesselAppearance(w, ctx, 'capsule', cap) : null;
  const phenol = capApp ? colorWord(capApp.bulkRgb, capApp.pinkBulk) : 'rosa';
  const unburned = Object.values(w.ribbons).some((r) => r.burnFrac > 0.02 && r.burnFrac < 0.95);
  return {
    A: {
      colorInitial: ['incolora'], during: ['remolinos_rosados'], colorFinal: aFinal === 'incolora' ? ['incolora'] : ['rosa_palido', 'rosa', 'fucsia'],
      thermal: ['exotermica'], type: ['ACIDO_BASE'],
    },
    B1: {
      immediate: ['turbidez_blanca'], texture: ['fino_blanco'], pptColor: ['blanca'], supernatant: ['incoloro', 'turbio'], limiting: lim1,
      thermal: ['sin_cambio', 'endotermica'], type: ['PRECIPITACION'],
    },
    B2: {
      immediate: ['precipitado_marron'], texture: ['gelatinoso_floculento'], pptColor: ['marron_rojizo'], supernatant: sup2, limiting: lim2,
      excess: lim2[0] === 'OH-' ? ['Fe3+'] : ['OH-'], thermal: ['sin_cambio', 'exotermica'], type: ['PRECIPITACION'],
    },
    C1: {
      metal: ['Fe'], surface, colorInitial: ['azul'], colorFinal: [c1Final, ...(c1Final === 'azul' ? ['azul_palido'] : ['azul_palido', 'verdosa'])],
      metalChange: ['deposito_rojizo'], oxidized: ['Fe'], reduced: ['Cu2+'], type: ['REDOX'],
    },
    Mg: {
      combustion: ['luz_blanca_intensa'], residue: unburned ? ['polvo_blanco', 'gris_metalico'] : ['polvo_blanco'], waterResult: ['suspension_blanca'],
      phenolColor: phenol === 'incolora' ? ['incolora', 'rosa_palido'] : ['rosa_palido', 'rosa', 'fucsia'], typeCombustion: ['COMBUSTION', 'REDOX'],
      typeWater: ['HIDRATACION', 'ACIDO_BASE'],
    },
  };
}

/** Datos medidos que puede insertar la libreta (§21.5): sin respuestas, solo lecturas. */
export function measuredSummary(w: P4World) {
  const ev = experimentVessels(w);
  return {
    probeC: Math.round(w.probe.readingC * 10) / 10,
    probeIn: w.probe.vesselId,
    stopwatchS: Math.floor(w.stopwatch.accumS + (w.stopwatch.running && w.stopwatch.startedAt !== null ? w.timeS - w.stopwatch.startedAt : 0)),
    aPH: ev.A && observedVessel(w, ev.A) && liquidMl(observedVessel(w, ev.A)!) > 0 ? vesselPH(observedVessel(w, ev.A)!) : NaN,
  };
}
