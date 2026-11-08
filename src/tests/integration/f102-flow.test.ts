/**
 * F102 — recorridos completos sin escena (§17, matriz «Integración»): ruta ideal por comandos hasta la entrega con la
 * máquina por etapas y la evaluación, en modo realista y curricular y con varias semillas; los 40 errores
 * F102-E01…E40 con su disparador y su consecuencia causal; los 12 escenarios docentes; seguridad y reanudación.
 */
import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import type { F102World, ReadingF2 } from '../../simulation/f102-world/types';
import { SF2 } from '../../simulation/f102-world/world';
import { conservedTotalsF102, energyResidualJ } from '../../simulation/f102-world/conservation';
import type { F102Notebook } from '../../practices/practice-f102/notebook';
import { f102StageEvidence } from '../../practices/practice-f102/evidence';
import { practiceF102Machine, f102StageName } from '../../practices/practice-f102/workflow.machine';
import { F102_WEIGHTS, evaluateF102, notebookIssuesF102 } from '../../practices/practice-f102/rubric';
import { SIMULATED_ERRORS_F102, F102_SCENARIOS, errKeyF2 } from '../../practices/practice-f102/error-scenarios';
import { sanitizeOnResumeF102 } from '../../practices/practice-f102/resume';
import { expectedAccel, expectedFall, expectedUniform } from '../../practices/practice-f102/expected-results';
import { gFromFall } from '../../simulation/models/f102/equations';
import esF102 from '../../locales/es/practiceF102.json';
import * as h from '../helpersF102';

const ev = (w: F102World, k: string) => w.evidence[`err:${k}`] ?? 0;
const R = (w: F102World, r: { id?: string }): ReadingF2 => w.readings[r.id!];

function ideal(seed = 102, scenarios: string[] = [], mode?: 'CURRICULAR' | 'REALISTIC') {
  const r = h.idealRouteF2(seed, scenarios as never, mode);
  return { ...r, nb: h.fillNotebookF2(r.w, r.ids) };
}

describe('F102 — ruta ideal', () => {
  it('cumple las cinco etapas por evidencia y llega a COMPLETE sin errores', () => {
    const { w, nb } = ideal();
    const flags = f102StageEvidence(w, nb);
    expect(Object.entries(flags).filter(([, v]) => !v).map(([k]) => k)).toEqual([]);
    const actor = createActor(practiceF102Machine).start();
    actor.send({ type: 'START' });
    actor.send({ type: 'PPE_CONFIRMED' });
    expect(f102StageName(actor.getSnapshot().value)).toBe('CALIBRATE');
    actor.send({ type: 'EVIDENCE', flags });
    expect(f102StageName(actor.getSnapshot().value)).toBe('COMPLETE');
    expect(Object.keys(w.evidence).filter((k) => k.startsWith('err:') && w.evidence[k] > 0)).toEqual([]);
    expect(notebookIssuesF102(w, nb)).toEqual([]);
  });

  it('la evaluación da el máximo automático (las respuestas abiertas quedan a revisión)', () => {
    const { w, nb } = ideal();
    const e = evaluateF102(w, nb);
    expect(Object.values(F102_WEIGHTS).reduce((s, x) => s + x, 0)).toBeCloseTo(1, 12);
    for (const c of e.components.filter((x) => x.id !== 'analysis')) expect(c.score, c.id).toBe(1);
    expect(e.total).toBeGreaterThan(0.95);
    expect(e.needsTeacherReview.length).toBeGreaterThan(0);
  });

  it('la máquina no avanza sin evidencia (no hay evento «Siguiente»)', () => {
    const w = h.worldF2();
    h.ppeF2(w);
    h.exploreF2(w);
    const actor = createActor(practiceF102Machine).start();
    actor.send({ type: 'START' });
    actor.send({ type: 'PPE_CONFIRMED' });
    actor.send({ type: 'EVIDENCE', flags: f102StageEvidence(w, h.fillNotebookF2(w, { setup: {}, angle: '', uniform: [], tape: [], heights: [], falls: [], drag: [] })) });
    expect(f102StageName(actor.getSnapshot().value)).toBe('CALIBRATE');
  });

  it.each([7, 2024, 99991])('semilla %i: aceleración y g coherentes con las lecturas propias', (seed) => {
    const { w, nb } = ideal(seed);
    const a = expectedAccel(w, nb);
    expect(a.aMean).toBeGreaterThan(0.8);
    expect(a.aMean).toBeLessThan(1.1);
    const f = expectedFall(w, nb);
    expect(Math.abs(f.gMean - 9.81) / 9.81).toBeLessThan(0.03);
    expect(evaluateF102(w, nb).components.find((c) => c.id === 'modelling')!.score).toBe(1);
  });

  it('modo curricular: sin pérdidas, la caída da g = 9,81 y la cinta sigue a m g/(M + m) dentro de la variación de masas', () => {
    const { w, nb } = ideal(102, [], 'CURRICULAR');
    expect(w.params.rollingN).toBe(0);
    expect(w.params.magnetDelayS).toBe(0);
    expect(Math.abs(expectedFall(w, nb).gMean - 9.81)).toBeLessThan(0.05);
    expect(evaluateF102(w, nb).components.find((c) => c.id === 'execution')!.score).toBe(1);
  });

  it('conserva las masas del inventario y cierra el balance de energía', () => {
    const { w } = ideal(102, [], 'CURRICULAR');
    const t = conservedTotalsF102(w);
    expect(t.massesG).toBeCloseTo(w.initialTotals.massesG, 9);
    expect(Math.abs(energyResidualJ(w))).toBeLessThan(1e-3);
  });
});

