/**
 * F10 — recorridos completos sin escena (§17, matriz «Integración»): ruta ideal por comandos hasta la entrega con la
 * máquina por etapas y la evaluación, en modo realista y curricular y con varias semillas; los 40 errores
 * F10-E01…E40 con su disparador y su consecuencia causal; los 12 escenarios docentes; seguridad y reanudación.
 */
import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import type { F10World, ReadingF10 } from '../../simulation/f10-world/types';
import type { F10Command } from '../../simulation/f10-world/commands';
import { SF10, pressMovingF10, tippingF10 } from '../../simulation/f10-world/world';
import { conservedTotalsF10, energyResidualF10 } from '../../simulation/f10-world/conservation';
import { emptyF10Notebook, type F10Notebook } from '../../practices/practice-f10/notebook';
import { f10StageEvidence } from '../../practices/practice-f10/evidence';
import { practiceF10Machine, f10StageName } from '../../practices/practice-f10/workflow.machine';
import { F10_WEIGHTS, evaluateF10, notebookIssuesF10 } from '../../practices/practice-f10/rubric';
import { SIMULATED_ERRORS_F10, F10_SCENARIOS, errKeyF10 } from '../../practices/practice-f10/error-scenarios';
import { sanitizeOnResumeF10 } from '../../practices/practice-f10/resume';
import { expectedCalcF10, expectedElF10, expectedEqF10 } from '../../practices/practice-f10/expected-results';
import esF10 from '../../locales/es/practiceF10.json';
import * as h from '../helpersF10';

const ev = (w: F10World, k: string) => w.evidence[`err:${k}`] ?? 0;
const R = (w: F10World, r: { id?: string }): ReadingF10 => w.readings[r.id!];
const DEG = Math.PI / 180;

function ideal(seed = 110, scenarios: string[] = [], mode?: 'CURRICULAR' | 'REALISTIC') {
  const r = h.idealRouteF10(seed, scenarios as never, mode);
  return { ...r, nb: h.fillNotebookF10(r.w, r.ids) };
}

/** Atajos con la firma de la ruta (mundo diferido, comando, avance). */
const io = (w: F10World) => ({ W: () => w, C: (c: F10Command) => h.cmdF10(w, c), Rn: (s: number) => h.runF10(w, s) });
const errsOf = (w: F10World) => Object.keys(w.evidence).filter((k) => k.startsWith('err:') && w.evidence[k] > 0);

