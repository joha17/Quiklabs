/**
 * B05 — los errores atribuibles (§9), los del microscopio compartido (MIC, BIO5-21) y la incidencia técnica B05RES:
 * cada fixture ejecuta el gesto real y comprueba la CONSECUENCIA en el estado (volúmenes, gas, especies, tubos,
 * lecturas, bloqueos) o en la libreta, no solo el aviso. B05RES no deja ningún `err:*`.
 */
import { describe, expect, it } from 'vitest';
import type { EnzWorld } from '../../simulation/enz-world/types';
import { conservedEnz, dispatchEnz } from '../../simulation/enz-world/world';
import { catalaseOf, glucosylOf } from '../../simulation/enz-world/chemistry';
import { microscopeView } from '../../simulation/optical-world/world';
import { BURNER_POS_B05 } from '../../simulation/enz-world/geometry';
import { SC_B05 } from '../../simulation/enz-world/scenarios';
import { SIMULATED_ERRORS_B05, type B05Scenario } from '../../practices/practice-b05/error-scenarios';
import { notebookIssuesB05 } from '../../practices/practice-b05/rubric';
import { rateExpected } from '../../practices/practice-b05/expected-results';
import { CODE_MAP_B05 } from '../../practices/practice-b05/params';
import type { B05Notebook } from '../../practices/practice-b05/notebook';
import {
  catalaseTube, cmdE, errKeysB05, focusE, gasSeries, idealAttemptB05, measureWater, phTube, pipette, placeE, potatoMountE, pourTo, ppeB05,
  prepP1, prepP2, prepP3, runE, stirOn, toObjectiveE, toStageE, weighPowder, worldB05,
} from '../helpersB05';

const err = (w: EnzWorld, code: string) => w.evidence[`err:${code}`] ?? 0;
const drop = (w: EnzWorld, d: string, target: string, n = 1, tipContact = false) => {
  for (let i = 0; i < n; i++) cmdE(w, { type: 'squeezeDropper', dispenserId: d, targetId: target, force01: 0.5, dxCm: 0, dyCm: 0, tipContact } as never);
};
const base = (scenarios: B05Scenario[] = []) => {
  const w = worldB05({ scenarios });
  ppeB05(w);
  return w;
};
/** Extracto de hígado (P2) agitándose en la placa 2. */
const withP2 = (scenarios: B05Scenario[] = [], opts: Parameters<typeof prepP2>[1] = {}) => {
  const w = base(scenarios);
  prepP2(w, opts);
  return w;
};
/** P1 y P3 listos (P3 fuera de la placa) y el baño 1 estabilizado. */
const withAmyBatches = (scenarios: B05Scenario[] = []) => {
  const w = base(scenarios);
  cmdE(w, { type: 'setBath', bathId: 'wb1', on: true });
  cmdE(w, { type: 'setBath', bathId: 'wb2', on: true });
  prepP1(w);
  prepP3(w);
  cmdE(w, { type: 'setStir', plateId: 'hp2', rpm: 0 });
  cmdE(w, { type: 'removeStirBar', barId: 'sb2' });
  placeE(w, 'bk2', 'bench', { x: 384, y: 60 });
  runE(w, 300);
  return w;
};
/** Incubación t9 (almidón + agua en el baño 1) a la que se agrega la amilasa con el cronómetro 2 en cero. */
const incubation = (w: EnzWorld, opts: { starch?: string; amylase?: boolean; starchMl?: number; clockFirst?: number } = {}) => {
  cmdE(w, { type: 'labelTube', tubeId: 't9', label: 'amy' });
  if (opts.starchMl !== 0) pipette(w, 'p1', opts.starch ?? 'bk1', 't9', opts.starchMl ?? 1);
  pipette(w, 'p5', 'bW', 't9', 3);
  cmdE(w, { type: 'tongs', tubeId: 't9', to: 'wb1' });
  runE(w, 60);
  cmdE(w, { type: 'clock', clockId: 'sw2', action: 'reset' });
  cmdE(w, { type: 'clock', clockId: 'sw2', action: 'start' });
  if (opts.clockFirst) runE(w, opts.clockFirst);
  if (opts.amylase !== false) pipette(w, 'p1', 'bk2', 't9', 1);
  cmdE(w, { type: 'shake', targetId: 't9', strength01: 0.5 });
  return w;
};
const aliquot = (w: EnzWorld, tube: string, label: string, ml = 0.5) => {
  cmdE(w, { type: 'labelTube', tubeId: tube, label });
  pipette(w, 'p1', 't9', tube, ml);
};
/** Cubeta con matriz ADH en el fotómetro (módulo avanzado). */
const adhCuvette = (w: EnzWorld, id: string, parts: Record<string, number>) => {
  for (const [src, ml] of Object.entries(parts)) pipette(w, 'p1', src, id, ml);
  placeE(w, id, 'uv');
};
const ADH: B05Scenario[] = [SC_B05.ADH_COMPETITOR];
const read = (w: EnzWorld, instrument: string, targetId: string, eyeDeg?: number) =>
  w.enz.readings[cmdE(w, { type: 'readInstrument', instrument, targetId, eyeDeg } as never).id!];

// Intento ideal compartido por las fixtures de la libreta (se clona en cada una).
let idealCache: ReturnType<typeof idealAttemptB05> | null = null;
let leakCache: ReturnType<typeof idealAttemptB05> | null = null;
const ideal = () => {
  idealCache ??= idealAttemptB05();
  return { w: structuredClone(idealCache.w), nb: structuredClone(idealCache.nb) };
};
const leaky = () => {
  leakCache ??= idealAttemptB05(5505, [SC_B05.COLLECTOR_LEAK]);
  return { w: structuredClone(leakCache.w), nb: structuredClone(leakCache.nb) };
};
const nbIssue = (w: EnzWorld, nb: B05Notebook, code: string) => expect(notebookIssuesB05(w, nb)).toContain(`nb:${code}`);

