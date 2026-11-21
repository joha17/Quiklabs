/**
 * F11 — recorridos completos sin escena (§17, matriz «Integración»): ruta ideal por comandos hasta la entrega con la
 * máquina por etapas y la evaluación, en modo realista y curricular y con varias semillas; los 40 errores
 * F11-E01…E40 con su disparador y su consecuencia causal; los 12 escenarios docentes; seguridad y reanudación.
 */
import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import type { F11World, ReadingF11 } from '../../simulation/f11-world/types';
import type { F11Command } from '../../simulation/f11-world/commands';
import { SF11, busyF11, tankFluidF11, tankLevel } from '../../simulation/f11-world/world';
import { conservedTotalsF11 } from '../../simulation/f11-world/conservation';
import { emptyF11Notebook, type F11Notebook } from '../../practices/practice-f11/notebook';
import { f11StageEvidence } from '../../practices/practice-f11/evidence';
import { practiceF11Machine, f11StageName } from '../../practices/practice-f11/workflow.machine';
import { F11_WEIGHTS, evaluateF11, notebookIssuesF11 } from '../../practices/practice-f11/rubric';
import { SIMULATED_ERRORS_F11, F11_SCENARIOS, errKeyF11 } from '../../practices/practice-f11/error-scenarios';
import { sanitizeOnResumeF11 } from '../../practices/practice-f11/resume';
import { expectedBuoyF11, expectedCalcF11, expectedFloatF11, expectedPRowF11 } from '../../practices/practice-f11/expected-results';
import esF11 from '../../locales/es/practiceF11.json';
import * as h from '../helpersF11';

const ev = (w: F11World, k: string) => w.evidence[`err:${k}`] ?? 0;
const R = (w: F11World, r: { id?: string }): ReadingF11 => w.readings[r.id!];
const DEG = Math.PI / 180;

function ideal(seed = 111, scenarios: string[] = [], mode?: 'CURRICULAR' | 'REALISTIC') {
  const r = h.idealRouteF11(seed, scenarios as never, mode);
  return { ...r, nb: h.fillNotebookF11(r.w, r.ids) };
}

/** Atajos con la firma de la ruta (mundo diferido, comando, avance). */
const io = (w: F11World) => ({ W: () => w, C: (c: F11Command) => h.cmdF11(w, c), Rn: (s: number) => h.runF11(w, s) });
const errsOf = (w: F11World) => Object.keys(w.evidence).filter((k) => k.startsWith('err:') && w.evidence[k] > 0);

