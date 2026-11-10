/**
 * F04 — recorridos completos sin escena (§17, matriz «Integración»): ruta ideal por comandos hasta la entrega con la
 * máquina por etapas y la evaluación, en modo realista y curricular y con varias semillas; los 40 errores
 * F04-E01…E40 con su disparador y su consecuencia causal; los 12 escenarios docentes; seguridad y reanudación.
 */
import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import type { F04World, ReadingF4 } from '../../simulation/f04-world/types';
import type { F04Command } from '../../simulation/f04-world/commands';
import { SF4 } from '../../simulation/f04-world/world';
import { conservedTotalsF04, energyResidualJ } from '../../simulation/f04-world/conservation';
import { emptyF04Notebook, type F04Notebook } from '../../practices/practice-f04/notebook';
import { f04StageEvidence } from '../../practices/practice-f04/evidence';
import { practiceF04Machine, f04StageName } from '../../practices/practice-f04/workflow.machine';
import { F04_WEIGHTS, evaluateF04, notebookIssuesF04 } from '../../practices/practice-f04/rubric';
import { SIMULATED_ERRORS_F04, F04_SCENARIOS, errKeyF4 } from '../../practices/practice-f04/error-scenarios';
import { sanitizeOnResumeF04 } from '../../practices/practice-f04/resume';
import { expectedMassRow, expectedModel, expectedRunRow, expectedRuns, expectedSlope } from '../../practices/practice-f04/expected-results';
import esF04 from '../../locales/es/practiceF04.json';
import * as h from '../helpersF04';

const ev = (w: F04World, k: string) => w.evidence[`err:${k}`] ?? 0;
const R = (w: F04World, r: { id?: string }): ReadingF4 => w.readings[r.id!];
const fmt = (v: number, d = 4) => v.toFixed(d);

function ideal(seed = 104, scenarios: string[] = [], mode?: 'CURRICULAR' | 'REALISTIC') {
  const r = h.idealRouteF4(seed, scenarios as never, mode);
  return { ...r, nb: h.fillNotebookF4(r.w, r.ids) };
}

/** Atajos con la firma de la ruta (mundo diferido, comando, avance). */
const io = (w: F04World) => ({ W: () => w, C: (c: F04Command) => h.cmdF4(w, c), Rn: (s: number) => h.runF4(w, s) });

