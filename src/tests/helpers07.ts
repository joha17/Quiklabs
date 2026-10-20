/**
 * Rutas del estudiante de la Práctica 7 hechas SOLO con comandos (sin inyectar banderas de etapa): las usan las
 * pruebas de flujo, de errores, de repetición y de la demostración.
 */
import { expect } from 'vitest';
import type { P07Command } from '../simulation/bonding-world/commands';
import type { MaterialId, P07World, SurfaceHit } from '../simulation/bonding-world/types';
import { dispatchP07, runP07For, stepP07World, vesselMl } from '../simulation/bonding-world/world';
import { newPractice07World, type Practice07Options } from '../practices/practice-07';
import { emptyP07Notebook, type P07Notebook } from '../practices/practice-07/notebook';
import type { P07Scenario } from '../practices/practice-07/error-scenarios';
import { compTotal } from '../simulation/solution-properties/conservation';

export function world07(opts: Partial<Practice07Options> & { scenarios?: P07Scenario[] } = {}): P07World {
  return newPractice07World({ mode: 'PRACTICE', seed: 7007, ...opts });
}

export function cmd07(w: P07World, c: P07Command, expectOk = true) {
  const r = dispatchP07(w, c);
  if (expectOk) expect(r.ok, `${c.type}: ${r.code ?? ''}`).toBe(true);
  return r;
}

export const run07 = (w: P07World, s: number) => runP07For(w, s);
/** Último frasco usado con la espátula, por intento (semilla). */
const lastJar = new Map<number, string>();
const pose = (x = 0, y = 0, z = 0) => ({ x, y, z, rotationRad: 0 });

export function ppe(w: P07World) {
  for (const item of ['coat', 'goggles', 'shoes'] as const) cmd07(w, { type: 'setPPE', item, enabled: true });
  cmd07(w, { type: 'setGloves', gloves: 'nitrile' });
  cmd07(w, { type: 'startWork' });
}

export function hypotheses(w: P07World, nb: P07Notebook) {
  const rows: Array<[string, 'yes' | 'no', 'homogeneous' | 'twoPhases']> = [['jarNaCl', 'no', 'homogeneous'], ['spCu', 'yes', 'twoPhases'], ['jarSucrose', 'no', 'homogeneous']];
  rows.forEach(([sample, conducts, water], i) => Object.assign(nb.tableA[i], { sample, appearance: 'sólido', conducts, conductsWhy: 'predicción', water, evidence: 'detector y agua', savedAtS: w.timeS }));
}

/** Inspección y prueba del circuito del detector con su panel de control. */
export function checkInstruments(w: P07World) {
  cmd07(w, { type: 'inspect', target: 'det01' });
  cmd07(w, { type: 'inspect', target: 'cond01' });
  cmd07(w, { type: 'powerDetector', on: true });
  contacts(w, 'det01pad', 'det01pad');
  run07(w, 1.2);
  return cmd07(w, { type: 'readDetector' });
}

export const hit = (targetId: string, u = 0.5, v = 0.5, gapCm = 0, force01 = 0.5): SurfaceHit => ({ targetId, u, v, gapCm, force01 });

export function contacts(w: P07World, a: string | null, b: string | null, du = 4) {
  cmd07(w, { type: 'setElectrodeContacts', a: a ? hit(a, 0.5) : null, b: b ? hit(b, 0.5 + du) : null });
}

/** Contacto válido sobre una muestra y lectura estable del detector. */
export function measureSolid(w: P07World, specimenId: string, du = 2) {
  contacts(w, specimenId, specimenId, du);
  run07(w, 1.2);
  const r = cmd07(w, { type: 'readDetector' }, false);
  cmd07(w, { type: 'setElectrodeContacts', a: null, b: null });
  return r;
}

/** Vierte de `src` a `tgt` hasta `ml` en el destino, con una inclinación apenas sobre el umbral. */
export function pourTo(w: P07World, src: string, tgt: string, ml: number) {
  const s = w.vessels[src];
  if (s.capped) cmd07(w, { type: 'setCap', vesselId: src, capped: false });
  const target = w.vessels[tgt];
  const start = vesselMl(target);
  for (let i = 0; i < 4000 && vesselMl(target) < ml - 0.02 && vesselMl(s) > 0.02; i++) {
    const fill = Math.min(1, vesselMl(s) / s.capacityMl);
    const tilt0 = 100 - 88 * fill;
    const need = ml - vesselMl(target);
    cmd07(w, { type: 'setPour', sourceId: src, targetId: tgt, tiltDeg: tilt0 + (need > 3 ? 14 : need > 0.6 ? 6 : 2) });
    stepP07World(w);
  }
  cmd07(w, { type: 'stopPour', sourceId: src });
  return vesselMl(target) - start;
}