// ─────────────────────────── 40 errores ───────────────────────────

type Fixture = () => { w: F102World; nb?: F102Notebook; check?: (w: F102World, nb?: F102Notebook) => void };

const base = (scenarios: string[] = []) => {
  const w = h.worldF2({ scenarios: scenarios as never });
  h.ppeF2(w);
  return w;
};
const nbWith = (mut: (nb: F102Notebook, w: F102World) => void) => {
  const { w, ids } = h.idealRouteF2();
  const nb = h.fillNotebookF2(w, ids);
  mut(nb, w);
  return { w, nb };
};
const fx3 = (v: number) => v.toFixed(4);

const FIXTURES: Record<string, Fixture> = {
  E01: () => {
    const w = base([SF2.SLOPED_TRACK]);
    h.placeGates(w);
    const r = R(w, h.launcherRun(w));
    return { w, check: () => expect(r.qualityFlags).toContain('UNLEVELED') };
  },
  E02: () => {
    const w = base();
    h.placeGates(w);
    h.cmdF2(w, { type: 'holdCart', sCm: 30 });
    h.cmdF2(w, { type: 'armGateTimer' });
    h.cmdF2(w, { type: 'releaseCart', pushMs: 0.4 });
    h.runF2(w, 1.5);
    const r = R(w, h.cmdF2(w, { type: 'readGateTimer' }));
    return { w, check: () => expect(r.qualityFlags).toContain('PUSHED') };
  },
  E03: () => {
    const w = base();
    h.placeGates(w);
    h.cmdF2(w, { type: 'setGateYaw', gateId: 'gate2', yawDeg: 14 });
    const r = R(w, h.launcherRun(w));
    return { w, check: () => {
      expect(r.qualityFlags).toContain('MISSED');
      expect(r.gates!.t2In).toBeNull();
    } };
  },
  E04: () => {
    const w = base();
    h.placeGates(w, 50, 51.6);
    const r = R(w, h.launcherRun(w));
    return { w, check: () => expect(r.qualityFlags).toContain('OVERLAP') };
  },
  E05: () => {
    const w = base();
    h.hangMass(w);
    h.prepareTape(w);
    const r = R(w, h.tapeRun(w, { lateStart: true }));
    return { w, check: () => expect(r.qualityFlags).toContain('LATE_START') };
  },
  E06: () => {
    const w = base();
    h.hangMass(w);
    h.prepareTape(w, false);
    const r = R(w, h.tapeRun(w));
    return { w, check: () => expect(r.qualityFlags).toContain('SLACK_TAPE') };
  },
  E07: () => {
    const w = base();
    h.hangMass(w);
    h.prepareTape(w);
    // Carro ya cerca de la polea: la masa cuelga a pocos centímetros del suelo y la cinta queda con pocos puntos.
    h.cmdF2(w, { type: 'holdCart', sCm: 104.5 });
    h.cmdF2(w, { type: 'startTape' });
    h.runF2(w, 0.2);
    h.cmdF2(w, { type: 'releaseCart', pushMs: 0 });
    h.runF2(w, 0.8);
    const r = R(w, h.cmdF2(w, { type: 'stopTape' }));
    return { w, check: () => expect(r.qualityFlags).toContain('LANDED') };
  },
  E08: () => {
    const w = base();
    h.hangMass(w, ['m20a'], { seat: false });
    h.prepareTape(w);
    const r = R(w, h.tapeRun(w));
    return { w, check: () => expect(r.qualityFlags).toContain('OFF_WHEEL') };
  },
  E09: () => {
    const w = base([SF2.BOUNCY_CART]);
    h.placeGates(w, 100, 130);
    const r = R(w, h.launcherRun(w, { notch: 2, catchIt: false }));
    return { w, check: () => expect(r.qualityFlags).toContain('IMPACT') };
  },
  E10: () => {
    const w = base();
    h.placeGates(w);
    const edge = R(w, h.cmdF2(w, { type: 'readRuler', target: 'gate1', mark: 'edge', viewDeg: 0 }));
    return { w, check: () => expect(Math.abs(edge.value - edge.trueValue)).toBeGreaterThan(1) };
  },
  E11: () => nbWith((nb) => (nb.accel[0].mHang = '50')),
  E12: () => {
    const w = base();
    h.cmdF2(w, { type: 'capPhotocell', on: false });
    h.magnetDrop(w, 90, { offsetMm: 5 });
    return { w, check: () => expect(w.events.some((e) => e.code === 'LATERAL_RELEASE')).toBe(true) };
  },
  E13: () => {
    const w = base();
    const r = h.magnetDrop(w, 90);
    return { w, check: () => expect(r.t.ok).toBe(false) };
  },
  E14: () => {
    const w = base();
    h.cmdF2(w, { type: 'capPhotocell', on: false });
    h.cmdF2(w, { type: 'setPose', id: 'pad01', pose: { x: w.objects.pad01.pose.x + 26, y: 46, z: 0, rotationRad: 0 }, support: 'bench' });
    h.magnetDrop(w, 90);
    return { w, check: () => expect(w.events.some((e) => e.code === 'BALL_HIT_BENCH')).toBe(true) };
  },
  E15: () => {
    const w = base();
    h.prepareMotion(w);
    h.cmdF2(w, { type: 'crumpleFilter', filterId: 'f2' });
    h.cmdF2(w, { type: 'stackFilter', filterId: 'f2', onto: 'f1', offsetMm: 0 });
    const r = R(w, h.filterDrop(w, 'f1'));
    return { w, check: () => expect(r.qualityFlags).toContain('MIXED') };
  },
  E16: () => {
    const w = base();
    h.prepareMotion(w);
    h.cmdF2(w, { type: 'stackFilter', filterId: 'f2', onto: 'f1', offsetMm: 8 });
    const r = R(w, h.filterDrop(w, 'f1'));
    return { w, check: () => expect(r.qualityFlags).toContain('TUMBLING') };
  },
  E17: () => {
    const { w, ids } = h.idealRouteF2(102, [SF2.DRAG_SPHERE]);
    const nb = h.fillNotebookF2(w, ids);
    h.cmdF2(w, { type: 'swingMagnetArm', armIn: true });
    const d = h.magnetDrop(w, 120, { body: 'sphereS' });
    nb.fall[3] = { readingId: d.t.id!, h: { value: String(R(w, d.h).value), uncertainty: '', readingId: d.h.id! }, g: '' };
    return { w, nb, check: () => expect(R(w, d.t).qualityFlags).toContain('DRAG') };
  },
  E18: () => nbWith((nb, w) => {
    h.hangMass(w);
    h.cmdF2(w, { type: 'holdCart', sCm: 30 });
    h.cmdF2(w, { type: 'armGateTimer' });
    h.cmdF2(w, { type: 'releaseCart', pushMs: 0 });
    h.runF2(w, 1.2);
    const id = h.cmdF2(w, { type: 'readGateTimer' }).id!;
    h.cmdF2(w, { type: 'holdCart', sCm: 30 });
    nb.uniform[0].readingId = id;
    const e = expectedUniform(w, nb, w.readings[id]);
    nb.uniform[0] = { readingId: id, v1: fx3(e.vAvg), v2: fx3(e.v2), vAvg: fx3(e.vAvg) };
  }),
  E19: () => nbWith((nb) => (nb.accel[0].readingId = null)),
  E20: () => nbWith((nb, w) => {
    h.hangMass(w, ['m20a', 'm50a']);
    h.prepareTape(w);
    const id = h.tapeRun(w, { seconds: 2 }).id!;
    h.unhang(w, ['m20a', 'm50a']);
    const r = w.readings[id];
    nb.accel[0] = { ...nb.accel[0], readingId: id, mHang: String(r.setup!.hangG), mCart: String(r.setup!.cartG) };
    nb.accel[0].a = fx3(expectedAccel(w, nb).rows[0].aAll);
  }),
  E21: () => {
    const w = base([SF2.SLOPED_TRACK]);
    const r = R(w, h.levelTrack(w, { zero: false }));
    return { w, check: () => expect(r.qualityFlags).toContain('NOT_ZEROED') };
  },
  E22: () => {
    const w = base();
    h.prepareMotion(w, { range: 'near' });
    const r = R(w, h.filterDrop(w, 'f1'));
    return { w, check: () => expect(r.qualityFlags).toContain('CLIPPED') };
  },
  E23: () => {
    const w = base();
    h.prepareMotion(w, { connect: false, calibrate: false });
    const r = h.cmdF2(w, { type: 'startMotion' });
    return { w, check: () => expect(r.code).toBe('NOT_CONNECTED') };
  },
  E24: () => {
    const w = base();
    h.prepareMotion(w, { hz: 10 });
    const r = R(w, h.filterDrop(w, 'f1', 50));
    return { w, check: () => expect(r.qualityFlags).toContain('LOW_RATE') };
  },
  E25: () => {
    const w = base();
    h.prepareMotion(w, { armOut: false, calibrate: false });
    const r = R(w, h.filterDrop(w, 'f1'));
    return { w, check: () => expect(r.qualityFlags).toContain('OCCLUDED') };
  },
  E26: () => {
    const w = base();
    h.prepareMotion(w, { aim: 6 });
    const r = R(w, h.filterDrop(w, 'f1'));
    return { w, check: () => expect(r.qualityFlags).toContain('TILTED') };
  },
  E27: () => {
    const w = base();
    h.prepareMotion(w, { calibrate: false });
    const r = R(w, h.filterDrop(w, 'f1'));
    return { w, check: () => expect(r.qualityFlags).toContain('UNCALIBRATED') };
  },
  E28: () => {
    const w = base();
    h.cmdF2(w, { type: 'capPhotocell', on: false });
    const r = h.magnetDrop(w, 90, { loose: true });
    return { w, check: () => expect(R(w, r.t).qualityFlags).toContain('LOOSE_CLAMP') };
  },
  E29: () => {
    const w = base();
    h.setMagnet(w, 90);
    const r = R(w, h.cmdF2(w, { type: 'readTowerScale', viewDeg: 25 }));
    return { w, check: () => expect(r.qualityFlags).toContain('PARALLAX') };
  },
  E30: () => {
    const w = base();
    h.cmdF2(w, { type: 'placeInclinometer', where: 'bench' });
    h.runF2(w, 2);
    h.cmdF2(w, { type: 'zeroInclinometer' });
    h.cmdF2(w, { type: 'placeInclinometer', where: 'track' });
    const r = R(w, h.cmdF2(w, { type: 'readInclinometer' }));
    return { w, check: () => expect(r.qualityFlags).toContain('UNSTABLE') };
  },
  E31: () => nbWith((nb) => (nb.setup.flag.readingId = null)),
  E32: () => {
    const w = base();
    h.hangMass(w);
    h.prepareTape(w);
    h.cmdF2(w, { type: 'holdCart', sCm: 30 });
    h.cmdF2(w, { type: 'startTape' });
    h.cmdF2(w, { type: 'releaseCart', pushMs: 0 });
    h.runF2(w, 0.3);
    h.cmdF2(w, { type: 'loadMass', massId: 'm10a', on: true });
    h.runF2(w, 0.5);
    const r = R(w, h.cmdF2(w, { type: 'stopTape' }));
    return { w, check: () => expect(r.qualityFlags).toContain('CONFIG_CHANGED') };
  },
  E33: () => nbWith((nb, w) => {
    h.hangMass(w, ['m20a', 'm10a']);
    h.prepareTape(w);
    const id = h.tapeRun(w).id!;
    const r = w.readings[id];
    nb.accel[2] = { ...nb.accel[2], readingId: id, mHang: String(r.setup!.hangG), mCart: String(r.setup!.cartG) };
  }),
  E34: () => nbWith((nb) => (nb.fall[0].g = (Number(nb.fall[0].g) * 100).toFixed(1))),
  E35: () => nbWith((nb, w) => {
    const ef = expectedFall(w, nb);
    const i = ef.rows.findIndex((r) => Math.abs(gFromFall(r.h, Math.round(r.t * 100) / 100) / r.g - 1) > 0.006);
    const r = ef.rows[i];
    nb.fall[i].g = gFromFall(r.h, Math.round(r.t * 100) / 100).toFixed(3);
  }),
  E36: () => nbWith((nb) => (nb.uniform[0].vAvg = `-${nb.uniform[0].vAvg}`)),
  E37: () => nbWith((nb) => (nb.accel[2] = { readingId: null, mHang: '', mCart: '', a: '', ua: '', v0: '' })),
  E38: () => nbWith((nb) => (nb.calc.gMean.uncertainty = '0.0001')),
  E39: () => {
    const w = base();
    h.placeGates(w, 100, 130);
    h.launcherRun(w, { notch: 3, catchIt: false });
    const bent = w.cart.flagBent;
    const r = R(w, h.launcherRun(w));
    return { w, check: () => {
      expect(bent).toBe(true);
      expect(r.qualityFlags).toContain('POST_IMPACT');
      expect(h.cmdF2(w, { type: 'replaceFlag' }).ok).toBe(true);
      expect(w.cart.flagBent).toBe(false);
    } };
  },
  E40: () => {
    const w = base();
    h.hangMass(w);
    h.cmdF2(w, { type: 'releaseCart', pushMs: 0 });
    h.runF2(w, 0.1);
    h.cmdF2(w, { type: 'attachString', on: false });
    return { w, check: () => {
      expect(w.safety.block?.code).toBe('MASS_FALL');
      expect(w.objects.hanger01.support).toBe('floor');
    } };
  },
};

