/**
 * Demostración de B02 sin navegador (§16): el mismo director y el mismo controlador de gestos de tejido que en la
 * escena (`CellController`), con una cámara y una vista mínimas. Recorre los gestos reales —corte sobre la tabla,
 * raspado con espátula, hisopado y extendido, limpieza de herramientas, Lugol con su espera, cubreobjetos y mandos del
 * microscopio— y debe terminar con UN solo error deliberado (la cubierta bajada deprisa y casi plana) y su
 * recuperación, capturas válidas a 4X y 40X de las cuatro muestras, el puesto cerrado y la cinta reproducible.
 */
import { describe, expect, it } from 'vitest';
import { OpticalRuntime } from '../../app/b01/runtime';
import { OpticalLab3D, type CameraApiB01 } from '../../engine/optical/OpticalLab3D';
import type { OpticalHost } from '../../engine/optical/host';
import { DemoDirectorB02 } from '../../app/b02/demo/director';
import { buildDemoScriptB02 } from '../../app/b02/demo/script';
import { CELL_SIM } from '../../app/b02/sim';
import { CellController } from '../../engine/optical/cellController';
import { newPracticeB02World } from '../../practices/practice-b02';
import { emptyB02Notebook } from '../../practices/practice-b02/notebook';
import { cellOutstanding, conservedCell, dispatchCell, stepCellWorld } from '../../simulation/cell-world/world';
import type { CellCommand } from '../../simulation/cell-world/commands';
import type { CellWorld } from '../../simulation/cell-world/types';
import { b02StageEvidence } from '../../practices/practice-b02/evidence';

function harness(seed = 20261102) {
  const opts = { mode: 'PRACTICE' as const, seed, scenarios: [], turretPositions: 4 as const };
  const world = newPracticeB02World(opts);
  const rt = new OpticalRuntime<CellWorld>(world, 'demo-test', [], CELL_SIM);
  const tape: Array<[number, CellCommand]> = [];
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
    createController: (hst, l) => new CellController(hst, l),
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
  const nb = emptyB02Notebook('demo');
  let done = false;
  const steps: string[] = [];
  const director = new DemoDirectorB02(lab, buildDemoScriptB02({ notebook: () => {}, edit: (fn) => fn(nb) }), {
    onStep: (i) => {
      steps.push(director.steps[i].key);
      if (process.env.B02_DEMO_DEBUG) console.log(`@${director.steps[i].key} t=${rt.world.timeS.toFixed(0)} errs=${Object.keys(rt.world.evidence).filter((k) => k.startsWith('err:')).join(',')}`);
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

describe('B02 — demostración sin navegador', () => {
  it('se reproduce completa con los gestos de tejido reales, un error deliberado y su recuperación, y deja el puesto cerrado (§16)', async () => {
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
    const diag = `pasos ${h.steps.join(',')} · pendientes ${cellOutstanding(w).join(',')} · láminas ${Object.keys(w.slides).map((id) => `${id}@${w.objects[id]?.support}`).join(',')} · avisos ${warns.join(' | ')} · errores ${errs.join(',')} · alertas ${bad.join(',')} · obs ${w.observationOrder.map((id) => { const o = w.observations[id]; return `${id}:${o.instrument}:${o.objectiveX ?? o.zoomX}:${o.isObservationValid ? 'ok' : o.issues.join('+')}`; }).join(' ')}`;
    expect(h.isDone(), diag).toBe(true);
    expect(h.lab.controller.held, diag).toBeNull();
    expect(warns, diag).toEqual([]);
    expect(errs, diag).toEqual(['err:CEL14']);
    expect(bad, diag).toEqual([]);
    const f = b02StageEvidence(w, h.nb);
    for (const k of ['ppe', 'starch', 'animal', 'elodea', 'safeParked', 'benchRestored'] as const) expect(f[k], `${k} ${diag}`).toBe(true);
    expect(w.mounts.sl1.bubbleFraction, diag).toBeLessThan(0.1);
    // Ocho capturas válidas (4X y 40X de cada muestra), Lugol con su contacto y ninguna herramienta con restos.
    expect(w.observationOrder.filter((id) => w.observations[id].isObservationValid).length, diag).toBe(9);
    // El frotis bucal llega al 100X (objetivo negro) con captura válida.
    expect(w.observationOrder.map((id) => w.observations[id]).filter((o) => o.isObservationValid && o.objectiveX === 100).length, diag).toBe(1);
    expect(w.mounts.sl2.cell!.contactS.lugol ?? 0, diag).toBeGreaterThanOrEqual(w.params.cellPrep!.lugolMinContactS);
    expect(Object.values(w.cell.toolResidue).filter(Boolean), diag).toEqual([]);
    // Conservación y reproducción de la cinta por el dominio puro.
    const c = conservedCell(w);
    for (const k of Object.keys(c)) expect(Math.abs(c[k]), k).toBeLessThan(1e-6);
    const replay = newPracticeB02World(h.opts);
    let i = 0;
    while (replay.tick < w.tick || i < h.tape.length) {
      while (i < h.tape.length && h.tape[i][0] === replay.tick) dispatchCell(replay, h.tape[i++][1]);
      if (replay.tick >= w.tick) break;
      stepCellWorld(replay);
    }
    expect(JSON.stringify(replay.mounts)).toBe(JSON.stringify(w.mounts));
    expect(JSON.stringify(replay.observations)).toBe(JSON.stringify(w.observations));
  }, 600000);
});
