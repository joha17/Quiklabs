/**
 * F09 — recorridos completos sin escena (§17, matriz «Integración»): ruta ideal por comandos hasta la entrega con la
 * máquina por etapas y la evaluación, en modo realista y curricular y con varias semillas; los 40 errores
 * F09-E01…E40 con su disparador y su consecuencia causal; los 12 escenarios docentes; seguridad y reanudación.
 */
import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import type { F09World, ReadingF9 } from '../../simulation/f09-world/types';
import type { F09Command } from '../../simulation/f09-world/commands';
import { SF9, spinningF9 } from '../../simulation/f09-world/world';
import { conservedTotalsF09, energyResidualJ } from '../../simulation/f09-world/conservation';
import { emptyF09Notebook, type F09Notebook } from '../../practices/practice-f09/notebook';
import { f09StageEvidence } from '../../practices/practice-f09/evidence';
import { practiceF09Machine, f09StageName } from '../../practices/practice-f09/workflow.machine';
import { F09_WEIGHTS, evaluateF09, notebookIssuesF09 } from '../../practices/practice-f09/rubric';
import { SIMULATED_ERRORS_F09, F09_SCENARIOS, errKeyF9 } from '../../practices/practice-f09/error-scenarios';
import { sanitizeOnResumeF09 } from '../../practices/practice-f09/resume';
import { expectedCalcF9, expectedCircF9, expectedMomentumF9 } from '../../practices/practice-f09/expected-results';
import esF09 from '../../locales/es/practiceF09.json';
import * as h from '../helpersF09';

const ev = (w: F09World, k: string) => w.evidence[`err:${k}`] ?? 0;
const R = (w: F09World, r: { id?: string }): ReadingF9 => w.readings[r.id!];
const RPM = 60 / (2 * Math.PI);

function ideal(seed = 109, scenarios: string[] = [], mode?: 'CURRICULAR' | 'REALISTIC') {
  const r = h.idealRouteF9(seed, scenarios as never, mode);
  return { ...r, nb: h.fillNotebookF9(r.w, r.ids) };
}

/** Atajos con la firma de la ruta (mundo diferido, comando, avance). */
const io = (w: F09World) => ({ W: () => w, C: (c: F09Command) => h.cmdF9(w, c), Rn: (s: number) => h.runF9(w, s) });
const errsOf = (w: F09World) => Object.keys(w.evidence).filter((k) => k.startsWith('err:') && w.evidence[k] > 0);

