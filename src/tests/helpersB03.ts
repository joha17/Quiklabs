/**
 * Ruta del estudiante de la práctica B03 hecha SOLO con comandos: EPP, membrana remojada y sellada con prueba de
 * fugas, difusión del trazador con lecturas a 0/30/60 s, diálisis con cuatro tubos rotulados y controles, ósmosis de
 * 20 min con lecturas de volumen y temperatura, tres montajes de Elodea (agua, NaCl 0,9 %, NaCl 5 %) observados a
 * 4X, 10X y 40X, y cierre del puesto (cámaras vaciadas, tubos a residuos químicos, microscopio apagado).
 */
import { expect } from 'vitest';
import type { PermCommand } from '../simulation/perm-world/commands';
import type { PermWorld, Side } from '../simulation/perm-world/types';
import { dispatchPerm, runPermFor, vesselOf } from '../simulation/perm-world/world';
import { microscopeView } from '../simulation/optical-world/world';
import { CLEAN_TRAY, PREP_SPOT, STAGE_SEAT, stageTopZCm } from '../simulation/optical-world/geometry';
import { SOAK_DISH } from '../simulation/perm-world/geometry';
import { newPracticeB03World, type PracticeB03Options } from '../practices/practice-b03';
import type { B03Scenario } from '../practices/practice-b03/error-scenarios';
import { emptyB03Notebook, QUESTIONS_B03, type B03Notebook } from '../practices/practice-b03/notebook';

export function worldB03(opts: Partial<PracticeB03Options> & { scenarios?: B03Scenario[] } = {}): PermWorld {
  return newPracticeB03World({ mode: 'PRACTICE', seed: 3303, ...opts });
}

export function cmdP(w: PermWorld, c: PermCommand, expectOk = true) {
  const r = dispatchPerm(w, c);
  if (expectOk) expect(r.ok, `${c.type}: ${r.code ?? ''}`).toBe(true);
  return r;
}

export const runP = (w: PermWorld, s: number) => runPermFor(w, s);
const P = (x: number, y: number, z = 0) => ({ x, y, z, rotationRad: 0 });

export function placeP(w: PermWorld, id: string, support: string, at?: { x: number; y: number; z?: number }, expectOk = true) {
  const o = w.objects[id];
  return cmdP(w, { type: 'setPose', id, pose: P(at?.x ?? o.pose.x, at?.y ?? o.pose.y, at?.z ?? 0), support }, expectOk);
}

export function ppeB03(w: PermWorld) {
  for (const item of ['coat', 'shoes', 'hair', 'hands', 'gloves'] as const) cmdP(w, { type: 'setPPE', item, enabled: true });
  cmdP(w, { type: 'startWork' });
  for (const t of ['glassBin', 'bioWaste', 'cw']) cmdP(w, { type: 'inspect', target: t });
}

/** Vierte inclinando el frasco hasta que el destino alcance `ml` (o el frasco se vacíe). */
export function pourTo(w: PermWorld, sourceId: string, targetId: string, ml: number, tiltDeg = 60) {
  const target = vesselOf(w, targetId)!;
  const goal = target.volumeMl + ml;
  cmdP(w, { type: 'startPour', sourceId, targetId, tiltDeg });
  for (let i = 0; i < 4000 && target.volumeMl < goal - 1e-3 && w.perm.pours[sourceId]; i++) runP(w, w.params.dtS);
  if (w.perm.pours[sourceId]) cmdP(w, { type: 'stopPour', sourceId });
}

/** Vacía una probeta en el destino (inclinación alta hasta que no quede líquido). */
export function emptyInto(w: PermWorld, sourceId: string, targetId: string) {
  cmdP(w, { type: 'startPour', sourceId, targetId, tiltDeg: 110 });
  for (let i = 0; i < 4000 && w.perm.pours[sourceId]; i++) runP(w, w.params.dtS);
}

