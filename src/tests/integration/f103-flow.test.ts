/**
 * F103 — recorridos completos sin escena (§17, matriz «Integración»): ruta ideal por comandos hasta la entrega con la
 * máquina por etapas y la evaluación, en modo realista y curricular y con varias semillas; los 40 errores
 * F103-E01…E40 con su disparador y su consecuencia causal; los 12 escenarios docentes; seguridad y reanudación.
 */
import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import type { F103World, ReadingF3 } from '../../simulation/f103-world/types';
import type { F103Command } from '../../simulation/f103-world/commands';
import { SF3 } from '../../simulation/f103-world/world';
import { conservedTotalsF103, energyResidualJ } from '../../simulation/f103-world/conservation';
import { emptyF103Notebook, type F103Notebook } from '../../practices/practice-f103/notebook';
import { f103StageEvidence } from '../../practices/practice-f103/evidence';
import { practiceF103Machine, f103StageName } from '../../practices/practice-f103/workflow.machine';
import { F103_WEIGHTS, evaluateF103, notebookIssuesF103 } from '../../practices/practice-f103/rubric';
import { SIMULATED_ERRORS_F103, F103_SCENARIOS, errKeyF3 } from '../../practices/practice-f103/error-scenarios';
import { sanitizeOnResumeF103 } from '../../practices/practice-f103/resume';
import { expectedRanges, expectedTrajectory, expectedVelocity } from '../../practices/practice-f103/expected-results';
import esF103 from '../../locales/es/practiceF103.json';
import { GEOF103 } from '../../simulation/f103-world/geometry';
import * as h from '../helpersF103';

const ev = (w: F103World, k: string) => w.evidence[`err:${k}`] ?? 0;
const R = (w: F103World, r: { id?: string }): ReadingF3 => w.readings[r.id!];
const fmt = (v: number, d = 4) => v.toFixed(d);

function ideal(seed = 103, scenarios: string[] = [], mode?: 'CURRICULAR' | 'REALISTIC') {
  const r = h.idealRouteF3(seed, scenarios as never, mode);
  return { ...r, nb: h.fillNotebookF3(r.w, r.ids) };
}

/** Atajos con la firma de la ruta (mundo diferido, comando, avance). */
const io = (w: F103World) => ({ W: () => w, C: (c: F103Command) => h.cmdF3(w, c), Rn: (s: number) => h.runF3(w, s) });