describe('F11 — ruta ideal', () => {
  it('cumple las etapas por evidencia y llega a COMPLETE sin errores', () => {
    const { w, nb } = ideal();
    const flags = f11StageEvidence(w, nb);
    expect(Object.entries(flags).filter(([, v]) => !v).map(([k]) => k)).toEqual([]);
    const actor = createActor(practiceF11Machine).start();
    actor.send({ type: 'START' });
    actor.send({ type: 'PPE_CONFIRMED' });
    expect(f11StageName(actor.getSnapshot().value)).toBe('CALIBRATE');
    actor.send({ type: 'EVIDENCE', flags });
    expect(f11StageName(actor.getSnapshot().value)).toBe('COMPLETE');
    expect(errsOf(w)).toEqual([]);
    expect(notebookIssuesF11(w, nb)).toEqual([]);
  });

  it('la evaluación da el máximo automático (las respuestas abiertas quedan a revisión)', () => {
    const { w, nb } = ideal();
    const e = evaluateF11(w, nb);
    expect(Object.values(F11_WEIGHTS).reduce((s, x) => s + x, 0)).toBeCloseTo(1, 12);
    for (const c of e.components.filter((x) => x.id !== 'analysis')) expect(c.score, c.id).toBe(1);
    expect(e.total).toBeGreaterThan(0.95);
    expect(e.needsTeacherReview.length).toBeGreaterThan(0);
  });

  it('la máquina no avanza sin evidencia (no hay evento «Siguiente»)', () => {
    const w = h.worldF11();
    for (const item of ['coat', 'goggles', 'shoes', 'hair'] as const) h.cmdF11(w, { type: 'equipPpe', item, on: true });
    h.cmdF11(w, { type: 'startWork' });
    const actor = createActor(practiceF11Machine).start();
    actor.send({ type: 'START' });
    actor.send({ type: 'PPE_CONFIRMED' });
    actor.send({ type: 'EVIDENCE', flags: f11StageEvidence(w, h.fillNotebookF11(w, h.emptyRouteIdsF11())) });
    expect(f11StageName(actor.getSnapshot().value)).toBe('CALIBRATE');
  });

  it.each([7, 2024, 99991])('semilla %i: ρ del agua y de la salmuera, empuje ≈ agua rebosada y calados ≈ ρ_obj/ρ_líq', (seed) => {
    const { w, nb } = ideal(seed);
    const ec = expectedCalcF11(w, nb);
    expect(Math.abs(ec.rhoA / w.params.rhoA - 1)).toBeLessThan(0.02);
    expect(Math.abs(ec.rhoB / w.params.rhoB - 1)).toBeLessThan(0.02);
    expect(Math.abs(ec.rhoCyl / w.params.rhoB - 1)).toBeLessThan(0.02);
    expect(Math.abs(ec.FbDev)).toBeLessThan(3);
    for (const row of nb.floatRows) {
      const e = expectedFloatF11(w, nb, row);
      if (e.fPred < 0.95) expect(Math.abs(e.fMeas - e.fPred)).toBeLessThan(0.04);
    }
    expect(notebookIssuesF11(w, nb)).toEqual([]);
  });

  it('modo curricular: ρ = 1000 kg/m³ exacta en la resolución y el empuje coincide con el agua rebosada', () => {
    const { w, nb } = ideal(111, [], 'CURRICULAR');
    expect(w.params.rhoA).toBe(1000);
    for (const row of nb.pARows) {
      const e = expectedPRowF11(w, nb, row, 'A');
      expect(Math.abs(e.p - 1000 * 9.81 * e.h)).toBeLessThan(12);
    }
    const ec = expectedCalcF11(w, nb);
    expect(Math.abs(ec.rhoA - 1000)).toBeLessThan(6);
    expect(Math.abs(ec.FbDev)).toBeLessThan(1.5);
    for (const row of nb.buoyRows) {
      const e = expectedBuoyF11(w, nb, row);
      expect(Math.abs(e.Fb - e.FbPred)).toBeLessThan(0.03);
    }
  });

  it('conserva el líquido (lo aportado por la canilla se descuenta) y las masas', () => {
    for (const mode of ['CURRICULAR', 'REALISTIC'] as const) {
      const { w } = ideal(111, [], mode);
      const t = conservedTotalsF11(w);
      expect(t.liquidCm3).toBeCloseTo(w.initialTotals.liquidCm3, 3);
      expect(t.massesG).toBeCloseTo(w.initialTotals.massesG, 9);
    }
  });
});

// ─────────────────────────── 40 errores ───────────────────────────

type Fixture = () => { w: F11World; nb?: F11Notebook; check?: (w: F11World, nb?: F11Notebook) => void };

const base = (opts: Parameters<typeof h.worldF11>[0] = {}) => {
  const w = h.worldF11(opts);
  for (const item of ['coat', 'goggles', 'shoes', 'hair'] as const) h.cmdF11(w, { type: 'equipPpe', item, on: true });
  h.cmdF11(w, { type: 'startWork' });
  return w;
};

type TankOpts = Parameters<typeof h.worldF11>[0] & {
  lock?: boolean; connect?: boolean; calibrate?: boolean; zero?: boolean; range?: number; rate?: number; gx?: number; mount?: boolean;
};

/** Tanque lleno de agua y sonda montada en la guía (como la ruta), con interruptores para dejar una parte sin hacer. */
const tankReady = (opts: TankOpts = {}) => {
  const w = base(opts);
  const { W, C, Rn } = io(w);
  if (w.valves.agitator) C({ type: 'setAgitator', on: false });
  h.fillTo(W, C, Rn, 'setTap', w.params.fillCm);
  C({ type: 'setGuide', xCm: opts.gx ?? 30 });
  if (opts.lock ?? true) C({ type: 'lockGuide', on: true });
  if (opts.connect ?? true) C({ type: 'connectProbe', on: true });
  if (!w.probe.absolute) C({ type: 'setRange', idx: opts.range ?? 1 });
  C({ type: 'setRate', hz: opts.rate ?? 20 });
  if (opts.calibrate ?? true) C({ type: 'calibrateProbe' });
  if ((opts.zero ?? true) && !w.probe.absolute) C({ type: 'zeroProbe' });
  if (opts.mount ?? true) C({ type: 'mountProbe', where: 'guide' });
  C({ type: 'newSeries' });
  h.waitCalm(W, Rn);
  return w;
};

