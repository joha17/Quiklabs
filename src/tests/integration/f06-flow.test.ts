/**
 * F06 — recorridos completos sin escena (§17, matriz «Integración»): ruta ideal por comandos hasta la entrega con la
 * máquina por etapas y la evaluación, en modo realista y curricular y con varias semillas; los 40 errores
 * F06-E01…E40 con su disparador y su consecuencia causal; los 12 escenarios docentes; seguridad y reanudación.
 */
import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import type { F06World, ReadingF6 } from '../../simulation/f06-world/types';
import type { F06Command } from '../../simulation/f06-world/commands';
import { SF6 } from '../../simulation/f06-world/world';
import { conservedTotalsF06, energyResidualJ, springEnergy } from '../../simulation/f06-world/conservation';
import { CART_START_S } from '../../simulation/f06-world/geometry';
import { emptyF06Notebook, type F06Notebook } from '../../practices/practice-f06/notebook';
import { f06StageEvidence } from '../../practices/practice-f06/evidence';
import { practiceF06Machine, f06StageName } from '../../practices/practice-f06/workflow.machine';
import { F06_WEIGHTS, evaluateF06, notebookIssuesF06 } from '../../practices/practice-f06/rubric';
import { SIMULATED_ERRORS_F06, F06_SCENARIOS, errKeyF6 } from '../../practices/practice-f06/error-scenarios';
import { sanitizeOnResumeF06 } from '../../practices/practice-f06/resume';
import { expectedCalcF6, expectedHeightRow, expectedLaunchRow, expectedLoss, expectedPendRow, expectedRepRow, expectedSpring } from '../../practices/practice-f06/expected-results';
import esF06 from '../../locales/es/practiceF06.json';
import * as h from '../helpersF06';

const ev = (w: F06World, k: string) => w.evidence[`err:${k}`] ?? 0;
const R = (w: F06World, r: { id?: string }): ReadingF6 => w.readings[r.id!];
const fmt = (v: number, d = 4) => v.toFixed(d);

function ideal(seed = 106, scenarios: string[] = [], mode?: 'CURRICULAR' | 'REALISTIC') {
  const r = h.idealRouteF6(seed, scenarios as never, mode);
  return { ...r, nb: h.fillNotebookF6(r.w, r.ids) };
}

/** Atajos con la firma de la ruta (mundo diferido, comando, avance). */
const io = (w: F06World) => ({ W: () => w, C: (c: F06Command) => h.cmdF6(w, c), Rn: (s: number) => h.runF6(w, s) });

