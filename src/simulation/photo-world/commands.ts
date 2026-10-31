/**
 * Comandos de B08 (§6.2): los de B06 más los gestos propios. Siempre HECHOS (asiento del tapón, contacto, nivel, altura
 * del ojo, posición marcada), nunca resultados: `setOxygen`, `setRf` o `completeStage` no existen.
 */
import type { DivCommand, DivDispatchResult } from '../div-world/commands';

export type PhotoOnlyCommand =
  | { type: 'recordHypothesis'; variable: string }
  | { type: 'labelTube'; tubeId: string; label: 'light' | 'dark' }
  | { type: 'fillTube'; tubeId: string; mL: number; tiltDeg: number }
  | { type: 'tapBubble'; tubeId: string }
  | { type: 'setStopper'; tubeId: string; seat01: number }
  | { type: 'connectCapillary'; tubeId: string; contact01: number }
  | { type: 'clearCapillary'; tubeId: string }
  | { type: 'levelCapillary'; tubeId: string; deg: number }
  | { type: 'recordControls'; dicKnown: boolean; tempC: number; distanceCm: number; powerIndex: number; lightUnit: 'au' | 'par' }
  | { type: 'setLamp'; lampId: string; on: boolean; powerPct: number }
  | { type: 'setDarkCover'; targetId: string; coverage: number }
  /** `eyeOffsetCm`: altura del ojo respecto del menisco; la lectura cae en la división que se ve desde allí. */
  | { type: 'markBaseline'; tubeId: string; eyeOffsetCm: number }
  | { type: 'readMeniscus'; tubeId: string; eyeOffsetCm: number }
  | { type: 'startGasRun' }
  | { type: 'stirTube'; tubeId: string }
  | { type: 'openStopper'; tubeId: string }
  | { type: 'fillBtb'; tubeId: string; mL: number }
  | { type: 'addIndicator'; tubeId: string; drops: number }
  | { type: 'doseCO2'; tubeId: string; units: number; aligned: boolean }
  | { type: 'readIndicator'; tubeId: string }
  | { type: 'startSeries' }
  | { type: 'mutateProfile' }
  | { type: 'setHood'; on: boolean; sashOk: boolean }
  | { type: 'openSolvent'; bottleId: string }
  | { type: 'closeSolvent'; bottleId: string }
  | { type: 'weighLeaf' }
  | { type: 'transferLeaf'; g: number; inside: boolean }
  | { type: 'grind'; strokes: number }
  | { type: 'addSolvent'; bottleId: string; mL: number }
  | { type: 'capSepTube'; closed: boolean }
  | { type: 'shake'; intensity01: number; seconds: number }
  | { type: 'aspirate'; zone: 'upper' | 'interface' | 'lower' }
  | { type: 'cutPaper' }
  | { type: 'markOrigin'; tool: 'pencil' | 'pen'; mm: number }
  | { type: 'applySpot'; size: 'small' | 'large' }
  | { type: 'pourEluent'; bottleId: string; levelMm: number }
  | { type: 'hangPaper'; tiltDeg: number; clip: boolean }
  | { type: 'closeChamber'; closed: boolean }
  | { type: 'removePaper' }
  | { type: 'markSolventFront'; mm: number }
  | { type: 'markBand'; bandId: string; mm: number }
  | { type: 'requestAsset'; assetId: string }
  | { type: 'attemptFlame' };

export type PhotoCommand = DivCommand | PhotoOnlyCommand;
export type PhotoDispatchResult = DivDispatchResult;

export const PHOTO_ONLY_TYPES = new Set<PhotoCommand['type']>([
  'recordHypothesis', 'labelTube', 'fillTube', 'tapBubble', 'setStopper', 'connectCapillary', 'clearCapillary', 'levelCapillary', 'recordControls', 'setLamp', 'setDarkCover', 'markBaseline', 'readMeniscus',
  'startGasRun', 'stirTube', 'openStopper', 'fillBtb', 'addIndicator', 'doseCO2', 'readIndicator', 'startSeries', 'mutateProfile', 'setHood', 'openSolvent', 'closeSolvent', 'weighLeaf', 'transferLeaf', 'grind',
  'addSolvent', 'capSepTube', 'shake', 'aspirate', 'cutPaper', 'markOrigin', 'applySpot', 'pourEluent', 'hangPaper', 'closeChamber', 'removePaper', 'markSolventFront', 'markBand', 'requestAsset', 'attemptFlame',
]);
