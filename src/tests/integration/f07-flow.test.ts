/**
 * F07 — recorridos completos sin escena (§17, matriz «Integración»): ruta ideal por comandos hasta la entrega con la
 * máquina por etapas y la evaluación, en modo realista y curricular y con varias semillas; los 40 errores
 * F07-E01…E40 con su disparador y su consecuencia causal; los 12 escenarios docentes; seguridad y reanudación.
 */
import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import type { F07World, ReadingF7 } from '../../simulation/f07-world/types';
import type { F07Command } from '../../simulation/f07-world/commands';
import { SF7, cartMovingF7 } from '../../simulation/f07-world/world';
import { conservedTotalsF07, energyResidualJ, totalMomentum } from '../../simulation/f07-world/conservation';
import { CART_A_START, GEOF07 } from '../../simulation/f07-world/geometry';
import { emptyF07Notebook, type F07Notebook } from '../../practices/practice-f07/notebook';
import { f07StageEvidence } from '../../practices/practice-f07/evidence';
import { practiceF07Machine, f07StageName } from '../../practices/practice-f07/workflow.machine';
import { F07_WEIGHTS, evaluateF07, notebookIssuesF07 } from '../../practices/practice-f07/rubric';
import { SIMULATED_ERRORS_F07, F07_SCENARIOS, errKeyF7 } from '../../practices/practice-f07/error-scenarios';
import { sanitizeOnResumeF07 } from '../../practices/practice-f07/resume';
import { expectedCalcF7, expectedCm, expectedElasticRow, expectedImpulse, expectedStick } from '../../practices/practice-f07/expected-results';
import { finalVelocities } from '../../simulation/models/f07/equations';
import esF07 from '../../locales/es/practiceF07.json';
import * as h from '../helpersF07';

const ev = (w: F07World, k: string) => w.evidence[`err:${k}`] ?? 0;
const R = (w: F07World, r: { id?: string }): ReadingF7 => w.readings[r.id!];
const fmt = (v: number, d = 4) => v.toFixed(d);

function ideal(seed = 107, scenarios: string[] = [], mode?: 'CURRICULAR' | 'REALISTIC') {
  const r = h.idealRouteF7(seed, scenarios as never, mode);
  return { ...r, nb: h.fillNotebookF7(r.w, r.ids) };
}

/** Atajos con la firma de la ruta (mundo diferido, comando, avance). */
const io = (w: F07World) => ({ W: () => w, C: (c: F07Command) => h.cmdF7(w, c), Rn: (s: number) => h.runF7(w, s) });

