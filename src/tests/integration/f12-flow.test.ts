/**
 * F12 — recorridos completos sin escena (§17, matriz «Integración»): ruta ideal por comandos hasta la entrega con la
 * máquina por etapas y la evaluación, en modo realista y curricular y con varias semillas; los 40 errores
 * F12-E01…E40 con su disparador y su consecuencia causal; los 12 escenarios docentes; seguridad y reanudación.
 */
import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import type { F12World, JointId, ReadingF12 } from '../../simulation/f12-world/types';
import type { F12Command } from '../../simulation/f12-world/commands';
import { SF12, busyF12, hydraulicsF12 } from '../../simulation/f12-world/world';
import { conservedTotalsF12 } from '../../simulation/f12-world/conservation';
import { emptyF12Notebook, type F12Notebook } from '../../practices/practice-f12/notebook';
import { f12StageEvidence } from '../../practices/practice-f12/evidence';
import { practiceF12Machine, f12StageName } from '../../practices/practice-f12/workflow.machine';
import { F12_WEIGHTS, evaluateF12, notebookIssuesF12 } from '../../practices/practice-f12/rubric';
import { SIMULATED_ERRORS_F12, F12_SCENARIOS, errKeyF12 } from '../../practices/practice-f12/error-scenarios';
import { sanitizeOnResumeF12 } from '../../practices/practice-f12/resume';
import { expectedCalcF12, expectedFlowRowF12, expectedLossRowF12 } from '../../practices/practice-f12/expected-results';
import esF12 from '../../locales/es/practiceF12.json';
import * as h from '../helpersF12';

const ev = (w: F12World, k: string) => w.evidence[`err:${k}`] ?? 0;
const R = (w: F12World, r: { id?: string }): ReadingF12 => w.readings[r.id!];

function ideal(seed = 111, scenarios: string[] = [], mode?: 'CURRICULAR' | 'REALISTIC') {
  const r = h.idealRouteF12(seed, scenarios as never, mode);
  return { ...r, nb: h.fillNotebookF12(r.w, r.ids) };
}

/** Atajos con la firma de la ruta (mundo diferido, comando, avance). */
const io = (w: F12World) => ({ W: () => w, C: (c: F12Command) => h.cmdF12(w, c), Rn: (s: number) => h.runF12(w, s) });
const errsOf = (w: F12World) => Object.keys(w.evidence).filter((k) => k.startsWith('err:') && w.evidence[k] > 0);