describe('F06 — ruta ideal', () => {
  it('cumple las etapas por evidencia y llega a COMPLETE sin errores', () => {
    const { w, nb } = ideal();
    const flags = f06StageEvidence(w, nb);
    expect(Object.entries(flags).filter(([, v]) => !v).map(([k]) => k)).toEqual([]);
    const actor = createActor(practiceF06Machine).start();
    actor.send({ type: 'START' });
    actor.send({ type: 'PPE_CONFIRMED' });
    expect(f06StageName(actor.getSnapshot().value)).toBe('MATERIALS');
    actor.send({ type: 'EVIDENCE', flags });
    expect(f06StageName(actor.getSnapshot().value)).toBe('COMPLETE');
    expect(Object.keys(w.evidence).filter((k) => k.startsWith('err:') && w.evidence[k] > 0)).toEqual([]);
    expect(notebookIssuesF06(w, nb)).toEqual([]);
  });

  it('la evaluación da el máximo automático (las respuestas abiertas quedan a revisión)', () => {
    const { w, nb } = ideal();
    const e = evaluateF06(w, nb);
    expect(Object.values(F06_WEIGHTS).reduce((s, x) => s + x, 0)).toBeCloseTo(1, 12);
    for (const c of e.components.filter((x) => x.id !== 'analysis')) expect(c.score, c.id).toBe(1);
    expect(e.total).toBeGreaterThan(0.95);
    expect(e.needsTeacherReview.length).toBeGreaterThan(0);
  });

  it('la máquina no avanza sin evidencia (no hay evento «Siguiente»)', () => {
    const w = h.worldF6();
    for (const item of ['coat', 'goggles', 'shoes', 'hair'] as const) h.cmdF6(w, { type: 'equipPpe', item, on: true });
    h.cmdF6(w, { type: 'startWork' });
    const actor = createActor(practiceF06Machine).start();
    actor.send({ type: 'START' });
    actor.send({ type: 'PPE_CONFIRMED' });
    actor.send({ type: 'EVIDENCE', flags: f06StageEvidence(w, h.fillNotebookF6(w, h.emptyRouteIdsF6())) });
    expect(f06StageName(actor.getSnapshot().value)).toBe('MATERIALS');
  });

  it.each([7, 2024, 99991])('semilla %i: energías coherentes con las lecturas propias', (seed) => {
    const { w, nb } = ideal(seed);
    const ec = expectedCalcF6(w, nb);
    // k de la recta F–x cerca de la nominal; el área bajo F–x reproduce ½ k x².
    expect(expectedSpring(w, nb).k).toBeGreaterThan(95);
    expect(expectedSpring(w, nb).k).toBeLessThan(105);
    for (const r of nb.launchRows) {
      const e = expectedLaunchRow(w, nb, w.readings[r.readingId!]);
      expect(Math.abs(e.W - e.Uel) / e.Uel).toBeLessThan(0.03);
    }
    // El carro recibe casi toda la energía (el émbolo y la rodadura se quedan con unos %).
    expect(ec.eff).toBeGreaterThan(90);
    expect(ec.eff).toBeLessThan(100);
    // En cada altura K₂ + U_g reproduce K₁; con el patín la energía baja (W_nc < 0).
    for (const r of nb.heightRows) {
      const e = expectedHeightRow(w, nb, w.readings[r.readingId!], w.readings[r.heightId!]);
      expect(Math.abs(e.K2 + e.Ug - e.K1) / e.K1).toBeLessThan(0.02);
    }
    expect(expectedLoss(w, nb).Wnc).toBeLessThan(-0.05);
    for (const r of nb.pendRows) expect(Math.abs(expectedPendRow(w, nb, w.readings[r.readingId!]).disc)).toBeLessThan(2);
  });

  it('modo curricular: v₁ = √(2 U_el / m) y W = ½ k x² exactos (sin émbolo ni rodadura)', () => {
    const { w, ids } = ideal(106, [], 'CURRICULAR');
    const U = springEnergy(w, 'spring01', 0.15);
    const g = w.readings[ids.reps[0]];
    expect(g.gates!.trueV1!).toBeCloseTo(Math.sqrt((2 * U) / 0.2), 3);
    expect(w.readings[ids.launches[0]].launch!.trueW!).toBeCloseTo(U, 6);
  });

  it('conserva la masa y cierra el balance de energía', () => {
    const { w } = ideal(106, [], 'CURRICULAR');
    expect(conservedTotalsF06(w).massesG).toBeCloseTo(w.initialTotals.massesG, 9);
    expect(Math.abs(energyResidualJ(w))).toBeLessThan(1e-3);
    expect(Math.abs(energyResidualJ(ideal(106).w))).toBeLessThan(1e-3);
  });
});

// ─────────────────────────── 40 errores ───────────────────────────

type Fixture = () => { w: F06World; nb?: F06Notebook; check?: (w: F06World, nb?: F06Notebook) => void };

const base = (opts: Parameters<typeof h.worldF6>[0] = {}) => {
  const w = h.worldF6(opts);
  for (const item of ['coat', 'goggles', 'shoes', 'hair'] as const) h.cmdF6(w, { type: 'equipPpe', item, on: true });
  h.cmdF6(w, { type: 'startWork' });
  return w;
};

type ReadyOpts = Parameters<typeof h.worldF6>[0] & {
  secure?: boolean; connect?: boolean; zero?: boolean; calibrate?: boolean; sync?: boolean; rate?: number; range?: number; clamp?: boolean; brake?: boolean; height?: number;
};