describe('F07 — ruta ideal', () => {
  it('cumple las etapas por evidencia y llega a COMPLETE sin errores', () => {
    const { w, nb } = ideal();
    const flags = f07StageEvidence(w, nb);
    expect(Object.entries(flags).filter(([, v]) => !v).map(([k]) => k)).toEqual([]);
    const actor = createActor(practiceF07Machine).start();
    actor.send({ type: 'START' });
    actor.send({ type: 'PPE_CONFIRMED' });
    expect(f07StageName(actor.getSnapshot().value)).toBe('CALIBRATE');
    actor.send({ type: 'EVIDENCE', flags });
    expect(f07StageName(actor.getSnapshot().value)).toBe('COMPLETE');
    expect(Object.keys(w.evidence).filter((k) => k.startsWith('err:') && w.evidence[k] > 0)).toEqual([]);
    expect(notebookIssuesF07(w, nb)).toEqual([]);
  });

  it('la evaluación da el máximo automático (las respuestas abiertas quedan a revisión)', () => {
    const { w, nb } = ideal();
    const e = evaluateF07(w, nb);
    expect(Object.values(F07_WEIGHTS).reduce((s, x) => s + x, 0)).toBeCloseTo(1, 12);
    for (const c of e.components.filter((x) => x.id !== 'analysis')) expect(c.score, c.id).toBe(1);
    expect(e.total).toBeGreaterThan(0.95);
    expect(e.needsTeacherReview.length).toBeGreaterThan(0);
  });

  it('la máquina no avanza sin evidencia (no hay evento «Siguiente»)', () => {
    const w = h.worldF7();
    for (const item of ['coat', 'goggles', 'shoes', 'hair'] as const) h.cmdF7(w, { type: 'equipPpe', item, on: true });
    h.cmdF7(w, { type: 'startWork' });
    const actor = createActor(practiceF07Machine).start();
    actor.send({ type: 'START' });
    actor.send({ type: 'PPE_CONFIRMED' });
    actor.send({ type: 'EVIDENCE', flags: f07StageEvidence(w, h.fillNotebookF7(w, h.emptyRouteIdsF7())) });
    expect(f07StageName(actor.getSnapshot().value)).toBe('CALIBRATE');
  });

  it.each([7, 2024, 99991])('semilla %i: momento conservado, e cerca de 1 y el impulso coincide con Δp₁', (seed) => {
    const { w, nb } = ideal(seed);
    const ec = expectedCalcF7(w, nb);
    expect(Math.abs(ec.dp)).toBeLessThan(0.01);
    expect(ec.e).toBeGreaterThan(0.9);
    expect(ec.e).toBeLessThan(1.02);
    expect(Math.abs(ec.impDisc)).toBeLessThan(5);
    // Velcro: se pierde aproximadamente m₂/(m₁+m₂) de la energía cinética.
    expect(ec.Klost).toBeGreaterThan(50);
    expect(ec.Klost).toBeLessThan(70);
    expect(notebookIssuesF07(w, nb)).toEqual([]);
  });

  it('modo curricular: las velocidades verdaderas cumplen la solución cerrada del choque elástico', () => {
    const { w, ids } = ideal(107, [], 'CURRICULAR');
    const g = w.readings[ids.elastic[0]].gates!.trueV;
    const [v1, v2] = finalVelocities(w.params.m1, w.params.m2, g.A1!, g.B1!, 1);
    expect(g.A2!).toBeCloseTo(v1, 2);
    expect(g.B2!).toBeCloseTo(v2, 2);
  });

  it('conserva la masa y cierra los balances de energía y de momento', () => {
    for (const mode of ['CURRICULAR', 'REALISTIC'] as const) {
      const { w } = ideal(107, [], mode);
      expect(conservedTotalsF07(w).massesG).toBeCloseTo(w.initialTotals.massesG, 9);
      expect(Math.abs(energyResidualJ(w))).toBeLessThan(1e-3);
      expect(Math.abs(totalMomentum(w) - w.momentum.externalNs)).toBeLessThan(1e-3);
    }
  });
});

// ─────────────────────────── 40 errores ───────────────────────────

type Fixture = () => { w: F07World; nb?: F07Notebook; check?: (w: F07World, nb?: F07Notebook) => void };

const base = (opts: Parameters<typeof h.worldF7>[0] = {}) => {
  const w = h.worldF7(opts);
  for (const item of ['coat', 'goggles', 'shoes', 'hair'] as const) h.cmdF7(w, { type: 'equipPpe', item, on: true });
  h.cmdF7(w, { type: 'startWork' });
  return w;
};

type ReadyOpts = Parameters<typeof h.worldF7>[0] & {
  weigh?: boolean; flags?: boolean; level?: boolean; free?: boolean; center?: boolean; dampers?: boolean; connect?: boolean; clamp?: boolean; range?: number; rate?: number; calibrate?: boolean; zero?: boolean;
};

/** Montaje listo (el de la ruta), con interruptores para dejar una parte sin hacer. */
const ready = (opts: ReadyOpts = {}) => {
  const w = base(opts);
  const { W, C, Rn } = io(w);
  if (opts.weigh ?? true) {
    C({ type: 'tareBalance' });
    h.weigh(C, Rn, 'cartA');
    h.weigh(C, Rn, 'cartB');
  }
  if (opts.flags ?? true) for (const c of ['cartA', 'cartB'] as const) C({ type: 'measureFlag', cart: c });
  if (opts.level ?? true) h.levelTrack(W, C, Rn);
  for (const c of ['cartA', 'cartB'] as const) {
    C({ type: 'setCartBrake', cart: c, on: false });
    if (opts.free ?? true) C({ type: 'freeWheel', cart: c });
    if (opts.center ?? true) C({ type: 'centerCart', cart: c });
    C({ type: 'alignFlag', cart: c });
  }
  if (opts.dampers ?? true) C({ type: 'setEndDampers', on: true });
  if (opts.connect ?? true) for (const ch of ['gates', 'force', 'camera'] as const) C({ type: 'connect', channel: ch, on: true });
  if (opts.clamp ?? true) C({ type: 'clampGates', on: true });
  C({ type: 'setRange', n: opts.range ?? 1 });
  C({ type: 'setRate', hz: opts.rate ?? 5000 });
  if ((opts.calibrate ?? true) && (opts.connect ?? true)) C({ type: 'calibrateSensor' });
  if ((opts.zero ?? true) && (opts.connect ?? true)) C({ type: 'zeroSensor' });
  Rn(0.5);
  return w;
};