describe('F10 — ruta ideal', () => {
  it('cumple las etapas por evidencia y llega a COMPLETE sin errores', () => {
    const { w, nb } = ideal();
    const flags = f10StageEvidence(w, nb);
    expect(Object.entries(flags).filter(([, v]) => !v).map(([k]) => k)).toEqual([]);
    const actor = createActor(practiceF10Machine).start();
    actor.send({ type: 'START' });
    actor.send({ type: 'PPE_CONFIRMED' });
    expect(f10StageName(actor.getSnapshot().value)).toBe('WEIGHTS');
    actor.send({ type: 'EVIDENCE', flags });
    expect(f10StageName(actor.getSnapshot().value)).toBe('COMPLETE');
    expect(errsOf(w)).toEqual([]);
    expect(notebookIssuesF10(w, nb)).toEqual([]);
  });

  it('la evaluación da el máximo automático (las respuestas abiertas quedan a revisión)', () => {
    const { w, nb } = ideal();
    const e = evaluateF10(w, nb);
    expect(Object.values(F10_WEIGHTS).reduce((s, x) => s + x, 0)).toBeCloseTo(1, 12);
    for (const c of e.components.filter((x) => x.id !== 'analysis')) expect(c.score, c.id).toBe(1);
    expect(e.total).toBeGreaterThan(0.95);
    expect(e.needsTeacherReview.length).toBeGreaterThan(0);
  });

  it('la máquina no avanza sin evidencia (no hay evento «Siguiente»)', () => {
    const w = h.worldF10();
    for (const item of ['coat', 'goggles', 'shoes', 'hair'] as const) h.cmdF10(w, { type: 'equipPpe', item, on: true });
    h.cmdF10(w, { type: 'startWork' });
    const actor = createActor(practiceF10Machine).start();
    actor.send({ type: 'START' });
    actor.send({ type: 'PPE_CONFIRMED' });
    actor.send({ type: 'EVIDENCE', flags: f10StageEvidence(w, h.fillNotebookF10(w, h.emptyRouteIdsF10())) });
    expect(f10StageName(actor.getSnapshot().value)).toBe('WEIGHTS');
  });

  it.each([7, 2024, 99991])('semilla %i: reacciones ≈ estática, pendiente R_B–x ≈ W₁ y E ≈ el de tabla', (seed) => {
    const { w, nb } = ideal(seed);
    for (const row of nb.eqRows) {
      const e = expectedEqF10(w, nb, row);
      expect(Math.abs(e.RB - e.RbPred)).toBeLessThan(0.06);
      expect(Math.abs(e.sumF)).toBeLessThan(0.05);
    }
    const ec = expectedCalcF10(w, nb);
    const W1 = w.readings[nb.setup.W1.readingId!].value;
    expect(Math.abs(ec.W1slope / W1 - 1)).toBeLessThan(0.02);
    expect(Math.abs(ec.Edev)).toBeLessThan(2);
    expect(Number(nb.plastic.epsRes)).toBeGreaterThan(5e-4);
    expect(Math.abs(Number(nb.plastic.epsRev))).toBeLessThan(2e-5);
    expect(notebookIssuesF10(w, nb)).toEqual([]);
  });

  it('modo curricular: reacciones exactas en la resolución y E exacto en la resolución del comparador', () => {
    const { w, nb } = ideal(110, [], 'CURRICULAR');
    for (const row of nb.eqRows) {
      const e = expectedEqF10(w, nb, row);
      expect(Math.abs(e.RA - e.ra!.trueValue)).toBeLessThanOrEqual(0.0051);
    }
    for (const row of nb.elRows) {
      const e = expectedElF10(w, nb, row);
      expect(Math.abs(e.dL - e.er!.trueValue)).toBeLessThanOrEqual(0.0006);
    }
    const ec = expectedCalcF10(w, nb);
    expect(Math.abs(ec.Edev)).toBeLessThan(1);
  });

  it('conserva la masa y cierra el balance de energía (trabajo de la manivela = trabajo plástico al descargar)', () => {
    for (const mode of ['CURRICULAR', 'REALISTIC'] as const) {
      const { w } = ideal(110, [], mode);
      expect(conservedTotalsF10(w).massesG).toBeCloseTo(w.initialTotals.massesG, 9);
      expect(Math.abs(energyResidualF10(w))).toBeLessThan(1e-6);
      expect(w.energy.crankJ).toBeGreaterThan(0.5);
      expect(w.energy.plasticJ).toBeCloseTo(w.energy.crankJ, 6);
    }
  });
});

// ─────────────────────────── 40 errores ───────────────────────────

type Fixture = () => { w: F10World; nb?: F10Notebook; check?: (w: F10World, nb?: F10Notebook) => void };

const base = (opts: Parameters<typeof h.worldF10>[0] = {}) => {
  const w = h.worldF10(opts);
  for (const item of ['coat', 'goggles', 'shoes', 'hair'] as const) h.cmdF10(w, { type: 'equipPpe', item, on: true });
  h.cmdF10(w, { type: 'startWork' });
  return w;
};

type BeamOpts = Parameters<typeof h.worldF10>[0] & { seat?: boolean; clamp?: boolean; supports?: [number, number]; zero?: boolean };