/** Baja la membrana a la cota z, purga si hace falta, espera y lee la sonda. */
const readAt = (w: F11World, z: number, waitS = 3, purge = true) => {
  const { C, Rn } = io(w);
  C({ type: 'setProbeZ', zCm: z });
  Rn(0.3);
  if (purge && w.probe.bubble) C({ type: 'purgeProbe' });
  Rn(waitS);
  return R(w, C({ type: 'readProbe' }));
};

/** Bloque de aluminio colgado del dinamómetro (en cero salvo que se pida). */
const hung = (opts: Parameters<typeof h.worldF11>[0] & { zero?: boolean; aim?: number } = {}) => {
  const w = base(opts);
  const { C, Rn } = io(w);
  if (opts.zero ?? true) C({ type: 'zeroDyn' });
  if (opts.aim) C({ type: 'aimDyn', deg: opts.aim });
  C({ type: 'hangBlock' });
  Rn(2);
  return w;
};

const nbWith = (mut: (nb: F11Notebook, w: F11World, ids: h.RouteIdsF11) => void, seed = 111, scenarios: string[] = []) => {
  const { w, nb, ids } = ideal(seed, scenarios);
  mut(nb, w, ids);
  return { w, nb };
};

const readDyn = (w: F11World) => R(w, h.cmdF11(w, { type: 'readDyn', viewDeg: 0 }));

