/**
 * F08 — recorridos completos sin escena (§17, matriz «Integración»): ruta ideal por comandos hasta la entrega con la
 * máquina por etapas y la evaluación, en modo realista y curricular y con varias semillas; los 40 errores
 * F08-E01…E40 con su disparador y su consecuencia causal; los 12 escenarios docentes; seguridad y reanudación.
 */
import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import type { F08World, ReadingF8, SolidId } from '../../simulation/f08-world/types';
import type { F08Command } from '../../simulation/f08-world/commands';
import { SF8, spinningF8 } from '../../simulation/f08-world/world';
import { conservedTotalsF08, energyResidualJ } from '../../simulation/f08-world/conservation';
import { emptyF08Notebook, type F08Notebook } from '../../practices/practice-f08/notebook';
import { f08StageEvidence } from '../../practices/practice-f08/evidence';
import { practiceF08Machine, f08StageName } from '../../practices/practice-f08/workflow.machine';
import { F08_WEIGHTS, evaluateF08, notebookIssuesF08 } from '../../practices/practice-f08/rubric';
import { SIMULATED_ERRORS_F08, F08_SCENARIOS, errKeyF8 } from '../../practices/practice-f08/error-scenarios';
import { sanitizeOnResumeF08 } from '../../practices/practice-f08/resume';
import { expectedCalcF8, expectedEnergyF8, expectedRunF8 } from '../../practices/practice-f08/expected-results';
import { hangingAlpha } from '../../simulation/models/f08/equations';
import esF08 from '../../locales/es/practiceF08.json';
import * as h from '../helpersF08';

const ev = (w: F08World, k: string) => w.evidence[`err:${k}`] ?? 0;
const R = (w: F08World, r: { id?: string }): ReadingF8 => w.readings[r.id!];
const fmt = (v: number, d = 6) => v.toPrecision(d);

function ideal(seed = 108, scenarios: string[] = [], mode?: 'CURRICULAR' | 'REALISTIC') {
  const r = h.idealRouteF8(seed, scenarios as never, mode);
  return { ...r, nb: h.fillNotebookF8(r.w, r.ids) };
}

/** Atajos con la firma de la ruta (mundo diferido, comando, avance). */
const io = (w: F08World) => ({ W: () => w, C: (c: F08Command) => h.cmdF8(w, c), Rn: (s: number) => h.runF8(w, s) });

