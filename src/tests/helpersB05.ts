/**
 * Ruta del estudiante de la práctica B05 hecha SOLO con comandos: EPP, preparaciones P1–P3 con balanza, probeta,
 * espátula, pastilla y placa; catalasa con colector y cronómetro (línea base, blanco, calor y pH); amilasa en el baño
 * con alícuotas a 0/120/300/600 s reveladas con Lugol y Benedict; montaje de papa con Lugol al microscopio y cierre.
 */
import { expect } from 'vitest';
import type { EnzCommand } from '../simulation/enz-world/commands';
import type { EnzWorld } from '../simulation/enz-world/types';
import { dispatchEnz, runEnzFor, vesselOf, wasteClassOf } from '../simulation/enz-world/world';

const WASTE_OF = { aq: 'wAq', cu: 'wCu', bio: 'wBio' } as const;
import { newPracticeB05World, type PracticeB05Options } from '../practices/practice-b05';
import type { B05Scenario } from '../practices/practice-b05/error-scenarios';
import { emptyB05Notebook, QUESTIONS_B05, type B05Notebook } from '../practices/practice-b05/notebook';
import { captureLosses, glucosylExpected, rateExpected } from '../practices/practice-b05/expected-results';
import { b05StageEvidence } from '../practices/practice-b05/evidence';
import { microscopeView } from '../simulation/optical-world/world';
import { CLEAN_TRAY, PREP_SPOT, STAGE_SEAT, stageTopZCm } from '../simulation/optical-world/geometry';

export function worldB05(opts: Partial<PracticeB05Options> & { scenarios?: B05Scenario[] } = {}): EnzWorld {
  return newPracticeB05World({ mode: 'PRACTICE', seed: 5505, ...opts });
}

export function cmdE(w: EnzWorld, c: EnzCommand, expectOk = true) {
  const r = dispatchEnz(w, c);
  if (expectOk) expect(r.ok, `${c.type}: ${r.code ?? ''}`).toBe(true);
  return r;
}

export const runE = (w: EnzWorld, s: number) => runEnzFor(w, s);
const P = (x: number, y: number, z = 0) => ({ x, y, z, rotationRad: 0 });

export function placeE(w: EnzWorld, id: string, support: string, at?: { x: number; y: number; z?: number }, expectOk = true) {
  const o = w.objects[id];
  return cmdE(w, { type: 'setPose', id, pose: P(at?.x ?? o.pose.x, at?.y ?? o.pose.y, at?.z ?? 0), support }, expectOk);
}

export function ppeB05(w: EnzWorld) {
  for (const item of ['coat', 'shoes', 'hair', 'hands', 'gloves'] as const) cmdE(w, { type: 'setPPE', item, enabled: true });
  cmdE(w, { type: 'startWork' });
  for (const t of ['glassBin', 'bioWaste', 'wAq', 'wCu', 'wBio']) cmdE(w, { type: 'inspect', target: t });
}

/** Vierte inclinando el recipiente hasta que el destino reciba `ml` (o el origen se vacíe). */
export function pourTo(w: EnzWorld, sourceId: string, targetId: string, ml: number, tiltDeg = 50) {
  const target = vesselOf(w, targetId)!;
  const goal = target.volumeMl + ml;
  cmdE(w, { type: 'startPour', sourceId, targetId, tiltDeg });
  for (let i = 0; i < 20000 && target.volumeMl < goal - 1e-3 && w.enz.pours[sourceId]; i++) {
    // Cerca del objetivo se inclina menos (caudal fino), como haría la mano.
    const left = goal - target.volumeMl;
    if (left < 2 && w.enz.pours[sourceId].tiltDeg > 40) cmdE(w, { type: 'startPour', sourceId, targetId, tiltDeg: 40 });
    runE(w, w.params.dtS);
  }
  if (w.enz.pours[sourceId]) cmdE(w, { type: 'stopPour', sourceId });
}

export function emptyInto(w: EnzWorld, sourceId: string, targetId: string) {
  cmdE(w, { type: 'startPour', sourceId, targetId, tiltDeg: 110 });
  for (let i = 0; i < 4000 && w.enz.pours[sourceId]; i++) runE(w, w.params.dtS);
}