describe('F09 — ruta ideal', () => {
  it('cumple las etapas por evidencia y llega a COMPLETE sin errores', () => {
    const { w, nb } = ideal();
    const flags = f09StageEvidence(w, nb);
    expect(Object.entries(flags).filter(([, v]) => !v).map(([k]) => k)).toEqual([]);
    const actor = createActor(practiceF09Machine).start();
    actor.send({ type: 'START' });
    actor.send({ type: 'PPE_CONFIRMED' });
    expect(f09StageName(actor.getSnapshot().value)).toBe('PREPARE');
    actor.send({ type: 'EVIDENCE', flags });
    expect(f09StageName(actor.getSnapshot().value)).toBe('COMPLETE');
    expect(errsOf(w)).toEqual([]);
    expect(notebookIssuesF09(w, nb)).toEqual([]);
  });

  it('la evaluación da el máximo automático (las respuestas abiertas quedan a revisión)', () => {
    const { w, nb } = ideal();
    const e = evaluateF09(w, nb);
    expect(Object.values(F09_WEIGHTS).reduce((s, x) => s + x, 0)).toBeCloseTo(1, 12);
    for (const c of e.components.filter((x) => x.id !== 'analysis')) expect(c.score, c.id).toBe(1);
    expect(e.total).toBeGreaterThan(0.95);
    expect(e.needsTeacherReview.length).toBeGreaterThan(0);
  });

  it('la máquina no avanza sin evidencia (no hay evento «Siguiente»)', () => {
    const w = h.worldF9();
    for (const item of ['coat', 'goggles', 'shoes', 'hair'] as const) h.cmdF9(w, { type: 'equipPpe', item, on: true });
    h.cmdF9(w, { type: 'startWork' });
    const actor = createActor(practiceF09Machine).start();
    actor.send({ type: 'START' });
    actor.send({ type: 'PPE_CONFIRMED' });
    actor.send({ type: 'EVIDENCE', flags: f09StageEvidence(w, h.fillNotebookF9(w, h.emptyRouteIdsF9())) });
    expect(f09StageName(actor.getSnapshot().value)).toBe('PREPARE');
  });

  it.each([7, 2024, 99991])('semilla %i: pendiente F–ω² ≈ m r, I de los dos tirones coincide y L casi constante', (seed) => {
    const { w, nb } = ideal(seed);
    const ec = expectedCalcF9(w, nb);
    expect(Math.abs(ec.mr / ec.mrPred - 1)).toBeLessThan(0.02);
    const trueI = w.params.I0 + 2 * w.params.slideKg * 0.15 ** 2;
    expect(Math.abs(ec.Itorque / trueI - 1)).toBeLessThan(0.01);
    expect(Math.abs(ec.I0 / w.params.I0 - 1)).toBeLessThan(0.03);
    const mo = expectedMomentumF9(w, nb, ec.I0);
    expect(Math.abs(mo.dL)).toBeLessThan(4);
    expect(mo.K2 / mo.K1).toBeGreaterThan(1.8);
    expect(notebookIssuesF09(w, nb)).toEqual([]);
  });

  it('modo curricular: F medida = m ω² r, I exacto y L conservado', () => {
    const { w, nb } = ideal(109, [], 'CURRICULAR');
    for (const row of nb.circRows) {
      const e = expectedCircF9(w, nb, row);
      expect(Math.abs(e.diff)).toBeLessThan(0.5);
    }
    const ec = expectedCalcF9(w, nb);
    expect(ec.Itorque).toBeCloseTo(w.params.I0 + 2 * w.params.slideKg * 0.15 ** 2, 4);
    const mo = expectedMomentumF9(w, nb, ec.I0);
    expect(Math.abs(mo.dL)).toBeLessThan(0.3);
  });

  it('conserva la masa y cierra el balance de energía', () => {
    for (const mode of ['CURRICULAR', 'REALISTIC'] as const) {
      const { w } = ideal(109, [], mode);
      expect(conservedTotalsF09(w).massesG).toBeCloseTo(w.initialTotals.massesG, 9);
      expect(Math.abs(energyResidualJ(w))).toBeLessThan(1e-6);
      expect(w.energy.pullJ).toBeGreaterThan(0);
    }
  });
});

// ─────────────────────────── 40 errores ───────────────────────────

type Fixture = () => { w: F09World; nb?: F09Notebook; check?: (w: F09World, nb?: F09Notebook) => void };

const base = (opts: Parameters<typeof h.worldF9>[0] = {}) => {
  const w = h.worldF9(opts);
  for (const item of ['coat', 'goggles', 'shoes', 'hair'] as const) h.cmdF9(w, { type: 'equipPpe', item, on: true });
  h.cmdF9(w, { type: 'startWork' });
  return w;
};

type ReadyOpts = Parameters<typeof h.worldF9>[0] & {
  clamp?: boolean; level?: boolean; connect?: boolean; calibrate?: boolean; cable?: boolean; fzero?: boolean; range?: number; rate?: number; tighten?: boolean; orbit?: boolean; orbitR?: number;
  slides?: [number, number]; guard?: boolean;
};