describe('F04 — ruta ideal', () => {
  it('cumple las etapas por evidencia y llega a COMPLETE sin errores', () => {
    const { w, nb } = ideal();
    const flags = f04StageEvidence(w, nb);
    expect(Object.entries(flags).filter(([, v]) => !v).map(([k]) => k)).toEqual([]);
    const actor = createActor(practiceF04Machine).start();
    actor.send({ type: 'START' });
    actor.send({ type: 'PPE_CONFIRMED' });
    expect(f04StageName(actor.getSnapshot().value)).toBe('INVENTORY');
    actor.send({ type: 'EVIDENCE', flags });
    expect(f04StageName(actor.getSnapshot().value)).toBe('COMPLETE');
    expect(Object.keys(w.evidence).filter((k) => k.startsWith('err:') && w.evidence[k] > 0)).toEqual([]);
    expect(notebookIssuesF04(w, nb)).toEqual([]);
  });

  it('la evaluación da el máximo automático (las respuestas abiertas quedan a revisión)', () => {
    const { w, nb } = ideal();
    const e = evaluateF04(w, nb);
    expect(Object.values(F04_WEIGHTS).reduce((s, x) => s + x, 0)).toBeCloseTo(1, 12);
    for (const c of e.components.filter((x) => x.id !== 'analysis')) expect(c.score, c.id).toBe(1);
    expect(e.total).toBeGreaterThan(0.95);
    expect(e.needsTeacherReview.length).toBeGreaterThan(0);
  });

  it('la máquina no avanza sin evidencia (no hay evento «Siguiente»)', () => {
    const w = h.worldF4();
    for (const item of ['coat', 'goggles', 'shoes', 'hair'] as const) h.cmdF4(w, { type: 'equipPpe', item, on: true });
    h.cmdF4(w, { type: 'startWork' });
    const actor = createActor(practiceF04Machine).start();
    actor.send({ type: 'START' });
    actor.send({ type: 'PPE_CONFIRMED' });
    actor.send({ type: 'EVIDENCE', flags: f04StageEvidence(w, h.fillNotebookF4(w, h.emptyRouteIdsF4())) });
    expect(f04StageName(actor.getSnapshot().value)).toBe('INVENTORY');
  });

  it.each([7, 2024, 99991])('semilla %i: aceleración, tensión y pendiente coherentes con las lecturas propias', (seed) => {
    const { w, nb } = ideal(seed);
    const r = expectedRuns(w, nb);
    const m = expectedModel(w, nb);
    // Con roce e inercia de la polea la aceleración medida queda por debajo de la ideal y cerca de la que incluye I/r².
    expect(r.aMean).toBeLessThan(m.aPred);
    expect(Math.abs(r.aMean - m.aPredI) / m.aPredI).toBeLessThan(0.07);
    // Las fotopuertas dan la misma aceleración que el acelerómetro (a 3 %).
    for (const row of r.rows) expect(Math.abs(row.aGates - r.aMean) / r.aMean).toBeLessThan(0.03);
    // La pendiente de T contra a es la masa del carro (0,45 kg).
    expect(expectedSlope(w, nb).slope).toBeCloseTo(0.45, 1);
  });

  it('modo curricular: a = m_h g/(m_c + m_h) y T = m_c a dentro de la resolución de los sensores', () => {
    const { w, nb } = ideal(104, [], 'CURRICULAR');
    const r = expectedRuns(w, nb);
    expect(r.aMean).toBeCloseTo(0.981, 2);
    expect(r.TMean).toBeCloseTo(0.4415, 2);
    expect(Math.abs(expectedModel(w, nb).discrepancy)).toBeLessThan(1);
  });

  it('conserva la masa y cierra el balance de energía', () => {
    const { w } = ideal(104, [], 'CURRICULAR');
    expect(conservedTotalsF04(w).massesG).toBeCloseTo(w.initialTotals.massesG, 9);
    expect(Math.abs(energyResidualJ(w))).toBeLessThan(2e-3);
    const r = ideal(104);
    expect(Math.abs(energyResidualJ(r.w))).toBeLessThan(2e-3);
  });

  it('tercera ley: los dinamómetros leen pares iguales y opuestos en el mismo contacto', () => {
    const { w, ids } = ideal();
    for (const id of ids.pairs) {
      const p = w.readings[id].pair!;
      expect(Math.abs(p.FA!)).toBeGreaterThan(1);
      expect(Math.abs(p.FA! + p.FB!)).toBeLessThan(0.03);
    }
  });
});

// ─────────────────────────── 40 errores ───────────────────────────

type Fixture = () => { w: F04World; nb?: F04Notebook; check?: (w: F04World, nb?: F04Notebook) => void };

const base = (opts: Parameters<typeof h.worldF4>[0] = {}) => {
  const w = h.worldF4(opts);
  for (const item of ['coat', 'goggles', 'shoes', 'hair'] as const) h.cmdF4(w, { type: 'equipPpe', item, on: true });
  h.cmdF4(w, { type: 'startWork' });
  return w;
};

type ReadyOpts = Parameters<typeof h.worldF4>[0] & { level?: boolean; tension?: boolean; path?: 'groove' | 'axle'; clip?: boolean; calibrate?: boolean; clamp?: boolean };

