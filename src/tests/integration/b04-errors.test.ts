/**
 * B04 — los 86 errores atribuibles (§9): cada fixture ejecuta el gesto real con comandos y comprueba la CONSECUENCIA en
 * el estado (volúmenes, especies, tubos, lotes, lecturas, láminas) o en la libreta, no solo el aviso. Los del
 * microscopio compartido llegan traducidos desde B01 (F05–F08, S06); los de interpretación son `nb:*`.
 */
import { describe, expect, it } from 'vitest';
import type { BioWorld } from '../../simulation/bio-world/types';
import { conservedBio, dispatchBio, feulgenAsset, missingControls } from '../../simulation/bio-world/world';
import { STAIN_JAR_POS } from '../../simulation/bio-world/geometry';
import { microscopeView } from '../../simulation/optical-world/world';
import { STAGE_SEAT, caseSlotIndex, caseSlotPos, stageTopZCm } from '../../simulation/optical-world/geometry';
import { SIMULATED_ERRORS_B04, type B04Scenario } from '../../practices/practice-b04/error-scenarios';
import { lotComposition } from '../../practices/practice-b04/definition';
import { notebookIssuesB04 } from '../../practices/practice-b04/rubric';
import { emptyB04Notebook, type B04Notebook } from '../../practices/practice-b04/notebook';
import {
  captureB, cmdB, drops, errKeysB04, eye, focusB, idealAttemptB04, label, mix, onPlate, pipette, placeB, ppeB04, pourTo, emptyInto,
  prepareAmylase, prepareLiver, prepareStarch, runB, toObjectiveB, weighPowder, worldB04,
} from '../helpersB04';

const err = (w: BioWorld, code: string) => w.evidence[`err:${code}`] ?? 0;
const base = (scenarios: B04Scenario[] = []) => {
  const w = worldB04({ scenarios });
  ppeB04(w);
  return w;
};
const vol = (w: BioWorld, id: string) => w.bio.vessels[id].volumeMl;
const tube = (w: BioWorld, id: string) => w.bio.tubes[id];
const readZero = (w: BioWorld, toolId: 'pi' | 'pv' = 'pi') => cmdB(w, { type: 'readInstrument', instrument: 'scale', targetId: toolId });
const nbIssues = (w: BioWorld, fill: (nb: B04Notebook) => void) => {
  const nb = emptyB04Notebook('x');
  fill(nb);
  return notebookIssuesB04(w, nb);
};
const row = (label: string, readingId: string, result: string, molecule = 'none') => ({ label, readingId, result, molecule }) as B04Notebook['assays']['rows'][number];

/** Tubo rotulado con una alícuota de un lote. */
const aliquot = (w: BioWorld, tubeId: string, lbl: string, src: string, ml = 2) => {
  label(w, tubeId, lbl);
  pipette(w, src, tubeId, ml);
};
/** Biuret completo (NaOH, Cu, mezcla y desarrollo). */
const biuret = (w: BioWorld, tubeId: string) => {
  drops(w, 'dNa', tubeId, 10);
  drops(w, 'dCu', tubeId, 3);
  mix(w, tubeId);
  runB(w, 70);
};
/** Lugol con mezcla. */
const lugol = (w: BioWorld, tubeId: string, n = 3) => {
  drops(w, 'dI', tubeId, n);
  mix(w, tubeId);
};
/** Emulsión: muestra con etanol tapado y agitado, luego agua. */
const emulsion = (w: BioWorld, tubeId: string, water = true) => {
  pipette(w, 'bEt', tubeId, 3);
  cmdB(w, { type: 'capTube', tubeId, capped: true });
  cmdB(w, { type: 'mixTube', tubeId, vigor01: 0.6, durationS: 20 });
  cmdB(w, { type: 'capTube', tubeId, capped: false });
  if (water) {
    pipette(w, 'bW', tubeId, 3);
    mix(w, tubeId);
  }
};
/** Baño a 95 °C listo. */
const hotBath = (w: BioWorld, bathId = 'ba1', K = 368.15) => {
  cmdB(w, { type: 'setBathSetpoint', bathId, temperatureK: K });
  cmdB(w, { type: 'setBathPower', bathId, on: true });
  for (let i = 0; i < 200 && w.bio.baths[bathId].readyAt === null; i++) runB(w, 10);
  expect(w.bio.baths[bathId].readyAt).not.toBeNull();
};
/** Benedict en un tubo con muestra: reactivo, mezcla, baño `bathS` y enfriado `coolS`. */
const benedict = (w: BioWorld, tubeId: string, bathS: number, coolS: number) => {
  pipette(w, 'bBe', tubeId, 2);
  mix(w, tubeId);
  if (bathS > 0) {
    hotBath(w);
    cmdB(w, { type: 'tongs', tubeId, to: 'ba1', depth01: 1 });
    runB(w, bathS);
    cmdB(w, { type: 'tongs', tubeId, to: 'home' });
  }
  runB(w, coolS);
};
/** Catalasa: colector (sellado o no), cronómetro y peróxido. */
const catalase = (w: BioWorld, tubeId: string, opts: { collector?: 'sealed' | 'loose' | 'none'; peroxide?: string; ml?: number } = {}) => {
  const c = opts.collector ?? 'sealed';
  if (c !== 'none') cmdB(w, { type: 'connectCollector', tubeId, sealed: c === 'sealed' });
  cmdB(w, { type: 'startTimer', tubeId });
  pipette(w, opts.peroxide ?? 'bH', tubeId, opts.ml ?? 2);
};
const gas = (w: BioWorld, tubeId: string) => w.bio.readings[cmdB(w, { type: 'readInstrument', instrument: 'gas', targetId: tubeId }).id!];