/** Montaje listo (el de la ruta), con interruptores para dejar una parte sin hacer. */
const ready = (opts: ReadyOpts = {}) => {
  const w = base(opts);
  const { C } = io(w);
  C({ type: 'setGuard', closed: false });
  C({ type: 'tareBalance' });
  if (opts.clamp ?? true) C({ type: 'clampBase', on: true });
  if (opts.level ?? true) C({ type: 'levelAxis' });
  if (opts.connect ?? true) for (const ch of ['encoder', 'force', 'gate'] as const) C({ type: 'connect', channel: ch, on: true });
  if (opts.calibrate ?? true) C({ type: 'calibrateEncoder' });
  if (opts.cable ?? true) C({ type: 'routeCable', on: true });
  if (opts.fzero ?? true) C({ type: 'zeroForce' });
  C({ type: 'setForceRange', n: opts.range ?? 1 });
  C({ type: 'setRate', hz: opts.rate ?? 200 });
  C({ type: 'zeroDyn' });
  const [s1, s2] = opts.slides ?? [15, 15];
  for (const [s, r] of [['slide1', s1], ['slide2', s2]] as const) {
    C({ type: 'lockMass', id: s, on: false });
    C({ type: 'setSlide', id: s, rCm: r });
    C({ type: 'lockMass', id: s, on: true });
  }
  if (opts.orbit ?? true) {
    C({ type: 'mountOrbit', on: true });
    if (opts.tighten ?? true) C({ type: 'tightenCord' });
    C({ type: 'setOrbitRadius', rCm: opts.orbitR ?? 20 });
    C({ type: 'lockStop', on: true });
  }
  if (opts.guard ?? true) C({ type: 'setGuard', closed: true });
  C({ type: 'setBrake', level: 0 });
  return w;
};

/** Mesa girando con el motor a `rpm` (subida gradual) y estable. */
const spinAt = (w: F09World, rpm: number) => {
  const { W, C, Rn } = io(w);
  C({ type: 'setClutch', on: true });
  h.rampTo(W, C, Rn, rpm);
  Rn(3);
  return w;
};

/** Un tirón con el dinamómetro (sin masa orbitante). */
const pull = (w: F09World, o: { arm?: number; force?: number; dir?: number; aim?: number } = {}) => {
  const { W, C, Rn } = io(w);
  C({ type: 'setGuard', closed: false });
  if (w.objects.orbit01.support === 'guide') {
    C({ type: 'lockStop', on: false });
    C({ type: 'mountOrbit', on: false });
  }
  C({ type: 'setArm', rCm: o.arm ?? 20 });
  C({ type: 'windCord', turns: 1, dir: o.dir ?? 1 });
  C({ type: 'aimDyn', deg: o.aim ?? 0 });
  C({ type: 'setPull', forceN: o.force ?? 2 });
  C({ type: 'setGuard', closed: true });
  C({ type: 'setBrake', level: 0 });
  C({ type: 'startPull' });
  Rn(0.4);
  const dyn = R(w, C({ type: 'readDyn', viewDeg: 0 }));
  h.waitRun(W, Rn);
  const enc = R(w, C({ type: 'readEncoder' }));
  h.stopTable(W, C, Rn);
  return { dyn, enc };
};

/** Masas a (r1, r2) cm, giro a 50 rpm; con `clutchOff` se desacopla antes de leer ω₁. */
const momentum = (r1: number, r2: number, o: { clutchOff?: boolean; brake?: number } = {}) => {
  const w = ready({ orbit: false, slides: [r1, r2] });
  const { W, C, Rn } = io(w);
  spinAt(w, 50);
  if (o.clutchOff ?? true) C({ type: 'setClutch', on: false });
  if (o.brake) C({ type: 'setBrake', level: o.brake });
  Rn(1);
  const w1 = R(w, C({ type: 'readOmega' }));
  C({ type: 'pullIn', rCm: 6 });
  Rn(0.2);
  h.waitPull(W, Rn);
  Rn(1);
  const w2 = R(w, C({ type: 'readOmega' }));
  return { w, w1, w2 };
};

const nbWith = (mut: (nb: F09Notebook, w: F09World) => void, seed = 109, scenarios: string[] = []) => {
  const { w, nb } = ideal(seed, scenarios);
  mut(nb, w);
  return { w, nb };
};

const readF = (w: F09World) => R(w, h.cmdF9(w, { type: 'readForce' }));
const trueF = (w: F09World) => w.params.orbitKg * w.rotor.omega ** 2 * w.orbit.r;