/** Un choque desde la muesca `cm`; `during` actúa a los `atS` segundos del disparo. Devuelve el registro. */
const collide = (w: F07World, cm = h.ROUTE_COCK, during?: () => void, atS = 0.2) => {
  const { W, C, Rn } = io(w);
  if (w.bumper.joined) C({ type: 'separateCarts' });
  C({ type: 'cock', cart: 'cartA', cm });
  C({ type: 'release' });
  if (during) {
    Rn(atS);
    during();
  }
  Rn(0.5);
  h.waitRun(W, Rn);
  return w.runs[w.runs.length - 1];
};
const readG = (w: F07World) => R(w, h.cmdF7(w, { type: 'readGates' }));
const readF = (w: F07World) => R(w, h.cmdF7(w, { type: 'readForce' }));

const nbWith = (mut: (nb: F07Notebook, w: F07World) => void, seed = 107, scenarios: string[] = []) => {
  const { w, nb } = ideal(seed, scenarios);
  mut(nb, w);
  return { w, nb };
};

/** Semilla cuyo carro A arranca con una rueda que no gira libre. */
const bindSeed = (() => {
  for (let s = 1; s < 200; s++) if (h.worldF7({ seed: s }).carts.cartA.wheelBind) return s;
  return 1;
})();

const FIXTURES: Record<string, Fixture> = {
  E01: () => {
    const w = ready();
    const { W, C, Rn } = io(w);
    C({ type: 'setLevelScrew', deg: w.track.screwDeg + 0.6 });
    // En el riel inclinado los carros sin freno ruedan: se espera a que queden contra un tope y se dispara enseguida.
    for (let i = 0; i < 80 && cartMovingF7(w); i++) Rn(0.25);
    C({ type: 'placeCart', cart: 'cartB', s: GEOF07.cartB0 });
    C({ type: 'cock', cart: 'cartA', cm: 3 });
    C({ type: 'release' });
    Rn(0.5);
    h.waitRun(W, Rn);
    const r = readG(w);
    return { w, check: () => expect(r.qualityFlags).toContain('INCLINED') };
  },
  E02: () => {
    const w = ready();
    h.cmdF7(w, { type: 'loadCart', id: 'cw100a', cart: 'cartB', on: true });
    collide(w);
    const r = readG(w);
    return { w, check: () => {
      expect(r.qualityFlags).toContain('UNWEIGHED');
      expect(r.setup!.loadB).toBe(100);
    } };
  },
  E03: () => {
    const w = ready();
    const { W, C, Rn } = io(w);
    C({ type: 'cock', cart: 'cartA', cm: 3 });
    C({ type: 'pushCart', cart: 'cartB', v: -0.15 });
    C({ type: 'release' });
    Rn(0.5);
    h.waitRun(W, Rn);
    return { w, check: () => expect(w.runs[0].targetMoving).toBe(true) };
  },
  E04: () => {
    const w = ready();
    h.cmdF7(w, { type: 'setFlag', cart: 'cartA', cm: 3 });
    h.cmdF7(w, { type: 'setFlag', cart: 'cartB', cm: 2 });
    collide(w);
    const r = readG(w);
    return { w, check: () => expect(r.qualityFlags).toContain('FLAG_WIDTH') };
  },
  E05: () => {
    const w = ready();
    h.cmdF7(w, { type: 'moveGate', id: 'gateA', s: 1.3 });
    collide(w);
    return { w, check: () => expect(w.runs[0].gateInZone).toBe(true) };
  },
  E06: () => {
    const w = ready();
    h.cmdF7(w, { type: 'setBumper', bumper: 'velcro' });
    const rec = collide(w);
    return { w, check: () => {
      expect(rec.setup.velcroFixed).toBe(false);
      expect(rec.stuck).toBe(false);
    } };
  },
  E07: () => {
    const w = ready();
    h.cmdF7(w, { type: 'setBumper', bumper: 'magnet' });
    if (w.bumper.polarityOk) h.cmdF7(w, { type: 'flipMagnet' });
    const rec = collide(w);
    return { w, check: () => expect(rec.stuck).toBe(true) };
  },
  E08: () => {
    const w = ready();
    const { W, C, Rn } = io(w);
    C({ type: 'cock', cart: 'cartA', cm: 3 });
    C({ type: 'placeCart', cart: 'cartB', s: 0 });
    C({ type: 'release' });
    Rn(0.5);
    h.waitRun(W, Rn);
    return { w, check: () => expect(w.runs[0].setup.overlap).toBe(true) };
  },
  E09: () => {
    const w = ready();
    const rec = collide(w, 3, () => h.cmdF7(w, { type: 'pushCart', cart: 'cartA', v: 1.4 }));
    return { w, check: () => {
      expect(rec.pushedT).not.toBeNull();
      expect(readG(w).qualityFlags).toContain('PUSHED');
    } };
  },
  E10: () => {
    const v = collide(ready()).vBefore![0];
    const w = ready();
    h.cmdF7(w, { type: 'setCartBrake', cart: 'cartB', on: true });
    const rec = collide(w);
    return { w, check: () => {
      expect(rec.setup.brakes).toBe(true);
      expect(Math.abs(rec.extJ)).toBeGreaterThan(0.002);
      expect(rec.vBefore![0]).toBeCloseTo(v, 1);
    } };
  },
  E11: () => nbWith((nb, w) => {
    const e = expectedElasticRow(w, nb, w.readings[nb.elasticRows[0].readingId!]);
    nb.elasticRows[0].v1f = fmt(e.v1fAbs);
  }),
  E12: () => nbWith((nb, w) => (nb.impulse.J1 = fmt(-expectedImpulse(w, nb).Fmax, 3))),
  E13: () => nbWith((nb, w) => (nb.elasticRows[0].e = fmt(expectedElasticRow(w, nb, w.readings[nb.elasticRows[0].readingId!]).eNonRel[1]))),
  E14: () => {
    const w = ready({ dampers: false });
    collide(w, 6);
    return { w, check: () => {
      expect(w.evidence.crash).toBeGreaterThan(0);
      expect(w.safety.block?.code).toBe('CART_CRASH');
    } };
  },
  E15: () => {
    const w = ready({ center: false, scenarios: [SF7.OBLIQUE] });
    const rec = collide(w);
    return { w, check: () => {
      expect(rec.setup.oblique).toBe(true);
      expect(Math.abs(rec.extJ)).toBeGreaterThan(0.001);
    } };
  },
  E16: () => {
    const w = ready({ seed: bindSeed, free: false });
    const rec = collide(w);
    return { w, check: () => expect(rec.setup.wheelBind).toBe(true) };
  },
  E17: () => nbWith((nb) => (nb.mcq = 'conserved')),
  E18: () => {
    const w = ready();
    const rec = collide(w, 3, () => h.cmdF7(w, { type: 'loadCart', id: 'cw100a', cart: 'cartA', on: true }), 0.15);
    return { w, check: () => expect(rec.massChangedT).not.toBeNull() };
  },
  E19: () => {
    const w = ready();
    const { W, C, Rn } = io(w);
    C({ type: 'cock', cart: 'cartA', cm: 1 });
    C({ type: 'release' });
    for (let i = 0; i < 200 && !w.gates.gateA.blocked; i++) Rn(0.05);
    C({ type: 'stopCart', cart: 'cartA' });
    Rn(0.5);
    h.waitRun(W, Rn);
    return { w, check: () => expect(w.runs[0].handInGateT).not.toBeNull() };
  },
  E20: () => nbWith((nb, w) => (nb.impulse.J1 = fmt(expectedImpulse(w, nb).JB, 5))),
  E21: () => {
    const w = ready({ zero: false });
    collide(w);
    const r = readF(w);
    return { w, check: () => {
      expect(r.qualityFlags).toContain('NOT_ZEROED');
      expect(Math.abs(r.value - r.trueValue)).toBeGreaterThan(0.002);
    } };
  },
  E22: () => {
    const w = ready({ range: 0 });
    collide(w, 5);
    const r = readF(w);
    return { w, check: () => {
      expect(r.qualityFlags).toContain('CLIPPED');
      expect(Math.abs(r.value)).toBeLessThan(Math.abs(r.trueValue));
    } };
  },
  E23: () => {
    const w = ready();
    h.cmdF7(w, { type: 'connect', channel: 'force', on: false });
    collide(w);
    const r = readF(w);
    return { w, check: () => {
      expect(r.qualityFlags).toContain('UNPLUGGED');
      expect(Number.isFinite(r.value)).toBe(false);
    } };
  },
  E24: () => {
    const w = ready({ rate: 50 });
    collide(w);
    const r = readF(w);
    return { w, check: () => expect(r.qualityFlags).toContain('LOW_RATE') };
  },
  E25: () => {
    const w = ready();
    h.cmdF7(w, { type: 'placeCart', cart: 'cartB', s: GEOF07.gate.sB });
    collide(w);
    const r = readG(w);
    return { w, check: () => expect(r.qualityFlags).toContain('OCCLUDED') };
  },
  E26: () => {
    const w = ready();
    h.cmdF7(w, { type: 'mountSensor', angleDeg: 25 });
    collide(w);
    const r = readF(w);
    return { w, check: () => {
      expect(r.qualityFlags).toContain('TILTED_SENSOR');
      expect(Math.abs(r.value)).toBeLessThan(Math.abs(r.trueValue));
    } };
  },
  E27: () => {
    const w = ready({ calibrate: false });
    collide(w);
    const r = readF(w);
    return { w, check: () => {
      expect(r.qualityFlags).toContain('UNCALIBRATED');
      expect(Math.abs(r.value)).toBeGreaterThan(Math.abs(r.trueValue) * 1.02);
    } };
  },
  E28: () => {
    const w = ready({ clamp: false });
    collide(w);
    const r = readG(w);
    return { w, check: () => {
      expect(r.qualityFlags).toContain('GATE_SLIP');
      expect(w.gates.gateA.s !== GEOF07.gate.sA || w.gates.gateB.s !== GEOF07.gate.sB).toBe(true);
    } };
  },
  E29: () => {
    const w = ready();
    const r = R(w, h.cmdF7(w, { type: 'readLevel', viewDeg: 20 }));
    return { w, check: () => expect(r.qualityFlags).toContain('PARALLAX') };
  },
  E30: () => {
    const w = base();
    const { C } = io(w);
    C({ type: 'tareBalance' });
    C({ type: 'placeOnBalance', id: 'cartA' });
    const r = R(w, C({ type: 'readBalance' }));
    return { w, check: () => expect(r.qualityFlags).toContain('UNSTABLE') };
  },
  E31: () => nbWith((nb) => {
    nb.setup.mA.readingId = null;
    nb.setup.mA.value = '200';
  }),
  E32: () => {
    const w = ready();
    const rec = collide(w, 3, () => h.cmdF7(w, { type: 'setRate', hz: 1000 }));
    return { w, check: () => expect(rec.configChangedT).not.toBeNull() };
  },
  E33: () => nbWith((nb) => (nb.elasticRows[1].readingId = nb.stick.readingId)),
  E34: () => nbWith((nb) => (nb.elasticRows[0].v1i = fmt(Number(nb.elasticRows[0].v1i) * 100, 2))),
  E35: () => nbWith((nb, w) => {
    const e = expectedElasticRow(w, nb, w.readings[nb.elasticRows[0].readingId!]);
    const k = (['v1i', 'v1f', 'v2f'] as const).reduce((best, f) => (Math.abs(e.rounded[f] / e[f] - 1) > Math.abs(e.rounded[best] / e[best] - 1) ? f : best), 'v1i' as 'v1i' | 'v1f' | 'v2f');
    nb.elasticRows[0][k] = fmt(e.rounded[k], 5);
  }),
  E36: () => nbWith((nb, w) => (nb.cm.vBefore = fmt(1 / expectedCm(w, nb).vBefore))),
  E37: () => nbWith((nb) => (nb.elasticRows[2] = { readingId: null, v1i: '', v1f: '', v2i: '', v2f: '', dp: '', e: '' })),
  E38: () => nbWith((nb) => (nb.calc.dp.uncertainty = '0.0000001')),
  E39: () => {
    const w = ready({ dampers: false });
    const { C } = io(w);
    collide(w, 6);
    const damaged = (['cartA', 'cartB'] as const).find((c) => w.carts[c].damaged);
    C({ type: 'setEndDampers', on: true });
    C({ type: 'acknowledge' });
    C({ type: 'placeCart', cart: 'cartB', s: GEOF07.cartB0 });
    collide(w);
    const r = readG(w);
    return { w, check: () => {
      expect(damaged).toBeTruthy();
      expect(r.qualityFlags).toContain('POST_IMPACT');
    } };
  },
  E40: () => {
    const w = ready();
    const { C } = io(w);
    C({ type: 'cock', cart: 'cartA', cm: 3 });
    const r = C({ type: 'placeOnBalance', id: 'cartA' });
    return { w, check: () => {
      expect(r.code).toBe('LAUNCHER_FIRED');
      expect(w.safety.block?.code).toBe('LAUNCHER_FIRED');
      expect(w.carts.cartA.latched).toBe(false);
    } };
  },
};