/** Carril listo para soltar: sensores conectados, calibrados y en cero; nivelado; polea, cordel y portapesas tensos. */
const ready = (opts: ReadyOpts = {}) => {
  const w = base(opts);
  const { W, C, Rn } = io(w);
  for (const ch of ['accel01', 'forceA', 'gates'] as const) C({ type: 'connect', channel: ch, on: true });
  C({ type: 'setRate', hz: 200 });
  if (opts.clip ?? true) C({ type: 'clipCable', on: true });
  if (opts.calibrate ?? true) C({ type: 'calibrateSensor', id: 'forceA' });
  C({ type: 'zeroSensor', id: 'forceA' });
  if (opts.level ?? true) h.levelTrack(W, C, Rn);
  if (opts.clamp ?? true) C({ type: 'clampPulley', on: true });
  C({ type: 'threadString', path: opts.path ?? 'groove' });
  C({ type: 'attachString', on: true });
  C({ type: 'hangHanger', on: true });
  if (opts.tension ?? true) C({ type: 'tensionString' });
  return w;
};

/** Suelta, espera el final del ensayo y lee la ventana limpia (o la que se indique). */
const trial = (w: F04World, win?: (rec: F04World['runs'][number]) => { t0: number; t1: number }) => {
  const { W, C, Rn } = io(w);
  C({ type: 'release' });
  Rn(0.5);
  h.waitRunDone(W, Rn);
  const rec = w.runs[w.runs.length - 1];
  const wd = (win ?? h.cleanWindow)(rec);
  return R(w, C({ type: 'readRun', t0: wd.t0, t1: wd.t1 }));
};

/** Aceleración verdadera de un ensayo limpio de referencia con la misma semilla. */
const refA = () => trial(ready()).run!.trueA!;

/** Pareja lista: dinamómetros conectados, calibrados y en cero, con sentidos opuestos salvo que se pida otra cosa. */
const pairReady = (opts: Parameters<typeof h.worldF4>[0] & { range?: number; signs?: boolean } = {}) => {
  const w = base(opts);
  const { C } = io(w);
  C({ type: 'setRate', hz: 200 });
  for (const ch of ['dynP', 'dynQ'] as const) {
    C({ type: 'connect', channel: ch, on: true });
    C({ type: 'setRange', id: ch, n: opts.range ?? 1 });
    C({ type: 'calibrateSensor', id: ch });
    C({ type: 'zeroSensor', id: ch });
  }
  if ((opts.signs ?? true) && w.sensors.dynP.axisSign === w.sensors.dynQ.axisSign) C({ type: 'setAxisSign', id: 'dynP', sign: -1 });
  return w;
};

const nbWith = (mut: (nb: F04Notebook, w: F04World) => void, seed = 104, scenarios: string[] = []) => {
  const { w, nb } = ideal(seed, scenarios);
  mut(nb, w);
  return { w, nb };
};

