/**
 * Demostración de B06 sin navegador (§16): el mismo director y el mismo controlador de gestos que en la escena
 * (`DivController`), con una cámara y una vista mínimas. Recorre los gestos reales —fichas, epidermis pelada con la
 * pinza, gotas de cultivo con su gotero, metilcelulosa, hisopado y extendido, láminas permanentes de la caja, mandos del
 * microscopio, marcas y una medición calibrada— y debe terminar con UN solo error deliberado (la cubierta bajada
 * deprisa y casi plana) y su recuperación, movilidad registrada, láminas devueltas, el puesto cerrado y la cinta
 * reproducible.
 */
import { describe, expect, it } from 'vitest';
import { OpticalRuntime } from '../../app/b01/runtime';
import { OpticalLab3D, type CameraApiB01 } from '../../engine/optical/OpticalLab3D';
import type { OpticalHost } from '../../engine/optical/host';
import { DemoDirectorB06 } from '../../app/b06/demo/director';
import { buildDemoScriptB06 } from '../../app/b06/demo/script';
import { DIV_SIM } from '../../app/b06/sim';
import { DivController } from '../../engine/optical/divController';
import { newPracticeB06World } from '../../practices/practice-b06';
import { emptyB06Notebook } from '../../practices/practice-b06/notebook';
import { conservedDiv, dispatchDiv, divOutstanding, stepDivWorld } from '../../simulation/div-world/world';
import type { DivCommand } from '../../simulation/div-world/commands';
import type { DivWorld } from '../../simulation/div-world/types';
import { b06StageEvidence } from '../../practices/practice-b06/evidence';

function harness(seed = 20261124) {
  const opts = { mode: 'PRACTICE' as const, seed, scenarios: [] };
  const world = newPracticeB06World(opts);
  const rt = new OpticalRuntime<DivWorld>(world, 'demo-test', [], DIV_SIM);
  const tape: Array<[number, DivCommand]> = [];
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
    createController: (hst, l) => new DivController(hst, l),
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
  const nb = emptyB06Notebook('demo');
  let done = false;
  const steps: string[] = [];
  const director = new DemoDirectorB06(lab, buildDemoScriptB06({ notebook: () => {}, edit: (fn) => fn(nb) }), {
    onStep: (i) => {
      steps.push(director.steps[i].key);
      if (process.env.B06_DEMO_DEBUG) console.log(`@${director.steps[i].key} t=${rt.world.timeS.toFixed(0)} errs=${Object.keys(rt.world.evidence).filter((k) => k.startsWith('err:')).join(',')}`);
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

describe('B06 — demostración sin navegador', () => {
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
    const diag = `pasos ${h.steps.join(',')} · pendientes ${divOutstanding(w).join(',')} · láminas ${Object.keys(w.slides).map((id) => `${id}@${w.objects[id]?.support}`).join(',')} · avisos ${warns.join(' | ')} · errores ${errs.join(',')} · alertas ${bad.join(',')} · obs ${w.observationOrder.map((id) => { const o = w.observations[id]; return `${id}:${o.instrument}:${o.objectiveX ?? o.zoomX}:${o.isObservationValid ? 'ok' : o.issues.join('+')}`; }).join(' ')}`;
    expect(h.isDone(), diag).toBe(true);
    expect(h.lab.controller.held, diag).toBeNull();
    expect(warns, diag).toEqual([]);
    expect(errs, diag).toEqual(['err:CEL-016']);
    expect(bad, diag).toEqual([]);
    const f = b06StageEvidence(w, h.nb);
    for (const k of ['ppe', 'classification', 'preparation', 'protists', 'fixedSlides', 'safeParked', 'benchRestored'] as const) expect(f[k], `${k} ${diag}`).toBe(true);
    expect(w.mounts.sl1.bubbleFraction, diag).toBeLessThan(0.1);
    // Movilidad de los dos protistas registrada mirando, láminas permanentes de vuelta y marcas válidas.
    expect(Object.keys(w.evidence).filter((k) => k.startsWith('motility:')).sort(), diag).toEqual(['motility:euglena:plain', 'motility:paramecium:mc']);
    expect(w.div.marks.map((m) => `${m.structure}:${m.verdict}`), diag).toEqual(['stoma:valid', 'parameciumCell:valid', 'erythrocyte:valid', 'leukocyte:valid']);
    expect(w.div.measurements.length, diag).toBe(1);
    expect(Object.values(w.cell.toolResidue).filter(Boolean), diag).toEqual([]);
    // Conservación y reproducción de la cinta por el dominio puro.
    const c = conservedDiv(w);
    for (const k of Object.keys(c)) expect(Math.abs(c[k]), k).toBeLessThan(1e-6);
    const replay = newPracticeB06World(h.opts);
    let i = 0;
    while (replay.tick < w.tick || i < h.tape.length) {
      while (i < h.tape.length && h.tape[i][0] === replay.tick) dispatchDiv(replay, h.tape[i++][1]);
      if (replay.tick >= w.tick) break;
      stepDivWorld(replay);
    }
    expect(JSON.stringify(replay.mounts)).toBe(JSON.stringify(w.mounts));
    expect(JSON.stringify(replay.observations)).toBe(JSON.stringify(w.observations));
  }, 600000);
});
