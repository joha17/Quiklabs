/**
 * Verificación de entregas: la cinta de comandos repetida tic a tic reconstruye exactamente el estado entregado
 * (también tras reanudar a mitad del intento), y el servidor recalcula la nota y detecta estados manipulados.
 *
 * Las funciones `dispatch*` del dominio se envuelven para grabar la cinta igual que la graba el runtime de la app:
 * `[tic, comando]` de cada comando de primer nivel sobre el mundo del intento.
 */
import { describe, expect, it, vi } from 'vitest';
import type { AttemptSnapshot, AttemptTape, GradedLab, TapeEntry } from '../../practices/grading';

const rec = vi.hoisted(() => ({ world: null as unknown, entries: [] as Array<[number, unknown]>, depth: 0 }));
// Solo los comandos de primer nivel: `dispatchPerm` (B03) delega en `dispatchCell` (B02), que delega en `dispatchB01`;
// los internos no deben grabarse otra vez.
const wrap = <F extends (...a: never[]) => unknown>(f: F) =>
  ((...args: Parameters<F>) => {
    const w = args[0] as unknown as { tick: number };
    if (w === rec.world && rec.depth === 0) rec.entries.push([w.tick, JSON.parse(JSON.stringify(args[1]))]);
    rec.depth++;
    try {
      return f(...args);
    } finally {
      rec.depth--;
    }
  }) as F;

vi.mock('../../simulation/world/world', async (orig) => {
  const m = await orig<typeof import('../../simulation/world/world')>();
  return { ...m, dispatchMut: wrap(m.dispatchMut) };
});
vi.mock('../../simulation/flame-world/world', async (orig) => {
  const m = await orig<typeof import('../../simulation/flame-world/world')>();
  return { ...m, dispatchFlame: wrap(m.dispatchFlame) };
});
vi.mock('../../simulation/reaction-world/world', async (orig) => {
  const m = await orig<typeof import('../../simulation/reaction-world/world')>();
  return { ...m, dispatchReaction: wrap(m.dispatchReaction) };
});
vi.mock('../../simulation/stoich-world/world', async (orig) => {
  const m = await orig<typeof import('../../simulation/stoich-world/world')>();
  return { ...m, dispatchStoich: wrap(m.dispatchStoich) };
});
vi.mock('../../simulation/gas-world/world', async (orig) => {
  const m = await orig<typeof import('../../simulation/gas-world/world')>();
  return { ...m, dispatchGas: wrap(m.dispatchGas) };
});
vi.mock('../../simulation/density-world/world', async (orig) => {
  const m = await orig<typeof import('../../simulation/density-world/world')>();
  return { ...m, dispatchP01: wrap(m.dispatchP01) };
});
vi.mock('../../simulation/bonding-world/world', async (orig) => {
  const m = await orig<typeof import('../../simulation/bonding-world/world')>();
  return { ...m, dispatchP07: wrap(m.dispatchP07) };
});
vi.mock('../../simulation/organic-world/world', async (orig) => {
  const m = await orig<typeof import('../../simulation/organic-world/world')>();
  return { ...m, dispatchP08: wrap(m.dispatchP08) };
});
vi.mock('../../simulation/cation-analysis-world/world', async (orig) => {
  const m = await orig<typeof import('../../simulation/cation-analysis-world/world')>();
  return { ...m, dispatchP09: wrap(m.dispatchP09) };
});
vi.mock('../../simulation/optical-world/world', async (orig) => {
  const m = await orig<typeof import('../../simulation/optical-world/world')>();
  return { ...m, dispatchB01: wrap(m.dispatchB01) };
});
vi.mock('../../simulation/cell-world/world', async (orig) => {
  const m = await orig<typeof import('../../simulation/cell-world/world')>();
  return { ...m, dispatchCell: wrap(m.dispatchCell) };
});
vi.mock('../../simulation/perm-world/world', async (orig) => {
  const m = await orig<typeof import('../../simulation/perm-world/world')>();
  return { ...m, dispatchPerm: wrap(m.dispatchPerm) };
});
vi.mock('../../simulation/calorimetry-world/world', async (orig) => {
  const m = await orig<typeof import('../../simulation/calorimetry-world/world')>();
  return { ...m, dispatchCalor: wrap(m.dispatchCalor) };
});