const FIXTURES: Record<string, Fixture> = {
  E01: () => nbWith((nb, w) => {
    const m = expectedModel(w, nb);
    nb.calc.aPred.value = fmt(m.aPredCartOnly);
  }),
  E02: () => {
    const w = ready({ level: false });
    const r = trial(w);
    return { w, check: () => {
      expect(Math.abs(w.track.tiltDeg)).toBeGreaterThan(0.15);
      expect(r.qualityFlags).toContain('TILTED');
    } };
  },
  E03: () => {
    const w = ready({ tension: false });
    const r = trial(w, () => ({ t0: 0, t1: 0.6 }));
    return { w, check: () => {
      expect(r.qualityFlags).toContain('SLACK');
      // Mientras el portapesas cae libre el cordel no tira: el sensor A marca cero al principio.
      expect(Math.abs(w.runs[0].samples[1][2])).toBeLessThan(0.02);
    } };
  },
  E04: () => {
    const a0 = refA();
    const w = ready({ path: 'axle' });
    const r = trial(w);
    return { w, check: () => {
      expect(r.qualityFlags).toContain('AXLE');
      expect(r.run!.trueA).toBeLessThan(a0 * 0.9);
    } };
  },
  E05: () => {
    const w = ready();
    const clean = trial(w);
    h.cmdF4(w, { type: 'returnCart' });
    const r = trial(w, (rec) => ({ t0: 0.15, t1: (rec.landedT ?? 1) + 0.4 }));
    return { w, check: () => {
      expect(r.qualityFlags).toContain('LANDED');
      expect(r.run!.T!).toBeLessThan(clean.run!.T! * 0.9);
    } };
  },
  E06: () => nbWith((nb, w) => {
    const e = expectedMassRow(w, nb, 1);
    nb.massRuns[1].mh = fmt(e.mhNoHanger);
  }),
  E07: () => {
    const w = ready();
    h.cmdF4(w, { type: 'mountSensor', id: 'forceA', angleDeg: 75 });
    const r = trial(w);
    return { w, check: () => {
      expect(r.qualityFlags).toContain('PERPENDICULAR');
      expect(r.run!.T!).toBeLessThan(r.run!.trueT! * 0.3);
    } };
  },
  E08: () => {
    const w = pairReady({ range: 0 });
    const { C, Rn } = io(w);
    C({ type: 'push', forceN: 6, durationS: 0.3 });
    Rn(0.8);
    const r = R(w, C({ type: 'readPair' }));
    return { w, check: () => {
      expect(r.qualityFlags).toContain('CLIPPED');
      expect(Math.abs(r.value)).toBeLessThanOrEqual(2);
      expect(r.trueValue).toBeGreaterThan(2);
    } };
  },
  E09: () => {
    const w = ready();
    const { W, C, Rn } = io(w);
    C({ type: 'pushCart', ms: 0.4 });
    Rn(0.5);
    h.waitRunDone(W, Rn);
    const r = R(w, C({ type: 'readRun', ...h.cleanWindow(w.runs[0]) }));
    return { w, check: () => {
      expect(r.qualityFlags).toContain('HAND_RELEASE');
      // El impulso de la mano adelanta el paso por la primera compuerta.
      expect(r.run!.t1g).toBeLessThan(0.55);
    } };
  },
  E10: () => {
    const w = ready();
    h.cmdF4(w, { type: 'setBrake', on: false });
    trial(w);
    return { w, check: () => expect(w.runs[0].impactV).toBeGreaterThan(0.3) };
  },
  E11: () => {
    const w = base();
    h.cmdF4(w, { type: 'drawForce', body: 'cart', force: 'weight', dir: 'left', partner: 'earth' });
    return { w, check: () => expect(h.cmdF4(w, { type: 'lockFbd', body: 'cart' }).code).toBe('FBD_INCOHERENT') };
  },
  E12: () => {
    const w = base();
    h.cmdF4(w, { type: 'drawForce', body: 'cartP', force: 'contact', dir: 'right', partner: 'cartQ' });
    return { w, check: () => expect(h.cmdF4(w, { type: 'lockFbd', body: 'cartP' }).ok).toBe(false) };
  },
  E13: () => {
    const w = pairReady({ scenarios: [SF4.BILATERAL], signs: false });
    const { C, Rn } = io(w);
    C({ type: 'push', forceN: 4, durationS: 0.3 });
    Rn(0.8);
    const r = R(w, C({ type: 'readPair' }));
    return { w, check: () => {
      expect(r.qualityFlags).toContain('SAME_SIGN');
      expect(r.pair!.FA! * r.pair!.FB!).toBeGreaterThan(0);
    } };
  },
  E14: () => nbWith((nb, w) => {
    nb.massRuns[1].mh = fmt(expectedMassRow(w, nb, 1).mh + 0.03);
  }),
  E15: () => {
    const w = base();
    h.cmdF4(w, { type: 'drawForce', body: 'cart', force: 'normal', dir: 'up', partner: 'earth' });
    return { w, check: () => expect(h.cmdF4(w, { type: 'lockFbd', body: 'cart' }).ok).toBe(false) };
  },
  E16: () => nbWith((nb, w) => {
    nb.massRuns[1].mh = fmt(expectedMassRow(w, nb, 1).mh * w.params.g);
  }),
  E17: () => nbWith((nb, w) => {
    const m = expectedModel(w, nb);
    nb.calc.mEff.value = fmt(m.mEffNoI);
    nb.calc.aPredI.value = fmt(m.aPred);
  }),
  E18: () => {
    const a0 = refA();
    const w = ready({ clip: false });
    const r = trial(w);
    return { w, check: () => {
      expect(r.qualityFlags).toContain('CABLE_DRAG');
      expect(r.run!.trueA).toBeLessThan(a0 * 0.95);
    } };
  },
  E19: () => {
    const w = ready();
    const ids: string[] = [];
    for (let i = 0; i < 2; i++) {
      ids.push(trial(w).id);
      h.cmdF4(w, { type: 'returnCart' });
    }
    h.cmdF4(w, { type: 'setRate', hz: 50 });
    ids.push(trial(w).id);
    const nb = emptyF04Notebook();
    nb.flagW = '1.0';
    ids.forEach((id, i) => {
      nb.runs[i].readingId = id;
      const e = expectedRunRow(w, nb, w.readings[id]);
      nb.runs[i].v1 = fmt(e.v1);
    });
    return { w, nb };
  },
  E20: () => nbWith((nb) => (nb.mcq = 'velocity')),
  E21: () => {
    const w = base();
    h.cmdF4(w, { type: 'placeOnBalance', id: 'cart01' });
    h.runF4(w, 2);
    const r = R(w, h.cmdF4(w, { type: 'readBalance' }));
    return { w, check: () => {
      expect(r.qualityFlags).toContain('NOT_ZEROED');
      expect(Math.abs(r.value - r.trueValue)).toBeGreaterThanOrEqual(2);
    } };
  },
  E22: () => {
    const w = pairReady({ range: 0 });
    const { C, Rn } = io(w);
    C({ type: 'push', forceN: 6, durationS: 0.3 });
    Rn(0.8);
    return { w, check: () => expect(w.pairRec!.samples.some((x) => x[4] > 0)).toBe(true) };
  },
  E23: () => {
    const w = ready();
    h.cmdF4(w, { type: 'connect', channel: 'accel01', on: false });
    const r = trial(w);
    return { w, check: () => {
      expect(r.valid).toBe(false);
      expect(Number.isNaN(r.value)).toBe(true);
    } };
  },
  E24: () => {
    const w = ready();
    h.cmdF4(w, { type: 'setRate', hz: 10 });
    const r = trial(w);
    return { w, check: () => {
      expect(r.qualityFlags).toContain('LOW_RATE');
      expect(r.run!.n).toBeLessThan(15);
    } };
  },
  E25: () => {
    const w = ready();
    h.cmdF4(w, { type: 'moveGate', id: 'gate2', s: w.brake.s + 0.1 });
    const r = trial(w);
    return { w, check: () => {
      expect(r.qualityFlags).toContain('OCCLUDED');
      expect(r.run!.dt2).toBeNull();
    } };
  },
  E26: () => {
    const w = ready();
    h.cmdF4(w, { type: 'mountSensor', id: 'forceA', angleDeg: 30 });
    const r = trial(w);
    return { w, check: () => {
      expect(r.qualityFlags).toContain('TILTED_SENSOR');
      expect(r.run!.T! / r.run!.trueT!).toBeCloseTo(Math.cos(Math.PI / 6), 1);
    } };
  },
  E27: () => {
    const w = ready({ calibrate: false });
    const r = trial(w);
    return { w, check: () => {
      expect(r.qualityFlags).toContain('UNCALIBRATED');
      expect(r.run!.T! / r.run!.trueT!).toBeCloseTo(1.04, 1);
    } };
  },
  E28: () => {
    const a0 = refA();
    const w = ready({ clamp: false });
    const r = trial(w);
    return { w, check: () => {
      expect(r.qualityFlags).toContain('LOOSE_CLAMP');
      expect(r.run!.trueA).toBeLessThan(a0 * 0.95);
    } };
  },
  E29: () => {
    const w = base();
    const r = R(w, h.cmdF4(w, { type: 'readScale', target: 'gate1', viewDeg: 25 }));
    return { w, check: () => {
      expect(r.qualityFlags).toContain('PARALLAX');
      expect(r.value).not.toBe(r.trueValue);
    } };
  },
  E30: () => {
    const w = base();
    h.cmdF4(w, { type: 'tareBalance' });
    h.cmdF4(w, { type: 'placeOnBalance', id: 'hanger01' });
    const r = R(w, h.cmdF4(w, { type: 'readBalance' }));
    return { w, check: () => expect(r.qualityFlags).toContain('UNSTABLE') };
  },
  E31: () => nbWith((nb) => (nb.setup.cartM = { value: '450', uncertainty: '', readingId: null })),
  E32: () => {
    const w = ready();
    const { C, Rn } = io(w);
    C({ type: 'release' });
    Rn(0.5);
    C({ type: 'moveGate', id: 'gate2', s: 0.6 });
    return { w, check: () => expect(w.runs[0].configChangedT).not.toBeNull() };
  },
  E33: () => nbWith((nb, w) => {
    const id = Object.values(w.readings).filter((r) => r.kind === 'run' && r.setup?.hangLoad === 70)[0].id;
    nb.runs[0].readingId = id;
  }),
  E34: () => nbWith((nb, w) => {
    nb.calc.mEff.value = fmt(expectedModel(w, nb).mEff * 1000, 1);
  }),
  E35: () => nbWith((nb, w) => {
    const e = expectedRunRow(w, nb, w.readings[nb.runs[0].readingId!]);
    nb.runs[0].v2 = fmt(e.v2Rounded);
  }),
  E36: () => nbWith((nb, w) => {
    nb.calc.slopeK.value = fmt(expectedSlope(w, nb).inverse, 3);
  }),
  E37: () => nbWith((nb) => (nb.runs[2] = { readingId: null, v1: '', v2: '', aGates: '' })),
  E38: () => nbWith((nb) => (nb.calc.aMean.uncertainty = '0.005')),
  E39: () => {
    const w = ready();
    h.cmdF4(w, { type: 'setBrake', on: false });
    trial(w);
    h.cmdF4(w, { type: 'returnCart' });
    h.cmdF4(w, { type: 'setBrake', on: true });
    const r = trial(w);
    return { w, check: () => {
      expect(w.cart.shock).toBe(true);
      expect(r.qualityFlags).toContain('POST_IMPACT');
      expect(r.value - r.run!.trueA!).toBeGreaterThan(0.1);
    } };
  },
  E40: () => {
    const w = ready();
    h.cmdF4(w, { type: 'attachString', on: false });
    return { w, check: () => {
      expect(w.objects.hanger01.support).toBe('floor');
      expect(w.safety.block?.code).toBe('MASS_FALL');
    } };
  },
};