/** Membrana remojada, insertada al centro y apretada con dos vueltas. */
export function mountMembrane(w: PermWorld, membraneId: string, cellId: string, opts: { soakS?: number; offset?: number; turns?: number } = {}) {
  placeP(w, membraneId, 'sk', SOAK_DISH);
  runP(w, opts.soakS ?? 35);
  placeP(w, membraneId, 'hand');
  cmdP(w, { type: 'insertMembrane', membraneId, cellId, offsetCm: opts.offset ?? 0 });
  cmdP(w, { type: 'turnClamp', cellId, deltaTurns: opts.turns ?? 2 });
}

export const scale = (w: PermWorld, targetId: string, eyeDeg = 0) => cmdP(w, { type: 'readInstrument', instrument: 'scale', targetId, eyeDeg }).id!;
export const eye = (w: PermWorld, targetId: string) => cmdP(w, { type: 'readInstrument', instrument: 'eye', targetId }).id!;

export function pipette(w: PermWorld, sourceId: string, targetId: string, ml: number) {
  cmdP(w, { type: 'aspirate', toolId: 'pi', sourceId, volumeMl: ml });
  cmdP(w, { type: 'dispense', toolId: 'pi', targetId });
}

export function drops(w: PermWorld, dropperId: 'dBi' | 'dAg', tubeId: string, n = 5) {
  for (let i = 0; i < n; i++) cmdP(w, { type: 'squeezeDropper', dispenserId: dropperId, targetId: tubeId, force01: 0.5, dxCm: 0, dyCm: 0 });
}

// ─────────────────────────── Microscopio (revólver de cuatro objetivos) ───────────────────────────

const seat = () => ({ x: STAGE_SEAT.x, y: STAGE_SEAT.y, z: stageTopZCm(6) });

export function toStageP(w: PermWorld, id: string) {
  if (!w.microscope.clipOpen) cmdP(w, { type: 'openClip', open: true });
  placeP(w, id, 'stage', seat());
  cmdP(w, { type: 'openClip', open: false });
}

export function toObjectiveP(w: PermWorld, x: 4 | 10 | 40 | 100) {
  const target = { 4: 0, 10: 90, 40: 180, 100: 270 }[x];
  if (w.microscope.turretDeg !== target) cmdP(w, { type: 'turnTurret', deltaDeg: target - w.microscope.turretDeg });
}

export function focusP(w: PermWorld) {
  const obj = microscopeView(w).objectiveX ?? 4;
  if (obj === 4) {
    cmdP(w, { type: 'checkSide' });
    for (let i = 0; i < 80 && microscopeView(w).sharpness01 < 0.25; i++) cmdP(w, { type: 'turnCoarse', deltaTurns: 0.1 });
  }
  let best = microscopeView(w).sharpness01;
  for (const dir of [1, -1]) {
    for (let i = 0; i < 40; i++) {
      cmdP(w, { type: 'turnFine', deltaTurns: dir * 0.05 });
      const s = microscopeView(w).sharpness01;
      if (s + 1e-9 < best) {
        cmdP(w, { type: 'turnFine', deltaTurns: -dir * 0.05 });
        break;
      }
      best = s;
    }
  }
}

export function captureP(w: PermWorld, expectOk = true) {
  if (w.view.instrument !== 'compound') cmdP(w, { type: 'observe', instrument: 'compound', open: true });
  runP(w, 1.6);
  return cmdP(w, { type: 'captureObservation', instrument: 'compound' }, expectOk).id!;
}

export function removeFromStageP(w: PermWorld, id: string) {
  if (w.view.instrument) cmdP(w, { type: 'observe', instrument: 'compound', open: false });
  toObjectiveP(w, 4);
  cmdP(w, { type: 'turnCoarse', deltaTurns: -w.microscope.coarseTurns });
  cmdP(w, { type: 'turnFine', deltaTurns: -w.microscope.fineTurns });
  cmdP(w, { type: 'openClip', open: true });
  placeP(w, id, 'cleanTray', CLEAN_TRAY);
}