const { RESUME, gradeSnapshot, replayTape } = await import('../../practices/grading');
const { newPracticeWorld } = await import('../../practices/practice-02');
const { emptyNotebook } = await import('../../practices/practice-02/notebook');
const { sanitizeOnResume2 } = await import('../../practices/practice-02/resume');
const h2 = await import('../helpers');
const { emptyP3Notebook } = await import('../../practices/practice-03/notebook');
const { sanitizeOnResume3 } = await import('../../practices/practice-03/resume');
const h3 = await import('../helpers3');
const { loopIdFor } = await import('../../practices/practice-03/definition');
const { emptyP4Notebook } = await import('../../practices/practice-04/notebook');
const { sanitizeOnResume4 } = await import('../../practices/practice-04/resume');
const h4 = await import('../helpers4');
const { emptyP5Notebook } = await import('../../practices/practice-05/notebook');
const { sanitizeOnResume5 } = await import('../../practices/practice-05/resume');
const h5 = await import('../helpers5');
const { emptyP6Notebook } = await import('../../practices/practice-06/notebook');
const { sanitizeOnResume6 } = await import('../../practices/practice-06/resume');
const h6 = await import('../helpers6');
const { emptyP10Notebook } = await import('../../practices/practice-10/notebook');
const { sanitizeOnResume10 } = await import('../../practices/practice-10/resume');
const h10 = await import('../helpers10');
const { emptyP01Notebook } = await import('../../practices/practice-01/notebook');
const { sanitizeOnResume01 } = await import('../../practices/practice-01/resume');
const h01 = await import('../helpers01');

type W = { tick: number; seed: number };

/** Graba un intento: `route` recibe el mundo y una función para «cerrar y reanudar» (JSON + estado seguro). */
function record<T extends W>(labId: GradedLab, options: unknown, create: () => T, route: (w: T, resume: (w: T) => T) => T, sanitize: (w: T) => unknown) {
  rec.entries = [];
  const w0 = create();
  rec.world = w0;
  const resume = (w: T): T => {
    const back = JSON.parse(JSON.stringify(w)) as T;
    sanitize(back);
    rec.entries.push([back.tick, RESUME]);
    rec.world = back;
    return back;
  };
  const w = route(w0, resume);
  rec.world = null;
  const tape: AttemptTape = { v: 1, labId, attemptId: `${labId}-${w.seed.toString(36)}-test`, options, entries: rec.entries as TapeEntry[] };
  return { w, tape };
}

function snapshotOf(w: unknown, notebook: unknown): AttemptSnapshot {
  const world = JSON.parse(JSON.stringify(w)) as { events: unknown[] };
  world.events = [];
  return { world, notebook, ppe: true, mode: 'PRACTICE' };
}

async function verify(labId: GradedLab, r: { w: W; tape: AttemptTape }, notebook: unknown) {
  const snap = snapshotOf(r.w, notebook);
  const graded = gradeSnapshot(labId, structuredClone(snap), { attemptId: r.tape.attemptId, options: r.tape.options });
  expect(graded.issues).toEqual([]);
  // La cinta viaja como JSON (igual que en la entrega).
  const tape = JSON.parse(JSON.stringify(r.tape)) as AttemptTape;
  const out = await replayTape(tape, structuredClone(snap), graded.evaluation, { yieldEvery: 1e9 });
  expect(out.error).toBeUndefined();
  expect(out.exactState).toBe(true);
  expect(out.status).toBe('OK');
  expect(out.steps).toBe(r.w.tick);
  return { snap, graded, tape };
}