describe('F08 — ruta ideal', () => {
  it('cumple las etapas por evidencia y llega a COMPLETE sin errores', () => {
    const { w, nb } = ideal();
    const flags = f08StageEvidence(w, nb);
    expect(Object.entries(flags).filter(([, v]) => !v).map(([k]) => k)).toEqual([]);
    const actor = createActor(practiceF08Machine).start();
    actor.send({ type: 'START' });
    actor.send({ type: 'PPE_CONFIRMED' });
    expect(f08StageName(actor.getSnapshot().value)).toBe('MOUNT');
    actor.send({ type: 'EVIDENCE', flags });
    expect(f08StageName(actor.getSnapshot().value)).toBe('COMPLETE');
    expect(Object.keys(w.evidence).filter((k) => k.startsWith('err:') && w.evidence[k] > 0)).toEqual([]);
    expect(notebookIssuesF08(w, nb)).toEqual([]);
  });

  it('la evaluación da el máximo automático (las respuestas abiertas quedan a revisión)', () => {
    const { w, nb } = ideal();
    const e = evaluateF08(w, nb);
    expect(Object.values(F08_WEIGHTS).reduce((s, x) => s + x, 0)).toBeCloseTo(1, 12);
    for (const c of e.components.filter((x) => x.id !== 'analysis')) expect(c.score, c.id).toBe(1);
    expect(e.total).toBeGreaterThan(0.95);
    expect(e.needsTeacherReview.length).toBeGreaterThan(0);
  });

  it('la máquina no avanza sin evidencia (no hay evento «Siguiente»)', () => {
    const w = h.worldF8();
    for (const item of ['coat', 'goggles', 'shoes', 'hair'] as const) h.cmdF8(w, { type: 'equipPpe', item, on: true });
    h.cmdF8(w, { type: 'startWork' });
    const actor = createActor(practiceF08Machine).start();
    actor.send({ type: 'START' });
    actor.send({ type: 'PPE_CONFIRMED' });
    actor.send({ type: 'EVIDENCE', flags: f08StageEvidence(w, h.fillNotebookF8(w, h.emptyRouteIdsF8())) });
    expect(f08StageName(actor.getSnapshot().value)).toBe('MOUNT');
  });

  it.each([7, 2024, 99991])('semilla %i: I del disco ≈ ½MR², aro ≈ 2×, Steiner y pendiente ≈ 2m', (seed) => {
    const { w, nb } = ideal(seed);
    const ec = expectedCalcF8(w, nb);
    expect(Math.abs(ec.Idisk / ec.Ipred - 1)).toBeLessThan(0.02);
    expect(ec.ratio).toBeGreaterThan(1.9);
    expect(ec.ratio).toBeLessThan(2.1);
    expect(Math.abs(ec.parDisc)).toBeLessThan(6);
    expect(Math.abs(ec.slope / (2 * w.params.slideKg) - 1)).toBeLessThan(0.05);
    expect(ec.Ebal).toBeGreaterThan(90);
    expect(ec.Ebal).toBeLessThan(101);
    expect(notebookIssuesF08(w, nb)).toEqual([]);
  });

  it('modo curricular: α verdadera = m g r / (I + m r²) y sin desaceleración libre', () => {
    const { w, ids } = ideal(108, [], 'CURRICULAR');
    const f = w.readings[ids.disks[0]].fit!;
    const p = w.params;
    const I = p.I0 + 0.5 * p.disc.M * p.disc.R ** 2;
    expect(f.trueAlpha!).toBeCloseTo(hangingAlpha(p.dropKg.drop50, 0.02, I, p.g), 4);
    expect(Math.abs(f.trueAlphaC!)).toBeLessThan(1e-6);
  });

  it('conserva la masa y cierra el balance de energía', () => {
    for (const mode of ['CURRICULAR', 'REALISTIC'] as const) {
      const { w } = ideal(108, [], mode);
      expect(conservedTotalsF08(w).massesG).toBeCloseTo(w.initialTotals.massesG, 9);
      expect(Math.abs(energyResidualJ(w))).toBeLessThan(1e-3);
    }
  });
});

// ─────────────────────────── 40 errores ───────────────────────────

type Fixture = () => { w: F08World; nb?: F08Notebook; check?: (w: F08World, nb?: F08Notebook) => void };

const base = (opts: Parameters<typeof h.worldF8>[0] = {}) => {
  const w = h.worldF8(opts);
  for (const item of ['coat', 'goggles', 'shoes', 'hair'] as const) h.cmdF8(w, { type: 'equipPpe', item, on: true });
  h.cmdF8(w, { type: 'startWork' });
  return w;
};

type ReadyOpts = Parameters<typeof h.worldF8>[0] & {
  solid?: SolidId | null; center?: boolean; clamp?: boolean; align?: boolean; catchOn?: boolean; connect?: boolean; calibrate?: boolean; mark?: boolean; tzero?: boolean; tach?: number; rate?: number;
};

/** Montaje listo (el de la ruta), con interruptores para dejar una parte sin hacer. */
const ready = (opts: ReadyOpts = {}) => {
  const w = base(opts);
  const { W, C, Rn } = io(w);
  if (opts.clamp ?? true) C({ type: 'clampBase', on: true });
  if (opts.align ?? true) C({ type: 'alignPulley' });
  C({ type: 'setCatch', on: opts.catchOn ?? true, zCm: h.ROUTE_CATCH });
  C({ type: 'moveGate', zCm: h.ROUTE_GATE });
  if (opts.connect ?? true) for (const ch of ['encoder', 'tension', 'tach', 'gate'] as const) C({ type: 'connect', channel: ch, on: true });
  if (opts.calibrate ?? true) C({ type: 'calibrateEncoder' });
  if (opts.mark ?? true) {
    const a = C({ type: 'readScale', viewDeg: 0 }).value ?? 0;
    C({ type: 'turnByHand', deg: -a });
  }
  C({ type: 'zeroEncoder' });
  C({ type: 'setEncoderDir', dir: 1 });
  if (opts.tzero ?? true) C({ type: 'zeroTension' });
  C({ type: 'setTachRange', n: opts.tach ?? 1 });
  C({ type: 'setRate', hz: opts.rate ?? 200 });
  const solid = opts.solid === undefined ? 'disc01' : opts.solid;
  if (solid) {
    C({ type: 'mountSolid', id: solid, hole: 0 });
    if (opts.center ?? true) C({ type: 'centerSolid' });
  }
  Rn(0.5);
  void W;
  return w;
};

