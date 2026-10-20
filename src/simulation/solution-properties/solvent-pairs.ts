/**
 * Pares soluto–disolvente de la Práctica 7 (§3.2, §6.2). El resultado de una mezcla NO se deduce de una regla de
 * polaridad: cada par tiene su modelo (curva de solubilidad, miscibilidad o comportamiento cualitativo verificado) y
 * su referencia. Un par sin ficha queda `pending`: no se simula y se avisa (§6.2, S14).
 *
 * Valores a 25 °C, CURRICULARES PROVISIONALES `[PENDIENTE]` (cotejar antes de publicar).
 */
import type { MaterialId } from './materials';

export type SolventId = 'water' | 'heptane';

export type PairModel =
  /** Sólido con solubilidad finita c_sat (g/L de disolvente) y velocidad de aproximación al equilibrio. */
  | { kind: 'solubility'; csatGL: number; kdS: number }
  /** Líquidos miscibles en toda proporción en el dominio usado. */
  | { kind: 'miscible' }
  /** Líquidos que forman dos fases. */
  | { kind: 'immiscible' }
  /** Sin dato validado: no se simula. */
  | { kind: 'pending' };

export interface SolventPairSpec {
  soluteId: MaterialId;
  solventId: SolventId;
  temperatureRangeC: [number, number];
  model: PairModel;
  literatureRef: string;
}

const REF = '[PENDIENTE] tabla de solubilidad/miscibilidad a 25 °C';

/** Insoluble a efectos del montaje: c_sat muy pequeña (no cero). */
const INSOL = (kdS = 0.02): PairModel => ({ kind: 'solubility', csatGL: 0.001, kdS });

const TABLE: Partial<Record<MaterialId, Partial<Record<SolventId, PairModel>>>> = {
  Cu: { water: INSOL(), heptane: INSOL() },
  Al: { water: INSOL(), heptane: INSOL() },
  Fe: { water: INSOL(), heptane: INSOL() },
  bronze: { water: INSOL(), heptane: INSOL() },
  graphite: { water: INSOL(), heptane: INSOL() },
  NaCl: { water: { kind: 'solubility', csatGL: 360, kdS: 0.12 }, heptane: INSOL() },
  KCl: { water: { kind: 'solubility', csatGL: 340, kdS: 0.12 }, heptane: INSOL() },
  NaHCO3: { water: { kind: 'solubility', csatGL: 96, kdS: 0.06 }, heptane: INSOL() },
  CuSO4_5H2O: { water: { kind: 'solubility', csatGL: 320, kdS: 0.05 }, heptane: INSOL() },
  NaOH: { water: { kind: 'pending' }, heptane: { kind: 'pending' } },
  sucrose: { water: { kind: 'solubility', csatGL: 2000, kdS: 0.08 }, heptane: INSOL() },
  paraffin: { water: INSOL(0.01), heptane: { kind: 'solubility', csatGL: 120, kdS: 0.006 } },
  naphthalene: { water: { kind: 'solubility', csatGL: 0.031, kdS: 0.02 }, heptane: { kind: 'solubility', csatGL: 90, kdS: 0.03 } },
  glycerol: { water: { kind: 'miscible' }, heptane: { kind: 'immiscible' } },
  ethanol: { water: { kind: 'miscible' }, heptane: { kind: 'pending' } },
  isopropanol: { water: { kind: 'miscible' }, heptane: { kind: 'pending' } },
  acetone: { water: { kind: 'miscible' }, heptane: { kind: 'pending' } },
  acetic: { water: { kind: 'miscible' }, heptane: { kind: 'pending' } },
  mineralOil: { water: { kind: 'immiscible' }, heptane: { kind: 'miscible' } },
  heptane: { water: { kind: 'immiscible' }, heptane: { kind: 'miscible' } },
  water: { water: { kind: 'miscible' }, heptane: { kind: 'immiscible' } },
  petEther: { water: { kind: 'pending' }, heptane: { kind: 'pending' } },
};

export function solventPair(soluteId: MaterialId, solventId: SolventId): SolventPairSpec {
  const model = TABLE[soluteId]?.[solventId] ?? { kind: 'pending' as const };
  return { soluteId, solventId, temperatureRangeC: [20, 30], model, literatureRef: REF };
}

/** Pares con ficha (los que se pueden simular y evaluar). */
export const pairValidated = (soluteId: MaterialId, solventId: SolventId) => solventPair(soluteId, solventId).model.kind !== 'pending';
