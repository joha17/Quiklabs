/**
 * Demostración de B01 sin navegador (§16): el mismo director y el mismo controlador que en la escena, con una cámara
 * y una vista mínimas. Recorre los gestos reales (pinza, gotero, cubreobjetos con inclinación y velocidad, mandos de
 * los instrumentos, ocular y registro) y debe terminar con UN solo error deliberado (E10: cubierta bajada deprisa y casi
 * plana) y su recuperación, capturas válidas a 4X/10X/40X, lámina fija y estereoscopio, el puesto cerrado y la cinta
 * reproducible por el dominio puro.
 */
import { describe, expect, it } from 'vitest';
import { OpticalRuntime } from '../../app/b01/runtime';
import { OpticalLab3D, type CameraApiB01 } from '../../engine/optical/OpticalLab3D';
import type { OpticalHost } from '../../engine/optical/host';
import { DemoDirectorB01 } from '../../app/b01/demo/director';
import { buildDemoScriptB01 } from '../../app/b01/demo/script';
import { newPracticeB01World } from '../../practices/practice-b01';
import { emptyB01Notebook } from '../../practices/practice-b01/notebook';
import { conservedB01, dispatchB01, stepB01World } from '../../simulation/optical-world/world';
import type { B01Command } from '../../simulation/optical-world/commands';
import { b01StageEvidence } from '../../practices/practice-b01/evidence';

function harness(seed = 20261101) {
  const opts = { mode: 'PRACTICE' as const, seed, scenarios: [], turretPositions: 4 as const };
  const world = newPracticeB01World(opts);
  const rt = new OpticalRuntime(world, 'demo-test');
  const tape: Array<[number, B01Command]> = [];
  const orig = rt.dispatch.bind(rt);
  rt.dispatch = (c) => {
    tape.push([rt.world.tick, JSON.parse(JSON.stringify(c))]);
    return orig(c);
  };
  for (const item of ['coat', 'shoes', 'hair', 'hands'] as const) rt.dispatch({ type: 'setPPE', item, enabled: true });
  rt.dispatch({ type: 'startWork' });
  let selected: string | null = null;
  const host: OpticalHost = {
    runtime: rt, t: (k) => k, getSelected: () => selected, select: (id) => { selected = id; },
    notify: () => {}, sound: () => {}, reducedMotion: () => true, guidedHints: () => false, showNames: () => false, nameTag: (id) => id,
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
  const nb = emptyB01Notebook('demo');
  let done = false;
  const steps: string[] = [];
  const director = new DemoDirectorB01(lab, buildDemoScriptB01({ notebook: () => {}, edit: (fn) => fn(nb) }), {
    onStep: (i) => {
      steps.push(director.steps[i].key);
      if (process.env.B01_DEMO_DEBUG) console.log(`@${director.steps[i].key} t=${rt.world.timeS.toFixed(0)} errs=${Object.keys(rt.world.evidence).filter((k) => k.startsWith('err:')).join(',')}`);
    },
    onNote: () => {}, onDone: () => { done = true; },
    dispatch: (c) => rt.dispatch(c), select: (id) => { selected = id; }, t: (k) => k,
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

describe('B01 — demostración sin navegador', () => {
  it('se reproduce completa con los gestos reales, un error deliberado y su recuperación, y deja el puesto cerrado (§16)', async () => {
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
    const diag = `pasos ${h.steps.join(',')} · avisos ${warns.join(' | ')} · errores ${errs.join(',')} · alertas ${bad.join(',')} · obs ${w.observationOrder.map((id) => { const o = w.observations[id]; return `${id}:${o.instrument}:${o.objectiveX ?? o.zoomX}:${o.isObservationValid ? 'ok' : o.issues.join('+')}`; }).join(' ')}`;
    expect(h.isDone(), diag).toBe(true);
    expect(h.lab.controller.held, diag).toBeNull();
    expect(warns, diag).toEqual([]);
    expect(errs, diag).toEqual(['err:E10']);
    expect(bad, diag).toEqual([]);
    const f = b01StageEvidence(w, h.nb);
    for (const k of ['ppe', 'partsLocated', 'safetyInspected', 'mountUsable', 'freshObserved', 'freshImported', 'fixedObserved', 'fixedReturned', 'stereoObserved', 'samplesReturned', 'safeParked', 'benchRestored'] as const) expect(f[k], `${k} ${diag}`).toBe(true);
    expect(w.mounts.sl1.bubbleFraction, diag).toBeLessThan(0.1);
    // Conservación y reproducción de la cinta por el dominio puro.
    const c = conservedB01(w);
    for (const k of Object.keys(c)) expect(Math.abs(c[k]), k).toBeLessThan(1e-6);
    const replay = newPracticeB01World(h.opts);
    let i = 0;
    while (replay.tick < w.tick || i < h.tape.length) {
      while (i < h.tape.length && h.tape[i][0] === replay.tick) dispatchB01(replay, h.tape[i++][1]);
      if (replay.tick >= w.tick) break;
      stepB01World(replay);
    }
    expect(JSON.stringify(replay.mounts)).toBe(JSON.stringify(w.mounts));
    expect(JSON.stringify(replay.observations)).toBe(JSON.stringify(w.observations));
  }, 600000);
});
