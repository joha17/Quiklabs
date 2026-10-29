/**
 * Gestos de la práctica B04 hechos SOLO con comandos (EPP con gafas, preparaciones en placa con barra, alícuotas con
 * pipeta, gotas de reactivo, baños, colector de gas, lecturas). Las rutas completas se arman en las pruebas con estos
 * bloques; ningún atajo escribe el estado directamente.
 */
import { expect } from 'vitest';
import type { BioCommand } from '../simulation/bio-world/commands';
import type { BioWorld } from '../simulation/bio-world/types';
import { dispatchBio, runBioFor, vesselOf } from '../simulation/bio-world/world';
import { BEAKER_POS, PLATE_POS, STAIN_JAR_POS } from '../simulation/bio-world/geometry';
import { LOT_CODE, STAIN_JARS } from '../simulation/bio-world/world';
import { microscopeView } from '../simulation/optical-world/world';
import { STAGE_SEAT, caseSlotIndex, caseSlotPos, stageTopZCm } from '../simulation/optical-world/geometry';
import { newPracticeB04World, type PracticeB04Options } from '../practices/practice-b04';
import type { B04Scenario } from '../practices/practice-b04/error-scenarios';
import { emptyB04Notebook, QUESTIONS_B04, type B04Notebook } from '../practices/practice-b04/notebook';

export function worldB04(opts: Partial<PracticeB04Options> & { scenarios?: B04Scenario[] } = {}): BioWorld {
  return newPracticeB04World({ mode: 'PRACTICE', seed: 4404, ...opts });
}

export function cmdB(w: BioWorld, c: BioCommand, expectOk = true) {
  const r = dispatchBio(w, c);
  if (expectOk) expect(r.ok, `${c.type}: ${r.code ?? ''}`).toBe(true);
  return r;
}

export const runB = (w: BioWorld, s: number) => runBioFor(w, s);
const P = (x: number, y: number, z = 0) => ({ x, y, z, rotationRad: 0 });

export function placeB(w: BioWorld, id: string, support: string, at?: { x: number; y: number; z?: number }, expectOk = true) {
  const o = w.objects[id];
  return cmdB(w, { type: 'setPose', id, pose: P(at?.x ?? o.pose.x, at?.y ?? o.pose.y, at?.z ?? 0), support }, expectOk);
}

export function ppeB04(w: BioWorld) {
  for (const item of ['coat', 'shoes', 'hair', 'hands', 'gloves', 'goggles'] as const) cmdB(w, { type: 'setPPE', item, enabled: true });
  cmdB(w, { type: 'startWork' });
}

/** Vierte inclinando el frasco hasta que el destino reciba `ml` (o el frasco se vacíe). */
export function pourTo(w: BioWorld, sourceId: string, targetId: string, ml: number, tiltDeg = 55) {
  const target = vesselOf(w, targetId)!;
  const goal = target.volumeMl + ml;
  cmdB(w, { type: 'startPour', sourceId, targetId, tiltDeg });
  for (let i = 0; i < 20000 && target.volumeMl < goal - 1e-3 && w.bio.pours[sourceId]; i++) {
    // Cerca de la marca se inclina menos para no pasarse.
    const left = goal - target.volumeMl;
    if (left < 2 && w.bio.pours[sourceId].tiltDeg > 40) cmdB(w, { type: 'startPour', sourceId, targetId, tiltDeg: 40 });
    runB(w, w.params.dtS);
  }
  if (w.bio.pours[sourceId]) cmdB(w, { type: 'stopPour', sourceId });
}

/** Vacía un recipiente en el destino. */
export function emptyInto(w: BioWorld, sourceId: string, targetId: string) {
  cmdB(w, { type: 'startPour', sourceId, targetId, tiltDeg: 110 });
  for (let i = 0; i < 20000 && w.bio.pours[sourceId]; i++) runB(w, w.params.dtS);
}