describe('F04 — los 40 errores simulables', () => {
  it('el catálogo tiene 40 códigos, 20 + 20, con contrato completo y texto de retroalimentación', () => {
    expect(SIMULATED_ERRORS_F04).toHaveLength(40);
    expect(SIMULATED_ERRORS_F04.filter((e) => e.group === 'EXPERIMENTAL')).toHaveLength(20);
    const fb = (esF04 as { f04fb: Record<string, string> }).f04fb;
    for (const e of SIMULATED_ERRORS_F04) {
      expect(e.trigger && e.effect && e.fixture, e.id).toBeTruthy();
      expect(fb[errKeyF4(e)], e.id).toBeTruthy();
    }
  });

  it.each(SIMULATED_ERRORS_F04.map((e) => [e.id, e] as const))('%s: disparador → evidencia y consecuencia', (_id, e) => {
    const key = errKeyF4(e);
    const fx = FIXTURES[key]();
    if (e.evidenceKey.startsWith('err:')) expect(ev(fx.w, key), e.id).toBeGreaterThan(0);
    else expect(notebookIssuesF04(fx.w, fx.nb!)).toContain(`nb:${key}`);
    fx.check?.(fx.w, fx.nb);
  });
});

describe('F04 — escenarios docentes', () => {
  it.each(F04_SCENARIOS)('%s permite terminar por una ruta válida', (s) => {
    const { w, nb } = ideal(104, [s]);
    const flags = f04StageEvidence(w, nb);
    expect(Object.entries(flags).filter(([, v]) => !v).map(([k]) => k)).toEqual([]);
    expect(notebookIssuesF04(w, nb)).toEqual([]);
  });

  it('S01: el ideal reproduce el oráculo; S03 y S10 (polea real) bajan la aceleración', () => {
    const ref = ideal(104);
    const a0 = expectedRuns(ref.w, ref.nb).aMean;
    const s1 = ideal(104, [SF4.IDEAL]);
    expect(expectedRuns(s1.w, s1.nb).aMean).toBeCloseTo(0.981, 2);
    for (const s of [SF4.PULLEY_INERTIA, SF4.LOSSY, SF4.FRICTION]) {
      const r = ideal(104, [s]);
      expect(expectedRuns(r.w, r.nb).aMean, s).toBeLessThan(a0 * 0.97);
    }
  });

  it('S11: con los topes cercanos la ruta acerca las compuertas para leer antes del freno', () => {
    const { w } = ideal(104, [SF4.CLOSE_STOP]);
    expect(w.gates.gate2.s).toBeLessThan(w.brake.s);
    expect(w.gates.gate2.s).toBeLessThan(0.6);
  });

  it('S04 y S09: la ruta corrige el rango saturado y el sentido de los dinamómetros', () => {
    expect(ideal(104, [SF4.SATURATED]).w.sensors.dynP.rangeIdx).toBe(1);
    const s9 = ideal(104, [SF4.BILATERAL]).w;
    expect(s9.sensors.dynP.axisSign).not.toBe(s9.sensors.dynQ.axisSign);
  });
});