export function observeSlideP(w: PermWorld, slideId: string) {
  const out: Record<number, string> = {};
  toObjectiveP(w, 4);
  toStageP(w, slideId);
  focusP(w);
  for (const x of [4, 10, 40] as const) {
    if (x !== 4) {
      toObjectiveP(w, x);
      focusP(w);
    }
    cmdP(w, { type: 'setDiaphragm', value01: x === 40 ? 0.6 : 0.5 });
    out[x] = captureP(w);
  }
  cmdP(w, { type: 'setDiaphragm', value01: 0.5 });
  removeFromStageP(w, slideId);
  return out;
}

/** Hoja de Elodea con el medio de su gotero y cubreobjetos; espera la respuesta osmótica antes de observar. */
export function elodeaMountP(w: PermWorld, slideId: string, coverId: string, dropper: string, waitS = 150) {
  placeP(w, slideId, 'prep', PREP_SPOT);
  cmdP(w, { type: 'pickSpecimen', toolId: 'fc', sourceId: 'el' });
  cmdP(w, { type: 'placeSpecimen', toolId: 'fc', targetId: slideId, dxCm: 0, dyCm: 0 });
  cmdP(w, { type: 'squeezeDropper', dispenserId: dropper, targetId: slideId, force01: 0.5, dxCm: 0, dyCm: 0 });
  cmdP(w, { type: 'wipe', targetId: 'fc', toolId: 'lp' });
  cmdP(w, { type: 'grabCover', coverId, toolId: 'fc' });
  cmdP(w, { type: 'setCoverTilt', coverId, angleDeg: 45 });
  cmdP(w, { type: 'lowerCover', coverId, slideId, speedCmS: 0.4, dxCm: 0, dyCm: 0 });
  runP(w, waitS);
}

export function microscopeOnP(w: PermWorld) {
  cmdP(w, { type: 'setPower', device: 'microscope', on: true });
  if (w.microscope.light01 < 0.2) cmdP(w, { type: 'setIllumination', device: 'microscope', value01: 0.4 });
}

export interface IdealResB03 {
  diffusion: string[];
  leak: string[];
  osm: { a0: string; b0: string; af: string; bf: string; temp: string };
  tubes: Record<string, string>;
  elodea: Record<'water' | 'nacl-0.9' | 'nacl-5', Record<number, string>>;
}

export const TUBE_PLAN: Array<{ tube: string; label: string; source: string; reagent: 'dBi' | 'dAg' }> = [
  { tube: 't1', label: 'A-Biuret', source: 'c2:A', reagent: 'dBi' },
  { tube: 't2', label: 'A-Ag', source: 'c2:A', reagent: 'dAg' },
  { tube: 't3', label: 'B-Biuret', source: 'c2:B', reagent: 'dBi' },
  { tube: 't4', label: 'B-Ag', source: 'c2:B', reagent: 'dAg' },
  { tube: 't5', label: 'blank', source: 'bW', reagent: 'dBi' },
  { tube: 't6', label: 'pos-protein', source: 'bE', reagent: 'dBi' },
  { tube: 't7', label: 'pos-chloride', source: 'bN', reagent: 'dAg' },
];

/** Montaje de la ósmosis: 20 mL de jarabe medidos con la probeta 2 al lado A y 20 mL de agua al B. */
export function loadOsmosis(w: PermWorld, syrup = 'bS', side: Side = 'A') {
  pourTo(w, syrup, 'g2', 20, 55);
  scale(w, 'g2');
  emptyInto(w, 'g2', `c3:${side}`);
  pourTo(w, 'bW', 'g2', 20, 55);
  scale(w, 'g2');
  emptyInto(w, 'g2', `c3:${side === 'A' ? 'B' : 'A'}`);
  cmdP(w, { type: 'setLid', cellId: 'c3', closed: true });
}