describe('F12 — ruta ideal', () => {
  it('cumple las etapas por evidencia y llega a COMPLETE sin errores', () => {
    const { w, nb } = ideal();
    const flags = f12StageEvidence(w, nb);
    expect(Object.entries(flags).filter(([, v]) => !v).map(([k]) => k)).toEqual([]);
    const actor = createActor(practiceF12Machine).start();
    actor.send({ type: 'START' });
    actor.send({ type: 'PPE_CONFIRMED' });
    expect(f12StageName(actor.getSnapshot().value)).toBe('PREPARE');
    actor.send({ type: 'EVIDENCE', flags });
    expect(f12StageName(actor.getSnapshot().value)).toBe('COMPLETE');
    expect(errsOf(w)).toEqual([]);
    expect(notebookIssuesF12(w, nb)).toEqual([]);
  });

  it('la evaluación da el máximo automático (las respuestas abiertas quedan a revisión)', () => {
    const { w, nb } = ideal();
    const e = evaluateF12(w, nb);
    expect(Object.values(F12_WEIGHTS).reduce((s, x) => s + x, 0)).toBeCloseTo(1, 12);
    for (const c of e.components.filter((x) => x.id !== 'analysis')) expect(c.score, c.id).toBe(1);
    expect(e.total).toBeGreaterThan(0.95);
    expect(e.needsTeacherReview.length).toBeGreaterThan(0);
  });

  it('la máquina no avanza sin evidencia (no hay evento «Siguiente»)', () => {
    const w = h.worldF12();
    for (const item of ['coat', 'goggles', 'shoes', 'hair'] as const) h.cmdF12(w, { type: 'equipPpe', item, on: true });
    h.cmdF12(w, { type: 'startWork' });
    const actor = createActor(practiceF12Machine).start();
    actor.send({ type: 'START' });
    actor.send({ type: 'PPE_CONFIRMED' });
    actor.send({ type: 'EVIDENCE', flags: f12StageEvidence(w, h.fillNotebookF12(w, h.emptyRouteIdsF12())) });
    expect(f12StageName(actor.getSnapshot().value)).toBe('PREPARE');
  });

  it.each([7, 2024, 99991])('semilla %i: continuidad, ρ del ajuste ≈ agua, caudal volumétrico ≈ caudalímetro y K constante', (seed) => {
    const { w, nb } = ideal(seed);
    const ec = expectedCalcF12(w, nb);
    expect(Math.abs(ec.rhoFit / w.params.rho - 1)).toBeLessThan(0.03);
    expect(Math.abs(ec.QDev)).toBeLessThan(6);
    expect(ec.K).toBeGreaterThan(1);
    for (const row of nb.lossRows) expect(Math.abs(expectedLossRowF12(w, nb, row).K / ec.K - 1)).toBeLessThan(0.06);
    for (const row of nb.flowRows) {
      const e = expectedFlowRowF12(w, nb, row);
      // Continuidad: A1 v1 = A2 v2 con D1 = 2 D2.
      expect(e.v2 / e.v1).toBeCloseTo(4, 1);
      expect(Math.abs(e.dp12 / e.dp12Pred - 1)).toBeLessThan(0.05);
    }
    expect(notebookIssuesF12(w, nb)).toEqual([]);
  });

  it('modo curricular: Bernoulli ideal, ρ del ajuste = 1000 kg/m³ y caudalímetro = caudal volumétrico', () => {
    const { w, nb } = ideal(111, [], 'CURRICULAR');
    expect(w.params.rho).toBe(1000);
    const ec = expectedCalcF12(w, nb);
    expect(Math.abs(ec.rhoFit - 1000)).toBeLessThan(20);
    expect(Math.abs(ec.QDev)).toBeLessThan(4);
    for (const row of nb.flowRows) {
      const e = expectedFlowRowF12(w, nb, row);
      expect(Math.abs(e.dp12 - e.dp12Pred)).toBeLessThan(0.03 * e.dp12Pred + 15);
    }
  });

  it('conserva el agua: depósito + circuito + vaso + derrame + toalla', () => {
    for (const mode of ['CURRICULAR', 'REALISTIC'] as const) {
      const { w } = ideal(111, [], mode);
      expect(conservedTotalsF12(w).waterCm3).toBeCloseTo(w.initialTotals.waterCm3, 3);
    }
    const leak = ideal(111, [SF12.LEAK]).w;
    expect(conservedTotalsF12(leak).waterCm3).toBeCloseTo(leak.initialTotals.waterCm3, 3);
  });
});

// ─────────────────────────── 40 errores ───────────────────────────

type Fixture = () => { w: F12World; nb?: F12Notebook; check?: (w: F12World, nb?: F12Notebook) => void };

const base = (opts: Parameters<typeof h.worldF12>[0] = {}) => {
  const w = h.worldF12(opts);
  for (const item of ['coat', 'goggles', 'shoes', 'hair'] as const) h.cmdF12(w, { type: 'equipPpe', item, on: true });
  h.cmdF12(w, { type: 'startWork' });
  return w;
};

type ReadyOpts = Parameters<typeof h.worldF12>[0] & {
  noGasket?: JointId; clamp?: boolean; purge?: boolean; uncap?: boolean; cross?: boolean; skipSensor?: 1 | 2 | 3; range?: number; rate?: number;
  calibrate?: boolean; zero?: boolean; valve?: number; before?: (w: F12World) => void;
};

/** Circuito armado como la ruta (empaquetaduras, abrazaderas, sensores, purga, cero), con interruptores para fallar. */
const ready = (opts: ReadyOpts = {}) => {
  const w = base(opts);
  const { W, C, Rn } = io(w);
  opts.before?.(w);
  for (const j of ['J1', 'J2', 'J3'] as const) {
    if (opts.noGasket !== j) C({ type: 'fitGasket', joint: j });
    C({ type: 'connectJoint', joint: j, on: true });
  }
  if (opts.clamp ?? true) C({ type: 'clampVenturi', on: true });
  C({ type: 'setValve', pos: opts.valve ?? 2 });
  for (const i of [1, 2, 3] as const) {
    if (opts.skipSensor === i) continue;
    C({ type: 'connectSensor', sensor: i, port: opts.cross && i !== 3 ? ((3 - i) as 1 | 2) : i });
  }
  if (opts.uncap ?? true) for (const i of [1, 2, 3] as const) C({ type: 'capPort', port: i, on: false });
  C({ type: 'setRange', idx: opts.range ?? 1 });
  C({ type: 'setRate', hz: opts.rate ?? 20 });
  if (opts.purge ?? true) h.purge(W, C, Rn);
  else {
    C({ type: 'setSpeed', value: 0.5 });
    C({ type: 'setPump', on: true });
    Rn(10);
  }
  h.stopPump(W, C, Rn);
  for (let i = 0; i < 100 && !h.settled(w); i++) Rn(0.1);
  if (opts.calibrate ?? true) C({ type: 'calibrateSensors' });
  if (opts.zero ?? true) C({ type: 'zeroSensors' });
  C({ type: 'newSeries' });
  return w;
};