/** Vacía por completo un recipiente vertible en otro. */
export function pourAll(w: P07World, src: string, tgt: string) {
  for (let i = 0; i < 2000 && vesselMl(w.vessels[src]) > 0.06; i++) {
    cmd07(w, { type: 'setPour', sourceId: src, targetId: tgt, tiltDeg: 150 });
    stepP07World(w);
  }
  cmd07(w, { type: 'stopPour', sourceId: src });
}

export function place(w: P07World, id: string, support: string, z = 0) {
  cmd07(w, { type: 'setPose', id, pose: pose(w.objects[id].pose.x, w.objects[id].pose.y, z), support });
}

/** Una cucharada con la espátula de `jar` a `target`. */
export function spoon(w: P07World, jar: string, target: string, clean = true) {
  if (w.vessels[jar].capped) cmd07(w, { type: 'setCap', vesselId: jar, capped: false });
  // Buena práctica: la espátula se limpia al cambiar de sustancia (si no, L14). La memoria es del «estudiante», no del mundo.
  const last = lastJar.get(w.seed);
  if (clean && last !== undefined && last !== jar) cmd07(w, { type: 'cleanTool', toolId: 'spatula' });
  lastJar.set(w.seed, jar);
  place(w, 'spatula', jar, 2);
  cmd07(w, { type: 'scoop', sourceId: jar });
  place(w, 'spatula', target, 5);
  cmd07(w, { type: 'dropSpatula', targetId: target });
  place(w, 'spatula', 'bench', 0.4);
}

/** Gotero: aspira `ml` de `src` y los entrega en `tgt`. */
export function dropperTransfer(w: P07World, dp: string, src: string, tgt: string, ml: number, read = false) {
  if (w.vessels[src].capped) cmd07(w, { type: 'setCap', vesselId: src, capped: false });
  const zBase = w.objects[src].pose.z;
  place(w, dp, src, zBase + w.vessels[src].floorCm + 0.3);
  cmd07(w, { type: 'setDropper', dropperId: dp, squeeze01: -1 });
  const d = w.droppers[dp];
  for (let i = 0; i < 400 && liquidContent(d.content) < ml; i++) stepP07World(w);
  cmd07(w, { type: 'setDropper', dropperId: dp, squeeze01: 0 });
  const r = read ? cmd07(w, { type: 'readVolume', vesselId: dp, eyeDzCm: 0 }) : null;
  place(w, dp, tgt, w.objects[tgt].pose.z + 3);
  cmd07(w, { type: 'setDropper', dropperId: dp, squeeze01: 1 });
  run07(w, ml / 1 + 0.6);
  cmd07(w, { type: 'setDropper', dropperId: dp, squeeze01: 0 });
  place(w, dp, 'bench', 0.6);
  return r;
}

function liquidContent(c: Partial<Record<MaterialId, number>>) {
  let ml = 0;
  for (const [k, g] of Object.entries(c)) ml += (g ?? 0) / (k === 'heptane' ? 0.684 : k === 'water' ? 0.997 : 1);
  return ml;
}

/** Agita con la varilla durante `s` segundos. */
export function stir(w: P07World, vessel: string, s = 8, motion = 0.6) {
  place(w, 'sr1', vessel, 2);
  cmd07(w, { type: 'setStir', vesselId: vessel, motion01: motion });
  run07(w, s);
  cmd07(w, { type: 'setStir', vesselId: vessel, motion01: 0 });
  place(w, 'sr1', 'bench', 0.4);
}

/** Par de tubos de una muestra sólida: 5 mL de agua (probeta leída) y 5 mL de heptano (gotero leído). */
export function solidPair(w: P07World, jar: string, tA: string, tB: string) {
  pourTo(w, 'btWater', 'cyl10', 5);
  cmd07(w, { type: 'readVolume', vesselId: 'cyl10', eyeDzCm: 0 });
  pourAll(w, 'cyl10', tA);
  dropperTransfer(w, 'dp2', 'btHeptane', tB, 5, true);
  spoon(w, jar, tA);
  spoon(w, jar, tB);
  stir(w, tA);
  stir(w, tB);
  run07(w, 3);
  const oa = cmd07(w, { type: 'observe', vesselId: tA });
  const ob = cmd07(w, { type: 'observe', vesselId: tB });
  return { oa: oa.id!, ob: ob.id! };
}