const FIXTURES: Record<string, Fixture> = {
  E01: () => {
    const w = ready({ orbitR: 28 });
    const { C, Rn } = io(w);
    C({ type: 'setClutch', on: true });
    C({ type: 'setMotor', rpm: 20 });
    Rn(2);
    return { w, check: () => {
      expect(w.orbit.off).toBe(true);
      expect(w.damaged).toBe(true);
      expect(w.safety.block?.code).toBe('ORBIT_OFF_GUIDE');
      expect(w.rotor.brake).toBe(2);
    } };
  },
  E02: () => {
    const w = ready({ guard: false });
    const r = h.cmdF9(w, { type: 'setClutch', on: true });
    const m = h.cmdF9(w, { type: 'setMotor', rpm: 30 });
    return { w, check: () => {
      expect(r.code).toBe('GUARD_OPEN');
      expect(m.code).toBe('GUARD_OPEN');
      expect(w.motor.target).toBe(0);
    } };
  },
  E03: () => {
    const w = ready({ orbit: false });
    const a = pull(w, { aim: 0 }).enc;
    const b = pull(w, { aim: 25 }).enc;
    return { w, check: () => {
      expect(b.qualityFlags).toContain('OBLIQUE');
      expect(b.value / a.value).toBeCloseTo(Math.cos((25 * Math.PI) / 180), 1);
    } };
  },
  E04: () => {
    const w = ready();
    const { C } = io(w);
    C({ type: 'setGuard', closed: false });
    for (const s of ['slide1', 'slide2'] as const) C({ type: 'lockMass', id: s, on: false });
    C({ type: 'setGuard', closed: true });
    spinAt(w, 30);
    const r = readF(w);
    return { w, check: () => {
      expect(w.slides.slide1.r).not.toBe(w.slides.slide2.r);
      expect(r.qualityFlags).toContain('ASYMMETRIC');
    } };
  },
  E05: () => {
    const w = ready({ guard: false });
    const r = R(w, h.cmdF9(w, { type: 'readRadius', target: 'orbit01', ref: 'edge', viewDeg: 0 }));
    return { w, check: () => {
      expect(r.qualityFlags).toContain('EDGE_REF');
      expect(r.value).toBeCloseTo(20 - 2.5, 5);
    } };
  },
  E06: () => {
    const w = spinAt(ready(), 30);
    const { W, C, Rn } = io(w);
    C({ type: 'timeTurns', turns: 0.5 });
    h.waitTiming(W, Rn);
    const r = w.readings[w.readingOrder[w.readingOrder.length - 1]];
    return { w, check: () => {
      expect(r.qualityFlags).toContain('HALF_TURN');
      expect(r.value).toBeCloseTo(1, 1);
    } };
  },
  E07: () => nbWith((nb) => (nb.circRows[0].v = nb.circRows[0].omega)),
  E08: () => nbWith((nb) => (nb.mcq = 'speed')),
  E09: () => {
    const w = ready();
    const { C, Rn } = io(w);
    C({ type: 'setClutch', on: true });
    C({ type: 'setMotor', rpm: 60 });
    Rn(3);
    const r = readF(w);
    return { w, check: () => {
      expect(w.force.zeroed).toBe(false);
      expect(r.qualityFlags).toEqual(expect.arrayContaining(['SPEED_JUMP', 'NOT_ZEROED']));
    } };
  },
  E10: () => {
    const { w, w1, w2 } = momentum(25, 25, { brake: 1 });
    return { w, check: () => {
      expect(w1.qualityFlags).toContain('BRAKING');
      expect(w2.qualityFlags).toContain('BRAKING');
    } };
  },
  E11: () => {
    const { w, w1, w2 } = momentum(25, 25, { clutchOff: false });
    return { w, check: () => {
      expect(w2.qualityFlags).toContain('MOTOR_TORQUE');
      // El motor sostiene la consigna: ω no se duplica.
      expect(w2.value / w1.value).toBeLessThan(1.3);
    } };
  },
  E12: () => {
    const { w, w2 } = momentum(25, 15);
    return { w, check: () => expect(w2.qualityFlags).toContain('ASYM_PULL') };
  },
  E13: () => {
    const w = spinAt(ready(), 30);
    const { W, C, Rn } = io(w);
    h.stopTable(W, C, Rn);
    const r = readF(w);
    return { w, check: () => {
      expect(r.qualityFlags).toContain('EMPTY');
      expect(Math.abs(r.value)).toBeLessThan(0.02);
    } };
  },
  E14: () => nbWith((nb, w) => {
    const ec = expectedCalcF9(w, nb);
    nb.momentum.K1 = expectedMomentumF9(w, nb, ec.I0).K1nomass.toPrecision(5);
  }),
  E15: () => {
    const w = ready({ orbit: false });
    const { enc } = pull(w, { dir: -1 });
    return { w, check: () => {
      expect(enc.qualityFlags).toContain('REVERSED');
      expect(enc.value).toBeLessThan(0);
    } };
  },
  E16: () => nbWith((nb, w) => (nb.calc.tauFc.value = expectedCalcF9(w, nb).FcR.toPrecision(4))),
  E17: () => {
    const w = spinAt(ready({ level: false }), 30);
    const r = readF(w);
    return { w, check: () => expect(r.qualityFlags).toContain('AXIS_TILTED') };
  },
  E18: () => {
    const w = ready({ orbit: false });
    const { dyn, enc } = pull(w, { force: 6 });
    return { w, check: () => {
      expect(dyn.qualityFlags).toContain('OVER_RANGE');
      expect(dyn.value).toBeLessThanOrEqual(w.params.dyn.rangeN + 0.05);
      expect(enc.value).toBeGreaterThan(30);
    } };
  },
  E19: () => {
    const w = spinAt(ready({ tighten: false }), 40);
    const r = readF(w);
    return { w, check: () => {
      expect(r.qualityFlags).toContain('SLACK');
      expect(r.value).toBeLessThan(trueF(w));
    } };
  },
  E20: () => {
    const w = spinAt(ready(), 30);
    const { C } = io(w);
    C({ type: 'setClutch', on: false });
    C({ type: 'setGuard', closed: false });
    const r = C({ type: 'handBrake' });
    return { w, check: () => {
      expect(r.code).toBe('HAND_CONTACT');
      expect(w.safety.block?.code).toBe('HAND_CONTACT');
      expect(evaluateF09(w, emptyF09Notebook()).components.find((c) => c.id === 'safety')!.score).toBe(0);
    } };
  },
  E21: () => {
    const w = spinAt(ready({ fzero: false }), 30);
    const r = readF(w);
    return { w, check: () => {
      expect(r.qualityFlags).toContain('NOT_ZEROED');
      expect(Math.abs(r.value - trueF(w))).toBeGreaterThan(0.01);
    } };
  },
  E22: () => {
    const w = spinAt(ready({ range: 0 }), 72);
    const r = readF(w);
    return { w, check: () => {
      expect(r.qualityFlags).toContain('CLIPPED');
      expect(r.value).toBeLessThanOrEqual(2);
      expect(trueF(w)).toBeGreaterThan(2);
    } };
  },
  E23: () => {
    const w = spinAt(ready({ connect: false }), 30);
    const r = readF(w);
    return { w, check: () => {
      expect(r.qualityFlags).toContain('UNPLUGGED');
      expect(r.valid).toBe(false);
    } };
  },
  E24: () => {
    const w = ready({ orbit: false, rate: 20 });
    const { enc } = pull(w);
    return { w, check: () => expect(enc.qualityFlags).toContain('LOW_RATE') };
  },
  E25: () => {
    const w = spinAt(ready({ cable: false }), 30);
    const r = R(w, h.cmdF9(w, { type: 'timeTurns', turns: 5 }));
    return { w, check: () => {
      expect(r.qualityFlags).toContain('OCCLUDED');
      expect(r.valid).toBe(false);
    } };
  },
  E26: () => {
    const w = ready();
    h.cmdF9(w, { type: 'mountForce', angleDeg: 25 });
    spinAt(w, 40);
    const r = readF(w);
    return { w, check: () => {
      expect(r.qualityFlags).toContain('TILTED_SENSOR');
      expect(r.value / trueF(w)).toBeCloseTo(Math.cos((25 * Math.PI) / 180), 1);
    } };
  },
  E27: () => {
    const w = spinAt(ready({ calibrate: false }), 30);
    const r = R(w, h.cmdF9(w, { type: 'readOmega' }));
    return { w, check: () => {
      expect(r.qualityFlags).toContain('UNCALIBRATED');
      expect(r.value / w.rotor.omega).toBeCloseTo(400 / 360, 2);
    } };
  },
  E28: () => {
    const w = spinAt(ready({ clamp: false }), 30);
    const r = readF(w);
    return { w, check: () => {
      expect(w.base.driftRad).toBeGreaterThan(1e-4);
      expect(r.qualityFlags).toContain('SUPPORT_MOVED');
    } };
  },
  E29: () => {
    const w = ready({ guard: false });
    const r = R(w, h.cmdF9(w, { type: 'readRadius', target: 'orbit01', ref: 'center', viewDeg: 20 }));
    return { w, check: () => {
      expect(r.qualityFlags).toContain('PARALLAX');
      expect(r.value).not.toBe(20);
    } };
  },
  E30: () => {
    const w = base();
    const { C } = io(w);
    C({ type: 'tareBalance' });
    C({ type: 'placeOnBalance', id: 'orbit01' });
    const r = R(w, C({ type: 'readBalance' }));
    return { w, check: () => expect(r.qualityFlags).toContain('UNSTABLE') };
  },
  E31: () => nbWith((nb) => (nb.setup.mOrb = { value: '200', uncertainty: '', readingId: null })),
  E32: () => {
    const w = spinAt(ready(), 30);
    h.cmdF9(w, { type: 'setForceRange', n: 0 });
    const r = readF(w);
    return { w, check: () => expect(r.qualityFlags).toContain('CONFIG_CHANGED') };
  },
  E33: () => nbWith((nb) => (nb.circRows[0].periodId = nb.circRows[1].periodId)),
  E34: () => nbWith((nb) => (nb.circRows[2].Fpred = String(Number(nb.circRows[2].Fpred) * 1000))),
  E35: () => nbWith((nb, w) => {
    const e = expectedCircF9(w, nb, nb.circRows[1]);
    expect(e.roundedDiffers).toBe(true);
    nb.circRows[1].Fpred = e.FpredRounded.toPrecision(5);
  }),
  E36: () => nbWith((nb, w) => (nb.calc.mr.value = (1 / expectedCalcF9(w, nb).mr).toPrecision(4))),
  E37: () => nbWith((nb) => (nb.circRows[3] = { ...nb.circRows[3], forceId: null, periodId: null })),
  E38: () => nbWith((nb, w) => (nb.calc.Itorque.uncertainty = (expectedCalcF9(w, nb).uBI / 10).toPrecision(2))),
  E39: () => {
    const w = FIXTURES.E01().w;
    const { W, C, Rn } = io(w);
    h.stopTable(W, C, Rn);
    C({ type: 'setGuard', closed: false });
    C({ type: 'reseatOrbit' });
    C({ type: 'acknowledge' });
    C({ type: 'lockStop', on: true });
    C({ type: 'setGuard', closed: true });
    C({ type: 'setBrake', level: 0 });
    spinAt(w, 30);
    const r = readF(w);
    return { w, check: () => {
      expect(w.safety.block).toBeNull();
      expect(r.qualityFlags).toContain('POST_IMPACT');
    } };
  },
  E40: () => {
    const w = spinAt(ready(), 30);
    const r = h.cmdF9(w, { type: 'closeStation' });
    return { w, check: () => {
      expect(r.code).toBe('NOT_SAFE');
      expect(w.evidence.stationClosed).toBeUndefined();
    } };
  },
};

