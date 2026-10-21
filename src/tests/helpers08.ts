/**
 * Rutas del estudiante de la Práctica 8 hechas SOLO con comandos (sin inyectar banderas de etapa): las usan las
 * pruebas de flujo, de errores, de repetición y de la demostración. Cada ruta (ISO, ASA, MS) sigue la guía §2.2–§2.4.
 */
import { expect } from 'vitest';
import type { P08Command } from '../simulation/organic-world/commands';
import type { P08World, RouteId } from '../simulation/organic-world/types';
import { dispatchP08, phasesOf, runP08For, stepP08World, vesselMl } from '../simulation/organic-world/world';
import { liquidMl, massG, speciesIn } from '../simulation/organic-chemistry/species';
import { newPractice08World, type Practice08Options } from '../practices/practice-08';
import type { P08Scenario } from '../practices/practice-08/error-scenarios';
import { ROUTES08 } from '../practices/practice-08/routes';
import { emptyP08Notebook, parseNum, QUESTIONS, type Entry, type P08Notebook } from '../practices/practice-08/notebook';
import { declaredPurity, plannedLimiting, rowMoles } from '../practices/practice-08/expected-results';

export function world08(opts: Partial<Practice08Options> & { scenarios?: P08Scenario[] } = {}): P08World {
  return newPractice08World({ mode: 'PRACTICE', seed: 8008, route: 'ISO', ...opts });
}

export function cmd08(w: P08World, c: P08Command, expectOk = true) {
  const r = dispatchP08(w, c);
  if (expectOk) expect(r.ok, `${c.type}: ${r.code ?? ''}`).toBe(true);
  return r;
}

export const run08 = (w: P08World, s: number) => runP08For(w, s);
const pose = (x = 0, y = 0, z = 0) => ({ x, y, z, rotationRad: 0 });

export function place(w: P08World, id: string, support: string, z = 0) {
  return cmd08(w, { type: 'setPose', id, pose: pose(w.objects[id].pose.x, w.objects[id].pose.y, z), support });
}

export function ppe08(w: P08World) {
  for (const item of ['goggles', 'coat', 'gloves', 'hair'] as const) cmd08(w, { type: 'setPPE', item, enabled: true });
  cmd08(w, { type: 'startWork' });
}

/** Inspección de fichas e instrumentos de la ruta (estación A). */
export function inspectAll(w: P08World) {
  const ids = w.route === 'ISO' ? ['btIAA', 'btAcOH', 'btH2SO4'] : w.route === 'ASA' ? ['jarSA', 'btAA', 'btH3PO4'] : ['jarSA', 'btMeOH', 'btH2SO4'];
  for (const id of [...ids, 'balance01', 'th01']) cmd08(w, { type: 'inspect', target: id });
}

/** Vierte de `src` a `tgt` hasta `ml` en el destino, con inclinación apenas sobre el umbral. */
export function pourTo(w: P08World, src: string, tgt: string, ml: number) {
  const s = w.vessels[src];
  if (s.capped) cmd08(w, { type: 'setCap', vesselId: src, capped: false });
  const target = w.vessels[tgt];
  const start = vesselMl(target);
  for (let i = 0; i < 8000 && vesselMl(target) - start < ml - 0.02 && vesselMl(s) > 0.02; i++) {
    const fill = Math.min(1, vesselMl(s) / s.capacityMl);
    const tilt0 = 100 - 88 * fill;
    const need = ml - (vesselMl(target) - start);
    cmd08(w, { type: 'setPour', sourceId: src, targetId: tgt, tiltDeg: tilt0 + (need > 3 ? 14 : need > 0.6 ? 6 : 2) });
    stepP08World(w);
  }
  cmd08(w, { type: 'stopPour', sourceId: src });
  return vesselMl(target) - start;
}