export function idealRouteB03(w0: PermWorld, resume: (w: PermWorld) => PermWorld = (w) => w) {
  let w = w0;
  ppeB03(w);
  microscopeOnP(w);
  const res = { diffusion: [], leak: [], tubes: {}, elodea: {} } as unknown as IdealResB03;
  // A — membrana remojada, sello y prueba de fugas con agua.
  mountMembrane(w, 'md1', 'c1');
  pourTo(w, 'bW', 'c1:A', 15);
  pourTo(w, 'bW', 'c1:B', 15);
  res.leak.push(scale(w, 'c1:A'));
  runP(w, 22);
  res.leak.push(scale(w, 'c1:A'));
  // B — trazador al lado A; lecturas del lado B a 0, 30 y 60 s (colorímetro con cero).
  cmdP(w, { type: 'zeroColorimeter' });
  pipette(w, 'bI', 'c1:A', 5);
  cmdP(w, { type: 'setLid', cellId: 'c1', closed: true });
  res.diffusion.push(eye(w, 'c1:B'));
  cmdP(w, { type: 'rinseTool', toolId: 'pi' });
  runP(w, 30 - (w.timeS - w.perm.cells.c1.tracerAt!));
  res.diffusion.push(eye(w, 'c1:B'));
  runP(w, 60 - (w.timeS - w.perm.cells.c1.tracerAt!));
  res.diffusion.push(eye(w, 'c1:B'));
  res.diffusion.push(cmdP(w, { type: 'readInstrument', instrument: 'colorimeter', targetId: 'c1:B' }).id!);
  w = resume(w);
  // C — diálisis: agua al A; clara (10 mL medidos) y NaCl 5 % (5 mL con pipeta) al B.
  mountMembrane(w, 'md2', 'c2');
  pourTo(w, 'bW', 'c2:A', 15);
  pourTo(w, 'bE', 'g1', 10, 50);
  scale(w, 'g1');
  emptyInto(w, 'g1', 'c2:B');
  pipette(w, 'bN', 'c2:B', 5);
  cmdP(w, { type: 'rinseTool', toolId: 'pi' });
  cmdP(w, { type: 'setLid', cellId: 'c2', closed: true });
  // D — ósmosis con lecturas iniciales y temperatura.
  mountMembrane(w, 'md3', 'c3');
  loadOsmosis(w);
  res.osm = { a0: scale(w, 'c3:A'), b0: scale(w, 'c3:B'), temp: cmdP(w, { type: 'readInstrument', instrument: 'thermo', targetId: 'c3' }).id!, af: '', bf: '' };
  w = resume(w);
  // Incubación (20 min) acelerada fuera de manipulación precisa.
  cmdP(w, { type: 'requestTimeScale', x: 10 });
  runP(w, 1205);
  res.osm.af = scale(w, 'c3:A');
  res.osm.bf = scale(w, 'c3:B');
  // Alícuotas a cuatro tubos rotulados, pipeta enjuagada entre lados; controles; reactivos y espera del Biuret.
  for (const t of TUBE_PLAN) cmdP(w, { type: 'labelTube', tubeId: t.tube, label: t.label });
  let last = '';
  for (const t of TUBE_PLAN) {
    if (last && last !== t.source) cmdP(w, { type: 'rinseTool', toolId: 'pi' });
    pipette(w, t.source, t.tube, 2);
    last = t.source;
  }
  cmdP(w, { type: 'rinseTool', toolId: 'pi' });
  for (const t of TUBE_PLAN) drops(w, t.reagent, t.tube);
  runP(w, 125);
  for (const t of TUBE_PLAN) res.tubes[t.label] = eye(w, t.tube);
  for (const id of ['c1', 'c2', 'c3']) {
    cmdP(w, { type: 'drainCell', cellId: id });
  }
  for (const t of TUBE_PLAN) cmdP(w, { type: 'disposeTube', tubeId: t.tube });
  w = resume(w);
  // E — tres montajes de Elodea, uno por medio.
  const media: Array<['water' | 'nacl-0.9' | 'nacl-5', string, string, string]> = [['water', 'sl1', 'cv1', 'dw'], ['nacl-0.9', 'sl2', 'cv2', 'n09'], ['nacl-5', 'sl3', 'cv3', 'n5']];
  for (const [m, slide, cover, dropper] of media) {
    elodeaMountP(w, slide, cover, dropper);
    w = resume(w);
    res.elodea[m] = observeSlideP(w, slide);
  }
  cmdP(w, { type: 'wipe', targetId: 'fc', toolId: 'lp' });
  cmdP(w, { type: 'setPower', device: 'microscope', on: false });
  cmdP(w, { type: 'closeBench' });
  return { w, res };
}

