/**
 * F05 — recorridos completos sin escena (§17, matriz «Integración»): ruta ideal por comandos hasta la entrega con la
 * máquina por etapas y la evaluación, en modo realista y curricular y con varias semillas; los 40 errores
 * F05-E01…E40 con su disparador y su consecuencia causal; los 12 escenarios docentes; seguridad y reanudación.
 */
import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import type { F05World, ReadingF5 } from '../../simulation/f05-world/types';
import type { F05Command } from '../../simulation/f05-world/commands';
import { SF5 } from '../../simulation/f05-world/world';
import { conservedTotalsF05, energyResidualJ } from '../../simulation/f05-world/conservation';
import { BLOCK_START_S } from '../../simulation/f05-world/geometry';
import { emptyF05Notebook, type F05Notebook } from '../../practices/practice-f05/notebook';
import { f05StageEvidence } from '../../practices/practice-f05/evidence';
import { practiceF05Machine, f05StageName } from '../../practices/practice-f05/workflow.machine';
import { F05_WEIGHTS, evaluateF05, notebookIssuesF05 } from '../../practices/practice-f05/rubric';
import { SIMULATED_ERRORS_F05, F05_SCENARIOS, errKeyF5 } from '../../practices/practice-f05/error-scenarios';
import { sanitizeOnResumeF05 } from '../../practices/practice-f05/resume';
import { expectedAngleRow, expectedKineticRow, expectedMus, expectedSlide, expectedSlopeF5, expectedModelF5 } from '../../practices/practice-f05/expected-results';
import esF05 from '../../locales/es/practiceF05.json';
import * as h from '../helpersF05';

const ev = (w: F05World, k: string) => w.evidence[`err:${k}`] ?? 0;
const R = (w: F05World, r: { id?: string }): ReadingF5 => w.readings[r.id!];
const fmt = (v: number, d = 4) => v.toFixed(d);

function ideal(seed = 105, scenarios: string[] = [], mode?: 'CURRICULAR' | 'REALISTIC') {
  const r = h.idealRouteF5(seed, scenarios as never, mode);
  return { ...r, nb: h.fillNotebookF5(r.w, r.ids) };
}

/** Atajos con la firma de la ruta (mundo diferido, comando, avance). */
const io = (w: F05World) => ({ W: () => w, C: (c: F05Command) => h.cmdF5(w, c), Rn: (s: number) => h.runF5(w, s) });