const FIXTURES: Record<string, Fixture> = {
  E01: () => {
    const w = tankReady({ zero: false });
    const r = readAt(w, 20);
    return { w, check: () => {
      expect(r.qualityFlags).toContain('NO_ZERO');
      expect(Math.abs(r.value - r.trueValue)).toBeGreaterThan(0.1);
    } };
  },
  E02: () => nbWith((nb, w) => (nb.pARows[1].h = expectedPRowF11(w, nb, nb.pARows[1], 'A').hFromBottom.toFixed(4))),
  E03: () => {
    const w = tankReady({ scenarios: [SF11.BUBBLE] });
    const r = readAt(w, 20, 3, false);
    return { w, check: () => {
      expect(r.qualityFlags).toContain('BUBBLE');
      expect(r.value).toBeLessThan(r.trueValue);
    } };
  },
  E04: () => {
    const w = tankReady({ gx: 0 });
    const r = readAt(w, 20);
    return { w, check: () => expect(r.qualityFlags).toContain('WALL') };
  },
  E05: () => {
    const w = base();
    const { W, C, Rn } = io(w);
    h.fillTo(W, C, Rn, 'setTap', 20);
    h.fillTo(W, C, Rn, 'setPump', 30);
    return { w, check: () => expect(tankFluidF11(w)).toBe('mix') };
  },
  E06: () => nbWith((nb, w) => (nb.pARows[2].p = expectedPRowF11(w, nb, nb.pARows[2], 'A').pNoP0.toFixed(0)), 111, [SF11.ABSOLUTE]),
  E07: () => nbWith((nb, w) => {
    const row = nb.buoyRows.find((r) => expectedBuoyF11(w, nb, r).partial)!;
    row.FbPred = expectedBuoyF11(w, nb, row).FbPredTotal.toFixed(4);
  }),
  E08: () => {
    const w = hung();
    const { W, C, Rn } = io(w);
    C({ type: 'primeCan' });
    Rn(5);
    C({ type: 'setStand', cm: 0 });
    h.waitStand(W, Rn);
    const r = readDyn(w);
    return { w, check: () => {
      expect(r.qualityFlags).toContain('ON_BOTTOM');
      expect(r.value).toBeLessThan(0.5 * r.trueValue + 1);
    } };
  },
  E09: () => {
    const w = tankReady();
    const { W, C, Rn } = io(w);
    C({ type: 'releaseObject', id: 'float1', xCm: 18 });
    h.waitFloats(W, Rn);
    const r = R(w, C({ type: 'readDraft', id: 'float1', viewDeg: 0 }));
    return { w, check: () => expect(r.qualityFlags).toContain('TETHERED') };
  },
  E10: () => {
    const w = base();
    const { C } = io(w);
    C({ type: 'tareBalance' });
    C({ type: 'fillCylinder' });
    C({ type: 'placeOnBalance', item: 'cyl' });
    const r = R(w, C({ type: 'readBalance' }));
    return { w, check: () => {
      expect(r.qualityFlags).toContain('NOT_TARED');
      expect(r.value - r.trueValue).toBeGreaterThan(100);
    } };
  },
  E11: () => {
    const w = base();
    const { C, Rn } = io(w);
    C({ type: 'setTap', on: true });
    for (let i = 0; i < 2000 && !w.safety.block; i++) Rn(0.25);
    return { w, check: () => {
      expect(w.safety.block?.code).toBe('TANK_SPILL');
      expect(w.spill.A).toBeGreaterThan(1);
      expect(evaluateF11(w, emptyF11Notebook()).components.find((c) => c.id === 'safety')!.score).toBeLessThan(1);
    } };
  },
  E12: () => {
    const w = tankReady();
    const { C, Rn } = io(w);
    C({ type: 'setProbeZ', zCm: 20 });
    Rn(3);
    C({ type: 'releaseObject', id: 'alu1', xCm: 50 });
    Rn(0.3);
    const r = R(w, C({ type: 'readProbe' }));
    return { w, check: () => expect(r.qualityFlags).toContain('WAVES') };
  },
  E13: () => nbWith((nb, w) => (nb.floatRows[0].rho = expectedFloatF11(w, nb, nb.floatRows[0]).rhoAsMass.toFixed(1))),
  E14: () => {
    const w = tankReady();
    const { C, Rn } = io(w);
    readAt(w, 20);
    C({ type: 'setDrain', on: true });
    Rn(10);
    C({ type: 'setDrain', on: false });
    C({ type: 'setPump', on: true });
    Rn(10);
    C({ type: 'setPump', on: false });
    Rn(20);
    const r = readAt(w, 20);
    return { w, check: () => expect(r.qualityFlags).toContain('RHO_CHANGED') };
  },
  E15: () => {
    const w = tankReady();
    const { W, C, Rn } = io(w);
    C({ type: 'setProbeZ', zCm: 44 });
    C({ type: 'releaseObject', id: 'float1', xCm: 18 });
    C({ type: 'untieThread', id: 'float1' });
    h.waitFloats(W, Rn);
    C({ type: 'releaseObject', id: 'bottle1', xCm: 18 });
    C({ type: 'untieThread', id: 'bottle1' });
    h.waitFloats(W, Rn);
    const r = R(w, C({ type: 'readDraft', id: 'bottle1', viewDeg: 0 }));
    return { w, check: () => expect(r.qualityFlags).toContain('STACKED') };
  },
  E16: () => nbWith((nb, w) => (nb.buoyRows[1].Fb = expectedBuoyF11(w, nb, nb.buoyRows[1]).FbNeg.toFixed(3))),
  E17: () => {
    const w = tankReady();
    const r = h.cmdF11(w, { type: 'releaseObject', id: 'float1', xCm: -4 });
    return { w, check: () => {
      expect(r.ok).toBe(true);
      expect(w.floats.float1.where).toBe('bench');
    } };
  },
  E18: () => {
    const w = base({ scenarios: [SF11.PROFILE] });
    const { W, C, Rn } = io(w);
    const ids = h.emptyRouteIdsF11();
    h.calibrateRoute(W, C, Rn, ids);
    h.depthRoute(W, C, Rn, ids);
    h.drainTank(W, C, Rn);
    h.fillTo(W, C, Rn, 'setPump', w.params.fillCm);
    h.waitCalm(W, Rn);
    ids.LB = C({ type: 'readLevel', viewDeg: 0 }).id ?? '';
    C({ type: 'newSeries' });
    for (const z of [37, 32, 22, 12, 2]) h.readDepth(W, C, Rn, z, ids.pBp, ids.pBz);
    const nb = h.fillNotebookF11(w, ids);
    return { w, nb, check: () => expect(w.readings[ids.pBp[0]].qualityFlags).toContain('STRATIFIED') };
  },
  E19: () => {
    const w = hung();
    const { C, Rn } = io(w);
    C({ type: 'setStand', cm: 12 });
    Rn(0.5);
    const r = readDyn(w);
    return { w, check: () => expect(r.qualityFlags).toContain('MOVING') };
  },
  E20: () => {
    const w = tankReady();
    const { C, Rn } = io(w);
    C({ type: 'mountProbe', where: 'holder' });
    C({ type: 'releaseObject', id: 'float1', xCm: 18 });
    C({ type: 'untieThread', id: 'float1' });
    Rn(3);
    const r = C({ type: 'closeStation' });
    return { w, check: () => {
      expect(r.code).toBe('ITEMS_OUT');
      expect(w.evidence.stationClosed).toBeUndefined();
    } };
  },
  E21: () => {
    const w = hung({ zero: false });
    const r = readDyn(w);
    return { w, check: () => {
      expect(r.qualityFlags).toContain('NOT_ZEROED');
      expect(Math.abs(r.value - r.trueValue)).toBeGreaterThan(0.01);
    } };
  },
  E22: () => {
    const w = tankReady({ range: 0 });
    const r = readAt(w, 10);
    return { w, check: () => {
      expect(r.qualityFlags).toContain('CLIPPED');
      expect(r.value).toBeLessThan(r.trueValue);
    } };
  },
  E23: () => {
    const w = tankReady({ connect: false });
    const r = readAt(w, 20);
    return { w, check: () => {
      expect(r.qualityFlags).toContain('UNPLUGGED');
      expect(Number.isNaN(r.value)).toBe(true);
    } };
  },
  E24: () => {
    const w = tankReady({ rate: 5 });
    const r = readAt(w, 20);
    return { w, check: () => expect(r.qualityFlags).toContain('LOW_RATE') };
  },
  E25: () => {
    const w = tankReady({ gx: 3 });
    const r = R(w, h.cmdF11(w, { type: 'readLevel', viewDeg: 0 }));
    return { w, check: () => {
      expect(r.qualityFlags).toContain('OCCLUDED');
      expect(r.value - r.trueValue).toBeGreaterThan(0.2);
    } };
  },
  E26: () => {
    const w = hung({ aim: 12 });
    const r = readDyn(w);
    return { w, check: () => {
      expect(r.qualityFlags).toContain('OBLIQUE');
      expect(r.value / r.trueValue).toBeCloseTo(Math.cos(12 * DEG), 1);
    } };
  },
  E27: () => {
    const w = tankReady({ scenarios: [SF11.UNCAL], calibrate: false });
    const r = readAt(w, 2);
    return { w, check: () => {
      expect(r.qualityFlags).toContain('UNCALIBRATED');
      expect(r.value / r.trueValue).toBeGreaterThan(1.04);
    } };
  },
  E28: () => {
    const w = tankReady({ lock: false });
    const { C, Rn } = io(w);
    C({ type: 'setProbeZ', zCm: 20 });
    Rn(6);
    const r = R(w, C({ type: 'readProbe' }));
    return { w, check: () => {
      expect(r.qualityFlags).toContain('DRIFT');
      expect(w.probe.z).toBeLessThan(20);
    } };
  },
  E29: () => {
    const w = tankReady();
    const r = R(w, h.cmdF11(w, { type: 'readLevel', viewDeg: 18 }));
    return { w, check: () => expect(r.qualityFlags).toContain('PARALLAX') };
  },
  E30: () => {
    const w = tankReady();
    const { C } = io(w);
    C({ type: 'setProbeZ', zCm: 10 });
    const r = R(w, C({ type: 'readProbe' }));
    return { w, check: () => expect(r.qualityFlags).toContain('UNSTABLE') };
  },
  E31: () => nbWith((nb) => (nb.setup.LA.readingId = null)),
  E32: () => {
    const w = tankReady();
    readAt(w, 20);
    const r = h.cmdF11(w, { type: 'setRate', hz: 50 });
    const r2 = readAt(w, 20);
    return { w, check: () => {
      expect(r.ok).toBe(true);
      expect(r2.qualityFlags).toContain('CONFIG_CHANGED');
    } };
  },
  E33: () => nbWith((nb) => (nb.pARows[0].zId = nb.pARows[1].zId)),
  E34: () => nbWith((nb) => (nb.pARows[2].p = String(Number(nb.pARows[2].p) / 1000))),
  E35: () => nbWith((nb, w) => {
    const row = nb.pARows.find((r) => expectedPRowF11(w, nb, r, 'A').roundedDiffers);
    expect(row).toBeTruthy();
    row!.h = expectedPRowF11(w, nb, row!, 'A').hRounded.toFixed(2);
  }),
  E36: () => nbWith((nb, w) => (nb.calc.rhoA.value = expectedCalcF11(w, nb).invA.toPrecision(5))),
  E37: () => nbWith((nb) => (nb.pARows[4] = { pId: null, zId: null, h: '', p: '' })),
  E38: () => nbWith((nb, w) => (nb.calc.rhoA.uncertainty = (expectedCalcF11(w, nb).uBA / 10).toPrecision(2))),
  E39: () => {
    const w = tankReady();
    const { C } = io(w);
    C({ type: 'setProbeZ', zCm: 0 });
    const r = readAt(w, 20);
    return { w, check: () => {
      expect(w.probe.damaged).toBe(true);
      expect(r.qualityFlags).toContain('POST_IMPACT');
    } };
  },
  E40: () => {
    const w = base();
    h.cmdF11(w, { type: 'setTap', on: true });
    const r = h.cmdF11(w, { type: 'closeStation' });
    return { w, check: () => {
      expect(r.code).toBe('NOT_SAFE');
      expect(w.evidence.stationClosed).toBeUndefined();
    } };
  },
};

