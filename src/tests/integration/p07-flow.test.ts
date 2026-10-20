/**
 * Práctica 7 — flujo completo y catálogo de errores (§17.2). Todo se hace con comandos de estudiante; las etapas
 * avanzan por evidencia (XState). Cada error L01–L60 tiene su disparador, su efecto verificable, su clave de
 * evidencia y su texto de retroalimentación.
 */
import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import type { P07World } from '../../simulation/bonding-world/types';
import { S, dispatchP07, materialTotals, vesselMl, solutionComp } from '../../simulation/bonding-world/world';
import { MATERIALS } from '../../simulation/solution-properties/materials';
import { practice07Machine, p07StageName } from '../../practices/practice-07/workflow.machine';
import { p07StageEvidence } from '../../practices/practice-07/evidence';
import { evaluateP07, notebookIssues } from '../../practices/practice-07/rubric';
import { SIMULATED_ERRORS_P07, P07_SCENARIOS } from '../../practices/practice-07/error-scenarios';
import { sanitizeOnResume07 } from '../../practices/practice-07/resume';
import { emptyP07Notebook, type P07Notebook } from '../../practices/practice-07/notebook';
import {
  checkInstruments, cmd07, contacts, dropperTransfer, emptyP07Notebook as emptyNb, fillToMark, hit, idealRoute07, measureSolid, meterReady, place, pourAll, pourTo,
  ppe, readKappa, run07, spoon, stir, weighOut, world07,
} from '../helpers07';
import es7 from '../../locales/es/practice7.json';

const totalsClose = (a: Record<string, number | undefined>, b: Record<string, number | undefined>, tol = 1e-9) => {
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) expect(Math.abs((a[k] ?? 0) - (b[k] ?? 0)), k).toBeLessThan(tol);
};

const water = (ml: number) => ({ water: ml * MATERIALS.water.densityGml });
/** Prepara un recipiente con agua sacándola del frasco de referencia (sin crear materia). */
function prefill(w: P07World, id: string, ml: number) {
  w.vessels[id].polar = water(ml);
  w.vessels.btWater.polar.water! -= ml * MATERIALS.water.densityGml;
}

describe('Práctica 7 — ruta ideal (A → F)', () => {
  for (const seed of [7007, 11, 2026, 31337]) {
    it(`semilla ${seed}: la máquina avanza por evidencia hasta COMPLETE, la masa se conserva y la nota es alta`, () => {
      const { w, nb } = idealRoute07(seed);
      totalsClose(materialTotals(w), w.initialTotals);
      const actor = createActor(practice07Machine).start();
      actor.send({ type: 'START' });
      actor.send({ type: 'PPE_CONFIRMED' });
      actor.send({ type: 'EVIDENCE', flags: p07StageEvidence(w, nb) });
      expect(p07StageName(actor.getSnapshot().value)).toBe('COMPLETE');
      const errs = Object.keys(w.evidence).filter((k) => k.startsWith('err:'));
      expect(errs, errs.join(',')).toEqual([]);
      expect(notebookIssues(w, nb)).toEqual([]);
      const ev = evaluateP07(w, nb);
      expect(ev.total).toBeGreaterThan(0.9);
      expect(ev.needsTeacherReview.length).toBeGreaterThan(0);
    });
  }

  it('sin evidencia la máquina no avanza (no hay botón «Siguiente»)', () => {
    const w = world07();
    ppe(w);
    const actor = createActor(practice07Machine).start();
    actor.send({ type: 'START' });
    actor.send({ type: 'PPE_CONFIRMED' });
    actor.send({ type: 'EVIDENCE', flags: p07StageEvidence(w, emptyP07Notebook()) });
    expect(p07StageName(actor.getSnapshot().value)).toBe('A_HYPOTHESES');
  });
});