describe('repetición determinista de la cinta (cinco prácticas)', () => {
  it('P2: separación de mezcla con reanudación a mitad', async () => {
    const opts = { mode: 'PRACTICE' as const, seed: 77, oilProfile: 'OIL_VEG' as const };
    const r = record('p2', opts, () => newPracticeWorld(opts), (w, resume) => {
      h2.cmd(w, { type: 'place', id: 't1', support: 'rack:0' });
      h2.cmd(w, { type: 'scoop', toolId: 'spatula', sourceId: 'jar_nacl' });
      h2.cmd(w, { type: 'tapTool', toolId: 'spatula', targetId: 't1' });
      h2.squeezeTo(w, 'cyl', 2);
      w = resume(w);
      h2.pourMl(w, 'cyl', 't1', 2, 1);
      h2.cmd(w, { type: 'setAgitation', vesselId: 't1', intensity: 0.8, tool: 'SHAKE' });
      h2.run(w, 4);
      h2.cmd(w, { type: 'setAgitation', vesselId: 't1', intensity: 0, tool: 'NONE' });
      return w;
    }, sanitizeOnResume2);
    await verify('p2', r, emptyNotebook());
  });

  it('P3: encendido, llama azul y prueba a la llama con reanudación', async () => {
    const opts = { mode: 'PRACTICE' as const, seed: 2024 };
    const r = record('p3', opts, () => h3.world3(opts), (w, resume) => {
      h3.precheck(w);
      h3.ignite(w);
      h3.run3(w, 4);
      h3.makeBlue(w);
      w = resume(w);
      // Al reanudar el gas quedó cerrado: se vuelve a encender.
      h3.ignite(w);
      h3.makeBlue(w);
      h3.loadLoop(w, 'sol_nacl');
      h3.loopToFlame(w, loopIdFor('sol_nacl'));
      h3.shutdown(w);
      return w;
    }, sanitizeOnResume3);
    await verify('p3', r, emptyP3Notebook());
  });

  it('P4: neutralización y combustión del magnesio con reanudación', async () => {
    const opts = { mode: 'PRACTICE' as const, seed: 2025 };
    const r = record('p4', opts, () => h4.world4(opts), (w, resume) => {
      h4.cmd4(w, { type: 'confirmPpe' });
      h4.measure(w, 'bottle_hcl', 'cyl10', 5.06);
      h4.pourMl(w, 'cyl10', 'beaker', 6);
      h4.drops(w, 'pheno', 'beaker', 2);
      h4.stir(w, 'beaker', 2);
      w = resume(w);
      for (const t of ['extinguisher', 'blanket', 'estop']) h4.cmd4(w, { type: 'inspect', target: t });
      h4.lightBurner(w);
      h4.burnMg(w);
      h4.burnerOff(w);
      h4.run4(w, 30);
      return w;
    }, sanitizeOnResume4);
    await verify('p4', r, emptyP4Notebook());
  });

  it('P5: pesadas y calentamiento con reanudación', async () => {
    const opts = { mode: 'PRACTICE' as const, seed: 101 };
    const r = record('p5', opts, () => h5.world5(opts), (w, resume) => {
      h5.cmd5(w, { type: 'confirmPpe' });
      h5.calibrate(w);
      h5.weighTube(w);
      h5.addSolid(w, 'MnO2', 0.1);
      h5.addSolid(w, 'KClO3', 1.5);
      w = resume(w);
      h5.weighTube(w);
      h5.mix(w, 14);
      h5.mount(w);
      h5.burnerUnderSample(w, 0);
      h5.lightBurner(w, 0.3, 0.35);
      h5.heatGradually(w, 200);
      h5.burnerOff(w);
      return w;
    }, sanitizeOnResume5);
    await verify('p5', r, emptyP5Notebook());
  });

  it('P6: ensayo completo del hierro con reanudación durante el baño', async () => {
    const opts = { mode: 'PRACTICE' as const, seed: 601 };
    const r = record('p6', opts, () => h6.world6(opts), (w, resume) => {
      h6.cmd6(w, { type: 'confirmPpe' });
      h6.calibrate(w);
      h6.fillBath(w);
      w = resume(w);
      h6.fullRun(w, 'tube_fe', 'jar_fe');
      return w;
    }, sanitizeOnResume6);
    const nb = emptyP6Notebook();
    const { graded } = await verify('p6', r, nb);
    expect(graded.durationS).toBeGreaterThan(600);
  });
});

describe('repetición determinista — Práctica 10', () => {
  it('P10: pesada, disolución, reacción y Boyle con reanudación a mitad', async () => {
    const opts = { mode: 'PRACTICE' as const, seed: 1010 };
    const r = record('p10', opts, () => h10.world10(opts), (w, resume) => {
      h10.cmd10(w, { type: 'confirmPpe' });
      h10.setupGas(w);
      h10.weighBicarb(w);
      w = resume(w);
      h10.prepareSolution(w);
      h10.pipetteAliquot(w);
      h10.measureVinegar(w);
      h10.runReaction(w, { waitS: 120 });
      h10.gasMeasurements(w);
      w = resume(w);
      h10.boyleSetup(w);
      h10.boyleCollect(w, [5, 9, 13, 17]);
      return w;
    }, sanitizeOnResume10);
    const { graded } = await verify('p10', r, emptyP10Notebook());
    expect(graded.durationS).toBeGreaterThan(300);
  });
});

describe('repetición determinista — Práctica 1', () => {
  it('P01: balanza, dos series de agua, clavos y cilindro con reanudación a mitad', async () => {
    const opts = { mode: 'PRACTICE' as const, seed: 1001 };
    const r = record('p01', opts, () => h01.world01(opts), (w, resume) => {
      h01.ppe(w);
      h01.recognize(w);
      h01.balanceCheck(w);
      h01.waterSeries(w, 'room');
      w = resume(w);
      h01.coolReservoir(w, 200);
      h01.waterSeries(w, 'cold');
      w = resume(w);
      h01.displacement(w);
      h01.geometry(w);
      return w;
    }, sanitizeOnResume01);
    const { graded } = await verify('p01', r, emptyP01Notebook());
    expect(graded.durationS).toBeGreaterThan(300);
  });
});

