/**
 * Demostración de B03 sin navegador (§16): el mismo director y el mismo controlador de gestos (`PermController`) que
 * en la escena, con una cámara y una vista mínimas. Debe terminar con UN solo error deliberado (la pinza floja de la
 * cámara 1, PERM02) corregido, la prueba de sello superada, la serie de difusión, siete tubos leídos y desechados,
 * la ósmosis con sus lecturas, Elodea capturada en los tres medios, el puesto cerrado y la cinta reproducible.
 */
import { describe, expect, it } from 'vitest';
import { OpticalRuntime } from '../../app/b01/runtime';
import { OpticalLab3D, type CameraApiB01 } from '../../engine/optical/OpticalLab3D';
import type { OpticalHost } from '../../engine/optical/host';
import { DemoDirectorB03 } from '../../app/b03/demo/director';
import { buildDemoScriptB03 } from '../../app/b03/demo/script';
import { PERM_SIM } from '../../app/b03/sim';
import { PermController } from '../../engine/optical/permController';
import { newPracticeB03World } from '../../practices/practice-b03';
import { emptyB03Notebook } from '../../practices/practice-b03/notebook';
import { b03StageEvidence } from '../../practices/practice-b03/evidence';
import { conservedPerm, dispatchPerm, stepPermWorld } from '../../simulation/perm-world/world';
import type { PermCommand } from '../../simulation/perm-world/commands';
import type { PermWorld } from '../../simulation/perm-world/types';

function harness(seed = 20261103) {
  const opts = { mode: 'PRACTICE' as const, seed, scenarios: [], turretPositions: 4 as const };
  const world = newPracticeB03World(opts);
  const rt = new OpticalRuntime<PermWorld>(world, 'demo-test', [], PERM_SIM);
  const tape: Array<[number, PermCommand]> = [];
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
    createController: (hst, l) => new PermController(hst, l),
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
  (lab.controller as PermController).eyeDegFor = () => 0;
  const nb = emptyB03Notebook('demo');
  let done = false;
  const steps: string[] = [];
  const director = new DemoDirectorB03(lab, buildDemoScriptB03({ notebook: () => {}, edit: (fn) => fn(nb) }), {
    onStep: (i) => {
      steps.push(director.steps[i].key);
      if (process.env.B03_DEMO_DEBUG) console.log(`@${director.steps[i].key} t=${rt.world.timeS.toFixed(0)} errs=${Object.keys(rt.world.evidence).filter((k) => k.startsWith('err:')).join(',')}`);
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

describe('B03 — demostración sin navegador', () => {
  it('se reproduce completa con gestos reales, una fuga deliberada y su corrección, y deja el puesto cerrado (§16)', async () => {
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
    const P = w.perm;
    const errs = Object.keys(w.evidence).filter((k) => k.startsWith('err:'));
    const bad = w.events.filter((e) => e.severity === 'CRITICAL' || e.severity === 'ALERT').map((e) => `${e.code}@${e.t.toFixed(0)}`);
    const f = b03StageEvidence(w, h.nb);
    const diag = `pasos ${h.steps.join(',')} · avisos ${warns.join(' | ')} · errores ${errs.join(',')} · alertas ${bad.join(',')} · banderas ${JSON.stringify(f)} · sello ${P.leakTestPassed.join(',')} · tubos ${Object.entries(P.tubes).map(([k, x]) => `${k}:${x.label}:${x.readAt !== null}:${x.discarded}`).join(' ')} · lecturas ${P.readingOrder.map((id) => `${P.readings[id].instrument}:${P.readings[id].targetId}=${P.readings[id].value}`).join(' ')} · obs ${w.observationOrder.map((id) => `${id}:${w.observations[id].isObservationValid ? 'ok' : w.observations[id].issues.join('+')}`).join(' ')}`;
    expect(h.isDone(), diag).toBe(true);
    expect(h.lab.controller.held, diag).toBeNull();
    expect(warns, diag).toEqual([]);
    expect(errs, diag).toEqual(['err:PERM02']);
    expect(P.leakTestPassed, diag).toContain('c1');
    for (const k of ['ppe', 'setup', 'diffusion', 'dialysis', 'osmosis', 'microscopy', 'safeParked', 'benchRestored'] as const) expect((f as unknown as Record<string, boolean>)[k], `${k} ${diag}`).toBe(true);
    expect(Object.values(P.tubes).every((x) => x.readAt !== null && x.discarded), diag).toBe(true);
    // Conservación y reproducción de la cinta por el dominio puro.
    const c = conservedPerm(w);
    for (const k of Object.keys(c)) expect(Math.abs(c[k]), k).toBeLessThan(1e-6);
    const replay = newPracticeB03World(h.opts);
    let i = 0;
    while (replay.tick < w.tick || i < h.tape.length) {
      while (i < h.tape.length && h.tape[i][0] === replay.tick) dispatchPerm(replay, h.tape[i++][1]);
      if (replay.tick >= w.tick) break;
      stepPermWorld(replay);
    }
    expect(JSON.stringify(replay.perm.readings)).toBe(JSON.stringify(P.readings));
    expect(JSON.stringify(replay.observations)).toBe(JSON.stringify(w.observations));
  }, 900000);
});