describe('F04 — seguridad y reanudación', () => {
  it('soltar el cordel con el portapesas colgado bloquea hasta devolverlo al estante', () => {
    const w = FIXTURES.E40().w;
    expect(h.cmdF4(w, { type: 'readTilt' }).code).toBe('BLOCKED');
    expect(h.cmdF4(w, { type: 'acknowledge' }).code).toBe('SECURE_FIRST');
    h.cmdF4(w, { type: 'hangHanger', on: false });
    expect(w.objects.hanger01.support).toBe('rack');
    expect(h.cmdF4(w, { type: 'acknowledge' }).ok).toBe(true);
    expect(w.safety.block).toBeNull();
    expect(ev(w, 'E40')).toBe(1);
    expect(evaluateF04(w, emptyF04Notebook()).components.find((c) => c.id === 'safety')!.score).toBe(0);
  });

  it('sin EPP no se opera; la reanudación retiene el carro y sostiene el portapesas', () => {
    const w0 = h.worldF4();
    expect(h.cmdF4(w0, { type: 'release' }).code).toBe('PPE');
    const w = ready();
    h.cmdF4(w, { type: 'release' });
    h.runF4(w, 0.4);
    expect(w.cart.latched).toBe(false);
    sanitizeOnResumeF04(w);
    expect(w.cart.latched).toBe(true);
    expect(w.string.held).toBe(true);
    expect(w.run?.done).toBe(true);
    expect(Math.abs(energyResidualJ(w))).toBeLessThan(1e-9);
    h.runF4(w, 1);
    expect(w.cart.v).toBe(0);
  });

  it('el cierre exige el carro retenido, el portapesas y las pesas en el estante y el freno puesto', () => {
    const w = ready();
    expect(h.cmdF4(w, { type: 'closeStation' }).code).toBe('HANGER_HUNG');
    h.cmdF4(w, { type: 'hangHanger', on: false });
    h.cmdF4(w, { type: 'setBrake', on: false });
    expect(h.cmdF4(w, { type: 'closeStation' }).code).toBe('BRAKE_OFF');
    h.cmdF4(w, { type: 'setBrake', on: true });
    expect(h.cmdF4(w, { type: 'closeStation' }).ok).toBe(true);
  });
});