describe('F05 — ruta ideal', () => {
  it('cumple las etapas por evidencia y llega a COMPLETE sin errores', () => {
    const { w, nb } = ideal();
    const flags = f05StageEvidence(w, nb);
    expect(Object.entries(flags).filter(([, v]) => !v).map(([k]) => k)).toEqual([]);
    const actor = createActor(practiceF05Machine).start();
    actor.send({ type: 'START' });
    actor.send({ type: 'PPE_CONFIRMED' });
    expect(f05StageName(actor.getSnapshot().value)).toBe('MATERIALS');
    actor.send({ type: 'EVIDENCE', flags });
    expect(f05StageName(actor.getSnapshot().value)).toBe('COMPLETE');
    expect(Object.keys(w.evidence).filter((k) => k.startsWith('err:') && w.evidence[k] > 0)).toEqual([]);
    expect(notebookIssuesF05(w, nb)).toEqual([]);
  });

  it('la evaluación da el máximo automático (las respuestas abiertas quedan a revisión)', () => {
    const { w, nb } = ideal();
    const e = evaluateF05(w, nb);
    expect(Object.values(F05_WEIGHTS).reduce((s, x) => s + x, 0)).toBeCloseTo(1, 12);
    for (const c of e.components.filter((x) => x.id !== 'analysis')) expect(c.score, c.id).toBe(1);
    expect(e.total).toBeGreaterThan(0.95);
    expect(e.needsTeacherReview.length).toBeGreaterThan(0);
  });

  it('la máquina no avanza sin evidencia (no hay evento «Siguiente»)', () => {
    const w = h.worldF5();
    for (const item of ['coat', 'goggles', 'shoes', 'hair'] as const) h.cmdF5(w, { type: 'equipPpe', item, on: true });
    h.cmdF5(w, { type: 'startWork' });
    const actor = createActor(practiceF05Machine).start();
    actor.send({ type: 'START' });
    actor.send({ type: 'PPE_CONFIRMED' });
    actor.send({ type: 'EVIDENCE', flags: f05StageEvidence(w, h.fillNotebookF5(w, h.emptyRouteIdsF5())) });
    expect(f05StageName(actor.getSnapshot().value)).toBe('MATERIALS');
  });

  it.each([7, 2024, 99991])('semilla %i: coeficientes coherentes con las lecturas propias', (seed) => {
    const { w, nb } = ideal(seed);
    const m = expectedMus(w, nb);
    // μ_s > μ_k; ambos cerca de los de madera (0,45 y 0,30) salvo la pequeña inclinación de la base.
    expect(m.muS).toBeGreaterThan(m.muK + 0.1);
    expect(m.muS).toBeCloseTo(0.45, 1);
    expect(m.muK).toBeCloseTo(0.3, 1);
    // La pendiente de F_k contra N es μ_k; tan θ_c reproduce μ_s; la bajada da el mismo μ_k.
    expect(Math.abs(expectedSlopeF5(w, nb).slope - m.muK)).toBeLessThan(0.01);
    expect(Math.abs(expectedModelF5(w, nb).thetaDisc)).toBeLessThan(3);
    expect(Math.abs(expectedSlide(w, nb).muK - m.muK)).toBeLessThan(0.015);
  });

  it('modo curricular: el pico vale μ_s m g y la meseta μ_k m g (con la inclinación de la base)', () => {
    const { w, ids } = ideal(105, [], 'CURRICULAR');
    const g = w.params.g;
    const th = (w.plane.baseDeg * Math.PI) / 180;
    const extra = 0.5 * g * Math.sin(th);
    for (const id of ids.statics) expect(w.readings[id].pull!.Fpeak!).toBeCloseTo(0.45 * 0.5 * g * Math.cos(th) + extra, 1);
    for (const id of ids.kinetics) expect(w.readings[id].value).toBeCloseTo(0.3 * 0.5 * g * Math.cos(th) + extra, 2);
  });

  it('conserva la masa y cierra el balance de energía', () => {
    const { w } = ideal(105, [], 'CURRICULAR');
    expect(conservedTotalsF05(w).massesG).toBeCloseTo(w.initialTotals.massesG, 9);
    expect(Math.abs(energyResidualJ(w))).toBeLessThan(5e-3);
    const r = ideal(105);
    expect(Math.abs(energyResidualJ(r.w))).toBeLessThan(5e-3);
  });

  it('el ángulo crítico del bloque en madera y en papel sigue arctan μ_s', () => {
    const { w, ids } = ideal();
    for (const a of ids.angles) {
      const e = expectedAngleRow(w.readings[a.id]);
      expect(Math.abs(e.muS - w.params.mu[a.material].s)).toBeLessThan(0.02);
    }
  });
});

// ─────────────────────────── 40 errores ───────────────────────────

type Fixture = () => { w: F05World; nb?: F05Notebook; check?: (w: F05World, nb?: F05Notebook) => void };

const base = (opts: Parameters<typeof h.worldF5>[0] = {}) => {
  const w = h.worldF5(opts);
  for (const item of ['coat', 'goggles', 'shoes', 'hair'] as const) h.cmdF5(w, { type: 'equipPpe', item, on: true });
  h.cmdF5(w, { type: 'startWork' });
  return w;
};

type ReadyOpts = Parameters<typeof h.worldF5>[0] & { zero?: boolean; calibrate?: boolean; connect?: boolean; rate?: number; height?: number; range?: number };

/** Tirador listo: célula conectada, calibrada y en cero; registrador a 200 Hz; cable a la altura del gancho. */
const ready = (opts: ReadyOpts = {}) => {
  const w = base(opts);
  const { C } = io(w);
  if (opts.connect ?? true) C({ type: 'connect', channel: 'load01', on: true });
  C({ type: 'setRate', hz: opts.rate ?? 200 });
  if (opts.range !== undefined) C({ type: 'setRange', n: opts.range });
  if (opts.calibrate ?? true) C({ type: 'calibrateSensor' });
  if (opts.zero ?? true) C({ type: 'zeroSensor' });
  C({ type: 'setCableHeight', cm: opts.height ?? 2 });
  return w;
};