describe('F103 — ruta ideal', () => {
  it('cumple las etapas por evidencia y llega a COMPLETE sin errores', () => {
    const { w, nb } = ideal();
    const flags = f103StageEvidence(w, nb);
    expect(Object.entries(flags).filter(([, v]) => !v).map(([k]) => k)).toEqual([]);
    const actor = createActor(practiceF103Machine).start();
    actor.send({ type: 'START' });
    actor.send({ type: 'PPE_CONFIRMED' });
    expect(f103StageName(actor.getSnapshot().value)).toBe('SETUP');
    actor.send({ type: 'EVIDENCE', flags });
    expect(f103StageName(actor.getSnapshot().value)).toBe('COMPLETE');
    expect(Object.keys(w.evidence).filter((k) => k.startsWith('err:') && w.evidence[k] > 0)).toEqual([]);
    expect(notebookIssuesF103(w, nb)).toEqual([]);
  });

  it('la evaluación da el máximo automático (las respuestas abiertas quedan a revisión)', () => {
    const { w, nb } = ideal();
    const e = evaluateF103(w, nb);
    expect(Object.values(F103_WEIGHTS).reduce((s, x) => s + x, 0)).toBeCloseTo(1, 12);
    for (const c of e.components.filter((x) => x.id !== 'analysis')) expect(c.score, c.id).toBe(1);
    expect(e.total).toBeGreaterThan(0.95);
    expect(e.needsTeacherReview.length).toBeGreaterThan(0);
  });

  it('la máquina no avanza sin evidencia (no hay evento «Siguiente»)', () => {
    const w = h.worldF3();
    for (const item of ['coat', 'goggles', 'shoes', 'hair'] as const) h.cmdF3(w, { type: 'equipPpe', item, on: true });
    h.cmdF3(w, { type: 'startWork' });
    const actor = createActor(practiceF103Machine).start();
    actor.send({ type: 'START' });
    actor.send({ type: 'PPE_CONFIRMED' });
    actor.send({ type: 'EVIDENCE', flags: f103StageEvidence(w, h.fillNotebookF3(w, h.emptyRouteIdsF3())) });
    expect(f103StageName(actor.getSnapshot().value)).toBe('SETUP');
  });

  it.each([7, 2024, 99991])('semilla %i: v₀, alcances y ajuste coherentes con las lecturas propias', (seed) => {
    const { w, nb } = ideal(seed);
    const v = expectedVelocity(w, nb);
    expect(v.v0Mean).toBeGreaterThan(2);
    expect(v.v0Mean).toBeLessThan(8);
    const r = expectedRanges(w, nb);
    // Con aire, el alcance medido queda algo por debajo de la parábola sin aire, pero cerca.
    expect(r.rangeErr).toBeLessThan(1);
    expect(r.rangeErr).toBeGreaterThan(-8);
    const t = expectedTrajectory(w, nb);
    expect(t.pts).toHaveLength(4);
    expect(Math.abs(t.fit.v0 - v.v0Mean) / v.v0Mean).toBeLessThan(0.08);
    expect(evaluateF103(w, nb).components.find((c) => c.id === 'modelling')!.score).toBe(1);
  });

  it('modo curricular: sin aire, el alcance medido coincide con la parábola y el ajuste devuelve θ y v₀', () => {
    const { w, nb } = ideal(103, [], 'CURRICULAR');
    expect(Math.abs(expectedRanges(w, nb).rangeErr)).toBeLessThan(1.5);
    const t = expectedTrajectory(w, nb);
    expect(Math.abs(t.fit.thetaDeg - 35)).toBeLessThan(2);
    expect(evaluateF103(w, nb).components.find((c) => c.id === 'execution')!.score).toBe(1);
  });

  it('conserva el inventario de esferas y cierra el balance de energía', () => {
    const { w } = ideal(103, [], 'CURRICULAR');
    const t = conservedTotalsF103(w);
    expect(t.massesG).toBeCloseTo(w.initialTotals.massesG, 9);
    expect(t.balls).toBe(w.initialTotals.balls);
    expect(Math.abs(energyResidualJ(w))).toBeLessThan(1e-3);
    const r = ideal(103);
    expect(Math.abs(energyResidualJ(r.w))).toBeLessThan(1e-3);
  });
});

// ─────────────────────────── 40 errores ───────────────────────────

type Fixture = () => { w: F103World; nb?: F103Notebook; check?: (w: F103World, nb?: F103Notebook) => void };

const base = (opts: Parameters<typeof h.worldF3>[0] = {}) => {
  const w = h.worldF3(opts);
  for (const item of ['coat', 'goggles', 'shoes', 'hair'] as const) h.cmdF3(w, { type: 'equipPpe', item, on: true });
  h.cmdF3(w, { type: 'startWork' });
  return w;
};

/** Estación lista para disparar: anclada y nivelada, interfaz conectada, barrera cerrada y protector fuera. */
const ready = (opts: Parameters<typeof h.worldF3>[0] & { anchor?: boolean; calibrate?: boolean; connectGate?: boolean; align?: boolean } = {}) => {
  const w = base(opts);
  const { C, Rn } = io(w);
  if (opts.anchor ?? true) {
    C({ type: 'anchorStand', on: true });
    h.levelStand(C, Rn);
  }
  C({ type: 'setAngle', deg: 0 });
  Rn(2);
  C({ type: 'zeroProtractor' });
  if (opts.align ?? true) {
    C({ type: 'dropPlumb' });
    C({ type: 'alignTape' });
  }
  C({ type: 'mountGate', on: true });
  if (opts.connectGate ?? true) C({ type: 'connect', target: 'gate', on: true });
  C({ type: 'connect', target: 'platform', on: true });
  C({ type: 'setTimerRate', hz: 100000 });
  C({ type: 'setClockRange', range: 'long' });
  if (opts.calibrate ?? true) C({ type: 'calibratePlatform' });
  C({ type: 'moveScreen', xCm: Math.round(w.launcher.x * 1000) / 10 + 100, inLane: false });
  C({ type: 'closeBarrier', on: true });
  C({ type: 'setCap', on: false });
  return w;
};