/** Viga montada en sus apoyos (como la ruta), con interruptores para dejar una parte sin hacer. */
const beamReady = (opts: BeamOpts = {}) => {
  const w = base(opts);
  const { C } = io(w);
  C({ type: 'zeroDyn' });
  C({ type: 'levelBench' });
  const [a, b] = opts.supports ?? [10, 110];
  C({ type: 'setSupport', id: 'A', sCm: a });
  C({ type: 'setSupport', id: 'B', sCm: b });
  if (opts.clamp ?? true) for (const id of ['A', 'B'] as const) C({ type: 'clampSupport', id, on: true });
  C({ type: 'connect', channel: 'cells', on: true });
  if (opts.zero ?? true) C({ type: 'zeroCells' });
  C({ type: 'placeBeam', where: 'supports' });
  if (opts.seat ?? true) C({ type: 'seatBeam' });
  return w;
};

/** Carga colgada (gancho cerrado salvo que se pida) y espera a que la viga se quiete. */
const hang = (w: F10World, x = 60, close = true) => {
  const { W, C, Rn } = io(w);
  if (close) C({ type: 'closeHook', id: 'load1', on: true });
  C({ type: 'hangLoad', id: 'load1', sCm: x });
  h.waitBeam(W, Rn);
};

type PressOpts = Parameters<typeof h.worldF10>[0] & {
  align?: boolean; unlock?: boolean; calibrate?: boolean; axis?: 'axial' | 'transverse'; tilt?: number; cable?: boolean; range?: number; rate?: number; shield?: boolean;
};

/** Prensa lista (la de la ruta), con interruptores para dejar una parte sin hacer. */
const pressReady = (opts: PressOpts = {}) => {
  const w = base(opts);
  const { C, Rn } = io(w);
  C({ type: 'setShield', closed: false });
  C({ type: 'installSpecimen', id: 'spec1' });
  if (opts.align ?? true) C({ type: 'alignGrips' });
  if (opts.unlock ?? true) C({ type: 'lockCrank', on: false });
  C({ type: 'clampGrip', grip: 'bottom', on: true });
  C({ type: 'clampGrip', grip: 'top', on: true });
  if (!(opts.unlock ?? true)) C({ type: 'lockCrank', on: false });
  for (const ch of ['press', 'gauge'] as const) C({ type: 'connect', channel: ch, on: true });
  if (opts.calibrate ?? true) C({ type: 'calibrateGauge' });
  C({ type: 'mountGauge', axis: opts.axis ?? 'axial' });
  if (opts.tilt) C({ type: 'tiltGauge', deg: opts.tilt });
  if (opts.cable ?? true) C({ type: 'routeCable', on: true });
  C({ type: 'setCellRange', n: opts.range ?? 1 });
  C({ type: 'setRate', hz: opts.rate ?? 20 });
  if (opts.shield ?? true) C({ type: 'setShield', closed: true });
  Rn(0.5);
  C({ type: 'zeroLoadCell' });
  C({ type: 'zeroGauge' });
  return w;
};

/** Gira la manivela hasta `mm` y espera a que la probeta quede quieta. */
const crank = (w: F10World, mm: number) => {
  const { W, C, Rn } = io(w);
  C({ type: 'setCrank', mm });
  h.waitPress(W, Rn);
};

const nbWith = (mut: (nb: F10Notebook, w: F10World, ids: h.RouteIdsF10) => void, seed = 110, scenarios: string[] = []) => {
  const { w, nb, ids } = ideal(seed, scenarios);
  mut(nb, w, ids);
  return { w, nb };
};

const readA = (w: F10World) => R(w, h.cmdF10(w, { type: 'readCell', id: 'A' }));
const readG = (w: F10World) => R(w, h.cmdF10(w, { type: 'readGauge' }));
const readF = (w: F10World) => R(w, h.cmdF10(w, { type: 'readLoadCell' }));

