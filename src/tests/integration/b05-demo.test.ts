/**
 * Demostración de B05 sin navegador (§16): el mismo director y el mismo controlador de gestos (`EnzController`) que en
 * la escena, con una cámara y una vista mínimas. Debe terminar sin errores registrados, con los tres lotes listos, la
 * línea base, el blanco y el tratamiento térmico medidos, las alícuotas de amilasa leídas, los gránulos de almidón
 * capturados, el puesto cerrado, el balance conservado y la cinta reproducible por el dominio puro.
 */
import { describe, expect, it } from 'vitest';
import { OpticalRuntime } from '../../app/b01/runtime';
import { OpticalLab3D, type CameraApiB01 } from '../../engine/optical/OpticalLab3D';
import type { OpticalHost } from '../../engine/optical/host';
import { DemoDirectorB05 } from '../../app/b05/demo/director';
import { buildDemoScriptB05 } from '../../app/b05/demo/script';
import { ENZ_SIM } from '../../app/b05/sim';
import { EnzController } from '../../engine/optical/enzController';
import { newPracticeB05World } from '../../practices/practice-b05';
import { emptyB05Notebook } from '../../practices/practice-b05/notebook';
import { b05StageEvidence } from '../../practices/practice-b05/evidence';
import { cellOutstanding, conservedEnz, dispatchEnz, enzOutstanding, stepEnzWorld } from '../../simulation/enz-world/world';
import type { EnzCommand } from '../../simulation/enz-world/commands';
import type { EnzWorld } from '../../simulation/enz-world/types';

function harness(seed = 20261028) {
  const opts = { mode: 'PRACTICE' as const, seed, scenarios: [] };
  const world = newPracticeB05World(opts);
  const rt = new OpticalRuntime<EnzWorld>(world, 'demo-test', [], ENZ_SIM);
  const tape: Array<[number, EnzCommand]> = [];
  const orig = rt.dispatch.bind(rt);
  rt.dispatch = (c) => {
    tape.push([rt.world.tick, JSON.parse(JSON.stringify(c))]);
    return orig(c);
  };
  for (const item of ['coat', 'shoes', 'hair', 'hands', 'gloves'] as const) rt.dispatch({ type: 'setPPE', item, enabled: true });
  rt.dispatch({ type: 'startWork' });
  let selected: string | null = null;
  const host: OpticalHost = {
    runtime: rt, t: (k) => k, getSelected: () => selected, select: (id) => { selected = id; },
    notify: () => {}, sound: () => {}, reducedMotion: () => true, guidedHints: () => false, showNames: () => false, nameTag: (id) => id,
    createController: (hst, l) => new EnzController(hst, l),
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
  // Sin escena, «ojo al menisco» deja la cámara a la altura del nivel: lecturas sin paralaje.
  (lab.controller as EnzController).eyeDegFor = () => 0;
  const nb = emptyB05Notebook('demo');
  let done = false;
  const steps: string[] = [];
  const director = new DemoDirectorB05(lab, buildDemoScriptB05({ notebook: () => {}, edit: (fn) => fn(nb) }), {
    onStep: (i) => {
      steps.push(director.steps[i].key);
      if (process.env.B05_DEMO_DEBUG) console.log(`@${director.steps[i].key} t=${rt.world.timeS.toFixed(0)} errs=${Object.keys(rt.world.evidence).filter((k) => k.startsWith('err:')).join(',')}`);
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

describe('B05 — demostración sin navegador', () => {
  it('se reproduce completa con gestos reales y deja el puesto cerrado (§16)', async () => {
    const h = harness();
    const warns: string[] = [];
    const orig = console.warn;
    const origErr = console.error;
    console.warn = (...a: unknown[]) => warns.push(a.join(' '));
    console.error = (...a: unknown[]) => warns.push(a.map(String).join(' '));
    const run = h.director.run();
    try {
      for (let i = 0; i < 3_000_000 && !h.isDone(); i++) {
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
    const E = w.enz;
    const errs = Object.keys(w.evidence).filter((k) => k.startsWith('err:'));
    const bad = w.events.filter((e) => e.severity === 'CRITICAL' || e.severity === 'ALERT').map((e) => `${e.code}@${e.t.toFixed(0)}`);
    const f = b05StageEvidence(w, h.nb);
    const diag = `pendiente ${enzOutstanding(w).join(',')}|${cellOutstanding(w).join(',')} · pasos ${h.steps.join(',')} · avisos ${warns.join(' | ')} · errores ${errs.join(',')} · alertas ${bad.join(',')} · banderas ${JSON.stringify(f)} · tubos ${Object.entries(E.tubes).filter(([, x]) => x.label).map(([k, x]) => `${k}:${x.label}:${x.readAt !== null}:${x.discarded}`).join(' ')} · lecturas ${E.readingOrder.map((id) => `${E.readings[id].instrument}:${E.readings[id].targetId}=${E.readings[id].value}${E.readings[id].quality ? `(${E.readings[id].quality})` : ''}`).join(' ')} · obs ${w.observationOrder.map((id) => `${id}:${w.observations[id].isObservationValid ? 'ok' : w.observations[id].issues.join('+')}`).join(' ')}`;
    expect(h.isDone(), diag).toBe(true);
    expect(h.lab.controller.held, diag).toBeNull();
    expect(warns, diag).toEqual([]);
    expect(errs, diag).toEqual([]);
    expect(bad, diag).toEqual([]);
    for (const k of ['ppe', 'hypothesis', 'starch_batch_ready', 'catalase_suspension_ready', 'amylase_batch_ready', 'amy_setup', 'amy_assays', 'micro', 'benchRestored'] as const) expect(f[k], `${k} ${diag}`).toBe(true);
    expect(Object.entries(E.tubes).filter(([id, x]) => x.sources.length > 0 && E.vessels[id].volumeMl > 0.05 && !x.discarded), diag).toEqual([]);
    const c = conservedEnz(w);
    for (const k of Object.keys(c)) expect(Math.abs(c[k]), k).toBeLessThan(1e-9);
    const replay = newPracticeB05World(h.opts);
    let i = 0;
    while (replay.tick < w.tick || i < h.tape.length) {
      while (i < h.tape.length && h.tape[i][0] === replay.tick) dispatchEnz(replay, h.tape[i++][1]);
      if (replay.tick >= w.tick) break;
      stepEnzWorld(replay);
    }
    expect(JSON.stringify(replay.enz.readings)).toBe(JSON.stringify(E.readings));
    expect(JSON.stringify(replay.observations)).toBe(JSON.stringify(w.observations));
  }, 900000);
});
