/**
 * F101 — recorridos completos sin escena (§17, matriz «Integración»): ruta ideal por comandos hasta la entrega con la
 * máquina por etapas y la evaluación, en modo realista y curricular y con varias semillas; los 40 errores
 * F101-E01…E40 con su disparador y su consecuencia causal; los 12 escenarios docentes; recuperación tras bloqueo y
 * reanudación segura.
 */
import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import type { F101World } from '../../simulation/f101-world/types';
import { conservedTotals, cylinderContentMl, SF, stringForces } from '../../simulation/f101-world/world';
import type { F101Notebook } from '../../practices/practice-f101/notebook';
import { f101StageEvidence } from '../../practices/practice-f101/evidence';
import { practiceF101Machine, f101StageName } from '../../practices/practice-f101/workflow.machine';
import { F101_WEIGHTS, evaluateF101, notebookIssuesF101 } from '../../practices/practice-f101/rubric';
import { SIMULATED_ERRORS_F101, F101_SCENARIOS, errKeyF } from '../../practices/practice-f101/error-scenarios';
import { sanitizeOnResumeF101 } from '../../practices/practice-f101/resume';
import { expectedDensity, expectedDim } from '../../practices/practice-f101/expected-results';
import esF101 from '../../locales/es/practiceF101.json';
import * as h from '../helpersF101';

const ev = (w: F101World, k: string) => w.evidence[`err:${k}`] ?? 0;

function ideal(seed = 101, scenarios: string[] = [], mode?: 'CURRICULAR' | 'REALISTIC') {
  const r = h.idealRoute(seed, scenarios as never, mode);
  return { ...r, nb: h.fillNotebook(r.w, r.ids) };
}

describe('F101 — ruta ideal', () => {
  it('cumple las cinco etapas por evidencia y llega a COMPLETE sin errores', () => {
    const { w, nb } = ideal();
    const flags = f101StageEvidence(w, nb);
    expect(Object.values(flags).every(Boolean)).toBe(true);
    const actor = createActor(practiceF101Machine).start();
    actor.send({ type: 'START' });
    actor.send({ type: 'PPE_CONFIRMED' });
    expect(f101StageName(actor.getSnapshot().value)).toBe('EXPLORE');
    actor.send({ type: 'EVIDENCE', flags });
    expect(f101StageName(actor.getSnapshot().value)).toBe('COMPLETE');
    expect(Object.keys(w.evidence).filter((k) => k.startsWith('err:') && w.evidence[k] > 0)).toEqual([]);
    expect(notebookIssuesF101(w, nb)).toEqual([]);
  });

  it('la evaluación da el máximo automático (las respuestas abiertas quedan a revisión)', () => {
    const { w, nb } = ideal();
    const e = evaluateF101(w, nb);
    expect(Object.values(F101_WEIGHTS).reduce((s, x) => s + x, 0)).toBeCloseTo(1, 12);
    for (const c of e.components.filter((x) => x.id !== 'analysis')) expect(c.score, c.id).toBe(1);
    expect(e.total).toBeGreaterThan(0.95);
    expect(e.needsTeacherReview.length).toBeGreaterThan(0);
  });

  it('el máquina no avanza sin evidencia (no hay evento «Siguiente»)', () => {
    const w = h.worldF();
    h.ppe(w);
    h.explore(w);
    const actor = createActor(practiceF101Machine).start();
    actor.send({ type: 'START' });
    actor.send({ type: 'PPE_CONFIRMED' });
    actor.send({ type: 'EVIDENCE', flags: f101StageEvidence(w, h.fillNotebook(w, {})) });
    expect(f101StageName(actor.getSnapshot().value)).toBe('EXPLORE');
  });

  it.each([7, 2024, 99991])('semilla %i: densidad y volumen coherentes con las lecturas propias', (seed) => {
    const { w, nb } = ideal(seed);
    const d = expectedDensity(w, nb);
    expect(d.rho).toBeGreaterThan(2.6);
    expect(d.rho).toBeLessThan(2.8);
    expect(Math.abs(d.vDisp - d.V)).toBeLessThan(2.5);
    expect(evaluateF101(w, nb).components.find((c) => c.id === 'modelling')!.score).toBe(1);
  });

  it('modo curricular: sin fricción, el anillo libre queda centrado y la nota técnica es completa', () => {
    const { w, nb } = ideal(101, [], 'CURRICULAR');
    expect(w.params.pulleyFriction).toBe(0);
    expect(w.readings[nb.equilibriumId!].ringOffsetMm!).toBeLessThan(2);
    expect(evaluateF101(w, nb).components.find((c) => c.id === 'execution')!.score).toBe(1);
  });

  it('conserva agua, piezas y masas a lo largo de la ruta', () => {
    const { w } = ideal();
    const t = conservedTotals(w);
    for (const [k, v] of Object.entries(t)) expect(v).toBeCloseTo(w.initialTotals[k as keyof F101World['initialTotals']], 9);
  });

  it('la lectura del sensor (perno) contrasta la resultante calculada de F1 + F2', () => {
    const { w, nb } = ideal();
    const s = w.readings[nb.contrastId!];
    const R = Math.hypot(Number(nb.vec.Rx), Number(nb.vec.Ry));
    expect(Math.abs((s.value - R) / R)).toBeLessThan(0.03);
  });
});