/** v₀ con un disparo horizontal contra la pantalla segura (la ruta usa tres). */
const measureV0 = (w: F103World, ball = 'ballA') => {
  const { W, C, Rn } = io(w);
  const x0 = Math.round(w.launcher.x * 1000) / 10;
  C({ type: 'moveScreen', xCm: x0 + 70, inLane: true });
  const id = h.shoot(W, C, Rn, { ball, read: 'gate' }).id ?? '';
  C({ type: 'moveScreen', xCm: x0 + 100, inLane: false });
  return { id, v0: h.gateMeanF3(w, [id]) };
};

/** Ángulo leído y plataforma en la predicción, lista para un disparo de alcance. */
const aimed = (w: F103World, angle = 45, ball = 'ballA') => {
  const { C, Rn } = io(w);
  const { v0 } = measureV0(w, ball);
  h.setAndRead(C, Rn, angle);
  const t = h.platformTargetCm(w, v0, angle);
  C({ type: 'movePlatform', xCm: t.x, yCm: t.y });
  Rn(1.5);
  return v0;
};

const shootImpact = (w: F103World, ball = 'ballA') => {
  const { W, C, Rn } = io(w);
  return h.shoot(W, C, Rn, { ball, read: 'impact' });
};

/** Disparo sin esperar: carga, muesca y cordón; devuelve el control con la esfera en el aire. */
const launch = (w: F103World, ball = 'ballA', notch = h.ROUTE_NOTCH) => {
  h.cmdF3(w, { type: 'loadBall', ball });
  h.cmdF3(w, { type: 'cock', notch });
  const r = h.cmdF3(w, { type: 'fire' });
  h.runF3(w, 0.1);
  return r;
};

const nbWith = (mut: (nb: F103Notebook, w: F103World) => void, seed = 103, scenarios: string[] = []) => {
  const { w, nb } = ideal(seed, scenarios);
  mut(nb, w);
  return { w, nb };
};

/** Continúa un intento ya cerrado: protector fuera para volver a disparar. */
const reopen = (w: F103World) => {
  h.cmdF3(w, { type: 'setCap', on: false });
  return io(w);
};