/** Vacía un recipiente vertible en otro (queda la película que retiene el vidrio). */
export function pourAll(w: P08World, src: string, tgt: string, tilt = 120) {
  let last = Infinity;
  for (let i = 0; i < 6000; i++) {
    const ml = vesselMl(w.vessels[src]);
    if (i % 20 === 0) {
      if (last - ml < 1e-4) break;
      last = ml;
    }
    cmd08(w, { type: 'setPour', sourceId: src, targetId: tgt, tiltDeg: tilt });
    stepP08World(w);
  }
  cmd08(w, { type: 'stopPour', sourceId: src });
}

/** Una cucharada con la espátula de `jar` a `target` (limpia la espátula al cambiar de sustancia). */
export function spoon(w: P08World, jar: string, target: string) {
  if (w.vessels[jar].capped) cmd08(w, { type: 'setCap', vesselId: jar, capped: false });
  // Buena práctica: limpiar la espátula si trae restos de otra sustancia (si no, ORG12).
  const inJar = speciesIn(w.vessels[jar].solid);
  if (speciesIn(w.spatula.residue).some((k) => !inJar.includes(k))) cmd08(w, { type: 'cleanTool', toolId: 'spatula' });
  place(w, 'spatula', jar, 2);
  cmd08(w, { type: 'scoop', sourceId: jar });
  place(w, 'spatula', target, 3);
  cmd08(w, { type: 'dropSpatula', targetId: target });
  place(w, 'spatula', 'bench', 0.4);
}

/** Gotero: aspira `ml` de `src` y los entrega en `tgt`. */
export function dropperTransfer(w: P08World, src: string, tgt: string, ml: number) {
  if (w.vessels[src].capped) cmd08(w, { type: 'setCap', vesselId: src, capped: false });
  place(w, 'dp1', src, 3);
  cmd08(w, { type: 'setDropper', dropperId: 'dp1', squeeze01: -1 });
  for (let i = 0; i < 800 && liquidMl(w.droppers.dp1.content) < ml; i++) stepP08World(w);
  cmd08(w, { type: 'setDropper', dropperId: 'dp1', squeeze01: 0 });
  place(w, 'dp1', tgt, 6);
  cmd08(w, { type: 'setDropper', dropperId: 'dp1', squeeze01: 1 });
  for (let i = 0; i < 800 && liquidMl(w.droppers.dp1.content) > 1e-4; i++) stepP08World(w);
  cmd08(w, { type: 'setDropper', dropperId: 'dp1', squeeze01: 0 });
  place(w, 'dp1', 'bench', 0.6);
  cmd08(w, { type: 'setCap', vesselId: src, capped: true });
}

/** Pone `id` en el platillo, espera estabilidad, lee y lo devuelve a `back`. */
export function weigh(w: P08World, id: string, back: string, z = 0, zero = true) {
  if (!w.balance.powered) {
    cmd08(w, { type: 'powerBalance', on: true });
    run08(w, 1);
  }
  // Cero con el platillo vacío antes de cada pesada.
  if (zero && w.balance.panIds.length === 0 && Math.abs(w.balance.tareG) > 1e-6) {
    run08(w, 2);
    cmd08(w, { type: 'tare' });
  }
  place(w, id, 'pan', 9);
  run08(w, 3);
  // Se espera la indicación de estable (una muestra húmeda deriva y tarda más).
  for (let i = 0; i < 40 && !w.balance.stable; i++) run08(w, 0.25);
  const r = cmd08(w, { type: 'readBalance' });
  place(w, id, back, z);
  return r.id!;
}

/** Pesa sólido en el vidrio de reloj tarado hasta superar `g`. */
export function weighOut(w: P08World, glass: string, jar: string, g: number) {
  if (!w.balance.powered) cmd08(w, { type: 'powerBalance', on: true });
  place(w, glass, 'pan', 9);
  run08(w, 3.5);
  cmd08(w, { type: 'tare' });
  run08(w, 3.5);
  for (let i = 0; i < 40 && massG(w.vessels[glass].solid) < g - 0.25; i++) spoon(w, jar, glass);
  run08(w, 3.5);
  const r = cmd08(w, { type: 'readBalance' });
  place(w, glass, 'bench', 0);
  return r.id!;
}