// ─────────────────────────── 40 errores ───────────────────────────

type Fixture = () => { w: F101World; nb?: F101Notebook; check?: (w: F101World, nb?: F101Notebook) => void };

const base = (scenarios: string[] = []) => {
  const w = h.worldF({ scenarios: scenarios as never });
  h.ppe(w);
  return w;
};
const nbWith = (mut: (nb: F101Notebook, w: F101World) => void) => {
  const { w, ids } = h.idealRoute();
  const nb = h.fillNotebook(w, ids);
  mut(nb, w);
  return { w, nb };
};

const FIXTURES: Record<string, Fixture> = {
  // E37 se define abajo (necesita una ruta incompleta).
  E01: () => {
    const w = base([SF.CALIPER_ZERO]);
    const r = h.readingOf(w, h.caliperMeasure(w, 'metalCyl01', 'd'));
    return { w, check: () => expect(r.value - r.trueValue).toBeGreaterThan(0.04) };
  },
  E02: () => {
    const w = base([SF.SOFT_BODY]);
    h.caliperZero(w);
    const r = h.readingOf(w, h.caliperMeasure(w, 'metalCyl01', 'd', { pushMm: 4 }));
    return { w, check: () => expect(r.trueValue - r.value).toBeGreaterThan(0.1) };
  },
  E03: () => {
    const w = base();
    h.caliperZero(w);
    const r = h.readingOf(w, h.caliperMeasure(w, 'metalCyl01', 'd', { tiltDeg: 8 }));
    return { w, check: () => expect(r.value).toBeGreaterThan(r.trueValue + 2) };
  },
  E04: () => {
    const w = base();
    h.microZero(w);
    const r = h.readingOf(w, h.microMeasure(w, 'steelBall01', { via: 'thimble', extraDeg: 40 }));
    return { w, check: () => expect(r.value).toBeLessThan(r.trueValue - 0.01) };
  },
  E05: () => {
    const w = base();
    const r = h.readingOf(w, h.microZero(w, { clean: false }));
    return { w, check: () => expect(r.value).toBeCloseTo(0.01, 6) };
  },
  E06: () => {
    const w = base();
    h.caliperZero(w);
    const r = h.readingOf(w, h.caliperMeasure(w, 'gaugeBlock01', 'L', { viewDeg: 40 }));
    return { w, check: () => expect(Math.abs(r.value - 20)).toBeCloseTo(0.02, 6) };
  },
  E07: () => {
    const w = base([SF.BALANCE_UNLEVEL]);
    h.cmdF(w, { type: 'powerBalance', on: true });
    h.runF(w, 2);
    h.cmdF(w, { type: 'tare' });
    h.onPan(w, 'metalCyl01');
    h.runF(w, 4);
    h.cmdF(w, { type: 'readBalance' });
    return { w, check: () => expect(w.balance.stable).toBe(false) };
  },
  E08: () => {
    const w = base();
    h.balanceReady(w);
    h.onPan(w, 'dish01');
    h.cmdF(w, { type: 'setPose', id: 'metalCyl01', pose: h.PAN, support: 'dish01' });
    const r = h.readingOf(w, h.readMass(w));
    return { w, check: () => expect(r.value).toBeGreaterThan(w.parts.metalCyl01.massG + 20) };
  },
  E09: () => {
    const w = base();
    const before = cylinderContentMl(w) + 0;
    h.cmdF(w, { type: 'dropIntoCylinder', partId: 'steelBall01', heightCm: 7 });
    return { w, check: () => {
      expect(w.water.benchMl).toBeGreaterThan(0.5);
      expect(w.gradCyl.waterMl).toBeLessThan(before);
    } };
  },
  E10: () => {
    const w = base();
    const r = h.readingOf(w, h.readVol(w, 4));
    return { w, check: () => expect(r.value).toBeGreaterThan(r.trueValue + 0.5) };
  },
  E11: () => {
    const w = base();
    h.levelTable(w);
    h.setupForces(w, h.IDEAL_SETUP, { seat: false });
    h.releaseAndRecord(w);
    return { w, check: () => expect(Object.values(w.table.pulleys).some((p) => !p.seated)).toBe(true) };
  },
  E12: () => {
    const w = base();
    h.cmdF(w, { type: 'threadString', pulleyId: 'pulley1', on: false });
    h.setupForces(w);
    return { w, check: () => {
      const T = stringForces(w).find((f) => f.source === 'pulley1')!.T;
      expect(T).toBeLessThan(0.15 * w.params.g * 0.7);
    } };
  },
  E13: () => {
    const w = base();
    h.levelTable(w);
    h.setupForces(w, h.IDEAL_SETUP.slice(0, 2));
    h.runF(w, 2);
    h.cmdF(w, { type: 'recordEquilibrium', viewElevDeg: 80 });
    return { w, check: () => expect(w.table.touching).toBe(true) };
  },
  E14: () => nbWith((nb) => {
    const r = nb.vectors[1];
    [r.Fx, r.Fy] = [r.Fy, r.Fx];
  }),
  E15: () => nbWith((nb) => (nb.vectors[0].F = '150')),
  E16: () => nbWith((nb) => (nb.dims.cylH[2] = { value: '4.996', uncertainty: '', readingId: null })),
  E17: () => nbWith((nb) => (nb.calc.rho.uncertainty = '')),
  E18: () => nbWith((nb, w) => (nb.means.cylH.uncertainty = (expectedDim(w, nb, 'cylH').uB / Math.sqrt(3)).toFixed(5))),
  E19: () => {
    const w = base();
    h.setupForces(w, h.IDEAL_SETUP.slice(0, 2));
    h.cmdF(w, { type: 'setPin', on: false });
    h.cmdF(w, { type: 'loadMass', massId: 's20a', hangerId: 'hanger1' });
    return { w };
  },
  E20: () => {
    const w = base();
    h.setupForces(w);
    const r = h.cmdF(w, { type: 'closeStation' });
    return { w, check: () => expect(r.ok).toBe(false) };
  },
  E21: () => {
    const w = base();
    h.cmdF(w, { type: 'mountDynamometer', on: true, angleDeg: 300 });
    h.cmdF(w, { type: 'alignDynamometer', alignDeg: 0 });
    h.cmdF(w, { type: 'setDynTension', mm: 30 });
    h.runF(w, 2);
    const r = h.readingOf(w, h.cmdF(w, { type: 'readDynamometer', viewDeg: 0 }));
    return { w, check: () => expect(r.value - r.trueValue).toBeGreaterThan(0.05) };
  },
  E22: () => {
    const w = base([SF.SENSOR_SATURATED]);
    h.setupForces(w);
    h.cmdF(w, { type: 'loadMass', massId: 's100c', hangerId: 'hanger2' });
    const r = h.readingOf(w, h.sensorContrast(w));
    return { w, check: () => expect(r.value).toBeLessThan(r.trueValue) };
  },
  E23: () => {
    const w = base();
    const r = h.cmdF(w, { type: 'startCapture' });
    return { w, check: () => expect(r.ok).toBe(false) };
  },
  E24: () => {
    const w = base();
    h.setupForces(w);
    h.sensorContrast(w, { rateHz: 5, seconds: 1 });
    return { w };
  },
  E25: () => {
    const w = base();
    const r = h.cmdF(w, { type: 'readVolume', eyeDzCm: 0, occluded: true });
    return { w, check: () => expect(r.ok).toBe(false) };
  },
  E26: () => {
    const w = base();
    h.cmdF(w, { type: 'mountDynamometer', on: true, angleDeg: 300 });
    h.cmdF(w, { type: 'zeroDynamometer' });
    h.cmdF(w, { type: 'setDynTension', mm: 40 });
    h.runF(w, 2);
    const r = h.readingOf(w, h.cmdF(w, { type: 'readDynamometer', viewDeg: 0 }));
    return { w, check: () => expect(r.value).toBeLessThan(r.trueValue + 0.06) };
  },
  E27: () => {
    const w = base();
    h.setupForces(w);
    const r = h.readingOf(w, h.sensorContrast(w, { calibrate: false }));
    return { w, check: () => expect(r.value / r.trueValue).toBeGreaterThan(1.03) };
  },
  E28: () => {
    const w = base();
    h.setupForces(w);
    h.releaseAndRecord(w);
    return { w };
  },
  E29: () => {
    const w = base();
    h.levelTable(w);
    h.setupForces(w);
    const r = h.readingOf(w, h.releaseAndRecord(w, 25));
    return { w, check: () => expect(r.forces!.some((f) => f.angleRead !== Math.round(f.angleTrue))).toBe(true) };
  },
  E30: () => {
    const w = base();
    h.balanceReady(w);
    h.onPan(w, 'metalCyl01');
    const r = h.cmdF(w, { type: 'readBalance' });
    return { w, check: () => expect(r.ok).toBe(false) };
  },
  E31: () => nbWith((nb) => (nb.masses.cyl = { value: nb.masses.cyl.value, uncertainty: '', readingId: null })),
  E32: () => {
    const w = base();
    h.setupForces(w, h.IDEAL_SETUP.slice(0, 2));
    h.cmdF(w, { type: 'connectSensor', on: true });
    h.cmdF(w, { type: 'startCapture' });
    h.runF(w, 1);
    h.cmdF(w, { type: 'loadMass', massId: 's50b', hangerId: 'hanger1' });
    h.runF(w, 1);
    h.cmdF(w, { type: 'stopCapture' });
    return { w };
  },
  E33: () => nbWith((nb, w) => (nb.contrastId = w.readingOrder.find((id) => w.readings[id].kind === 'length')!)),
  E34: () => nbWith((nb, w) => (nb.calc.rhoSI.value = (expectedDensity(w, nb).rho * 100).toFixed(1))),
  E35: () => nbWith((nb) => (nb.means.cylD.value = Number(nb.means.cylD.value).toFixed(1))),
  E36: () => nbWith((nb) => (nb.vec.thetaR = nb.vec.equilibrant)),
  E38: () => nbWith((nb) => (nb.means.ballD.uncertainty = '0.0001')),
  E39: () => {
    const w = base();
    h.cmdF(w, { type: 'dropIntoCylinder', partId: 'steelBall01', heightCm: 15 });
    const r = h.readingOf(w, h.readVol(w));
    h.cmdF(w, { type: 'retrievePart', partId: 'steelBall01' });
    h.cmdF(w, { type: 'wipeBench' });
    h.cmdF(w, { type: 'replaceCylinder' });
    const r2 = h.readingOf(w, h.readVol(w));
    return { w, check: () => {
      expect(r.qualityFlags).toContain('POST_IMPACT');
      expect(w.gradCyl.leakedMl).toBeGreaterThan(0);
      expect(r2.qualityFlags).not.toContain('POST_IMPACT');
    } };
  },
  E40: () => {
    const w = base();
    h.cmdF(w, { type: 'mountDynamometer', on: true, angleDeg: 300 });
    h.cmdF(w, { type: 'setDynTension', mm: 50 });
    h.runF(w, 1);
    h.cmdF(w, { type: 'mountDynamometer', on: false, angleDeg: 300 });
    return { w, check: () => {
      expect(w.safety.block?.code).toBe('DYN_SNAP');
      expect(h.cmdF(w, { type: 'acknowledge' }).ok).toBe(true);
    } };
  },
};