/** Un tirón a 2 cm/s hasta el final del carril. */
const pull = (w: F05World, drive = 2) => {
  const { W, C, Rn } = io(w);
  C({ type: 'attachCable', on: true });
  C({ type: 'setDrive', cmS: drive });
  Rn(0.5);
  h.waitDone(W, Rn);
  return w.pulls[w.pulls.length - 1];
};
const readPeak = (w: F05World, rec = w.pulls[w.pulls.length - 1]) => R(w, h.cmdF5(w, { type: 'readPull', ...h.pullWindows(rec).peak }));
const readMean = (w: F05World, rec = w.pulls[w.pulls.length - 1]) => R(w, h.cmdF5(w, { type: 'readPull', ...h.pullWindows(rec).plateau }));

/** Bajada desde el pasador a 30° con las compuertas y el video conectados. */
const slideReady = (opts: Parameters<typeof h.worldF5>[0] & { clamp?: boolean; catcher?: boolean } = {}) => {
  const w = base(opts);
  const { W, C } = io(w);
  if (opts.clamp ?? true) C({ type: 'clampBase', on: true });
  if (opts.catcher === false) C({ type: 'setCatcher', on: false });
  C({ type: 'setRate', hz: 200 });
  C({ type: 'connect', channel: 'gates', on: true });
  C({ type: 'connect', channel: 'video', on: true });
  h.tiltTo(W, C, 30);
  return w;
};
const slide = (w: F05World) => {
  const { W, C, Rn } = io(w);
  C({ type: 'placeBlock', s: 'top' });
  Rn(1.5);
  C({ type: 'releaseBlock' });
  Rn(0.5);
  h.waitDone(W, Rn);
  return R(w, C({ type: 'readSlide' }));
};

const nbWith = (mut: (nb: F05Notebook, w: F05World) => void, seed = 105, scenarios: string[] = []) => {
  const { w, nb } = ideal(seed, scenarios);
  mut(nb, w);
  return { w, nb };
};

/** Pico verdadero de un tirón limpio de referencia con la misma semilla. */
const refPeak = (opts: ReadyOpts = {}, prep?: (w: F05World) => void) => {
  const w = ready(opts);
  prep?.(w);
  return pull(w).slipF;
};

