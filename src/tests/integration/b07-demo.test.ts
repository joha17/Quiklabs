/**
 * Demostración de B07 sin navegador (§16): el mismo director y controlador que en la escena. Recorre los gestos reales
 * sin errores, deja el puesto cerrado, el frotis completo y la cinta reproducible.
 */
import { describe, expect, it } from 'vitest';
import { OpticalRuntime } from '../../app/b01/runtime';
import { OpticalLab3D, type CameraApiB01 } from '../../engine/optical/OpticalLab3D';
import type { OpticalHost } from '../../engine/optical/host';
import { DemoDirectorB07 } from '../../app/b07/demo/director';
import { buildDemoScriptB07 } from '../../app/b07/demo/script';
import { MICRO_SIM } from '../../app/b07/sim';
import { MicroController } from '../../engine/optical/microController';
import { newPracticeB07World } from '../../practices/practice-b07';
import { emptyB07Notebook } from '../../practices/practice-b07/notebook';
import { conservedMicro, dispatchMicro, microOutstanding, stepMicroWorld } from '../../simulation/micro-world/world';
import type { MicroCommand } from '../../simulation/micro-world/commands';
import type { MicroWorld } from '../../simulation/micro-world/types';
import { b07StageEvidence } from '../../practices/practice-b07/evidence';

function harness(seed = 20261124) {
  const opts = { mode: 'PRACTICE' as const, seed, scenarios: [] };
  const world = newPracticeB07World(opts);
  const rt = new OpticalRuntime<MicroWorld>(world, 'demo-test', [], MICRO_SIM);
  const tape: Array<[number, MicroCommand]> = [];
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
    createController: (hst, l) => new MicroController(hst, l),
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
  const nb = emptyB07Notebook('demo');
  let done = false;
  const steps: string[] = [];
  const director = new DemoDirectorB07(lab, buildDemoScriptB07({ notebook: () => {}, edit: (fn) => fn(nb) }), {
    onStep: (i) => {
      steps.push(director.steps[i].key);
      if (process.env.B07_DEMO_DEBUG) console.log(`@${director.steps[i].key} t=${rt.world.timeS.toFixed(0)} errs=${Object.keys(rt.world.evidence).filter((k) => k.startsWith('err:')).join(',')}`);
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

describe('B07 — demostración sin navegador', () => {
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
    const diag = `pasos ${h.steps.join(',')} · pendientes ${microOutstanding(w).join(',')} · láminas ${Object.keys(w.slides).map((id) => `${id}@${w.objects[id]?.support}`).join(',')} · avisos ${warns.join(' | ')} · errores ${errs.join(',')} · alertas ${bad.join(',')} · obs ${w.observationOrder.map((id) => { const o = w.observations[id]; return `${id}:${o.instrument}:${o.objectiveX ?? o.zoomX}:${o.isObservationValid ? 'ok' : o.issues.join('+')}`; }).join(' ')}`;
    expect(h.isDone(), diag).toBe(true);
    expect(h.lab.controller.held, diag).toBeNull();
    expect(warns, diag).toEqual([]);
    expect(errs, diag).toEqual([]);
    expect(bad, diag).toEqual([]);
    const f = b07StageEvidence(w, h.nb);
    for (const k of ['ppe', 'media', 'plates', 'distribution', 'stain', 'optics', 'interpretation', 'safeParked', 'benchRestored'] as const) expect(f[k], `${k} ${diag}`).toBe(true);
    expect(w.slides.sl1.assetId, diag).toBe('gramPosV');
    expect(w.micro.measures.length, diag).toBe(1);
    // Conservación y reproducción de la cinta por el dominio puro.
    const c = conservedMicro(w);
    for (const k of Object.keys(c)) expect(Math.abs(c[k]), k).toBeLessThan(1e-6);
    const replay = newPracticeB07World(h.opts);
    let i = 0;
    while (replay.tick < w.tick || i < h.tape.length) {
      while (i < h.tape.length && h.tape[i][0] === replay.tick) dispatchMicro(replay, h.tape[i++][1]);
      if (replay.tick >= w.tick) break;
      stepMicroWorld(replay);
    }
    expect(JSON.stringify(replay.micro)).toBe(JSON.stringify(w.micro));
    expect(JSON.stringify(replay.observations)).toBe(JSON.stringify(w.observations));
  }, 600000);
});