const FIXTURES: Record<string, Fixture> = {
  E01: () => {
    const w = beamReady({ seat: false });
    hang(w);
    const r = readA(w);
    return { w, check: () => {
      expect(r.qualityFlags).toContain('NOT_SEATED');
      expect(Math.abs(r.value - r.trueValue)).toBeGreaterThan(0.5);
    } };
  },
  E02: () => {
    const w = beamReady({ supports: [10, 60] });
    hang(w, 115);
    h.runF10(w, 2);
    return { w, check: () => {
      expect(w.beam.tipped).toBe(true);
      expect(w.beam.pivot).toBe('B');
      expect(w.damaged).toBe(true);
      expect(w.safety.block?.code).toBe('BEAM_TIPPED');
      expect(w.energy.dissipatedJ).toBeGreaterThan(0.1);
      expect(Math.abs(energyResidualF10(w))).toBeLessThan(1e-6);
      expect(evaluateF10(w, emptyF10Notebook()).components.find((c) => c.id === 'safety')!.score).toBe(0);
    } };
  },
  E03: () => nbWith((nb, w) => (nb.eqRows[1].RbPred = expectedEqF10(w, nb, nb.eqRows[1]).RbNoBeam.toPrecision(5))),
  E04: () => nbWith((nb, w) => (nb.eqRows[1].RbPred = expectedEqF10(w, nb, nb.eqRows[1]).RbFromEnd.toPrecision(5))),
  E05: () => {
    const w = base();
    const { C, Rn } = io(w);
    C({ type: 'zeroDyn' });
    C({ type: 'aimDyn', deg: 12 });
    C({ type: 'hangOnDyn', id: 'beam' });
    Rn(2);
    const r = R(w, C({ type: 'readDyn', viewDeg: 0 }));
    return { w, check: () => {
      expect(r.qualityFlags).toContain('OBLIQUE');
      expect(r.value / r.trueValue).toBeCloseTo(Math.cos(12 * DEG), 1);
    } };
  },
  E06: () => {
    const w = beamReady();
    hang(w);
    h.cmdF10(w, { type: 'steadyBeam', on: true });
    const r = readA(w);
    return { w, check: () => expect(r.qualityFlags).toContain('HAND_ON') };
  },
  E07: () => {
    const w = beamReady();
    h.cmdF10(w, { type: 'hangLoad', id: 'load1', sCm: 60 });
    h.runF10(w, 1);
    return { w, check: () => {
      expect(w.loads.load1.where).toBe('bench');
      expect(w.safety.block?.code).toBe('MASS_DROPPED');
      expect(w.damaged).toBe(true);
      expect(evaluateF10(w, emptyF10Notebook()).components.find((c) => c.id === 'safety')!.score).toBe(0);
    } };
  },
  E08: () => nbWith((nb) => (nb.eqRows[2].RaPred = '-1.20')),
  E09: () => {
    const w0 = h.worldF10();
    const a = Math.round(w0.cgS - 1.2);
    const w = beamReady({ supports: [a, a + 2.4] });
    h.waitBeam(io(w).W, io(w).Rn);
    const r = readA(w);
    return { w, check: () => {
      expect(tippingF10(w)).toBe(false);
      expect(r.qualityFlags).toContain('ILL_COND');
    } };
  },
  E10: () => nbWith((nb, w) => (nb.eqRows[0].tauA = expectedEqF10(w, nb, nb.eqRows[0]).tauFlipped.toPrecision(4))),
  E11: () => {
    const w = pressReady({ axis: 'transverse' });
    crank(w, 0.2);
    const r = readG(w);
    return { w, check: () => {
      expect(r.qualityFlags).toContain('TRANSVERSE');
      expect(r.value).toBeLessThan(0);
      expect(Math.abs(r.value)).toBeLessThan(0.01);
    } };
  },
  E12: () => nbWith((nb, w) => (nb.elRows[0].sigma = (expectedElF10(w, nb, nb.elRows[0]).sigma * 1e-6).toPrecision(6))),
  E13: () => nbWith((nb, _w, ids) => (nb.elRows[4].eId = ids.res)),
  E14: () => {
    const w = pressReady();
    crank(w, 0.2);
    h.cmdF10(w, { type: 'releaseCrank' });
    h.runF10(w, 0.5);
    const r = readG(w);
    return { w, check: () => {
      expect(r.qualityFlags).toContain('TRANSIENT');
      expect(w.press.u).toBe(0);
    } };
  },
  E15: () => {
    const w = pressReady({ align: false });
    crank(w, 0.2);
    const r = readG(w);
    return { w, check: () => {
      expect(r.qualityFlags).toContain('ECCENTRIC');
      expect(r.value / r.trueValue).toBeGreaterThan(1.08);
    } };
  },
  E16: () => {
    const w = pressReady();
    crank(w, 0.6);
    crank(w, 0);
    crank(w, 0.2);
    const r = readF(w);
    return { w, check: () => {
      expect(r.qualityFlags).toContain('PREDEFORMED');
      expect(r.value).toBeLessThan(10);
    } };
  },
  E17: () => nbWith((nb) => {
    const r = nb.elRows[0];
    [r.sigma, r.eps] = [r.eps, r.sigma];
  }),
  E18: () => {
    const w = pressReady();
    h.cmdF10(w, { type: 'setCrank', mm: 0.2 });
    h.runF10(w, 0.5);
    const r = readG(w);
    return { w, check: () => {
      expect(pressMovingF10(w)).toBe(true);
      expect(r.qualityFlags).toContain('VIBRATION');
    } };
  },
  E19: () => {
    const w = pressReady({ unlock: false });
    const r = readF(w);
    return { w, check: () => {
      expect(w.press.preloadMm).toBeGreaterThan(0);
      expect(r.qualityFlags).toContain('PRELOAD');
      expect(w.press.forceN).toBeGreaterThan(100);
    } };
  },
  E20: () => {
    const w = base();
    const { W, C } = io(w);
    C({ type: 'placeBeam', where: 'wedge' });
    h.findBalance(W, C);
    const r = R(w, C({ type: 'readTape', target: 'cg', viewDeg: 0 }));
    return { w, check: () => {
      expect(r.qualityFlags).toContain('BENCH_TILTED');
      expect(Math.abs(r.value - w.cgS)).toBeGreaterThan(0.05);
    } };
  },
  E21: () => {
    const w = base();
    const { C, Rn } = io(w);
    C({ type: 'hangOnDyn', id: 'load1' });
    Rn(2);
    const r = R(w, C({ type: 'readDyn', viewDeg: 0 }));
    return { w, check: () => {
      expect(r.qualityFlags).toContain('NOT_ZEROED');
      expect(Math.abs(r.value - r.trueValue)).toBeGreaterThan(0.04);
    } };
  },
  E22: () => {
    const w = pressReady({ range: 0 });
    crank(w, 0.25);
    const r = readF(w);
    return { w, check: () => {
      expect(r.qualityFlags).toContain('CLIPPED');
      expect(r.value).toBeLessThanOrEqual(2000);
      expect(r.trueValue).toBeGreaterThan(3000);
    } };
  },
  E23: () => {
    const w = beamReady();
    h.cmdF10(w, { type: 'connect', channel: 'cells', on: false });
    h.waitBeam(io(w).W, io(w).Rn);
    const r = readA(w);
    return { w, check: () => {
      expect(r.qualityFlags).toContain('UNPLUGGED');
      expect(r.valid).toBe(false);
    } };
  },
  E24: () => {
    const w = pressReady({ rate: 5 });
    const { C } = io(w);
    C({ type: 'startLog' });
    crank(w, 0.2);
    C({ type: 'stopLog' });
    const r = R(w, C({ type: 'readCurve' }));
    return { w, check: () => {
      expect(r.qualityFlags).toContain('LOW_RATE');
      expect(r.fit!.n).toBeLessThan(40);
    } };
  },
  E25: () => {
    const w = pressReady({ cable: false });
    crank(w, 0.1);
    const r = readG(w);
    return { w, check: () => expect(r.qualityFlags).toContain('OCCLUDED') };
  },
  E26: () => {
    const w = pressReady({ tilt: 15 });
    crank(w, 0.2);
    const r = readG(w);
    return { w, check: () => {
      expect(r.qualityFlags).toContain('TILTED_GAUGE');
      expect(r.value / r.trueValue).toBeCloseTo(Math.cos(15 * DEG), 1);
    } };
  },
  E27: () => {
    const w = pressReady({ calibrate: false, scenarios: [SF10.GAUGE_UNCAL] });
    crank(w, 0.2);
    const r = readG(w);
    return { w, check: () => {
      expect(r.qualityFlags).toContain('UNCALIBRATED');
      expect(r.value / r.trueValue).toBeCloseTo(1.06, 2);
    } };
  },
  E28: () => {
    const w = beamReady({ clamp: false });
    hang(w);
    const r = readA(w);
    return { w, check: () => {
      expect(w.supports.A.driftCm).toBeGreaterThan(0);
      expect(w.supports.A.s).not.toBe(10);
      expect(r.qualityFlags).toContain('SUPPORT_MOVED');
    } };
  },
  E29: () => {
    const w = beamReady();
    const r = R(w, h.cmdF10(w, { type: 'readTape', target: 'supA', viewDeg: 20 }));
    return { w, check: () => {
      expect(r.qualityFlags).toContain('PARALLAX');
      expect(r.value).not.toBe(10);
    } };
  },
  E30: () => {
    const w = beamReady();
    h.cmdF10(w, { type: 'closeHook', id: 'load1', on: true });
    h.cmdF10(w, { type: 'hangLoad', id: 'load1', sCm: 60 });
    const r = readA(w);
    return { w, check: () => expect(r.qualityFlags).toContain('UNSTABLE') };
  },
  E31: () => nbWith((nb) => (nb.setup.Wb = { value: '4.90', uncertainty: '', readingId: null })),
  E32: () => {
    const w = pressReady();
    const { C, Rn } = io(w);
    C({ type: 'startLog' });
    C({ type: 'setCrank', mm: 0.2 });
    Rn(1);
    C({ type: 'setRate', hz: 100 });
    const r = readF(w);
    return { w, check: () => expect(r.qualityFlags).toContain('CONFIG_CHANGED') };
  },
  E33: () => nbWith((nb) => (nb.eqRows[0].rbId = nb.eqRows[1].rbId)),
  E34: () => nbWith((nb) => (nb.eqRows[2].RbPred = String(Number(nb.eqRows[2].RbPred) * 100))),
  E35: () => nbWith((nb, w) => {
    const row = nb.elRows.find((r) => expectedElF10(w, nb, r).roundedDiffers);
    expect(row).toBeTruthy();
    row!.eps = expectedElF10(w, nb, row!).epsRounded.toPrecision(6);
  }),
  E36: () => nbWith((nb, w) => (nb.calc.E.value = expectedCalcF10(w, nb).Einv.toPrecision(5))),
  E37: () => nbWith((nb) => (nb.elRows[4] = { fId: null, eId: null, sigma: '', eps: '' })),
  E38: () => nbWith((nb, w) => (nb.calc.E.uncertainty = (expectedCalcF10(w, nb).uBE / 10).toPrecision(2))),
  E39: () => {
    const w = FIXTURES.E07().w;
    const { C } = io(w);
    C({ type: 'recoverLoad', id: 'load1' });
    C({ type: 'acknowledge' });
    hang(w);
    const r = readA(w);
    return { w, check: () => {
      expect(w.safety.block).toBeNull();
      expect(r.qualityFlags).toContain('POST_IMPACT');
    } };
  },
  E40: () => {
    const w = pressReady();
    crank(w, 0.2);
    const r = h.cmdF10(w, { type: 'closeStation' });
    return { w, check: () => {
      expect(r.code).toBe('NOT_SAFE');
      expect(w.evidence.stationClosed).toBeUndefined();
    } };
  },
};