const FIXTURES: Record<string, Fixture> = {
  E01: () => {
    const p0 = refPeak();
    const w = ready({ height: 9 });
    const rec = pull(w);
    const r = readMean(w);
    return { w, check: () => {
      expect(r.qualityFlags).toContain('CABLE_TILTED');
      // El cable inclinado levanta el bloque: la normal y el pico bajan.
      expect(rec.slipF).toBeLessThan(p0 * 0.98);
    } };
  },
  E02: () => nbWith((nb, w) => {
    const e = expectedKineticRow(w, nb, w.readings[nb.kineticRows[0].readingId!]);
    nb.kineticRows[0].muK = fmt(e.muFromPeak);
  }),
  E03: () => {
    const w = base();
    const { W, C, Rn } = io(w);
    C({ type: 'setLock', on: false });
    h.tiltTo(W, C, 10);
    Rn(2);
    const r = R(w, C({ type: 'readAngle', target: 'plane', viewDeg: 0 }));
    return { w, check: () => {
      expect(r.qualityFlags).toContain('DRIFT');
      expect(w.plane.relDeg).toBeLessThan(10);
    } };
  },
  E04: () => nbWith((nb) => (nb.material = 'paper')),
  E05: () => {
    const w = ready();
    const { C, Rn, W } = io(w);
    C({ type: 'attachCable', on: true });
    C({ type: 'jerk' });
    Rn(0.5);
    C({ type: 'setDrive', cmS: 2 });
    h.waitDone(W, Rn);
    const r = readMean(w);
    return { w, check: () => {
      expect(r.qualityFlags).toContain('JERK');
      expect(w.pulls[0].jerkT).not.toBeNull();
    } };
  },
  E06: () => {
    const w = ready();
    const rec = pull(w);
    const r = R(w, h.cmdF5(w, { type: 'readPull', t0: rec.slipT! + 0.06, t1: rec.slipT! + 0.3 }));
    return { w, check: () => {
      expect(r.qualityFlags).toContain('ACCELERATING');
      expect(Math.abs(r.pull!.aMean!)).toBeGreaterThan(0.01);
    } };
  },
  E07: () => {
    const w = base();
    const { W, C, Rn } = io(w);
    C({ type: 'placeMass', id: 'w250a', on: 'block', offsetCm: 3 });
    h.tiltTo(W, C, 15);
    Rn(1);
    return { w, check: () => {
      expect(w.seated.w250a).toBe(true);
      expect(w.objects.w250a.support).toBe('bench');
    } };
  },
  E08: () => {
    const w = ready({ zero: false, scenarios: [SF5.OFFSET] });
    pull(w);
    const r = readMean(w);
    return { w, check: () => {
      expect(r.qualityFlags).toContain('NOT_ZEROED');
      expect(Math.abs(r.value - r.pull!.trueMean!)).toBeGreaterThan(0.3);
    } };
  },
  E09: () => {
    const w = base();
    const r = h.cmdF5(w, { type: 'placeBlock', s: 0.3, lateralCm: 12 });
    return { w, check: () => {
      expect(r.code).toBe('FELL');
      expect(w.block.on).toBe('bench');
    } };
  },
  E10: () => {
    const w = base();
    const { W, C, Rn } = io(w);
    h.tiltTo(W, C, 10);
    Rn(2);
    const r = R(w, C({ type: 'readAngle', target: 'support', viewDeg: 0 }));
    return { w, check: () => {
      expect(r.qualityFlags).toContain('SUPPORT_SCALE');
      // La escala del soporte no ve la inclinación de la base.
      expect(r.trueValue).toBe(w.plane.relDeg);
      expect(r.trueValue).not.toBe(w.plane.relDeg + w.plane.baseDeg);
    } };
  },
  E11: () => nbWith((nb) => (nb.calc.muK.value = nb.calc.muS.value)),
  E12: () => {
    const w = base();
    h.cmdF5(w, { type: 'drawForce', body: 'blockPull', force: 'friction', dir: 'upSlope', partner: 'plane' });
    return { w, check: () => expect(h.cmdF5(w, { type: 'lockFbd', body: 'blockPull' }).code).toBe('FBD_INCOHERENT') };
  },
  E13: () => nbWith((nb) => (nb.setup.temp = { value: '', uncertainty: '', readingId: null })),
  E14: () => {
    const w = base();
    h.cmdF5(w, { type: 'drawForce', body: 'blockPull', force: 'tension', dir: 'up', partner: 'cable' });
    return { w, check: () => expect(h.cmdF5(w, { type: 'lockFbd', body: 'blockPull' }).ok).toBe(false) };
  },
  E15: () => {
    const w = ready({ scenarios: [SF5.OSCILLATING] });
    const rec = pull(w);
    const r = R(w, h.cmdF5(w, { type: 'readPull', t0: rec.slipT! + 0.5, t1: rec.slipT! + 4 }));
    return { w, check: () => expect(r.qualityFlags).toContain('OSCILLATING') };
  },
  E16: () => {
    const p0 = refPeak({}, (w) => h.cmdF5(w, { type: 'setSurface', material: 'paper' }));
    const w = ready({ scenarios: [SF5.WORN] });
    h.cmdF5(w, { type: 'setSurface', material: 'paper' });
    const rec = pull(w);
    const r = readPeak(w);
    return { w, check: () => {
      expect(r.qualityFlags).toContain('WORN');
      expect(rec.slipF).toBeLessThan(p0 * 0.9);
    } };
  },
  E17: () => nbWith((nb, w) => (nb.slide.muK = fmt(expectedSlide(w, nb).muKFlat))),
  E18: () => nbWith((nb) => {
    nb.staticRows[1] = { readingId: null, N: '', muS: '' };
    nb.staticRows[2] = { readingId: null, N: '', muS: '' };
  }),
  E19: () => {
    const w = base();
    for (let i = 0; i < 5; i++) h.cmdF5(w, { type: 'turnElevator', turns: 40 });
    return { w, check: () => expect(w.plane.relDeg).toBe(45) };
  },
  E20: () => {
    const w = base();
    const { W, C } = io(w);
    h.tiltTo(W, C, 10);
    C({ type: 'setLock', on: false });
    const r = C({ type: 'closeStation' });
    return { w, check: () => {
      expect(r.code).toBe('PLANE_SLAM');
      expect(w.plane.relDeg).toBe(0);
      expect(w.safety.block?.code).toBe('PLANE_SLAM');
    } };
  },
  E21: () => {
    const w = base();
    h.cmdF5(w, { type: 'placeOnBalance', id: 'block01' });
    h.runF5(w, 2);
    const r = R(w, h.cmdF5(w, { type: 'readBalance' }));
    return { w, check: () => {
      expect(r.qualityFlags).toContain('NOT_ZEROED');
      expect(Math.abs(r.value - r.trueValue)).toBeGreaterThanOrEqual(2);
    } };
  },
  E22: () => {
    const w = ready({ range: 0 });
    const rec = pull(w);
    const r = readPeak(w);
    return { w, check: () => {
      expect(r.qualityFlags).toContain('CLIPPED');
      expect(r.pull!.Fpeak!).toBeLessThanOrEqual(2);
      expect(rec.slipF).toBeGreaterThan(2);
    } };
  },
  E23: () => {
    const w = ready({ connect: false, zero: false, calibrate: false });
    pull(w);
    const r = readMean(w);
    return { w, check: () => {
      expect(r.valid).toBe(false);
      expect(Number.isNaN(r.value)).toBe(true);
    } };
  },
  E24: () => {
    const w = ready({ rate: 10 });
    pull(w);
    const r = readPeak(w);
    return { w, check: () => {
      expect(r.qualityFlags).toContain('LOW_RATE');
      expect(r.pull!.n).toBeLessThan(20);
    } };
  },
  E25: () => {
    const w = slideReady();
    h.cmdF5(w, { type: 'moveGate', id: 'gate1', s: 0.9 });
    const r = slide(w);
    return { w, check: () => {
      expect(r.qualityFlags).toContain('OCCLUDED');
      expect(r.slide!.dt1).toBeNull();
    } };
  },
  E26: () => {
    const w = ready();
    h.cmdF5(w, { type: 'mountSensor', angleDeg: 30 });
    pull(w);
    const r = readMean(w);
    return { w, check: () => {
      expect(r.qualityFlags).toContain('TILTED_SENSOR');
      expect(r.value / r.pull!.trueMean!).toBeCloseTo(Math.cos(Math.PI / 6), 1);
    } };
  },
  E27: () => {
    const w = ready({ calibrate: false });
    pull(w);
    const r = readMean(w);
    return { w, check: () => {
      expect(r.qualityFlags).toContain('UNCALIBRATED');
      expect(r.value / r.pull!.trueMean!).toBeCloseTo(1.04, 1);
    } };
  },
  E28: () => {
    const w = slideReady({ clamp: false });
    const before = w.plane.relDeg;
    const r = slide(w);
    return { w, check: () => {
      expect(r.qualityFlags).toContain('BASE_SLIP');
      expect(w.plane.relDeg).toBeCloseTo(before - w.params.supportSlipDeg, 6);
    } };
  },
  E29: () => {
    const w = base();
    const r = R(w, h.cmdF5(w, { type: 'readScale', target: 'gate1', viewDeg: 25 }));
    return { w, check: () => {
      expect(r.qualityFlags).toContain('PARALLAX');
      expect(r.value).not.toBe(r.trueValue);
    } };
  },
  E30: () => {
    const w = base();
    h.cmdF5(w, { type: 'tareBalance' });
    h.cmdF5(w, { type: 'placeOnBalance', id: 'w250a' });
    const r = R(w, h.cmdF5(w, { type: 'readBalance' }));
    return { w, check: () => expect(r.qualityFlags).toContain('UNSTABLE') };
  },
  E31: () => nbWith((nb) => (nb.setup.blockM = { value: '500', uncertainty: '', readingId: null })),
  E32: () => {
    const w = ready();
    const { C, Rn } = io(w);
    C({ type: 'attachCable', on: true });
    C({ type: 'setDrive', cmS: 2 });
    Rn(2);
    C({ type: 'setRate', hz: 50 });
    return { w, check: () => expect(w.pulls[0].configChangedT).not.toBeNull() };
  },
  E33: () => nbWith((nb, w) => {
    nb.staticRows[1].readingId = nb.loadRows[2].readingId;
    void w;
  }),
  E34: () => nbWith((nb) => (nb.staticRows[0].N = fmt(Number(nb.staticRows[0].N) * 1000, 1))),
  E35: () => nbWith((nb, w) => {
    const row = nb.angleRows.findIndex((r) => {
      const e = expectedAngleRow(w.readings[r.readingId!]);
      return Math.abs(e.muRounded - e.muS) > 0.005 * e.muS;
    });
    const e = expectedAngleRow(w.readings[nb.angleRows[row].readingId!]);
    nb.angleRows[row].muS = fmt(e.muRounded);
  }),
  E36: () => nbWith((nb, w) => (nb.calc.slopeMu.value = fmt(expectedSlopeF5(w, nb).inverse, 3))),
  E37: () => nbWith((nb) => (nb.kineticRows[2] = { readingId: null, N: '', muK: '' })),
  E38: () => nbWith((nb) => (nb.calc.muS.uncertainty = '0.0001')),
  E39: () => {
    const w = slideReady({ catcher: false });
    slide(w);
    const bent = w.block.flagBent;
    h.cmdF5(w, { type: 'setCatcher', on: true });
    const r = slide(w);
    return { w, check: () => {
      expect(bent).toBe(true);
      expect(r.qualityFlags).toContain('POST_IMPACT');
    } };
  },
  E40: () => {
    const w = ready();
    const { C, Rn } = io(w);
    C({ type: 'attachCable', on: true });
    C({ type: 'setDrive', cmS: 2 });
    Rn(0.6);
    C({ type: 'setDrive', cmS: 0 });
    C({ type: 'attachCable', on: false });
    return { w, check: () => {
      expect(w.safety.block?.code).toBe('CABLE_SNAP');
      expect(w.puller.attached).toBe(false);
    } };
  },
};