/** Lanzador listo: resorte montado y asegurado, sensores conectados, calibrados, en cero y sincronizados a 1000 Hz. */
const ready = (opts: ReadyOpts = {}) => {
  const w = base(opts);
  const { C, Rn } = io(w);
  C({ type: 'mountSpring', id: 'spring01', at: 'launcher' });
  if (opts.secure ?? true) C({ type: 'secureSpring', on: true });
  if (opts.connect ?? true) for (const ch of ['force', 'position', 'gates'] as const) C({ type: 'connect', channel: ch, on: true });
  C({ type: 'setRange', n: opts.range ?? 1 });
  C({ type: 'setRate', hz: opts.rate ?? 1000 });
  if (opts.sync ?? true) C({ type: 'syncChannels', on: true });
  if ((opts.calibrate ?? true) && (opts.connect ?? true)) C({ type: 'calibrateSensor' });
  if ((opts.zero ?? true) && (opts.connect ?? true)) C({ type: 'zeroSensor' });
  if (opts.clamp ?? true) C({ type: 'clampTrack', on: true });
  if (opts.brake ?? true) C({ type: 'setBrake', on: true });
  C({ type: 'setHeight', m: opts.height ?? 0.25 });
  Rn(1.5);
  return w;
};

/** Un disparo desde la compresión x; devuelve el registro. */
const launch = (w: F06World, x = 0.15, pushMs = 0) => {
  const { W, C, Rn } = io(w);
  C({ type: 'compress', x });
  Rn(0.3);
  C({ type: 'releaseCart', pushMs });
  Rn(0.5);
  h.waitRun(W, Rn);
  return w.runs[w.runs.length - 1];
};
const readL = (w: F06World) => R(w, h.cmdF6(w, { type: 'readLaunch' }));
const readG = (w: F06World) => R(w, h.cmdF6(w, { type: 'readGates' }));

/** Rapidez verdadera abajo en un disparo limpio de referencia. */
const refV1 = (opts: ReadyOpts = {}) => {
  const w = ready(opts);
  launch(w);
  return readG(w).gates!.trueV1!;
};

const pendReady = () => {
  const w = base();
  const { C, Rn } = io(w);
  C({ type: 'connect', channel: 'angle', on: true });
  C({ type: 'connect', channel: 'gates', on: true });
  Rn(1);
  return w;
};

const nbWith = (mut: (nb: F06Notebook, w: F06World) => void, seed = 106, scenarios: string[] = []) => {
  const { w, nb } = ideal(seed, scenarios);
  mut(nb, w);
  return { w, nb };
};