describe('F09 — los 40 errores simulables', () => {
  it('el catálogo tiene 40 códigos, 20 + 20, con contrato completo y texto de retroalimentación', () => {
    expect(SIMULATED_ERRORS_F09).toHaveLength(40);
    expect(SIMULATED_ERRORS_F09.filter((e) => e.group === 'EXPERIMENTAL')).toHaveLength(20);
    const fb = (esF09 as { f09fb: Record<string, string> }).f09fb;
    for (const e of SIMULATED_ERRORS_F09) {
      expect(e.trigger && e.effect && e.fixture, e.id).toBeTruthy();
      expect(fb[errKeyF9(e)], e.id).toBeTruthy();
    }
  });

  it.each(SIMULATED_ERRORS_F09.map((e) => [e.id, e] as const))('%s: disparador → evidencia y consecuencia', (_id, e) => {
    const key = errKeyF9(e);
    const fx = FIXTURES[key]();
    if (e.evidenceKey.startsWith('err:')) expect(ev(fx.w, key), e.id).toBeGreaterThan(0);
    else expect(notebookIssuesF09(fx.w, fx.nb!)).toContain(`nb:${key}`);
    fx.check?.(fx.w, fx.nb);
  });
});

describe('F09 — escenarios docentes', () => {
  it.each(F09_SCENARIOS)('%s permite terminar por una ruta válida', (s) => {
    const { w, nb } = ideal(109, [s]);
    const flags = f09StageEvidence(w, nb);
    expect(Object.entries(flags).filter(([, v]) => !v).map(([k]) => k)).toEqual([]);
    expect(notebookIssuesF09(w, nb)).toEqual([]);
    expect(errsOf(w)).toEqual([]);
  });

  it('S01–S04 cambian velocidades y radio; S05 arranca con el freno de roce; S06 y S12 con las masas sueltas o asimétricas', () => {
    const omegaOf = (s: string[]) => {
      const { w, nb } = ideal(109, s);
      return expectedCircF9(w, nb, nb.circRows[3]).omega;
    };
    const w0 = omegaOf([]);
    expect(omegaOf([SF9.SLOW])).toBeLessThan(w0 * 0.7);
    expect(omegaOf([SF9.FAST])).toBeGreaterThan(w0 * 1.3);
    const rOf = (s: string[]) => {
      const { w, nb } = ideal(109, s);
      return w.readings[nb.setup.rOrb.readingId!].value;
    };
    expect(rOf([SF9.SMALL_R])).toBe(12);
    expect(rOf([SF9.LARGE_R])).toBe(26);
    expect(h.worldF9({ scenarios: [SF9.BRAKE] }).rotor.brake).toBe(1);
    const mv = h.worldF9({ scenarios: [SF9.MOVING] }).slides;
    expect(mv.slide1.locked || mv.slide2.locked).toBe(false);
    const as = h.worldF9({ scenarios: [SF9.ASYM] }).slides;
    expect(as.slide1.r).not.toBe(as.slide2.r);
  });

  it('S07 reduce la desaceleración libre; S08 inclina el eje; S09 empieza en el rango corto; S11 con el dinamómetro inclinado', () => {
    const aC = (s: string[]) => {
      const { w, nb } = ideal(109, s);
      return w.readings[nb.torqueRows[0].encId!].fit!.alphaC!;
    };
    expect(Math.abs(aC([SF9.LOW_FRICTION]))).toBeLessThan(Math.abs(aC([])) * 0.4);
    expect(h.worldF9({ scenarios: [SF9.TILTED] }).rotor.tiltDeg).toBe(4);
    expect(h.worldF9({ scenarios: [SF9.SATURATED] }).force.rangeIdx).toBe(0);
    expect(h.worldF9({ scenarios: [SF9.OBLIQUE] }).drum.aimDeg).toBe(25);
    expect(h.worldF9({ scenarios: [SF9.TANGENTIAL] }).drum.aimDeg).toBe(0);
  });
});

