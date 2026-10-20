/**
 * Práctica 1 — recorridos completos sin escena (§17.2): ruta ideal por comandos hasta la entrega con la máquina por
 * etapas y la evaluación; conservación de masa; series de agua trazables; los 64 errores P01-E001…E064 con su
 * disparador y su consecuencia; los 12 escenarios docentes; pipeta TD sin soplar; paralaje; reanudación segura.
 */
import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import type { P01World } from '../../simulation/density-world/types';
import { conservedTotals, cylinderApparentMl, fluidMl, pipetteAboveMarkMl, S } from '../../simulation/density-world/world';
import { emptyP01Notebook, type P01Notebook } from '../../practices/practice-01/notebook';
import {
  caliperReadings, cylinderMassReadings, displacementReadings, expectedDisplacement, expectedGeometry, expectedWater, nailMassReadings, sampleReadings,
} from '../../practices/practice-01/expected-results';
import { p01StageEvidence } from '../../practices/practice-01/evidence';
import { practice01Machine, p01StageName } from '../../practices/practice-01/workflow.machine';
import { P01_WEIGHTS, evaluateP01, notebookIssues } from '../../practices/practice-01/rubric';
import { SIMULATED_ERRORS_P01, P01_SCENARIOS, errKey } from '../../practices/practice-01/error-scenarios';
import { sanitizeOnResume01 } from '../../practices/practice-01/resume';
import { rhoWaterGPerMl } from '../../simulation/density-models/water';
import es01 from '../../locales/es/practice01.json';
import * as h from '../helpers01';

const f = (v: number, d: number) => (Number.isFinite(v) ? v.toFixed(d).replace('.', ',') : '');
const ev = (w: P01World, k: string) => w.evidence[`err:${k}`] ?? 0;

/** Ruta ideal completa: PPE, reconocimiento, balanza, pruebas, dos series de agua, clavos y cilindro. */
function idealRoute(seed = 101, scenarios: string[] = []) {
  const w = h.world01({ seed, scenarios: scenarios as never });
  const t0 = conservedTotals(w);
  h.ppe(w);
  h.recognize(w);
  h.balanceCheck(w);
  const trials = h.trials(w);
  const room = h.waterSeries(w, 'room');
  h.coolReservoir(w);
  const cold = h.waterSeries(w, 'cold');
  const disp = h.displacement(w);
  const geo = h.geometry(w);
  return { w, t0, trials, room, cold, disp, geo };
}

/** Lo que escribe un estudiante cuidadoso con SUS lecturas. */
function fillNotebook(w: P01World, nb: P01Notebook) {
  const imp = (e: P01Notebook['trialProbe'], id: string | undefined, d: number) => {
    if (!id) return;
    e.readingId = id;
    e.value = f(w.readings[id].value, d);
  };
  nb.convention = 'RECTANGULAR';
  const A = nb.tableA;
  A.balance = { capacity: '600 g', division: '0,01 g', uncertainty: '0,01', use: 'masas por diferencia y con tara' };
  A.pipette = { capacity: '25,00 mL', division: 'marca única', uncertainty: '0,03', use: 'entregar un volumen exacto' };
  A.cylinder = { capacity: '50 mL', division: '1 mL', uncertainty: '0,5', use: 'volúmenes aproximados y desplazamiento' };
  A.thermometer = { capacity: '-50 a 150 °C', division: '0,1 °C', uncertainty: '0,2', use: 'temperatura de la muestra' };
  A.caliper = { capacity: '15 cm', division: '0,002 cm', uncertainty: '0,002', use: 'dimensiones de piezas' };
  for (const series of ['room', 'cold'] as const) {
    const r = sampleReadings(w, series);
    const row = nb.tableB[series];
    imp(row.mass, r.mass?.id, 2);
    imp(row.temp, r.temp?.id, 1);
    row.volume.value = '25,00';
    const e = expectedWater(w, nb, series);
    row.density.value = f(e.rho, 4);
    row.density.uncertainty = f(e.urho, 4);
  }
  const nm = nailMassReadings(w);
  const dr = displacementReadings(w);
  const C = nb.tableC;
  imp(C.boatMass, nm.boat?.id, 2);
  imp(C.boatNailsMass, nm.boatNails?.id, 2);
  imp(C.vInitial, dr.initial?.id, 1);
  imp(C.vFinal, dr.final?.id, 1);
  const de = expectedDisplacement(w, nb);
  C.netMass.value = f(de.mNet, 2);
  C.dV.value = f(de.dV, 1);
  C.density.value = f(de.rho, 2);
  C.density.uncertainty = f(de.urho, 2);
  nb.referenceC = 'hierro 7,87 g/mL (tabla del docente)';
  nb.errorC = f(de.errPct, 1);
  const cm = cylinderMassReadings(w);
  const cal = caliperReadings(w);
  const D = nb.tableD;
  imp(D.glassMass, cm.glass?.id, 2);
  imp(D.totalMass, cm.total?.id, 2);
  imp(D.d1, cal.diameters[0]?.id, 3);
  imp(D.d2, cal.diameters[1]?.id, 3);
  imp(D.h1, cal.heights[0]?.id, 3);
  imp(D.h2, cal.heights[1]?.id, 3);
  const ge = expectedGeometry(w, nb);
  D.netMass.value = f(ge.mNet, 2);
  D.dMean.value = f(ge.dMean, 3);
  D.hMean.value = f(ge.hMean, 3);
  D.volume.value = f(ge.V, 3);
  D.volume.uncertainty = f(ge.uV, 3);
  D.density.value = f(ge.rho, 3);
  D.density.uncertainty = f(ge.urho, 3);
  nb.referenceD = 'aluminio 2,70 g/cm³';
  nb.errorD = f(ge.errPct, 2);
  const long = 'Se desarrolla el cálculo paso a paso con las unidades declaradas y la incertidumbre de cada lectura.';
  nb.procedure = { mass: long, volume: long, density: long };
  nb.sources = { water: 'la tolerancia de la pipeta', displacement: 'la lectura de la probeta (±0,5 mL)', geometry: 'la masa por diferencia' };
  for (const q of Object.keys(nb.analysis) as Array<keyof P01Notebook['analysis']>) nb.analysis[q] = `${long} Respuesta a ${q} con mis propios datos.`;
}