export function meterReady(w: P07World) {
  cmd07(w, { type: 'powerMeter', on: true });
  cmd07(w, { type: 'setStandard', value: 1413 });
  cmd07(w, { type: 'setCap', vesselId: 'std1413', capped: false });
  cmd07(w, { type: 'setProbeDepth', vesselId: 'std1413', immersionCm: 2.5, bottomContact: false });
  run07(w, 6);
  cmd07(w, { type: 'calibrateConductivity', standardId: 'std1413' });
  cmd07(w, { type: 'setProbeDepth', vesselId: null, immersionCm: 0, bottomContact: false });
  cmd07(w, { type: 'rinseProbe', wasteId: 'wasteAq' });
}

/** Sumerge la sonda, espera estabilidad, lee, la saca y la enjuaga. */
export function readKappa(w: P07World, vessel: string, range: 'LOW' | 'MID' | 'HIGH' = 'MID', immersion = 1.8) {
  cmd07(w, { type: 'setMeterRange', range });
  cmd07(w, { type: 'setProbeDepth', vesselId: vessel, immersionCm: immersion, bottomContact: false });
  run07(w, 6);
  const r = cmd07(w, { type: 'readConductivity' }, false);
  cmd07(w, { type: 'setProbeDepth', vesselId: null, immersionCm: 0, bottomContact: false });
  cmd07(w, { type: 'rinseProbe', wasteId: 'wasteAq' });
  return r;
}

/** Pesa sólido en un vidrio de reloj tarado hasta superar `g`. Devuelve el id de la lectura. */
export function weighOut(w: P07World, glass: string, jar: string, g: number) {
  if (!w.balance.powered) cmd07(w, { type: 'powerBalance', on: true });
  place(w, glass, 'pan', 8.4);
  run07(w, 2);
  cmd07(w, { type: 'tare' });
  run07(w, 2);
  for (let i = 0; i < 40 && compTotal(w.vessels[glass].solid) < g; i++) spoon(w, jar, glass);
  run07(w, 2.5);
  const r = cmd07(w, { type: 'readBalance' });
  place(w, glass, 'bench', 0);
  return r.id!;
}

/** Enrasa un matraz con el agua de referencia y la piseta hasta el aforo. */
export function fillToMark(w: P07World, flask: string) {
  // Con la piseta: chorro hasta cerca del aforo y gotas al final.
  for (let i = 0; i < 400 && vesselMl(w.vessels[flask]) < 99.95; i++) {
    const left = 100 - vesselMl(w.vessels[flask]);
    cmd07(w, { type: 'squeezeWash', targetId: flask, ml: left > 2 ? 2 : Math.min(0.05, left) });
  }
  return cmd07(w, { type: 'readVolume', vesselId: flask, eyeDzCm: 0 });
}

export { emptyP07Notebook };

// ─────────────────────────── Ruta ideal completa (A → F) ───────────────────────────

const fmt = (v: number, d: number) => v.toFixed(d).replace('.', ',');

/** Prueba de una incógnita con dos grupos independientes: conducción (pieza o líquido puro) y mezcla con agua. */
function studyUnknown(w: P07World, k: 'X' | 'Y', tube: string, beaker: string) {
  const u = w.unknowns[k];
  const out: { contact?: string; mixing?: string; solution?: string } = {};
  if (u.specimenId) out.contact = measureSolid(w, u.specimenId, 1).id;
  pourTo(w, 'btWater', 'cyl10', 5);
  pourAll(w, 'cyl10', tube);
  if (w.vessels[u.jarId].shape === 'jar') spoon(w, u.jarId, tube);
  else dropperTransfer(w, 'dp1', u.jarId, tube, 1);
  cmd07(w, { type: 'cleanTool', toolId: 'dp1' });
  stir(w, tube, 15);
  run07(w, 7);
  out.mixing = cmd07(w, { type: 'observe', vesselId: tube }).id;
  if (!u.specimenId) {
    pourTo(w, u.jarId, beaker, 30);
    const r = readKappa(w, beaker, 'LOW');
    if (r.ok) out.contact = r.id;
    else out.solution = readKappa(w, beaker, 'MID').id;
  }
  return out;
}