describe('F09 — seguridad y reanudación', () => {
  it('la mano sobre la mesa girando bloquea hasta frenar, detenerla y cerrar la guarda', () => {
    const w = FIXTURES.E20().w;
    expect(h.cmdF9(w, { type: 'readBalance' }).code).toBe('BLOCKED');
    expect(h.cmdF9(w, { type: 'acknowledge' }).code).toBe('SECURE_FIRST');
    h.runF9(w, 3);
    expect(spinningF9(w)).toBe(false);
    expect(h.cmdF9(w, { type: 'acknowledge' }).code).toBe('SECURE_FIRST');
    h.cmdF9(w, { type: 'setGuard', closed: true });
    expect(h.cmdF9(w, { type: 'acknowledge' }).ok).toBe(true);
  });

  it('la guarda interbloquea el motor y el tirón; el freno de retención impide arrancar', () => {
    const w = ready({ orbit: false });
    const { C } = io(w);
    C({ type: 'setGuard', closed: false });
    C({ type: 'windCord', turns: 1, dir: 1 });
    C({ type: 'setPull', forceN: 2 });
    expect(C({ type: 'startPull' }).code).toBe('GUARD_OPEN');
    C({ type: 'setGuard', closed: true });
    C({ type: 'setBrake', level: 2 });
    expect(C({ type: 'startPull' }).code).toBe('BRAKE_ON');
    expect(C({ type: 'setMotor', rpm: 30 }).code).toBe('BRAKE_ON');
    expect(C({ type: 'setSlide', id: 'slide1', rCm: 10 }).code).toBe('GUARD_CLOSED');
  });

  it('sin EPP no se opera; la reanudación detiene la mesa y desacopla el motor', () => {
    const w0 = h.worldF9();
    expect(h.cmdF9(w0, { type: 'setMotor', rpm: 30 }).code).toBe('PPE');
    const w = spinAt(ready(), 40);
    expect(w.rotor.omega).toBeGreaterThan(3);
    sanitizeOnResumeF09(w);
    expect(w.rotor.omega).toBe(0);
    expect(w.motor.clutch).toBe(false);
    expect(w.motor.target).toBe(0);
    expect(Math.abs(energyResidualJ(w))).toBeLessThan(1e-9);
    h.runF9(w, 1);
    expect(spinningF9(w)).toBe(false);
  });

  it('el cierre exige la mesa frenada, el cordón suelto, la masa en el estante, masas bloqueadas y la guarda cerrada', () => {
    const w = ready();
    const { C } = io(w);
    C({ type: 'setBrake', level: 0 });
    expect(C({ type: 'closeStation' }).code).toBe('BRAKE_OFF');
    C({ type: 'setBrake', level: 2 });
    expect(C({ type: 'closeStation' }).code).toBe('ITEMS_OUT');
    C({ type: 'setGuard', closed: false });
    C({ type: 'lockStop', on: false });
    C({ type: 'mountOrbit', on: false });
    C({ type: 'windCord', turns: 1, dir: 1 });
    expect(C({ type: 'closeStation' }).code).toBe('CORD_WOUND');
    C({ type: 'windCord', turns: 0, dir: 1 });
    expect(C({ type: 'closeStation' }).code).toBe('GUARD_OPEN');
    C({ type: 'lockMass', id: 'slide1', on: false });
    C({ type: 'setGuard', closed: true });
    expect(C({ type: 'closeStation' }).code).toBe('MASSES_LOOSE');
    C({ type: 'setGuard', closed: false });
    C({ type: 'lockMass', id: 'slide1', on: true });
    C({ type: 'setGuard', closed: true });
    expect(C({ type: 'closeStation' }).ok).toBe(true);
  });

  it('una velocidad brusca deja al sensor sin cero hasta volver a ponerlo en cero con la mesa quieta', () => {
    const w = FIXTURES.E09().w;
    const { W, C, Rn } = io(w);
    h.stopTable(W, C, Rn);
    C({ type: 'zeroForce' });
    expect(w.force.zeroed).toBe(true);
    void RPM;
  });
});