const FIXTURES: Record<string, Fixture> = {
  E01: () => {
    const w = ready();
    launch(w, 0.22);
    const r = readL(w);
    return { w, check: () => {
      expect(w.springs.spring01.damaged).toBe(true);
      expect(r.qualityFlags).toContain('NONLINEAR');
    } };
  },
  E02: () => {
    const v0 = refV1();
    const w = ready({ secure: false });
    launch(w);
    const r = readG(w);
    return { w, check: () => {
      expect(r.qualityFlags).toContain('DETACHED');
      expect(r.gates!.trueV1!).toBeLessThan(v0 * 0.9);
      expect(w.springs.spring01.at).toBe('rack');
    } };
  },
  E03: () => {
    const w = base();
    const { C, Rn } = io(w);
    C({ type: 'hangHanger', on: true });
    Rn(8);
    const r = R(w, C({ type: 'readRuler', viewDeg: 0 }));
    return { w, check: () => {
      expect(r.qualityFlags).toContain('ZERO_OFFSET');
      expect(Math.abs(r.value - r.trueValue)).toBeGreaterThan(0.3);
    } };
  },
  E04: () => {
    const w = ready();
    const { C, Rn } = io(w);
    C({ type: 'compress', x: 0.15 });
    C({ type: 'releaseCart' });
    Rn(0.1);
    const v = w.cart.v;
    C({ type: 'loadCart', id: 'cw1', on: true });
    return { w, check: () => {
      expect(w.runs[0].massChangedT).not.toBeNull();
      expect(w.cart.v).toBeLessThan(v);
    } };
  },
  E05: () => {
    const w = base();
    const { C, Rn } = io(w);
    C({ type: 'alignRuler' });
    C({ type: 'hangHanger', on: true });
    C({ type: 'hangMass', id: 'm100a', on: true });
    Rn(0.1);
    const r = R(w, C({ type: 'readRuler', viewDeg: 0 }));
    return { w, check: () => expect(r.qualityFlags).toContain('OSCILLATING') };
  },
  E06: () => {
    const w = ready();
    const r = R(w, h.cmdF6(w, { type: 'readHeight', ref: 'bench', viewDeg: 0 }));
    return { w, check: () => {
      expect(r.qualityFlags).toContain('REF_BENCH');
      expect(r.value - r.trueValue).toBeCloseTo(8, 6);
    } };
  },
  E07: () => nbWith((nb, w) => {
    const g = w.params.g;
    const ms = Number(nb.setup.slotM.value) / 1000;
    nb.springRows[2].F = fmt(2 * ms * g);
  }),
  E08: () => {
    const v0 = refV1();
    const w = ready();
    launch(w, 0.15, 0.5);
    const r = readG(w);
    return { w, check: () => {
      expect(r.qualityFlags).toContain('PUSHED');
      expect(r.gates!.trueV1!).toBeGreaterThan(v0);
    } };
  },
  E09: () => nbWith((nb, w) => (nb.calc.Wnet.value = fmt(expectedLoss(w, nb).Wnc))),
  E10: () => nbWith((nb, w) => (nb.loss.Wnc = fmt(-expectedLoss(w, nb).Wnc))),
  E11: () => nbWith((nb, w) => (nb.repRows[0].K1 = fmt(expectedRepRow(w, nb, w.readings[nb.repRows[0].readingId!]).K1double))),
  E12: () => nbWith((nb, w) => (nb.launchRows[0].W = fmt(expectedLaunchRow(w, nb, w.readings[nb.launchRows[0].readingId!]).FmaxX))),
  E13: () => {
    const w = ready({ brake: false });
    launch(w);
    return { w, check: () => {
      expect(w.runs[0].impactT).not.toBeNull();
      expect(w.cart.damaged).toBe(true);
      expect(w.safety.block?.code).toBe('CART_CRASH');
    } };
  },
  E14: () => {
    const w = ready();
    h.cmdF6(w, { type: 'moveGate', id: 'gate2', s: 0.9 });
    launch(w);
    const r = readG(w);
    return { w, check: () => expect(r.qualityFlags).toContain('OFF_FLAT') };
  },
  E15: () => {
    const w0 = ready();
    launch(w0);
    const ok = readL(w0);
    const w = ready({ sync: false });
    launch(w);
    const r = readL(w);
    return { w, check: () => {
      expect(r.qualityFlags).toContain('UNSYNCED');
      expect(Math.abs(r.value - r.trueValue)).toBeGreaterThan(Math.abs(ok.value - ok.trueValue) + 0.02);
    } };
  },
  E16: () => nbWith((nb) => (nb.mcq = 'conserved')),
  E17: () => {
    const w = pendReady();
    const { W, C, Rn } = io(w);
    C({ type: 'holdBob', deg: 20 });
    Rn(0.5);
    C({ type: 'releaseBob', lateralMs: 0.03 });
    h.waitSwing(W, Rn);
    const r = R(w, C({ type: 'readPendulum' }));
    return { w, check: () => {
      expect(r.qualityFlags).toContain('LATERAL');
      // La esfera corta el haz con una cuerda menor que su diámetro: d/Δt sobreestima la rapidez.
      expect(0.025 / r.pend!.dt!).toBeGreaterThan(r.pend!.trueV!);
    } };
  },
  E18: () => {
    const w = ready();
    const { C } = io(w);
    launch(w, 0.22);
    C({ type: 'returnCart' });
    launch(w, 0.1);
    const r = readL(w);
    return { w, check: () => {
      expect(r.qualityFlags).toContain('DAMAGED');
      expect(r.qualityFlags).not.toContain('NONLINEAR');
    } };
  },
  E19: () => nbWith((nb, w) => (nb.calc.Pmax.value = fmt(expectedCalcF6(w, nb).Pavg, 2))),
  E20: () => {
    const w = ready();
    launch(w, 0.22);
    const r = readL(w);
    return { w, check: () => {
      expect(r.qualityFlags).toContain('NONLINEAR');
      // Más allá del tramo lineal (y con el daño) la energía guardada ya no es ½ k x².
      expect(Math.abs(r.trueValue - 0.5 * 100 * 0.22 * 0.22) / (0.5 * 100 * 0.22 * 0.22)).toBeGreaterThan(0.02);
    } };
  },
  E21: () => {
    const w = ready({ zero: false, scenarios: [SF6.NO_ZERO] });
    launch(w);
    const r = readL(w);
    return { w, check: () => {
      expect(r.qualityFlags).toContain('NOT_ZEROED');
      expect(Math.abs(r.value - r.trueValue)).toBeGreaterThan(0.08);
    } };
  },
  E22: () => {
    const w = ready({ range: 0 });
    launch(w);
    const r = readL(w);
    return { w, check: () => {
      expect(r.qualityFlags).toContain('CLIPPED');
      expect(r.launch!.Fmax!).toBeLessThanOrEqual(10);
    } };
  },
  E23: () => {
    const w = ready({ connect: false });
    launch(w);
    const r = readL(w);
    return { w, check: () => {
      expect(r.valid).toBe(false);
      expect(Number.isNaN(r.value)).toBe(true);
    } };
  },
  E24: () => {
    const w = ready({ rate: 50 });
    launch(w);
    const r = readL(w);
    return { w, check: () => {
      expect(r.qualityFlags).toContain('LOW_RATE');
      expect(r.launch!.n).toBeLessThan(25);
    } };
  },
  E25: () => {
    const w = ready();
    h.cmdF6(w, { type: 'moveGate', id: 'gate1', s: 0.35 });
    launch(w);
    const r = readL(w);
    return { w, check: () => {
      expect(r.qualityFlags).toContain('OCCLUDED');
      expect(r.launch!.W).toBeNull();
    } };
  },
  E26: () => {
    const w = ready();
    h.cmdF6(w, { type: 'mountSensor', angleDeg: 30 });
    launch(w);
    const r = readL(w);
    return { w, check: () => {
      expect(r.qualityFlags).toContain('TILTED_SENSOR');
      expect(r.value / r.trueValue).toBeCloseTo(Math.cos(Math.PI / 6), 1);
    } };
  },
  E27: () => {
    const w = ready({ calibrate: false });
    launch(w);
    const r = readL(w);
    return { w, check: () => {
      expect(r.qualityFlags).toContain('UNCALIBRATED');
      expect(r.value / r.trueValue).toBeCloseTo(1.05, 1);
    } };
  },
  E28: () => {
    const w = ready({ clamp: false });
    launch(w);
    const r = readG(w);
    return { w, check: () => {
      expect(r.qualityFlags).toContain('BASE_SLIP');
      expect(w.track.h).toBeCloseTo(0.25 - w.params.riserSlipM, 6);
    } };
  },
  E29: () => {
    const w = ready();
    const r = R(w, h.cmdF6(w, { type: 'readHeight', ref: 'launcher', viewDeg: 25 }));
    return { w, check: () => {
      expect(r.qualityFlags).toContain('PARALLAX');
      expect(r.value).not.toBe(r.trueValue);
    } };
  },
  E30: () => {
    const w = base();
    h.cmdF6(w, { type: 'tareBalance' });
    h.cmdF6(w, { type: 'placeOnBalance', id: 'm100a' });
    const r = R(w, h.cmdF6(w, { type: 'readBalance' }));
    return { w, check: () => expect(r.qualityFlags).toContain('UNSTABLE') };
  },
  E31: () => nbWith((nb) => (nb.setup.cartM = { value: '200', uncertainty: '', readingId: null })),
  E32: () => {
    const w = ready();
    const { C, Rn } = io(w);
    C({ type: 'compress', x: 0.15 });
    C({ type: 'releaseCart' });
    Rn(0.1);
    C({ type: 'setFriction', n: 0.1 });
    return { w, check: () => expect(w.runs[0].configChangedT).not.toBeNull() };
  },
  E33: () => nbWith((nb) => (nb.repRows[1].readingId = nb.heightRows[1].readingId)),
  E34: () => nbWith((nb) => (nb.repRows[0].K1 = fmt(Number(nb.repRows[0].K1) * 1000, 1))),
  E35: () => nbWith((nb, w) => (nb.repRows[0].v1 = fmt(expectedRepRow(w, nb, w.readings[nb.repRows[0].readingId!]).v1rounded))),
  E36: () => nbWith((nb, w) => (nb.calc.k.value = fmt(expectedSpring(w, nb).inverse, 5))),
  E37: () => nbWith((nb) => (nb.launchRows[2] = { readingId: null, W: '', Uel: '' })),
  E38: () => nbWith((nb) => (nb.calc.k.uncertainty = '0.0001')),
  E39: () => {
    const w = ready({ brake: false });
    const { C } = io(w);
    launch(w);
    C({ type: 'returnCart' });
    C({ type: 'setBrake', on: true });
    C({ type: 'acknowledge' });
    launch(w);
    const r = readG(w);
    return { w, check: () => expect(r.qualityFlags).toContain('POST_IMPACT') };
  },
  E40: () => {
    const w = ready();
    const { C } = io(w);
    C({ type: 'compress', x: 0.15 });
    const r = C({ type: 'mountSpring', id: 'spring01', at: 'rack' });
    return { w, check: () => {
      expect(r.code).toBe('SPRING_RELEASE');
      expect(w.safety.block?.code).toBe('SPRING_RELEASE');
      expect(w.cart.latched).toBe(false);
    } };
  },
};

