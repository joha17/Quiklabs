/**
 * Ruta del estudiante de la Práctica 9 hecha SOLO con comandos (sin inyectar banderas de etapa): atlas de emisión con
 * controles y blanco, comparación asa / vidrio virtual / refractario en la campana, marcha Sr → Fe con centrífuga
 * equilibrada y decantación, y confirmación del K⁺ en el sobrenadante final.
 */
import { expect } from 'vitest';
import type { P09Command } from '../simulation/cation-analysis-world/commands';
import type { P09World } from '../simulation/cation-analysis-world/types';
import { dispatchP09, objectMassG, runP09For, stepP09World, vesselMl } from '../simulation/cation-analysis-world/world';
import { volumeMl } from '../simulation/cation-analysis-world/species';
import { newPractice09World, type Practice09Options } from '../practices/practice-09';
import type { P09Scenario } from '../practices/practice-09/error-scenarios';
import { emptyP09Notebook, ATLAS_KEYS, CATIONS, QUESTIONS, type P09Notebook, type RowB } from '../practices/practice-09/notebook';
import { inferable } from '../practices/practice-09/expected-results';
import { CONTROLS, FLAME_POINT, PAD_POS, rackSlot, rotorSlot, TURB_POS, PAN_POS, CLEAN_POS } from '../practices/practice-09/definition';

export function world09(opts: Partial<Practice09Options> & { scenarios?: P09Scenario[] } = {}): P09World {
  return newPractice09World({ mode: 'PRACTICE', seed: 9009, ...opts });
}

export function cmd09(w: P09World, c: P09Command, expectOk = true) {
  const r = dispatchP09(w, c);
  if (expectOk) expect(r.ok, `${c.type}: ${r.code ?? ''}`).toBe(true);
  return r;
}

export const run09 = (w: P09World, s: number) => runP09For(w, s);
const P = (x: number, y: number, z = 0) => ({ x, y, z, rotationRad: 0 });

export function place(w: P09World, id: string, support: string, at?: { x: number; y: number; z?: number }) {
  const o = w.objects[id];
  return cmd09(w, { type: 'setPose', id, pose: P(at?.x ?? o.pose.x, at?.y ?? o.pose.y, at?.z ?? 0), support });
}

export function ppe09(w: P09World) {
  for (const item of ['goggles', 'coat', 'gloves'] as const) cmd09(w, { type: 'setPPE', item, enabled: true });
  cmd09(w, { type: 'startWork' });
  for (const t of ['hood01', 'cf01', 'smp1', 'emitter01']) cmd09(w, { type: 'inspect', target: t });
}

/** Campana lista: extracción encendida y mampara en rango, luz local elegida. */
export function hoodReady(w: P09World, light: 100 | 45 | 20 = 45) {
  cmd09(w, { type: 'setHoodFan', on: true });
  cmd09(w, { type: 'setSash', heightCm: 35 });
  cmd09(w, { type: 'setObservationLight', pct: light, scope: 'local' });
}

export const setLight = (w: P09World, pct: 100 | 45 | 20) => cmd09(w, { type: 'setObservationLight', pct, scope: 'local' });

/** Asa: limpiar, cargar en `source`, llevar a la llama, esperar y observar (y espectro opcional). */
export function loopTest(w: P09World, source: string, opts: { spectrum?: 1 | 4 | 16; clean?: boolean; waitS?: number } = {}) {
  if (opts.clean !== false) cleanLoop(w);
  if (w.vessels[source]?.capped) cmd09(w, { type: 'setCap', vesselId: source, capped: false });
  place(w, 'loop01', source, w.objects[source].pose);
  if (!w.flame.ignited) cmd09(w, { type: 'setIgnition', on: true });
  place(w, 'loop01', 'flame', FLAME_POINT);
  run09(w, opts.waitS ?? 1.5);
  const e = cmd09(w, { type: 'sampleEmission', zone: 'whole' }, false);
  const s = opts.spectrum ? cmd09(w, { type: 'readSpectrum', gain: opts.spectrum }, false) : null;
  if (w.vessels[source]?.capped === false && source.startsWith('ctl')) cmd09(w, { type: 'setCap', vesselId: source, capped: true });
  return { emission: e.id!, spectrum: s?.id };
}

export function cleanLoop(w: P09World) {
  place(w, 'loop01', 'clean01', CLEAN_POS);
  cmd09(w, { type: 'cleanSupport', supportId: 'loop01' });
}