describe('F10 — los 40 errores simulables', () => {
  it('el catálogo tiene 40 códigos, 20 + 20, con contrato completo y texto de retroalimentación', () => {
    expect(SIMULATED_ERRORS_F10).toHaveLength(40);
    expect(SIMULATED_ERRORS_F10.filter((e) => e.group === 'EXPERIMENTAL')).toHaveLength(20);
    const fb = (esF10 as { f10fb: Record<string, string> }).f10fb;
    for (const e of SIMULATED_ERRORS_F10) {
      expect(e.trigger && e.effect && e.fixture, e.id).toBeTruthy();
      expect(fb[errKeyF10(e)], e.id).toBeTruthy();
    }
  });

  it.each(SIMULATED_ERRORS_F10.map((e) => [e.id, e] as const))('%s: disparador → evidencia y consecuencia', (_id, e) => {
    const key = errKeyF10(e);
    const fx = FIXTURES[key]();
    if (e.evidenceKey.startsWith('err:')) expect(ev(fx.w, key), e.id).toBeGreaterThan(0);
    else expect(notebookIssuesF10(fx.w, fx.nb!)).toContain(`nb:${key}`);
    fx.check?.(fx.w, fx.nb);
  });
});

describe('F10 — escenarios docentes', () => {
  it.each(F10_SCENARIOS)('%s permite terminar por una ruta válida', (s) => {
    const { w, nb } = ideal(110, [s]);
    const flags = f10StageEvidence(w, nb);
    expect(Object.entries(flags).filter(([, v]) => !v).map(([k]) => k)).toEqual([]);
    expect(notebookIssuesF10(w, nb)).toEqual([]);
    expect(errsOf(w)).toEqual([]);
  });

  it('S01–S04 cambian la viga y los apoyos; S04 cuelga la carga en voladizo sin volcar', () => {
    expect(h.worldF10({ scenarios: [SF10.LIGHT] }).params.beamKg).toBe(0.25);
    expect(h.worldF10({ scenarios: [SF10.HEAVY] }).params.beamKg).toBe(0.9);
    const sup = (s: string[]) => {
      const { w, nb } = ideal(110, s);
      return [w.readings[nb.setup.xA.readingId!].value, w.readings[nb.setup.xB.readingId!].value];
    };
    expect(sup([SF10.CLOSE])).toEqual([35, 85]);
    const { w, nb } = ideal(110, [SF10.OVERHANG]);
    const last = expectedEqF10(w, nb, nb.eqRows[3]);
    expect(last.x).toBeGreaterThan(90);
    expect(last.RA).toBeGreaterThan(0);
    expect(last.RB).toBeGreaterThan(last.RbPred - 0.1);
  });

  it('S05/S06 cambian el material; S07 y S08 corren la fluencia', () => {
    const E = (s: string[]) => {
      const { w, nb } = ideal(110, s);
      return expectedCalcF10(w, nb).E;
    };
    expect(E([SF10.STEEL]) / 200e9).toBeCloseTo(1, 1);
    expect(E([SF10.ALUMINIUM]) / 70e9).toBeCloseTo(1, 1);
    const sy = (s: string[]) => {
      const { w, ids } = ideal(110, s);
      return w.readings[ids.curve].value;
    };
    const s0 = sy([]);
    expect(sy([SF10.ELASTIC])).toBeGreaterThan(s0 * 1.4);
    expect(h.worldF10({ scenarios: [SF10.YIELD] }).specimens.spec1.sigmaY).toBeCloseTo(150e6, -3);
  });

  it('S09 descalibra el comparador; S10 afloja un filo; S11 monta la probeta excéntrica; S12 sin descarga rápida', () => {
    expect(h.worldF10({ scenarios: [SF10.GAUGE_UNCAL] }).gauge.scale).toBe(1.06);
    const w = base({ scenarios: [SF10.LOOSE] });
    expect(w.supports.B.loose).toBe(true);
    h.cmdF10(w, { type: 'placeBeam', where: 'supports' });
    h.cmdF10(w, { type: 'seatBeam' });
    expect(w.beam.seated).toBe(false);
    const p = base({ scenarios: [SF10.ECCENTRIC] });
    h.cmdF10(p, { type: 'installSpecimen', id: 'spec1' });
    expect(p.press.eccMm).toBe(0.25);
    const q = pressReady({ scenarios: [SF10.SLOW_UNLOAD] });
    expect(h.cmdF10(q, { type: 'releaseCrank' }).code).toBe('NO_QUICK');
  });
});