/** Pipetea `ml` de un recipiente a otro y enjuaga la pipeta. */
export function pipette(w: EnzWorld, toolId: string, from: string, to: string, ml: number, rinse = true) {
  cmdE(w, { type: 'aspirate', toolId, sourceId: from, volumeMl: ml });
  cmdE(w, { type: 'dispense', toolId, targetId: to });
  if (rinse) cmdE(w, { type: 'rinseTool', toolId });
}

/** Mide agua con probeta (lectura a la altura del menisco) y la vacía en el beaker. */
export function measureWater(w: EnzWorld, cylinderId: string, ml: number, beakerId: string) {
  pourTo(w, 'bW', cylinderId, ml);
  cmdE(w, { type: 'readInstrument', instrument: 'scale', targetId: cylinderId, eyeDeg: 0 });
  emptyInto(w, cylinderId, beakerId);
}

/** Bote sobre la balanza, tara, polvo con la espátula, lectura y trasvase al beaker. */
export function weighPowder(w: EnzWorld, jarId: string, g: number, beakerId: string) {
  if (w.objects.wb.support !== 'bal') placeE(w, 'wb', 'bal');
  cmdE(w, { type: 'tare', balanceId: 'bal' });
  // La espátula carga hasta 15 g por vez; lo que queda adherido (1 %) y en el bote (0,5 %) se compensa al cargar.
  let left = g / 0.99 / 0.995;
  while (left > 1e-6) {
    const take = Math.min(15, left);
    cmdE(w, { type: 'scoop', toolId: 'sp2', sourceId: jarId, massG: take });
    cmdE(w, { type: 'transferSolid', fromId: 'sp2', toId: 'wb' });
    left -= take;
  }
  cmdE(w, { type: 'readInstrument', instrument: 'balance', targetId: 'bal' });
  cmdE(w, { type: 'transferSolid', fromId: 'wb', toId: beakerId });
  cmdE(w, { type: 'rinseTool', toolId: 'sp2' });
  cmdE(w, { type: 'rinseTool', toolId: 'wb' });
}

/** Beaker sobre la placa con pastilla y agitación (y calor si se pide), con la lectura del termómetro. */
export function stirOn(w: EnzWorld, beakerId: string, plateId: string, barId: string, rpm: number, heatK?: number) {
  placeE(w, beakerId, plateId);
  cmdE(w, { type: 'insertStirBar', barId, vesselId: beakerId });
  cmdE(w, { type: 'setStir', plateId, rpm });
  if (heatK) cmdE(w, { type: 'setHeat', plateId, on: true, setpointK: heatK });
}

/** P2: 25,0 mL de agua a temperatura ambiente, 1,0 g de hígado troceado y agitación sin calor. */
export function prepP2(w: EnzWorld, opts: { liverG?: number; strokes?: number; stirS?: number; source?: string } = {}) {
  measureWater(w, 'g25', 25, 'bk3');
  cmdE(w, { type: 'cutTissue', sourceId: opts.source ?? 'liv', toolId: 'ls', massG: opts.liverG ?? 1 });
  cmdE(w, { type: 'mince', toolId: 'ls', strokes: opts.strokes ?? 6 });
  placeE(w, 'wb', 'bal');
  cmdE(w, { type: 'tare', balanceId: 'bal' });
  cmdE(w, { type: 'transferSolid', fromId: 'bdL', toId: 'wb' });
  cmdE(w, { type: 'readInstrument', instrument: 'balance', targetId: 'bal' });
  cmdE(w, { type: 'transferSolid', fromId: 'wb', toId: 'bk3' });
  stirOn(w, 'bk3', 'hp2', 'sb2', 400);
  runE(w, opts.stirS ?? 240);
}

/** P1: 100,0 mL de agua, 25,0 g de almidón, pastilla, agitación y placa a ~30 °C con lectura del líquido. */
export function prepP1(w: EnzWorld, opts: { stirS?: number } = {}) {
  measureWater(w, 'g100', 100, 'bk1');
  weighPowder(w, 'jS', 25, 'bk1');
  stirOn(w, 'bk1', 'hp1', 'sb1', 500, 305.15);
  runE(w, opts.stirS ?? 300);
  cmdE(w, { type: 'readInstrument', instrument: 'thermo', targetId: 'bk1' });
}