const FIXTURES: Record<string, () => void> = {
  // ── Montaje ──
  M01: () => {
    const w = withP2();
    cmdE(w, { type: 'labelTube', tubeId: 't1', label: 'cat-blank' });
    pipette(w, 'p5', 'bk3', 't1', 2);
    cmdE(w, { type: 'labelTube', tubeId: 't2', label: 'cat-base' });
    pipette(w, 'p5', 'bW', 't2', 2);
    cmdE(w, { type: 'setCollector', tubeId: 't2', seal01: 1 });
    cmdE(w, { type: 'clock', clockId: 'sw1', action: 'start' });
    pipette(w, 'p10', 'hp', 't2', 10);
    pipette(w, 'p10', 'hp', 't1', 10);
    runE(w, 20);
    expect(read(w, 'collector', 'gc').value).toBe(0);
    expect(err(w, 'M01')).toBe(1);
    expect(catalaseOf(w.enz.vessels.t2.s)).toBe(0);
  },
  M02: () => {
    const { w, nb } = ideal();
    nb.controls.blank = '';
    nbIssue(w, nb, 'M02');
  },
  M03: () => {
    const { w, nb } = ideal();
    nb.controls.blank = nb.controls.active;
    nbIssue(w, nb, 'M03');
  },
  M04: () => {
    const w = base();
    pourTo(w, 'bW', 'g10', 5);
    cmdE(w, { type: 'startPour', sourceId: 'g10', targetId: 't1', tiltDeg: 60 });
    runE(w, 4);
    expect(err(w, 'M04')).toBe(1);
    expect(w.enz.vessels.t1.volumeMl).toBeGreaterThan(0);
  },
  M05: () => {
    const w = base();
    cmdE(w, { type: 'aspirate', toolId: 'p5', sourceId: 'bW', volumeMl: 2, speed01: 1 });
    expect(err(w, 'M05')).toBe(1);
    expect(w.enz.vessels.p5.volumeMl).toBeLessThan(2 - 1e-3);
  },
  M06: () => {
    const w = withP2();
    // Primera alícuota con el lote agitado; luego se apaga la agitación y el extracto sedimenta.
    pipette(w, 'p5', 'bk3', 't2', 2);
    cmdE(w, { type: 'setStir', plateId: 'hp2', rpm: 0 });
    runE(w, 600);
    const before = w.enz.vessels.bk3.homog01;
    expect(before).toBeLessThan(0.85);
    pipette(w, 'p5', 'bk3', 't1', 2);
    expect(err(w, 'M06')).toBe(1);
    // La alícuota lleva menos tejido que la fracción de volumen tomada.
    const share = 2 / (w.enz.vessels.bk3.volumeMl + 2);
    expect(w.enz.vessels.t1.s.tissueMg).toBeLessThan(share * (w.enz.vessels.bk3.s.tissueMg + w.enz.vessels.t1.s.tissueMg));
  },
  M07: () => {
    const w = base();
    pipette(w, 'p5', 'bW', 't11', 2);
    pipette(w, 'p5', 'bW', 't12', 2);
    drop(w, 'dL', 't11', 1, true);
    drop(w, 'dL', 't12');
    expect(err(w, 'M07')).toBe(1);
    // La punta arrastró parte del tubo anterior al siguiente.
    expect(w.enz.vessels.t11.volumeMl).toBeLessThan(2 + w.params.enz!.dropMl - 0.005);
  },
  M08: () => {
    const w = base();
    drop(w, 'dL', 'bench');
    expect(err(w, 'M08')).toBe(1);
    expect(w.enz.vessels.spill.volumeMl).toBeGreaterThan(0);
  },
  M09: () => {
    const w = incubation(withAmyBatches());
    const v0 = w.enz.vessels.t9.volumeMl;
    drop(w, 'dw2', 't9');
    expect(err(w, 'M09')).toBe(1);
    expect(w.enz.vessels.t9.volumeMl).toBeGreaterThan(v0);
  },
  M10: () => {
    const w = withP2();
    pipette(w, 'p5', 'bk3', 't1', 2, false);
    cmdE(w, { type: 'aspirate', toolId: 'p5', sourceId: 'bW', volumeMl: 2 });
    expect(err(w, 'M10')).toBe(1);
    expect(catalaseOf(w.enz.vessels.p5.s)).toBeGreaterThan(0);
  },
  M11: () => {
    const w = base();
    pourTo(w, 'bW', 'g25', 20);
    const r = read(w, 'scale', 'g25', 25);
    expect(err(w, 'M11')).toBe(1);
    expect(r.biased).toBe(true);
    expect(Math.abs(r.value - w.enz.vessels.g25.volumeMl)).toBeGreaterThan(0.4);
  },
  M12: () => {
    const w = worldB05();
    const r = dispatchEnz(w, { type: 'tare', balanceId: 'bal' });
    expect(r.ok).toBe(false);
    expect(err(w, 'M12')).toBe(1);
  },
  // ── Catalasa ──
  C01: () => {
    const w = withP2();
    catalaseTube(w, 't1', 'cat-base');
    runE(w, 60);
    catalaseTube(w, 't4', 'cat-acid', { extractMl: 1 });
    expect(err(w, 'C01')).toBe(1);
    expect(w.enz.tubes.t4.tissueAtStartMg!).toBeLessThan(0.85 * w.enz.tubes.t1.tissueAtStartMg!);
  },
  C02: () => {
    const w = withP2([SC_B05.OTHER_LOT], { source: 'livB' });
    catalaseTube(w, 't1', 'cat-base');
    expect(err(w, 'C02')).toBe(1);
    expect(w.enz.vessels.t1.tags).toContain('livB');
  },
  C03: () => {
    const ref = withP2();
    const w = withP2([SC_B05.PREHEATED], { source: 'livH' });
    const active = (x: EnzWorld) => x.enz.vessels.bk3.s.catAct + x.enz.vessels.bk3.s.catTissue;
    expect(active(w)).toBeLessThan(0.9 * active(ref));
    catalaseTube(w, 't1', 'cat-base');
    expect(err(w, 'C03')).toBe(1);
  },
  C04: () => {
    const w = withP2();
    cmdE(w, { type: 'labelTube', tubeId: 't1', label: 'cat-base' });
    pipette(w, 'p5', 'bk3', 't1', 2);
    cmdE(w, { type: 'setCollector', tubeId: 't1', seal01: 1 });
    cmdE(w, { type: 'clock', clockId: 'sw1', action: 'start' });
    const before = w.enz.vessels.hp.s.h2o2 / w.enz.vessels.hp.volumeMl;
    pipette(w, 'p10', 'hpOld', 't1', 10);
    expect(err(w, 'C04')).toBe(1);
    expect(w.enz.vessels.hpOld.s.h2o2 / w.enz.vessels.hpOld.volumeMl).toBeLessThan(before);
  },
  C05: () => {
    const w = withP2();
    cmdE(w, { type: 'labelTube', tubeId: 't1', label: 'cat-base' });
    pipette(w, 'p5', 'bk3', 't1', 2);
    cmdE(w, { type: 'setCollector', tubeId: 't1', seal01: 1 });
    pipette(w, 'p10', 'hp', 't1', 10);
    runE(w, 10);
    // Cuando el reloj marca 0 s el colector ya recibió gas: se perdió el tramo inicial.
    const early = w.enz.collector.gasMmol;
    cmdE(w, { type: 'clock', clockId: 'sw1', action: 'start' });
    expect(err(w, 'C05')).toBe(1);
    expect(early).toBeGreaterThan(0);
  },
  C06: () => {
    const w = withP2();
    cmdE(w, { type: 'labelTube', tubeId: 't1', label: 'cat-base' });
    pipette(w, 'p5', 'bk3', 't1', 2);
    cmdE(w, { type: 'clock', clockId: 'sw1', action: 'start' });
    pipette(w, 'p10', 'hp', 't1', 10);
    runE(w, 60);
    cmdE(w, { type: 'shake', targetId: 't1', strength01: 0.5 });
    expect(err(w, 'C06')).toBe(1);
    expect(w.enz.collector.gasMmol).toBe(0);
    expect(w.enz.o2.vented).toBeGreaterThan(0);
  },
  C07: () => {
    const ref = withP2();
    catalaseTube(ref, 't1', 'cat-base');
    runE(ref, 60);
    const w = withP2();
    cmdE(w, { type: 'labelTube', tubeId: 't1', label: 'cat-base' });
    pipette(w, 'p5', 'bk3', 't1', 2);
    cmdE(w, { type: 'setCollector', tubeId: 't1', seal01: 0.4 });
    cmdE(w, { type: 'clock', clockId: 'sw1', action: 'start' });
    pipette(w, 'p10', 'hp', 't1', 10);
    runE(w, 60);
    expect(err(w, 'C07')).toBe(1);
    expect(w.enz.collector.gasMmol).toBeLessThan(0.8 * ref.enz.collector.gasMmol);
  },
  C08: () => {
    const { w, nb } = ideal();
    const foam = cmdE(w, { type: 'readInstrument', instrument: 'foam', targetId: 't1' } as never).id!;
    nb.gas[0].readingIds[0] = foam;
    nbIssue(w, nb, 'C08');
  },
  C09: () => {
    const w = withP2();
    catalaseTube(w, 't1', 'cat-base');
    cmdE(w, { type: 'shake', targetId: 't1', strength01: 0.2 });
    catalaseTube(w, 't4', 'cat-acid');
    cmdE(w, { type: 'shake', targetId: 't4', strength01: 0.9 });
    expect(err(w, 'C09')).toBe(1);
    expect(w.enz.tubes.t4.shakes[0] - w.enz.tubes.t1.shakes[0]).toBeGreaterThan(0.3);
  },
  C10: () => {
    const w = withP2();
    cmdE(w, { type: 'labelTube', tubeId: 't1', label: 'cat-base' });
    pipette(w, 'p5', 'bk3', 't1', 2);
    pipette(w, 'p10', 'hp', 't1', 10);
    cmdE(w, { type: 'stopperTube', tubeId: 't1', closed: true });
    for (let i = 0; i < 600 && !err(w, 'C10'); i++) {
      runE(w, 1);
      dispatchEnz(w, { type: 'shake', targetId: 't1', strength01: 0.5 });
    }
    expect(err(w, 'C10')).toBe(1);
    expect(w.safety.block?.code).toBe('PRESSURE');
    expect(w.enz.o2.vented).toBeGreaterThan(0);
  },
  C11: () => {
    const w = withP2();
    catalaseTube(w, 't1', 'cat-base');
    runE(w, 20);
    pipette(w, 'p10', 'hp', 't1', 5);
    expect(err(w, 'C11')).toBe(1);
    expect(w.enz.tubes.t1.h2o2Adds).toBe(2);
  },
  C12: () => {
    const w = withP2();
    cmdE(w, { type: 'startPour', sourceId: 'bk3', targetId: 'p5', tiltDeg: 70 });
    runE(w, 1);
    cmdE(w, { type: 'stopPour', sourceId: 'bk3' });
    expect(err(w, 'C12')).toBe(1);
    expect(catalaseOf(w.enz.vessels.spill.s)).toBeGreaterThan(0);
  },
  C13: () => {
    const { w, nb } = ideal();
    const row = nb.gas.find((g) => g.label === nb.rate.label)!;
    row.readingIds = [row.readingIds[1], null, null, null];
    nbIssue(w, nb, 'C13');
  },
  C14: () => {
    const { w, nb } = ideal();
    nb.rate.ratePerG = '';
    nbIssue(w, nb, 'C14');
  },
  C15: () => {
    // Varios tubos seguidos sin vaciar el colector: el gas acumulado supera los 50 mL de la escala.
    const w = withP2([SC_B05.FAST_CATALASE]);
    cmdE(w, { type: 'resetCollector' });
    for (const t of ['t1', 't2', 't3', 't4', 't5', 't6']) {
      if (err(w, 'C15')) break;
      cmdE(w, { type: 'labelTube', tubeId: t, label: 'cat-base' });
      pipette(w, 'p5', 'bk3', t, 2);
      cmdE(w, { type: 'setCollector', tubeId: t, seal01: 1 });
      pipette(w, 'p10', 'hp', t, 10);
      for (let k = 0; k < 18; k++) {
        runE(w, 10);
        cmdE(w, { type: 'shake', targetId: t, strength01: 0.5 });
      }
    }
    expect(err(w, 'C15')).toBe(1);
    const r = read(w, 'collector', 'gc');
    expect(r.value).toBeLessThanOrEqual(50);
    expect(r.quality).toBe('full');
    expect(w.enz.o2.vented).toBeGreaterThan(0);
  },
  C16: () => {
    const w = withP2();
    catalaseTube(w, 't1', 'cat-base');
    runE(w, 10);
    const v0 = w.enz.vessels.t1.volumeMl;
    pipette(w, 'p5', 't1', 't5', 2);
    expect(err(w, 'C16')).toBe(1);
    expect(w.enz.vessels.t1.volumeMl).toBeLessThan(v0 - 1.5);
  },
  // ── Temperatura y pH ──
  T01: () => {
    const w = withP2();
    cmdE(w, { type: 'setBath', bathId: 'wb1', on: true });
    catalaseTube(w, 't1', 'cat-base', { before: () => cmdE(w, { type: 'tongs', tubeId: 't1', to: 'wb1' }) });
    expect(err(w, 'T01')).toBe(1);
    expect(Math.abs(w.enz.baths.wb1.tK - w.enz.baths.wb1.setK)).toBeGreaterThan(0.5);
  },
  T02: () => {
    const w = base();
    cmdE(w, { type: 'setBath', bathId: 'wb1', on: true });
    runE(w, 600);
    pipette(w, 'p5', 'bW', 't1', 4);
    pipette(w, 'p5', 'bW', 't2', 4);
    cmdE(w, { type: 'tongs', tubeId: 't1', to: 'wb1', depth01: 0.3 });
    cmdE(w, { type: 'tongs', tubeId: 't2', to: 'wb1', depth01: 1 });
    runE(w, 120);
    expect(err(w, 'T02')).toBe(1);
    expect(w.enz.vessels.t1.tK).toBeLessThan(w.enz.vessels.t2.tK - 0.5);
  },
  T03: () => {
    const { w, nb } = ideal();
    nb.conditions[0].tempReadingId = read(w, 'thermo', 'wb1').id;
    nbIssue(w, nb, 'T03');
  },
  T04: () => {
    const w = withP2();
    cmdE(w, { type: 'setBath', bathId: 'wb2', on: true });
    runE(w, 900);
    cmdE(w, { type: 'labelTube', tubeId: 't1', label: 'cat-base' });
    pipette(w, 'p5', 'bk3', 't1', 2);
    const cat0 = catalaseOf(w.enz.vessels.t1.s);
    cmdE(w, { type: 'tongs', tubeId: 't1', to: 'wb2' });
    runE(w, 240);
    expect(err(w, 'T04')).toBe(1);
    expect(w.enz.vessels.t1.s.catAct + w.enz.vessels.t1.s.catTissue).toBeLessThan(0.5 * cat0);
  },
  T05: () => {
    const { w, nb } = ideal();
    nb.factors.recovered = 'yes';
    nbIssue(w, nb, 'T05');
  },
  T06: () => {
    const w = withP2();
    cmdE(w, { type: 'labelTube', tubeId: 't1', label: 'cat-base' });
    pipette(w, 'p5', 'bk3', 't1', 2);
    drop(w, 'dH', 't1');
    expect(err(w, 'T06')).toBe(1);
    expect(w.enz.vessels.t1.s.acid).toBeGreaterThan(0);
  },
  T07: () => {
    const w = withP2();
    cmdE(w, { type: 'labelTube', tubeId: 't1', label: 'cat-base' });
    pipette(w, 'p5', 'bk3', 't1', 2);
    drop(w, 'dN', 't1');
    expect(err(w, 'T07')).toBe(1);
    expect(w.enz.tubes.t1.drops.base).toBe(1);
  },
  T08: () => {
    const w = withP2();
    pipette(w, 'p5', 'bk3', 't1', 2);
    pipette(w, 'p5', 'bW', 't2', 2);
    drop(w, 'dH', 't2', 3);
    cmdE(w, { type: 'dipStrip', targetId: 't2' });
    const r = cmdE(w, { type: 'dipStrip', targetId: 't1', reuse: true });
    expect(err(w, 'T08')).toBe(1);
    expect(w.enz.readings[r.id!].quality).toBe('interfered');
  },
  T09: () => {
    const w = withP2();
    cmdE(w, { type: 'labelTube', tubeId: 't4', label: 'cat-acid' });
    pipette(w, 'p5', 'bk3', 't4', 2);
    drop(w, 'dH', 't4', w.params.enz!.acidDropsAssigned);
    cmdE(w, { type: 'setCollector', tubeId: 't4', seal01: 1 });
    cmdE(w, { type: 'clock', clockId: 'sw1', action: 'start' });
    pipette(w, 'p10', 'hp', 't4', 10);
    expect(err(w, 'T09')).toBe(1);
  },
  T10: () => {
    const w = withP2();
    catalaseTube(w, 't1', 'cat-base');
    runE(w, 60);
    cmdE(w, { type: 'setBath', bathId: 'wb1', on: true });
    runE(w, 600);
    catalaseTube(w, 't4', 'cat-acid', {
      before: () => {
        drop(w, 'dH', 't4', w.params.enz!.acidDropsAssigned);
        cmdE(w, { type: 'shake', targetId: 't4', strength01: 0.5 });
        cmdE(w, { type: 'tongs', tubeId: 't4', to: 'wb1' });
        runE(w, 180);
      },
    });
    runE(w, 60);
    const nb = structuredClone(ideal().nb);
    nb.factors.attribution = 'ph';
    nbIssue(w, nb, 'T10');
  },
  T11: () => {
    const w = incubation(withAmyBatches());
    runE(w, 60);
    cmdE(w, { type: 'setBath', bathId: 'wb1', on: false });
    runE(w, 300);
    expect(err(w, 'T11')).toBe(1);
    expect(w.enz.vessels.t9.tK).toBeLessThan(w.enz.baths.wb1.setK - 1);
  },
  T12: () => {
    const w = incubation(withAmyBatches());
    drop(w, 'dB', 't9');
    expect(err(w, 'T12')).toBe(1);
    expect(w.enz.vessels.t9.s.cu).toBeGreaterThan(0);
  },
  // ── Amilasa ──
  A01: () => {
    const w = incubation(withAmyBatches(), { amylase: false });
    aliquot(w, 't11', 'L0');
    expect(err(w, 'A01')).toBe(1);
    expect(w.enz.tubes.t9.contactAt).toBeNull();
  },
  A02: () => {
    const w = incubation(withAmyBatches(), { starchMl: 0 });
    aliquot(w, 't11', 'L0');
    expect(err(w, 'A02')).toBe(1);
    expect(glucosylOf(w.enz.vessels.t9.s)).toBe(0);
  },
  A03: () => {
    const ref = incubation(withAmyBatches());
    const w = incubation(withAmyBatches(), { starch: 'st1' });
    expect(err(w, 'A03')).toBe(1);
    expect(w.enz.tubes.t9.glyAtContact!).toBeLessThan(ref.enz.tubes.t9.glyAtContact!);
  },
  A04: () => {
    const w = incubation(withAmyBatches(), { clockFirst: 40 });
    expect(err(w, 'A04')).toBe(1);
    aliquot(w, 't11', 'L0');
    expect(w.enz.tubes.t11.sampledClockS! - w.enz.tubes.t11.sampledAfterS!).toBeGreaterThan(30);
  },
  A05: () => {
    const w = incubation(withAmyBatches());
    runE(w, 150);
    aliquot(w, 't11', 'L0');
    expect(err(w, 'A05')).toBe(1);
    expect(w.enz.tubes.t11.sampledAfterS!).toBeGreaterThan(120);
  },
  A06: () => {
    const w = incubation(withAmyBatches());
    aliquot(w, 't11', 'L0', 0.5);
    runE(w, 120);
    aliquot(w, 't12', 'L1', 1);
    expect(err(w, 'A06')).toBe(1);
    expect(w.enz.tubes.t12.aliquotMl).toBeGreaterThan(1.5 * w.enz.tubes.t11.aliquotMl);
  },
  A07: () => {
    const w = incubation(withAmyBatches());
    aliquot(w, 't11', 'L0');
    drop(w, 'dL', 't11', 3);
    drop(w, 'dB', 't11');
    expect(err(w, 'A07')).toBe(1);
    expect(w.enz.vessels.t11.s.iodine).toBeGreaterThan(0);
  },
  A08: () => {
    const { w, nb } = ideal();
    nb.amylase.rows[1].timeS = String(Number(nb.amylase.rows[1].timeS) + 180);
    nbIssue(w, nb, 'A08');
  },
  A09: () => {
    const w = incubation(withAmyBatches());
    runE(w, 600);
    const h = w.enz.vessels.t9.homog01;
    expect(h).toBeLessThan(0.6);
    aliquot(w, 't11', 'L0');
    expect(err(w, 'A09')).toBe(1);
  },
  A10: () => {
    const w = incubation(withAmyBatches());
    aliquot(w, 't11', 'L0');
    drop(w, 'dL', 't11', 1);
    read(w, 'eye', 't11');
    expect(err(w, 'A10')).toBe(1);
    expect(w.enz.tubes.t11.drops.lugol).toBe(1);
  },
  A11: () => {
    const w = incubation(withAmyBatches());
    aliquot(w, 't11', 'L0');
    drop(w, 'dL', 't11', 9);
    read(w, 'eye', 't11');
    expect(err(w, 'A11')).toBe(1);
    expect(w.enz.tubes.t11.drops.lugol).toBe(9);
  },
  A12: () => {
    const w = incubation(withAmyBatches());
    runE(w, 600);
    cmdE(w, { type: 'shake', targetId: 't9', strength01: 0.5 });
    aliquot(w, 't16', 'B3');
    drop(w, 'dB', 't16');
    const r = read(w, 'eye', 't16');
    expect(err(w, 'A12')).toBe(1);
    expect(r.value).toBeLessThan(0.2);
  },
  A13: () => {
    const w = incubation(withAmyBatches());
    runE(w, 600);
    cmdE(w, { type: 'shake', targetId: 't9', strength01: 0.5 });
    aliquot(w, 't16', 'B3');
    drop(w, 'dB', 't16');
    cmdE(w, { type: 'tongs', tubeId: 't16', to: 'wb2' });
    runE(w, 900);
    cmdE(w, { type: 'tongs', tubeId: 't16', to: 'rack' });
    const r = read(w, 'eye', 't16');
    expect(err(w, 'A13')).toBe(1);
    expect(r.quality).toContain('altered');
  },
  A14: () => {
    const w = incubation(withAmyBatches());
    aliquot(w, 't11', 'L0');
    const id = (drop(w, 'dL', 't11', 3), read(w, 'eye', 't11').id);
    const nb = structuredClone(ideal().nb);
    nb.amylase.rows = [{ label: 'L0', readingId: id, timeS: '0' }];
    nbIssue(w, nb, 'A14');
  },
  A15: () => {
    const { w, nb } = ideal();
    nb.amylase.benedictMeans = 'glucose';
    nbIssue(w, nb, 'A15');
  },
  A16: () => {
    const { w, nb } = ideal();
    nb.amylase.lugolNegative = 'complete';
    nbIssue(w, nb, 'A16');
  },
  // ── ADH (módulo avanzado) ──
  H01: () => {
    const w = base(ADH);
    adhCuvette(w, 'cq', { eth: 1, adh: 0.5 });
    cmdE(w, { type: 'setUVBlank', cuvetteId: 'cq' });
    runE(w, 60);
    const r = read(w, 'uv', 'cq');
    expect(err(w, 'H01')).toBe(1);
    expect(w.enz.vessels.cq.s.nadh).toBe(0);
    expect(Math.abs(r.value)).toBeLessThan(0.01);
  },
  H02: () => {
    const w = base(ADH);
    adhCuvette(w, 'cq', { nad: 0.5, eth: 1, adh: 0.5 });
    runE(w, 30);
    const r = read(w, 'uv', 'cq');
    expect(err(w, 'H02')).toBe(1);
    expect(r.quality).toBe('raw');
    expect(r.biased).toBe(true);
  },
  H03: () => {
    const w = base(ADH);
    adhCuvette(w, 'cp', { nad: 0.5, eth: 1 });
    const r = dispatchEnz(w, { type: 'setUVBlank', cuvetteId: 'cp' });
    expect(r.ok).toBe(false);
    expect(err(w, 'H03')).toBe(1);
    expect(w.enz.uv.blankA).toBeNull();
  },
  H04: () => {
    const w = base(ADH);
    adhCuvette(w, 'cs', { nad: 0.5, eth: 1 });
    cmdE(w, { type: 'setUVBlank', cuvetteId: 'cs' });
    pipette(w, 'p1', 'adh', 'cs', 0.5);
    runE(w, 60);
    const nb = structuredClone(ideal().nb);
    nb.adh.rows = [{ readingId: read(w, 'uv', 'cs').id }];
    nb.adh.pathCm = '1';
    nbIssue(w, nb, 'H04');
  },
  H05: () => {
    const w = base(ADH);
    adhCuvette(w, 'cq', { nad: 0.5, eth: 1, meth: 0.5 });
    cmdE(w, { type: 'setUVBlank', cuvetteId: 'cq' });
    pipette(w, 'p1', 'adh', 'cq', 0.5);
    runE(w, 30);
    read(w, 'uv', 'cq');
    expect(err(w, 'H05')).toBe(1);
    expect(w.enz.vessels.cq.s.methanol).toBeGreaterThan(1.1 * w.params.enz!.competitorMl * 0.5);
  },
  H06: () => {
    const { w, nb } = ideal();
    nb.adh.totalInhibition = 'yes';
    nbIssue(w, nb, 'H06');
  },
  H07: () => {
    const { w, nb } = ideal();
    nb.adh.fehling = 'specific';
    nbIssue(w, nb, 'H07');
  },
  H08: () => {
    const { w, nb } = ideal();
    nb.adh.iodoform = 'exact';
    nbIssue(w, nb, 'H08');
  },
  H09: () => {
    const w = base(ADH);
    adhCuvette(w, 'cq', { nad: 0.5, eth: 1, adh: 0.5 });
    adhCuvette(w, 'cs', { nad: 0.5, eth: 1, adh: 0.5 });
    cmdE(w, { type: 'setUVBlank', cuvetteId: 'cq' });
    // La segunda cubeta llega tibia del baño (la libreta compara cubetas a temperaturas distintas).
    w.enz.vessels.cs.tK = w.enz.vessels.cq.tK + 8;
    const nb = structuredClone(ideal().nb);
    nb.adh.rows = [{ readingId: read(w, 'uv', 'cq').id }, { readingId: read(w, 'uv', 'cs').id }];
    nbIssue(w, nb, 'H09');
  },
  H10: () => {
    const { w, nb } = ideal();
    nb.adh.fehling = 'nonspecific';
    nb.adh.fehlingBlank = 'notNeeded';
    nbIssue(w, nb, 'H10');
  },
  // ── Análisis ──
  N01: () => {
    const { w, nb } = ideal();
    // La serie anotada salta del 0 al minuto: la «tasa inicial» sale de la ventana 60–90 s.
    const row = nb.gas.find((g) => g.label === nb.rate.label)!;
    row.readingIds = [row.readingIds[0], ...idealCache!.res.gas[nb.rate.label].slice(4, 7)];
    nb.rate.fromS = '60';
    nb.rate.toS = '90';
    nbIssue(w, nb, 'N01');
  },
  N02: () => {
    const { w, nb } = ideal();
    nb.rate.rateMlS = String(rateExpected(w, nb)!.rateMlMin);
    nbIssue(w, nb, 'N02');
  },
  N03: () => {
    const { w, nb } = ideal();
    nb.rate.nO2Mmol = String(rateExpected(w, nb)!.nO2Mmol * 1000);
    nbIssue(w, nb, 'N03');
  },
  N04: () => {
    const { w, nb } = leaky();
    nb.rate.ventedIncluded = 'no';
    nbIssue(w, nb, 'N04');
  },
  N05: () => {
    const { w, nb } = ideal();
    nb.rate.label = 'cat-otro';
    nbIssue(w, nb, 'N05');
  },
  N06: () => {
    const { w, nb } = leaky();
    nb.rate.attribution = 'catalysis';
    nbIssue(w, nb, 'N06');
  },
  N07: () => {
    const { w, nb } = ideal();
    nb.rate.normUnit = 'mgEnzyme';
    nbIssue(w, nb, 'N07');
  },
  N08: () => {
    const { w, nb } = ideal();
    nb.rate.uncertaintyMl = '';
    nbIssue(w, nb, 'N08');
  },
  N09: () => {
    const { w, nb } = ideal();
    nb.factors.heatApparent = '1.4';
    nb.factors.recovered = 'yes';
    nbIssue(w, nb, 'N09');
  },
  N10: () => {
    const { w, nb } = ideal();
    nb.adh.inhibitionType = 'competitive';
    nbIssue(w, nb, 'N10');
  },
  N11: () => {
    const { w, nb } = ideal();
    nb.rate.nO2Mmol = String(rateExpected(w, nb)!.nO2Mmol / 1000);
    nbIssue(w, nb, 'N11');
  },
  N12: () => {
    const { w, nb } = ideal();
    nb.conditions = [];
    nbIssue(w, nb, 'N12');
  },
  // ── Seguridad ──
  S01: () => {
    const w = base(ADH);
    placeE(w, 'eth', 'bench', { x: BURNER_POS_B05.x + 5, y: BURNER_POS_B05.y });
    const r = dispatchEnz(w, { type: 'setBurner', on: true });
    expect(r.ok).toBe(false);
    expect(err(w, 'S01')).toBe(1);
    expect(w.enz.burnerLit).toBe(false);
    expect(w.safety.block?.code).toBe('IGNITION');
  },
  S02: () => {
    const w = base();
    const r = dispatchEnz(w, { type: 'aspirate', toolId: 'p1', sourceId: 'meth', volumeMl: 0.5 });
    expect(r.ok).toBe(false);
    expect(err(w, 'S02')).toBe(1);
    expect(w.enz.vessels.p1.volumeMl).toBe(0);
  },
  S03: () => {
    const w = base();
    cmdE(w, { type: 'setBath', bathId: 'wb2', on: true });
    runE(w, 900);
    pipette(w, 'p5', 'bW', 't1', 4);
    cmdE(w, { type: 'tongs', tubeId: 't1', to: 'wb2' });
    runE(w, 120);
    const r = dispatchEnz(w, { type: 'setPose', id: 't1', pose: { x: 0, y: 0, z: 0, rotationRad: 0 }, support: 'hand' });
    expect(r.ok).toBe(false);
    expect(err(w, 'S03')).toBe(1);
    expect(w.enz.vessels.t1.volumeMl).toBeLessThan(3);
    expect(w.safety.block?.code).toBe('HOT');
  },
  S04: () => {
    const w = base();
    const cap = w.enz.vessels.t1.capacityMl;
    for (let left = 0.92 * cap; left > 1e-6; left -= 10) pipette(w, 'p10', 'bW', 't1', Math.min(10, left));
    cmdE(w, { type: 'shake', targetId: 't1', strength01: 0.9 });
    expect(err(w, 'S04')).toBe(1);
    expect(w.enz.vessels.spill.volumeMl).toBeGreaterThan(0);
  },
  S05: () => {
    const w = base();
    pipette(w, 'p5', 'bW', 't16', 2);
    drop(w, 'dB', 't16');
    const r = dispatchEnz(w, { type: 'discardLiquid', vesselId: 't16', wasteId: 'wAq' });
    expect(r.ok).toBe(false);
    expect(err(w, 'S05')).toBe(1);
    expect(w.enz.vessels.t16.volumeMl).toBeGreaterThan(2);
  },
  S06: () => {
    const w = withP2();
    catalaseTube(w, 't1', 'cat-base');
    cmdE(w, { type: 'setStopcock', open: false });
    for (let i = 0; i < 600 && !err(w, 'S06'); i++) runE(w, 1);
    expect(err(w, 'S06')).toBe(1);
    expect(w.safety.block?.code).toBe('PRESSURE');
  },
  S07: () => {
    const w = base();
    const r = dispatchEnz(w, { type: 'startPour', sourceId: 'naoh', targetId: 't1', tiltDeg: 60 });
    expect(r.ok).toBe(false);
    expect(err(w, 'S07')).toBe(1);
    expect(w.enz.vessels.t1.volumeMl).toBe(0);
  },
  S08: () => {
    const w = base();
    cmdE(w, { type: 'setHeat', plateId: 'hp1', on: true, setpointK: 310 });
    dispatchEnz(w, { type: 'closeBench' });
    expect(err(w, 'S08')).toBe(1);
    expect(w.evidence.benchRestored).toBeUndefined();
  },
  // ── Preparaciones ──
  PREP01: () => {
    const w = base();
    measureWater(w, 'g100', 100, 'bk1');
    weighPowder(w, 'jS', 20, 'bk1');
    stirOn(w, 'bk1', 'hp1', 'sb1', 500, 305.15);
    runE(w, 300);
    cmdE(w, { type: 'readInstrument', instrument: 'thermo', targetId: 'bk1' });
    pipette(w, 'p1', 'bk1', 't9', 1);
    expect(err(w, 'PREP01')).toBe(1);
    expect(w.enz.batches.P1!.solidG).toBeLessThan(24);
  },
  PREP02: () => {
    const w = base();
    measureWater(w, 'g100', 85, 'bk1');
    weighPowder(w, 'jS', 25, 'bk1');
    stirOn(w, 'bk1', 'hp1', 'sb1', 500, 305.15);
    runE(w, 300);
    cmdE(w, { type: 'readInstrument', instrument: 'thermo', targetId: 'bk1' });
    pipette(w, 'p1', 'bk1', 't9', 1);
    expect(err(w, 'PREP02')).toBe(1);
    expect(w.enz.batches.P1!.waterMl).toBeLessThan(90);
  },
  PREP03: () => {
    const w = base();
    measureWater(w, 'g100', 100, 'bk1');
    weighPowder(w, 'jS', 25, 'bk1');
    placeE(w, 'bk1', 'hp1');
    cmdE(w, { type: 'setHeat', plateId: 'hp1', on: true, setpointK: 305.15 });
    runE(w, 300);
    cmdE(w, { type: 'readInstrument', instrument: 'thermo', targetId: 'bk1' });
    pipette(w, 'p1', 'bk1', 't9', 1);
    expect(err(w, 'PREP03')).toBe(1);
    expect(w.enz.batches.P1!.stirredS).toBe(0);
  },
  PREP04: () => {
    const w = base();
    measureWater(w, 'g100', 100, 'bk1');
    weighPowder(w, 'jS', 25, 'bk1');
    stirOn(w, 'bk1', 'hp1', 'sb1', 500);
    runE(w, 300);
    pipette(w, 'p1', 'bk1', 't9', 1);
    expect(err(w, 'PREP04')).toBe(1);
    expect(w.enz.batches.P1!.measuredTK).toBeNull();
  },
  PREP05: () => {
    const w = base();
    measureWater(w, 'g100', 100, 'bk1');
    weighPowder(w, 'jS', 25, 'bk1');
    stirOn(w, 'bk1', 'hp1', 'sb1', 1300);
    runE(w, 30);
    expect(err(w, 'PREP05')).toBe(1);
    expect(w.enz.vessels.spill.volumeMl).toBeGreaterThan(0);
  },
  PREP06: () => {
    const w = withP2([], { strokes: 0 });
    pipette(w, 'p5', 'bk3', 't1', 2);
    expect(err(w, 'PREP06')).toBe(1);
    expect(w.enz.batches.P2!.sizeCm!).toBeGreaterThan(w.params.enz!.prep.liverMaxCm);
  },
  PREP07: () => {
    const w = base();
    measureWater(w, 'g25', 25, 'bk3');
    cmdE(w, { type: 'cutTissue', sourceId: 'liv', toolId: 'ls', massG: 1 });
    cmdE(w, { type: 'mince', toolId: 'ls', strokes: 6 });
    cmdE(w, { type: 'transferSolid', fromId: 'bdL', toId: 'bk3' });
    stirOn(w, 'bk3', 'hp2', 'sb2', 400, 333.15);
    runE(w, 240);
    pipette(w, 'p5', 'bk3', 't1', 2);
    expect(err(w, 'PREP07')).toBe(1);
    expect(w.enz.batches.P2!.heatedS).toBeGreaterThan(0);
  },
  PREP08: () => {
    const w = base();
    measureWater(w, 'g10', 5, 'bk2');
    weighPowder(w, 'jA', 0.35, 'bk2');
    stirOn(w, 'bk2', 'hp2', 'sb2', 300);
    runE(w, 120);
    pipette(w, 'p1', 'bk2', 't9', 1);
    expect(err(w, 'PREP08')).toBe(1);
    expect(w.enz.batches.P3!.solidG).toBeGreaterThan(0.3);
  },
  PREP09: () => {
    const w = base();
    measureWater(w, 'g10', 8, 'bk2');
    weighPowder(w, 'jA', 0.2, 'bk2');
    stirOn(w, 'bk2', 'hp2', 'sb2', 300);
    runE(w, 120);
    pipette(w, 'p1', 'bk2', 't9', 1);
    expect(err(w, 'PREP09')).toBe(1);
    expect(w.enz.batches.P3!.waterMl).toBeGreaterThan(7);
  },
  // ── Microscopio compartido ──
  MIC01: () => {
    const w = base();
    placeE(w, 'sl2', 'prep', { x: w.objects.sl2.pose.x, y: w.objects.sl2.pose.y });
    cmdE(w, { type: 'scrape', sourceId: 'pot', toolId: 'sp', distanceCm: 1.2, pressure01: 0.4 } as never);
    cmdE(w, { type: 'placeSpecimen', toolId: 'sp', targetId: 'sl2', dxCm: 0, dyCm: 0 } as never);
    drop(w, 'iod', 'sl2', 5);
    cmdE(w, { type: 'grabCover', coverId: 'cv1', toolId: 'fc' } as never);
    cmdE(w, { type: 'setCoverTilt', coverId: 'cv1', angleDeg: 45 } as never);
    cmdE(w, { type: 'lowerCover', coverId: 'cv1', slideId: 'sl2', speedCmS: 0.4, dxCm: 0, dyCm: 0 } as never);
    expect(err(w, 'MIC01')).toBe(1);
    expect(w.fluids.spilledMl).toBeGreaterThan(0);
  },
  MIC02: () => {
    const w = base();
    placeE(w, 'sl2', 'prep', { x: w.objects.sl2.pose.x, y: w.objects.sl2.pose.y });
    cmdE(w, { type: 'scrape', sourceId: 'pot', toolId: 'sp', distanceCm: 1.2, pressure01: 0.4 } as never);
    cmdE(w, { type: 'placeSpecimen', toolId: 'sp', targetId: 'sl2', dxCm: 0, dyCm: 0 } as never);
    drop(w, 'iod', 'sl2');
    cmdE(w, { type: 'grabCover', coverId: 'cv1', toolId: 'fc' } as never);
    cmdE(w, { type: 'setCoverTilt', coverId: 'cv1', angleDeg: 4 } as never);
    cmdE(w, { type: 'lowerCover', coverId: 'cv1', slideId: 'sl2', speedCmS: 2, dxCm: 0, dyCm: 0 } as never);
    expect(err(w, 'MIC02')).toBe(1);
    expect(w.mounts.sl2.bubbles.length).toBeGreaterThan(0);
  },
  MIC03: () => {
    const w = base();
    potatoMountE(w, 'sl2', 'cv1');
    cmdE(w, { type: 'setPower', device: 'microscope', on: true } as never);
    if (w.microscope.clipOpen) cmdE(w, { type: 'openClip', open: false } as never);
    const r = placeE(w, 'sl2', 'stage', undefined, false);
    expect(r.ok).toBe(false);
    expect(err(w, 'MIC03')).toBe(1);
    expect(w.microscope.slideOnStage).toBeNull();
  },
  MIC04: () => {
    const w = base();
    potatoMountE(w, 'sl2', 'cv1');
    cmdE(w, { type: 'setPower', device: 'microscope', on: true } as never);
    toStageE(w, 'sl2');
    toObjectiveE(w, 40);
    expect(err(w, 'MIC04')).toBe(1);
    expect(microscopeView(w).objectiveX).toBe(40);
  },
  MIC05: () => {
    const w = base();
    potatoMountE(w, 'sl2', 'cv1');
    cmdE(w, { type: 'setPower', device: 'microscope', on: true } as never);
    cmdE(w, { type: 'setIllumination', device: 'microscope', value01: 0.4 } as never);
    toObjectiveE(w, 4);
    toStageE(w, 'sl2');
    focusE(w);
    toObjectiveE(w, 10);
    focusE(w);
    toObjectiveE(w, 40);
    focusE(w);
    for (let i = 0; i < 40 && !err(w, 'MIC05'); i++) dispatchEnz(w, { type: 'turnFine', deltaTurns: 0.5 } as never);
    expect(err(w, 'MIC05')).toBe(1);
    expect(w.microscope.impactCount).toBe(1);
  },
  MIC06: () => {
    const w = base();
    toObjectiveE(w, 40);
    dispatchEnz(w, { type: 'closeBench' });
    expect(err(w, 'MIC06')).toBe(1);
    expect(w.evidence.safeParked).toBeUndefined();
  },
  B05RES: () => {
    const w = base([SC_B05.PIPETTE_BUBBLE]);
    cmdE(w, { type: 'aspirate', toolId: 'p5', sourceId: 'bW', volumeMl: 2 });
    expect(w.evidence['incident:B05RES']).toBeTruthy();
    expect(w.enz.vessels.p5.volumeMl).toBeLessThan(2 - 1e-3);
    expect(errKeysB05(w)).toEqual([]);
  },
};