/** Un ensayo con `turns` vueltas; `during` actúa a los `atS` segundos de soltar. Devuelve el registro. */
const trial = (w: F08World, o: { turns?: number; during?: () => void; atS?: number; drop?: 'drop20' | 'drop50' | 'drop100' } = {}) => {
  const { W, C, Rn } = io(w);
  if (w.string.mass) C({ type: 'hangMass', id: w.string.mass, on: false });
  C({ type: 'setBrake', on: true });
  C({ type: 'windString', turns: o.turns ?? h.ROUTE_TURNS });
  C({ type: 'hangMass', id: o.drop ?? 'drop50', on: true });
  C({ type: 'setGuard', closed: true });
  C({ type: 'setBrake', on: false });
  C({ type: 'release' });
  if (o.during) {
    Rn(o.atS ?? 1);
    o.during();
  }
  Rn(1);
  h.waitRun(W, Rn);
  h.stopRotor(W, C, Rn);
  return w.runs[w.runs.length - 1];
};
const readE = (w: F08World) => R(w, h.cmdF8(w, { type: 'readEncoder' }));
const readT = (w: F08World) => R(w, h.cmdF8(w, { type: 'readTension' }));

const nbWith = (mut: (nb: F08Notebook, w: F08World) => void, seed = 108, scenarios: string[] = []) => {
  const { w, nb } = ideal(seed, scenarios);
  mut(nb, w);
  return { w, nb };
};
const runOf = (w: F08World, nb: F08Notebook, id: string | null) => expectedRunF8(w, nb, id ? w.readings[id] : null);

/** Barra acoplada con las masas corredizas en (r1, r2) cm, fijas o no. */
const barReady = (r1: number, r2: number, locked: boolean, opts: ReadyOpts = {}) => {
  const w = ready({ ...opts, solid: 'bar01' });
  const { C } = io(w);
  C({ type: 'setGuard', closed: false });
  for (const [s, r] of [['slide1', r1], ['slide2', r2]] as const) {
    C({ type: 'lockMass', id: s, on: false });
    C({ type: 'slideMass', id: s, rCm: r });
    C({ type: 'lockMass', id: s, on: locked });
  }
  return w;
};

/** El rotor girando a mano con la guarda abierta (sin cuerda). */
const spinning = (omega: number) => {
  const w = ready();
  const { C } = io(w);
  C({ type: 'setGuard', closed: false });
  C({ type: 'setBrake', on: false });
  C({ type: 'spinByHand', omega });
  return w;
};

