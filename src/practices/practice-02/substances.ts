/**
 * Tabla de sustancias, curvas de solubilidad y constantes de la Práctica 2.
 * FUENTE DE VERDAD de los datos científicos (§4, §19.3). El renderizador solo lee `colorHex`.
 * Cualquier cambio aquí debe reflejarse en docs/SUPUESTOS_CIENTIFICOS.md.
 */
import type { SubstanceDef, SubstanceId, SubstanceTable } from '../../simulation/substances/types';

/** §4.4 — g KNO₃ / 100 g H₂O. Interpolación lineal, sin extrapolar sobre 100 °C. */
export const KNO3_SOLUBILITY: ReadonlyArray<readonly [number, number]> = [
  [0, 13.3], [10, 20.9], [20, 31.6], [25, 38.3], [30, 45.8], [40, 63.9],
  [50, 85.5], [60, 110.0], [70, 138.0], [80, 169.0], [90, 209.0], [100, 246.0],
];

/** NaCl: casi independiente de T (CRC Handbook). */
export const NACL_SOLUBILITY: ReadonlyArray<readonly [number, number]> = [
  [0, 35.7], [20, 35.9], [40, 36.4], [60, 37.1], [80, 38.0], [100, 39.2],
];

/** Sacarosa (CRC Handbook). */
export const SUCROSE_SOLUBILITY: ReadonlyArray<readonly [number, number]> = [
  [0, 179.2], [20, 203.9], [25, 211.4], [40, 238.1], [60, 287.3], [80, 362.1], [100, 487.2],
];

/** Impurezas solubles inertes del KNO₃ grado técnico: nunca saturan en esta práctica. */
export const IMP_SOLUBILITY: ReadonlyArray<readonly [number, number]> = [[0, 300], [100, 300]];

const def = (d: SubstanceDef): SubstanceDef => d;