describe('F102 — los 40 errores simulables', () => {
  it('el catálogo tiene 40 códigos, 20 + 20, con contrato completo y texto de retroalimentación', () => {
    expect(SIMULATED_ERRORS_F102).toHaveLength(40);
    expect(SIMULATED_ERRORS_F102.filter((e) => e.group === 'EXPERIMENTAL')).toHaveLength(20);
    const fb = (esF102 as { f102fb: Record<string, string> }).f102fb;
    for (const e of SIMULATED_ERRORS_F102) {
      expect(e.trigger && e.effect && e.fixture, e.id).toBeTruthy();
      expect(fb[errKeyF2(e)], e.id).toBeTruthy();
    }
  });

  it.each(SIMULATED_ERRORS_F102.map((e) => [e.id, e] as const))('%s: disparador → evidencia y consecuencia', (_id, e) => {
    const key = errKeyF2(e);
    const fx = FIXTURES[key]();
    if (e.evidenceKey.startsWith('err:')) expect(ev(fx.w, key), e.id).toBeGreaterThan(0);
    else expect(notebookIssuesF102(fx.w, fx.nb!)).toContain(`nb:${key}`);
    fx.check?.(fx.w, fx.nb);
  });
});

describe('F102 — escenarios docentes', () => {
  it.each(F102_SCENARIOS)('%s permite terminar por una ruta válida', (s) => {
    const { w, nb } = ideal(102, [s]);
    const flags = f102StageEvidence(w, nb);
    expect(Object.entries(flags).filter(([, v]) => !v).map(([k]) => k)).toEqual([]);
  });

  it('S02: el carril llega inclinado y la ruta lo nivela con el tornillo', () => {
    const w = h.worldF2({ scenarios: [SF2.SLOPED_TRACK] });
    const before = Math.abs(w.track.angleDeg);
    h.ppeF2(w);
    h.levelTrack(w);
    expect(before).toBeGreaterThan(0.3);
    expect(Math.abs(w.track.angleDeg)).toBeLessThanOrEqual(0.1);
  });

  it('S05 y S06: la polea con inercia y el rozamiento bajan la aceleración respecto de m g/(M + m)', () => {
    const ref = ideal(102, []);
    for (const s of [SF2.PULLEY_INERTIA, SF2.CART_FRICTION]) {
      const { w, nb } = ideal(102, [s]);
      expect(expectedAccel(w, nb).aMean).toBeLessThan(expectedAccel(ref.w, ref.nb).aMean - 0.02);
    }
  });

  it('S12: el retardo del electroimán sesga g hacia abajo (t medido mayor)', () => {
    const ref = ideal(102, [], 'CURRICULAR');
    const { w, nb } = ideal(102, [SF2.TIMER_OFFSET], 'CURRICULAR');
    expect(expectedFall(w, nb).gMean).toBeLessThan(expectedFall(ref.w, ref.nb).gMean - 0.05);
  });
});