/** Pipeta: aspira `ml` de `src` y los entrega en `dst`. */
export function pipette(w: P09World, src: string, dst: string, ml: number) {
  if (w.vessels[src]?.capped) cmd09(w, { type: 'setCap', vesselId: src, capped: false });
  const zs = w.objects[src].pose.z + w.vessels[src].floorCm + 0.6;
  place(w, 'pip', src, { ...w.objects[src].pose, z: zs });
  cmd09(w, { type: 'setPipette', squeeze01: -1 });
  for (let i = 0; i < 400 && volumeMl(w.pipette.content) < ml - 0.005; i++) {
    if (ml - volumeMl(w.pipette.content) < 0.06) cmd09(w, { type: 'setPipette', squeeze01: -0.2 });
    stepP09World(w);
  }
  cmd09(w, { type: 'setPipette', squeeze01: 0 });
  place(w, 'pip', dst, { ...w.objects[dst].pose, z: w.objects[dst].pose.z + 3 });
  cmd09(w, { type: 'setPipette', squeeze01: 1 });
  for (let i = 0; i < 400 && volumeMl(w.pipette.content) > 1e-6; i++) stepP09World(w);
  cmd09(w, { type: 'setPipette', squeeze01: 0 });
  place(w, 'pip', 'bench', { x: 386, y: 12, z: 0.5 });
  if (src === 'smp1' || src.startsWith('ctl')) cmd09(w, { type: 'setCap', vesselId: src, capped: true });
}

/** Soporte de llama (vidrio virtual o refractario) con 0,2 mL de `source`, observado sobre el emisor. */
export function padTest(w: P09World, support: 'wgFlame' | 'cupFlame', source: string, holdS = 2) {
  // El asa sale de la llama: se observa un solo soporte a la vez.
  if (w.objects.loop01.support === 'flame') cleanLoop(w);
  pipette(w, source, support, 0.2);
  if (!w.flame.ignited) cmd09(w, { type: 'setIgnition', on: true });
  place(w, support, 'flamePad', PAD_POS);
  run09(w, holdS);
  const e = cmd09(w, { type: 'sampleEmission', zone: 'whole' }, false);
  place(w, support, 'bench', { x: support === 'wgFlame' ? 246 : 260, y: 20 });
  cmd09(w, { type: 'cleanSupport', supportId: support });
  return e.id!;
}

export function drops(w: P09World, bottle: string, tube: string, n: number) {
  cmd09(w, { type: 'setCap', vesselId: bottle, capped: false });
  cmd09(w, { type: 'squeezeDropper', sourceId: bottle, targetId: tube, drops: n });
  cmd09(w, { type: 'setCap', vesselId: bottle, capped: true });
}

export function mix(w: P09World, tube: string, s = 3) {
  cmd09(w, { type: 'setStir', vesselId: tube, motion01: 0.6 });
  run09(w, s);
  cmd09(w, { type: 'setStir', vesselId: tube, motion01: 0 });
}

/** Lleva un tubo al platillo y lee la balanza (estable). */
export function weighTube(w: P09World, tube: string, back: string) {
  if (!w.balance.powered) cmd09(w, { type: 'powerBalance', on: true });
  const at = w.objects[tube].pose;
  place(w, tube, 'pan', PAN_POS);
  run09(w, 3);
  for (let i = 0; i < 20 && !w.balance.stable; i++) run09(w, 0.25);
  const r = cmd09(w, { type: 'readBalance' });
  place(w, tube, back, at);
  return r.id!;
}

/** Contrapeso: agua con la piseta en `counter` hasta igualar la masa de `tube` (con la balanza). */
export function balanceCounter(w: P09World, tube: string, counter: string) {
  const ids: string[] = [weighTube(w, tube, w.objects[tube].support)];
  for (let i = 0; i < 40; i++) {
    const diff = objectMassG(w, tube) - objectMassG(w, counter);
    if (Math.abs(diff) < 0.1) break;
    if (diff > 0) cmd09(w, { type: 'squeezeWash', targetId: counter, ml: Math.min(1, diff / 0.997) });
    else break;
  }
  ids.push(weighTube(w, counter, w.objects[counter].support));
  return ids;
}

/** Centrífuga: dos tubos opuestos, tapa, giro y espera hasta detenerse. */
export function centrifuge(w: P09World, a: string, b: string, seconds = 60) {
  const sa = w.objects[a].support;
  const sb = w.objects[b].support;
  cmd09(w, { type: 'setLid', closed: false });
  place(w, a, 'cf:0', rotorSlot(0));
  place(w, b, 'cf:2', rotorSlot(2));
  cmd09(w, { type: 'setLid', closed: true });
  cmd09(w, { type: 'spin', seconds });
  run09(w, seconds + 6);
  for (let i = 0; i < 40 && w.centrifuge.rpm > 0.5; i++) run09(w, 0.5);
  cmd09(w, { type: 'setLid', closed: false });
  place(w, a, sa, rackPose(sa));
  place(w, b, sb, rackPose(sb));
}

const rackPose = (s: string) => (s.startsWith('rack:') ? rackSlot(Number(s.slice(5))) : { x: 360, y: 20, z: 0 });