describe('repetición determinista — Práctica 7', () => {
  it('P7: hipótesis, disolventes, detector, conductímetro e incógnitas con reanudación en A, C y D', async () => {
    const h07 = await import('../helpers07');
    const { sanitizeOnResume07 } = await import('../../practices/practice-07/resume');
    const { emptyP07Notebook } = await import('../../practices/practice-07/notebook');
    const opts = { mode: 'PRACTICE' as const, seed: 7007 };
    const nb = emptyP07Notebook();
    const r = record('p7', opts, () => h07.world07(opts), (w, resume) => h07.runIdealRoute07(w, nb, resume).w, sanitizeOnResume07);
    const { graded } = await verify('p7', r, nb);
    expect(graded.durationS).toBeGreaterThan(200);
    expect(graded.evaluation.total).toBeGreaterThan(0.9);
  });
});

describe('repetición determinista — Práctica 8', () => {
  for (const route of ['ISO', 'ASA', 'MS'] as const) {
    it(`P8 ${route}: síntesis, aislamiento y análisis con reanudación tras dosificar, calentar y enfriar`, async () => {
      const h08 = await import('../helpers08');
      const { sanitizeOnResume08 } = await import('../../practices/practice-08/resume');
      const opts = { mode: 'PRACTICE' as const, seed: 8008, route };
      let nb: unknown = null;
      const r = record('p8', opts, () => h08.world08(opts), (w, resume) => {
        const out = h08.idealAttempt(route, 8008, [], resume, w);
        nb = out.nb;
        return out.w;
      }, sanitizeOnResume08);
      const { graded } = await verify('p8', r, nb);
      expect(graded.durationS).toBeGreaterThan(1000);
      expect(graded.evaluation.total).toBeGreaterThan(0.9);
    }, 300000);
  }
});

describe('repetición determinista — Práctica 9', () => {
  it('P9: atlas, soportes, marcha con centrífuga y confirmación con reanudación entre estaciones', async () => {
    const h09 = await import('../helpers09');
    const { sanitizeOnResume09 } = await import('../../practices/practice-09/resume');
    const opts = { mode: 'PRACTICE' as const, seed: 9009, scenarios: [] };
    let nb: unknown = null;
    const r = record('p9', opts, () => h09.world09(opts), (w, resume) => {
      const out = h09.idealAttempt09(9009, [], resume, w);
      nb = out.nb;
      return out.w;
    }, sanitizeOnResume09);
    const { graded } = await verify('p9', r, nb);
    expect(graded.durationS).toBeGreaterThan(200);
    expect(graded.evaluation.total).toBeGreaterThan(0.9);
  }, 300000);
});

describe('repetición determinista — Biología B01', () => {
  for (const seed of [1101, 7, 2026]) {
    it(`B01 semilla ${seed}: montaje, microscopio, lámina fija y estereoscopio con reanudación entre estaciones`, async () => {
      const hb = await import('../helpersB01');
      const { sanitizeOnResumeB01 } = await import('../../practices/practice-b01/resume');
      const { emptyB01Notebook } = await import('../../practices/practice-b01/notebook');
      const opts = { mode: 'PRACTICE' as const, seed, scenarios: [] };
      let nb: unknown = null;
      const r = record('b01', opts, () => hb.worldB01(opts), (w, resume) => {
        const out = hb.idealRouteB01(w, resume);
        const n = emptyB01Notebook(`b01-${seed.toString(36)}-x`);
        hb.fillNotebookB01(out.w, n, out.res);
        nb = n;
        return out.w;
      }, sanitizeOnResumeB01);
      const { graded } = await verify('b01', r, nb);
      expect(graded.evaluation.total).toBeGreaterThan(0.9);
    }, 300000);
  }
});

describe('repetición determinista — Biología B02', () => {
  for (const seed of [2202, 31]) {
    it(`B02 semilla ${seed}: cortes, raspado con Lugol, frotis y Elodea con reanudación entre muestras`, async () => {
      const hc = await import('../helpersB02');
      const { sanitizeOnResumeB02 } = await import('../../practices/practice-b02/resume');
      const { emptyB02Notebook } = await import('../../practices/practice-b02/notebook');
      const opts = { mode: 'PRACTICE' as const, seed, scenarios: [] };
      let nb: unknown = null;
      const r = record('b02', opts, () => hc.worldB02(opts), (w, resume) => {
        const out = hc.idealRouteB02(w, resume);
        const n = emptyB02Notebook(`b02-${seed.toString(36)}-x`);
        hc.fillNotebookB02(out.w, n, out.res);
        nb = n;
        return out.w;
      }, sanitizeOnResumeB02);
      const { graded } = await verify('b02', r, nb);
      expect(graded.evaluation.total).toBeGreaterThan(0.9);
    }, 300000);
  }
});