const FIXTURES: Record<string, Fixture> = {
  E01: () => {
    const w = ready({ solid: 'ring01', center: false });
    trial(w);
    const r = readE(w);
    return { w, check: () => {
      expect(r.qualityFlags).toContain('ECCENTRIC');
      expect(r.setup!.eccMm!).toBeGreaterThan(1);
      expect(r.fit!.trueI!).toBeGreaterThan(w.params.I0 + w.params.ring.M * w.params.ring.R ** 2);
    } };
  },
  E02: () => nbWith((nb, w) => (nb.calc.Ipred.value = fmt(expectedCalcF8(w, nb).IpredDiam))),
  E03: () => {
    const w = barReady(15, 15, false);
    const rec = trial(w);
    return { w, check: () => {
      expect(rec.slidT).not.toBeNull();
      expect(w.slides.slide1.r).toBeGreaterThan(0.15);
    } };
  },
  E04: () => {
    const w = barReady(6, 22, true);
    const rec = trial(w);
    const r = readE(w);
    return { w, check: () => {
      expect(rec.setup.asym).toBe(true);
      expect(r.qualityFlags).toContain('ASYMMETRIC');
    } };
  },
  E05: () => {
    const w = ready();
    const rec = trial(w, { turns: 6 });
    return { w, check: () => {
      expect(rec.setup.overlap).toBe(true);
      expect(readE(w).qualityFlags).toContain('OVERLAP');
    } };
  },
  E06: () => {
    const w = ready({ mark: false });
    trial(w);
    const r = readE(w);
    return { w, check: () => {
      expect(Math.abs(r.setup!.enc!.zeroErrDeg)).toBeGreaterThan(1);
      expect(r.qualityFlags).toContain('ENC_OFFSET');
    } };
  },
  E07: () => {
    const w = ready();
    h.cmdF8(w, { type: 'setEncoderDir', dir: -1 });
    trial(w);
    const r = readE(w);
    return { w, check: () => {
      expect(r.qualityFlags).toContain('REVERSED');
      expect(r.value).toBeLessThan(0);
    } };
  },
  E08: () => nbWith((nb, w) => (nb.diskRows[0].T = fmt(runOf(w, nb, nb.diskRows[0].readingId).Tmg))),
  E09: () => nbWith((nb, w) => (nb.calc.Idisk.value = fmt(expectedCalcF8(w, nb).IdiskNoI0))),
  E10: () => {
    const w = ready({ align: false });
    const rec = trial(w);
    return { w, check: () => {
      expect(Math.abs(rec.setup.stringDeg)).toBeGreaterThan(3);
      expect(readE(w).qualityFlags).toContain('STRING_INCLINED');
    } };
  },
  E11: () => {
    const w = ready();
    const rec = trial(w, { during: () => h.cmdF8(w, { type: 'touchHub', on: true }) });
    h.cmdF8(w, { type: 'touchHub', on: false });
    return { w, check: () => {
      expect(rec.touchT).not.toBeNull();
      expect(readE(w).qualityFlags).toContain('TOUCHED');
    } };
  },
  E12: () => {
    const w = ready({ catchOn: false });
    const rec = trial(w);
    return { w, check: () => {
      expect(rec.groundT).not.toBeNull();
      expect(readE(w).qualityFlags).toContain('GROUND_HIT');
    } };
  },
  E13: () => nbWith((nb, w) => (nb.diskRows[0].I = fmt(runOf(w, nb, nb.diskRows[0].readingId).Inofric))),
  E14: () => {
    const w = ready();
    const { W, C, Rn } = io(w);
    C({ type: 'windString', turns: 5 });
    C({ type: 'hangMass', id: 'drop50', on: true });
    C({ type: 'setGuard', closed: false });
    C({ type: 'setBrake', on: false });
    C({ type: 'spinByHand', omega: 3 });
    C({ type: 'setGuard', closed: true });
    C({ type: 'release' });
    Rn(1);
    h.waitRun(W, Rn);
    return { w, check: () => expect(Math.abs(w.runs[0].setup.startOmega)).toBeGreaterThan(0.05) };
  },
  E15: () => nbWith((nb, w) => (nb.parallel.Ipred = fmt(expectedCalcF8(w, nb).IparNoMd2))),
  E16: () => nbWith((nb, w) => (nb.energy.omega = fmt(expectedEnergyF8(w, nb).rpm))),
  E17: () => nbWith((nb, w) => (nb.diskRows[0].alpha = fmt(runOf(w, nb, nb.diskRows[0].readingId).c))),
  E18: () => {
    const w = spinning(40);
    return { w, check: () => {
      expect(w.rotor.tripped).toBe(true);
      expect(w.rotor.brake).toBe(true);
    } };
  },
  E19: () => {
    const w = spinning(10);
    const r = h.cmdF8(w, { type: 'centerSolid' });
    return { w, check: () => {
      expect(r.code).toBe('HAND_IN_PLANE');
      expect(w.safety.block?.code).toBe('HAND_IN_PLANE');
    } };
  },
  E20: () => nbWith((nb, w) => {
    const { C } = io(w);
    C({ type: 'setGuard', closed: false });
    C({ type: 'mountSolid', id: 'disc01', hole: 0 });
    C({ type: 'clampBase', on: false });
    trial(w);
    nb.diskRows[0].readingId = C({ type: 'readEncoder' }).id ?? null;
  }),
  E21: () => {
    const w = ready({ tzero: false });
    trial(w);
    const r = readT(w);
    return { w, check: () => {
      expect(r.qualityFlags).toContain('NOT_ZEROED');
      expect(Math.abs(r.value - r.trueValue)).toBeGreaterThan(0.01);
    } };
  },
  E22: () => {
    const w = ready({ solid: null, tach: 0 });
    trial(w);
    const r = R(w, h.cmdF8(w, { type: 'readTach' }));
    return { w, check: () => {
      expect(r.qualityFlags).toContain('CLIPPED');
      expect(r.value).toBeLessThan(r.trueValue);
    } };
  },
  E23: () => {
    const w = ready();
    h.cmdF8(w, { type: 'connect', channel: 'tension', on: false });
    trial(w);
    const r = readT(w);
    return { w, check: () => {
      expect(r.qualityFlags).toContain('UNPLUGGED');
      expect(Number.isFinite(r.value)).toBe(false);
    } };
  },
  E24: () => {
    const w = ready({ rate: 20 });
    trial(w);
    const r = readE(w);
    return { w, check: () => {
      expect(r.qualityFlags).toContain('LOW_RATE');
      expect(r.fit!.n).toBeLessThan(100);
    } };
  },
  E25: () => {
    const w = ready();
    h.cmdF8(w, { type: 'setCatch', on: true, zCm: -68.5 });
    trial(w);
    const r = R(w, h.cmdF8(w, { type: 'readGate' }));
    return { w, check: () => {
      expect(r.qualityFlags).toContain('OCCLUDED');
      expect(Number.isFinite(r.value)).toBe(false);
    } };
  },
  E26: () => {
    const w = ready();
    h.cmdF8(w, { type: 'mountTension', angleDeg: 25 });
    trial(w);
    const r = readT(w);
    return { w, check: () => {
      expect(r.qualityFlags).toContain('TILTED_SENSOR');
      expect(r.value).toBeLessThan(r.trueValue * 0.95);
    } };
  },
  E27: () => {
    const w = ready({ calibrate: false });
    trial(w);
    const r = readE(w);
    return { w, check: () => {
      expect(r.qualityFlags).toContain('UNCALIBRATED');
      expect(r.value).toBeGreaterThan(r.trueValue * 1.05);
    } };
  },
  E28: () => {
    const w = ready({ clamp: false });
    const rec = trial(w);
    return { w, check: () => {
      expect(rec.driftM).toBeGreaterThan(0.001);
      expect(readE(w).qualityFlags).toContain('SUPPORT_MOVED');
    } };
  },
  E29: () => {
    const w = ready();
    const r = R(w, h.cmdF8(w, { type: 'readScale', viewDeg: 20 }));
    return { w, check: () => expect(r.qualityFlags).toContain('PARALLAX') };
  },
  E30: () => {
    const w = base();
    const { C } = io(w);
    C({ type: 'tareBalance' });
    C({ type: 'placeOnBalance', id: 'disc01' });
    const r = R(w, C({ type: 'readBalance' }));
    return { w, check: () => expect(r.qualityFlags).toContain('UNSTABLE') };
  },
  E31: () => nbWith((nb) => {
    nb.setup.mDisc.readingId = null;
    nb.setup.mDisc.value = '500';
  }),
  E32: () => {
    const w = ready();
    const rec = trial(w, { during: () => h.cmdF8(w, { type: 'setRate', hz: 50 }) });
    return { w, check: () => expect(rec.configChangedT).not.toBeNull() };
  },
  E33: () => nbWith((nb) => (nb.diskRows[1].readingId = nb.ring.readingId)),
  E34: () => nbWith((nb) => (nb.diskRows[0].I = fmt(Number(nb.diskRows[0].I) * 1000))),
  E35: () => nbWith((nb, w) => (nb.diskRows[0].I = fmt(runOf(w, nb, nb.diskRows[0].readingId).Irounded))),
  E36: () => nbWith((nb, w) => (nb.calc.slope.value = fmt(1 / expectedCalcF8(w, nb).slope))),
  E37: () => nbWith((nb) => (nb.diskRows[2] = { readingId: null, alpha: '', alphaC: '', T: '', I: '' })),
  E38: () => nbWith((nb) => (nb.calc.Idisk.uncertainty = '0.000000001')),
  E39: () => {
    const w = barReady(15, 15, false);
    const { C } = io(w);
    trial(w);
    const hit = w.damaged.bar01;
    C({ type: 'setGuard', closed: false });
    for (const s of ['slide1', 'slide2'] as const) {
      C({ type: 'slideMass', id: s, rCm: 10 });
      C({ type: 'lockMass', id: s, on: true });
    }
    trial(w);
    const r = readE(w);
    return { w, check: () => {
      expect(hit).toBe(true);
      expect(r.qualityFlags).toContain('POST_IMPACT');
    } };
  },
  E40: () => {
    const w = spinning(10);
    const r = h.cmdF8(w, { type: 'removeSolid' });
    return { w, check: () => {
      expect(r.code).toBe('SPINNING_DISMOUNT');
      expect(w.safety.block?.code).toBe('SPINNING_DISMOUNT');
      expect(w.rotor.solid).toBeNull();
    } };
  },
};