describe('ruta ideal (§17.2)', () => {
  it('desde el EPP hasta la entrega, por comandos reales; la máquina avanza solo por evidencia', () => {
    const { w, t0, trials, room, cold, disp, geo } = idealRoute();
    expect(trials.probe.value).toBe(25);
    expect(trials.pip.value).toBe(25);
    // Agua: masas cercanas a ρ(T)·V (dentro de la tolerancia de la pipeta) y la fría más pesada.
    expect(room.mass.value).toBeGreaterThan(24.85);
    expect(room.mass.value).toBeLessThan(25.0);
    expect(cold.mass.value).toBeGreaterThan(room.mass.value);
    expect(cold.temp.value).toBeLessThan(10);
    expect(room.mass.id).not.toBe(cold.mass.id);
    // Desplazamiento: 20,0 y 22,5 mL (§8.2) → 8,0 g/mL con las lecturas observadas.
    expect(disp.vI.value).toBe(20);
    expect(disp.vF.value).toBe(22.5);
    expect(disp.boatNails.value - disp.boat.value).toBeCloseTo(20, 1);
    // Cilindro: 2,000 × 2,500 cm, 21,21 g.
    expect(geo.total.value - geo.glass.value).toBeCloseTo(21.2, 1);
    expect(geo.d1.value).toBe(2);
    expect(geo.h1.value).toBe(2.5);
    // Sin errores de técnica en la ruta ideal.
    expect(Object.entries(w.evidence).filter(([k, v]) => k.startsWith('err:') && v)).toEqual([]);
    // Conservación exacta de agua, metal y cilindro.
    const t1 = conservedTotals(w);
    expect(Math.abs(t1.water - t0.water)).toBeLessThan(1e-7);
    expect(t1.metal).toBe(t0.metal);
    expect(t1.solid).toBe(t0.solid);

    const nb = emptyP01Notebook();
    fillNotebook(w, nb);
    const actor = createActor(practice01Machine);
    actor.start();
    actor.send({ type: 'START' });
    actor.send({ type: 'PPE_CONFIRMED' });
    actor.send({ type: 'EVIDENCE', flags: p01StageEvidence(w, nb) });
    expect(p01StageName(actor.getSnapshot().value)).toBe('COMPLETE');
    expect(notebookIssues(w, nb)).toEqual([]);
    const evn = evaluateP01(w, nb);
    expect(evn.total).toBeGreaterThan(0.9);
    for (const c of evn.components.filter((x) => x.id !== 'discussion')) expect(c.score, c.id).toBeGreaterThan(0.97);
    expect(evn.needsTeacherReview.length).toBeGreaterThan(0);
  });

  it('los pesos de la rúbrica suman 100 %', () => {
    expect(Object.values(P01_WEIGHTS).reduce((s, x) => s + x, 0)).toBeCloseTo(1, 12);
  });

  it('una lectura sesgada cambia lo esperado para ESA lectura, no el valor ideal', () => {
    const { w } = idealRoute(202);
    const nb = emptyP01Notebook();
    fillNotebook(w, nb);
    nb.tableB.room.mass = { value: '24,70', uncertainty: '', readingId: null };
    const e = expectedWater(w, nb, 'room');
    expect(e.rho).toBeCloseTo(24.7 / 25, 10);
    nb.tableB.room.density.value = f(e.rho, 4);
    expect(evaluateP01(w, nb).components.find((c) => c.id === 'water')!.items.find((i) => i.key === 'p01.rhoRoom')!.ok).toBe(true);
  });

  it('no existe un comando de «siguiente etapa»', () => {
    const w = h.world01();
    expect(h.cmd01(w, { type: 'nextStage' } as never).ok).toBe(false);
  });
});