export function idealRoute07(seed = 7007, scenarios: P07Scenario[] = []) {
  return runIdealRoute07(world07({ seed, scenarios }), emptyP07Notebook());
}

/** La ruta ideal sobre un mundo dado; `resume` simula guardar y reanudar (en A, C y D) y devuelve el mundo nuevo. */
export function runIdealRoute07(w0: P07World, nb: P07Notebook, resume: (w: P07World) => P07World = (x) => x) {
  let w = w0;
  ppe(w);
  hypotheses(w, nb);
  w = resume(w);
  const control = checkInstruments(w).id!;
  // B — dos muestras en ambos disolventes.
  const p1 = solidPair(w, 'jarNaCl', 'tube1', 'tube2');
  const p2 = solidPair(w, 'jarSucrose', 'tube3', 'tube4');
  // C — metal, grafito en sus dos orientaciones y sal seca.
  const cu = measureSolid(w, 'spCu', 3).id!;
  w = resume(w);
  const gr = measureSolid(w, 'spGraphite', 2).id!;
  cmd07(w, { type: 'rotateSpecimen', specimenId: 'spGraphite' });
  measureSolid(w, 'spGraphite', 0.3);
  const salt = measureSolid(w, 'spNaCl', 1).id!;
  // D — calibración, blanco, NaCl en dos concentraciones, sacarosa y ácido acético.
  meterReady(w);
  pourTo(w, 'btWater', 'bk1', 30);
  const blank = readKappa(w, 'bk1', 'LOW').id!;
  const mA = weighOut(w, 'wg1', 'jarNaCl', 0.55);
  cmd07(w, { type: 'dispose', vesselId: 'wg1', wasteId: 'fl1' });
  cmd07(w, { type: 'squeezeWash', targetId: 'wg1', ml: 2 });
  cmd07(w, { type: 'dispose', vesselId: 'wg1', wasteId: 'fl1' });
  const vA = fillToMark(w, 'fl1').id!;
  stir(w, 'fl1', 12);
  pourTo(w, 'fl1', 'bk2', 30);
  const kA = readKappa(w, 'bk2', 'HIGH').id!;
  w = resume(w);
  dropperTransfer(w, 'dp1', 'fl1', 'fl2', 5);
  dropperTransfer(w, 'dp1', 'fl1', 'fl2', 5);
  cmd07(w, { type: 'cleanTool', toolId: 'dp1' });
  const vB = fillToMark(w, 'fl2').id!;
  stir(w, 'fl2', 12);
  pourTo(w, 'fl2', 'bk3', 30);
  const kB = readKappa(w, 'bk3', 'MID').id!;
  const mS = weighOut(w, 'wg2', 'jarSucrose', 1.0);
  cmd07(w, { type: 'dispose', vesselId: 'wg2', wasteId: 'bk4' });
  pourTo(w, 'btWater', 'bk4', 30);
  stir(w, 'bk4', 25);
  const kS = readKappa(w, 'bk4', 'LOW').id!;
  pourTo(w, 'btAcetic', 'bk5', 30);
  const kW = readKappa(w, 'bk5', 'MID').id!;
  // E — incógnitas.
  const ux = studyUnknown(w, 'X', 'tube9', 'bk6');
  const uy = studyUnknown(w, 'Y', 'tube10', 'bk7');
  // ── Libreta ──
  const B = nb.tableB;
  const rowB = (k: keyof typeof B, tubeId: string, sample: string, solvent: 'water' | 'heptane', obs: string, interp: (typeof B)['M1A']['interpretation']) =>
    Object.assign(B[k], { tubeId, sample, solvent, observationId: obs, observationText: 'observado', interpretation: interp, volume: { value: '5,0', uncertainty: '0,1', readingId: null } });
  rowB('M1A', 'tube1', 'NaCl', 'water', p1.oa, 'soluble');
  rowB('M1B', 'tube2', 'NaCl', 'heptane', p1.ob, interpOf(w, p1.ob));
  rowB('M2A', 'tube3', 'sucrose', 'water', p2.oa, interpOf(w, p2.oa));
  rowB('M2B', 'tube4', 'sucrose', 'heptane', p2.ob, interpOf(w, p2.ob));
  B.M1A.interpretation = interpOf(w, p1.oa);
  Object.assign(nb.tableC.control, { specimen: 'det01pad', readingId: control, conducts: 'yes', surface: 'dry', explanation: 'control del circuito' });
  Object.assign(nb.tableC.metal, { specimen: 'spCu', readingId: cu, conducts: 'yes', surface: 'dry', explanation: 'electrones deslocalizados' });
  Object.assign(nb.tableC.graphite, { specimen: 'spGraphite', readingId: gr, conducts: 'yes', surface: 'dry', explanation: 'red covalente con electrones móviles en las capas' });
  Object.assign(nb.tableC.ionic, { specimen: 'spNaCl', readingId: salt, conducts: 'no', surface: 'dry', explanation: 'iones fijos en la red' });
  const val = (id: string) => w.readings[id].value;
  const D = nb.tableD;
  const concA = val(mA) / 58.44 / (val(vA) / 1000);
  Object.assign(D.blank, { sample: 'blank', kappa: { value: fmt(val(blank), 1), uncertainty: '', readingId: blank }, kappaUnit: 'µS/cm', temp: fmt(w.readings[blank].snapshot.tempC ?? 25, 1) });
  Object.assign(D.strongA, { sample: 'NaCl', mass: { value: fmt(val(mA), 2), uncertainty: '0,01', readingId: mA }, volume: { value: fmt(val(vA), 1), uncertainty: '0,1', readingId: vA }, conc: { value: fmt(concA, 4), uncertainty: '0,002', readingId: null }, kappa: { value: fmt(val(kA), 2), uncertainty: '', readingId: kA }, kappaUnit: 'mS/cm', temp: '25,0' });
  Object.assign(D.strongB, { sample: 'NaCl', mass: { value: fmt(val(mA) / 10, 3), uncertainty: '0,001', readingId: null }, volume: { value: fmt(val(vB), 1), uncertainty: '0,1', readingId: vB }, conc: { value: fmt((val(mA) / 10) / 58.44 / (val(vB) / 1000), 5), uncertainty: '0,0002', readingId: null }, kappa: { value: fmt(val(kB), 0), uncertainty: '', readingId: kB }, kappaUnit: 'µS/cm', temp: '25,0' });
  Object.assign(D.nonElectrolyte, { sample: 'sucrose', mass: { value: fmt(val(mS), 2), uncertainty: '0,01', readingId: mS }, volume: { value: '30', uncertainty: '5', readingId: null }, conc: { value: fmt(val(mS) / 342.3 / 0.03, 3), uncertainty: '0,01', readingId: null }, kappa: { value: fmt(val(kS), 1), uncertainty: '', readingId: kS }, kappaUnit: 'µS/cm', temp: '25,0' });
  Object.assign(D.weak, { sample: 'acetic', conc: { value: '0,10', uncertainty: '0,01', readingId: null }, kappa: { value: fmt(val(kW), 0), uncertainty: '', readingId: kW }, kappaUnit: 'µS/cm', temp: '25,0' });
  for (const [k, u] of [['X', ux], ['Y', uy]] as const) {
    const truth = w.unknowns[k].material;
    const cls = ['NaCl', 'KCl'].includes(truth) ? 'ionic' : 'molecular';
    Object.assign(nb.tableE[k], {
      test1: w.unknowns[k].specimenId ? 'solidContact' : 'pureKappa', reason1: 'conducción del material', result1: u.contact ?? u.solution ?? null,
      test2: 'mixWater', reason2: 'comportamiento en agua', result2: u.mixing ?? null, classification: cls, limitation: 'faltaría una prueba en disolvente apolar para confirmar',
    });
  }
  for (const k of Object.keys(nb.tableF) as Array<keyof typeof nb.tableF>) Object.assign(nb.tableF[k], { explanation: 'explicación basada en mis lecturas y en la movilidad de portadores', exception: 'yes', confidence: 'medium', why: 'una sola serie de medidas' });
  for (const q of Object.keys(nb.analysis) as Array<keyof typeof nb.analysis>) nb.analysis[q] = 'Respuesta basada en mis propias lecturas, con sus limitaciones y una causa instrumental posible.';
  nb.conclusion = 'El enlace se infiere con varias pruebas; una sola propiedad no basta y hay límites en la inferencia.';
  return { w, nb };
}

function interpOf(w: P07World, obsId: string): 'soluble' | 'partial' | 'insoluble' | 'miscible' | 'immiscible' {
  const o = w.readings[obsId];
  if ((o.snapshot.phases ?? 0) >= 2) return 'immiscible';
  if ((o.snapshot.undissolvedG ?? 0) > 0.002) return (o.snapshot.undissolvedG ?? 0) > 0.1 ? 'insoluble' : 'partial';
  return 'soluble';
}