const FIXTURES: Record<string, Fixture> = {
  E01: () => {
    const w = base();
    const x = w.launcher.x;
    h.cmdF3(w, { type: 'setAngle', deg: w.launcher.angleDeg + 15 });
    return { w, check: () => {
      expect(w.launcher.x).toBeLessThan(x);
      expect(w.launcher.yawDeg).not.toBe(0);
    } };
  },
  E02: () => {
    const w = ready();
    h.cmdF3(w, { type: 'setGateOffset', mm: 6 });
    const r = R(w, measureV0(w));
    return { w, check: () => expect(r.qualityFlags.some((f) => f === 'EDGE' || f === 'MISSED')).toBe(true) };
  },
  E03: () => {
    const w = ready();
    const before = w.energy.dissipatedJ;
    h.cmdF3(w, { type: 'cock', notch: 2 });
    h.cmdF3(w, { type: 'fire' });
    return { w, check: () => {
      expect(w.energy.dissipatedJ).toBeGreaterThan(before);
      expect(w.flight).toBeNull();
    } };
  },
  E04: () => nbWith((nb, w) => {
    const { W, C, Rn } = reopen(w);
    const x0 = Math.round(w.launcher.x * 1000) / 10;
    C({ type: 'setAngle', deg: 0 });
    Rn(2);
    C({ type: 'moveScreen', xCm: x0 + 70, inLane: true });
    for (let i = 0; i < 3; i++) nb.velocity[i].readingId = h.shoot(W, C, Rn, { notch: 3, read: 'gate' }).id ?? '';
  }),
  E05: () => nbWith((nb, w) => (nb.angles[0].Rpred = fmt(expectedRanges(w, nb).rows[0].RpredRad))),
  E06: () => {
    const w = ready();
    const r = R(w, h.cmdF3(w, { type: 'readHeight', mark: 'deck', viewDeg: 0 }));
    return { w, check: () => expect(r.qualityFlags).toContain('DECK') };
  },
  E07: () => {
    const w = ready();
    h.setAndRead(io(w).C, io(w).Rn, 45);
    h.cmdF3(w, { type: 'movePlatform', xCm: 650, yCm: GEOF103.lane.yc });
    h.runF3(w, 1.5);
    shootImpact(w);
    return { w, check: () => expect(w.lastShot?.firstOn).toBe('floor') };
  },
  E08: () => {
    const w = ready();
    h.cmdF3(w, { type: 'closeBarrier', on: false });
    h.cmdF3(w, { type: 'loadBall', ball: 'ballA' });
    h.cmdF3(w, { type: 'cock', notch: 2 });
    const r = h.cmdF3(w, { type: 'fire' });
    return { w, check: () => {
      expect(r.code).toBe('ZONE_OPEN');
      expect(w.safety.block?.code).toBe('ZONE_OPEN');
      expect(w.flight).toBeNull();
    } };
  },
  E09: () => nbWith((nb, w) => {
    const { W, C, Rn } = reopen(w);
    const x0 = Math.round(w.launcher.x * 1000) / 10;
    C({ type: 'setAngle', deg: 0 });
    Rn(2);
    C({ type: 'moveScreen', xCm: x0 + 70, inLane: true });
    C({ type: 'setFan', speed: 2, dir: 'head' });
    Rn(1);
    nb.velocity[2].readingId = h.shoot(W, C, Rn, { read: 'gate' }).id ?? '';
  }),
  E10: () => nbWith((nb, w) => {
    const t = expectedTrajectory(w, nb);
    nb.calc.vy1.value = fmt(-t.vy1, 3);
    nb.calc.vy2.value = fmt(-t.vy2, 3);
  }),
  E11: () => nbWith((nb, w) => {
    const { W, C, Rn } = reopen(w);
    const v0 = h.gateMeanF3(w, nb.velocity.map((x) => x.readingId ?? ''));
    h.setAndRead(C, Rn, 35);
    // Plataforma más allá de la caída: la esfera toca el suelo y entra a la placa en el rebote.
    const t = h.platformTargetCm(w, v0, 35);
    for (let off = 30; off <= 240; off += 15) {
      C({ type: 'movePlatform', xCm: t.x + off, yCm: t.y });
      Rn(1.5);
      const id = h.shoot(W, C, Rn, { read: 'impact' }).id ?? '';
      if (w.readings[id]?.qualityFlags.includes('BOUNCE')) {
        nb.angles[1].readingId = id;
        break;
      }
    }
  }, 103, [SF3.BOUNCY_FLOOR]),
  E12: () => nbWith((nb, w) => (nb.angles[0].Tpred = fmt(expectedRanges(w, nb).rows[0].Tpeak))),
  E13: () => nbWith((nb, w) => (nb.angles[2].Rpred = fmt(expectedRanges(w, nb).rows[2].RpredLevel))),
  E14: () => nbWith((nb, w) => {
    const { W, C, Rn } = reopen(w);
    const x0 = Math.round(w.launcher.x * 1000) / 10;
    C({ type: 'setAngle', deg: 0 });
    Rn(2);
    C({ type: 'moveScreen', xCm: x0 + 70, inLane: true });
    const g = h.shoot(W, C, Rn, { ball: 'ballX', read: 'gate' }).id ?? '';
    C({ type: 'moveScreen', xCm: x0 + 100, inLane: false });
    h.setAndRead(C, Rn, 45);
    const t = h.platformTargetCm(w, h.gateMeanF3(w, [g]), 45);
    C({ type: 'movePlatform', xCm: t.x, yCm: t.y });
    Rn(1.5);
    nb.conditions[2].readingId = h.shoot(W, C, Rn, { ball: 'ballX', read: 'impact' }).id ?? '';
  }),
  E15: () => nbWith((nb) => {
    const empty = emptyF103Notebook();
    nb.trajectory[2] = empty.trajectory[2];
    nb.trajectory[3] = empty.trajectory[3];
  }),
  E16: () => {
    const w = ready();
    aimed(w);
    launch(w);
    h.cmdF3(w, { type: 'setFan', speed: 1, dir: 'side' });
    h.waitLanded(() => w, (s) => h.runF3(w, s));
    const r = R(w, h.cmdF3(w, { type: 'readImpact' }));
    return { w, check: () => expect(r.qualityFlags).toContain('WIND_CHANGED') };
  },
  E17: () => {
    const w = ready();
    aimed(w);
    h.cmdF3(w, { type: 'movePlatform', xCm: w.platform.x * 100 + 1, yCm: w.platform.y * 100 });
    shootImpact(w);
    return { w, check: () => expect(w.lastShot?.platformAt.settled).toBe(false) };
  },
  E18: () => {
    const w = ready({ align: false });
    const r = R(w, h.cmdF3(w, { type: 'readTape', target: 'platform', mark: 'index', viewDeg: 0 }));
    return { w, check: () => {
      expect(r.qualityFlags).toContain('UNALIGNED');
      expect(Math.abs(r.value - r.trueValue)).toBeGreaterThan(2);
    } };
  },
  E19: () => {
    const w = ready();
    h.cmdF3(w, { type: 'anchorStand', on: false });
    h.cmdF3(w, { type: 'setYaw', deg: 2 });
    h.cmdF3(w, { type: 'anchorStand', on: true });
    aimed(w);
    const r = R(w, shootImpact(w));
    return { w, check: () => expect(r.qualityFlags).toContain('LATERAL') };
  },
  E20: () => nbWith((nb, w) => {
    // Lanzador girado 8° y disparo corto (muesca 1): el desvío lateral es una fracción apreciable del alcance.
    const { W, C, Rn } = reopen(w);
    const x0 = Math.round(w.launcher.x * 1000) / 10;
    C({ type: 'setAngle', deg: 0 });
    Rn(2);
    C({ type: 'moveScreen', xCm: x0 + 70, inLane: true });
    const v1 = h.gateMeanF3(w, [h.shoot(W, C, Rn, { notch: 1, read: 'gate' }).id ?? '']);
    C({ type: 'moveScreen', xCm: x0 + 100, inLane: false });
    C({ type: 'anchorStand', on: false });
    C({ type: 'setYaw', deg: 8 });
    C({ type: 'anchorStand', on: true });
    h.setAndRead(C, Rn, 45);
    const t = h.platformTargetCm(w, v1, 45);
    C({ type: 'movePlatform', xCm: t.x, yCm: t.y });
    Rn(1.5);
    nb.angles[2].xPlat = { value: '', uncertainty: '', readingId: C({ type: 'readTape', target: 'platform', mark: 'index', viewDeg: 0 }).id ?? null };
    nb.angles[2].readingId = h.shoot(W, C, Rn, { notch: 1, read: 'impact' }).id ?? '';
    nb.angles[2].R = fmt(expectedRanges(w, nb).rows[2].dx);
  }),
  E21: () => {
    const w = base({ params: { protractorOffsetDeg: 1.5 } });
    h.cmdF3(w, { type: 'anchorStand', on: true });
    h.runF3(w, 2);
    const r = R(w, h.cmdF3(w, { type: 'readProtractor', viewDeg: 0 }));
    return { w, check: () => {
      expect(r.qualityFlags).toContain('NOT_ZEROED');
      expect(Math.abs(r.value - r.trueValue)).toBeGreaterThan(1);
    } };
  },
  E22: () => {
    const w = ready();
    aimed(w, 72);
    h.cmdF3(w, { type: 'setClockRange', range: 'short' });
    const r = R(w, shootImpact(w));
    return { w, check: () => {
      expect(r.qualityFlags).toContain('CLIPPED');
      expect(r.impact!.tFlight).toBeLessThanOrEqual(1);
    } };
  },
  E23: () => {
    const w = ready({ connectGate: false });
    const { W, C, Rn } = io(w);
    const r = h.shoot(W, C, Rn, { read: 'gate' });
    return { w, check: () => expect(r.ok ? 'ok' : (r as { code?: string }).code).toBe('NO_SIGNAL') };
  },
  E24: () => {
    const w = ready();
    h.cmdF3(w, { type: 'setTimerRate', hz: 1000 });
    const r = R(w, measureV0(w));
    return { w, check: () => expect(r.qualityFlags).toContain('LOW_RATE') };
  },
  E25: () => {
    const w = ready();
    aimed(w);
    h.cmdF3(w, { type: 'moveScreen', xCm: Math.round(w.launcher.x * 1000) / 10 + 50, inLane: true });
    const r = R(w, shootImpact(w));
    return { w, check: () => {
      expect(r.qualityFlags).toContain('OCCLUDED');
      expect(Number.isNaN(r.value)).toBe(true);
    } };
  },
  E26: () => {
    const w = ready();
    h.cmdF3(w, { type: 'turnLevelScrew', turns: 6 });
    h.runF3(w, 2);
    const r = R(w, h.cmdF3(w, { type: 'readProtractor', viewDeg: 0 }));
    return { w, check: () => expect(r.qualityFlags).toContain('TILTED') };
  },
  E27: () => {
    const w = ready({ calibrate: false });
    aimed(w);
    const r = R(w, shootImpact(w));
    return { w, check: () => expect(r.qualityFlags).toContain('UNCALIBRATED') };
  },
  E28: () => {
    const w = ready({ anchor: false });
    const x = w.launcher.x;
    const { W, C, Rn } = io(w);
    h.shoot(W, C, Rn, { read: null });
    return { w, check: () => {
      expect(w.launcher.x).toBeLessThan(x);
      expect(w.recoil.shots).toBe(1);
    } };
  },
  E29: () => {
    const w = ready();
    const r = R(w, h.cmdF3(w, { type: 'readHeight', mark: 'muzzle', viewDeg: 35 }));
    return { w, check: () => expect(Math.abs(r.value - r.trueValue)).toBeGreaterThan(0.1) };
  },
  E30: () => {
    const w = ready();
    h.cmdF3(w, { type: 'setAngle', deg: 40 });
    const r = R(w, h.cmdF3(w, { type: 'readProtractor', viewDeg: 0 }));
    return { w, check: () => expect(r.qualityFlags).toContain('UNSTABLE') };
  },
  E31: () => nbWith((nb) => (nb.velocity[0].readingId = '')),
  E32: () => {
    const w = ready();
    aimed(w);
    launch(w);
    h.cmdF3(w, { type: 'setAngle', deg: 50 });
    h.waitLanded(() => w, (s) => h.runF3(w, s));
    const r = R(w, h.cmdF3(w, { type: 'readImpact' }));
    return { w, check: () => expect(r.qualityFlags).toContain('CONFIG_CHANGED') };
  },
  E33: () => nbWith((nb) => (nb.angles[0].angle = { ...nb.angles[1].angle })),
  E34: () => nbWith((nb) => (nb.calc.v0Mean.value = String(Number(nb.calc.v0Mean.value) * 100))),
  E35: () => nbWith((nb, w) => {
    const e = expectedVelocity(w, nb);
    const i = e.rows.findIndex((r) => Math.abs(r.v0Rounded - r.v0) / r.v0 > 0.02);
    nb.velocity[Math.max(0, i)].v0 = fmt(e.rows[Math.max(0, i)].v0Rounded, 3);
  }),
  E36: () => nbWith((nb) => (nb.calc.fitC2.value = String(-Number(nb.calc.fitC2.value)))),
  E37: () => nbWith((nb) => (nb.velocity[2] = emptyF103Notebook().velocity[2])),
  E38: () => nbWith((nb, w) => (nb.calc.v0Mean.uncertainty = fmt(expectedVelocity(w, nb).uB * 0.3, 5))),
  E39: () => {
    const w = ready();
    const { W, C, Rn } = io(w);
    // Disparo fuerte contra la pantalla muy cerca: la esfera se abolla; el disparo siguiente lleva la marca.
    C({ type: 'moveScreen', xCm: Math.round(w.launcher.x * 1000) / 10 + 31, inLane: true });
    h.shoot(W, C, Rn, { notch: 3, read: null });
    const damaged = w.balls.ballA.damaged;
    const r = R(w, h.shoot(W, C, Rn, { read: 'gate' }));
    return { w, check: () => {
      expect(damaged).toBe(true);
      expect(r.qualityFlags).toContain('POST_IMPACT');
    } };
  },
  E40: () => {
    const w = ready();
    h.cmdF3(w, { type: 'loadBall', ball: 'ballA' });
    h.cmdF3(w, { type: 'cock', notch: 2 });
    h.cmdF3(w, { type: 'unloadBall' });
    return { w, check: () => {
      expect(w.safety.block?.code).toBe('SPRING_RELEASE');
      expect(w.objects.ballA.support).toBe('floor');
      expect(w.launcher.notch).toBe(0);
    } };
  },
};