describe('F08 — los 40 errores simulables', () => {
  it('el catálogo tiene 40 códigos, 20 + 20, con contrato completo y texto de retroalimentación', () => {
    expect(SIMULATED_ERRORS_F08).toHaveLength(40);
    expect(SIMULATED_ERRORS_F08.filter((e) => e.group === 'EXPERIMENTAL')).toHaveLength(20);
    const fb = (esF08 as { f08fb: Record<string, string> }).f08fb;
    for (const e of SIMULATED_ERRORS_F08) {
      expect(e.trigger && e.effect && e.fixture, e.id).toBeTruthy();
      expect(fb[errKeyF8(e)], e.id).toBeTruthy();
    }
  });

  it.each(SIMULATED_ERRORS_F08.map((e) => [e.id, e] as const))('%s: disparador → evidencia y consecuencia', (_id, e) => {
    const key = errKeyF8(e);
    const fx = FIXTURES[key]();
    if (e.evidenceKey.startsWith('err:')) expect(ev(fx.w, key), e.id).toBeGreaterThan(0);
    else expect(notebookIssuesF08(fx.w, fx.nb!)).toContain(`nb:${key}`);
    fx.check?.(fx.w, fx.nb);
  });
});

describe('F08 — escenarios docentes', () => {
  it.each(F08_SCENARIOS)('%s permite terminar por una ruta válida', (s) => {
    const { w, nb } = ideal(108, [s]);
    const flags = f08StageEvidence(w, nb);
    expect(Object.entries(flags).filter(([, v]) => !v).map(([k]) => k)).toEqual([]);
    expect(notebookIssuesF08(w, nb)).toEqual([]);
    expect(Object.keys(w.evidence).filter((k) => k.startsWith('err:') && w.evidence[k] > 0)).toEqual([]);
  });

  it('S01–S05 cambian el sólido inicial y las masas; S11 empieza en el agujero desplazado; S12 con el tope puesto', () => {
    expect(h.worldF8({ scenarios: [SF8.DISC] }).rotor.solid).toBe('disc01');
    const ring = h.worldF8({ scenarios: [SF8.RING] });
    expect(ring.rotor.solid).toBe('ring01');
    expect(ring.rotor.ecc).toBeGreaterThan(0.001);
    expect(h.worldF8({ scenarios: [SF8.BAR] }).rotor.solid).toBe('bar01');
    const cm = h.worldF8({ scenarios: [SF8.CENTERED] }).slides;
    expect(cm.slide1).toEqual(cm.slide2);
    expect(cm.slide1.locked).toBe(true);
    const as = h.worldF8({ scenarios: [SF8.ASYM] }).slides;
    expect(as.slide1.r).not.toBe(as.slide2.r);
    expect(h.worldF8({ scenarios: [SF8.OFFSET_AXIS] }).rotor.hole).toBeGreaterThan(0);
    expect(h.worldF8({ scenarios: [SF8.CATCH] }).column.catchOn).toBe(true);
  });

  it('S06 aumenta la desaceleración libre y S07 la anula; S08/S09 bajan y suben α', () => {
    const alphaC = (s: string[]) => {
      const { w, nb } = ideal(108, s);
      return runOf(w, nb, nb.diskRows[0].readingId).alphaC;
    };
    const a0 = alphaC([]);
    expect(alphaC([SF8.FRICTION])).toBeGreaterThan(a0 * 3);
    expect(alphaC([SF8.FRICTIONLESS])).toBeLessThan(1e-3);
    const alpha = (s: string[]) => {
      const { w, nb } = ideal(108, s);
      return runOf(w, nb, nb.diskRows[0].readingId).alpha;
    };
    expect(alpha([SF8.LOW_TORQUE])).toBeLessThan(alpha([]) * 0.5);
    expect(alpha([SF8.HIGH_TORQUE])).toBeGreaterThan(alpha([]) * 1.8);
  });

  it('S10 descalibra el encoder y lo invierte; la ruta lo calibra y corrige el sentido', () => {
    const w0 = h.worldF8({ scenarios: [SF8.ENC_MISCAL] });
    expect(w0.encoder.scale).toBeCloseTo(1.2, 9);
    expect(w0.encoder.dir).toBe(-1);
    const { w } = ideal(108, [SF8.ENC_MISCAL]);
    expect(w.encoder.scale).toBe(1);
    expect(w.encoder.dir).toBe(1);
  });
});