/** P1 con las cantidades pedidas (por defecto correctas) para comprobar PREP01–PREP05. */
function starchBatch(w: BioWorld, o: { g?: number; ml?: number; bar?: boolean; heat?: boolean; rpm?: number } = {}) {
  pourTo(w, 'bW', 'g100', o.ml ?? 100);
  cmdB(w, { type: 'readInstrument', instrument: 'scale', targetId: 'g100' });
  emptyInto(w, 'g100', 'bk1');
  weighPowder(w, 'jSt', o.g ?? 25);
  cmdB(w, { type: 'emptyBoat', targetId: 'bk1' });
  cmdB(w, { type: 'dryTool', toolId: 'bt' });
  if (o.bar === false) {
    placeB(w, 'bk1', 'hp1');
    runB(w, 200);
  } else {
    onPlate(w, 'bk1', 'hp1', 'sb1', o.rpm ?? 500, o.heat === false ? null : 306.15);
    for (let i = 0; i < 60 && o.heat !== false && w.bio.vessels.bk1.tK < 303.15; i++) runB(w, 10);
    if (o.heat !== false) cmdB(w, { type: 'setHotplatePower', plateId: 'hp1', on: false });
    runB(w, o.heat === false ? 200 : 60);
    if (o.heat !== false) cmdB(w, { type: 'readInstrument', instrument: 'thermo', targetId: 'bk1' });
  }
  label(w, 'bk1', 'P1');
}
/** P2 con el corte y el agua pedidos. */
function liverBatch(w: BioWorld, o: { cm?: number; ml?: number; weigh?: boolean } = {}) {
  if (o.weigh !== false) {
    placeB(w, 'liv', 'bal');
    cmdB(w, { type: 'readInstrument', instrument: 'balance', targetId: 'bal' });
  }
  placeB(w, 'liv', 'cb');
  cmdB(w, { type: 'cutTissue', sampleId: 'liv', toolId: 'sc', cutSizeCm: o.cm ?? 0.5 });
  pourTo(w, 'bW', 'g100', o.ml ?? 25);
  emptyInto(w, 'g100', 'bk2');
  cmdB(w, { type: 'addTissue', sampleId: 'liv', vesselId: 'bk2' });
  onPlate(w, 'bk2', 'hp2', 'sb2', 400, null);
  runB(w, 300);
  label(w, 'bk2', 'P2');
}
/** P3 con la masa y el agua pedidas (placa 2: la 1 la ocupa P1). */
function amylaseBatch(w: BioWorld, o: { g?: number; ml?: number } = {}) {
  pourTo(w, 'bW', 'g10', o.ml ?? 5);
  emptyInto(w, 'g10', 'bk3');
  weighPowder(w, 'jAm', o.g ?? 0.2);
  cmdB(w, { type: 'emptyBoat', targetId: 'bk3' });
  cmdB(w, { type: 'dryTool', toolId: 'bt' });
  onPlate(w, 'bk3', 'hp2', 'sb3', 300, null);
  runB(w, 180);
  label(w, 'bk3', 'P3');
}
/** P1 y P3 listos (P3 en la placa 2). */
const starchAndAmylase = () => {
  const w = base();
  prepareStarch(w);
  prepareAmylase(w, 'bk3', 'hp2');
  return w;
};
/** Tubo de amilasa con P1 (3 mL), pH medido y t₀ antes de la enzima. */
const amylaseTube = (w: BioWorld, tubeId = 'D6', opts: { ph?: boolean; timer?: boolean } = {}) => {
  label(w, tubeId, 'AMY/P1');
  pipette(w, 'bk1', tubeId, 3);
  if (opts.ph !== false) cmdB(w, { type: 'usePhStrip', vesselId: tubeId });
  if (opts.timer !== false) cmdB(w, { type: 'startTimer', tubeId });
  pipette(w, 'bk3', tubeId, 1);
};
/** Lámina fija de la caja a la platina con la pinza cerrada, ocular abierto y luz encendida. */
const slideOnStage = (w: BioWorld, slideId: string, clip = true) => {
  cmdB(w, { type: 'setPower', device: 'microscope', on: true });
  if (w.microscope.light01 < 0.2) cmdB(w, { type: 'setIllumination', device: 'microscope', value01: 0.4 });
  cmdB(w, { type: 'openSlideCase', open: true });
  toObjectiveB(w, 4);
  cmdB(w, { type: 'openClip', open: true });
  placeB(w, slideId, 'stage', { x: STAGE_SEAT.x, y: STAGE_SEAT.y, z: stageTopZCm(6) });
  if (clip) cmdB(w, { type: 'openClip', open: false });
  cmdB(w, { type: 'observe', instrument: 'compound', open: true });
};
/** Frotis por los frascos con los tiempos dados (s). */
const stain = (w: BioWorld, slideId: string, times: Partial<Record<'jFix' | 'jHcl' | 'jWash' | 'jSch', number>>) => {
  cmdB(w, { type: 'openSlideCase', open: true });
  for (const j of ['jFix', 'jHcl', 'jWash', 'jSch'] as const) {
    if (times[j] === undefined) continue;
    placeB(w, slideId, j, { ...STAIN_JAR_POS[j], z: 2 });
    runB(w, times[j]!);
  }
};
/** Cubeta del módulo ADH con los frascos indicados (1 mL cada uno). */
const cuvette = (w: BioWorld, id: string, srcs: string[]) => {
  for (const s of srcs) pipette(w, s, id, 1);
};
const juiceLot = (seed: number, scenarios: string[]) => (lotComposition('sUnk1', seed, scenarios).pigment !== undefined ? 'sUnk1' : 'sUnk2');