describe('F07 — los 40 errores simulables', () => {
  it('el catálogo tiene 40 códigos, 20 + 20, con contrato completo y texto de retroalimentación', () => {
    expect(SIMULATED_ERRORS_F07).toHaveLength(40);
    expect(SIMULATED_ERRORS_F07.filter((e) => e.group === 'EXPERIMENTAL')).toHaveLength(20);
    const fb = (esF07 as { f07fb: Record<string, string> }).f07fb;
    for (const e of SIMULATED_ERRORS_F07) {
      expect(e.trigger && e.effect && e.fixture, e.id).toBeTruthy();
      expect(fb[errKeyF7(e)], e.id).toBeTruthy();
    }
  });

  it.each(SIMULATED_ERRORS_F07.map((e) => [e.id, e] as const))('%s: disparador → evidencia y consecuencia', (_id, e) => {
    const key = errKeyF7(e);
    const fx = FIXTURES[key]();
    if (e.evidenceKey.startsWith('err:')) expect(ev(fx.w, key), e.id).toBeGreaterThan(0);
    else expect(notebookIssuesF07(fx.w, fx.nb!)).toContain(`nb:${key}`);
    fx.check?.(fx.w, fx.nb);
  });
});

describe('F07 — escenarios docentes', () => {
  it.each(F07_SCENARIOS)('%s permite terminar por una ruta válida', (s) => {
    const { w, nb } = ideal(107, [s]);
    const flags = f07StageEvidence(w, nb);
    expect(Object.entries(flags).filter(([, v]) => !v).map(([k]) => k)).toEqual([]);
    expect(notebookIssuesF07(w, nb)).toEqual([]);
    expect(Object.keys(w.evidence).filter((k) => k.startsWith('err:') && w.evidence[k] > 0)).toEqual([]);
  });

  it('S01 reproduce el oráculo elástico; S02 baja e; S03 empieza con velcro; S04 deja quieto al carro A', () => {
    const el = ideal(107, [SF7.ELASTIC]);
    expect(expectedCalcF7(el.w, el.nb).e).toBeCloseTo(1, 1);
    const pa = ideal(107, [SF7.PARTIAL]);
    expect(expectedCalcF7(pa.w, pa.nb).e).toBeCloseTo(0.7, 1);
    expect(h.worldF7({ scenarios: [SF7.VELCRO] }).bumper.type).toBe('velcro');
    const eq = ideal(107, [SF7.EQUAL]);
    expect(Math.abs(eq.w.readings[eq.ids.elastic[0]].gates!.trueV.A2!)).toBeLessThan(0.03);
  });

  it('S07 inclina la mesada y la ruta la nivela; S09 desalinea los carros y la ruta los centra; S10 gira la bandera', () => {
    const sl = ideal(107, [SF7.SLOPED]);
    expect(Math.abs(sl.w.track.baseTiltDeg)).toBeGreaterThan(1);
    expect(Math.abs(sl.w.readings[sl.ids.elastic[0]].setup!.tiltDeg!)).toBeLessThanOrEqual(0.1);
    expect(Math.abs(h.worldF7({ scenarios: [SF7.OBLIQUE] }).carts.cartA.offsetMm)).toBeGreaterThan(3);
    expect(ideal(107, [SF7.OBLIQUE]).w.carts.cartA.offsetMm).toBe(0);
    expect(h.worldF7({ scenarios: [SF7.FLAG_TILT] }).carts.cartA.flagYawDeg).toBeGreaterThan(2);
  });

  it('S11 alarga el contacto y baja el pico de fuerza (el impulso es el mismo)', () => {
    const hard = ideal(107);
    const soft = ideal(107, [SF7.SOFT]);
    const fh = expectedImpulse(hard.w, hard.nb);
    const fs = expectedImpulse(soft.w, soft.nb);
    expect(fs.tContact).toBeGreaterThan(fh.tContact * 1.4);
    expect(fs.Fmax).toBeLessThan(fh.Fmax);
    expect(Math.abs(fs.J1 - fh.J1) / Math.abs(fh.J1)).toBeLessThan(0.05);
    expect(expectedStick(soft.w, soft.nb).Klost).toBeGreaterThan(50);
  });
});