/** Bomba a la velocidad dada y espera del régimen. */
const flowAt = (w: F12World, speed: number) => {
  const { W, C, Rn } = io(w);
  C({ type: 'setSpeed', value: speed });
  C({ type: 'setPump', on: true });
  h.waitSteady(W, Rn);
};
const press = (w: F12World) => (h.cmdF12(w, { type: 'readPressures' }).ids ?? []).map((id) => w.readings[id]);

/** Recolección en el vaso: con o sin cronómetro, durante un tiempo, y si se retira el vaso antes de leer. */
const collect = (w: F12World, opts: { timer?: boolean; s?: number; leave?: boolean } = {}) => {
  const { C, Rn } = io(w);
  flowAt(w, 0.45);
  C({ type: 'moveBeaker', to: 'outlet' });
  C({ type: 'setDiverter', to: 'beaker' });
  if (opts.timer ?? true) C({ type: 'timer', action: 'start' });
  Rn(opts.s ?? 1);
  C({ type: 'setDiverter', to: 'sump' });
  if (opts.timer ?? true) C({ type: 'timer', action: 'stop' });
  if (!opts.leave) C({ type: 'moveBeaker', to: 'bench' });
  return R(w, C({ type: 'readBeaker', viewDeg: 0 }));
};

const nbWith = (mut: (nb: F12Notebook, w: F12World, ids: h.RouteIdsF12) => void, seed = 111, scenarios: string[] = []) => {
  const { w, nb, ids } = ideal(seed, scenarios);
  mut(nb, w, ids);
  return { w, nb };
};
const imp = (w: F12World, id: string) => ({ value: String(w.readings[id].value), uncertainty: '', readingId: id });