/** Decantación suave del sobrenadante de `src` a `dst`, sin arrastrar el sedimento. */
export function decant(w: P09World, src: string, dst: string) {
  const s = w.vessels[src];
  let last = Infinity;
  for (let i = 0; i < 4000; i++) {
    const ml = vesselMl(s);
    if (i % 20 === 0) {
      if (last - ml < 1e-4) break;
      last = ml;
    }
    const tilt0 = 100 - 88 * Math.min(1, ml / s.capacityMl);
    cmd09(w, { type: 'setPour', sourceId: src, targetId: dst, tiltDeg: Math.min(104, tilt0 + 6) });
    stepP09World(w);
  }
  cmd09(w, { type: 'stopPour', sourceId: src });
}

export function turbidity(w: P09World, tube: string) {
  const back = w.objects[tube].support;
  const at = w.objects[tube].pose;
  place(w, tube, 'turb01', { ...TURB_POS, z: 2 });
  const r = cmd09(w, { type: 'readTurbidity' });
  place(w, tube, back, at);
  return r.id!;
}

export interface IdealRes09 {
  atlas: Record<string, string>;
  spectra: string[];
  supports: string[];
  observations: string[];
  turbidity: string[];
  masses: string[];
  final: { emission?: string; spectrum?: string };
}

/** Ruta ideal completa por comandos. `resume` (opcional) simula interrupciones entre estaciones. */
export function idealRoute09(w0: P09World, resume: (w: P09World) => P09World = (w) => w) {
  let w = w0;
  const res: IdealRes09 = { atlas: {}, spectra: [], supports: [], observations: [], turbidity: [], masses: [], final: {} };
  ppe09(w);
  hoodReady(w, 45);
  // B — atlas: blanco, controles y una interferencia deliberada (Na + K).
  for (const c of CONTROLS) {
    setLight(w, c === 'ctlK' ? 20 : 45);
    const r = loopTest(w, c, { spectrum: c === 'ctlK' || c === 'ctlNaK' ? 1 : undefined });
    res.atlas[c] = r.emission;
    if (r.spectrum) res.spectra.push(r.spectrum);
  }
  cleanLoop(w);
  w = resume(w);
  // C — la misma muestra (control de Sr) en asa, vidrio virtual y refractario, con dos niveles de luz.
  setLight(w, 45);
  res.supports.push(loopTest(w, 'ctlSr').emission);
  res.supports.push(padTest(w, 'wgFlame', 'ctlSr'));
  setLight(w, 20);
  res.supports.push(padTest(w, 'cupFlame', 'ctlSr'));
  cleanLoop(w);
  cmd09(w, { type: 'setIgnition', on: false });
  w = resume(w);
  // D — alícuota de 3 mL y una reserva testigo de 1 mL.
  pipette(w, 'smp1', 'T1', 3.0);
  pipette(w, 'smp1', 'T5', 1.0);
  cmd09(w, { type: 'setLabel', vesselId: 'T1', label: w.unknown.code });
  cmd09(w, { type: 'setLabel', vesselId: 'T5', label: w.unknown.code });
  drops(w, 'dbSO4', 'T1', 14);
  mix(w, 'T1');
  run09(w, 30);
  res.observations.push(cmd09(w, { type: 'observeTube', vesselId: 'T1' }).id!);
  res.masses.push(...balanceCounter(w, 'T1', 'T4'));
  centrifuge(w, 'T1', 'T4');
  decant(w, 'T1', 'T2');
  res.observations.push(cmd09(w, { type: 'observeTube', vesselId: 'T1' }).id!);
  res.turbidity.push(turbidity(w, 'T2'));
  drops(w, 'dbOH', 'T2', 22);
  mix(w, 'T2');
  run09(w, 30);
  res.observations.push(cmd09(w, { type: 'observeTube', vesselId: 'T2' }).id!);
  res.masses.push(...balanceCounter(w, 'T2', 'T4'));
  centrifuge(w, 'T2', 'T4');
  decant(w, 'T2', 'T3');
  res.observations.push(cmd09(w, { type: 'observeTube', vesselId: 'T2' }).id!);
  res.turbidity.push(turbidity(w, 'T3'));
  w = resume(w);
  // E — confirmación del potasio en el sobrenadante final, con poca luz y vista espectral.
  hoodReady(w, 20);
  const fin = loopTest(w, 'T3', { spectrum: 1 });
  res.final = fin;
  cleanLoop(w);
  cmd09(w, { type: 'setIgnition', on: false });
  return { w, res };
}

const ANSWER = 'Respuesta argumentada con las lecturas propias del intento, sus controles y sus límites de detección.';

