/**
 * Verificación de entregas: la cinta de comandos repetida tic a tic reconstruye exactamente el estado entregado
 * (también tras reanudar a mitad del intento), y el servidor recalcula la nota y detecta estados manipulados.
 *
 * Las funciones `dispatch*` del dominio se envuelven para grabar la cinta igual que la graba el runtime de la app:
 * `[tic, comando]` de cada comando de primer nivel sobre el mundo del intento.
 */
import { appendFileSync } from 'node:fs';
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
vi.mock('../../simulation/div-world/world', async (orig) => {
  const m = await orig<typeof import('../../simulation/div-world/world')>();
  return { ...m, dispatchDiv: wrap(m.dispatchDiv) };
});
vi.mock('../../simulation/photo-world/world', async (orig) => {
  const m = await orig<typeof import('../../simulation/photo-world/world')>();
  return { ...m, dispatchPhoto: wrap(m.dispatchPhoto) };
});
vi.mock('../../simulation/plant-world/world', async (orig) => {
  const m = await orig<typeof import('../../simulation/plant-world/world')>();
  return { ...m, dispatchPlant: wrap(m.dispatchPlant) };
});
vi.mock('../../simulation/animal-world/world', async (orig) => {
  const m = await orig<typeof import('../../simulation/animal-world/world')>();
  return { ...m, dispatchAnimal: wrap(m.dispatchAnimal) };
});
vi.mock('../../simulation/micro-world/world', async (orig) => {
  const m = await orig<typeof import('../../simulation/micro-world/world')>();
  return { ...m, dispatchMicro: wrap(m.dispatchMicro) };
});
vi.mock('../../simulation/perm-world/world', async (orig) => {
  const m = await orig<typeof import('../../simulation/perm-world/world')>();
  return { ...m, dispatchPerm: wrap(m.dispatchPerm) };
});
vi.mock('../../simulation/bio-world/world', async (orig) => {
  const m = await orig<typeof import('../../simulation/bio-world/world')>();
  return { ...m, dispatchBio: wrap(m.dispatchBio) };
});
vi.mock('../../simulation/enz-world/world', async (orig) => {
  const m = await orig<typeof import('../../simulation/enz-world/world')>();
  return { ...m, dispatchEnz: wrap(m.dispatchEnz) };
});
vi.mock('../../simulation/calorimetry-world/world', async (orig) => {
  const m = await orig<typeof import('../../simulation/calorimetry-world/world')>();
  return { ...m, dispatchCalor: wrap(m.dispatchCalor) };
});

const { ADAPTERS, GRADED_LABS, RESUME, gradeSnapshot, replayTape } = await import('../../practices/grading');
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

/** Cintas reales de cada práctica: el punto de partida del agente al azar del final de este archivo. */
const corpus = new Map<GradedLab, { tape: AttemptTape; notebook: unknown; mode: unknown }>();