/** Calienta el balón en el baño con agitación (y reflujo si la ruta lo usa), leyendo la temperatura. */
export function heat(w: P08World, seconds: number) {
  const route = ROUTES08[w.route];
  place(w, 'th01', 'rf', 4);
  if (w.route !== 'ASA') {
    place(w, 'condenser01', 'rf', 11);
    cmd08(w, { type: 'setCondenserWater', on: true });
  }
  place(w, 'rf', 'bath01', 13);
  cmd08(w, { type: 'setMagneticStir', level01: 0.5 });
  cmd08(w, { type: 'setPlate', on: true, setpointC: route.bathC });
  const reads: string[] = [];
  const steps = Math.ceil(seconds / 60);
  for (let i = 0; i < steps; i++) {
    run08(w, 60);
    if (i % 5 === 2) reads.push(cmd08(w, { type: 'readThermometer' }).id!);
  }
  cmd08(w, { type: 'setPlate', on: false, setpointC: route.bathC });
  return reads;
}

/** Saca el balón caliente con la pinza y lo enfría en el baño de hielo. */
export function coolInIce(w: P08World, untilC = 30) {
  cmd08(w, { type: 'useTongs', on: true });
  place(w, 'rf', 'ice01', 1.2);
  cmd08(w, { type: 'setMagneticStir', level01: 0 });
  for (let i = 0; i < 200 && w.vessels.rf.tempC > untilC; i++) run08(w, 5);
  cmd08(w, { type: 'useTongs', on: false });
}

/** Agita el embudo tapado en tandas cortas, venteando entre ellas (§11.2). */
export function shakeAndVent(w: P08World, rounds = 3) {
  cmd08(w, { type: 'setStopper', on: true });
  place(w, 'sf', 'hand', 30);
  for (let i = 0; i < rounds; i++) {
    cmd08(w, { type: 'shakeFunnel', on: true });
    run08(w, 1);
    cmd08(w, { type: 'shakeFunnel', on: false });
    cmd08(w, { type: 'vent' });
  }
  place(w, 'sf', 'ring01', 18);
  cmd08(w, { type: 'setStopper', on: false });
}

/** Deja reposar y descarga la fase de abajo hasta la interfase en `receiver`. */
export function drainBottom(w: P08World, receiver: string, settleS = 40) {
  run08(w, settleS);
  const f = w.vessels.sf;
  const two = phasesOf(f).twoPhases;
  cmd08(w, { type: 'setValve', opening01: 1, receiverId: receiver });
  for (let i = 0; i < 6000; i++) {
    const ph = phasesOf(f);
    const left = liquidMl(ph.bottom);
    if (!two || !ph.twoPhases || left < 0.08 || vesselMl(f) < 0.05) break;
    if (left < 1) cmd08(w, { type: 'setValve', opening01: 0.3, receiverId: receiver });
    stepP08World(w);
  }
  cmd08(w, { type: 'setValve', opening01: 0, receiverId: null });
}

/** Vacía por la llave todo lo que queda en el embudo. */
export function drainAll(w: P08World, receiver: string) {
  cmd08(w, { type: 'setValve', opening01: 1, receiverId: receiver });
  for (let i = 0; i < 6000 && vesselMl(w.vessels.sf) > 0.02; i++) stepP08World(w);
  cmd08(w, { type: 'setValve', opening01: 0, receiverId: null });
}

export interface IdealResult {
  masses: string[];
  volumes: string[];
  temps: string[];
  productMass?: string;
  supportMass?: string;
  analyses: string[];
}