describe('Práctica 7 — rutas científicas (§17.2)', () => {
  it('sal seca frente a solución: misma identidad, distinto comportamiento eléctrico', () => {
    const w = world07();
    ppe(w);
    checkInstruments(w);
    const dry = measureSolid(w, 'spNaCl', 1);
    expect(dry.ok).toBe(true);
    expect(dry.value!).toBeLessThan(w.params.detectorThresholdMA);
    meterReady(w);
    w.vessels.bk2.polar = solutionComp('NaCl', 0.01, 30);
    w.vessels.btWater.polar.water! -= 30 * MATERIALS.water.densityGml;
    w.initialTotals = materialTotals(w);
    const k = readKappa(w, 'bk2', 'MID');
    expect(k.ok).toBe(true);
    expect(k.value!).toBeGreaterThan(800);
  });

  it('grafito frente a metal: ambos conducen; el grafito depende de la orientación', () => {
    const w = world07({ scenarios: [S.GRAPHITE_SAMPLE] });
    ppe(w);
    checkInstruments(w);
    const cu = measureSolid(w, 'spCu', 3).value!;
    const flat = measureSolid(w, 'spGraphite', 2).value!;
    cmd07(w, { type: 'rotateSpecimen', specimenId: 'spGraphite' });
    const edge = measureSolid(w, 'spGraphite', 0.3).value!;
    expect(cu).toBeGreaterThan(5);
    expect(flat).toBeGreaterThan(5);
    expect(edge).toBeLessThan(flat);
  });

  it('ácido acético: molécula covalente con ionización parcial (κ pequeña, no nula)', () => {
    const w = world07();
    ppe(w);
    meterReady(w);
    pourTo(w, 'btAcetic', 'bk5', 30);
    const k = readKappa(w, 'bk5', 'MID');
    expect(k.ok).toBe(true);
    expect(k.value!).toBeGreaterThan(300);
    expect(k.value!).toBeLessThan(800);
  });

  it('sacarosa disuelta: soluble y no electrolítica (κ ≈ blanco)', () => {
    const w = world07();
    ppe(w);
    meterReady(w);
    pourTo(w, 'btWater', 'bk1', 30);
    const blank = readKappa(w, 'bk1', 'LOW').value!;
    weighOut(w, 'wg2', 'jarSucrose', 1.0);
    cmd07(w, { type: 'dispose', vesselId: 'wg2', wasteId: 'bk4' });
    pourTo(w, 'btWater', 'bk4', 30);
    stir(w, 'bk4', 25);
    expect(w.vessels.bk4.solid.sucrose ?? 0).toBeLessThan(0.01);
    const k = readKappa(w, 'bk4', 'LOW').value!;
    expect(Math.abs(k - blank)).toBeLessThan(2);
  });

  it('aceite y agua: dos fases con masa y volumen calculados', () => {
    const w = world07();
    ppe(w);
    prefill(w, 'tube5', 5);
    dropperTransfer(w, 'dp2', 'btMineralOil', 'tube5', 2);
    stir(w, 'tube5', 5);
    run07(w, 40);
    const r = cmd07(w, { type: 'observe', vesselId: 'tube5' });
    expect(w.readings[r.id!].snapshot.phases).toBe(2);
    expect(vesselMl(w.vessels.tube5)).toBeGreaterThan(6.5);
  });

  it('soluto excedente: queda sólido saturado y la masa no disuelta no aporta iones', () => {
    const w = world07({ scenarios: [S.SOLUBILITY_LIMIT] });
    ppe(w);
    prefill(w, 'tube6', 5);
    for (let i = 0; i < 40 && (w.vessels.jarExcess.solid.NaHCO3 ?? 0) > 0.001; i++) spoon(w, 'jarExcess', 'tube6');
    stir(w, 'tube6', 60);
    const t = w.vessels.tube6;
    expect(t.solid.NaHCO3 ?? 0).toBeGreaterThan(1);
    expect(t.polar.NaHCO3 ?? 0).toBeLessThan(0.5);
  });

  it('contaminación de la sonda: lecturas distintas y recuperación al lavar', () => {
    const w = world07({ scenarios: [S.PROBE_NOT_RINSED] });
    ppe(w);
    cmd07(w, { type: 'powerMeter', on: true });
    prefill(w, 'bk1', 30);
    w.initialTotals = materialTotals(w);
    cmd07(w, { type: 'setMeterRange', range: 'LOW' });
    cmd07(w, { type: 'setProbeDepth', vesselId: 'bk1', immersionCm: 1.8, bottomContact: false });
    run07(w, 6);
    const dirty = cmd07(w, { type: 'readConductivity' }, false).value!;
    cmd07(w, { type: 'setProbeDepth', vesselId: null, immersionCm: 0, bottomContact: false });
    cmd07(w, { type: 'dispose', vesselId: 'bk1', wasteId: 'wasteAq' });
    cmd07(w, { type: 'rinseProbe', wasteId: 'wasteAq' });
    cmd07(w, { type: 'rinseProbe', wasteId: 'wasteAq' });
    pourTo(w, 'btWater', 'bk3', 30);
    const clean = readKappa(w, 'bk3', 'LOW').value!;
    expect(dirty).toBeGreaterThan(clean * 5);
    totalsClose(materialTotals(w), w.initialTotals);
  });

  it('una respuesta incorrecta en la libreta no cambia el mundo físico', () => {
    const { w, nb } = idealRoute07();
    const before = JSON.stringify({ v: w.vessels, r: w.readings });
    nb.tableE.X.classification = 'metallic';
    nb.tableF.graphite.explanation = 'el grafito es un metal porque conduce';
    evaluateP07(w, nb);
    notebookIssues(w, nb);
    expect(JSON.stringify({ v: w.vessels, r: w.readings })).toBe(before);
  });

  it('una prevención bloqueada no anula la seguridad como si fuera un accidente', () => {
    const { w, nb } = idealRoute07();
    dispatchP07(w, { type: 'setPose', id: 'jarNaOH', pose: { x: 0, y: 0, z: 0, rotationRad: 0 }, support: 'hand' });
    expect(w.evidence['err:restricted_sample']).toBe(1);
    const safety = evaluateP07(w, nb).components.find((c) => c.id === 'safety')!;
    expect(safety.score).toBeGreaterThan(0.7);
  });

  it('guardar y reanudar durante un vertido, una lectura de sonda y un contacto: estado seguro y masa conservada', () => {
    const w = world07();
    ppe(w);
    cmd07(w, { type: 'powerDetector', on: true });
    cmd07(w, { type: 'setCap', vesselId: 'btWater', capped: false });
    cmd07(w, { type: 'setPour', sourceId: 'btWater', targetId: 'tube1', tiltDeg: 40 });
    cmd07(w, { type: 'powerMeter', on: true });
    prefill(w, 'bk1', 30);
    cmd07(w, { type: 'setProbeDepth', vesselId: 'bk1', immersionCm: 1.8, bottomContact: false });
    contacts(w, 'spCu', 'spCu');
    place(w, 'dp1', 'hand', 5);
    run07(w, 1);
    const before = materialTotals(w);
    const saved: P07World = JSON.parse(JSON.stringify(w));
    sanitizeOnResume07(saved);
    expect(Object.keys(saved.pours)).toEqual([]);
    expect(saved.detector.a).toBeNull();
    expect(saved.meter.stable).toBe(false);
    expect(saved.objects.dp1.support).toBe('bench');
    totalsClose(materialTotals(saved), before);
  });

  it('los 16 escenarios crean mundos válidos y conservativos', () => {
    for (const s of P07_SCENARIOS) {
      const w = world07({ scenarios: [s.id] });
      expect(w.scenarios).toContain(s.id);
      totalsClose(materialTotals(w), w.initialTotals);
    }
    // Incompatibles: sal seca y húmeda a la vez → gana el primero.
    expect(world07({ scenarios: [S.DRY_IONIC_CRYSTAL, S.HUMID_CRYSTAL] }).scenarios).toEqual([S.DRY_IONIC_CRYSTAL]);
  });
});