describe('F06 — los 40 errores simulables', () => {
  it('el catálogo tiene 40 códigos, 20 + 20, con contrato completo y texto de retroalimentación', () => {
    expect(SIMULATED_ERRORS_F06).toHaveLength(40);
    expect(SIMULATED_ERRORS_F06.filter((e) => e.group === 'EXPERIMENTAL')).toHaveLength(20);
    const fb = (esF06 as { f06fb: Record<string, string> }).f06fb;
    for (const e of SIMULATED_ERRORS_F06) {
      expect(e.trigger && e.effect && e.fixture, e.id).toBeTruthy();
      expect(fb[errKeyF6(e)], e.id).toBeTruthy();
    }
  });

  it.each(SIMULATED_ERRORS_F06.map((e) => [e.id, e] as const))('%s: disparador → evidencia y consecuencia', (_id, e) => {
    const key = errKeyF6(e);
    const fx = FIXTURES[key]();
    if (e.evidenceKey.startsWith('err:')) expect(ev(fx.w, key), e.id).toBeGreaterThan(0);
    else expect(notebookIssuesF06(fx.w, fx.nb!)).toContain(`nb:${key}`);
    fx.check?.(fx.w, fx.nb);
  });
});

describe('F06 — escenarios docentes', () => {
  it.each(F06_SCENARIOS)('%s permite terminar por una ruta válida', (s) => {
    const { w, nb } = ideal(106, [s]);
    const flags = f06StageEvidence(w, nb);
    expect(Object.entries(flags).filter(([, v]) => !v).map(([k]) => k)).toEqual([]);
    expect(notebookIssuesF06(w, nb)).toEqual([]);
    expect(Object.keys(w.evidence).filter((k) => k.startsWith('err:') && w.evidence[k] > 0)).toEqual([]);
  });

  it('S01 reproduce los oráculos; S02 y S03 cambian k; S11 no pasa del límite', () => {
    const ref = ideal(106, [SF6.IDEAL]);
    expect(springEnergy(ref.w, 'spring01', 0.1)).toBeCloseTo(0.5, 9);
    expect(expectedSpring(ideal(106, [SF6.STIFF]).w, ideal(106, [SF6.STIFF]).nb).k).toBeGreaterThan(190);
    const soft = ideal(106, [SF6.SOFT]);
    expect(expectedSpring(soft.w, soft.nb).k).toBeLessThan(45);
    const lim = ideal(106, [SF6.LIMIT]);
    expect(lim.w.readings[lim.ids.launches[0]].setup!.compression!).toBeLessThanOrEqual(0.12);
    expect(lim.w.springs.spring01.damaged).toBe(false);
  });

  it('S05/S06 la ruta apaga el amortiguador para las réplicas; S10 pone el sensor en cero; S12 sincroniza', () => {
    for (const s of [SF6.WEAK_DAMPER, SF6.STRONG_DAMPER]) {
      const r = ideal(106, [s]);
      expect(r.w.readings[r.ids.reps[0]].setup!.damperC).toBe(0);
    }
    expect(ideal(106, [SF6.NO_ZERO]).w.sensor.zeroed).toBe(true);
    expect(ideal(106, [SF6.DECOUPLED]).w.logger.synced).toBe(true);
  });

  it('S08 y S09: las amplitudes del péndulo cumplen ½ v² = g L (1 − cos θ₀)', () => {
    for (const s of [SF6.LOW_AMP, SF6.HIGH_AMP]) {
      const { w, nb } = ideal(106, [s]);
      for (const r of nb.pendRows) expect(Math.abs(expectedPendRow(w, nb, w.readings[r.readingId!]).disc)).toBeLessThan(2);
    }
    expect(ideal(106, [SF6.HIGH_AMP]).w.pend.L).toBe(0.4);
  });
});