describe('agua, pipeta y temperatura (§5.B, §6)', () => {
  it('la pipeta TD entrega su volumen calibrado SIN soplar (residuo en la punta)', () => {
    const w = h.world01({ seed: 5 });
    h.ppe(w);
    h.balanceCheck(w);
    h.fillPipette(w, 'waterRoom01');
    h.deliver(w);
    const s = w.samples[0];
    const ml = s.deliveredG / rhoWaterGPerMl(s.tempAtDeliveryC);
    expect(Math.abs(ml - w.pipette.trueDeliverMl)).toBeLessThan(0.006);
    expect(Math.abs(ml - 25)).toBeLessThanOrEqual(0.03);
    expect(w.pipette.residueG).toBeGreaterThan(0.09);
  });

  it('enfriar cambia la masa del mismo volumen sin cambiar la masa total', () => {
    const w = h.world01();
    h.ppe(w);
    const t0 = conservedTotals(w).water;
    const ml0 = fluidMl(w.fluids.waterCold01);
    h.coolReservoir(w);
    expect(w.fluids.waterCold01.tempC).toBeLessThan(6);
    expect(fluidMl(w.fluids.waterCold01)).toBeLessThan(ml0);
    expect(conservedTotals(w).water).toBeCloseTo(t0, 9);
  });

  it('el termómetro no salta: tarda según su constante de tiempo', () => {
    const w = h.world01();
    h.ppe(w);
    h.coolReservoir(w);
    h.cmd01(w, { type: 'setPose', id: 'thermometer01', pose: h.pose(128, 26, 3), support: 'waterCold01' });
    h.run01(w, 1);
    expect(w.thermometer.displayedC).toBeGreaterThan(15);
    h.run01(w, 30);
    expect(w.thermometer.displayedC).toBeLessThan(6.5);
  });

  it('la lectura de la probeta con paralaje difiere de la lectura a nivel del ojo', () => {
    const w = h.world01();
    h.ppe(w);
    h.pourInto(w, 'waterRoom01', 'cylinder50', 20);
    h.run01(w, 2);
    const level = h.cmd01(w, { type: 'readVolume', instrumentId: 'cylinder50', eyeDzCm: 0 }).value!;
    const high = h.cmd01(w, { type: 'readVolume', instrumentId: 'cylinder50', eyeDzCm: 12 }).value!;
    expect(high).not.toBe(level);
  });

  it('el aire atrapado aumenta el desplazamiento aparente; los clavos fuera del agua lo disminuyen', () => {
    const a = h.world01();
    h.ppe(a);
    h.balanceCheck(a);
    const fast = h.displacement(a, { gentle: false, tap: false });
    const b = h.world01();
    h.ppe(b);
    h.balanceCheck(b);
    h.displacement(b);
    expect(cylinderApparentMl(a) - fluidMl(a.fluids.cylinder50)).toBeGreaterThan(cylinderApparentMl(b) - fluidMl(b.fluids.cylinder50));
    expect(fast.vF.qualityFlags).toContain('AIR');
    const c = h.world01();
    h.ppe(c);
    h.pourInto(c, 'waterRoom01', 'cylinder50', 1.2);
    h.cmd01(c, { type: 'transferNails', from: 'nailsBatch01', to: 'cylinder50', count: 6, gentle: true, tool: 'tongs' });
    const before = fluidMl(c.fluids.cylinder50);
    expect(cylinderApparentMl(c) - before).toBeLessThan(2.4);
  });

  it('reanudar deja todo quieto: sin aspirar, sin descargar, sin vertidos ni nada en la mano', () => {
    const w = h.world01();
    h.ppe(w);
    h.pipetteTo(w, 'waterRoom01');
    h.cmd01(w, { type: 'attachFiller', on: true });
    h.cmd01(w, { type: 'setAspirate', suction01: 0.6 });
    h.cmd01(w, { type: 'setPour', sourceId: 'waterCold01', targetId: 'erlenmeyer150', tiltDeg: 100 });
    h.cmd01(w, { type: 'setPose', id: 'caliper01', pose: h.pose(368, 16, 10), support: 'hand' });
    sanitizeOnResume01(w);
    expect(w.pipette.suction01).toBe(0);
    expect(w.pipette.release01).toBe(0);
    expect(Object.keys(w.pours)).toEqual([]);
    expect(Object.values(w.objects).some((o) => o.support === 'hand')).toBe(false);
  });
});

