/**
 * Ruta del estudiante de la práctica B08 hecha SOLO con comandos, en el orden A → D → E → B → C → F de §1: hipótesis, par
 * luz/oscuridad con capilar, serie BTB con tres controles, extracción en campana, cromatografía y cierre.
 */
import { expect } from 'vitest';
import type { PhotoCommand } from '../simulation/photo-world/commands';
import type { PhotoWorld } from '../simulation/photo-world/types';
import { bandsOf, dispatchPhoto, runPhotoFor } from '../simulation/photo-world/world';
import { BOTTLES_HOOD, BTB_TUBES, GAS_TUBES, ORGANIC_WASTE, TANK_SLOT } from '../simulation/photo-world/geometry';
import { newPracticeB08World, type PracticeB08Options } from '../practices/practice-b08';
import { emptyB08Notebook, QUESTIONS_B08, type B08Notebook } from '../practices/practice-b08/notebook';

export function worldB08(opts: Partial<PracticeB08Options> = {}): PhotoWorld {
  return newPracticeB08World({ mode: 'PRACTICE', seed: 2608, ...opts });
}

export function cmdP(w: PhotoWorld, c: PhotoCommand, expectOk = true) {
  const r = dispatchPhoto(w, c);
  if (expectOk) expect(r.ok, `${c.type}: ${r.code ?? ''}`).toBe(true);
  return r;
}
export const runP = (w: PhotoWorld, s: number) => runPhotoFor(w, s);
const P = (x: number, y: number, z = 0) => ({ x, y, z, rotationRad: 0 });