describe('F06 — seguridad y reanudación', () => {
  it('desmontar el resorte comprimido bloquea hasta devolver el carro al lanzador', () => {
    const w = FIXTURES.E40().w;
    expect(h.cmdF6(w, { type: 'readBalance' }).code).toBe('BLOCKED');
    h.cmdF6(w, { type: 'setHeight', m: 0.1 });
    w.cart.s = 0.2;
    expect(h.cmdF6(w, { type: 'acknowledge' }).code).toBe('SECURE_FIRST');
    h.cmdF6(w, { type: 'returnCart' });
    expect(h.cmdF6(w, { type: 'acknowledge' }).ok).toBe(true);
    expect(w.safety.block).toBeNull();
    expect(ev(w, 'E40')).toBe(1);
    expect(evaluateF06(w, emptyF06Notebook()).components.find((c) => c.id === 'safety')!.score).toBe(0);
  });

  it('el choque sin freno exige devolver el carro y poner el freno antes de seguir', () => {
    const w = FIXTURES.E13().w;
    h.cmdF6(w, { type: 'returnCart' });
    expect(h.cmdF6(w, { type: 'acknowledge' }).code).toBe('SECURE_FIRST');
    h.cmdF6(w, { type: 'setBrake', on: true });
    expect(h.cmdF6(w, { type: 'acknowledge' }).ok).toBe(true);
  });

  it('sin EPP no se opera; la reanudación detiene el carro y descarga el resorte', () => {
    const w0 = h.worldF6();
    expect(h.cmdF6(w0, { type: 'compress', x: 0.1 }).code).toBe('PPE');
    const w = ready();
    h.cmdF6(w, { type: 'compress', x: 0.15 });
    h.cmdF6(w, { type: 'releaseCart' });
    h.runF6(w, 0.2);
    expect(Math.abs(w.cart.v)).toBeGreaterThan(1);
    sanitizeOnResumeF06(w);
    expect(w.cart.v).toBe(0);
    expect(w.run?.done).toBe(true);
    expect(Math.abs(energyResidualJ(w))).toBeLessThan(1e-9);
    h.runF6(w, 1);
    expect(w.cart.v).toBe(0);
    expect(w.cart.s).toBeCloseTo(CART_START_S, 9);
  });

  it('el cierre exige el carro en el lanzador sin trabar, pesas guardadas y la esfera quieta', () => {
    const w = ready();
    const { C, Rn } = io(w);
    C({ type: 'compress', x: 0.1 });
    expect(C({ type: 'closeStation' }).code).toBe('LATCHED');
    C({ type: 'compress', x: 0 });
    C({ type: 'loadCart', id: 'cw1', on: true });
    expect(C({ type: 'closeStation' }).code).toBe('MASSES_OUT');
    C({ type: 'loadCart', id: 'cw1', on: false });
    C({ type: 'holdBob', deg: 10 });
    C({ type: 'releaseBob' });
    Rn(0.2);
    expect(C({ type: 'closeStation' }).code).toBe('BOB_MOVING');
    C({ type: 'stopBob' });
    expect(C({ type: 'closeStation' }).ok).toBe(true);
  });
});
