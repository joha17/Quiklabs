/**
 * Demostración de la Práctica 9 sin navegador (§15): el mismo director y el mismo controlador que en la escena, con una
 * cámara y una vista mínimas. Recorre los gestos reales (asa, pipeta, gotero, piseta sobre la balanza, centrífuga,
 * decantación inclinando, botones de la campana y del emisor) y debe terminar SIN errores de técnica ni alertas, con
 * los dos precipitados separados, el potasio confirmado en el sobrenadante final y la llama apagada. La cinta de la
 * demo se reproduce igual por el dominio puro.
 */
import { describe, expect, it } from 'vitest';
import { CationRuntime } from '../../app/p9/runtime';
import { CationLab3D, type CameraApi09 } from '../../engine/cations/CationLab3D';
import type { CationHost } from '../../engine/cations/host';
import { DemoDirector09 } from '../../app/p9/demo/director';
import { buildDemoScript09 } from '../../app/p9/demo/script';
import { newPractice09World } from '../../practices/practice-09';
import { emptyP09Notebook } from '../../practices/practice-09/notebook';
import { massG } from '../../simulation/cation-analysis-world/species';
import { conservedTotals09, dispatchP09, levels09, stepP09World } from '../../simulation/cation-analysis-world/world';
import type { P09Command } from '../../simulation/cation-analysis-world/commands';
import { inferable } from '../../practices/practice-09/expected-results';

function harness(seed = 20261020) {
  const opts = { mode: 'PRACTICE' as const, seed, scenarios: [] };
  const world = newPractice09World(opts);
  const rt = new CationRuntime(world, 'demo-test');
  const tape: Array<[number, P09Command]> = [];
  const orig = rt.dispatch.bind(rt);
  rt.dispatch = (c) => {
    tape.push([rt.world.tick, JSON.parse(JSON.stringify(c))]);
    return orig(c);
  };
  for (const item of ['goggles', 'coat', 'gloves'] as const) rt.dispatch({ type: 'setPPE', item, enabled: true });
  rt.dispatch({ type: 'startWork' });
  let selected: string | null = null;
  const host: CationHost = {
    runtime: rt, t: (k) => k, getSelected: () => selected, select: (id) => { selected = id; },
    notify: () => {}, sound: () => {}, reducedMotion: () => true, guidedHints: () => false, showNames: () => false, nameTag: (id) => id,
  };
  const lab = new CationLab3D(host, 'LOW');
  const pos = { x: 0, y: 0, z: 40 };
  const camera: Partial<CameraApi09> = {
    goToStation: () => {}, lookAt: (_x, _y, z) => { pos.z = z + 30; }, focusObject: () => {}, orbit: () => {}, zoomBy: () => {}, reset: () => {}, settle: () => {},
    setOrbitEnabled: () => {}, edgePan: () => {}, screenOf: () => ({ x: 0, y: 0 }),
    eyeLevel: (id) => { if (rt.world.vessels[id]) pos.z = levels09(rt.world, id).surface; },
    position: () => ({ ...pos }),
  };
  lab.camera = camera as CameraApi09;
  lab.controller.view = { toBench: () => ({ x: 0, y: 0 }), pick: () => null, viewW: () => 1000, setOrbitEnabled: () => {}, edgePan: () => {} };
  const nb = emptyP09Notebook('demo');
  let done = false;
  const steps: string[] = [];
  const director = new DemoDirector09(lab, buildDemoScript09({ notebook: () => {}, edit: (fn) => fn(nb) }), {
    onStep: (i) => {
      steps.push(director.steps[i].key);
      if (process.env.P9_DEMO_DEBUG) console.log(`@${director.steps[i].key} t=${rt.world.timeS.toFixed(0)} errs=${Object.keys(rt.world.evidence).filter((k) => k.startsWith('err:')).join(',')}`);
    },
    onNote: () => {}, onDone: () => { done = true; },
    dispatch: (c) => rt.dispatch(c), select: (id) => { selected = id; }, t: (k) => k,
  });
  lab.onFrame = director.tick;
  const frame = (dtRaw: number) => {
    const dt = dtRaw * lab.playback.speed;
    const busy = !!lab.controller.held || Object.keys(rt.world.pours).length > 0 || rt.world.pipette.squeeze01 !== 0;
    const scale = rt.timeScale;
    if (busy) rt.timeScale = 1;
    rt.advance(dt);
    rt.timeScale = scale;
    lab.controller.frame(dt);
    lab.onFrame?.(dt);
  };
  return { rt, lab, director, nb, steps, frame, tape, opts, isDone: () => done };
}

describe('Práctica 9 — demostración sin navegador', () => {
  it('se reproduce completa con los gestos reales, sin errores, y deja Sr y Fe separados y el K confirmado (§15)', async () => {
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
    const diag = `pasos ${h.steps.join(',')} · avisos ${warns.join(' | ')} · errores ${errs.join(',')} · alertas ${bad.join(',')} · lecturas ${w.readingOrder.map((id) => `${id}:${w.readings[id].kind}:${w.readings[id].targetId}=${w.readings[id].category ?? w.readings[id].value}${w.readings[id].valid ? '' : '✗'}`).join(' ')}`;
    expect(h.isDone(), diag).toBe(true);
    expect(h.lab.controller.held, diag).toBeNull();
    expect(warns, diag).toEqual([]);
    expect(errs, diag).toEqual([]);
    expect(bad, diag).toEqual([]);
    expect(w.flame.ignited, diag).toBe(false);
    expect(massG(w.outside.bench), diag).toBeLessThan(0.02);
    // Separación real: el SrSO₄ quedó en T1, el Fe(OH)₃ en T2 y el sobrenadante final T3 lleva el K⁺.
    expect(w.vessels.T1.solid['SrSO4(s)'] ?? 0, diag).toBeGreaterThan(0);
    expect(w.vessels.T2.solid['FeOH3(s)'] ?? 0, diag).toBeGreaterThan(0);
    expect(w.vessels.T3.liq['K+'] ?? 0, diag).toBeGreaterThan(0);
    const inf = inferable(w);
    expect(inf, diag).toEqual({ 'Sr2+': 'detected', 'Fe3+': 'detected', 'K+': 'detected' });
    for (const c of ['Sr2+', 'Fe3+', 'K+'] as const) expect(h.nb.tableF[c].status, `${c} ${diag}`).toBe('detected');
    // Conservación y reproducción de la cinta por el dominio puro.
    const e0 = conservedTotals09(newPractice09World(h.opts));
    const e1 = conservedTotals09(w);
    for (const k of Object.keys(e0)) expect(Math.abs(e1[k] - e0[k]), k).toBeLessThan(1e-12);
    const replay = newPractice09World(h.opts);
    let i = 0;
    while (replay.tick < w.tick || i < h.tape.length) {
      while (i < h.tape.length && h.tape[i][0] === replay.tick) dispatchP09(replay, h.tape[i++][1]);
      if (replay.tick >= w.tick) break;
      stepP09World(replay);
    }
    expect(JSON.stringify(replay.vessels)).toBe(JSON.stringify(w.vessels));
  }, 600000);
});