export function placeP(w: PhotoWorld, id: string, support: string, at?: { x: number; y: number; z?: number }, expectOk = true) {
  const o = w.objects[id];
  return cmdP(w, { type: 'setPose', id, pose: P(at?.x ?? o.pose.x, at?.y ?? o.pose.y, at?.z ?? o.pose.z), support }, expectOk);
}
export function ppeB08(w: PhotoWorld, goggles = true) {
  for (const item of ['coat', 'shoes', 'hair', 'hands'] as const) cmdP(w, { type: 'setPPE', item, enabled: true });
  if (goggles) cmdP(w, { type: 'setPPE', item: 'goggles', enabled: true });
  cmdP(w, { type: 'startWork' });
}
export function hypothesisB08(w: PhotoWorld) {
  cmdP(w, { type: 'recordHypothesis', variable: 'luz' });
}
/** Montaje correcto de un tubo: rama, medio, tapón, capilar limpio y nivelado, y a su lugar del baño. */
export function tubeB08(w: PhotoWorld, tube: 'gL' | 'gD', sprig: string, slot: 'aqA' | 'aqB', label: 'light' | 'dark') {
  placeP(w, sprig, `tube:${tube}`, GAS_TUBES[tube]);
  cmdP(w, { type: 'fillTube', tubeId: tube, mL: 30, tiltDeg: 30 });
  cmdP(w, { type: 'setStopper', tubeId: tube, seat01: 1 });
  cmdP(w, { type: 'connectCapillary', tubeId: tube, contact01: 1 });
  cmdP(w, { type: 'clearCapillary', tubeId: tube });
  cmdP(w, { type: 'levelCapillary', tubeId: tube, deg: 0 });
  cmdP(w, { type: 'labelTube', tubeId: tube, label });
  placeP(w, tube, slot, { ...TANK_SLOT[slot], z: 3 });
}
export function setupGasB08(w: PhotoWorld) {
  tubeB08(w, 'gL', 'el1', 'aqA', 'light');
  tubeB08(w, 'gD', 'el2', 'aqB', 'dark');
  placeP(w, 'coverG', 'cover:gD', w.objects.gD.pose);
  cmdP(w, { type: 'setPose', id: 'lampG', pose: P(TANK_SLOT.aqA.x, TANK_SLOT.aqA.y + 20) });
  cmdP(w, { type: 'setLamp', lampId: 'lampG', on: true, powerPct: 100 });
  cmdP(w, { type: 'recordControls', dicKnown: true, tempC: 25, distanceCm: 20, powerIndex: 100, lightUnit: 'au' });
  const baseL = cmdP(w, { type: 'markBaseline', tubeId: 'gL', eyeOffsetCm: 0 }).id!;
  const baseD = cmdP(w, { type: 'markBaseline', tubeId: 'gD', eyeOffsetCm: 0 }).id!;
  return { baseL, baseD };
}
export function runGasB08(w: PhotoWorld) {
  cmdP(w, { type: 'startGasRun' });
  runP(w, w.params.photo!.runDurationS + 0.1);
  const finalL = cmdP(w, { type: 'readMeniscus', tubeId: 'gL', eyeOffsetCm: 0 }).id!;
  const finalD = cmdP(w, { type: 'readMeniscus', tubeId: 'gD', eyeOffsetCm: 0 }).id!;
  cmdP(w, { type: 'openStopper', tubeId: 'gL' });
  cmdP(w, { type: 'openStopper', tubeId: 'gD' });
  cmdP(w, { type: 'setLamp', lampId: 'lampG', on: false, powerPct: 100 });
  return { finalL, finalD };
}
export function setupBtbB08(w: PhotoWorld) {
  for (const id of ['bN', 'bL', 'bD']) {
    cmdP(w, { type: 'fillBtb', tubeId: id, mL: 10 });
    cmdP(w, { type: 'addIndicator', tubeId: id, drops: 4 });
    cmdP(w, { type: 'doseCO2', tubeId: id, units: 3, aligned: true });
  }
  placeP(w, 'elB1', 'tube:bL', BTB_TUBES.bL);
  placeP(w, 'elB2', 'tube:bD', BTB_TUBES.bD);
  placeP(w, 'coverB', 'cover:bD', BTB_TUBES.bD);
  cmdP(w, { type: 'setPose', id: 'lampB', pose: P(BTB_TUBES.bL.x, BTB_TUBES.bL.y + 20) });
  cmdP(w, { type: 'setLamp', lampId: 'lampB', on: true, powerPct: 100 });
  return Object.fromEntries(['bN', 'bL', 'bD'].map((id) => [id, cmdP(w, { type: 'readIndicator', tubeId: id }).id!]));
}
export function runBtbB08(w: PhotoWorld, already = 0) {
  cmdP(w, { type: 'startSeries' });
  runP(w, Math.max(0, w.params.photo!.seriesDurationS - already) + 0.1);
  const out = Object.fromEntries(['bN', 'bL', 'bD'].map((id) => [id, cmdP(w, { type: 'readIndicator', tubeId: id }).id!]));
  cmdP(w, { type: 'setLamp', lampId: 'lampB', on: false, powerPct: 100 });
  return out;
}
export const toHood = (w: PhotoWorld, id: string) => cmdP(w, { type: 'setPose', id, pose: P(BOTTLES_HOOD[id].x, BOTTLES_HOOD[id].y) });
export function extractionB08(w: PhotoWorld) {
  for (const id of ['bA', 'bW', 'bH', 'bE']) toHood(w, id);
  placeP(w, 'leaf', 'balance', { x: w.objects.balance.pose.x, y: w.objects.balance.pose.y, z: 5 });
  cmdP(w, { type: 'weighLeaf' });
  cmdP(w, { type: 'transferLeaf', g: 1, inside: true });
  cmdP(w, { type: 'grind', strokes: 14 });
  for (const [id, mL] of [['bA', 4], ['bW', 4], ['bH', 3]] as const) {
    cmdP(w, { type: 'openSolvent', bottleId: id });
    cmdP(w, { type: 'addSolvent', bottleId: id, mL });
    cmdP(w, { type: 'closeSolvent', bottleId: id });
  }
  cmdP(w, { type: 'capSepTube', closed: true });
  cmdP(w, { type: 'shake', intensity01: 1, seconds: 10 });
  cmdP(w, { type: 'capSepTube', closed: false });
  runP(w, w.params.photo!.settleS + 0.2);
  cmdP(w, { type: 'aspirate', zone: 'upper' });
}
/** Corta, marca, siembra, desarrolla hasta el frente de 116 mm del caso 8.1, retira y marca. */
export function chromB08(w: PhotoWorld) {
  const p = w.params.photo!;
  cmdP(w, { type: 'cutPaper' });
  cmdP(w, { type: 'markOrigin', tool: 'pencil', mm: p.originMm });
  cmdP(w, { type: 'applySpot', size: 'small' });
  runP(w, p.spotDryS + 0.2);
  cmdP(w, { type: 'applySpot', size: 'small' });
  runP(w, p.spotDryS + 0.2);
  cmdP(w, { type: 'openSolvent', bottleId: 'bE' });
  cmdP(w, { type: 'pourEluent', bottleId: 'bE', levelMm: 10 });
  cmdP(w, { type: 'closeSolvent', bottleId: 'bE' });
  cmdP(w, { type: 'hangPaper', tiltDeg: 0, clip: true });
  cmdP(w, { type: 'closeChamber', closed: true });
  runP(w, (116 / p.frontKMmPerSqrtS) ** 2);
  cmdP(w, { type: 'removePaper' });
  const front = cmdP(w, { type: 'markSolventFront', mm: Math.round(w.photo.paper.frontMm) }).id!;
  const bands = bandsOf(w).map((b) => ({ id: b.id, reading: cmdP(w, { type: 'markBand', bandId: b.id, mm: Math.round(b.centerMm) }).id!, color: b.color }));
  return { front, bands };
}
export function closeB08(w: PhotoWorld) {
  placeP(w, 'paper', 'organicWaste', ORGANIC_WASTE);
  placeP(w, 'vial', 'organicWaste', ORGANIC_WASTE);
  cmdP(w, { type: 'closeBench' }, false);
}
export function idealRouteB08(w: PhotoWorld, resume: (w: PhotoWorld) => PhotoWorld = (x) => x) {
  ppeB08(w);
  hypothesisB08(w);
  const base = setupGasB08(w);
  const b0 = setupBtbB08(w);
  const fin = runGasB08(w);
  w = resume(w);
  const b1 = runBtbB08(w);
  extractionB08(w);
  const chrom = chromB08(w);
  closeB08(w);
  return { w, base, fin, b0, b1, chrom };
}
const rd = (w: PhotoWorld, id: string) => w.photo.readings.find((r) => r.id === id)!;
const f = (v: number, d = 3) => v.toFixed(d);
export function fillNotebookB08(out: ReturnType<typeof idealRouteB08>, nb: B08Notebook = emptyB08Notebook('b08-test')): B08Notebook {
  const { w, base, fin, b0, b1, chrom } = out;
  nb.prereport = { hypothesis: 'A la luz la columna sube; a oscuras baja', variable: 'Luz', precautions: 'Campana; sin lámpara junto a vapores' };
  nb.prep[0] = { tubeId: 'gL', treatment: 'light', biomass: '1,0 g', volume: '30', dic: '2 mmol/L', light: '100 a.u.', tempC: '25', sealed: true };
  nb.prep[1] = { tubeId: 'gD', treatment: 'dark', biomass: '1,0 g', volume: '30', dic: '2 mmol/L', light: '0 a.u.', tempC: '25', sealed: true };
  const gas = (i: number, tube: string, b: string, e: string) => {
    const dh = rd(w, e).value - rd(w, b).value;
    const hours = rd(w, e).elapsedS! / 3600;
    Object.assign(nb.gas[i], { tubeId: tube, baselineId: b, finalId: e, initial: String(rd(w, b).value), final: String(rd(w, e).value), dh: String(dh), minutes: '20', hours: f(hours, 4), slope: f(dh / hours, 1), slopeUnit: 'mm/h', radiusMm: '1,0', dvMl: f(Math.PI * 0.01 * (dh / 10), 5), umol: '' });
    return dh;
  };
  const dhL = gas(0, 'gL', base.baseL, fin.finalL);
  const dhD = gas(1, 'gD', base.baseD, fin.finalD);
  nb.gross = { net: String(dhL * 3), dark: String(dhD * 3), gross: String(dhL * 3 + Math.abs(dhD * 3)), unit: 'mm/h', assumptionStated: true, humidityCorrected: false };
  for (const r of nb.btb) {
    Object.assign(r, { plant: r.tubeId !== 'bN', light: r.tubeId === 'bL', dic: '0,3 mmol/L añadidos', btb: '4 gotas', ph: '', readingId0: b0[r.tubeId], readingIdEnd: b1[r.tubeId], color0: rd(w, b0[r.tubeId]).color, colorMid: '', colorEnd: rd(w, b1[r.tubeId]).color, interpretation: 'Cambio de pH por el carbono inorgánico' });
  }
  nb.extraction = { mass: '1,00', volumes: '4 + 4 + 3', grind: 'Fina', phase: 'Superior', aspect: 'Verde intenso', lightNote: 'Lejos de la lámpara' };
  const o = w.photo.paper.originMm!;
  const fr = rd(w, chrom.front).value;
  nb.bands = chrom.bands.map((b) => {
    const c = rd(w, b.reading).value;
    return { bandId: b.id, readingId: b.reading, frontReadingId: chrom.front, color: b.color, origin: String(o), center: String(c), front: String(fr), dBand: String(c - o), dFront: String(fr - o), rf: f((c - o) / (fr - o)), u: '0,01', identity: 'provisional', composite: false, anomaly: false };
  });
  nb.synthesis = { hypothesisResult: 'Se sostiene en esta corrida', conclusion: 'La columna subió a la luz y bajó a oscuras', limits: 'Perfil sintético; bruta condicionada a R constante' };
  nb.open = { notes: 'Sin incidencias', limitations: 'Simulación', errors: 'Ninguno' };
  for (const q of QUESTIONS_B08) nb.analysis[q] = 'Respuesta argumentada con evidencia propia, citando lecturas y límites.';
  return nb;
}