describe('F103 — los 40 errores simulables', () => {
  it('el catálogo tiene 40 códigos, 20 + 20, con contrato completo y texto de retroalimentación', () => {
    expect(SIMULATED_ERRORS_F103).toHaveLength(40);
    expect(SIMULATED_ERRORS_F103.filter((e) => e.group === 'EXPERIMENTAL')).toHaveLength(20);
    const fb = (esF103 as { f103fb: Record<string, string> }).f103fb;
    for (const e of SIMULATED_ERRORS_F103) {
      expect(e.trigger && e.effect && e.fixture, e.id).toBeTruthy();
      expect(fb[errKeyF3(e)], e.id).toBeTruthy();
    }
  });

  it.each(SIMULATED_ERRORS_F103.map((e) => [e.id, e] as const))('%s: disparador → evidencia y consecuencia', (_id, e) => {
    const key = errKeyF3(e);
    const fx = FIXTURES[key]();
    if (e.evidenceKey.startsWith('err:')) expect(ev(fx.w, key), e.id).toBeGreaterThan(0);
    else expect(notebookIssuesF103(fx.w, fx.nb!)).toContain(`nb:${key}`);
    fx.check?.(fx.w, fx.nb);
  });
});

describe('F103 — escenarios docentes', () => {
  it.each(F103_SCENARIOS)('%s permite terminar por una ruta válida', (s) => {
    const { w, nb } = ideal(103, [s]);
    const flags = f103StageEvidence(w, nb);
    expect(Object.entries(flags).filter(([, v]) => !v).map(([k]) => k)).toEqual([]);
    expect(notebookIssuesF103(w, nb)).toEqual([]);
  });

  it('S01: sin aire, la diferencia medido / predicho es menor que con arrastre', () => {
    const ref = ideal(103);
    const { w, nb } = ideal(103, [SF3.NO_AIR]);
    expect(Math.abs(expectedRanges(w, nb).rangeErr)).toBeLessThan(Math.abs(expectedRanges(ref.w, ref.nb).rangeErr));
  });

  it('S07: con el resorte más débil que el rotulado, la v₀ medida baja', () => {
    const ref = ideal(103);
    const { w, nb } = ideal(103, [SF3.WEAK_SPRING]);
    expect(expectedVelocity(w, nb).v0Mean).toBeLessThan(expectedVelocity(ref.w, ref.nb).v0Mean * 0.97);
  });

  it('S06: con la base elevada, el alcance a 45° crece', () => {
    const ref = ideal(103);
    const { w, nb } = ideal(103, [SF3.RAISED_BASE]);
    expect(expectedRanges(w, nb).rows[2].R).toBeGreaterThan(expectedRanges(ref.w, ref.nb).rows[2].R);
  });
});

