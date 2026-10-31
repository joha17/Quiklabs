/**
 * Parámetros de la práctica B08 (§7). Los del microscopio son LOS DE B06 (módulo óptico opcional). Cada valor lleva su
 * origen: `manual` (fuente), `didactic` (perfil sintético rotulado, PFO-08) o `platform` (contrato). Nada de esto es una
 * constante fisiológica ni un protocolo presencial.
 */
import type { B01Params } from '../../simulation/optical-world/types';
import { CODE_MAP_B07, DEFAULT_B07_PARAMS } from '../practice-b07/params';

export const CALIBRATION_B08: Record<string, { source: 'manual' | 'didactic' | 'platform'; status: 'verified' | 'pending' | 'hypothetical'; note: string }> = {
  kinetics: { source: 'didactic', status: 'hypothetical', note: 'Pmax, KI, KC y R calibrados al caso 8.3: 1 g, índice 100, 25 °C' },
  capillary: { source: 'didactic', status: 'pending', note: 'Radio interno 0,10 cm: prototipo de cálculo' },
  btb: { source: 'didactic', status: 'hypothetical', note: 'Curva pH–DIC–alcalinidad y viraje 6,0–7,6 orientativos' },
  pigments: { source: 'didactic', status: 'hypothetical', note: 'Masas por g de hoja y Rf del caso 8.1: perfil sintético' },
  extraction: { source: 'manual', status: 'verified', note: '1 g, 4 mL de acetona, 4 mL de agua, 3 mL de fase hidrocarbonada; papel 22 × 1,5 cm; origen a 2 cm; 20 min' },
};

/** B08 conserva solo el EPP de los catálogos heredados; el microscopio es opcional y no descuenta. */
export const CODE_MAP_B08: Record<string, string> = { ...Object.fromEntries(Object.keys(CODE_MAP_B07).map((k) => [k, ''])), E68: 'FOT-60' };

export const DEFAULT_B08_PARAMS: B01Params = {
  ...structuredClone(DEFAULT_B07_PARAMS),
  codeMap: CODE_MAP_B08,
  photo: {
    kinetics: { pMax: 0.2054, kI: 30, kC: 0.05, r25: 0.03852, tOptC: 25, tWidthC: 18, q10: 2 },
    runDurationS: 1200,
    seriesDurationS: 1200,
    capillaryRadiusCm: 0.1,
    headspaceMl: 15,
    ambientC: 25,
    pressureKPa: 101.325,
    lampRefCm: 20,
    lampHotCm: 15,
    mediumDicMM: 2,
    btbAlkMM: 0.1,
    btbTransition: [6, 7.6],
    btbCalibrated: false,
    co2PerUnitMM: 0.1,
    leafMassG: 1,
    acetoneMl: 4,
    waterMl: 4,
    hydrocarbonMl: 3,
    grindStrokes: 12,
    settleS: 20,
    spotDryS: 8,
    paperLengthMm: 220,
    originMm: 20,
    frontKMmPerSqrtS: 4.8,
    frontFadeS: 30,
    minUsefulMm: 50,
    rulerUMm: 0.5,
    pigmentUgPerG: { caro: 90, xant: 110, chlA: 800, chlB: 280 },
    rf: { caro: 68 / 96, xant: 45 / 96, chlA: 31 / 96, chlB: 20 / 96 },
    gasProfile: 'curricular',
  },
};