const FIXTURES: Record<string, () => void> = {
  // ── Manipulación ──
  M01: () => {
    const w = base();
    pipette(w, 'sPot', 'A1', 2);
    drops(w, 'dI', 'A1', 3);
    expect(err(w, 'M01')).toBe(1);
    expect(tube(w, 'A1').label).toBeNull();
    expect(tube(w, 'A1').reagents.iodine).toBeDefined();
  },
  M02: () => {
    const w = base();
    aliquot(w, 'A1', 'LUG/L-AGU', 'bW');
    aliquot(w, 'A2', 'LUG/L-AGU', 'bW');
    expect(err(w, 'M02')).toBe(1);
    expect(tube(w, 'A1').label).toBe(tube(w, 'A2').label);
  },
  M03: () => {
    const w = base();
    cmdB(w, { type: 'aspirate', toolId: 'pi', sourceId: 'bW', volumeMl: 2, speed01: 0.3 });
    cmdB(w, { type: 'dispense', toolId: 'pi', targetId: 'A1', mode: 'drain' });
    expect(err(w, 'M03')).toBe(1);
    expect(vol(w, 'A1')).toBeLessThan(2 - w.params.bio!.pipetteFilmMl - 0.05);
  },
  M04: () => {
    const w = base();
    readZero(w);
    cmdB(w, { type: 'aspirate', toolId: 'pi', sourceId: 'bW', volumeMl: 2, speed01: 0.95 });
    cmdB(w, { type: 'dispense', toolId: 'pi', targetId: 'A1', mode: 'drain' });
    expect(err(w, 'M04')).toBe(1);
    expect(vol(w, 'A1')).toBeLessThan(1.7);
  },
  M05: () => {
    const w = base();
    readZero(w);
    cmdB(w, { type: 'aspirate', toolId: 'pi', sourceId: 'bW', volumeMl: 2, speed01: 0.3 });
    cmdB(w, { type: 'dispense', toolId: 'pi', targetId: 'A1', mode: 'quick' });
    expect(err(w, 'M05')).toBe(1);
    expect(vol(w, 'A1')).toBeLessThan(1.93);
  },
  M06: () => {
    const w = base();
    readZero(w, 'pv');
    cmdB(w, { type: 'aspirate', toolId: 'pv', sourceId: 'bW', volumeMl: 2, speed01: 0.3 });
    cmdB(w, { type: 'dispense', toolId: 'pv', targetId: 'A1', mode: 'blow' });
    expect(err(w, 'M06')).toBe(1);
    expect(vol(w, 'A1')).toBeGreaterThan(w.params.bio!.volumetricMl + 0.01);
  },
  M07: () => {
    const w = base();
    aliquot(w, 'A1', 'LUG/L-HUE', 'sEgg');
    cmdB(w, { type: 'squeezeDropper', dispenserId: 'dI', targetId: 'A1', force01: 0.5, dxCm: 0, dyCm: 0, tipContact: true });
    expect(err(w, 'M07')).toBe(1);
    expect(w.bio.vessels.dI.s.proteinMg).toBeGreaterThan(0);
  },
  M08: () => {
    const w = base();
    readZero(w);
    cmdB(w, { type: 'aspirate', toolId: 'pi', sourceId: 'bW', volumeMl: 2, speed01: 0.3 });
    cmdB(w, { type: 'dispense', toolId: 'pi', targetId: 'bench', mode: 'drain' });
    expect(err(w, 'M08')).toBe(1);
    expect(vol(w, 'spill')).toBeGreaterThan(1.9);
  },
  M09: () => {
    const w = base();
    aliquot(w, 'B1', 'EMU/L-ACE', 'sOil', 0.5);
    pipette(w, 'bEt', 'B1', 3);
    drops(w, 'dI', 'B1', 3);
    expect(err(w, 'M09')).toBe(1);
    expect(tube(w, 'B1').reagents.ethanol).toBeDefined();
    expect(tube(w, 'B1').reagents.iodine).toBeDefined();
  },
  M10: () => {
    const w = base();
    pourTo(w, 'bW', 'bk1', 20);
    cmdB(w, { type: 'scoopSolid', toolId: 'spa', sourceId: 'jSt', massG: 2 });
    cmdB(w, { type: 'depositSolid', toolId: 'spa', targetId: 'bk1' });
    expect(w.bio.spatula.wet).toBe(true);
    cmdB(w, { type: 'scoopSolid', toolId: 'spa', sourceId: 'jSt', massG: 2 });
    expect(err(w, 'M10')).toBe(1);
    expect(w.bio.boat.waterG).toBeGreaterThan(0);
  },
  M11: () => {
    const w = base();
    aliquot(w, 'A4', 'BIU/L-PRO', 'sStd');
    aliquot(w, 'A6', 'BIU/L-HUE', 'sEgg');
    for (const t of ['A4', 'A6']) biuret(w, t);
    for (const t of ['A4', 'A6']) eye(w, t);
    expect(missingControls(w)).toContain('neg:BIU');
    dispatchBio(w, { type: 'closeBench' });
    expect(err(w, 'M11')).toBe(1);
  },
  M12: () => {
    const w = base();
    aliquot(w, 'A5', 'BIU/L-AGU', 'bW');
    aliquot(w, 'A6', 'BIU/L-HUE', 'sEgg');
    for (const t of ['A5', 'A6']) biuret(w, t);
    for (const t of ['A5', 'A6']) eye(w, t);
    expect(missingControls(w)).toContain('pos:BIU');
    dispatchBio(w, { type: 'closeBench' });
    expect(err(w, 'M12')).toBe(1);
  },
  M13: () => {
    const w = base();
    aliquot(w, 'A1', 'LUG/L-PAP', 'bW');
    lugol(w, 'A1');
    const r = eye(w, 'A1');
    expect(err(w, 'M13')).toBe(1);
    expect(w.bio.vessels.A1.tags).not.toContain('sPot');
    expect(r.quality).toMatch(/^lugol:yellow/);
  },
  M14: () => {
    const w = base();
    aliquot(w, 'A1', 'LUG/L-PAP', 'sPot');
    drops(w, 'dI', 'A1', 3);
    const r = eye(w, 'A1');
    expect(err(w, 'M14')).toBe(1);
    expect(w.bio.vessels.A1.homog01).toBeLessThan(0.7);
    expect(r.quality).toMatch(/^lugol:/);
  },
  M15: () => {
    const w = base();
    aliquot(w, 'A1', 'LUG/L-AGU', 'bW', 3);
    cmdB(w, { type: 'mixTube', tubeId: 'A1', vigor01: 0.95, durationS: 5 });
    expect(err(w, 'M15')).toBe(1);
    expect(vol(w, 'A1')).toBeLessThan(3 - w.params.bio!.pipetteFilmMl);
    expect(vol(w, 'spill')).toBeGreaterThan(0);
  },
  M16: () => {
    const w = base();
    aliquot(w, 'A1', 'LUG/L-PAP', 'sPot', 3);
    aliquot(w, 'A2', 'LUG/L-AGU', 'bW', 3);
    cmdB(w, { type: 'mixTube', tubeId: 'A1', vigor01: 0.95, durationS: 5 });
    expect(err(w, 'M16')).toBe(1);
    expect(w.bio.vessels.A2.s.starch + w.bio.vessels.A2.s.starchSolid).toBeGreaterThan(0);
  },
  // ── Biuret ──
  B01: () => {
    const w = base();
    aliquot(w, 'A6', 'BIU/L-HUE', 'sEgg');
    drops(w, 'dCu', 'A6', 3);
    mix(w, 'A6');
    runB(w, 70);
    const r = eye(w, 'A6');
    expect(err(w, 'B01')).toBe(1);
    expect(r.quality).toBe('biuret:blue');
  },
  B02: () => {
    const w = base(['SC09']);
    aliquot(w, 'A6', 'BIU/L-HUE', 'sEgg');
    biuret(w, 'A6');
    expect(err(w, 'B02')).toBe(1);
    expect(w.bio.vessels.A6.s.cuOH).toBeGreaterThan(0);
  },
  B03: () => {
    const w = base();
    aliquot(w, 'A6', 'BIU/L-HUE', 'sEgg');
    drops(w, 'dNa', 'A6', 10);
    drops(w, 'dCu', 'A6', 3);
    mix(w, 'A6');
    eye(w, 'A6');
    expect(err(w, 'B03')).toBe(1);
    expect(w.timeS - tube(w, 'A6').reagents.cu!).toBeLessThan(w.params.bio!.assay.biuretDelayS);
  },
  B04: () => {
    const w = base();
    aliquot(w, 'A5', 'BIU/L-AGU', 'bW');
    biuret(w, 'A5');
    const r = eye(w, 'A5');
    expect(r.quality).toBe('biuret:blue');
    expect(nbIssues(w, (nb) => { nb.assays.rows = [row('BIU/L-AGU', r.id, 'positive', 'protein')]; })).toContain('nb:B04');
  },
  B05: () => {
    const w = base();
    label(w, 'A6', 'BIU/L-HUE');
    pipette(w, 'sEgg', 'A6', 0.1);
    pipette(w, 'bW', 'A6', 3);
    biuret(w, 'A6');
    const r = eye(w, 'A6');
    expect(err(w, 'B05')).toBe(1);
    expect(w.bio.vessels.A6.s.proteinMg).toBeGreaterThan(0);
    expect(r.quality).not.toBe('biuret:violet');
  },
  B06: () => {
    const w = base();
    aliquot(w, 'A6', 'BIU/L-HUE', 'sEgg');
    drops(w, 'dNa', 'A6', 10);
    drops(w, 'dCu', 'A6', 3);
    runB(w, 70);
    eye(w, 'A6');
    expect(err(w, 'B06')).toBe(1);
    expect(tube(w, 'A6').mixedAt).toBeNull();
  },
  // ── Lugol ──
  L01: () => {
    const w = base(['SC08']);
    aliquot(w, 'A3', 'LUG/L-PAP', 'sPot');
    lugol(w, 'A3', 1);
    const r = eye(w, 'A3');
    expect(err(w, 'L01')).toBe(1);
    expect(r.value).toBeLessThan(0.7);
  },
  L02: () => {
    const w = base();
    aliquot(w, 'A1', 'LUG/L-AGU', 'bW');
    cmdB(w, { type: 'scoopSolid', toolId: 'spa', sourceId: 'jSt', massG: 0.2 });
    cmdB(w, { type: 'depositSolid', toolId: 'spa', targetId: 'A1' });
    expect(err(w, 'L02')).toBe(1);
    expect(w.bio.vessels.A1.s.starchSolid).toBeGreaterThan(0);
  },
  L03: () => {
    const sc = ['SC10'];
    const w = base(sc as B04Scenario[]);
    const juice = juiceLot(4404, sc);
    aliquot(w, 'A3', `LUG/${juice === 'sUnk1' ? 'L-X1' : 'L-X2'}`, juice);
    lugol(w, 'A3');
    const r = eye(w, 'A3');
    expect(r.quality).toContain(':pigment');
    expect(nbIssues(w, (nb) => { nb.assays.rows = [row(tube(w, 'A3').label!, r.id, 'positive', 'starch')]; })).toContain('nb:L03');
  },
  L04: () => {
    const w = base();
    aliquot(w, 'A1', 'LUG/L-PAP', 'sPot');
    drops(w, 'dCu', 'A1', 2);
    expect(err(w, 'L04')).toBe(1);
    expect(w.bio.vessels.A1.s.cu).toBeGreaterThan(0);
  },
  L05: () => {
    const w = base();
    prepareStarch(w);
    aliquot(w, 'A1', 'LUG/P1', 'bk1');
    lugol(w, 'A1');
    eye(w, 'A1');
    expect(missingControls(w)).toContain('neg:LUG');
    dispatchBio(w, { type: 'closeBench' });
    expect(err(w, 'L05')).toBe(1);
  },
  // ── Lípidos ──
  E01: () => {
    const w = base();
    aliquot(w, 'B1', 'EMU/L-ACE', 'sOil', 0.5);
    pipette(w, 'bW', 'B1', 3);
    mix(w, 'B1');
    const r = eye(w, 'B1');
    expect(err(w, 'E01')).toBe(1);
    expect(w.bio.vessels.B1.s.lipidExt).toBe(0);
    expect(r.quality).not.toMatch(/cloudy|milky/);
  },
  E02: () => {
    const w = base();
    aliquot(w, 'B1', 'EMU/L-ACE', 'sOil', 0.5);
    emulsion(w, 'B1', false);
    const r = eye(w, 'B1');
    expect(err(w, 'E02')).toBe(1);
    expect(tube(w, 'B1').dilutedAt).toBeNull();
    expect(r.quality).not.toMatch(/cloudy|milky/);
  },
  E03: () => {
    const w = base();
    aliquot(w, 'B1', 'EMU/L-ACE', 'sOil', 0.5);
    pipette(w, 'bW', 'B1', 3);
    expect(err(w, 'E03')).toBe(1);
    pipette(w, 'bEt', 'B1', 3);
    const v = w.bio.vessels.B1;
    expect(v.s.ethanolMl / v.volumeMl).toBeLessThan(w.params.bio!.assay.ethanolMinFrac);
  },
  E04: () => {
    const w = base();
    aliquot(w, 'B3', 'EMU/L-LEC', 'sMilk', 0.5);
    expect(eye(w, 'B3').quality).toBe('initial:turbid');
    emulsion(w, 'B3', false);
    const r = eye(w, 'B3');
    expect(r.quality).not.toMatch(/cloudy|milky/);
    expect(nbIssues(w, (nb) => { nb.assays.rows = [row('EMU/L-LEC', r.id, 'positive', 'lipid')]; })).toContain('nb:E04');
  },
  E05: () => {
    const w = base();
    aliquot(w, 'B1', 'EMU/L-ACE', 'sOil', 0.5);
    emulsion(w, 'B1');
    const early = eye(w, 'B1');
    expect(err(w, 'E05')).toBe(0);
    runB(w, w.params.bio!.emulsionReadMaxS + 60);
    const late = eye(w, 'B1');
    expect(err(w, 'E05')).toBe(1);
    expect(late.value).toBeLessThan(early.value);
  },
  E06: () => {
    const w = base();
    aliquot(w, 'B1', 'EMU/L-ACE', 'sOil', 0.5);
    pipette(w, 'bEt', 'B1', 3);
    const eth = w.bio.vessels.B1.s.ethanolMl;
    cmdB(w, { type: 'mixTube', tubeId: 'B1', vigor01: 0.95, durationS: 5 });
    expect(err(w, 'E06')).toBe(1);
    expect(w.bio.vessels.B1.s.ethanolMl).toBeLessThan(eth);
    expect(w.bio.vessels.spill.s.ethanolMl).toBeGreaterThan(0);
  },
  // ── Benedict ──
  R01: () => {
    const w = base();
    aliquot(w, 'C1', 'BEN/L-GLU', 'sGlu');
    benedict(w, 'C1', 0, 0);
    const r = eye(w, 'C1');
    expect(err(w, 'R01')).toBe(1);
    expect(r.quality).toBe('benedict:blue');
    expect(w.bio.vessels.C1.s.cu2o).toBe(0);
  },
  R02: () => {
    const w = base();
    aliquot(w, 'C1', 'BEN/L-GLU', 'sGlu');
    benedict(w, 'C1', 80, 800);
    eye(w, 'C1');
    expect(err(w, 'R02')).toBe(1);
    expect(tube(w, 'C1').maxTK).toBeGreaterThan(w.params.bio!.assay.benedictMinK);
    expect(tube(w, 'C1').hotDoseS).toBeLessThan(w.params.bio!.benedictMinS);
  },
  R03: () => {
    const w = base();
    aliquot(w, 'C1', 'BEN/L-GLU', 'sGlu');
    pipette(w, 'bBe', 'C1', 2);
    mix(w, 'C1');
    hotBath(w);
    cmdB(w, { type: 'tongs', tubeId: 'C1', to: 'ba1', depth01: 1 });
    runB(w, 900);
    expect(err(w, 'R03')).toBe(1);
    expect(tube(w, 'C1').evaporatedMl).toBeGreaterThan(0.15);
    expect(w.bio.evaporatedMl).toBeGreaterThan(0.15);
  },
  R04: () => {
    const w = base();
    aliquot(w, 'C1', 'BEN/L-GLU', 'sGlu');
    pipette(w, 'bBe', 'C1', 2);
    hotBath(w);
    cmdB(w, { type: 'tongs', tubeId: 'C1', to: 'ba1', depth01: 0.3 });
    expect(err(w, 'R04')).toBe(1);
    expect(tube(w, 'C1').bath?.immersion01).toBeCloseTo(0.3);
  },
  R05: () => {
    const sc = ['SC20'];
    const w = base(sc as B04Scenario[]);
    const juice = juiceLot(4404, sc);
    aliquot(w, 'C3', `BEN/${juice === 'sUnk1' ? 'L-X1' : 'L-X2'}`, juice);
    benedict(w, 'C3', 260, 800);
    const r = eye(w, 'C3');
    expect(w.bio.vessels[juice].s.reductant).toBeGreaterThan(0);
    expect(nbIssues(w, (nb) => { nb.assays.rows = [row(tube(w, 'C3').label!, r.id, 'positive', 'reducingSugar')]; })).toContain('nb:R05');
  },
  R06: () => {
    const w = base();
    aliquot(w, 'C1', 'BEN/L-GLU', 'sGlu');
    benedict(w, 'C1', 260, 0);
    eye(w, 'C1');
    expect(err(w, 'R06')).toBe(1);
    expect(w.bio.vessels.C1.tK).toBeGreaterThan(w.params.bio!.readHotK);
  },
  // ── Feulgen y microscopio ──
  F01: () => {
    const w = base();
    stain(w, 'fxU', { jHcl: 270, jWash: 35, jSch: 190 });
    expect(err(w, 'F01')).toBe(1);
    expect(feulgenAsset(w, 'fxU')).toBe('feulgenDamaged');
    expect(w.slides.fxU.assetId).toBe('feulgenDamaged');
  },
  F02: () => {
    const w = base();
    stain(w, 'fxU', { jFix: 65, jHcl: 60, jWash: 35, jSch: 190 });
    expect(err(w, 'F02')).toBe(1);
    expect(w.slides.fxU.assetId).toBe('feulgenWeak');
  },
  F03: () => {
    const w = base();
    stain(w, 'fxU', { jFix: 65, jHcl: 620, jWash: 35, jSch: 190 });
    expect(err(w, 'F03')).toBe(1);
    expect(w.slides.fxU.assetId).toBe('feulgenDamaged');
  },
  F04: () => {
    const w = base();
    stain(w, 'fxU', { jFix: 65, jHcl: 270, jSch: 190 });
    expect(err(w, 'F04')).toBe(1);
    expect(w.slides.fxU.assetId).toBe('feulgenWeak');
  },
  F05: () => {
    const w = base();
    slideOnStage(w, 'fxM');
    focusB(w);
    const o = w.observations[captureB(w)];
    expect(err(w, 'F05')).toBe(1);
    expect(o.isObservationValid).toBe(false);
    expect(o.issues).toContain('NOT_ASSIGNED');
  },
  F06: () => {
    const w = base();
    slideOnStage(w, 'fxO', false);
    cmdB(w, { type: 'setStageXY', xMm: w.microscope.stageXmm + 3, yMm: w.microscope.stageYmm });
    expect(err(w, 'F06')).toBe(1);
    expect(Math.abs(w.microscope.slideOffsetMm[0])).toBeGreaterThan(0);
  },
  F07: () => {
    const w = base();
    slideOnStage(w, 'fxO');
    toObjectiveB(w, 40);
    expect(err(w, 'F07')).toBe(1);
    expect(microscopeView(w).objectiveX).toBe(40);
    expect(w.evidence.located4x ?? 0).toBe(0);
  },
  F08: () => {
    const w = base();
    slideOnStage(w, 'fxO');
    const o = w.observations[captureB(w)];
    expect(err(w, 'F08')).toBe(1);
    expect(o.isObservationValid).toBe(false);
    expect(o.issues).toContain('OUT_OF_FOCUS');
  },
  F09: () => {
    const w = base();
    slideOnStage(w, 'fxN');
    focusB(w);
    toObjectiveB(w, 10);
    focusB(w);
    const id = captureB(w);
    expect(w.observations[id].assetId).toBe('feulgenNeg');
    expect(nbIssues(w, (nb) => { nb.feulgen.rows = [{ observationId: id, structures: ['nucleus'], dnaClaim: true, comment: '' }]; })).toContain('nb:F09');
  },
  S06: () => {
    const w = base();
    slideOnStage(w, 'fxO');
    focusB(w);
    for (const x of [10, 40] as const) {
      toObjectiveB(w, x);
      focusB(w);
    }
    cmdB(w, { type: 'openClip', open: true });
    const home = w.slideCase.home.fxO;
    const r = placeB(w, 'fxO', `case:${home}`, caseSlotPos(caseSlotIndex(home)), false);
    expect(r.ok).toBe(false);
    expect(err(w, 'S06')).toBe(1);
    expect(w.microscope.slideOnStage).toBe('fxO');
  },
  // ── Catalasa ──
  C01: () => {
    const w = base();
    prepareLiver(w);
    aliquot(w, 'D1', 'CAT/P2', 'bk2', 1);
    catalase(w, 'D1', { peroxide: 'bHo' });
    expect(err(w, 'C01')).toBe(1);
    expect(w.bio.vessels.bHo.s.h2o2 / vol(w, 'bHo')).toBeLessThan(w.bio.vessels.bH.s.h2o2 / vol(w, 'bH'));
  },
  C02: () => {
    const w = base();
    liverBatch(w, { weigh: false });
    aliquot(w, 'D1', 'CAT/P2', 'bk2', 1);
    catalase(w, 'D1');
    expect(err(w, 'C02')).toBe(1);
    expect(w.bio.liver.weighedAt).toBeNull();
  },
  C03: () => {
    const w = base();
    prepareLiver(w);
    aliquot(w, 'D3', 'CAT/P2-95', 'bk2', 1);
    hotBath(w, 'ba2');
    cmdB(w, { type: 'tongs', tubeId: 'D3', to: 'ba2', depth01: 1 });
    runB(w, 300);
    cmdB(w, { type: 'tongs', tubeId: 'D3', to: 'home' });
    runB(w, 600);
    catalase(w, 'D3');
    expect(err(w, 'C03')).toBe(1);
    expect(w.evidence['read:thermo:D3']).toBeUndefined();
    expect(tube(w, 'D3').condition).toContain('+heat');
  },
  C04: () => {
    const w = base();
    prepareLiver(w);
    aliquot(w, 'D1', 'CAT/P2', 'bk2', 1);
    catalase(w, 'D1', { collector: 'none' });
    expect(err(w, 'C04')).toBe(1);
    runB(w, 30);
    expect(dispatchBio(w, { type: 'readInstrument', instrument: 'gas', targetId: 'D1' }).ok).toBe(false);
  },
  C05: () => {
    const w = base();
    prepareLiver(w);
    aliquot(w, 'D1', 'CAT/P2', 'bk2', 1);
    catalase(w, 'D1', { collector: 'loose' });
    runB(w, 60);
    expect(err(w, 'C05')).toBe(1);
    expect(tube(w, 'D1').o2LostMmol).toBeGreaterThan(0);
  },
  C06: () => {
    const w = base();
    prepareLiver(w);
    aliquot(w, 'D1', 'CAT/P2', 'bk2', 1);
    catalase(w, 'D1');
    runB(w, 5);
    cmdB(w, { type: 'mixTube', tubeId: 'D1', vigor01: 0.75, durationS: 5 });
    expect(err(w, 'C06')).toBe(1);
    expect(tube(w, 'D1').foamMl).toBeGreaterThan(0);
  },
  C07: () => {
    const w = base();
    prepareLiver(w);
    aliquot(w, 'D1', 'CAT/P2', 'bk2', 1);
    catalase(w, 'D1');
    runB(w, 60);
    gas(w, 'D1');
    expect(missingControls(w)).toContain('blank:CAT');
    dispatchBio(w, { type: 'closeBench' });
    expect(err(w, 'C07')).toBe(1);
  },
  C08: () => {
    const w = base();
    expect(nbIssues(w, (nb) => { nb.catalase.claim = 'sourceDiffers'; nb.catalase.normalizedBy = 'none'; })).toContain('nb:C08');
    expect(nbIssues(w, (nb) => { nb.catalase.claim = 'sourceDiffers'; nb.catalase.normalizedBy = 'mass'; })).not.toContain('nb:C08');
  },
  C09: () => {
    const w = base(['SC22']);
    prepareLiver(w);
    aliquot(w, 'D1', 'CAT/P2', 'bk2', 1);
    catalase(w, 'D1', { ml: 4 });
    runB(w, 60);
    expect(err(w, 'C09')).toBe(1);
    expect(vol(w, 'spill')).toBeGreaterThan(0);
  },
  // ── Amilasa ──
  A01: () => {
    const w = base();
    prepareAmylase(w);
    aliquot(w, 'D6', 'AMY/L-PAP', 'sPot', 3);
    cmdB(w, { type: 'startTimer', tubeId: 'D6' });
    pipette(w, 'bk3', 'D6', 1);
    expect(err(w, 'A01')).toBe(1);
    expect(w.bio.vessels.D6.tags).not.toContain('P1');
  },
  A02: () => {
    const w = starchAndAmylase();
    amylaseTube(w, 'D6', { timer: false });
    runB(w, 20);
    cmdB(w, { type: 'startTimer', tubeId: 'D6' });
    expect(err(w, 'A02')).toBe(1);
    expect(tube(w, 'D6').timerAt! - tube(w, 'D6').contactAt!).toBeGreaterThan(10);
  },
  A03: () => {
    const w = starchAndAmylase();
    amylaseTube(w, 'D6', { ph: false });
    runB(w, w.params.bio!.incubationS + 5);
    aliquot(w, 'D7', 'LUG/P3', 'D6', 1);
    expect(err(w, 'A03')).toBe(1);
    expect(tube(w, 'D6').phReadAt).toBeNull();
  },
  A04: () => {
    const w = starchAndAmylase();
    amylaseTube(w);
    hotBath(w, 'ba2', 333.15);
    cmdB(w, { type: 'tongs', tubeId: 'D6', to: 'ba2', depth01: 1 });
    runB(w, 300);
    expect(err(w, 'A04')).toBe(1);
    expect(w.bio.vessels.D6.s.amyDen).toBeGreaterThan(0);
  },
  A05: () => {
    const w = starchAndAmylase();
    amylaseTube(w);
    runB(w, 60);
    aliquot(w, 'D7', 'LUG/P3', 'D6', 1);
    lugol(w, 'D7');
    const r = eye(w, 'D7');
    expect(err(w, 'A05')).toBe(1);
    expect(r.quality).toMatch(/^lugol:(blue|black)/);
  },
  A06: () => {
    const w = starchAndAmylase();
    amylaseTube(w);
    runB(w, w.params.bio!.incubationS + 5);
    aliquot(w, 'D7', 'LUG/P3', 'D6', 1);
    drops(w, 'dI', 'D7', 3);
    pipette(w, 'bBe', 'D7', 2);
    expect(err(w, 'A06')).toBe(1);
    expect(tube(w, 'D7').reagents.iodine).toBeDefined();
    expect(tube(w, 'D7').reagents.benedict).toBeDefined();
  },
  A07: () => {
    const w = base();
    starchBatch(w, { bar: false });
    expect(w.bio.vessels.bk1.homog01).toBeLessThan(w.params.bio!.prep.homogReady);
    aliquot(w, 'A1', 'LUG/P1', 'bk1');
    expect(err(w, 'A07')).toBe(1);
  },
  A08: () => {
    const w = base();
    expect(nbIssues(w, (nb) => { nb.amylase.claim = 'noHydrolysis'; nb.amylase.basis = 'benedict'; })).toContain('nb:A08');
    expect(nbIssues(w, (nb) => { nb.amylase.claim = 'noHydrolysis'; nb.amylase.basis = 'both'; })).not.toContain('nb:A08');
  },
  // ── ADH (módulo cerrado) ──
  D01: () => {
    const w = base(['MOD-ADH']);
    cuvette(w, 'q1', ['aEt', 'aAdh']);
    cmdB(w, { type: 'blankPhotometer', cuvetteId: 'q1' });
    runB(w, 60);
    const r = cmdB(w, { type: 'readInstrument', instrument: 'photometer', targetId: 'q1' });
    expect(err(w, 'D01')).toBe(1);
    expect(w.bio.readings[r.id!].quality).toBe('noCofactor');
    expect(w.bio.vessels.q1.s.nadh).toBe(0);
  },
  D02: () => {
    const w = base(['MOD-ADH']);
    cuvette(w, 'q1', ['aEt', 'aNad', 'aAdh']);
    runB(w, 60);
    const r = cmdB(w, { type: 'readInstrument', instrument: 'photometer', targetId: 'q1' });
    expect(err(w, 'D02')).toBe(1);
    expect(w.bio.readings[r.id!].biased).toBe(true);
  },
  D03: () => {
    const w = base(['MOD-ADH']);
    expect(nbIssues(w, (nb) => { nb.adh.fehlingClaim = 'acetaldehydeOnly'; })).toContain('nb:D03');
  },
  D04: () => {
    const w = base(['MOD-ADH']);
    expect(nbIssues(w, (nb) => { nb.adh.iodoformClaim = 'ethanolOnly'; })).toContain('nb:D04');
  },
  D05: () => {
    const w = base(['MOD-ADH']);
    expect(nbIssues(w, (nb) => { nb.adh.methanolClaim = 'total'; })).toContain('nb:D05');
  },
  D06: () => {
    const w = base();
    prepareLiver(w);
    aliquot(w, 'D1', 'CAT/P2', 'bk2', 1);
    label(w, 'D2', 'CAT/P2-B');
    pipette(w, 'bk2', 'D2', 0.3);
    pipette(w, 'bW', 'D2', 0.7);
    for (const t of ['D1', 'D2']) {
      catalase(w, t);
      runB(w, 60);
      gas(w, t);
    }
    expect(err(w, 'D06')).toBe(1);
    expect(tube(w, 'D2').enzymePerMl!).toBeLessThan(tube(w, 'D1').enzymePerMl! * 0.7);
  },
  // ── Seguridad ──
  S01: () => {
    const w = base();
    aliquot(w, 'C1', 'BEN/L-GLU', 'sGlu');
    hotBath(w);
    cmdB(w, { type: 'tongs', tubeId: 'C1', to: 'ba1', depth01: 1 });
    runB(w, 200);
    const r = placeB(w, 'C1', 'hand', undefined, false);
    expect(r.ok).toBe(false);
    expect(err(w, 'S01')).toBe(1);
    expect(w.safety.block?.code).toBe('HOT');
  },
  S02: () => {
    const w = base();
    aliquot(w, 'A1', 'LUG/L-AGU', 'bW');
    cmdB(w, { type: 'capTube', tubeId: 'A1', capped: true });
    readZero(w);
    cmdB(w, { type: 'aspirate', toolId: 'pi', sourceId: 'bW', volumeMl: 2, speed01: 0.3 });
    cmdB(w, { type: 'dispense', toolId: 'pi', targetId: 'bench', mode: 'drain' });
    cmdB(w, { type: 'capTube', tubeId: 'A1', capped: false });
    expect(err(w, 'S02')).toBe(1);
    expect(vol(w, 'spill')).toBeGreaterThan(0.5);
  },
  S03: () => {
    const w = base();
    aliquot(w, 'A1', 'LUG/L-PAP', 'sPot');
    lugol(w, 'A1');
    cmdB(w, { type: 'disposeVessel', vesselId: 'A1', wasteId: 'tr' });
    expect(err(w, 'S03')).toBe(1);
    expect(w.bio.vessels.tr.s.iodine).toBeGreaterThan(0);
    expect(w.objects.A1.pose.x).toBe(w.objects.trashBin.pose.x);
  },
  S04: () => {
    const w = base();
    aliquot(w, 'B1', 'EMU/L-ACE', 'sOil', 0.5);
    pipette(w, 'bEt', 'B1', 3);
    const r = dispatchBio(w, { type: 'lightBurner', on: true });
    expect(r.ok).toBe(false);
    expect(err(w, 'S04')).toBe(1);
    expect(w.bio.burnerLit).toBe(false);
    expect(w.safety.block?.code).toBe('FLAME');
  },
  S05: () => {
    const w = base();
    const r = dispatchBio(w, { type: 'startPour', sourceId: 'bMe', targetId: 'A1', tiltDeg: 60 });
    expect(r.ok).toBe(false);
    expect(err(w, 'S05')).toBe(1);
    expect(w.bio.pours.bMe).toBeUndefined();
    expect(w.safety.block?.code).toBe('METHANOL');
  },
  // ── Preparaciones ──
  PREP01: () => {
    const w = base();
    starchBatch(w, { g: 20 });
    aliquot(w, 'A1', 'LUG/P1', 'bk1');
    expect(err(w, 'PREP01')).toBe(1);
    expect(w.bio.preps.P1!.solidG).toBeLessThan(24);
  },
  PREP02: () => {
    const w = base();
    starchBatch(w, { ml: 80 });
    aliquot(w, 'A1', 'LUG/P1', 'bk1');
    expect(err(w, 'PREP02')).toBe(1);
    expect(w.bio.preps.P1!.waterMl).toBeLessThan(90);
  },
  PREP03: () => {
    const w = base();
    starchBatch(w, { bar: false });
    aliquot(w, 'A1', 'LUG/P1', 'bk1');
    expect(err(w, 'PREP03')).toBe(1);
    expect(w.bio.preps.P1!.stirredS).toBeLessThan(w.params.bio!.prep.minStirS);
  },
  PREP04: () => {
    const w = base();
    starchBatch(w, { heat: false });
    aliquot(w, 'A1', 'LUG/P1', 'bk1');
    expect(err(w, 'PREP04')).toBe(1);
    expect(w.bio.preps.P1!.measuredTK).toBeNull();
  },
  PREP05: () => {
    const w = base();
    starchBatch(w, { rpm: 1000 });
    expect(err(w, 'PREP05')).toBe(1);
    expect(w.bio.preps.P1!.splashMl).toBeGreaterThan(0);
    expect(vol(w, 'spill')).toBeGreaterThan(0);
  },
  PREP06: () => {
    const w = base();
    liverBatch(w, { cm: 2 });
    aliquot(w, 'D1', 'CAT/P2', 'bk2', 1);
    expect(err(w, 'PREP06')).toBe(1);
    expect(w.bio.liver.sizeCm).toBeGreaterThan(w.params.bio!.prep.liverMaxCm);
  },
  PREP07: () => {
    const w = base();
    liverBatch(w, { ml: 35 });
    aliquot(w, 'D1', 'CAT/P2', 'bk2', 1);
    expect(err(w, 'PREP07')).toBe(1);
    expect(w.bio.preps.P2!.waterMl).toBeGreaterThan(30);
  },
  PREP08: () => {
    const w = base();
    amylaseBatch(w, { g: 0.3 });
    aliquot(w, 'D6', 'AMY/P3', 'bk3', 1);
    expect(err(w, 'PREP08')).toBe(1);
    expect(w.bio.preps.P3!.solidG).toBeGreaterThan(0.25);
  },
  PREP09: () => {
    const w = base();
    amylaseBatch(w, { ml: 7 });
    aliquot(w, 'D6', 'AMY/P3', 'bk3', 1);
    expect(err(w, 'PREP09')).toBe(1);
    expect(w.bio.preps.P3!.waterMl).toBeGreaterThan(6);
  },
};