/** Disparador de cada error del catálogo: deja el mundo (y la libreta) con el error y su consecuencia. */
function trigger(code: string): { w: P01World; nb: P01Notebook; effect: boolean } {
  const base = () => {
    const w = h.world01({ seed: 303 });
    h.ppe(w);
    h.balanceCheck(w);
    return w;
  };
  const nb = emptyP01Notebook();
  switch (code) {
    case 'ppe_goggles':
    case 'ppe_coat':
    case 'ppe_shoes':
    case 'hair_untied': {
      const w = h.world01();
      const item = { ppe_goggles: 'goggles', ppe_coat: 'coat', ppe_shoes: 'shoes', hair_untied: 'hair' }[code] as 'goggles';
      for (const k of ['coat', 'goggles', 'shoes', 'hair'] as const) if (k !== item) h.cmd01(w, { type: 'equipPpe', item: k, on: true });
      const r = h.cmd01(w, { type: 'startWork' });
      return { w, nb, effect: !r.ok && !w.ppe && h.cmd01(w, { type: 'tare' }).code === 'PPE' };
    }
    case 'workbench_clutter': {
      const w = base();
      for (const id of ['waterRoom01', 'washBottle', 'thermometer01']) h.cmd01(w, { type: 'setPose', id, pose: h.pose(200 + Math.random() * 0 + 6, 40), support: 'bench' });
      const r = h.onPan(w, 'erlenmeyer150');
      return { w, nb, effect: r.code === 'CLUTTER' && !w.balance.panIds.includes('erlenmeyer150') };
    }
    case 'damaged_glass': {
      const w = base();
      const r = h.onPan(w, 'erlenmeyer150b');
      return { w, nb, effect: r.code === 'DAMAGED_GLASS' && w.balance.panIds.length === 0 };
    }
    case 'erlenmeyer_as_volumetric': {
      const w = base();
      h.pourInto(w, 'waterRoom01', 'erlenmeyer150', 25);
      const r = h.cmd01(w, { type: 'readVolume', instrumentId: 'erlenmeyer150', eyeDzCm: 0 });
      return { w, nb, effect: w.readings[r.id!].resolution === 5 && w.readings[r.id!].qualityFlags.includes('NON_VOLUMETRIC') };
    }
    case 'balance_unleveled': {
      const w = h.world01({ scenarios: [S.BALANCE_OFFLEVEL] });
      h.ppe(w);
      h.cmd01(w, { type: 'powerBalance', on: true });
      h.run01(w, 10);
      h.cmd01(w, { type: 'tare' });
      h.onPan(w, 'watchGlass01');
      const m = h.readMass(w);
      return { w, nb, effect: Math.abs(m.value - w.params.watchGlassMassG) > 0.005 };
    }
    case 'mass_unstable': {
      const w = base();
      h.onPan(w, 'watchGlass01');
      const r = h.cmd01(w, { type: 'readBalance' });
      return { w, nb, effect: w.readings[r.id!].qualityFlags.includes('UNSTABLE') && !r.ok };
    }
    case 'tara_missing': {
      const w = base();
      h.onPan(w, 'erlenmeyer150');
      h.fillPipette(w, 'waterRoom01');
      h.deliver(w);
      const m = h.readMass(w);
      return { w, nb, effect: m.value > 90 && m.qualityFlags.includes('NO_TARE') };
    }
    case 'tara_with_extra_load': {
      const w = base();
      h.onPan(w, 'erlenmeyer150');
      h.onPan(w, 'watchGlass01');
      h.run01(w, 2);
      h.cmd01(w, { type: 'tare' });
      h.cmd01(w, { type: 'setPose', id: 'watchGlass01', pose: h.pose(338, 28), support: 'bench' });
      h.fillPipette(w, 'waterRoom01');
      h.deliver(w);
      const m = h.readMass(w);
      return { w, nb, effect: m.value < 24.9 - 18 };
    }
    case 'wet_weigh_vessel': {
      const w = base();
      h.cmd01(w, { type: 'cleanObject', objectId: 'watchGlass01', action: 'wash' });
      h.onPan(w, 'watchGlass01');
      const m = h.readMass(w);
      return { w, nb, effect: m.value > w.params.watchGlassMassG + 0.2 && m.qualityFlags.includes('WET') };
    }
    case 'wet_balance_pan': {
      const w = base();
      h.cmd01(w, { type: 'setPose', id: 'pipette25', pose: h.pose(205, 44, 20), support: 'hand' });
      h.cmd01(w, { type: 'attachFiller', on: true });
      h.pipetteTo(w, 'waterRoom01');
      h.cmd01(w, { type: 'setAspirate', suction01: 0.6 });
      h.run01(w, 6);
      h.cmd01(w, { type: 'setAspirate', suction01: 0 });
      h.cmd01(w, { type: 'setPose', id: 'pipette25', pose: h.pose(205, 44, 20), support: 'hand' });
      h.cmd01(w, { type: 'setPipetteRelease', release01: 1 });
      h.run01(w, 1);
      return { w, nb, effect: w.balance.panWetG > 0 && h.cmd01(w, { type: 'readBalance' }).code === 'PAN_WET' };
    }
    case 'load_removed_early': {
      const w = base();
      h.onPan(w, 'watchGlass01');
      h.run01(w, 0.3);
      h.cmd01(w, { type: 'setPose', id: 'watchGlass01', pose: h.pose(338, 28), support: 'bench' });
      h.run01(w, 2.5);
      const r = h.cmd01(w, { type: 'readBalance' });
      return { w, nb, effect: Math.abs(w.readings[r.id!].value) < 0.05 };
    }
    case 'balance_zero_bias_ignored': {
      const w = h.world01({ scenarios: [S.BALANCE_ZERO] });
      h.ppe(w);
      h.cmd01(w, { type: 'powerBalance', on: true });
      h.run01(w, 12);
      h.onPan(w, 'watchGlass01');
      const m = h.readMass(w);
      return { w, nb, effect: Math.abs(m.value - w.params.watchGlassMassG - 0.05) < 0.011 };
    }
    case 'pipette_air_aspiration': {
      const w = base();
      h.cmd01(w, { type: 'attachFiller', on: true });
      h.cmd01(w, { type: 'setPose', id: 'pipette25', pose: h.pose(110, 26, 20), support: 'hand' });
      h.cmd01(w, { type: 'setAspirate', suction01: 0.5 });
      h.run01(w, 1);
      return { w, nb, effect: w.pipette.airMl > 0.5 && w.pipette.waterG === 0 };
    }
    case 'pipette_bubble': {
      const w = h.world01({ scenarios: [S.PIPETTE_AIR] });
      h.ppe(w);
      h.balanceCheck(w);
      h.onPan(w, 'erlenmeyer150');
      h.run01(w, 2);
      h.cmd01(w, { type: 'tare' });
      h.fillPipette(w, 'waterRoom01');
      h.deliver(w);
      return { w, nb, effect: w.samples[0].deliveredG < 24.9 - 0.1 };
    }
    case 'pipette_overfill':
    case 'pipette_underfill': {
      const w = base();
      h.cmd01(w, { type: 'attachFiller', on: true });
      h.pipetteTo(w, 'waterRoom01');
      h.cmd01(w, { type: 'setAspirate', suction01: 0.6 });
      const target = code === 'pipette_overfill' ? 0.4 : -0.4;
      for (let i = 0; i < 400 && pipetteAboveMarkMl(w) < target; i++) h.run01(w, 0.05);
      h.cmd01(w, { type: 'setAspirate', suction01: 0 });
      h.deliver(w);
      const d = w.samples[0].deliveredG;
      return { w, nb, effect: code === 'pipette_overfill' ? d > 25.1 : d < 24.7 };
    }
    case 'filler_contaminated': {
      const w = base();
      h.cmd01(w, { type: 'attachFiller', on: true });
      h.pipetteTo(w, 'waterRoom01');
      h.cmd01(w, { type: 'setAspirate', suction01: 1 });
      h.run01(w, 15);
      return { w, nb, effect: w.pipette.fillerContaminated && !!w.safety.incident && h.cmd01(w, { type: 'setAspirate', suction01: 0.5 }).ok === false };
    }
    case 'pipette_not_vertical':
    case 'pipette_parallax': {
      const w = base();
      h.cmd01(w, { type: 'attachFiller', on: true });
      h.pipetteTo(w, 'waterRoom01');
      if (code === 'pipette_not_vertical') w.objects.pipette25.pose.rotationRad = 0.2;
      h.cmd01(w, { type: 'setAspirate', suction01: 0.6 });
      for (let i = 0; i < 400 && pipetteAboveMarkMl(w) < 0.6; i++) h.run01(w, 0.05);
      h.cmd01(w, { type: 'setAspirate', suction01: 0 });
      h.cmd01(w, { type: 'adjustMeniscus', eyeDzCm: code === 'pipette_parallax' ? 12 : 0 });
      return { w, nb, effect: Math.abs(pipetteAboveMarkMl(w)) > 0.03 };
    }
    case 'pipette_tip_wicked': {
      const w = base();
      h.fillPipette(w, 'waterRoom01', { wipe: false });
      const before = w.pipette.waterG;
      h.cmd01(w, { type: 'wipeTip', method: 'orifice' });
      return { w, nb, effect: w.pipette.waterG < before - 0.05 };
    }
    case 'pipette_blowout': {
      const w = base();
      h.fillPipette(w, 'waterRoom01');
      h.pipetteTo(w, 'erlenmeyer150');
      h.cmd01(w, { type: 'setPipetteRelease', release01: 1 });
      h.run01(w, 17);
      h.cmd01(w, { type: 'blowOut' });
      const d = w.samples[0].deliveredG;
      const ml = w.fluids.erlenmeyer150.waterG;
      return { w, nb, effect: ml > d + 0.08 };
    }
    case 'pipette_drain_early': {
      const w = base();
      h.fillPipette(w, 'waterRoom01');
      h.deliver(w, 'erlenmeyer150', 9);
      return { w, nb, effect: w.samples[0].deliveredG < 24.5 };
    }
    case 'pour_off_target': {
      const w = base();
      h.fillPipette(w, 'waterRoom01');
      h.cmd01(w, { type: 'setPipetteRelease', release01: 1 });
      h.run01(w, 3);
      return { w, nb, effect: w.fluids.benchSpill.waterG > 1 };
    }
    case 'receiving_flask_wet': {
      const w = base();
      h.cmd01(w, { type: 'cleanObject', objectId: 'erlenmeyer150', action: 'wash' });
      h.onPan(w, 'erlenmeyer150');
      h.run01(w, 2);
      h.cmd01(w, { type: 'tare' });
      h.fillPipette(w, 'waterRoom01');
      h.deliver(w);
      h.run01(w, 60);
      const m = h.readMass(w);
      return { w, nb, effect: m.value < w.samples[0].deliveredG - 0.03 };
    }
    case 'cross_sample_residue': {
      const w = base();
      h.fillPipette(w, 'waterRoom01');
      h.deliver(w);
      h.coolReservoir(w);
      h.cmd01(w, { type: 'emptyInto', sourceId: 'erlenmeyer150', targetId: 'waste01' });
      h.fillPipette(w, 'waterCold01');
      return { w, nb, effect: w.pipette.tempC > w.fluids.waterCold01.tempC + 0.05 };
    }
    case 'cold_sample_warmed': {
      const w = base();
      h.coolReservoir(w);
      h.fillPipette(w, 'waterCold01');
      h.deliver(w);
      const t0 = w.fluids.erlenmeyer150.tempC;
      h.run01(w, 400);
      h.cmd01(w, { type: 'setPose', id: 'thermometer01', pose: h.pose(172, 24, 3), support: 'erlenmeyer150' });
      h.run01(w, 25);
      h.cmd01(w, { type: 'readThermometer' });
      return { w, nb, effect: w.fluids.erlenmeyer150.tempC > t0 + 1.5 };
    }
    case 'thermometer_unstable':
    case 'thermometer_wall_contact':
    case 'thermometer_shallow': {
      const w = base();
      h.coolReservoir(w);
      h.cmd01(w, { type: 'setPose', id: 'thermometer01', pose: h.pose(128, 26, 3), support: 'waterCold01' });
      if (code === 'thermometer_wall_contact') h.cmd01(w, { type: 'setThermometerInsertion', depthCm: 3, touchingWall: true });
      if (code === 'thermometer_shallow') h.cmd01(w, { type: 'setThermometerInsertion', depthCm: 0.2, touchingWall: false });
      h.run01(w, code === 'thermometer_unstable' ? 1 : 40);
      const r = h.cmd01(w, { type: 'readThermometer' });
      return { w, nb, effect: r.value! > w.fluids.waterCold01.tempC + 1 };
    }
    case 'bath_not_ready': {
      const w = base();
      h.fillPipette(w, 'waterCold01');
      return { w, nb, effect: w.pipette.tempC > 20 };
    }
    case 'cylinder_not_vertical': {
      const w = base();
      h.pourInto(w, 'waterRoom01', 'cylinder50', 20);
      h.run01(w, 2);
      w.objects.cylinder50.pose.rotationRad = 0.15;
      const r = h.cmd01(w, { type: 'readVolume', instrumentId: 'cylinder50', eyeDzCm: 0 });
      return { w, nb, effect: r.value! > 20.4 };
    }
    case 'cylinder_parallax': {
      const w = base();
      h.pourInto(w, 'waterRoom01', 'cylinder50', 20);
      h.run01(w, 2);
      const r = h.cmd01(w, { type: 'readVolume', instrumentId: 'cylinder50', eyeDzCm: 12 });
      return { w, nb, effect: Math.abs(r.value! - cylinderApparentMl(w)) >= 0.5 };
    }
    case 'initial_read_too_late': {
      const w = base();
      h.pourInto(w, 'waterRoom01', 'cylinder50', 20);
      h.cmd01(w, { type: 'transferNails', from: 'nailsBatch01', to: 'cylinder50', count: 1, gentle: true, tool: 'tongs' });
      h.run01(w, 2);
      const vi = h.cmd01(w, { type: 'readVolume', instrumentId: 'cylinder50', eyeDzCm: 0 }).value!;
      return { w, nb, effect: vi > 20.2 };
    }
    case 'nails_partially_submerged': {
      const w = base();
      h.pourInto(w, 'waterRoom01', 'cylinder50', 1.2);
      h.cmd01(w, { type: 'transferNails', from: 'nailsBatch01', to: 'cylinder50', count: 6, gentle: true, tool: 'tongs' });
      h.run01(w, 2);
      h.cmd01(w, { type: 'readVolume', instrumentId: 'cylinder50', eyeDzCm: 0 });
      return { w, nb, effect: cylinderApparentMl(w) - fluidMl(w.fluids.cylinder50) < 2.4 };
    }
    case 'nails_splash':
    case 'trapped_air': {
      const w = base();
      h.pourInto(w, 'waterRoom01', 'cylinder50', 20);
      const before = w.fluids.spillTray01.waterG;
      h.cmd01(w, { type: 'transferNails', from: 'nailsBatch01', to: 'cylinder50', count: 6, gentle: false, tool: 'tongs' });
      return { w, nb, effect: code === 'nails_splash' ? w.fluids.spillTray01.waterG > before + 0.5 : w.cylinder.trappedAirMl > 0.3 };
    }
    case 'nails_mass_mismatch': {
      const w = base();
      h.zeroEmpty(w);
      h.onPan(w, 'weighBoat01');
      h.cmd01(w, { type: 'transferNails', from: 'nailsBatch01', to: 'weighBoat01', count: 6, gentle: true, tool: 'tongs' });
      h.readMass(w);
      h.pourInto(w, 'waterRoom01', 'cylinder50', 20);
      h.run01(w, 2);
      h.cmd01(w, { type: 'readVolume', instrumentId: 'cylinder50', eyeDzCm: 0 });
      h.cmd01(w, { type: 'transferNails', from: 'weighBoat01', to: 'cylinder50', count: 5, gentle: true, tool: 'tongs' });
      h.run01(w, 2);
      h.cmd01(w, { type: 'readVolume', instrumentId: 'cylinder50', eyeDzCm: 0 });
      return { w, nb, effect: w.nails.filter((x) => x.where === 'weighBoat01').length === 1 };
    }
    case 'meniscus_unstable': {
      const w = base();
      h.pourInto(w, 'waterRoom01', 'cylinder50', 20);
      h.cmd01(w, { type: 'transferNails', from: 'nailsBatch01', to: 'cylinder50', count: 6, gentle: false, tool: 'tongs' });
      const r = h.cmd01(w, { type: 'readVolume', instrumentId: 'cylinder50', eyeDzCm: 0 });
      return { w, nb, effect: w.readings[r.id!].qualityFlags.includes('MOVING') };
    }
    case 'cylinder_overflow': {
      const w = base();
      h.pourInto(w, 'waterRoom01', 'cylinder50', 54.5);
      h.cmd01(w, { type: 'transferNails', from: 'nailsBatch01', to: 'cylinder50', count: 6, gentle: true, tool: 'tongs' });
      return { w, nb, effect: w.fluids.spillTray01.waterG > 0.1 };
    }
    case 'caliper_oblique':
    case 'caliper_zero_bias':
    case 'caliper_excess_force':
    case 'caliper_height_misaligned': {
      const w = h.world01({ scenarios: code === 'caliper_zero_bias' ? [S.CALIPER_ZERO] : [] });
      h.ppe(w);
      const target = code === 'caliper_height_misaligned' ? 'height' : 'diameter';
      h.cmd01(w, { type: 'setCaliper', target, angleDeg: code === 'caliper_oblique' || code === 'caliper_height_misaligned' ? 12 : 0, force01: code === 'caliper_excess_force' ? 1 : 0.4, orientationDeg: 0 });
      const r = h.cmd01(w, { type: 'readCaliper' });
      const truth = target === 'height' ? 2.5 : 2;
      return { w, nb, effect: Math.abs(r.value! - truth) >= 0.004 };
    }
    default:
      return { w: h.world01(), nb, effect: false };
  }
}