describe('F11 — los 40 errores simulables', () => {
  it('el catálogo tiene 40 códigos, 20 + 20, con contrato completo y texto de retroalimentación', () => {
    expect(SIMULATED_ERRORS_F11).toHaveLength(40);
    expect(SIMULATED_ERRORS_F11.filter((e) => e.group === 'EXPERIMENTAL')).toHaveLength(20);
    const fb = (esF11 as { f11fb: Record<string, string> }).f11fb;
    for (const e of SIMULATED_ERRORS_F11) {
      expect(e.trigger && e.effect && e.fixture, e.id).toBeTruthy();
      expect(fb[errKeyF11(e)], e.id).toBeTruthy();
    }
  });

  it.each(SIMULATED_ERRORS_F11.map((e) => [e.id, e] as const))('%s: disparador → evidencia y consecuencia', (_id, e) => {
    const key = errKeyF11(e);
    const fx = FIXTURES[key]();
    if (e.evidenceKey.startsWith('err:')) expect(ev(fx.w, key), e.id).toBeGreaterThan(0);
    else expect(notebookIssuesF11(fx.w, fx.nb ?? emptyF11Notebook())).toContain(`nb:${key}`);
    fx.check?.(fx.w, fx.nb);
  });
});

describe('F11 — escenarios docentes', () => {
  it.each(F11_SCENARIOS)('%s permite terminar por una ruta válida', (s) => {
    const { w, nb } = ideal(111, [s]);
    const flags = f11StageEvidence(w, nb);
    expect(Object.entries(flags).filter(([, v]) => !v).map(([k]) => k)).toEqual([]);
    expect(notebookIssuesF11(w, nb)).toEqual([]);
    expect(errsOf(w)).toEqual([]);
  });

  it('S02 cambia el agua por agua de mar; S03 y S04 cambian el bloque (el de S04 se hunde)', () => {
    const { w, nb } = ideal(111, [SF11.SALINE]);
    expect(Math.abs(expectedCalcF11(w, nb).rhoA / 1025 - 1)).toBeLessThan(0.02);
    expect(h.worldF11({ scenarios: [SF11.FLOATING] }).params.block.rho).toBe(450);
    const s4 = ideal(111, [SF11.SINKING]);
    expect(s4.w.params.block.rho).toBe(1400);
    expect(s4.w.readingOrder.map((id) => s4.w.readings[id]).some((r) => r.kind === 'draft' && r.target === 'float1' && r.qualityFlags.includes('SANK'))).toBe(true);
  });

  it('S05 arma la burbuja; S07 corre el cero; S08 es absoluta; S12 descalibra la sonda', () => {
    expect(h.worldF11({ scenarios: [SF11.BUBBLE] }).probe.bubbleArmed).toBe(true);
    expect(Math.abs(h.worldF11({ scenarios: [SF11.GAUGE] }).probe.offset)).toBeGreaterThan(0.3);
    const abs = h.worldF11({ scenarios: [SF11.ABSOLUTE] });
    expect(abs.probe.absolute).toBe(true);
    expect(h.cmdF11(abs, { type: 'zeroProbe' }).ok).toBe(false);
    expect(h.worldF11({ scenarios: [SF11.UNCAL] }).probe.scale).toBe(1.08);
  });

  it('S06 agrega el tubo de rebose (el agua sobrante no cae a la mesada); S09 sumerge el bloque solo en parte; S10 estratifica; S11 enciende el agitador', () => {
    const s6 = base({ scenarios: [SF11.OVERFLOW] });
    expect(s6.tank.overflowPipe).toBe(true);
    h.cmdF11(s6, { type: 'setTap', on: true });
    h.runF11(s6, 60);
    expect(s6.safety.block).toBeNull();
    expect(s6.overflow.A).toBeGreaterThan(1);
    const s9 = ideal(111, [SF11.PARTIAL]);
    expect(s9.nb.buoyRows.every((r) => expectedBuoyF11(s9.w, s9.nb, r).partial)).toBe(true);
    const s10 = base({ scenarios: [SF11.PROFILE] });
    h.fillTo(io(s10).W, io(s10).C, io(s10).Rn, 'setPump', 20);
    expect(s10.tank.strat).toBeGreaterThan(0.5);
    expect(h.worldF11({ scenarios: [SF11.STIRRED] }).valves.agitator).toBe(true);
  });
});