/** P3: 5,0 mL de agua y 0,20 g de amilasa con pastilla y agitación, sin calor. */
export function prepP3(w: EnzWorld, opts: { plateId?: string; barId?: string; stirS?: number } = {}) {
  measureWater(w, 'g10', 5, 'bk2');
  weighPowder(w, 'jA', 0.2, 'bk2');
  stirOn(w, 'bk2', opts.plateId ?? 'hp2', opts.barId ?? 'sb2', 300);
  runE(w, opts.stirS ?? 120);
}

/** Lee el colector cada `every` s durante `total` s: devuelve [s del cronómetro, mL]. */
export function gasSeries(w: EnzWorld, total = 90, every = 15): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let t = 0; t <= total + 1e-9; t += every) {
    if (t > 0) runE(w, every);
    const r = cmdE(w, { type: 'readInstrument', instrument: 'collector', targetId: 'gc', eyeDeg: 0 });
    const rd = w.enz.readings[r.id!];
    out.push([rd.clockS ?? 0, rd.value]);
  }
  return out;
}

/** Tubo de catalasa: extracto de P2 + rótulo, colector, cronómetro y peróxido (10,00 mL con la pipeta de 10). */
export function catalaseTube(w: EnzWorld, tubeId: string, label: string, opts: { extractMl?: number; noExtract?: boolean; before?: () => void } = {}) {
  cmdE(w, { type: 'labelTube', tubeId, label });
  if (!opts.noExtract) pipette(w, 'p5', 'bk3', tubeId, opts.extractMl ?? 2);
  else pipette(w, 'p5', 'bW', tubeId, opts.extractMl ?? 2);
  opts.before?.();
  cmdE(w, { type: 'resetCollector' });
  cmdE(w, { type: 'setCollector', tubeId, seal01: 1 });
  cmdE(w, { type: 'clock', clockId: 'sw1', action: 'reset' });
  cmdE(w, { type: 'clock', clockId: 'sw1', action: 'start' });
  pipette(w, 'p10', 'hp', tubeId, 10);
}

// ─────────────────────────── Microscopio (revólver de cuatro objetivos, como B02/B03) ───────────────────────────

const seat = () => ({ x: STAGE_SEAT.x, y: STAGE_SEAT.y, z: stageTopZCm(6) });

export function toStageE(w: EnzWorld, id: string) {
  if (!w.microscope.clipOpen) cmdE(w, { type: 'openClip', open: true });
  placeE(w, id, 'stage', seat());
  cmdE(w, { type: 'openClip', open: false });
}

export function toObjectiveE(w: EnzWorld, x: 4 | 10 | 40 | 100) {
  const target = { 4: 0, 10: 90, 40: 180, 100: 270 }[x];
  if (w.microscope.turretDeg !== target) cmdE(w, { type: 'turnTurret', deltaDeg: target - w.microscope.turretDeg });
}

export function focusE(w: EnzWorld) {
  const obj = microscopeView(w).objectiveX ?? 4;
  if (obj === 4) {
    cmdE(w, { type: 'checkSide' });
    for (let i = 0; i < 80 && microscopeView(w).sharpness01 < 0.25; i++) cmdE(w, { type: 'turnCoarse', deltaTurns: 0.1 });
  }
  let best = microscopeView(w).sharpness01;
  for (const dir of [1, -1]) {
    for (let i = 0; i < 40; i++) {
      cmdE(w, { type: 'turnFine', deltaTurns: dir * 0.05 });
      const s = microscopeView(w).sharpness01;
      if (s + 1e-9 < best) {
        cmdE(w, { type: 'turnFine', deltaTurns: -dir * 0.05 });
        break;
      }
      best = s;
    }
  }
}

export function captureE(w: EnzWorld, expectOk = true) {
  if (w.view.instrument !== 'compound') cmdE(w, { type: 'observe', instrument: 'compound', open: true });
  runE(w, 1.6);
  return cmdE(w, { type: 'captureObservation', instrument: 'compound' }, expectOk).id!;
}