describe('F102 — seguridad y reanudación', () => {
  it('soltar el cordel con la masa colgando bloquea hasta asegurar el carro', () => {
    const w = FIXTURES.E40().w;
    expect(h.cmdF2(w, { type: 'readInclinometer' }).code).toBe('BLOCKED');
    h.cmdF2(w, { type: 'holdCart', sCm: 30 });
    expect(h.cmdF2(w, { type: 'acknowledge' }).code).toBe('SECURE_FIRST');
    h.cmdF2(w, { type: 'hangHanger', on: false });
    expect(h.cmdF2(w, { type: 'acknowledge' }).ok).toBe(true);
    expect(w.safety.block).toBeNull();
    expect(ev(w, 'E40')).toBe(1);
  });

  it('sin EPP no se opera; la reanudación detiene capturas y deja el carro retenido', () => {
    const w = h.worldF2();
    expect(h.cmdF2(w, { type: 'zeroInclinometer' }).code).toBe('PPE');
    h.ppeF2(w);
    h.hangMass(w);
    h.prepareTape(w);
    h.cmdF2(w, { type: 'startTape' });
    h.cmdF2(w, { type: 'releaseCart', pushMs: 0 });
    h.runF2(w, 0.2);
    sanitizeOnResumeF102(w);
    expect(w.tape.running).toBe(false);
    expect(w.cart.held).toBe(true);
  });
});