describe('F05 — los 40 errores simulables', () => {
  it('el catálogo tiene 40 códigos, 20 + 20, con contrato completo y texto de retroalimentación', () => {
    expect(SIMULATED_ERRORS_F05).toHaveLength(40);
    expect(SIMULATED_ERRORS_F05.filter((e) => e.group === 'EXPERIMENTAL')).toHaveLength(20);
    const fb = (esF05 as { f05fb: Record<string, string> }).f05fb;
    for (const e of SIMULATED_ERRORS_F05) {
      expect(e.trigger && e.effect && e.fixture, e.id).toBeTruthy();
      expect(fb[errKeyF5(e)], e.id).toBeTruthy();
    }
  });

  it.each(SIMULATED_ERRORS_F05.map((e) => [e.id, e] as const))('%s: disparador → evidencia y consecuencia', (_id, e) => {
    const key = errKeyF5(e);
    const fx = FIXTURES[key]();
    if (e.evidenceKey.startsWith('err:')) expect(ev(fx.w, key), e.id).toBeGreaterThan(0);
    else expect(notebookIssuesF05(fx.w, fx.nb!)).toContain(`nb:${key}`);
    fx.check?.(fx.w, fx.nb);
  });
});

describe('F05 — escenarios docentes', () => {
  it.each(F05_SCENARIOS)('%s permite terminar por una ruta válida', (s) => {
    const { w, nb } = ideal(105, [s]);
    const flags = f05StageEvidence(w, nb);
    expect(Object.entries(flags).filter(([, v]) => !v).map(([k]) => k)).toEqual([]);
    expect(notebookIssuesF05(w, nb)).toEqual([]);
  });

  it('S01 reproduce el oráculo; S02 (goma) y S03 (bloque pesado) suben la fuerza; S12 la baja', () => {
    const ref = ideal(105, [SF5.DRY_WOOD]);
    const peak = (x: ReturnType<typeof ideal>) => x.w.readings[x.ids.statics[0]].pull!.Fpeak!;
    const th = (ref.w.plane.baseDeg * Math.PI) / 180;
    expect(peak(ref)).toBeCloseTo(2.207 * Math.cos(th) + 0.5 * 9.81 * Math.sin(th), 1);
    expect(peak(ideal(105, [SF5.HEAVY]))).toBeGreaterThan(peak(ref) * 1.8);
    expect(peak(ideal(105, [SF5.LOW_THRESHOLD]))).toBeLessThan(peak(ref) * 0.5);
    const rub = ideal(105, [SF5.RUBBER]);
    expect(rub.w.readings[rub.ids.statics[0]].setup!.material).toBe('wood');
    expect(rub.w.surface.worn.rubber).toBe(false);
  });

  it('S04 y S05: la ruta baja el gancho del tirador y pone la célula en cero', () => {
    const s4 = ideal(105, [SF5.TILTED_PULL]);
    expect(s4.w.puller.heightCm).toBe(2);
    const s5 = ideal(105, [SF5.OFFSET]);
    expect(s5.w.sensor.zeroed).toBe(true);
  });

  it('S11: la tira de papel rayada queda registrada al inspeccionarla y su ángulo crítico es menor', () => {
    const { w, ids } = ideal(105, [SF5.WORN]);
    expect(w.surface.wornLogged.paper).toBe(true);
    const paper = ids.angles.find((a) => a.material === 'paper')!;
    expect(w.readings[paper.id].value).toBeLessThan(18);
  });
});