/** Errores de la libreta (`nb:*`): una ruta ideal con la libreta mal llenada de la forma descrita. */
function notebookTrigger(code: string): { w: P01World; nb: P01Notebook; effect: boolean } {
  const { w } = idealRoute(404);
  const nb = emptyP01Notebook();
  fillNotebook(w, nb);
  const ge = expectedGeometry(w, nb);
  const de = expectedDisplacement(w, nb);
  const D = nb.tableD;
  const C = nb.tableC;
  switch (code) {
    case 'wrong_instrument_resolution':
      nb.tableA.cylinder.uncertainty = '0,03';
      break;
    case 'combined_mass_as_solid':
      D.netMass.value = f(w.readings[D.totalMass.readingId!].value, 2);
      break;
    case 'mismatched_mass_pair': {
      // La masa del vidrio de otra sesión de tara (la del agua).
      const other = Object.values(w.readings).find((r) => r.kind === 'mass' && r.tareSession !== w.readings[D.totalMass.readingId!].tareSession && !r.qualityFlags.includes('TARE'))!;
      D.glassMass = { value: f(other.value, 2), uncertainty: '', readingId: other.id };
      break;
    }
    case 'water_labels_swapped': {
      const a = nb.tableB.room.temp;
      nb.tableB.room.temp = nb.tableB.cold.temp;
      nb.tableB.cold.temp = a;
      break;
    }
    case 'water_monotonicity_claim':
      nb.analysis.q2 = 'El agua fría es más densa porque la densidad siempre aumenta al enfriar el agua, sin excepción.';
      break;
    case 'final_volume_as_displacement':
      C.dV.value = f(w.readings[C.vFinal.readingId!].value, 1);
      break;
    case 'negative_displacement':
      C.dV.value = f(-de.dV, 1);
      break;
    case 'radius_diameter_swapped':
      D.volume.value = f(Math.PI * ge.dMean ** 2 * ge.hMean, 3);
      break;
    case 'duplicate_dimension_reading':
      D.d2 = { ...D.d1 };
      break;
    case 'premature_rounding':
      D.dMean.value = '2';
      break;
    case 'cylinder_wrong_formula':
      D.volume.value = f(Math.PI * ge.dMean * ge.hMean, 3);
      break;
    case 'length_unit_conversion':
      D.dMean.value = f(ge.dMean * 10, 2);
      break;
    case 'density_inverted':
      D.density.value = f(ge.V / ge.mNet, 4);
      break;
    case 'uncertainty_sum_linear':
      D.density.uncertainty = f(ge.rho * (ge.um / ge.mNet + ge.uV / ge.V), 5);
      break;
    case 'volume_uncertainty_power':
      D.volume.uncertainty = f(ge.V * Math.hypot(ge.ud / ge.dMean, ge.uh / ge.hMean), 5);
      break;
    case 'absolute_relative_uncertainty':
      D.density.uncertainty = f(ge.urho / ge.rho, 6);
      break;
    case 'invalid_significant_figures':
      D.density.value = f(ge.rho, 7);
      break;
    case 'substituted_theoretical_density':
      // Con un error real de técnica el resultado medido se aleja de la tabla, y aun así se escribe 7,87.
      C.vFinal = { value: '23,5', uncertainty: '', readingId: null };
      C.density.value = '7,87';
      break;
  }
  const issues = notebookIssues(w, nb);
  return { w, nb, effect: issues.includes(`nb:${code}`) };
}