/** Pipeta graduada: lee el cero, aspira y entrega escurriendo. */
export function pipette(w: BioWorld, sourceId: string, targetId: string, ml: number, toolId: 'pi' | 'pv' = 'pi') {
  if (!w.bio.pipettes[toolId].zeroChecked) cmdB(w, { type: 'readInstrument', instrument: 'scale', targetId: toolId });
  cmdB(w, { type: 'aspirate', toolId, sourceId, volumeMl: ml, speed01: 0.3 });
  cmdB(w, { type: 'dispense', toolId, targetId, mode: 'drain' });
  cmdB(w, { type: 'rinseTool', toolId });
}

export function drops(w: BioWorld, dropperId: 'dI' | 'dNa' | 'dCu', tubeId: string, n = 3) {
  for (let i = 0; i < n; i++) cmdB(w, { type: 'squeezeDropper', dispenserId: dropperId, targetId: tubeId, force01: 0.5, dxCm: 0, dyCm: 0 });
}

export const eye = (w: BioWorld, targetId: string) => {
  const r = cmdB(w, { type: 'readInstrument', instrument: 'eye', targetId });
  return w.bio.readings[r.id!];
};
export const mix = (w: BioWorld, tubeId: string) => cmdB(w, { type: 'mixTube', tubeId, vigor01: 0.5, durationS: 5 });
export const label = (w: BioWorld, vesselId: string, l: string) => cmdB(w, { type: 'labelVessel', vesselId, label: l });

/** Pesa `g` de un polvo en el bote tarado (espátula en tandas de hasta 5 g). */
export function weighPowder(w: BioWorld, jar: 'jSt' | 'jAm', g: number) {
  placeB(w, 'bt', 'bal');
  cmdB(w, { type: 'tare', balanceId: 'bal' });
  let left = g;
  while (left > 1e-6) {
    const k = Math.min(5, left / 0.99);
    cmdB(w, { type: 'scoopSolid', toolId: 'spa', sourceId: jar, massG: k });
    cmdB(w, { type: 'depositSolid', toolId: 'spa', targetId: 'bt' });
    left = g - Object.values(w.bio.boat.load).reduce((a, b) => a + b, 0);
    if (left < 0.005) break;
  }
  const r = cmdB(w, { type: 'readInstrument', instrument: 'balance', targetId: 'bal' });
  cmdB(w, { type: 'dryTool', toolId: 'spa' });
  return r.value!;
}

/** Beaker sobre una placa con barra, agitación y consigna (sin calor si `setK` es null). */
export function onPlate(w: BioWorld, beaker: string, plate: 'hp1' | 'hp2', bar: string, rpm: number, setK: number | null) {
  placeB(w, beaker, plate, PLATE_POS[plate]);
  cmdB(w, { type: 'insertStirBar', barId: bar, vesselId: beaker });
  cmdB(w, { type: 'setStirRate', plateId: plate, rpm });
  if (setK !== null) {
    cmdB(w, { type: 'setHotplateSetpoint', plateId: plate, temperatureK: setK });
    cmdB(w, { type: 'setHotplatePower', plateId: plate, on: true });
  }
}

/** P1: 25,0 g de almidón + 100,0 mL de agua medidos con probeta, agitación y ~30 °C leídos en el líquido. */
export function prepareStarch(w: BioWorld, beaker = 'bk1') {
  pourTo(w, 'bW', 'g100', 100);
  cmdB(w, { type: 'readInstrument', instrument: 'scale', targetId: 'g100' });
  emptyInto(w, 'g100', beaker);
  weighPowder(w, 'jSt', 25);
  cmdB(w, { type: 'emptyBoat', targetId: beaker });
  cmdB(w, { type: 'dryTool', toolId: 'bt' });
  onPlate(w, beaker, 'hp1', 'sb1', 500, 306.15);
  for (let i = 0; i < 60 && w.bio.vessels[beaker].tK < 303.15; i++) runB(w, 10);
  cmdB(w, { type: 'setHotplatePower', plateId: 'hp1', on: false });
  runB(w, 60);
  cmdB(w, { type: 'readInstrument', instrument: 'thermo', targetId: beaker });
  label(w, beaker, 'P1');
}