// ─────────────────────────── Catálogo L01–L60 ───────────────────────────

interface Case {
  w: P07World;
  nb?: P07Notebook;
  effect: boolean;
}

const base = (opts: Parameters<typeof world07>[0] = {}) => {
  const w = world07(opts);
  ppe(w);
  return w;
};

/** Ruta ideal y una modificación de la libreta (errores `nb:*`). */
const nbCase = (edit: (w: P07World, nb: P07Notebook) => void, check?: (w: P07World, nb: P07Notebook) => boolean): Case => {
  const { w, nb } = idealRoute07();
  const before = JSON.stringify(w.vessels);
  edit(w, nb);
  return { w, nb, effect: JSON.stringify(w.vessels) === before && (check ? check(w, nb) : true) };
};

const CASES: Record<string, () => Case> = {
  L01: () => {
    const w = world07();
    cmd07(w, { type: 'setPPE', item: 'coat', enabled: true });
    cmd07(w, { type: 'setPPE', item: 'shoes', enabled: true });
    cmd07(w, { type: 'setGloves', gloves: 'nitrile' });
    const before = materialTotals(w);
    const r = dispatchP07(w, { type: 'startWork' });
    const s = dispatchP07(w, { type: 'scoop', sourceId: 'jarNaCl' });
    return { w, effect: !r.ok && !s.ok && !w.ppe && JSON.stringify(materialTotals(w)) === JSON.stringify(before) };
  },
  L02: () => {
    const w = world07();
    cmd07(w, { type: 'setPPE', item: 'goggles', enabled: true });
    cmd07(w, { type: 'setPPE', item: 'shoes', enabled: true });
    cmd07(w, { type: 'setGloves', gloves: 'nitrile' });
    const r = dispatchP07(w, { type: 'startWork' });
    return { w, effect: !r.ok && !w.ppe };
  },
  L03: () => {
    const w = world07();
    for (const item of ['coat', 'goggles', 'shoes'] as const) cmd07(w, { type: 'setPPE', item, enabled: true });
    cmd07(w, { type: 'setGloves', gloves: 'latex' });
    cmd07(w, { type: 'startWork' });
    cmd07(w, { type: 'setCap', vesselId: 'btHeptane', capped: false });
    const r = dispatchP07(w, { type: 'setPour', sourceId: 'btHeptane', targetId: 'tube1', tiltDeg: 60 });
    run07(w, 1);
    return { w, effect: !r.ok && r.code === 'GLOVES' && !w.vessels.tube1.apolar.heptane };
  },
  L04: () => {
    const w = base();
    cmd07(w, { type: 'powerMeter', on: true });
    cmd07(w, { type: 'setProbeDepth', vesselId: 'stdUnknown', immersionCm: 2.5, bottomContact: false });
    run07(w, 6);
    const r = dispatchP07(w, { type: 'calibrateConductivity', standardId: 'stdUnknown' });
    return { w, effect: !r.ok && w.meter.calibratedWith === null };
  },
  L05: () => {
    const w = base();
    cmd07(w, { type: 'powerDetector', on: true });
    const r = measureSolid(w, 'spCu', 3);
    return { w, effect: w.readings[r.id!].qualityFlags.includes('UNVERIFIED') };
  },
  L06: () => {
    const w = base();
    prefill(w, 'tube1', 5);
    spoon(w, 'jarDamaged', 'tube1');
    return { w, effect: (w.vessels.tube1.solid.KCl ?? 0) + (w.vessels.tube1.polar.KCl ?? 0) > 0 };
  },
  L07: () => {
    const w = base();
    dropperTransfer(w, 'dp2', 'btHeptane', 'tube2', 3);
    cmd07(w, { type: 'dispose', vesselId: 'tube2', wasteId: 'wasteAq' });
    return { w, effect: (w.vessels.wasteAq.apolar.heptane ?? 0) > 1.5 };
  },
  L08: () => {
    const w = base({ mode: 'EVALUATION' });
    cmd07(w, { type: 'setCap', vesselId: 'btHeptane', capped: false });
    cmd07(w, { type: 'pause', on: true });
    cmd07(w, { type: 'pause', on: false });
    const r = dispatchP07(w, { type: 'powerMeter', on: true });
    return { w, effect: !r.ok && r.code === 'UNCAPPED' && w.safety.block?.code === 'UNCAPPED' };
  },
  L09: () => {
    const w = base();
    cmd07(w, { type: 'setCap', vesselId: 'btWater', capped: false });
    cmd07(w, { type: 'setPour', sourceId: 'btWater', targetId: 'electrics', tiltDeg: 30 });
    run07(w, 2);
    cmd07(w, { type: 'stopPour', sourceId: 'btWater' });
    const r = dispatchP07(w, { type: 'powerDetector', on: true });
    return { w, effect: !r.ok && !w.detector.powered };
  },
  L10: () => {
    const w = base();
    const before = w.vessels.jarNaOH.solid.NaOH;
    const r = dispatchP07(w, { type: 'setPose', id: 'jarNaOH', pose: { x: 0, y: 0, z: 5, rotationRad: 0 }, support: 'hand' });
    return { w, effect: !r.ok && w.objects.jarNaOH.support === 'bench' && w.vessels.jarNaOH.solid.NaOH === before };
  },
  L11: () => {
    const w = base();
    prefill(w, 'tube1', 5);
    spoon(w, 'jarNaCl', 'tube1');
    spoon(w, 'jarSucrose', 'tube1');
    const t = w.vessels.tube1;
    return { w, effect: (t.solid.NaCl ?? 0) + (t.polar.NaCl ?? 0) > 0 && (t.solid.sucrose ?? 0) + (t.polar.sucrose ?? 0) > 0 };
  },
  L12: () => {
    const w = base();
    const nb = emptyNb();
    pourTo(w, 'btWater', 'cyl10', 4);
    pourAll(w, 'cyl10', 'tube1');
    spoon(w, 'jarNaCl', 'tube1');
    stir(w, 'tube1', 10);
    run07(w, 8);
    const o = cmd07(w, { type: 'observe', vesselId: 'tube1' });
    Object.assign(nb.tableB.M1A, { tubeId: 'tube1', sample: 'NaCl', solvent: 'water', observationId: o.id, volume: { value: '5,0', uncertainty: '', readingId: null }, interpretation: 'soluble' });
    return { w, nb, effect: Math.abs(vesselMl(w.vessels.tube1) - 4) < 0.3 };
  },
  L13: () => {
    const w = base();
    pourTo(w, 'btWater', 'tube1', 28);
    return { w, effect: (w.spills.bench.water ?? 0) > 0.5 };
  },
  L14: () => {
    const w = base();
    prefill(w, 'bk4', 30);
    spoon(w, 'jarNaCl', 'wg1');
    spoon(w, 'jarSucrose', 'bk4', false);
    return { w, effect: (w.vessels.bk4.solid.NaCl ?? 0) + (w.vessels.bk4.polar.NaCl ?? 0) > 0 };
  },
  L15: () => {
    const w = base();
    cmd07(w, { type: 'powerBalance', on: true });
    place(w, 'wg1', 'pan', 8.4);
    spoon(w, 'jarNaCl', 'wg1');
    run07(w, 3);
    const r = cmd07(w, { type: 'readBalance' });
    return { w, effect: r.value! > w.objects.wg1.massG! - 0.5 };
  },
  L16: () => {
    const w = base();
    prefill(w, 'tube1', 17);
    stir(w, 'tube1', 3, 0.95);
    return { w, effect: (w.spills.bench.water ?? 0) > 0 };
  },
  L17: () => {
    const w = base();
    prefill(w, 'tube1', 5);
    spoon(w, 'jarNaCl', 'tube1');
    const r = cmd07(w, { type: 'observe', vesselId: 'tube1' });
    return { w, effect: w.readings[r.id!].qualityFlags.includes('NOT_EQUILIBRATED') };
  },
  L18: () => {
    const w = base();
    cmd07(w, { type: 'labelTube', tubeId: 'tube1', label: 'M1-A' });
    dropperTransfer(w, 'dp2', 'btHeptane', 'tube1', 3);
    return { w, effect: (w.vessels.tube1.apolar.heptane ?? 0) > 1 };
  },
  L19: () => {
    const w = base({ scenarios: [S.SOLUBILITY_LIMIT] });
    prefill(w, 'tube1', 5);
    for (let i = 0; i < 40 && (w.vessels.jarExcess.solid.NaHCO3 ?? 0) > 0.001; i++) spoon(w, 'jarExcess', 'tube1');
    stir(w, 'tube1', 60);
    run07(w, 8);
    cmd07(w, { type: 'observe', vesselId: 'tube1' });
    return { w, effect: (w.vessels.tube1.solid.NaHCO3 ?? 0) > 1 };
  },
  L20: () => {
    const w = base();
    prefill(w, 'bk1', 30);
    prefill(w, 'tube1', 5);
    dropperTransfer(w, 'dp2', 'btHeptane', 'tube2', 3);
    dropperTransfer(w, 'dp2', 'bk1', 'tube1', 2);
    return { w, effect: (w.vessels.tube1.apolar.heptane ?? 0) > 0 };
  },
  L21: () => {
    const w = base();
    cmd07(w, { type: 'powerDetector', on: true });
    cmd07(w, { type: 'setElectrodeContacts', a: hit('spCu'), b: null });
    run07(w, 1.5);
    const r = dispatchP07(w, { type: 'readDetector' });
    return { w, effect: !w.readings[r.id!].valid };
  },
  L22: () => {
    const w = base();
    cmd07(w, { type: 'powerDetector', on: true });
    cmd07(w, { type: 'setElectrodeContacts', a: hit('tipB'), b: hit('tipA') });
    run07(w, 1.5);
    const r = dispatchP07(w, { type: 'readDetector' });
    return { w, effect: !w.readings[r.id!].valid && w.detector.currentMA > 5 };
  },
  L23: () => {
    const w = base();
    cmd07(w, { type: 'powerDetector', on: true });
    cmd07(w, { type: 'setElectrodeContacts', a: hit('spCu'), b: hit('spAl', 3) });
    run07(w, 1.5);
    const r = dispatchP07(w, { type: 'readDetector' });
    return { w, effect: !w.readings[r.id!].valid };
  },
  L24: () => {
    const w = base({ scenarios: [S.OXIDIZED_ALUMINUM] });
    checkInstruments(w);
    const al = measureSolid(w, 'spAl', 3).value!;
    const cu = measureSolid(w, 'spCu', 3).value!;
    return { w, effect: al < cu / 5 };
  },
  L25: () => {
    const w = base();
    cmd07(w, { type: 'powerDetector', on: true });
    cmd07(w, { type: 'setElectrodeContacts', a: hit('spCu', 0.5, 0.5, 0.15), b: hit('spCu', 4) });
    run07(w, 1.5);
    const r = dispatchP07(w, { type: 'readDetector' });
    return { w, effect: !w.readings[r.id!].valid && w.detector.currentMA === 0 };
  },
  L26: () => {
    const w = base({ scenarios: [S.HUMID_CRYSTAL] });
    checkInstruments(w);
    const r = measureSolid(w, 'spNaCl', 1);
    return { w, effect: r.value! > w.params.detectorThresholdMA };
  },
  L27: () => {
    const w = base();
    checkInstruments(w);
    cmd07(w, { type: 'setDetectorRange', range: 'LOW' });
    const r = measureSolid(w, 'spCu', 3);
    return { w, effect: w.readings[r.id!].qualityFlags.includes('SATURATED') && !w.readings[r.id!].valid };
  },
  L28: () => {
    const w = base();
    cmd07(w, { type: 'powerDetector', on: true });
    contacts(w, 'spCu', 'spCu');
    const r = dispatchP07(w, { type: 'readDetector' });
    return { w, effect: !w.readings[r.id!].valid };
  },
  L29: () => {
    const w = base({ scenarios: [S.GRAPHITE_SAMPLE] });
    checkInstruments(w);
    const flat = measureSolid(w, 'spGraphite', 2).value!;
    w.readings[w.readingOrder[w.readingOrder.length - 1]].valid = false; // la lectura en el plano no se usa
    cmd07(w, { type: 'rotateSpecimen', specimenId: 'spGraphite' });
    const edge = measureSolid(w, 'spGraphite', 0.3).value!;
    return { w, nb: emptyNb(), effect: edge < flat };
  },
  L30: () => {
    const w = base();
    cmd07(w, { type: 'powerDetector', on: true });
    cmd07(w, { type: 'setDetectorCables', connected: false });
    contacts(w, 'det01pad', 'det01pad');
    run07(w, 1.2);
    dispatchP07(w, { type: 'readDetector' });
    contacts(w, 'spNaCl', 'spNaCl', 1);
    run07(w, 1.2);
    dispatchP07(w, { type: 'readDetector' });
    return { w, effect: w.detector.controlTest === 'failed' };
  },
  L31: () => {
    const w = base();
    prefill(w, 'bk1', 30);
    cmd07(w, { type: 'powerMeter', on: true });
    cmd07(w, { type: 'setProbeDepth', vesselId: 'bk1', immersionCm: 0.5, bottomContact: false });
    run07(w, 6);
    const r = dispatchP07(w, { type: 'readConductivity' });
    return { w, effect: !w.readings[r.id!].valid };
  },
  L32: () => {
    const w = base();
    w.vessels.bk2.polar = solutionComp('NaCl', 0.01, 30);
    w.vessels.btWater.polar.water! -= 30 * MATERIALS.water.densityGml;
    cmd07(w, { type: 'powerMeter', on: true });
    const ok = readKappa(w, 'bk2', 'MID').value!;
    cmd07(w, { type: 'setProbeDepth', vesselId: 'bk2', immersionCm: 2, bottomContact: true });
    run07(w, 6);
    const r = dispatchP07(w, { type: 'readConductivity' });
    return { w, effect: !w.readings[r.id!].valid && w.readings[r.id!].value < ok * 0.9 };
  },
  L33: () => {
    const w = base({ scenarios: [S.PROBE_NOT_RINSED] });
    prefill(w, 'bk1', 30);
    cmd07(w, { type: 'powerMeter', on: true });
    cmd07(w, { type: 'setMeterRange', range: 'LOW' });
    cmd07(w, { type: 'setProbeDepth', vesselId: 'bk1', immersionCm: 1.8, bottomContact: false });
    run07(w, 6);
    const r = dispatchP07(w, { type: 'readConductivity' });
    return { w, effect: (w.vessels.bk1.polar.NaCl ?? 0) > 0 && w.readings[r.id!].value > 20 };
  },
  L34: () => {
    const w = base();
    cmd07(w, { type: 'powerMeter', on: true });
    cmd07(w, { type: 'setStandard', value: 12880 });
    cmd07(w, { type: 'setProbeDepth', vesselId: 'std1413', immersionCm: 2.5, bottomContact: false });
    run07(w, 6);
    cmd07(w, { type: 'calibrateConductivity', standardId: 'std1413' });
    return { w, effect: w.meter.calibFactor > 5 };
  },
  L35: () => nbCase((_w, nb) => { nb.tableD.strongB.kappaUnit = 'mS/cm'; }),
  L36: () => {
    const w = base();
    prefill(w, 'bk1', 30);
    cmd07(w, { type: 'powerMeter', on: true });
    cmd07(w, { type: 'setProbeDepth', vesselId: 'bk1', immersionCm: 1.8, bottomContact: false });
    run07(w, 0.2);
    const r = dispatchP07(w, { type: 'readConductivity' });
    return { w, effect: !w.readings[r.id!].valid };
  },
  L37: () => {
    const w = base();
    w.vessels.bk2.polar = solutionComp('NaCl', 0.1, 30);
    w.vessels.btWater.polar.water! -= 30 * MATERIALS.water.densityGml;
    cmd07(w, { type: 'powerMeter', on: true });
    const r = readKappa(w, 'bk2', 'LOW');
    return { w, effect: !r.ok && Number.isNaN(w.readings[r.id!].value) && w.readings[r.id!].qualityFlags.includes('OVER_RANGE') };
  },
  L38: () => {
    const w = base();
    w.vessels.bk2.polar = solutionComp('CuSO4_5H2O', 0.05, 30);
    w.vessels.btWater.polar.water! -= 30 * MATERIALS.water.densityGml;
    prefill(w, 'bk1', 30);
    cmd07(w, { type: 'powerMeter', on: true });
    cmd07(w, { type: 'setProbeDepth', vesselId: 'bk2', immersionCm: 1.8, bottomContact: false });
    run07(w, 3);
    cmd07(w, { type: 'setProbeDepth', vesselId: 'bk1', immersionCm: 1.8, bottomContact: false });
    return { w, effect: (w.vessels.bk1.polar.CuSO4_5H2O ?? 0) > 0 };
  },
  L39: () => {
    const w = base();
    prefill(w, 'bk1', 30);
    place(w, 'tipA', 'bk1', 1);
    const r = dispatchP07(w, { type: 'setProbeDepth', vesselId: 'spCu', immersionCm: 1, bottomContact: false });
    return { w, effect: !r.ok };
  },
  L40: () => {
    const w = base({ scenarios: [S.PROBE_TEMPERATURE] });
    w.vessels.bk2.polar = solutionComp('NaCl', 0.01, 30);
    w.vessels.bk2.tempC = 21;
    w.vessels.btWater.polar.water! -= 30 * MATERIALS.water.densityGml;
    cmd07(w, { type: 'powerMeter', on: true });
    cmd07(w, { type: 'setAtc', on: false });
    const r = readKappa(w, 'bk2', 'MID');
    return { w, effect: w.readings[r.id!].qualityFlags.includes('TEMP_UNCOMPENSATED') };
  },
  L41: () => {
    const w = base();
    const nb = emptyNb();
    meterReady(w);
    const mA = weighOut(w, 'wg1', 'jarNaCl', 0.55);
    cmd07(w, { type: 'cleanTool', toolId: 'spatula' });
    place(w, 'spatula', 'wg1', 1);
    cmd07(w, { type: 'scoop', sourceId: 'wg1' });
    place(w, 'spatula', 'bench', 1);
    cmd07(w, { type: 'dropSpatula', targetId: 'bench' });
    cmd07(w, { type: 'dispose', vesselId: 'wg1', wasteId: 'fl1' });
    const vA = fillToMark(w, 'fl1').id!;
    stir(w, 'fl1', 12);
    pourTo(w, 'fl1', 'bk2', 30);
    const kA = readKappa(w, 'bk2', 'HIGH').id!;
    const m = w.readings[mA].value;
    Object.assign(nb.tableD.strongA, { sample: 'NaCl', mass: { value: String(m), uncertainty: '', readingId: mA }, volume: { value: '100', uncertainty: '', readingId: vA }, conc: { value: (m / 58.44 / 0.1).toFixed(4), uncertainty: '0,001', readingId: null }, kappa: { value: String(w.readings[kA].value), uncertainty: '', readingId: kA }, kappaUnit: 'mS/cm' });
    return { w, nb, effect: (w.readings[kA].snapshot.trueConcM ?? 0) < (m / 58.44 / 0.1) * 0.95 };
  },
  L42: () => {
    const w = base();
    prefill(w, 'fl2', 10);
    w.vessels.fl2.polar.NaCl = 0.05844;
    w.vessels.jarNaCl.solid.NaCl! -= 0.05844;
    for (let i = 0; i < 60; i++) cmd07(w, { type: 'squeezeWash', targetId: 'fl2', ml: 100 / 60 });
    return { w, effect: vesselMl(w.vessels.fl2) > 105 || (w.spills.bench.water ?? 0) > 0 };
  },
  L43: () => {
    const w = base();
    prefill(w, 'fl1', 1);
    spoon(w, 'jarNaCl', 'fl1');
    stir(w, 'fl1', 20);
    fillToMark(w, 'fl1');
    const avg = (w.vessels.fl1.polar.NaCl ?? 0) / vesselMl(w.vessels.fl1);
    dropperTransfer(w, 'dp1', 'fl1', 'tube1', 5);
    const t = w.vessels.tube1;
    return { w, effect: (t.polar.NaCl ?? 0) / vesselMl(t) < avg * 0.9 };
  },
  L44: () => {
    const w = base();
    const nb = emptyNb();
    meterReady(w);
    prefill(w, 'bk2', 30);
    w.vessels.bk2.solid.NaHCO3 = 3.5;
    w.vessels.jarNaHCO3.solid.NaHCO3! -= 3.5;
    stir(w, 'bk2', 60);
    run07(w, 2);
    const k = readKappa(w, 'bk2', 'HIGH');
    Object.assign(nb.tableD.strongA, { sample: 'NaHCO3', mass: { value: '3,50', uncertainty: '', readingId: null }, volume: { value: '30', uncertainty: '', readingId: null }, conc: { value: (3.5 / 84.01 / 0.03).toFixed(3), uncertainty: '0,01', readingId: null }, kappa: { value: String(w.readings[k.id!].value), uncertainty: '', readingId: k.id! }, kappaUnit: 'mS/cm' });
    return { w, nb, effect: (w.vessels.bk2.solid.NaHCO3 ?? 0) > 0.3 };
  },
  L45: () => nbCase((_w, nb) => Object.assign(nb.tableE.X, { test1: 'appearance', test2: '', result2: null })),
  L46: () => nbCase((_w, nb) => { nb.tableF.graphite.explanation = 'El grafito conduce porque es metálico como el cobre.'; }),
  L47: () => nbCase((_w, nb) => { nb.analysis.q5 = 'El ácido acético es un compuesto iónico porque su disolución conduce.'; }),
  L48: () => {
    const w = base();
    const nb = emptyNb();
    prefill(w, 'tube1', 5);
    spoon(w, 'jarNaCl', 'tube1');
    const o = cmd07(w, { type: 'observe', vesselId: 'tube1' });
    stir(w, 'tube1', 20);
    Object.assign(nb.tableB.M1A, { tubeId: 'tube1', sample: 'NaCl', solvent: 'water', observationId: o.id, interpretation: 'insoluble' });
    return { w, nb, effect: (w.vessels.tube1.solid.NaCl ?? 0) < 0.005 };
  },
  L49: () => {
    const w = base();
    const nb = emptyNb();
    Object.assign(nb.tableE.X, { test1: 'solidContact', test2: 'mixWater', classification: 'ionic', limitation: '' });
    return { w, nb, effect: true };
  },
  L50: () => {
    const w = base();
    const nb = emptyNb();
    prefill(w, 'tube5', 5);
    dropperTransfer(w, 'dp2', 'btMineralOil', 'tube5', 2);
    run07(w, 10);
    const o = cmd07(w, { type: 'observe', vesselId: 'tube5' });
    Object.assign(nb.tableB.M1A, { tubeId: 'tube5', sample: 'mineralOil', solvent: 'water', observationId: o.id, interpretation: 'miscible' });
    return { w, nb, effect: w.readings[o.id!].snapshot.phases === 2 };
  },
  L51: () => nbCase((_w, nb) => { nb.analysis.q6 = 'El CO₂ tiene enlaces polares, por lo tanto la molécula es polar y se mezcla con agua.'; }),
  L52: () => nbCase((_w, nb) => { nb.analysis.q2 = 'En el cristal seco los iones se mueven libremente como en la disolución.'; }),
  L53: () => nbCase((_w, nb) => { nb.analysis.q3 = 'La sacarosa se disocia en iones al disolverse en el agua.'; }),
  L54: () => nbCase((_w, nb) => { nb.conclusion = 'Lo semejante disuelve a lo semejante, siempre y para todos los casos que vimos.'; }),
  L55: () => nbCase((_w, nb) => {
    nb.tableD.strongA.kappa.readingId = null;
    nb.tableD.strongB.kappa.readingId = null;
  }),
  L56: () => nbCase((w, nb) => {
    const m = w.readings[nb.tableD.strongA.mass.readingId!].value;
    nb.tableD.strongA.conc.value = (m / 0.1).toFixed(2).replace('.', ',');
  }),
  L57: () => nbCase((_w, nb) => { nb.tableD.strongA.kappaUnit = 'S/m'; }),
  L58: () => nbCase((_w, nb) => { nb.tableD.strongA.temp = '298 K'; }),
  L59: () => nbCase((_w, nb) => {
    nb.tableD.strongA.conc.value = '0,1146789';
    nb.tableD.strongA.conc.uncertainty = '';
  }),
  L60: () => {
    const w = base();
    const nb = emptyNb();
    Object.assign(nb.tableE.Y, { test1: 'mixWater', classification: 'molecular', limitation: 'es seguro' });
    return { w, nb, effect: true };
  },
};