describe('F11 — seguridad y reanudación', () => {
  it('el tanque desbordado bloquea hasta cerrar la canilla y secar la mesada', () => {
    const w = FIXTURES.E11().w;
    const { C, Rn } = io(w);
    expect(C({ type: 'readLevel', viewDeg: 0 }).code).toBe('BLOCKED');
    expect(C({ type: 'acknowledge' }).code).toBe('SECURE_FIRST');
    C({ type: 'setTap', on: false });
    C({ type: 'setDrain', on: true });
    Rn(5);
    C({ type: 'setDrain', on: false });
    expect(C({ type: 'acknowledge' }).code).toBe('SECURE_FIRST');
    C({ type: 'mopSpill' });
    expect(C({ type: 'acknowledge' }).ok).toBe(true);
    expect(C({ type: 'readLevel', viewDeg: 0 }).ok).toBe(true);
  });

  it('sin EPP no se opera; la reanudación cierra las llaves, detiene el brazo y calma la superficie', () => {
    const w0 = h.worldF11();
    expect(h.cmdF11(w0, { type: 'setTap', on: true }).code).toBe('PPE');
    const w = hung();
    const { C, Rn } = io(w);
    C({ type: 'setTap', on: true });
    C({ type: 'setStand', cm: 5 });
    Rn(1);
    expect(busyF11(w)).toBe(true);
    const L = tankLevel(w);
    sanitizeOnResumeF11(w);
    expect(busyF11(w)).toBe(false);
    Rn(2);
    expect(tankLevel(w)).toBeCloseTo(L, 6);
  });

  it('el cierre exige llaves cerradas, objetos en el estante, la sonda en su porta-sonda y la mesada seca', () => {
    const w = tankReady();
    const { C, Rn } = io(w);
    C({ type: 'setAgitator', on: true });
    expect(C({ type: 'closeStation' }).code).toBe('NOT_SAFE');
    C({ type: 'setAgitator', on: false });
    expect(C({ type: 'closeStation' }).code).toBe('PROBE_OUT');
    C({ type: 'mountProbe', where: 'holder' });
    C({ type: 'placeCatch', at: 'spout' });
    expect(C({ type: 'closeStation' }).code).toBe('CATCH_OUT');
    C({ type: 'placeCatch', at: 'rack' });
    Rn(1);
    expect(C({ type: 'closeStation' }).ok).toBe(true);
  });
});