export function observeSlideE(w: EnzWorld, slideId: string) {
  const out: Record<number, string> = {};
  cmdE(w, { type: 'setPower', device: 'microscope', on: true });
  if (w.microscope.light01 < 0.2) cmdE(w, { type: 'setIllumination', device: 'microscope', value01: 0.4 });
  toObjectiveE(w, 4);
  toStageE(w, slideId);
  focusE(w);
  for (const x of [4, 10, 40] as const) {
    if (x !== 4) {
      toObjectiveE(w, x);
      focusE(w);
    }
    cmdE(w, { type: 'setDiaphragm', value01: x === 40 ? 0.6 : 0.5 });
    out[x] = captureE(w);
  }
  cmdE(w, { type: 'setDiaphragm', value01: 0.5 });
  if (w.view.instrument) cmdE(w, { type: 'observe', instrument: 'compound', open: false });
  toObjectiveE(w, 4);
  cmdE(w, { type: 'turnCoarse', deltaTurns: -w.microscope.coarseTurns });
  cmdE(w, { type: 'turnFine', deltaTurns: -w.microscope.fineTurns });
  cmdE(w, { type: 'openClip', open: true });
  placeE(w, slideId, 'cleanTray', CLEAN_TRAY);
  return out;
}

/** Papa raspada con Lugol y cubreobjetos inclinado y lento (como B02); espera el contacto del yodo. */
export function potatoMountE(w: EnzWorld, slideId: string, coverId: string) {
  placeE(w, slideId, 'prep', PREP_SPOT);
  cmdE(w, { type: 'scrape', sourceId: 'pot', toolId: 'sp', distanceCm: 1.2, pressure01: 0.4 });
  cmdE(w, { type: 'placeSpecimen', toolId: 'sp', targetId: slideId, dxCm: 0, dyCm: 0 });
  cmdE(w, { type: 'wipe', targetId: 'sp', toolId: 'lp' });
  cmdE(w, { type: 'squeezeDropper', dispenserId: 'iod', targetId: slideId, force01: 0.5, dxCm: 0, dyCm: 0 });
  cmdE(w, { type: 'grabCover', coverId, toolId: 'fc' });
  cmdE(w, { type: 'setCoverTilt', coverId, angleDeg: 45 });
  cmdE(w, { type: 'lowerCover', coverId, slideId, speedCmS: 0.4, dxCm: 0, dyCm: 0 });
  runE(w, 25);
}

/** Tubo de pH: extracto, gotas asignadas de HCl (o NaOH), mezcla y tira nueva antes del colector y el peróxido. */
export function phTube(w: EnzWorld, tubeId: string, label: 'cat-acid' | 'cat-base-ph') {
  catalaseTube(w, tubeId, label, {
    before: () => {
      const d = label === 'cat-acid' ? 'dH' : 'dN';
      for (let i = 0; i < w.params.enz!.acidDropsAssigned; i++) cmdE(w, { type: 'squeezeDropper', dispenserId: d, targetId: tubeId, force01: 0.5, dxCm: 0, dyCm: 0 });
      cmdE(w, { type: 'shake', targetId: tubeId, strength01: 0.5 });
      runE(w, 5);
      cmdE(w, { type: 'dipStrip', targetId: tubeId });
    },
  });
}

/** Lugol (3 gotas) en un tubo y lectura de color. */
export function lugolRead(w: EnzWorld, tubeId: string) {
  for (let k = 0; k < 3; k++) cmdE(w, { type: 'squeezeDropper', dispenserId: 'dL', targetId: tubeId, force01: 0.5, dxCm: 0, dyCm: 0 });
  return cmdE(w, { type: 'readInstrument', instrument: 'eye', targetId: tubeId }).id!;
}

export interface IdealResB05 {
  prep: B05Notebook['prep'];
  gas: Record<string, string[]>;
  cond: { mass: string; temp: string; ph: string; clock: string };
  amy: Record<string, string>;
  potato: string;
}