describe('repetición determinista — Biología B03', () => {
  for (const seed of [3303, 47]) {
    it(`B03 semilla ${seed}: membranas, difusión, diálisis, ósmosis y Elodea con reanudación entre etapas`, async () => {
      const hp = await import('../helpersB03');
      const { sanitizeOnResumeB03 } = await import('../../practices/practice-b03/resume');
      const { emptyB03Notebook } = await import('../../practices/practice-b03/notebook');
      const opts = { mode: 'PRACTICE' as const, seed, scenarios: [] };
      let nb: unknown = null;
      const r = record('b03', opts, () => hp.worldB03(opts), (w, resume) => {
        const out = hp.idealRouteB03(w, resume);
        const n = emptyB03Notebook(`b03-${seed.toString(36)}-x`);
        hp.fillNotebookB03(out.w, n, out.res);
        nb = n;
        return out.w;
      }, sanitizeOnResumeB03);
      const { graded } = await verify('b03', r, nb);
      expect(graded.evaluation.total).toBeGreaterThan(0.85);
    }, 300000);
  }
});

describe('calificación en el servidor', () => {
  const opts = { mode: 'PRACTICE' as const, seed: 601 };
  const base = record('p6', opts, () => h6.world6(opts), (w) => {
    h6.cmd6(w, { type: 'confirmPpe' });
    h6.calibrate(w);
    return w;
  }, sanitizeOnResume6);
  const ctx = { attemptId: base.tape.attemptId, options: opts };
  const snap = () => snapshotOf(base.w, emptyP6Notebook());

  it('cambiar la incógnita o la semilla en el estado entregado queda marcado', () => {
    const s = snap();
    const params = (s.world as { params: { unknownMetal: string } }).params;
    params.unknownMetal = params.unknownMetal === 'Pb' ? 'Cu' : 'Pb';
    expect(gradeSnapshot('p6', s, ctx).issues).toContain('FIXED_STATE_CHANGED');
    expect(gradeSnapshot('p6', snap(), { ...ctx, attemptId: 'p6-zz-1' }).issues).toContain('SEED_MISMATCH');
  });

  it('un reloj inconsistente, el modo equivocado o una nota del cliente distinta quedan marcados', () => {
    const s = snap();
    (s.world as { timeS: number }).timeS += 100;
    expect(gradeSnapshot('p6', s, ctx).issues).toContain('CLOCK_INCONSISTENT');
    expect(gradeSnapshot('p6', snap(), { ...ctx, requiredMode: 'EVALUATION' }).issues).toContain('MODE_MISMATCH');
    expect(gradeSnapshot('p6', snap(), { ...ctx, clientScore: 1 }).issues).toContain('CLIENT_SCORE_MISMATCH');
    expect(gradeSnapshot('p6', snap(), { ...ctx, options: null }).issues).toEqual(['NO_TAPE']);
  });

  it('P5: crear materia en el tubo rompe la conservación de elementos', () => {
    const o = { mode: 'PRACTICE' as const, seed: 101 };
    const r = record('p5', o, () => h5.world5(o), (w) => w, sanitizeOnResume5);
    const s = snapshotOf(r.w, emptyP5Notebook());
    (s.world as { tube: { contents: { KCl: number } } }).tube.contents.KCl += 0.01;
    expect(gradeSnapshot('p5', s, { attemptId: r.tape.attemptId, options: o }).issues).toContain('NOT_CONSERVED');
  });

  it('una lectura inventada en el estado entregado no coincide con la repetición', async () => {
    const forged = snap();
    (forged.world as { evidence: Record<string, number> }).evidence.forged = 1;
    const graded = gradeSnapshot('p6', structuredClone(forged), ctx);
    const out = await replayTape(JSON.parse(JSON.stringify(base.tape)), forged, graded.evaluation);
    expect(out.exactState).toBe(false);
  });

  it('una cinta truncada no llega al estado entregado', async () => {
    const s = snap();
    const graded = gradeSnapshot('p6', structuredClone(s), ctx);
    const tape = { ...base.tape, entries: base.tape.entries.slice(0, 3) };
    const out = await replayTape(tape, s, graded.evaluation);
    expect(out.exactState).toBe(false);
    expect(out.status === 'MISMATCH' || out.status === 'OK').toBe(true);
  });
});