/** Dosificación de la ruta en el balón sobre la balanza (pesada por diferencia). */
export function dose(w: P08World, res: IdealResult) {
  const R = w.route;
  if (R === 'ISO') {
    res.masses.push(weigh(w, 'rf', 'cork01', 1.2));
    pourTo(w, 'btIAA', 'cyl10', 5.0);
    res.volumes.push(cmd08(w, { type: 'readVolume', vesselId: 'cyl10', eyeDzCm: 0 }).id!);
    pourAll(w, 'cyl10', 'rf');
    res.masses.push(weigh(w, 'rf', 'cork01', 1.2));
    pourTo(w, 'btAcOH', 'cyl25', 7.0);
    res.volumes.push(cmd08(w, { type: 'readVolume', vesselId: 'cyl25', eyeDzCm: 0 }).id!);
    pourAll(w, 'cyl25', 'rf');
    res.masses.push(weigh(w, 'rf', 'cork01', 1.2));
    dropperTransfer(w, 'btH2SO4', 'rf', 0.25);
  } else {
    res.masses.push(weighOut(w, 'wg1', 'jarSA', 2.0));
    cmd08(w, { type: 'dispose', vesselId: 'wg1', targetId: 'rf' });
    // Por diferencia: el resto que quedó en el vidrio, con la misma tara.
    res.masses.push(weigh(w, 'wg1', 'bench', 0, false));
    cmd08(w, { type: 'setCap', vesselId: 'jarSA', capped: true });
    if (R === 'ASA') {
      pourTo(w, 'btAA', 'cyl10', 5.0);
      res.volumes.push(cmd08(w, { type: 'readVolume', vesselId: 'cyl10', eyeDzCm: 0 }).id!);
      pourAll(w, 'cyl10', 'rf');
      dropperTransfer(w, 'btH3PO4', 'rf', 0.25);
    } else {
      pourTo(w, 'btMeOH', 'cyl25', 10.0);
      res.volumes.push(cmd08(w, { type: 'readVolume', vesselId: 'cyl25', eyeDzCm: 0 }).id!);
      pourAll(w, 'cyl25', 'rf');
      dropperTransfer(w, 'btH2SO4', 'rf', 0.25);
    }
  }
  for (const id of Object.keys(w.vessels)) if (id.startsWith('bt') && w.vessels[id].capped === false) cmd08(w, { type: 'setCap', vesselId: id, capped: true });
}

/** Aislamiento de las rutas líquidas: lavados en el embudo, secado y módulo de fracciones. */
export function isolateLiquid(w: P08World, res: IdealResult) {
  const R = w.route;
  cmd08(w, { type: 'setPose', id: 'th01', pose: pose(292, 16, 0.5), support: 'bench' });
  place(w, 'condenser01', 'bench', 1);
  cmd08(w, { type: 'setCondenserWater', on: false });
  pourAll(w, 'rf', 'sf', 130);
  // Lavado con agua: el éster de isoamilo flota (ISO); el salicilato de metilo queda abajo (MS).
  cmd08(w, { type: 'squeezeWash', targetId: 'sf', ml: R === 'MS' ? 15 : 10 });
  shakeAndVent(w, 2);
  if (R === 'ISO') drainBottom(w, 'bkAq');
  // Bicarbonato: primero sin tapón y girando (el CO₂ escapa), luego tapado con venteo.
  pourTo(w, 'btNaHCO3', 'cyl25', 20);
  cmd08(w, { type: 'setCap', vesselId: 'btNaHCO3', capped: true });
  pourAll(w, 'cyl25', 'sf');
  cmd08(w, { type: 'setStir', vesselId: 'sf', motion01: 0.5 });
  run08(w, 40);
  cmd08(w, { type: 'setStir', vesselId: 'sf', motion01: 0 });
  shakeAndVent(w, 3);
  if (R === 'ISO') {
    drainBottom(w, 'bkAq');
    drainAll(w, 'erDry');
  } else {
    drainBottom(w, 'erDry');
    drainAll(w, 'bkAq');
  }
  // Secado con Na₂SO₄ anhidro (capacidad finita).
  spoon(w, 'jarNa2SO4', 'erDry');
  spoon(w, 'jarNa2SO4', 'erDry');
  cmd08(w, { type: 'setCap', vesselId: 'jarNa2SO4', capped: true });
  cmd08(w, { type: 'setStir', vesselId: 'erDry', motion01: 0.5 });
  run08(w, 90);
  cmd08(w, { type: 'setStir', vesselId: 'erDry', motion01: 0 });
  pourAll(w, 'erDry', 'fracPot', 130);
  // Vial tarado: se pesa vacío, recoge la fracción y se pesa lleno.
  res.supportMass = weigh(w, 'vialP', 'frac01', 2);
  const [lo, hi] = ROUTES08[R].cut!;
  cmd08(w, { type: 'setFractionCut', loC: lo, hiC: hi });
  cmd08(w, { type: 'runFractions' });
  run08(w, 62);
  res.productMass = weigh(w, 'vialP', 'bench');
  cmd08(w, { type: 'dispose', vesselId: 'bkAq', targetId: 'wasteAq' });
}