describe('F103 — seguridad y reanudación', () => {
  it('sacar la esfera con el resorte cargado bloquea hasta poner el protector', () => {
    const w = FIXTURES.E40().w;
    expect(h.cmdF3(w, { type: 'readLevel' }).code).toBe('BLOCKED');
    expect(h.cmdF3(w, { type: 'acknowledge' }).code).toBe('SECURE_FIRST');
    h.cmdF3(w, { type: 'setCap', on: true });
    expect(h.cmdF3(w, { type: 'acknowledge' }).ok).toBe(true);
    expect(w.safety.block).toBeNull();
    expect(ev(w, 'E40')).toBe(1);
  });

  it('disparar con la barrera abierta bloquea hasta cerrarla', () => {
    const w = FIXTURES.E08().w;
    expect(h.cmdF3(w, { type: 'acknowledge' }).code).toBe('SECURE_FIRST');
    h.cmdF3(w, { type: 'closeBarrier', on: true });
    expect(h.cmdF3(w, { type: 'acknowledge' }).ok).toBe(true);
  });

  it('sin EPP no se opera; la reanudación deja la esfera en la bandeja y el resorte descargado', () => {
    const w = h.worldF3();
    expect(h.cmdF3(w, { type: 'anchorStand', on: true }).code).toBe('PPE');
    const r = ready();
    aimed(r);
    launch(r);
    expect(r.flight && !r.flight.done).toBe(true);
    sanitizeOnResumeF103(r);
    expect(r.flight?.done).toBe(true);
    expect(r.objects.ballA.support).toBe('tray');
    expect(r.launcher.notch).toBe(0);
    expect(Math.abs(energyResidualJ(r))).toBeLessThan(1e-6);
  });
});