/** Ruta ideal completa (§10) solo con comandos; `resume` simula guardar y reanudar entre estaciones. */
export function idealRouteB05(w0: EnzWorld, resume: (w: EnzWorld) => EnzWorld = (w) => w) {
  let w = w0;
  const res: IdealResB05 = { prep: emptyB05Notebook().prep, gas: {}, cond: { mass: '', temp: '', ph: '', clock: '' }, amy: {}, potato: '' };
  const last = (inst: string) => [...w.enz.readingOrder].reverse().find((id) => w.enz.readings[id].instrument === inst)!;
  ppeB05(w);
  cmdE(w, { type: 'setBath', bathId: 'wb1', on: true });
  cmdE(w, { type: 'setBath', bathId: 'wb2', on: true });
  // P1 y P3 primero (P3 en la placa 2, que luego queda para el extracto de hígado agitándose durante la catalasa).
  prepP1(w);
  res.prep.p1Water = w.enz.readingOrder.find((id) => w.enz.readings[id].targetId === 'g100')!;
  res.prep.p1Mass = w.enz.readingOrder.find((id) => w.enz.readings[id].instrument === 'balance')!;
  res.prep.p1Temp = last('thermo');
  prepP3(w);
  res.prep.p3Water = w.enz.readingOrder.find((id) => w.enz.readings[id].targetId === 'g10')!;
  res.prep.p3Mass = last('balance');
  cmdE(w, { type: 'setStir', plateId: 'hp2', rpm: 0 });
  cmdE(w, { type: 'removeStirBar', barId: 'sb2' });
  placeE(w, 'bk2', 'bench', { x: 384, y: 60 });
  w = resume(w);
  prepP2(w);
  res.prep.p2Water = w.enz.readingOrder.find((id) => w.enz.readings[id].targetId === 'g25')!;
  res.cond.mass = last('balance');
  res.cond.temp = cmdE(w, { type: 'readInstrument', instrument: 'thermo', targetId: 'bk3' }).id!;
  res.prep.p2Temp = res.cond.temp;
  w = resume(w);
  // Catalasa: línea base (7 lecturas cada 15 s), blanco, calor y pH.
  catalaseTube(w, 't1', 'cat-base');
  gasSeries(w, 90, 15);
  res.gas['cat-base'] = w.enz.readingOrder.filter((id) => w.enz.readings[id].targetId === 'gc:t1');
  res.cond.clock = cmdE(w, { type: 'readInstrument', instrument: 'clock', targetId: 'sw1' }).id!;
  cmdE(w, { type: 'clock', clockId: 'sw1', action: 'stop' });
  catalaseTube(w, 't2', 'cat-blank', { noExtract: true });
  gasSeries(w, 60, 20);
  res.gas['cat-blank'] = w.enz.readingOrder.filter((id) => w.enz.readings[id].targetId === 'gc:t2');
  cmdE(w, { type: 'clock', clockId: 'sw1', action: 'stop' });
  w = resume(w);
  catalaseTube(w, 't3', 'cat-heat', {
    before: () => {
      cmdE(w, { type: 'tongs', tubeId: 't3', to: 'wb2', depth01: 1 });
      runE(w, 300);
      cmdE(w, { type: 'tongs', tubeId: 't3', to: 'rack' });
      for (let i = 0; i < 200 && w.enz.vessels.t3.tK > 302; i++) runE(w, 5);
    },
  });
  gasSeries(w, 60, 20);
  res.gas['cat-heat'] = w.enz.readingOrder.filter((id) => w.enz.readings[id].targetId === 'gc:t3');
  cmdE(w, { type: 'clock', clockId: 'sw1', action: 'stop' });
  phTube(w, 't4', 'cat-acid');
  res.cond.ph = last('ph');
  gasSeries(w, 60, 20);
  res.gas['cat-acid'] = w.enz.readingOrder.filter((id) => w.enz.readings[id].targetId === 'gc:t4');
  cmdE(w, { type: 'clock', clockId: 'sw1', action: 'stop' });
  cmdE(w, { type: 'setCollector', tubeId: null });
  w = resume(w);
  // Amilasa a 37 °C con control y alícuotas a 0/120/300/600 s (Lugol) y 0/600 s (Benedict).
  cmdE(w, { type: 'labelTube', tubeId: 't9', label: 'amy' });
  cmdE(w, { type: 'labelTube', tubeId: 't10', label: 'amy-ctrl' });
  pipette(w, 'p1', 'bk1', 't9', 1);
  pipette(w, 'p5', 'bW', 't9', 3);
  pipette(w, 'p1', 'bk1', 't10', 1);
  pipette(w, 'p5', 'bW', 't10', 4);
  cmdE(w, { type: 'tongs', tubeId: 't9', to: 'wb1' });
  cmdE(w, { type: 'tongs', tubeId: 't10', to: 'wb1' });
  runE(w, 60);
  cmdE(w, { type: 'clock', clockId: 'sw2', action: 'reset' });
  cmdE(w, { type: 'clock', clockId: 'sw2', action: 'start' });
  pipette(w, 'p1', 'bk2', 't9', 1);
  cmdE(w, { type: 'shake', targetId: 't9', strength01: 0.5 });
  const L = ['t11', 't12', 't13', 't14'];
  const times = [0, 120, 300, 600];
  let t0 = 0;
  for (let i = 0; i < 4; i++) {
    runE(w, times[i] - t0 + 2);
    t0 = times[i] + 2;
    cmdE(w, { type: 'shake', targetId: 't9', strength01: 0.5 });
    cmdE(w, { type: 'labelTube', tubeId: L[i], label: `L${i}` });
    pipette(w, 'p1', 't9', L[i], 0.5);
    res.amy[`L${i}`] = lugolRead(w, L[i]);
    if (i === 0 || i === 3) {
      const b = i === 0 ? 't15' : 't16';
      cmdE(w, { type: 'labelTube', tubeId: b, label: i === 0 ? 'B0' : 'B3' });
      pipette(w, 'p1', 't9', b, 0.5);
      cmdE(w, { type: 'squeezeDropper', dispenserId: 'dB', targetId: b, force01: 0.5, dxCm: 0, dyCm: 0 });
      cmdE(w, { type: 'tongs', tubeId: b, to: 'wb2' });
    }
    // B0 ya lleva ~2 min en el baño hirviente: 80 s más (≈3,5 min en total), afuera con la pinza y a leer.
    if (i === 1) {
      runE(w, 80);
      t0 += 80;
      cmdE(w, { type: 'tongs', tubeId: 't15', to: 'rack' });
      res.amy.B0 = cmdE(w, { type: 'readInstrument', instrument: 'eye', targetId: 't15' }).id!;
    }
  }
  runE(w, 200);
  cmdE(w, { type: 'tongs', tubeId: 't16', to: 'rack' });
  res.amy.B3 = cmdE(w, { type: 'readInstrument', instrument: 'eye', targetId: 't16' }).id!;
  cmdE(w, { type: 'labelTube', tubeId: 't8', label: 'Lc' });
  pipette(w, 'p1', 't10', 't8', 0.5);
  res.amy.Lc = lugolRead(w, 't8');
  cmdE(w, { type: 'tongs', tubeId: 't10', to: 'rack' });
  cmdE(w, { type: 'tongs', tubeId: 't9', to: 'rack' });
  w = resume(w);
  // Papa con Lugol al microscopio (mismo equipo y gestos que B02).
  potatoMountE(w, 'sl2', 'cv1');
  const caps = observeSlideE(w, 'sl2');
  res.potato = caps[40];
  // Cierre: residuos por clase, placas y baños apagados, microscopio apagado.
  for (const [id, t] of Object.entries(w.enz.tubes)) {
    const v = w.enz.vessels[id];
    if (t.discarded || v.volumeMl < 1e-6) continue;
    cmdE(w, { type: 'discardLiquid', vesselId: id, wasteId: WASTE_OF[wasteClassOf(v)] });
  }
  for (const pl of ['hp1', 'hp2']) {
    cmdE(w, { type: 'setHeat', plateId: pl, on: false });
    cmdE(w, { type: 'setStir', plateId: pl, rpm: 0 });
  }
  for (const bar of ['sb1', 'sb2']) if (w.enz.bars[bar]) cmdE(w, { type: 'removeStirBar', barId: bar });
  for (const b of ['bk1', 'bk2', 'bk3']) cmdE(w, { type: 'discardLiquid', vesselId: b, wasteId: WASTE_OF[wasteClassOf(w.enz.vessels[b])] });
  for (const b of ['wb1', 'wb2']) cmdE(w, { type: 'setBath', bathId: b, on: false });
  cmdE(w, { type: 'setPower', device: 'microscope', on: false });
  cmdE(w, { type: 'closeBench' });
  return { w, res };
}