export const SUBSTANCES: SubstanceTable = {
  Zn: def({
    id: 'Zn', nameKey: 'sub.Zn', formula: 'Zn', classification: 'ELEMENT', stateAt25: 'SOLID',
    colorHex: 0xa9b1ba, expectedColorKeys: ['gris_plateado', 'gris'], odor: 'NONE', waterBehavior: 'INSOLUBLE',
    densityGPerMl: 7.14, specificHeatJPerGK: 0.39, apparentVolumeMlPerG: 0,
    particle: { kind: 'CHUNK', sizeUm: 2500, settleRate: 6, floatFraction: 0 }, dissolveRate: 0,
  }),
  GRAPHITE: def({
    id: 'GRAPHITE', nameKey: 'sub.GRAPHITE', formula: 'C', classification: 'ELEMENT', stateAt25: 'SOLID',
    colorHex: 0x2b2b2e, expectedColorKeys: ['negro', 'gris_oscuro'], odor: 'NONE', waterBehavior: 'INSOLUBLE',
    densityGPerMl: 2.2, specificHeatJPerGK: 0.71, apparentVolumeMlPerG: 0,
    particle: { kind: 'POWDER', sizeUm: 40, settleRate: 0.035, floatFraction: 0.05 }, dissolveRate: 0,
  }),
  S8: def({
    id: 'S8', nameKey: 'sub.S8', formula: 'S₈', classification: 'ELEMENT', stateAt25: 'SOLID',
    colorHex: 0xf2d72c, expectedColorKeys: ['amarillo'], odor: 'NONE', waterBehavior: 'INSOLUBLE',
    densityGPerMl: 2.07, specificHeatJPerGK: 0.71, apparentVolumeMlPerG: 0,
    particle: { kind: 'POWDER', sizeUm: 60, settleRate: 0.08, floatFraction: 0.35 }, dissolveRate: 0,
  }),
  NaCl: def({
    id: 'NaCl', nameKey: 'sub.NaCl', formula: 'NaCl', classification: 'COMPOUND', stateAt25: 'SOLID',
    colorHex: 0xf4f6f8, expectedColorKeys: ['blanco', 'incoloro'], odor: 'NONE', waterBehavior: 'SOLUBLE',
    solubilityTable: NACL_SOLUBILITY, densityGPerMl: 2.16, specificHeatJPerGK: 0.86, apparentVolumeMlPerG: 0.28,
    particle: { kind: 'CRYSTAL', sizeUm: 400, settleRate: 2.5, floatFraction: 0 }, dissolveRate: 1.0,
  }),
  SUCROSE: def({
    id: 'SUCROSE', nameKey: 'sub.SUCROSE', formula: 'C₁₂H₂₂O₁₁', classification: 'COMPOUND', stateAt25: 'SOLID',
    colorHex: 0xfbfaf4, expectedColorKeys: ['blanco'], odor: 'NONE', waterBehavior: 'SOLUBLE',
    solubilityTable: SUCROSE_SOLUBILITY, densityGPerMl: 1.59, specificHeatJPerGK: 1.25, apparentVolumeMlPerG: 0.62,
    particle: { kind: 'CRYSTAL', sizeUm: 500, settleRate: 2.2, floatFraction: 0 }, dissolveRate: 0.6,
  }),
  OIL_VEG: def({
    id: 'OIL_VEG', nameKey: 'sub.OIL_VEG', formula: 'mezcla de triglicéridos', classification: 'HOMOGENEOUS_MIXTURE',
    stateAt25: 'LIQUID', colorHex: 0xf0d77a, expectedColorKeys: ['amarillo_palido', 'amarillo'], odor: 'FAINT',
    waterBehavior: 'IMMISCIBLE', densityGPerMl: 0.92, specificHeatJPerGK: 2.0, apparentVolumeMlPerG: 0,
    particle: { kind: 'LIQUID', sizeUm: 0, settleRate: 0, floatFraction: 1 }, dissolveRate: 0, relativeViscosity: 50,
  }),
  OIL_MIN: def({
    id: 'OIL_MIN', nameKey: 'sub.OIL_MIN', formula: 'mezcla de hidrocarburos', classification: 'HOMOGENEOUS_MIXTURE',
    stateAt25: 'LIQUID', colorHex: 0xeef3f6, expectedColorKeys: ['incoloro'], odor: 'NEAR_NONE',
    waterBehavior: 'IMMISCIBLE', densityGPerMl: 0.85, specificHeatJPerGK: 1.9, apparentVolumeMlPerG: 0,
    particle: { kind: 'LIQUID', sizeUm: 0, settleRate: 0, floatFraction: 1 }, dissolveRate: 0, relativeViscosity: 30,
  }),
  KNO3: def({
    id: 'KNO3', nameKey: 'sub.KNO3', formula: 'KNO₃', classification: 'COMPOUND', stateAt25: 'SOLID',
    colorHex: 0xf7f8fa, expectedColorKeys: ['blanco'], odor: 'NONE', waterBehavior: 'SOLUBLE',
    solubilityTable: KNO3_SOLUBILITY, densityGPerMl: 2.11, specificHeatJPerGK: 0.95, apparentVolumeMlPerG: 0.37,
    particle: { kind: 'CRYSTAL', sizeUm: 300, settleRate: 1.8, floatFraction: 0 }, dissolveRate: 0.06,
  }),
  CARBON: def({
    id: 'CARBON', nameKey: 'sub.CARBON', formula: 'C', classification: 'ELEMENT', stateAt25: 'SOLID',
    colorHex: 0x1c1c1e, expectedColorKeys: ['negro'], odor: 'NONE', waterBehavior: 'INSOLUBLE',
    densityGPerMl: 1.8, specificHeatJPerGK: 0.71, apparentVolumeMlPerG: 0,
    particle: { kind: 'POWDER', sizeUm: 80, settleRate: 0.06, floatFraction: 0.02 }, dissolveRate: 0,
  }),
  IMP: def({
    id: 'IMP', nameKey: 'sub.IMP', formula: '—', classification: 'COMPOUND', stateAt25: 'SOLID',
    colorHex: 0xf2f2f2, expectedColorKeys: ['blanco'], odor: 'NONE', waterBehavior: 'SOLUBLE',
    solubilityTable: IMP_SOLUBILITY, densityGPerMl: 2.0, specificHeatJPerGK: 0.9, apparentVolumeMlPerG: 0.3,
    particle: { kind: 'CRYSTAL', sizeUm: 100, settleRate: 1.5, floatFraction: 0 }, dissolveRate: 0.3,
  }),
};

/** Las seis sustancias de la Parte A, en el orden de la guía. */
export const PART_A_SOLIDS: SubstanceId[] = ['Zn', 'GRAPHITE', 'S8', 'NaCl', 'SUCROSE'];

/** §2 — relación másica carbón:KNO₃ = 1:5. */
export const TARGET_MIXTURE_G = 2.5;
export const CARBON_TO_KNO3_RATIO = [1, 5] as const;
export const carbonMassG = TARGET_MIXTURE_G * (1 / 6);
export const kno3MassG = TARGET_MIXTURE_G * (5 / 6);