describe('F07 — seguridad y reanudación', () => {
  it('levantar un carro trabado bloquea el puesto hasta confirmar con los carros quietos', () => {
    const w = FIXTURES.E40().w;
    expect(h.cmdF7(w, { type: 'readBalance' }).code).toBe('BLOCKED');
    expect(h.cmdF7(w, { type: 'acknowledge' }).ok).toBe(true);
    expect(w.safety.block).toBeNull();
    expect(ev(w, 'E40')).toBe(1);
    expect(evaluateF07(w, emptyF07Notebook()).components.find((c) => c.id === 'safety')!.score).toBe(0);
  });

  it('el golpe contra el tope sin amortiguador exige ponerlos antes de seguir', () => {
    const w = FIXTURES.E14().w;
    h.waitRun(() => w, (s) => h.runF7(w, s));
    h.runF7(w, 3);
    for (const c of ['cartA', 'cartB'] as const) if (cartMovingF7(w, c)) h.cmdF7(w, { type: 'stopCart', cart: c });
    expect(h.cmdF7(w, { type: 'acknowledge' }).code).toBe('SECURE_FIRST');
    h.cmdF7(w, { type: 'setEndDampers', on: true });
    expect(h.cmdF7(w, { type: 'acknowledge' }).ok).toBe(true);
  });

  it('sin EPP no se opera; la reanudación detiene los carros y destraba los lanzadores', () => {
    const w0 = h.worldF7();
    expect(h.cmdF7(w0, { type: 'cock', cart: 'cartA', cm: 3 }).code).toBe('PPE');
    const w = ready();
    h.cmdF7(w, { type: 'cock', cart: 'cartA', cm: 3 });
    h.cmdF7(w, { type: 'release' });
    h.runF7(w, 0.2);
    expect(Math.abs(w.carts.cartA.v)).toBeGreaterThan(0.5);
    sanitizeOnResumeF07(w);
    expect(w.carts.cartA.v).toBe(0);
    expect(w.run?.done).toBe(true);
    expect(Math.abs(energyResidualJ(w))).toBeLessThan(1e-9);
    h.runF7(w, 1);
    expect(cartMovingF7(w)).toBe(false);
    const w2 = ready();
    h.cmdF7(w2, { type: 'cock', cart: 'cartA', cm: 4 });
    sanitizeOnResumeF07(w2);
    expect(w2.carts.cartA.latched).toBe(false);
    expect(w2.carts.cartA.s).toBeCloseTo(CART_A_START, 9);
  });

  it('el cierre exige lanzadores destrabados, carros separados y frenados y pesas guardadas', () => {
    const w = ready();
    const { C } = io(w);
    C({ type: 'cock', cart: 'cartA', cm: 2 });
    expect(C({ type: 'closeStation' }).code).toBe('LATCHED');
    C({ type: 'cock', cart: 'cartA', cm: 0 });
    expect(C({ type: 'closeStation' }).code).toBe('CARTS_LOOSE');
    for (const c of ['cartA', 'cartB'] as const) C({ type: 'setCartBrake', cart: c, on: true });
    C({ type: 'loadCart', id: 'cw200', cart: 'cartB', on: true });
    expect(C({ type: 'closeStation' }).code).toBe('MASSES_OUT');
    C({ type: 'loadCart', id: 'cw200', cart: 'cartB', on: false });
    expect(C({ type: 'closeStation' }).ok).toBe(true);
  });
});