/** P2: hígado pesado, cortado fino, en 25,0 mL de agua con agitación, sin calefacción. */
export function prepareLiver(w: BioWorld, beaker = 'bk2') {
  placeB(w, 'liv', 'bal');
  cmdB(w, { type: 'readInstrument', instrument: 'balance', targetId: 'bal' });
  placeB(w, 'liv', 'cb');
  cmdB(w, { type: 'cutTissue', sampleId: 'liv', toolId: 'sc', cutSizeCm: 0.5 });
  pourTo(w, 'bW', 'g100', 25);
  emptyInto(w, 'g100', beaker);
  cmdB(w, { type: 'addTissue', sampleId: 'liv', vesselId: beaker });
  onPlate(w, beaker, 'hp2', 'sb2', 400, null);
  runB(w, 300);
  label(w, beaker, 'P2');
}

/** P3: 0,20 g de amilasa en 5,0 mL de agua con agitación, sin calor (comparte la placa 1 tras liberar P1). */
export function prepareAmylase(w: BioWorld, beaker = 'bk3', plate: 'hp1' | 'hp2' = 'hp1') {
  pourTo(w, 'bW', 'g10', 5);
  emptyInto(w, 'g10', beaker);
  weighPowder(w, 'jAm', 0.2);
  cmdB(w, { type: 'emptyBoat', targetId: beaker });
  cmdB(w, { type: 'dryTool', toolId: 'bt' });
  onPlate(w, beaker, plate, 'sb3', 300, null);
  runB(w, 180);
  label(w, beaker, 'P3');
}

// ─────────────────────────── Microscopio (como en B01–B03) ───────────────────────────

export function toObjectiveB(w: BioWorld, x: 4 | 10 | 40) {
  const target = { 4: 0, 10: 90, 40: 180 }[x];
  if (w.microscope.turretDeg !== target) cmdB(w, { type: 'turnTurret', deltaDeg: target - w.microscope.turretDeg });
}

export function focusB(w: BioWorld) {
  if ((microscopeView(w).objectiveX ?? 4) === 4) {
    cmdB(w, { type: 'checkSide' });
    for (let i = 0; i < 80 && microscopeView(w).sharpness01 < 0.25; i++) cmdB(w, { type: 'turnCoarse', deltaTurns: 0.1 });
  }
  let best = microscopeView(w).sharpness01;
  for (const dir of [1, -1]) {
    for (let i = 0; i < 40; i++) {
      cmdB(w, { type: 'turnFine', deltaTurns: dir * 0.05 });
      const s = microscopeView(w).sharpness01;
      if (s + 1e-9 < best) {
        cmdB(w, { type: 'turnFine', deltaTurns: -dir * 0.05 });
        break;
      }
      best = s;
    }
  }
}

export function captureB(w: BioWorld) {
  if (w.view.instrument !== 'compound') cmdB(w, { type: 'observe', instrument: 'compound', open: true });
  runB(w, 1.6);
  return cmdB(w, { type: 'captureObservation', instrument: 'compound' }).id!;
}

/** Lámina de la caja a la platina, 4X → 10X → 40X con capturas y de vuelta a su ranura. */
export function observeFixedB(w: BioWorld, slideId: string) {
  const out: Record<number, string> = {};
  toObjectiveB(w, 4);
  if (!w.microscope.clipOpen) cmdB(w, { type: 'openClip', open: true });
  placeB(w, slideId, 'stage', { x: STAGE_SEAT.x, y: STAGE_SEAT.y, z: stageTopZCm(6) });
  cmdB(w, { type: 'openClip', open: false });
  focusB(w);
  for (const x of [4, 10, 40] as const) {
    if (x !== 4) {
      toObjectiveB(w, x);
      focusB(w);
    }
    cmdB(w, { type: 'setDiaphragm', value01: x === 40 ? 0.6 : 0.5 });
    out[x] = captureB(w);
  }
  cmdB(w, { type: 'setDiaphragm', value01: 0.5 });
  cmdB(w, { type: 'observe', instrument: 'compound', open: false });
  toObjectiveB(w, 4);
  cmdB(w, { type: 'turnCoarse', deltaTurns: -w.microscope.coarseTurns });
  cmdB(w, { type: 'turnFine', deltaTurns: -w.microscope.fineTurns });
  cmdB(w, { type: 'openClip', open: true });
  const home = w.slideCase.home[slideId];
  placeB(w, slideId, `case:${home}`, caseSlotPos(caseSlotIndex(home)));
  cmdB(w, { type: 'openClip', open: false });
  return out;
}