describe('F08 — seguridad y reanudación', () => {
  it('la mano en el plano de giro bloquea hasta frenar, detener el rotor y cerrar la guarda', () => {
    const w = FIXTURES.E19().w;
    expect(h.cmdF8(w, { type: 'readBalance' }).code).toBe('BLOCKED');
    expect(h.cmdF8(w, { type: 'acknowledge' }).code).toBe('SECURE_FIRST');
    h.runF8(w, 3);
    expect(spinningF8(w)).toBe(false);
    expect(h.cmdF8(w, { type: 'acknowledge' }).code).toBe('SECURE_FIRST');
    h.cmdF8(w, { type: 'setGuard', closed: true });
    expect(h.cmdF8(w, { type: 'acknowledge' }).ok).toBe(true);
    expect(evaluateF08(w, emptyF08Notebook()).components.find((c) => c.id === 'safety')!.score).toBe(0);
  });

  it('la guarda interbloquea la suelta y el freno de mano impide soltar', () => {
    const w = ready();
    const { C } = io(w);
    C({ type: 'windString', turns: 5 });
    C({ type: 'hangMass', id: 'drop50', on: true });
    C({ type: 'setGuard', closed: false });
    expect(C({ type: 'release' }).code).toBe('GUARD_OPEN');
    C({ type: 'setGuard', closed: true });
    expect(C({ type: 'release' }).code).toBe('BRAKE_ON');
    expect(C({ type: 'mountSolid', id: 'ring01', hole: 0 }).code).toBe('GUARD_CLOSED');
  });

  it('sin EPP no se opera; la reanudación detiene el rotor y deja la masa sostenida', () => {
    const w0 = h.worldF8();
    expect(h.cmdF8(w0, { type: 'release' }).code).toBe('PPE');
    const w = ready();
    const { C } = io(w);
    C({ type: 'windString', turns: 5 });
    C({ type: 'hangMass', id: 'drop50', on: true });
    C({ type: 'setGuard', closed: true });
    C({ type: 'setBrake', on: false });
    C({ type: 'release' });
    h.runF8(w, 1.5);
    expect(w.rotor.omega).toBeGreaterThan(1);
    sanitizeOnResumeF08(w);
    expect(w.rotor.omega).toBe(0);
    expect(w.string.held).toBe(true);
    expect(w.run?.done).toBe(true);
    expect(Math.abs(energyResidualJ(w))).toBeLessThan(1e-9);
    h.runF8(w, 1);
    expect(spinningF8(w)).toBe(false);
  });

  it('el cierre exige el rotor frenado, la masa en el estante, el sólido en la bandeja y la guarda cerrada', () => {
    const w = ready();
    const { C, Rn } = io(w);
    trial(w);
    C({ type: 'setBrake', on: false });
    expect(C({ type: 'closeStation' }).code).toBe('BRAKE_OFF');
    C({ type: 'setBrake', on: true });
    expect(C({ type: 'closeStation' }).code).toBe('MASS_HUNG');
    C({ type: 'hangMass', id: 'drop50', on: false });
    expect(C({ type: 'closeStation' }).code).toBe('SOLID_MOUNTED');
    C({ type: 'setGuard', closed: false });
    C({ type: 'removeSolid' });
    expect(C({ type: 'closeStation' }).code).toBe('GUARD_OPEN');
    C({ type: 'setGuard', closed: true });
    Rn(0.1);
    expect(C({ type: 'closeStation' }).ok).toBe(true);
  });
});