export interface AsaOptions {
  /** Agua de más (mL, piseta) antes de enfriar (ORG26). */
  extraWaterMl?: number;
  /** Filtrar sin agua ni hielo, con la mezcla tibia (ORG27/ORG28). */
  noQuench?: boolean;
  /** Sin baño de hielo: filtrar a temperatura ambiente (ORG28). */
  noIce?: boolean;
  paper?: 'fpFine' | 'fpCoarse';
  seal?: boolean;
  /** Pesar sin pasar por la estufa (ORG31) o recién salido de ella (ORG32). */
  skipOven?: boolean;
  weighHot?: boolean;
}

/** Aislamiento de la aspirina: agua solo con la mezcla tibia, hielo, filtración al vacío, lavado frío y estufa. */
export function isolateASA(w: P08World, res: IdealResult, o: AsaOptions = {}) {
  const paper = o.paper ?? 'fpFine';
  cmd08(w, { type: 'setPose', id: 'th01', pose: pose(292, 16, 0.5), support: 'bench' });
  cmd08(w, { type: 'useTongs', on: true });
  place(w, 'rf', 'cork01', 1.2);
  for (let i = 0; i < 400 && w.vessels.rf.tempC > 45; i++) run08(w, 5);
  cmd08(w, { type: 'useTongs', on: false });
  // Papel pesado seco antes de usarlo.
  res.supportMass = weigh(w, paper, 'bench');
  if (!o.noQuench) {
    // Agua helada sobre la mezcla (ya sin riesgo), luego el balón al hielo para cristalizar.
    pourAll(w, 'bkIce', 'rf', 130);
    if (o.extraWaterMl) cmd08(w, { type: 'squeezeWash', targetId: 'rf', ml: o.extraWaterMl });
    if (!o.noIce) {
      place(w, 'rf', 'ice01', 1.2);
      cmd08(w, { type: 'setStir', vesselId: 'rf', motion01: 0.4 });
      for (let i = 0; i < 400 && w.vessels.rf.tempC > 4; i++) run08(w, 5);
      run08(w, 120);
    } else {
      cmd08(w, { type: 'setStir', vesselId: 'rf', motion01: 0.4 });
      run08(w, 240);
    }
    cmd08(w, { type: 'setStir', vesselId: 'rf', motion01: 0 });
  }
  // Filtración al vacío con el Büchner sellado.
  place(w, paper, 'buchner', 16);
  if (o.seal !== false) cmd08(w, { type: 'sealBuchner', on: true });
  cmd08(w, { type: 'setVacuum', on: true });
  cmd08(w, { type: 'useTongs', on: true });
  cmd08(w, { type: 'dispose', vesselId: 'rf', targetId: 'buchner' });
  cmd08(w, { type: 'useTongs', on: false });
  run08(w, 30);
  cmd08(w, { type: 'squeezeWash', targetId: 'buchner', ml: 4 });
  run08(w, 60);
  cmd08(w, { type: 'setVacuum', on: false });
  if (!o.skipOven) {
    // Estufa y enfriado antes de pesar.
    place(w, paper, 'oven01', 4);
    cmd08(w, { type: 'setOven', on: true });
    run08(w, 900);
    cmd08(w, { type: 'setOven', on: false });
    place(w, paper, 'bench', 0);
    if (!o.weighHot) for (let i = 0; i < 400 && w.vessels[paper].tempC > 28; i++) run08(w, 5);
  } else place(w, paper, 'bench', 0);
  res.productMass = weigh(w, paper, 'bench');
  run08(w, 30);
  res.masses.push(weigh(w, paper, 'bench'));
  cmd08(w, { type: 'dispose', vesselId: 'kitasato', targetId: 'wasteAcid' });
}

