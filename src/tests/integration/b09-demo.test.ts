/**
 * Demostración de B09 sin navegador (§16): el mismo director y controlador que en la escena. Recorre los gestos reales
 * sin errores, deja el puesto cerrado, el frotis completo y la cinta reproducible.
 */
import { describe, expect, it } from 'vitest';
import { OpticalRuntime } from '../../app/b01/runtime';
import { OpticalLab3D, type CameraApiB01 } from '../../engine/optical/OpticalLab3D';
import type { OpticalHost } from '../../engine/optical/host';
import { DemoDirectorB09 } from '../../app/b09/demo/director';
import { buildDemoScriptB09 } from '../../app/b09/demo/script';
import { PLANT_SIM } from '../../app/b09/sim';
import { PlantController } from '../../engine/optical/plantController';
import { newPracticeB09World } from '../../practices/practice-b09';
import { emptyB09Notebook } from '../../practices/practice-b09/notebook';
import { conservedPlant, dispatchPlant, plantOutstanding, stepPlantWorld } from '../../simulation/plant-world/world';
import type { PlantCommand } from '../../simulation/plant-world/commands';
import type { PlantWorld } from '../../simulation/plant-world/types';
import { b09StageEvidence } from '../../practices/practice-b09/evidence';

function harness(seed = 20261030) {
  const opts = { mode: 'PRACTICE' as const, seed, scenarios: [] };
  const world = newPracticeB09World(opts);
  const rt = new OpticalRuntime<PlantWorld>(world, 'demo-test', [], PLANT_SIM);
  const tape: Array<[number, PlantCommand]> = [];
  const orig = rt.dispatch.bind(rt);
  rt.dispatch = (c) => {
    tape.push([rt.world.tick, JSON.parse(JSON.stringify(c))]);
    return orig(c);
  };
  for (const item of ['coat', 'shoes', 'hair', 'hands', 'gloves', 'goggles'] as const) rt.dispatch({ type: 'setPPE', item, enabled: true });
  rt.dispatch({ type: 'startWork' });
  let selected: string | null = null;
  const host: OpticalHost = {
    runtime: rt, t: (k) => k, getSelected: () => selected, select: (id) => { selected = id; },
    notify: () => {}, sound: () => {}, reducedMotion: () => true, guidedHints: () => false, showNames: () => false, nameTag: (id) => id,
    createController: (hst, l) => new PlantController(hst, l),
  };
  const lab = new OpticalLab3D(host, 'LOW');
  const pos = { x: 0, y: 0, z: 40 };
  const camera: Partial<CameraApiB01> = {
    goToStation: () => {}, lookAt: (_x, _y, z) => { pos.z = z + 30; }, focusObject: () => {}, orbit: () => {}, zoomBy: () => {}, reset: () => {}, settle: () => {},
    setOrbitEnabled: () => {}, edgePan: () => {}, screenOf: () => ({ x: 0, y: 0 }),
    eyeLevel: () => {},
    position: () => ({ ...pos }),
  };
  lab.camera = camera as CameraApiB01;
  lab.controller.view = { toBench: () => ({ x: 0, y: 0 }), pick: () => null, viewW: () => 1000, setOrbitEnabled: () => {}, edgePan: () => {} };
  const nb = emptyB09Notebook('demo');
  let done = false;
  const steps: string[] = [];
  const director = new DemoDirectorB09(lab, buildDemoScriptB09({ notebook: () => {}, edit: (fn) => fn(nb) }), {
    onStep: (i) => {
      steps.push(director.steps[i].key);
      if (process.env.B09_DEMO_DEBUG) console.log(`@${director.steps[i].key} t=${rt.world.timeS.toFixed(0)} errs=${Object.keys(rt.world.evidence).filter((k) => k.startsWith('err:')).join(',')}`);
    },
    onNote: () => {}, onDone: () => { done = true; },
    dispatch: (c) => rt.dispatch(c as never), select: (id) => { selected = id; }, t: (k) => k,
  });
  lab.onFrame = director.tick;
  const frame = (dtRaw: number) => {
    const dt = dtRaw * lab.playback.speed;
    const busy = !!lab.controller.held || !!lab.controller.lowering;
    const scale = rt.timeScale;
    if (busy) rt.timeScale = 1;
    rt.advance(dt);
    rt.timeScale = scale;
    lab.controller.frame(dt);
    lab.onFrame?.(dt);
  };
  return { rt, lab, director, nb, steps, frame, tape, opts, isDone: () => done };
}

describe('B09 — demostración sin navegador', () => {
  it('se reproduce completa con los gestos reales y deja el puesto cerrado (§16)', async () => {
    const h = harness();
    const warns: string[] = [];
    const orig = console.warn;
    const origErr = console.error;
    console.warn = (...a: unknown[]) => warns.push(a.join(' '));
    console.error = (...a: unknown[]) => warns.push(a.map(String).join(' '));
    const run = h.director.run();
    try {
      for (let i = 0; i < 2_000_000 && !h.isDone(); i++) {
        h.frame(1 / 30);
        if (i % 50 === 0) await Promise.resolve();
        await Promise.resolve();
      }
      await run;
    } finally {
      console.warn = orig;
      console.error = origErr;
    }
    const w = h.rt.world;
    const errs = Object.keys(w.evidence).filter((k) => k.startsWith('err:'));
    const bad = w.events.filter((e) => e.severity === 'CRITICAL' || e.severity === 'ALERT').map((e) => `${e.code}@${e.t.toFixed(0)}`);
    const diag = `pasos ${h.steps.join(',')} · pendientes ${plantOutstanding(w).join(',')} · láminas ${Object.keys(w.slides).map((id) => `${id}@${w.objects[id]?.support}`).join(',')} · avisos ${warns.join(' | ')} · errores ${errs.join(',')} · alertas ${bad.join(',')} · obs ${w.observationOrder.map((id) => { const o = w.observations[id]; return `${id}:${o.instrument}:${o.objectiveX ?? o.zoomX}:${o.isObservationValid ? 'ok' : o.issues.join('+')}`; }).join(' ')}`;
    expect(h.isDone(), diag).toBe(true);
    expect(h.lab.controller.held, diag).toBeNull();
    expect(warns, diag).toEqual([]);
    expect(errs, diag).toEqual([]);
    expect(bad, diag).toEqual([]);
    const f = b09StageEvidence(w, h.nb);
    for (const k of ['ppe', 'hypothesis', 'sectioning', 'slides', 'safeParked', 'benchRestored'] as const) expect(f[k], `${k} ${diag}`).toBe(true);
    expect(w.plant.sections.filter((x) => x.slideId).length, diag).toBe(3);
    expect(w.evidence['stain:documented'], diag).toBeGreaterThan(0);
    // Conservación y reproducción de la cinta por el dominio puro.
    const c = conservedPlant(w);
    for (const k of Object.keys(c)) expect(Math.abs(c[k]), k).toBeLessThan(1e-6);
    const replay = newPracticeB09World(h.opts);
    let i = 0;
    while (replay.tick < w.tick || i < h.tape.length) {
      while (i < h.tape.length && h.tape[i][0] === replay.tick) dispatchPlant(replay, h.tape[i++][1]);
      if (replay.tick >= w.tick) break;
      stepPlantWorld(replay);
    }
    expect(JSON.stringify(replay.plant)).toBe(JSON.stringify(w.plant));
    expect(JSON.stringify(replay.observations)).toBe(JSON.stringify(w.observations));
  }, 600000);
});