// E37: dos repeticiones válidas por dimensión y el volumen ya calculado.
FIXTURES.E37 = () => {
  const w = base();
  h.caliperZero(w);
  h.microZero(w);
  for (const s of [0, 60]) h.caliperMeasure(w, 'metalCyl01', 'd', { spinDeg: s });
  for (const s of [0, 90]) h.caliperMeasure(w, 'metalCyl01', 'h', { spinDeg: s });
  const nb = h.fillNotebook(w, {});
  return { w, nb };
};

describe('F101 — los 40 errores simulables', () => {
  it('el catálogo tiene 40 códigos, 20 + 20, con contrato completo y texto de retroalimentación', () => {
    expect(SIMULATED_ERRORS_F101).toHaveLength(40);
    expect(SIMULATED_ERRORS_F101.filter((e) => e.group === 'EXPERIMENTAL')).toHaveLength(20);
    const fb = (esF101 as { f101fb: Record<string, string> }).f101fb;
    for (const e of SIMULATED_ERRORS_F101) {
      expect(e.trigger && e.effect && e.fixture, e.id).toBeTruthy();
      expect(fb[errKeyF(e)], e.id).toBeTruthy();
    }
  });

  it.each(SIMULATED_ERRORS_F101.map((e) => [e.id, e] as const))('%s: disparador → evidencia y consecuencia', (_id, e) => {
    const key = errKeyF(e);
    const fx = FIXTURES[key]();
    if (e.evidenceKey.startsWith('err:')) expect(ev(fx.w, key), e.id).toBeGreaterThan(0);
    else expect(notebookIssuesF101(fx.w, fx.nb!)).toContain(`nb:${key}`);
    fx.check?.(fx.w, fx.nb);
  });
});