const FIXTURES: Record<string, Fixture> = {
  E01: () => {
    const w = ready({ noGasket: 'J2' });
    flowAt(w, 0.65);
    const [p1] = press(w);
    return { w, check: () => {
      expect(p1.qualityFlags).toContain('LEAK');
      const hy = hydraulicsF12(w);
      expect(hy.Q3).toBeLessThan(hy.Qv);
      expect(w.spill).toBeGreaterThan(0);
    } };
  },
  E02: () => {
    const w = ready({ purge: false });
    flowAt(w, 0.65);
    const [, p2] = press(w);
    return { w, check: () => {
      expect(w.circuit.airCm3).toBeGreaterThan(30);
      expect(p2.qualityFlags).toContain('AIR');
    } };
  },
  E03: () => nbWith((nb, w) => {
    const id = h.cmdF12(w, { type: 'measureDiameter', section: 'D2', face: 'outer', tiltDeg: 0 }).id!;
    nb.setup.D2 = imp(w, id);
  }),
  E04: () => {
    const w = ready();
    h.cmdF12(w, { type: 'setSpeed', value: 0.6 });
    h.cmdF12(w, { type: 'setPump', on: true });
    h.runF12(w, 1.5);
    const [p1] = press(w);
    return { w, check: () => expect(p1.qualityFlags).toContain('TRANSIENT') };
  },
  E05: () => {
    const w = ready();
    flowAt(w, 0.85);
    h.cmdF12(w, { type: 'setValve', pos: 0 });
    return { w, check: () => {
      expect(w.flow.surgePa).toBeGreaterThan(10000);
      expect(w.safety.block?.code).toBe('OVERPRESSURE');
      expect(w.pump.on).toBe(false);
      expect(evaluateF12(w, emptyF12Notebook()).components.find((c) => c.id === 'safety')!.score).toBeLessThan(1);
    } };
  },
  E06: () => {
    const w = ready({ uncap: false });
    flowAt(w, 0.65);
    const [p1] = press(w);
    return { w, check: () => {
      expect(p1.qualityFlags).toContain('BLOCKED');
      expect(Math.abs(p1.value)).toBeLessThan(0.05);
    } };
  },
  E07: () => {
    const w = ready({ before: (x) => h.cmdF12(x, { type: 'setProbe', port: 2, kind: 'pitot' }) });
    flowAt(w, 0.65);
    const [, p2] = press(w);
    return { w, check: () => {
      expect(p2.qualityFlags).toContain('PITOT');
      expect(p2.value).toBeGreaterThan(p2.trueValue + 2);
    } };
  },
  E08: () => {
    const w = ready({ cross: true });
    flowAt(w, 0.65);
    const [p1, p2] = press(w);
    return { w, check: () => {
      expect(p1.qualityFlags).toContain('CROSSED');
      expect(p1.value - p2.value).toBeLessThan(0);
    } };
  },
  E09: () => nbWith((nb, w) => {
    const e = expectedLossRowF12(w, nb, nb.lossRows[1]);
    nb.lossRows[1].dp13 = e.dp13NoZ.toFixed(1);
    nb.lossRows[1].K = e.KNoZ.toFixed(4);
  }, 111, [SF12.ELEVATION]),
  E10: () => {
    const w = ready();
    flowAt(w, 0.65);
    press(w);
    h.stopPump(io(w).W, io(w).C, io(w).Rn);
    h.cmdF12(w, { type: 'swapSpool', kind: 'rough' });
    return { w, check: () => {
      expect(w.series.spoolChanged).toBe(true);
      expect(w.circuit.airCm3).toBeGreaterThan(300);
    } };
  },
  E11: () => {
    const w = ready({ valve: 1 });
    flowAt(w, 1);
    return { w, check: () => {
      expect(w.safety.block?.code).toBe('OVERPRESSURE');
      expect(w.pump.on).toBe(false);
      expect(h.cmdF12(w, { type: 'readPressures' }).code).toBe('BLOCKED');
    } };
  },
  E12: () => {
    const w = ready({ before: (x) => h.cmdF12(x, { type: 'setPressureMode', mode: 'abs' }) });
    flowAt(w, 0.65);
    const [p1] = press(w);
    return { w, check: () => {
      expect(p1.qualityFlags).toContain('ABSOLUTE');
      expect(p1.value).toBeGreaterThan(100);
    } };
  },
  E13: () => {
    const w = ready();
    const r = collect(w, { timer: false });
    return { w, check: () => expect(r.qualityFlags).toContain('NO_TIMER') };
  },
  E14: () => {
    const w = ready();
    const r = collect(w, { s: 4 });
    return { w, check: () => {
      expect(r.qualityFlags).toContain('OVERFLOW');
      expect(w.collect.beakerVol).toBe(w.params.beaker.overML);
      expect(w.spill).toBeGreaterThan(100);
    } };
  },
  E15: () => nbWith((nb, w) => {
    const e = expectedFlowRowF12(w, nb, nb.flowRows[2]);
    nb.flowRows[2].v1 = e.v1cm.toFixed(3);
    nb.flowRows[2].v2 = e.v2cm.toFixed(3);
  }),
  E16: () => nbWith((nb) => (nb.mcq = 'yes')),
  E17: () => {
    const w = ready({ valve: 5 });
    flowAt(w, 1);
    const [, p2] = press(w);
    return { w, check: () => {
      expect(p2.qualityFlags).toContain('BELOW');
      expect(p2.value).toBe(0);
      expect(p2.trueValue).toBeLessThan(0);
    } };
  },
  E18: () => {
    const w = ready({ before: (x) => h.cmdF12(x, { type: 'insertStopper' }) });
    flowAt(w, 0.55);
    const [p1, p2] = press(w);
    const clean = ready();
    flowAt(clean, 0.55);
    const [c1, c2] = press(clean);
    return { w, check: () => {
      expect(p1.qualityFlags).toContain('OBSTRUCTED');
      expect(p1.value - p2.value).toBeGreaterThan(1.1 * (c1.value - c2.value));
    } };
  },
  E19: () => nbWith((nb) => (nb.lossRows[0].K = '0')),
  E20: () => {
    const w = ready();
    flowAt(w, 0.5);
    const r = h.cmdF12(w, { type: 'closeStation' });
    return { w, check: () => {
      expect(r.code).toBe('PUMP_ON');
      expect(w.evidence.stationClosed).toBeUndefined();
    } };
  },
  E21: () => {
    const w = ready({ zero: false });
    flowAt(w, 0.65);
    const [p1] = press(w);
    return { w, check: () => {
      expect(p1.qualityFlags).toContain('NO_ZERO');
      expect(Math.abs(p1.value - p1.trueValue)).toBeGreaterThan(0.04);
    } };
  },
  E22: () => {
    const w = ready({ range: 0 });
    flowAt(w, 0.85);
    const [p1] = press(w);
    return { w, check: () => {
      expect(p1.qualityFlags).toContain('CLIPPED');
      expect(p1.value).toBe(10);
    } };
  },
  E23: () => {
    const w = ready({ skipSensor: 3 });
    flowAt(w, 0.65);
    const [, , p3] = press(w);
    return { w, check: () => {
      expect(p3.qualityFlags).toContain('UNPLUGGED');
      expect(p3.valid).toBe(false);
    } };
  },
  E24: () => {
    const w = ready({ rate: 5 });
    flowAt(w, 0.65);
    const [p1] = press(w);
    return { w, check: () => expect(p1.qualityFlags).toContain('LOW_RATE') };
  },
  E25: () => {
    const w = ready();
    const r = collect(w, { leave: true });
    return { w, check: () => expect(r.qualityFlags).toContain('OCCLUDED') };
  },
  E26: () => {
    const w = base();
    const r = R(w, h.cmdF12(w, { type: 'measureDiameter', section: 'D2', face: 'inner', tiltDeg: 12 }));
    return { w, check: () => {
      expect(r.qualityFlags).toContain('OBLIQUE');
      expect(r.value).toBeGreaterThan(r.trueValue);
    } };
  },
  E27: () => {
    const w = ready({ calibrate: false });
    flowAt(w, 0.65);
    const [p1] = press(w);
    return { w, check: () => {
      expect(p1.qualityFlags).toContain('UNCALIBRATED');
      expect(w.sensors[1].scale).not.toBe(1);
    } };
  },
  E28: () => {
    const w = ready({ clamp: false });
    flowAt(w, 0.85);
    h.runF12(w, 20);
    return { w, check: () => {
      expect(w.circuit.joints.J1.loose).toBe(true);
      expect(w.circuit.driftCm).toBeGreaterThan(1);
      expect(press(w)[0].qualityFlags).toContain('DRIFT');
    } };
  },
  E29: () => {
    const w = base();
    const r = R(w, h.cmdF12(w, { type: 'readTapHeight', port: 1, viewDeg: 25 }));
    return { w, check: () => {
      expect(r.qualityFlags).toContain('PARALLAX');
      expect(r.value).not.toBe(r.trueValue);
    } };
  },
  E30: () => {
    const w = ready();
    flowAt(w, 0.5);
    h.cmdF12(w, { type: 'setSpeed', value: 0.8 });
    h.runF12(w, 0.2);
    const [p1] = press(w);
    return { w, check: () => expect(p1.qualityFlags).toContain('UNSTABLE') };
  },
  E31: () => nbWith((nb) => (nb.setup.D1 = { value: '4', uncertainty: '', readingId: null })),
  E32: () => {
    const w = ready();
    flowAt(w, 0.65);
    press(w);
    h.cmdF12(w, { type: 'setRate', hz: 5 });
    const [p1] = press(w);
    return { w, check: () => expect(p1.qualityFlags).toContain('CONFIG_CHANGED') };
  },
  E33: () => nbWith((nb, _w, ids) => (nb.flowRows[0].p1Id = ids.p[1][0])),
  E34: () => nbWith((nb, w) => (nb.flowRows[3].dp12 = (expectedFlowRowF12(w, nb, nb.flowRows[3]).dp12 / 1000).toFixed(4))),
  E35: () => nbWith((nb, w) => {
    const i = nb.flowRows.findIndex((r) => {
      const e = expectedFlowRowF12(w, nb, r);
      return Math.abs(e.v2r / e.v2 - 1) > 0.005;
    });
    const e = expectedFlowRowF12(w, nb, nb.flowRows[i]);
    nb.flowRows[i].v1 = String(e.v1r);
    nb.flowRows[i].v2 = String(e.v2r);
    nb.flowRows[i].dp12Pred = e.predRounded.toFixed(1);
  }),
  E36: () => nbWith((nb, w) => (nb.calc.rhoFit.value = expectedCalcF12(w, nb).invRho.toExponential(5))),
  E37: () => nbWith((nb) => {
    nb.flowRows[3] = { qId: null, p1Id: null, p2Id: null, p3Id: null, v1: '', v2: '', dp12: '', dp12Pred: '' };
    nb.flowRows[4] = { qId: null, p1Id: null, p2Id: null, p3Id: null, v1: '', v2: '', dp12: '', dp12Pred: '' };
  }),
  E38: () => nbWith((nb, w) => (nb.calc.Qvol.uncertainty = (expectedCalcF12(w, nb).uQvol / 10).toFixed(4))),
  E39: () => {
    const w = ready();
    const { C, Rn } = io(w);
    flowAt(w, 0.85);
    C({ type: 'setValve', pos: 0 });
    for (let i = 0; i < 100 && w.pump.n > 0.02; i++) Rn(0.1);
    C({ type: 'acknowledge' });
    C({ type: 'setValve', pos: 2 });
    Rn(2);
    const [p1] = press(w);
    return { w, check: () => {
      expect(w.sensors[1].damaged).toBe(true);
      expect(p1.qualityFlags).toContain('POST_DAMAGE');
    } };
  },
  E40: () => {
    const w = ready();
    flowAt(w, 0.5);
    const r = h.cmdF12(w, { type: 'connectJoint', joint: 'J2', on: false });
    return { w, check: () => {
      expect(r.code).toBe('PRESSURIZED');
      expect(w.safety.block?.code).toBe('SPRAY');
      expect(w.spill).toBeGreaterThan(100);
      expect(evaluateF12(w, emptyF12Notebook()).components.find((c) => c.id === 'safety')!.score).toBe(0);
    } };
  },
};