/** Cuadro A antes de medir. */
export function hypotheses09(w: P09World, nb: P09Notebook) {
  nb.tableA['Sr2+'] = { predictedSolid: 'sulfate', predictedColor: 'crimson', reason: 'SrSO₄ poco soluble' };
  nb.tableA['Fe3+'] = { predictedSolid: 'hydroxide', predictedColor: 'none', reason: 'Fe(OH)₃ insoluble' };
  nb.tableA['K+'] = { predictedSolid: 'none', predictedColor: 'violet', reason: 'sales de K solubles' };
  nb.tableA.savedAtS = w.timeS;
}

/** Libreta coherente con las lecturas propias. */
export function fillNotebook09(w: P09World, nb: P09Notebook, res: IdealRes09) {
  const imp = (id: string) => ({ value: String(w.readings[id].value).replace('.', ','), uncertainty: String(w.readings[id].standardUncertainty).replace('.', ','), readingId: id, attemptId: nb.attemptId || undefined });
  for (const k of ATLAS_KEYS) {
    const id = res.atlas[k];
    if (!id) continue;
    const r = w.readings[id];
    nb.tableB[k] = { readingId: id, color: (r.category ?? '') as RowB['color'], intensity: r.value > 0.6 ? 'strong' : r.value > 0.2 ? 'medium' : 'weak', lightPct: String(r.snapshot.lightPct), contamination: k === 'ctlNaK' ? 'Na enmascara el violeta del K' : '' };
  }
  nb.tableC = { loopId: res.supports[0], glassId: res.supports[1], cupId: res.supports[2], differences: 'El vidrio virtual extiende la señal; el refractario es el soporte apto.', glassRating: 'virtualOnly' };
  nb.tableD.sr = { tube: 'T1', reagent: 'sulfate', drops: '14', dropVolumeMl: '', volumeAdded: { value: (w.evidence['vol:T1:dbSO4'] ?? 0).toFixed(2).replace('.', ','), uncertainty: '0,05', readingId: null }, turbidityId: res.turbidity[0], observationId: res.observations[0], solid: 'white', nuCation: '1', nuAnion: '1' };
  nb.tableD.fe = { tube: 'T2', reagent: 'hydroxide', drops: '22', dropVolumeMl: '', volumeAdded: { value: (w.evidence['vol:T2:dbOH'] ?? 0).toFixed(2).replace('.', ','), uncertainty: '0,05', readingId: null }, turbidityId: res.turbidity[1], observationId: res.observations[2], solid: 'brown', nuCation: '1', nuAnion: '3' };
  nb.tableE.rows = [
    { tube: 'T1', counterTube: 'T4', massTube: imp(res.masses[0]), massCounter: imp(res.masses[1]), spinS: '60', decantedMl: { value: '', uncertainty: '', readingId: null }, losses: 'película en las paredes' },
    { tube: 'T2', counterTube: 'T4', massTube: imp(res.masses[2]), massCounter: imp(res.masses[3]), spinS: '60', decantedMl: { value: '', uncertainty: '', readingId: null }, losses: 'arrastre mínimo de sedimento' },
  ];
  nb.tableE.reserveTube = 'T5';
  const inf = inferable(w);
  for (const c of CATIONS) {
    const ev = c === 'K+' ? [res.final.emission!, res.final.spectrum!].filter(Boolean) : c === 'Sr2+' ? [res.observations[1], res.final.emission!] : [res.observations[3], res.turbidity[1]];
    nb.tableF[c] = { status: inf[c], evidenceIds: ev, limitation: 'Por debajo del límite de detección o con interferencia de Na la señal podría no verse.' };
  }
  nb.tableF.kCharge = '+1';
  nb.tableG = [
    { from: 'smp1', action: 'aliquot', to: 'T1' },
    { from: 'T1', action: 'sulfate', to: 'T1' },
    { from: 'T1', action: 'centrifuge', to: 'T1' },
    { from: 'T1', action: 'decant', to: 'T2' },
    { from: 'T2', action: 'hydroxide', to: 'T2' },
    { from: 'T2', action: 'decant', to: 'T3' },
    { from: 'T3', action: 'flame', to: 'T3' },
  ];
  for (const q of QUESTIONS) nb.analysis[q] = ANSWER;
  nb.explanation = ANSWER;
  nb.errorReflection = ANSWER;
}

/** Ruta ideal + libreta. */
export function idealAttempt09(seed = 9009, scenarios: P09Scenario[] = [], resume: (w: P09World) => P09World = (w) => w, start?: P09World) {
  const w0 = start ?? world09({ seed, scenarios });
  const nb = emptyP09Notebook(`p9-${seed.toString(36)}-test`);
  hypotheses09(w0, nb);
  const { w, res } = idealRoute09(w0, resume);
  fillNotebook09(w, nb, res);
  return { w, nb, res };
}