describe('Práctica 7 — catálogo de errores L01–L60 (§9.7)', () => {
  it('el catálogo tiene 60 códigos con contrato completo', () => {
    expect(SIMULATED_ERRORS_P07.map((e) => e.code)).toEqual(Array.from({ length: 60 }, (_, i) => `L${String(i + 1).padStart(2, '0')}`));
    for (const e of SIMULATED_ERRORS_P07) expect(e.affectedRubricItems.length).toBeGreaterThan(0);
  });

  for (const spec of SIMULATED_ERRORS_P07) {
    it(`${spec.testCaseId}: ${spec.evidenceKey}`, () => {
      const make = CASES[spec.code];
      expect(make, `falta el caso ${spec.code}`).toBeTruthy();
      const { w, nb, effect } = make();
      const [kind, key] = spec.evidenceKey.split(':');
      const issues = nb ? notebookIssues(w, nb) : [];
      const detected = kind === 'err' ? (w.evidence[spec.evidenceKey] ?? 0) > 0 || issues.includes(spec.evidenceKey) : issues.includes(spec.evidenceKey);
      expect(detected, `${spec.code} no se detectó (${issues.join(',')})`).toBe(true);
      expect(effect, `${spec.code}: la consecuencia no se produjo`).toBe(true);
      // Retroalimentación localizada (consecuencia → causa → qué revisar).
      expect((es7 as { p7fb: Record<string, string> }).p7fb[key], `falta p7fb.${key}`).toBeTruthy();
    });
  }
});