describe('F12 — los 40 errores simulables', () => {
  it('el catálogo tiene 40 códigos, 20 + 20, con contrato completo y texto de retroalimentación', () => {
    expect(SIMULATED_ERRORS_F12).toHaveLength(40);
    expect(SIMULATED_ERRORS_F12.filter((e) => e.group === 'EXPERIMENTAL')).toHaveLength(20);
    const fb = (esF12 as { f12fb: Record<string, string> }).f12fb;
    for (const e of SIMULATED_ERRORS_F12) {
      expect(e.trigger && e.effect && e.fixture, e.id).toBeTruthy();
      expect(fb[errKeyF12(e)], e.id).toBeTruthy();
    }
  });

  it.each(SIMULATED_ERRORS_F12.map((e) => [e.id, e] as const))('%s: disparador → evidencia y consecuencia', (_id, e) => {
    const key = errKeyF12(e);
    const fx = FIXTURES[key]();
    if (e.evidenceKey.startsWith('err:')) expect(ev(fx.w, key), e.id).toBeGreaterThan(0);
    else expect(notebookIssuesF12(fx.w, fx.nb ?? emptyF12Notebook())).toContain(`nb:${key}`);
    fx.check?.(fx.w, fx.nb);
  });
});

describe('F12 — escenarios docentes', () => {
  it.each(F12_SCENARIOS)('%s permite terminar por una ruta válida', (s) => {
    const { w, nb } = ideal(111, [s]);
    const flags = f12StageEvidence(w, nb);
    expect(Object.entries(flags).filter(([, v]) => !v).map(([k]) => k)).toEqual([]);
    expect(notebookIssuesF12(w, nb)).toEqual([]);
    expect(errsOf(w)).toEqual([]);
  });

  it('cada escenario cambia lo que declara', () => {
    expect(h.worldF12({ scenarios: [SF12.IDEAL] }).params.K.conv).toBe(0);
    expect(h.worldF12({ scenarios: [SF12.LOSSY] }).params.K.diff).toBe(0.35);
    expect(h.worldF12({ scenarios: [SF12.ROUGH] }).circuit.spool).toBe('rough');
    expect(h.worldF12({ scenarios: [SF12.VALVE] }).valve.pos).toBe(1);
    expect(h.worldF12({ scenarios: [SF12.AIR] }).params.trapCm3).toBe(600);
    expect(h.worldF12({ scenarios: [SF12.MISCAL] }).sensors[2].scale).toBe(1.06);
    expect(h.worldF12({ scenarios: [SF12.LOW] }).params.pump.H0).toBeLessThan(h.worldF12().params.pump.H0);
    expect(h.worldF12({ scenarios: [SF12.HIGH] }).params.pump.H0).toBeGreaterThan(h.worldF12().params.pump.H0);
    expect(h.worldF12({ scenarios: [SF12.SWAPPED] }).reversed).toBe(true);
    const el = h.worldF12({ scenarios: [SF12.ELEVATION] });
    expect(el.tapZ[3] - el.tapZ[1]).toBe(10);
    expect(h.worldF12({ scenarios: [SF12.TRANSIENT] }).params.pump.pulse).toBeGreaterThan(0);
    expect(h.worldF12({ scenarios: [SF12.LEAK] }).circuit.joints.J1.worn).toBe(true);
  });

  it('S09 (Venturi al revés) infla la pendiente: el difusor brusco pierde más; S08 sube el caudal máximo', () => {
    const s9 = ideal(111, [SF12.SWAPPED]);
    expect(expectedCalcF12(s9.w, s9.nb).rhoFit).toBeGreaterThan(1.05 * s9.w.params.rho);
    const s8 = ideal(111, [SF12.HIGH]);
    const q = (x: { w: F12World; ids: h.RouteIdsF12 }) => Math.max(...x.ids.q.map((id) => x.w.readings[id].value));
    expect(q(s8)).toBeGreaterThan(q(ideal()) + 0.1);
  });

  it('S12: la junta gastada pierde caudal hasta que se cambia la empaquetadura', () => {
    const w = base({ scenarios: [SF12.LEAK] });
    for (const j of ['J1', 'J2', 'J3'] as const) {
      if (j !== 'J1') h.cmdF12(w, { type: 'fitGasket', joint: j });
      h.cmdF12(w, { type: 'connectJoint', joint: j, on: true });
    }
    h.cmdF12(w, { type: 'clampVenturi', on: true });
    h.cmdF12(w, { type: 'setValve', pos: 2 });
    flowAt(w, 0.65);
    expect(hydraulicsF12(w).leak.J1).toBeGreaterThan(0);
    expect(ev(w, 'E01')).toBeGreaterThan(0);
  });
});