describe('B04 — 86 errores con consecuencia causal (§9)', () => {
  it('el catálogo tiene 86 códigos únicos y una fixture por cada uno', () => {
    const codes = SIMULATED_ERRORS_B04.map((e) => e.code);
    expect(new Set(codes).size).toBe(86);
    expect(Object.keys(FIXTURES).sort()).toEqual([...codes].sort());
  });
  for (const e of SIMULATED_ERRORS_B04) it(`${e.code} — ${e.trigger} → ${e.effect}`, () => FIXTURES[e.code](), 60000);
  it('el camino correcto no comete ninguno y conserva los balances', () => {
    const { w } = idealAttemptB04(4404);
    expect(errKeysB04(w)).toEqual([]);
  }, 120000);
  it('ningún código de B01/B02 sin traducir llega a la evidencia de B04', () => {
    const w = base();
    slideOnStage(w, 'fxM');
    toObjectiveB(w, 40);
    captureB(w);
    cmdB(w, { type: 'squeezeDropper', dispenserId: 'dI', targetId: 'bench', force01: 0.5, dxCm: 0, dyCm: 0 });
    const codes = new Set(SIMULATED_ERRORS_B04.map((e) => e.code));
    for (const k of errKeysB04(w)) expect(codes.has(k.slice(4)) || k === 'err:PPE', k).toBe(true);
  });
  it('los derrames de los errores quedan en el balance', () => {
    const w = base();
    aliquot(w, 'A1', 'LUG/L-PAP', 'sPot', 3);
    aliquot(w, 'A2', 'LUG/L-AGU', 'bW', 3);
    cmdB(w, { type: 'mixTube', tubeId: 'A1', vigor01: 0.95, durationS: 5 });
    readZero(w);
    cmdB(w, { type: 'aspirate', toolId: 'pi', sourceId: 'bW', volumeMl: 2, speed01: 0.3 });
    cmdB(w, { type: 'dispense', toolId: 'pi', targetId: 'bench', mode: 'drain' });
    for (const [k, v] of Object.entries(conservedBio(w))) if (k.startsWith('bio:')) expect(Math.abs(v), k).toBeLessThan(1e-6 * Math.max(1, Math.abs(w.bio.initial[k.slice(4)] ?? 1)));
  });
});