async function verify(labId: GradedLab, r: { w: W; tape: AttemptTape }, notebook: unknown) {
  const snap = snapshotOf(r.w, notebook);
  const graded = gradeSnapshot(labId, structuredClone(snap), { attemptId: r.tape.attemptId, options: r.tape.options });
  expect(graded.issues).toEqual([]);
  corpus.set(labId, { tape: JSON.parse(JSON.stringify(r.tape)), notebook, mode: snap.mode });
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

describe('repetición determinista — Biología B04', () => {
  for (const seed of [4404, 59]) {
    it(`B04 semilla ${seed}: preparaciones, ensayos, Feulgen, catalasa y amilasa con reanudación entre etapas`, async () => {
      const hb4 = await import('../helpersB04');
      const { sanitizeOnResumeB04 } = await import('../../practices/practice-b04/resume');
      const { emptyB04Notebook } = await import('../../practices/practice-b04/notebook');
      const opts = { mode: 'PRACTICE' as const, seed, scenarios: [] };
      let nb: unknown = null;
      const r = record('b04', opts, () => hb4.worldB04(opts), (w, resume) => {
        const out = hb4.idealRouteB04(w, resume);
        const n = emptyB04Notebook(`b04-${seed.toString(36)}-x`);
        hb4.fillNotebookB04(out.w, n, out.res);
        nb = n;
        return out.w;
      }, sanitizeOnResumeB04);
      const { graded } = await verify('b04', r, nb);
      expect(graded.evaluation.total).toBeGreaterThan(0.85);
    }, 300000);
  }
});

describe('repetición determinista — Biología B05', () => {
  for (const seed of [5505, 61]) {
    it(`B05 semilla ${seed}: preparaciones, catalasa, amilasa y papa al microscopio con reanudación entre estaciones`, async () => {
      const hb5 = await import('../helpersB05');
      const { sanitizeOnResumeB05 } = await import('../../practices/practice-b05/resume');
      const { emptyB05Notebook } = await import('../../practices/practice-b05/notebook');
      const opts = { mode: 'PRACTICE' as const, seed, scenarios: [] };
      let nb: unknown = null;
      const r = record('b05', opts, () => hb5.worldB05(opts), (w, resume) => {
        const out = hb5.idealRouteB05(w, resume);
        const n = emptyB05Notebook(`b05-${seed.toString(36)}-x`);
        hb5.fillNotebookB05(out.w, n, out.res);
        nb = n;
        return out.w;
      }, sanitizeOnResumeB05);
      const { graded } = await verify('b05', r, nb);
      expect(graded.evaluation.total).toBeGreaterThan(0.85);
    }, 300000);
  }
});

describe('repetición determinista — Biología B06', () => {
  for (const [seed, scenarios] of [[2606, []], [67, ['SC-BACT-IMMERSION']]] as const) {
    it(`B06 semilla ${seed}: preparaciones frescas, protistas, láminas permanentes, marcas y medición con reanudación entre rutas`, async () => {
      const hb6 = await import('../helpersB06');
      const { sanitizeOnResumeB06 } = await import('../../practices/practice-b06/resume');
      const { emptyB06Notebook } = await import('../../practices/practice-b06/notebook');
      const opts = { mode: 'PRACTICE' as const, seed, scenarios: [...scenarios] };
      let nb: unknown = null;
      const r = record('b06', opts, () => hb6.worldB06(opts), (w, resume) => {
        const out = hb6.idealRouteB06(w, resume);
        const n = emptyB06Notebook(`b06-${seed.toString(36)}-x`);
        hb6.fillNotebookB06(out.w, n, out.res);
        nb = n;
        return out.w;
      }, sanitizeOnResumeB06);
      const { graded } = await verify('b06', r, nb);
      expect(graded.evaluation.total).toBeGreaterThan(0.9);
    }, 300000);
  }
});

describe('repetición determinista — Biología B07', () => {
  for (const seed of [2607, 71]) {
    it(`B07 semilla ${seed}: medios, placas, frotis y Gram, controles, medida y reanudación`, async () => {
      const hb7 = await import('../helpersB07');
      const { sanitizeOnResumeB07 } = await import('../../practices/practice-b07/resume');
      const opts = { mode: 'PRACTICE' as const, seed, scenarios: [] };
      let nb: unknown = null;
      const r = record('b07', opts, () => hb7.worldB07(opts), (w, resume) => {
        const out = hb7.idealRouteB07(w, resume);
        nb = hb7.fillNotebookB07(out);
        return out.w;
      }, sanitizeOnResumeB07);
      const { graded } = await verify('b07', r, nb);
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

describe('repetición determinista — Biología B08', () => {
  for (const seed of [2608, 83]) {
    it(`B08 semilla ${seed}: par luz/oscuridad, BTB, extracción, cromatograma y reanudación`, async () => {
      const hb8 = await import('../helpersB08');
      const { sanitizeOnResumeB08 } = await import('../../practices/practice-b08/resume');
      const opts = { mode: 'PRACTICE' as const, seed, scenarios: [] };
      let nb: unknown = null;
      const r = record('b08', opts, () => hb8.worldB08(opts), (w, resume) => {
        const out = hb8.idealRouteB08(w, resume);
        nb = hb8.fillNotebookB08(out);
        return out.w;
      }, sanitizeOnResumeB08);
      const { graded } = await verify('b08', r, nb);
      expect(graded.evaluation.total).toBeGreaterThan(0.85);
    }, 300000);
  }
});

describe('repetición determinista — Biología B09', () => {
  for (const seed of [20261030, 909]) {
    it(`B09 semilla ${seed}: órganos, cortes, Wiesner, láminas, medida y reanudación`, async () => {
      const hb9 = await import('../helpersB09');
      const { sanitizeOnResumeB09 } = await import('../../practices/practice-b09/resume');
      const { emptyB09Notebook } = await import('../../practices/practice-b09/notebook');
      const opts = { mode: 'PRACTICE' as const, seed, scenarios: [] };
      let nb: unknown = null;
      const r = record('b09', opts, () => hb9.worldB09(opts), (w, resume) => {
        const out = hb9.idealRouteB09(w, resume);
        const n = emptyB09Notebook('replay');
        hb9.fillNotebookB09(out.w, n, out.res);
        nb = n;
        return out.w;
      }, sanitizeOnResumeB09);
      const { graded } = await verify('b09', r, nb);
      expect(graded.evaluation.total).toBeGreaterThan(0.85);
    }, 300000);
  }
});

describe('repetición determinista — Biología B10', () => {
  for (const seed of [20261031, 1010]) {
    it(`B10 semilla ${seed}: láminas, estereoscopio, modelos, huellas y reanudación`, async () => {
      const hb10 = await import('../helpersB10');
      const { sanitizeOnResumeB10 } = await import('../../practices/practice-b10/resume');
      const { emptyB10Notebook } = await import('../../practices/practice-b10/notebook');
      const opts = { mode: 'PRACTICE' as const, seed, scenarios: [] };
      let nb: unknown = null;
      const r = record('b10', opts, () => hb10.worldB10(opts), (w, resume) => {
        const out = hb10.idealRouteB10(w, resume);
        const n = emptyB10Notebook('replay');
        hb10.fillNotebookB10(out.w, n, out.res);
        nb = n;
        return out.w;
      }, sanitizeOnResumeB10);
      const { graded } = await verify('b10', r, nb);
      expect(graded.evaluation.total).toBeGreaterThan(0.85);
    }, 300000);
  }

  const session = async () => {
    const hb10 = await import('../helpersB10');
    const { sanitizeOnResumeB10 } = await import('../../practices/practice-b10/resume');
    const { emptyB10Notebook } = await import('../../practices/practice-b10/notebook');
    const opts = { mode: 'PRACTICE' as const, seed: 1010, scenarios: [] };
    let nb: unknown = null;
    const r = record('b10', opts, () => hb10.worldB10(opts), (w, resume) => {
      const out = hb10.idealRouteB10(w, resume);
      const n = emptyB10Notebook('replay');
      hb10.fillNotebookB10(out.w, n, out.res);
      nb = n;
      return out.w;
    }, sanitizeOnResumeB10);
    const snap = snapshotOf(r.w, nb);
    const graded = gradeSnapshot('b10', structuredClone(snap), { attemptId: r.tape.attemptId, options: r.tape.options });
    return { r, snap, graded, tape: JSON.parse(JSON.stringify(r.tape)) as AttemptTape };
  };

  it('B10: inflar el mundo entregado no pasa la repetición, aunque la nota calculada suba', async () => {
    const { snap, graded, tape } = await session();
    const forged = [
      (w: any) => { for (const k of Object.keys(w.evidence)) if (k.startsWith('err:')) delete w.evidence[k]; w.evidence.forged = 1; },
      (w: any) => { for (const l of w.animal.labels) l.ok = true; w.animal.labels.push({ ...w.animal.labels[0], regionId: 'zz' }); },
      (w: any) => { for (const o of Object.values<any>(w.observations)) o.isObservationValid = true; delete w.observations[Object.keys(w.observations)[0]]; },
      (w: any) => { w.animal.identified.forged = { ok: true, guess: 'x' }; },
    ];
    for (const f of forged) {
      const s = structuredClone(snap) as AttemptSnapshot;
      f(s.world);
      // El servidor recalcula la nota del mundo entregado; la repetición lo contrasta con lo que de verdad pasó.
      let regraded;
      try {
        regraded = gradeSnapshot('b10', structuredClone(s), { attemptId: tape.attemptId, options: tape.options });
      } catch (e) {
        // Un mundo que la rúbrica ni siquiera puede leer se rechaza en la entrega.
        expect((e as Error).message).toBe('INVALID_NOTEBOOK');
        continue;
      }
      const out = await replayTape(tape, s, regraded.evaluation, { yieldEvery: 1e9 });
      expect(out.exactState).toBe(false);
    }
    // Una entrega honesta sigue validando, para que lo anterior no sea un falso positivo.
    const honest = await replayTape(tape, structuredClone(snap), graded.evaluation, { yieldEvery: 1e9 });
    expect(honest.exactState).toBe(true);
    expect(honest.status).toBe('OK');
  }, 300000);

  it('B10: una cinta recortada, alterada o de otro laboratorio no valida la entrega', async () => {
    const { snap, graded, tape } = await session();
    const run = (t: unknown) => replayTape(t as AttemptTape, structuredClone(snap), graded.evaluation, { yieldEvery: 1e9 });
    const cut = structuredClone(tape);
    cut.entries = cut.entries.slice(0, Math.floor(cut.entries.length / 2));
    expect((await run(cut)).exactState).toBe(false);
    const other = structuredClone(tape);
    (other.options as { seed: number }).seed = 7;
    expect((await run(other)).exactState).toBe(false);
    const lab = structuredClone(tape);
    lab.labId = 'b09';
    expect((await run(lab)).exactState).toBe(false);
    const junk = structuredClone(tape);
    junk.entries.splice(3, 0, [junk.entries[3][0], { type: 'labelRegion', modelId: '__proto__', regionId: 'constructor', part: 'x' }] as never);
    expect(await run(junk)).toMatchObject({ status: 'FAILED', error: 'BAD_TAPE' });
  }, 300000);

  it('B10: sesión desordenada con comandos rechazados: la cinta reproduce exactamente', async () => {
    const hb10 = await import('../helpersB10');
    const { sanitizeOnResumeB10 } = await import('../../practices/practice-b10/resume');
    const { emptyB10Notebook } = await import('../../practices/practice-b10/notebook');
    const { ANATOMY_MODELS } = await import('../../simulation/animal-world/catalog');
    const { dispatchAnimal } = await import('../../simulation/animal-world/world');
    const opts = { mode: 'PRACTICE' as const, seed: 5150, scenarios: [] };
    let s = 12345;
    const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
    const r = record('b10', opts, () => hb10.worldB10(opts), (w, resume) => {
      hb10.ppeB10(w);
      for (let i = 0; i < 400; i++) {
        const m = ANATOMY_MODELS[Math.floor(rnd() * ANATOMY_MODELS.length)];
        const reg = m.regions[Math.floor(rnd() * m.regions.length)];
        const cmds: any[] = [
          { type: 'openModel', modelId: m.id }, { type: 'orientModel', modelId: m.id, yawDeg: rnd() * 720 - 360, pitchDeg: rnd() * 120 - 60, zoom: 1 + rnd() },
          { type: 'labelRegion', modelId: m.id, regionId: reg?.id ?? 'a', part: reg?.part ?? 'x' }, { type: 'turnCoarse', deltaTurns: rnd() - 0.5 },
          { type: 'setPower', device: 'microscope', on: rnd() < 0.5 }, { type: 'selectObjective', objectiveX: [4, 10, 40][Math.floor(rnd() * 3)] },
          { type: 'identifyModel', modelId: m.id, guess: m.taxon }, { type: 'wipe', targetId: 'nope', toolId: 'lp' }, { type: 'captureObservation', instrument: 'compound' },
        ];
        dispatchAnimal(w, cmds[Math.floor(rnd() * cmds.length)]);
        if (i === 200) w = resume(w);
        if (i % 7 === 0) hb10.runA(w, rnd() * 2);
      }
      return w;
    }, sanitizeOnResumeB10);
    await verify('b10', r, emptyB10Notebook('replay'));
  }, 300000);
});

describe('agente al azar en todas las prácticas', () => {
  const SESSIONS = Number(process.env.FUZZ_SESSIONS ?? 3);
  const failures: Record<string, Set<string>> = {};
  const note = (lab: string, what: string) => void (failures[lab] ??= new Set()).add(what.slice(0, 220));

  for (const labId of GRADED_LABS) {
    it(`${labId}: una sesión desordenada no revienta, no deja NaN y se repite idéntica`, async () => {
      const src = corpus.get(labId);
      if (!src) return; // Filtrado con -t: sin cinta de partida no hay nada que mutar.
      for (let s = 0; s < SESSIONS; s++) {
        for (const problem of await messySession(labId, src, 7000 + s)) note(labId, problem);
      }
      if (process.env.FUZZ_REPORT) appendFileSync(process.env.FUZZ_REPORT, `${labId}\t${[...(failures[labId] ?? [])].join('\n\t')}\n`);
      expect([...(failures[labId] ?? [])]).toEqual([]);
    }, 120000 * SESSIONS + 60000);

    it(`${labId}: una cinta con basura termina en un resultado, nunca en un cuelgue`, async () => {
      const src = corpus.get(labId);
      if (!src) return;
      for (let s = 0; s < SESSIONS; s++) {
        const r = lcg(9000 + s);
        const tape = structuredClone(src.tape);
        tape.entries = tape.entries.map(([t, c]) => [t, c === RESUME || r() > 0.2 ? c : mutateCommand(c, src.tape, r, true, s % 2 === 0)] as TapeEntry);
        const before = JSON.stringify(Object.prototype);
        const a = ADAPTERS[labId];
        const world = JSON.parse(JSON.stringify(a.create(tape.options))) as AttemptSnapshot['world'];
        const out = await replayTape(tape, { world, notebook: src.notebook, ppe: true, mode: src.mode } as AttemptSnapshot, { total: 0, needsTeacherReview: [], components: [] }, { yieldEvery: 1e9 });
        expect(['OK', 'MISMATCH', 'FAILED']).toContain(out.status);
        expect(JSON.stringify(Object.prototype)).toBe(before);
        expect(({} as Record<string, unknown>).polluted).toBeUndefined();
      }
    }, 600000);
  }
});

function lcg(seed: number) {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}

/** Valores que el corpus usa en cada campo: cambiar un id por otro válido llega más lejos que inventarlo. */
function fieldValues(tape: AttemptTape) {
  const by = new Map<string, unknown[]>();
  for (const [, c] of tape.entries) {
    if (c === RESUME || typeof c !== 'object' || !c) continue;
    for (const [k, v] of Object.entries(c)) {
      if (k !== 'type' && (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')) by.set(k, [...(by.get(k) ?? []), v]);
    }
  }
  return by;
}

const NASTY: unknown[] = [NaN, Infinity, -Infinity, null, undefined, -1, 1e9, '', 'nope', '__proto__', 'constructor', [], {}];

function mutateCommand(cmd: unknown, tape: AttemptTape, r: () => number, garbage: boolean, proto = false): unknown {
  const c = structuredClone(cmd) as Record<string, unknown>;
  const keys = Object.keys(c).filter((k) => k !== 'type');
  if (!keys.length) return garbage && r() < 0.3 ? { ...c, type: 'nope' } : c;
  const k = keys[Math.floor(r() * keys.length)];
  if (garbage) {
    if (r() < 0.1) delete c[k];
    else {
      // Con `__proto__` la cinta se rechaza entera: las demás sesiones prueban hasta dónde aguanta el resto de la basura.
      const pool = proto ? NASTY : NASTY.filter((x) => x !== '__proto__' && x !== 'constructor');
      c[k] = pool[Math.floor(r() * pool.length)];
    }
    return c;
  }
  const pool = fieldValues(tape).get(k);
  if (typeof c[k] === 'number' && r() < 0.6) c[k] = (c[k] as number) * (r() * 3 - 0.5) + (r() - 0.5);
  else if (pool?.length) c[k] = pool[Math.floor(r() * pool.length)];
  return c;
}

function firstDiff(a: unknown, b: unknown, path = '', out: string[] = []): string[] {
  if (out.length > 5 || path === '.events' || path.includes('stage:')) return out;
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) firstDiff((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}.${k}`, out);
  } else if (a !== b && !(a == null && b == null)) out.push(`${path}: ${JSON.stringify(a)?.slice(0, 40)} ≠ ${JSON.stringify(b)?.slice(0, 40)}`);
  return out;
}

function badNumbers(o: unknown, path = '', out: string[] = [], seen = new Set<unknown>()): string[] {
  if (typeof o === 'number') {
    if (!Number.isFinite(o)) out.push(path);
  } else if (o && typeof o === 'object' && !seen.has(o)) {
    seen.add(o);
    for (const [k, v] of Object.entries(o)) badNumbers(v, `${path}.${k}`, out, seen);
  }
  return out;
}

/** Una lectura marcada inválida puede no tener valor (fuera de rango, balanza inestable): es su forma de decirlo. El resto no admite NaN. */
function unexpectedNaN(w: unknown) {
  return badNumbers(w).filter((path) => {
    const m = /^\.readings\.([^.]+)\.value$/.exec(path);
    return !(m && (w as { readings: Record<string, { valid?: boolean }> }).readings[m[1]].valid === false);
  });
}

/**
 * Parte de la cinta real, la desordena, borra, repite y altera con valores razonables (lo que podría hacer un estudiante torpe), y la ejecuta
 * como el runtime. Devuelve los problemas: excepciones, NaN, nota fuera de rango, sospechas falsas de manipulación o repetición distinta.
 */
async function messySession(labId: GradedLab, src: { tape: AttemptTape; notebook: unknown; mode: unknown }, seed: number): Promise<string[]> {
  const problems: string[] = [];
  const a = ADAPTERS[labId];
  const r = lcg(seed);
  const options = src.tape.options;
  let w = a.create(options) as { tick: number; seed: number; params: { dtS: number } };
  const entries: TapeEntry[] = [];
  const list = src.tape.entries.filter(([, c]) => c !== RESUME);
  // Se aprovecha el orden real con perturbaciones locales: mantiene la práctica avanzando en vez de morir en los primeros rechazos.
  const script: Array<[number, unknown]> = [];
  for (let i = 0; i < list.length; i++) {
    const roll = r();
    const j = Math.min(list.length - 1, Math.max(0, i + Math.floor((r() - 0.5) * 12)));
    if (roll < 0.08) continue;
    script.push([list[i][0], roll < 0.2 ? list[j][1] : roll < 0.32 ? mutateCommand(list[i][1], src.tape, r, false) : list[i][1]]);
    if (roll > 0.95) script.push([list[i][0], list[i][1]]);
  }
  const latchEvery = Math.max(1, Math.round(1 / w.params.dtS));
  const c0 = a.conserved(w as never);
  let drift = '';
  let idx = 0;
  let last = 0;
  const started = Date.now();
  try {
    for (const [tick, cmd] of script) {
      if (Date.now() - started > 60000) break;
      const delta = Math.min(Math.max(0, tick - last), 600);
      last = tick;
      for (let i = 0; i < delta; i++) {
        a.step(w as never);
        if (w.tick % latchEvery === 0) a.latch(w as never, src.notebook);
      }
      idx++;
      entries.push([w.tick, JSON.parse(JSON.stringify(cmd))]);
      a.dispatch(w as never, cmd);
      a.latch(w as never, src.notebook);
      if (!drift) {
        const now = a.conserved(w as never);
        const k = Object.keys(c0).find((x) => Math.abs((now[x] ?? 0) - c0[x]) > 1e-9 * Math.max(1, Math.abs(c0[x])));
        if (k) drift = `${k}: ${c0[k]} → ${now[k]} tras ${JSON.stringify(cmd).slice(0, 110)}`;
      }
      if (idx % 150 === 0) {
        const back = JSON.parse(JSON.stringify(w));
        a.sanitize(back);
        entries.push([back.tick, RESUME]);
        w = back;
      }
      if (idx % 40 === 0) {
        const bad = unexpectedNaN(w);
        if (bad.length) {
          problems.push(`NaN en ${bad[0]} tras ${JSON.stringify(cmd).slice(0, 110)}`);
          return problems;
        }
      }
    }
  } catch (e) {
    problems.push(`excepción: ${(e as Error).message} en ${JSON.stringify(entries[entries.length - 1]?.[1]).slice(0, 120)}`);
    return problems;
  }
  const bad = unexpectedNaN(w);
  if (bad.length) problems.push(`NaN al final en ${bad[0]}`);
  const attemptId = `${labId}-${w.seed.toString(36)}-fuzz`;
  const snap = snapshotOf(w, src.notebook);
  (snap as { mode: unknown }).mode = src.mode;
  let graded;
  try {
    graded = gradeSnapshot(labId, structuredClone(snap), { attemptId, options });
  } catch (e) {
    problems.push(`calificación: ${(e as Error).message}`);
    return problems;
  }
  if (!(graded.evaluation.total >= 0 && graded.evaluation.total <= 1)) problems.push(`nota fuera de rango: ${graded.evaluation.total}`);
  // Un estudiante torpe no es un tramposo: ninguna de estas marcas debe saltar con una sesión honesta.
  const falseFlags = graded.issues.filter((x) => x !== 'CLIENT_SCORE_MISMATCH');
  if (falseFlags.length) problems.push(`sospecha falsa: ${falseFlags.join(',')} ${drift}`);
  const out = await replayTape({ v: 1, labId, attemptId, options, entries } as AttemptTape, structuredClone(snap), graded.evaluation, { yieldEvery: 1e9 });
  if (out.error) problems.push(`repetición: ${out.error}`);
  else if (!out.exactState) {
    // Se repite aquí para señalar la primera diferencia: sin ella, el fallo no dice nada.
    let v = a.create(options) as { tick: number };
    for (const [tick, cmd] of entries) {
      while (v.tick < tick) { a.step(v as never); if (v.tick % latchEvery === 0) a.latch(v as never, src.notebook); }
      if (cmd === RESUME) { v = JSON.parse(JSON.stringify(v)); a.sanitize(v as never); }
      else { a.dispatch(v as never, cmd); a.latch(v as never, src.notebook); }
    }
    while (v.tick < w.tick) { a.step(v as never); if (v.tick % latchEvery === 0) a.latch(v as never, src.notebook); }
    a.latch(v as never, src.notebook);
    problems.push(`la repetición no llega al mismo estado: ${firstDiff(v, snap.world).slice(0, 4).join(' | ')}`);
  }
  else if (out.status !== 'OK') problems.push(`la repetición da otra nota: ${out.replayScore} vs ${graded.evaluation.total}`);
  return problems;
}