/** Ensayos de calidad: pureza (todas), densidad (líquidos) o intervalo de fusión (ASA). */
export function analyze(w: P08World, res: IdealResult) {
  const src = w.route === 'ASA' ? 'fpFine' : 'vialP';
  for (const method of (w.route === 'ASA' ? ['purity', 'mp'] : ['purity', 'density']) as Array<'purity' | 'mp' | 'density'>) {
    cmd08(w, { type: 'takeSample', sourceId: src });
    cmd08(w, { type: 'requestAnalysis', method });
    run08(w, method === 'mp' ? 46 : 21);
    res.analyses.push(w.readingOrder[w.readingOrder.length - 1]);
  }
}

const fmt = (x: number, d = 4) => x.toFixed(d).replace('.', ',');
const ANSWER = 'Respuesta argumentada con las lecturas registradas del intento y sus límites de interpretación.';

/** Cuadro A con las cantidades PLANEADAS (antes de mezclar): ecuación, limitante y máximo teórico. */
export function predict(w: P08World, nb: P08Notebook) {
  const R = w.route;
  const A = nb.tableA;
  A.equation = R === 'ISO' ? 'C5H12O + C2H4O2 ⇌ C7H14O2 + H2O' : R === 'ASA' ? 'C7H6O3 + C4H6O3 → C9H8O4 + C2H4O2' : 'C7H6O3 + CH4O ⇌ C8H8O3 + H2O';
  A.reactionType = R === 'ASA' ? 'acetylation' : 'fischer';
  A.functionalGroup = R === 'ASA' ? 'phenolHydroxyl' : 'carboxyl';
  for (const s of ROUTES08[R].suggested) {
    const row = A.reagents.find((r) => r.species === s.species)!;
    if (s.unit === 'drops') continue;
    row.amount = fmt(s.amount, 2);
    row.unit = s.unit;
    row.purity = fmt(declaredPurity(w, s.species), 3);
    row.coefficient = '1';
    row.moles = fmt(rowMoles(row), 6);
  }
  const plan = plannedLimiting(nb)!;
  A.limiting = plan.limiting;
  A.theoreticalG = fmt(plan.theoreticalG, 3);
  A.prediction = 'El limitante fija la masa máxima; la pureza declarada del frasco se usa en los moles.';
  A.savedAtS = w.timeS;
}

/** Actualiza el Cuadro A con lo REALMENTE dispensado (lecturas del Cuadro B). */
export function updateDispensed(w: P08World, nb: P08Notebook, res: IdealResult) {
  const R = w.route;
  const A = nb.tableA;
  const val = (id: string) => w.readings[id].value;
  const set = (sp: string, amount: number, unit: 'g' | 'mL') => {
    const row = A.reagents.find((r) => r.species === sp)!;
    row.amount = fmt(amount, 3);
    row.unit = unit;
    row.moles = fmt(rowMoles(row), 6);
  };
  if (R === 'ISO') {
    set('IAA', val(res.volumes[0]), 'mL');
    set('AcOH', val(res.volumes[1]), 'mL');
  } else {
    set('SA', val(res.masses[0]) - val(res.masses[1]), 'g');
    set(R === 'ASA' ? 'AA' : 'MeOH', val(res.volumes[0]), 'mL');
  }
  const plan = plannedLimiting(nb)!;
  A.limiting = plan.limiting;
  A.theoreticalG = fmt(plan.theoreticalG, 3);
}