describe('F10 — seguridad y reanudación', () => {
  it('la viga volcada bloquea hasta quitar la carga, levantarla y reconocer; luego hay que revisarla', () => {
    const w = FIXTURES.E02().w;
    const { C } = io(w);
    expect(C({ type: 'readCell', id: 'A' }).code).toBe('BLOCKED');
    expect(C({ type: 'acknowledge' }).code).toBe('SECURE_FIRST');
    expect(C({ type: 'resetBeam' }).code).toBe('LOADED');
    C({ type: 'unhangLoad', id: 'load1' });
    expect(C({ type: 'resetBeam' }).ok).toBe(true);
    expect(C({ type: 'acknowledge' }).ok).toBe(true);
    expect(w.damaged).toBe(true);
    C({ type: 'repairBeam' });
    expect(w.damaged).toBe(false);
  });

  it('el protector interbloquea la carga de la prensa y el freno impide girar la manivela', () => {
    const w = pressReady({ shield: false });
    const { C } = io(w);
    expect(C({ type: 'setCrank', mm: 0.2 }).code).toBe('SHIELD_OPEN');
    expect(w.evidence.interlock).toBe(1);
    C({ type: 'setShield', closed: true });
    C({ type: 'lockCrank', on: true });
    expect(C({ type: 'setCrank', mm: 0.2 }).code).toBe('CRANK_LOCKED');
  });

  it('sin EPP no se opera; la reanudación frena la manivela donde está y termina el vuelco', () => {
    const w0 = h.worldF10();
    expect(h.cmdF10(w0, { type: 'setCrank', mm: 0.2 }).code).toBe('PPE');
    const w = pressReady();
    h.cmdF10(w, { type: 'setCrank', mm: 0.3 });
    h.runF10(w, 2);
    expect(pressMovingF10(w)).toBe(true);
    sanitizeOnResumeF10(w);
    expect(pressMovingF10(w)).toBe(false);
    expect(w.press.crankLocked).toBe(true);
    expect(Math.abs(energyResidualF10(w))).toBeLessThan(1e-9);
    const b = beamReady({ supports: [10, 60] });
    h.cmdF10(b, { type: 'closeHook', id: 'load1', on: true });
    h.cmdF10(b, { type: 'hangLoad', id: 'load1', sCm: 115 });
    h.runF10(b, 0.1);
    expect(tippingF10(b)).toBe(true);
    sanitizeOnResumeF10(b);
    expect(b.beam.tipped).toBe(true);
    expect(b.safety.block?.code).toBe('BEAM_TIPPED');
  });

  it('el cierre exige la probeta descargada, la manivela en cero, viga y carga guardadas y el protector cerrado', () => {
    const w = pressReady();
    const { C } = io(w);
    crank(w, 0.1);
    expect(C({ type: 'closeStation' }).code).toBe('NOT_SAFE');
    crank(w, 0);
    C({ type: 'hangOnDyn', id: 'load1' });
    expect(C({ type: 'closeStation' }).code).toBe('ITEMS_OUT');
    C({ type: 'unhangDyn' });
    C({ type: 'placeBeam', where: 'wedge' });
    expect(C({ type: 'closeStation' }).code).toBe('BEAM_OUT');
    C({ type: 'placeBeam', where: 'rack' });
    C({ type: 'setShield', closed: false });
    expect(C({ type: 'closeStation' }).code).toBe('SHIELD_OPEN');
    C({ type: 'setShield', closed: true });
    expect(C({ type: 'closeStation' }).ok).toBe(true);
  });
});