describe('catálogo de errores (§9): 64 códigos con consecuencia', () => {
  it('hay 64 códigos únicos, cada uno con su retroalimentación', () => {
    expect(SIMULATED_ERRORS_P01).toHaveLength(64);
    expect(new Set(SIMULATED_ERRORS_P01.map((x) => x.code)).size).toBe(64);
    const fb = (es01 as unknown as { p01fb: Record<string, string> }).p01fb;
    for (const x of SIMULATED_ERRORS_P01) expect(fb[errKey(x)], errKey(x)).toBeTruthy();
  });
  for (const x of SIMULATED_ERRORS_P01) {
    it(`${x.code} ${x.evidence}`, () => {
      const key = errKey(x);
      const r = x.evidence.startsWith('nb:') ? notebookTrigger(key) : trigger(key);
      if (x.evidence.startsWith('err:')) expect(ev(r.w, key), `evidencia ${x.evidence}`).toBeGreaterThan(0);
      expect(r.effect, `consecuencia de ${x.code}`).toBe(true);
    });
  }
});

describe('escenarios docentes (§10)', () => {
  it('hay 12 escenarios', () => expect(P01_SCENARIOS).toHaveLength(12));
  it('cada escenario altera el mundo de forma verificable y no cambia la semilla', () => {
    const plain = h.world01({ seed: 9 });
    for (const s of P01_SCENARIOS) {
      const w = h.world01({ seed: 9, scenarios: [s] });
      expect(w.seed).toBe(9);
      const changed =
        w.balance.levelErrorDeg !== plain.balance.levelErrorDeg || w.balance.zeroBiasG !== plain.balance.zeroBiasG || w.pipette.filmExtraMl !== plain.pipette.filmExtraMl ||
        w.thermometer.biasC !== plain.thermometer.biasC || w.thermometer.tauS !== plain.thermometer.tauS || w.bath.tempC !== plain.bath.tempC ||
        w.caliper.zeroBiasCm !== plain.caliper.zeroBiasCm || w.solid.ovality !== plain.solid.ovality || w.nails.some((n, i) => n.rhoGPerMl !== plain.nails[i].rhoGPerMl) ||
        w.scenarios.includes(S.PIPETTE_AIR) || w.scenarios.includes(S.NAILS_AIR) || w.scenarios.includes(S.SPILL_SENSITIVE);
      expect(changed, s).toBe(true);
    }
  });
  it('S09: el diámetro depende de la orientación (dispersión real, no un defecto mágico)', () => {
    const w = h.world01({ scenarios: [S.NONIDEAL_CYLINDER] });
    h.ppe(w);
    h.cmd01(w, { type: 'setCaliper', target: 'diameter', angleDeg: 0, force01: 0.4, orientationDeg: 0 });
    const a = h.cmd01(w, { type: 'readCaliper' }).value!;
    h.cmd01(w, { type: 'setCaliper', target: 'diameter', angleDeg: 0, force01: 0.4, orientationDeg: 90 });
    const b = h.cmd01(w, { type: 'readCaliper' }).value!;
    expect(a).not.toBe(b);
  });
  it('S11: con un clavo de otro material la densidad del lote deja de ser 7,87', () => {
    const { w } = idealRoute(101, [S.NAILS_MIXED]);
    const nb = emptyP01Notebook();
    fillNotebook(w, nb);
    expect(expectedDisplacement(w, nb).rho).toBeLessThan(7.6);
  });
  it('S07: con el baño débil el agua «fría» no llega a 5 °C', () => {
    const w = h.world01({ scenarios: [S.BATH_WEAK] });
    h.ppe(w);
    h.coolReservoir(w);
    expect(w.fluids.waterCold01.tempC).toBeGreaterThan(12);
  });
});