describe('F12 — seguridad y reanudación', () => {
  it('el agua a presión bloquea hasta detener la bomba; secar la mesada permite cerrar', () => {
    const w = FIXTURES.E40().w;
    const { W, C, Rn } = io(w);
    expect(C({ type: 'readFlow' }).code).toBe('BLOCKED');
    expect(C({ type: 'acknowledge' }).code).toBe('SECURE_FIRST');
    h.stopPump(W, C, Rn);
    expect(C({ type: 'acknowledge' }).ok).toBe(true);
    C({ type: 'connectJoint', joint: 'J2', on: true });
    expect(C({ type: 'closeStation' }).code).toBe('SPILL');
    C({ type: 'mopSpill' });
    expect(C({ type: 'closeStation' }).ok).toBe(true);
  });

  it('sin EPP no se opera; la reanudación apaga la bomba, para el cronómetro y devuelve el desviador', () => {
    const w0 = h.worldF12();
    expect(h.cmdF12(w0, { type: 'setPump', on: true }).code).toBe('PPE');
    const w = ready();
    flowAt(w, 0.45);
    h.cmdF12(w, { type: 'moveBeaker', to: 'outlet' });
    h.cmdF12(w, { type: 'setDiverter', to: 'beaker' });
    h.cmdF12(w, { type: 'timer', action: 'start' });
    h.runF12(w, 0.3);
    expect(busyF12(w)).toBe(true);
    sanitizeOnResumeF12(w);
    expect(busyF12(w)).toBe(false);
    const v = w.collect.beakerVol;
    h.runF12(w, 2);
    expect(w.collect.beakerVol).toBeCloseTo(v, 6);
  });

  it('el cierre exige bomba detenida, vaso vacío en la mesada, purga cerrada y tapón fuera', () => {
    const w = ready();
    const { W, C, Rn } = io(w);
    collect(w, { s: 0.5, leave: true });
    h.stopPump(W, C, Rn);
    expect(C({ type: 'closeStation' }).code).toBe('BEAKER_FULL');
    C({ type: 'moveBeaker', to: 'bench' });
    C({ type: 'emptyBeaker' });
    C({ type: 'setPurge', open: true });
    expect(C({ type: 'closeStation' }).code).toBe('PURGE_OPEN');
    C({ type: 'setPurge', open: false });
    Rn(1);
    C({ type: 'mopSpill' });
    expect(C({ type: 'closeStation' }).ok).toBe(true);
  });
});