describe('F101 — escenarios docentes', () => {
  it.each(F101_SCENARIOS)('%s permite terminar por una ruta válida', (s) => {
    const { w, nb } = ideal(101, [s]);
    const flags = f101StageEvidence(w, nb);
    expect(Object.entries(flags).filter(([, v]) => !v).map(([k]) => k)).toEqual([]);
  });

  it('S01: el cero desplazado se compensa con la lectura del cero propia', () => {
    const { w, nb } = ideal(101, [SF.CALIPER_ZERO]);
    expect(w.readings[nb.zeros.caliper.readingId!].value).toBeCloseTo(0.06, 6);
    const d = expectedDim(w, nb, 'cylD');
    expect(Math.abs(d.mean - w.parts.metalCyl01.dMm)).toBeLessThan(0.03);
  });

  it('S11: el nylon tiene otra densidad y la libreta la sigue', () => {
    const { w, nb } = ideal(101, [SF.SOFT_BODY]);
    expect(expectedDensity(w, nb).rho).toBeLessThan(1.3);
  });

  it('S10: calibrar con un patrón sin certificado se avisa y deja el sensor con el sesgo del patrón', () => {
    const { w } = ideal(101, [SF.UNCERTIFIED_STANDARD]);
    expect(w.events.some((e) => e.code === 'SENSOR_CALIBRATED' && e.severity === 'WARN')).toBe(true);
    expect(w.evidence.__sensorCalPending).toBe(1);
  });
});