/** Libreta completa coherente con las lecturas propias del intento. */
export function fillNotebook08(w: P08World, nb: P08Notebook, res: IdealResult) {
  const B = nb.tableB.rows;
  const imp = (e: Entry, id: string | undefined) => {
    if (!id) return;
    e.readingId = id;
    e.value = String(w.readings[id].value).replace('.', ',');
    e.attemptId = nb.attemptId || undefined;
  };
  imp(B.massEmpty, res.masses[0]);
  imp(B.massReagent1, res.masses[1]);
  imp(B.massReagent2, res.masses[2]);
  imp(B.vol1, res.volumes[0]);
  imp(B.vol2, res.volumes[1]);
  imp(B.temp1, res.temps[0]);
  imp(B.temp2, res.temps[res.temps.length - 1]);
  nb.tableB.heatingS = String(ROUTES08[w.route].heatS);
  nb.tableB.phases = w.route === 'ASA' ? 'Sólido en el papel; filtrado acuoso al residuo ácido.' : 'Fase orgánica con el éster; acuosa al residuo acuoso.';
  nb.tableB.waste = 'Residuos segregados por fase.';
  const C = nb.tableC;
  imp(C.grossMass, res.productMass);
  imp(C.supportMass, res.supportMass);
  const iso = w.readings[res.productMass!].value - w.readings[res.supportMass!].value;
  C.isolatedMass.value = fmt(iso, 3);
  C.isolatedMass.uncertainty = '0,003';
  C.technique = w.route === 'ASA' ? 'mp' : 'density';
  imp(C.analysis, res.analyses[1]);
  if (w.route !== 'ASA') {
    imp(C.density, res.analyses[1]);
    C.densityTempC = '25,0';
  }
  imp(C.purity, res.analyses[0]);
  const pur = w.readings[res.analyses[0]].value / 100;
  C.purity.value = fmt(pur, 3);
  C.purity.uncertainty = '0,01';
  C.theoreticalG = nb.tableA.theoreticalG;
  const th = parseNum(C.theoreticalG);
  C.apparentYield = fmt((100 * iso) / th, 2);
  C.correctedYield = fmt((100 * iso * pur) / th, 2);
  C.balance = 'El producto no recuperado quedó en el residuo, el embudo y el filtrado.';
  C.losses = [ANSWER, ANSWER, ANSWER];
  for (const q of QUESTIONS) nb.analysis[q] = ANSWER;
  nb.conclusion = ANSWER;
}

/** Ruta ideal + libreta coherente; `resume` (opcional) simula interrupciones entre etapas. */
export function idealAttempt(route: RouteId, seed = 8008, scenarios: P08Scenario[] = [], resume: (w: P08World) => P08World = (w) => w, start?: P08World) {
  let w = start ?? world08({ route, seed, scenarios });
  const nb = emptyP08Notebook(route, `p8-${seed.toString(36)}-test`);
  const res: IdealResult = { masses: [], volumes: [], temps: [], analyses: [] };
  ppe08(w);
  inspectAll(w);
  predict(w, nb);
  dose(w, res);
  w = resume(w);
  updateDispensed(w, nb, res);
  res.temps = heat(w, ROUTES08[route].heatS);
  w = resume(w);
  if (route === 'ASA') isolateASA(w, res);
  else {
    coolInIce(w);
    w = resume(w);
    isolateLiquid(w, res);
  }
  analyze(w, res);
  fillNotebook08(w, nb, res);
  return { w, nb, res };
}