describe('F05 — seguridad y reanudación', () => {
  it('soltar el cable tenso bloquea hasta devolver el tirador al inicio', () => {
    const w = FIXTURES.E40().w;
    expect(h.cmdF5(w, { type: 'readTemp' }).code).toBe('BLOCKED');
    expect(h.cmdF5(w, { type: 'acknowledge' }).code).toBe('SECURE_FIRST');
    h.cmdF5(w, { type: 'returnPuller' });
    expect(h.cmdF5(w, { type: 'acknowledge' }).ok).toBe(true);
    expect(w.safety.block).toBeNull();
    expect(ev(w, 'E40')).toBe(1);
    expect(evaluateF05(w, emptyF05Notebook()).components.find((c) => c.id === 'safety')!.score).toBe(0);
  });

  it('el tablero que baja de golpe exige bloquear el elevador antes de seguir', () => {
    const w = FIXTURES.E20().w;
    expect(h.cmdF5(w, { type: 'acknowledge' }).code).toBe('SECURE_FIRST');
    h.cmdF5(w, { type: 'setLock', on: true });
    expect(h.cmdF5(w, { type: 'acknowledge' }).ok).toBe(true);
  });

  it('sin EPP no se opera; la reanudación detiene el tirador y deja el cable flojo', () => {
    const w0 = h.worldF5();
    expect(h.cmdF5(w0, { type: 'setDrive', cmS: 2 }).code).toBe('PPE');
    const w = ready();
    h.cmdF5(w, { type: 'attachCable', on: true });
    h.cmdF5(w, { type: 'setDrive', cmS: 2 });
    h.runF5(w, 3);
    expect(w.puller.tensionN).toBeGreaterThan(0.5);
    sanitizeOnResumeF05(w);
    expect(w.puller.driveMs).toBe(0);
    expect(w.pull?.done).toBe(true);
    expect(Math.abs(energyResidualJ(w))).toBeLessThan(1e-9);
    h.runF5(w, 1);
    expect(w.block.v).toBe(0);
    expect(w.puller.tensionN).toBe(0);
  });

  it('el cierre exige el tablero abajo y bloqueado, el cable suelto, el tirador al inicio y los lastres guardados', () => {
    const w = ready();
    const { W, C } = io(w);
    h.tiltTo(W, C, 10);
    expect(C({ type: 'closeStation' }).code).toBe('LOWER_FIRST');
    h.tiltTo(W, C, 0);
    C({ type: 'attachCable', on: true });
    expect(C({ type: 'closeStation' }).code).toBe('CABLE_ATTACHED');
    C({ type: 'attachCable', on: false });
    C({ type: 'placeMass', id: 'w250a', on: 'block' });
    expect(C({ type: 'closeStation' }).code).toBe('MASSES_OUT');
    C({ type: 'placeMass', id: 'w250a', on: 'rack' });
    C({ type: 'placeBlock', s: BLOCK_START_S });
    expect(C({ type: 'closeStation' }).ok).toBe(true);
  });
});