describe('F101 — seguridad y reanudación', () => {
  it('quitar un portapesas con el anillo libre bloquea hasta colocar el perno', () => {
    const w = base();
    h.setupForces(w);
    h.cmdF(w, { type: 'setPin', on: false });
    h.cmdF(w, { type: 'hang', hangerId: 'hanger3', pulleyId: null });
    expect(w.safety.block?.code).toBe('RING_LOOSE');
    expect(h.cmdF(w, { type: 'readBalance' }).code).toBe('BLOCKED');
    expect(h.cmdF(w, { type: 'acknowledge' }).ok).toBe(false);
    h.cmdF(w, { type: 'setPin', on: true });
    expect(h.cmdF(w, { type: 'acknowledge' }).ok).toBe(true);
    expect(ev(w, 'E40')).toBe(1);
  });

  it('sin EPP no se opera; la reanudación detiene la captura y deja el anillo retenido', () => {
    const w = h.worldF();
    expect(h.cmdF(w, { type: 'tare' }).code).toBe('PPE');
    h.ppe(w);
    h.setupForces(w);
    h.cmdF(w, { type: 'connectSensor', on: true });
    h.cmdF(w, { type: 'startCapture' });
    h.cmdF(w, { type: 'setPin', on: false });
    sanitizeOnResumeF101(w);
    expect(w.table.sensor.capture).toBeNull();
    expect(w.table.pinIn).toBe(true);
  });
});