const ANSWER = 'Respuesta argumentada con mis lecturas propias, separando lo medido, lo inferido y lo que el material no permite afirmar.';

export function fillNotebookB03(w: PermWorld, nb: B03Notebook, res: IdealResB03) {
  const r = (id: string) => w.perm.readings[id];
  nb.membrane = { material: 'dialysis', code: 'D-12', areaCm2: '10', integrity: 'intact', control: 'sealed', permeability: 'known', hypothesis: { water: 'pass', salt: 'pass', protein: 'retain', tracer: 'pass' } };
  nb.diffusion.rows = res.diffusion.slice(0, 3).map((id) => ({ readingId: id, concentration: '', note: `Nivel ${r(id).value}` })).concat([{ readingId: res.diffusion[3], concentration: '', note: 'Absorbancia' }]);
  nb.diffusion.attribution = 'diffusion';
  nb.diffusion.conclusion = 'El color aparece en B con el tiempo sin fuga registrada: paso del trazador por la membrana.';
  nb.dialysis.rows = nb.dialysis.rows.map((row) => {
    const rd = r(res.tubes[row.label]);
    const pos = /violet|weak|precipitate|turbid|faint/.test(rd.quality ?? '');
    return { ...row, readingId: rd.id, interpretation: pos ? 'positive' : 'negative' };
  });
  nb.dialysis.silverShows = 'chloride';
  nb.dialysis.conclusion = 'El cloruro pasó al lado A y la proteína quedó retenida en B; los controles responden como se espera.';
  const a0 = r(res.osm.a0).value;
  const b0 = r(res.osm.b0).value;
  const af = r(res.osm.af).value;
  const bf = r(res.osm.bf).value;
  const dur = Math.max(r(res.osm.af).t, r(res.osm.bf).t) - Math.min(r(res.osm.a0).t, r(res.osm.b0).t);
  const T = r(res.osm.temp).value;
  nb.osmosis = {
    vA0: res.osm.a0, vB0: res.osm.b0, vAf: res.osm.af, vBf: res.osm.bf, tempReadingId: res.osm.temp,
    durationMin: (dur / 60).toFixed(2), dVA: (af - a0).toFixed(2), dVB: (bf - b0).toFixed(2),
    fluxMlMin: ((Math.abs(bf - b0) / dur) * 60).toFixed(4), fluxMlS: (Math.abs(bf - b0) / dur).toFixed(6), uncertaintyMl: '0.2',
    deltaOsm: '2', piKPa: (8.314462618 * (T + 273.15) * 2).toFixed(1),
    explanation: 'El agua pasó hacia el jarabe (lado hiperosmótico); la diferencia de nivel es pequeña frente a Δπ.',
  };
  nb.micro.rows = (['water', 'nacl-0.9', 'nacl-5'] as const).map((m) => {
    const id = res.elodea[m][40];
    const c = w.perm.elodeaCaptures[id];
    return { observationId: id, treatment: m, totalMag: '400', condition: c.state === 'plasmolyzed' ? 'plasmolyzed' : 'turgid', structures: ['cellWall', 'chloroplasts'] };
  });
  nb.micro.iso09 = 'depends';
  nb.balance = { water: 'Suma de volúmenes conservada salvo evaporación', solutes: 'Cloruro repartido entre A, B y tubos', notSelective: 'Las alícuotas retiradas cambian el volumen de cada lado; no es paso selectivo.' };
  for (const q of QUESTIONS_B03) nb.analysis[q] = ANSWER;
}

export function idealAttemptB03(seed = 3303, scenarios: B03Scenario[] = [], resume: (w: PermWorld) => PermWorld = (w) => w) {
  const w0 = worldB03({ seed, scenarios });
  const nb = emptyB03Notebook(`b03-${seed.toString(36)}-test`);
  const { w, res } = idealRouteB03(w0, resume);
  fillNotebookB03(w, nb, res);
  return { w, nb, res };
}

export const errKeysB03 = (w: PermWorld) => Object.keys(w.evidence).filter((k) => k.startsWith('err:'));