/** Frotis por los cuatro frascos de Feulgen con los tiempos mínimos de cada uno (y un margen). */
export function feulgenStain(w: BioWorld, slideId: string) {
  const f = w.params.bio!.feulgen;
  const times: Record<(typeof STAIN_JARS)[number], number> = { jFix: f.fixMinS + 5, jHcl: f.hydroMinS + 30, jWash: f.washMinS + 5, jSch: f.schiffMinS + 10 };
  for (const j of STAIN_JARS) {
    placeB(w, slideId, j, { ...STAIN_JAR_POS[j], z: 2 });
    runB(w, times[j]);
  }
}

// ─────────────────────────── Ruta ideal ───────────────────────────

/** Ensayos de biomoléculas: muestra, patrón (control positivo) y agua (blanco) por ensayo. */
export const ASSAY_PLAN: Array<{ tube: string; assay: 'LUG' | 'BIU' | 'EMU' | 'BEN'; lot: string }> = [
  { tube: 'A1', assay: 'LUG', lot: 'P1' }, { tube: 'A2', assay: 'LUG', lot: 'bW' }, { tube: 'A3', assay: 'LUG', lot: 'sPot' },
  { tube: 'A4', assay: 'BIU', lot: 'sStd' }, { tube: 'A5', assay: 'BIU', lot: 'bW' }, { tube: 'A6', assay: 'BIU', lot: 'sEgg' },
  { tube: 'B1', assay: 'EMU', lot: 'sOil' }, { tube: 'B2', assay: 'EMU', lot: 'bW' }, { tube: 'B3', assay: 'EMU', lot: 'sMilk' },
  { tube: 'C1', assay: 'BEN', lot: 'sGlu' }, { tube: 'C2', assay: 'BEN', lot: 'bW' }, { tube: 'C3', assay: 'BEN', lot: 'sUnk1' },
];
export const POSITIVE_B04 = /^(lugol:(black|blue)|biuret:(violet|weak)|emulsion:(milky|cloudy)|benedict:(green|yellow|orange|brick))/;
const MOLECULE = { LUG: 'starch', BIU: 'protein', EMU: 'lipid', BEN: 'reducingSugar' } as const;

export interface IdealResB04 {
  massId: string;
  assays: Array<{ label: string; id: string }>;
  feulgen: string[];
  gas: Array<{ id: string; condition: string }>;
  amy: { lugol: string; benedict: string; control: string; ph: string };
}

/** Benedict: el tubo tarda ~2 min en pasar de 80 °C y luego necesita la dosis térmica; fuera del baño, ~13 min hasta < 50 °C. */
export const BENEDICT_BATH_S = 260;
export const BENEDICT_COOL_S = 800;

const pourLabel = (w: BioWorld, tube: string, assay: string, lot: string) => label(w, tube, `${assay}/${LOT_CODE[lot]}`);
const readGas = (w: BioWorld, tube: string) => cmdB(w, { type: 'readInstrument', instrument: 'gas', targetId: tube }).id!;