describe('B05 — errores con consecuencia causal y una incidencia técnica (§9)', () => {
  it('el catálogo tiene códigos únicos y una fixture por cada uno', () => {
    const codes = SIMULATED_ERRORS_B05.map((e) => e.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(Object.keys(FIXTURES).sort()).toEqual([...codes].sort());
  });
  for (const e of SIMULATED_ERRORS_B05) it(`${e.code} — ${e.trigger}`, () => FIXTURES[e.code](), 60000);
  it('el camino correcto no comete ninguno, no deja problemas en la libreta y conserva los balances', () => {
    const { w, nb } = ideal();
    expect(errKeysB05(w)).toEqual([]);
    expect(notebookIssuesB05(w, nb)).toEqual([]);
    const c = conservedEnz(w);
    for (const k of Object.keys(c)) expect(Math.abs(c[k]), k).toBeLessThan(1e-9);
  }, 60000);
  it('ningún código de B01/B02 sin traducir llega a la evidencia de B05', () => {
    const known = new Set(SIMULATED_ERRORS_B05.map((e) => e.code));
    for (const [from, to] of Object.entries(CODE_MAP_B05)) if (to) expect(known.has(to), `${from} → ${to}`).toBe(true);
  });
  it('los errores conservan volumen, oxígeno y especies (fugas y derrames van al balance)', () => {
    const w = withP2();
    catalaseTube(w, 't1', 'cat-base');
    cmdE(w, { type: 'stopperTube', tubeId: 't1', closed: true });
    runE(w, 120);
    gasSeries(w, 20, 10);
    drop(w, 'dL', 'bench');
    phTube(w, 't4', 'cat-acid');
    const c = conservedEnz(w);
    for (const k of Object.keys(c)) expect(Math.abs(c[k]), k).toBeLessThan(1e-9);
  });
});