const fmt = (v: number, d = 4) => v.toFixed(d).replace('.', ',');

/** Libreta completa con las lecturas propias y cálculos hechos a partir de ellas. */
export function fillNotebookB05(w: EnzWorld, nb: B05Notebook, res: IdealResB05) {
  nb.hypothesis = { catalase: 'La catalasa del hígado descompone el peróxido en agua y oxígeno medible.', amylase: 'La amilasa hidroliza el almidón: el Lugol pierde el azul con el tiempo.', heat: 'lowers' };
  nb.prep = { ...res.prep };
  nb.conditions[0] = { label: 'cat-base', massReadingId: res.cond.mass, tempReadingId: res.cond.temp, phReadingId: null, clockReadingId: res.cond.clock };
  nb.conditions[2] = { label: 'cat-acid', massReadingId: null, tempReadingId: null, phReadingId: res.cond.ph, clockReadingId: null };
  nb.controls = { blank: 'cat-blank', active: 'cat-base', noEnzyme: 'amy-ctrl' };
  nb.gas = (['cat-base', 'cat-blank', 'cat-heat', 'cat-acid'] as const).map((label) => ({ label, readingIds: [0, 1, 2, 3].map((i) => res.gas[label]?.[i] ?? null) }));
  const pts = res.gas['cat-base'].slice(0, 4).map((id) => w.enz.readings[id]);
  const from = pts[0].clockS ?? 0;
  const to = pts[2].clockS ?? 30;
  const ex = (() => {
    nb.rate.label = 'cat-base';
    nb.rate.fromS = String(Math.round(from));
    nb.rate.toS = String(Math.round(to));
    return rateExpected(w, nb)!;
  })();
  const tissueG = (w.enz.tubes.t1.tissueAtStartMg ?? 0) / 1000;
  nb.rate = {
    ...nb.rate, rateMlS: fmt(ex.rateMlS), rateMlMin: fmt(ex.rateMlMin, 3), nO2Mmol: fmt(ex.nO2Mmol), predictedO2Mmol: fmt(ex.predictedO2Mmol, 3),
    ventedIncluded: 'yes', attribution: captureLosses(w) ? 'capture' : 'catalysis', ratePerG: fmt(ex.rateMlMin / Math.max(1e-3, tissueG), 2), normUnit: 'gTissue', uncertaintyMl: '0,5',
  };
  nb.factors = { heatApparent: 'El extracto hervido casi no libera gas.', recovered: 'no', attribution: 'temperature' };
  nb.amylase.rows = nb.amylase.rows.map((r) => {
    const id = res.amy[r.label] ?? null;
    const t = id ? w.enz.tubes[w.enz.readings[id].targetId] : null;
    return { ...r, readingId: id, timeS: t?.sampledAfterS !== null && t?.sampledAfterS !== undefined ? String(Math.round(t.sampledAfterS)) : '' };
  });
  nb.amylase.benedictMeans = 'reducing';
  nb.amylase.lugolNegative = 'notComplete';
  const gly = glucosylExpected(w);
  nb.glucosyl = { initialMmol: gly !== null ? fmt(gly) : '', note: 'Masa de almidón transferida / 162 g/mol.' };
  nb.micro = { observationId: res.potato, structure: 'starchGranules' };
  for (const q of QUESTIONS_B05) nb.analysis[q] = `Respuesta propia a ${q}, apoyada en mis lecturas del colector, del Lugol y del Benedict.`;
  b05StageEvidence(w, nb);
}

export function idealAttemptB05(seed = 5505, scenarios: B05Scenario[] = [], resume: (w: EnzWorld) => EnzWorld = (w) => w) {
  const w0 = worldB05({ seed, scenarios });
  const nb = emptyB05Notebook(`b05-${seed.toString(36)}-test`);
  const { w, res } = idealRouteB05(w0, resume);
  fillNotebookB05(w, nb, res);
  return { w, nb, res };
}

export const errKeysB05 = (w: EnzWorld) => Object.keys(w.evidence).filter((k) => k.startsWith('err:'));