export function idealRouteB04(w0: BioWorld, resume: (w: BioWorld) => BioWorld = (w) => w) {
  let w = w0;
  const res: IdealResB04 = { massId: '', assays: [], feulgen: [], gas: [], amy: { lugol: '', benedict: '', control: '', ph: '' } };
  ppeB04(w);
  cmdB(w, { type: 'setPower', device: 'microscope', on: true });
  if (w.microscope.light01 < 0.2) cmdB(w, { type: 'setIllumination', device: 'microscope', value01: 0.4 });
  // A — P1 y P2 (sin calor para el hígado).
  prepareStarch(w);
  res.massId = (() => {
    placeB(w, 'liv', 'bal');
    return cmdB(w, { type: 'readInstrument', instrument: 'balance', targetId: 'bal' }).id!;
  })();
  placeB(w, 'liv', 'cb');
  cmdB(w, { type: 'cutTissue', sampleId: 'liv', toolId: 'sc', cutSizeCm: 0.5 });
  pourTo(w, 'bW', 'g100', 25);
  emptyInto(w, 'g100', 'bk2');
  cmdB(w, { type: 'addTissue', sampleId: 'liv', vesselId: 'bk2' });
  onPlate(w, 'bk2', 'hp2', 'sb2', 400, null);
  runB(w, 300);
  label(w, 'bk2', 'P2');
  w = resume(w);
  // B/C — ensayos con blanco y patrón; el baño de Benedict se enciende primero.
  cmdB(w, { type: 'setBathSetpoint', bathId: 'ba1', temperatureK: 368.15 });
  cmdB(w, { type: 'setBathPower', bathId: 'ba1', on: true });
  for (const x of ASSAY_PLAN) pourLabel(w, x.tube, x.assay, x.lot);
  for (const x of ASSAY_PLAN) pipette(w, x.lot === 'P1' ? 'bk1' : x.lot, x.tube, x.assay === 'EMU' ? 0.5 : 2);
  for (const x of ASSAY_PLAN.filter((q) => q.assay === 'LUG')) {
    drops(w, 'dI', x.tube, 3);
    mix(w, x.tube);
  }
  for (const x of ASSAY_PLAN.filter((q) => q.assay === 'BIU')) {
    drops(w, 'dNa', x.tube, 10);
    drops(w, 'dCu', x.tube, 3);
    mix(w, x.tube);
  }
  for (const x of ASSAY_PLAN.filter((q) => q.assay === 'EMU')) {
    pipette(w, 'bEt', x.tube, 3);
    cmdB(w, { type: 'capTube', tubeId: x.tube, capped: true });
    cmdB(w, { type: 'mixTube', tubeId: x.tube, vigor01: 0.6, durationS: 20 });
    cmdB(w, { type: 'capTube', tubeId: x.tube, capped: false });
    pipette(w, 'bW', x.tube, 3);
    mix(w, x.tube);
  }
  // La emulsión se lee enseguida, antes de que las fases se separen.
  const emuIds: Record<string, string> = {};
  for (const x of ASSAY_PLAN.filter((q) => q.assay === 'EMU')) emuIds[x.tube] = eye(w, x.tube).id;
  for (const x of ASSAY_PLAN.filter((q) => q.assay === 'BEN')) {
    pipette(w, 'bBe', x.tube, 2);
    mix(w, x.tube);
  }
  for (let i = 0; i < 120 && w.bio.baths.ba1.readyAt === null; i++) runB(w, 10);
  for (const x of ASSAY_PLAN.filter((q) => q.assay === 'BEN')) cmdB(w, { type: 'tongs', tubeId: x.tube, to: 'ba1', depth01: 1 });
  runB(w, BENEDICT_BATH_S);
  for (const x of ASSAY_PLAN.filter((q) => q.assay === 'BEN')) cmdB(w, { type: 'tongs', tubeId: x.tube, to: 'home' });
  runB(w, BENEDICT_COOL_S);
  for (const x of ASSAY_PLAN) res.assays.push({ label: `${x.assay}/${LOT_CODE[x.lot]}`, id: emuIds[x.tube] ?? eye(w, x.tube).id });
  for (const x of ASSAY_PLAN) cmdB(w, { type: 'disposeVessel', vesselId: x.tube, wasteId: 'cw' });
  w = resume(w);
  // D — Feulgen: frotis sin teñir por los frascos; frotis y control sin hidrólisis al microscopio.
  cmdB(w, { type: 'openSlideCase', open: true });
  feulgenStain(w, 'fxU');
  res.feulgen.push(observeFixedB(w, 'fxU')[40]);
  res.feulgen.push(observeFixedB(w, 'fxN')[40]);
  cmdB(w, { type: 'openSlideCase', open: false });
  w = resume(w);
  // E — catalasa: hervida (con pinza, enfriada), cruda, papa y blanco; colector y cronómetro antes del peróxido.
  cmdB(w, { type: 'setBathSetpoint', bathId: 'ba2', temperatureK: 368.15 });
  cmdB(w, { type: 'setBathPower', bathId: 'ba2', on: true });
  label(w, 'D3', 'CAT/P2-95');
  pipette(w, 'bk2', 'D3', 1);
  for (let i = 0; i < 120 && w.bio.baths.ba2.readyAt === null; i++) runB(w, 10);
  cmdB(w, { type: 'tongs', tubeId: 'D3', to: 'ba2', depth01: 1 });
  runB(w, 300);
  // El pretratamiento se registra: temperatura del extracto en el baño.
  cmdB(w, { type: 'readInstrument', instrument: 'thermo', targetId: 'D3' });
  cmdB(w, { type: 'tongs', tubeId: 'D3', to: 'home' });
  cmdB(w, { type: 'setBathPower', bathId: 'ba2', on: false });
  runB(w, 600);
  const cat: Array<[string, string, string]> = [['D1', 'CAT/P2', 'bk2'], ['D2', 'CAT/L-AGU', 'bW'], ['D3', '', ''], ['D4', 'CAT/L-PAP', 'sPot']];
  for (const [tube, lbl, src] of cat) {
    if (lbl) {
      label(w, tube, lbl);
      pipette(w, src, tube, 1);
    }
    cmdB(w, { type: 'connectCollector', tubeId: tube, sealed: true });
    cmdB(w, { type: 'startTimer', tubeId: tube });
    pipette(w, 'bH', tube, 2);
    runB(w, 60);
    res.gas.push({ id: readGas(w, tube), condition: w.bio.tubes[tube].condition ?? '' });
    cmdB(w, { type: 'disconnectCollector', tubeId: tube });
  }
  w = resume(w);
  // E — amilasa: P1 libera la placa 1, P3 sin calor, P1 + P3 con pH y t₀, alícuotas separadas y control sin enzima.
  cmdB(w, { type: 'setStirRate', plateId: 'hp1', rpm: 0 });
  cmdB(w, { type: 'retrieveStirBar', barId: 'sb1' });
  placeB(w, 'bk1', 'bench', BEAKER_POS.bk1);
  prepareAmylase(w);
  label(w, 'D5', 'LUG/P1');
  pipette(w, 'bk1', 'D5', 1);
  label(w, 'D6', 'AMY/P1');
  pipette(w, 'bk1', 'D6', 3);
  res.amy.ph = cmdB(w, { type: 'usePhStrip', vesselId: 'D6' }).id ?? '';
  cmdB(w, { type: 'startTimer', tubeId: 'D6' });
  pipette(w, 'bk3', 'D6', 1);
  runB(w, w.params.bio!.incubationS + 5);
  label(w, 'D7', 'LUG/P3');
  pipette(w, 'D6', 'D7', 1);
  label(w, 'D8', 'BEN/P3');
  pipette(w, 'D6', 'D8', 1);
  for (const t of ['D5', 'D7']) {
    drops(w, 'dI', t, 3);
    mix(w, t);
  }
  pipette(w, 'bBe', 'D8', 2);
  mix(w, 'D8');
  cmdB(w, { type: 'tongs', tubeId: 'D8', to: 'ba1', depth01: 1 });
  runB(w, BENEDICT_BATH_S);
  cmdB(w, { type: 'tongs', tubeId: 'D8', to: 'home' });
  cmdB(w, { type: 'setBathPower', bathId: 'ba1', on: false });
  runB(w, BENEDICT_COOL_S);
  res.amy.control = eye(w, 'D5').id;
  res.amy.lugol = eye(w, 'D7').id;
  res.amy.benedict = eye(w, 'D8').id;
  // F — cierre: placas apagadas, barras fuera, todo a residuos químicos, microscopio apagado en 4X.
  for (const p of ['hp1', 'hp2'] as const) cmdB(w, { type: 'setStirRate', plateId: p, rpm: 0 });
  for (const b of ['sb2', 'sb3'] as const) cmdB(w, { type: 'retrieveStirBar', barId: b });
  for (const bk of ['bk1', 'bk2', 'bk3']) cmdB(w, { type: 'disposeVessel', vesselId: bk, wasteId: 'cw' });
  for (const t of ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8']) cmdB(w, { type: 'disposeVessel', vesselId: t, wasteId: 'cw' });
  cmdB(w, { type: 'setPower', device: 'microscope', on: false });
  cmdB(w, { type: 'closeBench' });
  return { w, res };
}

const ANSWER = 'Respuesta propia basada en mis lecturas: comparo con el blanco y el patrón, y no concluyo más allá del límite de detección del ensayo.';

export function fillNotebookB04(w: BioWorld, nb: B04Notebook, res: IdealResB04) {
  const r = (id: string) => w.bio.readings[id];
  nb.inventory.rows = nb.inventory.rows.map((row) => ({ ...row, role: row.lot === 'L-AGU' ? 'negative' : 'positive', initialReadingId: res.assays.find((a) => a.label.endsWith(`/${row.lot}`))?.id ?? null }));
  nb.inventory.massReadingId = res.massId;
  nb.inventory.uncertainty = '±0,1 g; ±0,5 mL';
  nb.assays.rows = res.assays.map((a) => {
    const q = r(a.id).quality ?? '';
    const pos = POSITIVE_B04.test(q);
    const assay = a.label.split('/')[0] as keyof typeof MOLECULE;
    return { label: a.label, readingId: a.id, result: pos ? 'positive' : 'negative', molecule: pos ? MOLECULE[assay] : 'none' };
  });
  nb.feulgen.rows = res.feulgen.map((id, i) => ({ observationId: id, structures: ['epithelialCells', 'nucleus'], dnaClaim: i === 0 && ['feulgenBuccal', 'feulgenOnion'].includes(String(w.observations[id]?.assetId)), comment: 'Comparado con el control sin hidrólisis.' }));
  nb.catalase.rows = res.gas.map((g) => ({ readingId: g.id, condition: g.condition, normalized: (r(g.id).value / Math.max(1e-6, r(res.massId).value)).toFixed(2) }));
  nb.catalase.liverMassReadingId = res.massId;
  nb.catalase.normalizedBy = 'mass';
  nb.catalase.claim = 'heatInactivates';
  nb.catalase.conclusion = 'El extracto crudo libera O₂; hervido casi no, y el blanco no da gas.';
  nb.amylase = { lugolReadingId: res.amy.lugol, benedictReadingId: res.amy.benedict, controlReadingId: res.amy.control, phReadingId: res.amy.ph || null, claim: 'partial', basis: 'both', conclusion: 'Lugol más débil que el control y Benedict con precipitado: hidrólisis.' };
  nb.comparison = { energy: 'Almidón y lípidos: reservas.', structure: 'Proteínas: estructura y enzimas.', information: 'ADN: información.' };
  nb.errors = [{ observed: 'Burbujas en la pipeta', cause: 'Émbolo rápido', action: 'Aspirar despacio' }];
  for (const q of QUESTIONS_B04) nb.analysis[q] = ANSWER;
}

export function idealAttemptB04(seed = 4404, scenarios: B04Scenario[] = [], resume: (w: BioWorld) => BioWorld = (w) => w) {
  const w0 = worldB04({ seed, scenarios });
  const nb = emptyB04Notebook(`b04-${seed.toString(36)}-test`);
  const { w, res } = idealRouteB04(w0, resume);
  fillNotebookB04(w, nb, res);
  return { w, nb, res };
}

export const errKeysB04 = (w: BioWorld) => Object.keys(w.evidence).filter((k) => k.startsWith('err:'));
