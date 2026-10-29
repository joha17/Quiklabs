/**
 * Demostración de B04 sin navegador (§16): el mismo director y el mismo controlador de gestos (`BioController`) que en
 * la escena, con una cámara y una vista mínimas. Debe terminar SIN errores: P1 y P2 preparados, los cuatro ensayos con
 * blanco y patrón, Feulgen observado, catalasa con blanco y tres condiciones, amilasa leída con Lugol y Benedict por
 * separado, todos los tubos leídos y desechados, el puesto cerrado, el balance conservado y la cinta reproducible.
 */
import { describe, expect, it } from 'vitest';
import { OpticalRuntime } from '../../app/b01/runtime';
import { OpticalLab3D, type CameraApiB01 } from '../../engine/optical/OpticalLab3D';
import type { OpticalHost } from '../../engine/optical/host';
import { DemoDirectorB04 } from '../../app/b04/demo/director';
import { buildDemoScriptB04 } from '../../app/b04/demo/script';
import { BIO_SIM } from '../../app/b04/sim';
import { BioController } from '../../engine/optical/bioController';
import { newPracticeB04World } from '../../practices/practice-b04';
import { emptyB04Notebook } from '../../practices/practice-b04/notebook';
import { b04StageEvidence } from '../../practices/practice-b04/evidence';
import { conservedBio, dispatchBio, stepBioWorld } from '../../simulation/bio-world/world';
import type { BioCommand } from '../../simulation/bio-world/commands';
import type { BioWorld } from '../../simulation/bio-world/types';

function harness(seed = 20261028) {
  const opts = { mode: 'PRACTICE' as const, seed, scenarios: [], turretPositions: 4 as const };
  const world = newPracticeB04World(opts);
  const rt = new OpticalRuntime<BioWorld>(world, 'demo-test', [], BIO_SIM);
  const tape: Array<[number, BioCommand]> = [];
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
    createController: (hst, l) => new BioController(hst, l),
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
  (lab.controller as BioController).eyeDegFor = () => 0;
  const nb = emptyB04Notebook('demo');
  let done = false;
  const steps: string[] = [];
  const director = new DemoDirectorB04(lab, buildDemoScriptB04({ notebook: () => {}, edit: (fn) => fn(nb) }), {
    onStep: (i) => {
      steps.push(director.steps[i].key);
      if (process.env.B04_DEMO_DEBUG) console.log(`@${director.steps[i].key} t=${rt.world.timeS.toFixed(0)} errs=${Object.keys(rt.world.evidence).filter((k) => k.startsWith('err:')).join(',')}`);
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

describe('B04 — demostración sin navegador', () => {
  it('se reproduce completa con los comandos del panel, sin errores, y deja el puesto cerrado (§16)', async () => {
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
    const B = w.bio;
    const errs = Object.keys(w.evidence).filter((k) => k.startsWith('err:'));
    const bad = w.events.filter((e) => e.severity === 'CRITICAL' || e.severity === 'ALERT').map((e) => `${e.code}@${e.t.toFixed(0)}`);
    const f = b04StageEvidence(w, h.nb);
    const diag = `pasos ${h.steps.join(',')} · avisos ${warns.join(' | ')} · errores ${errs.join(',')} · alertas ${bad.join(',')} · banderas ${JSON.stringify(f)} · tubos ${Object.entries(B.tubes).filter(([, x]) => x.label).map(([k, x]) => `${k}:${x.label}:${x.readAt !== null}:${x.discarded}`).join(' ')} · obs ${w.observationOrder.map((id) => `${id}:${w.observations[id].isObservationValid ? 'ok' : w.observations[id].issues.join('+')}`).join(' ')}`;
    expect(h.isDone(), diag).toBe(true);
    expect(h.lab.controller.held, diag).toBeNull();
    expect(warns, diag).toEqual([]);
    expect(errs, diag).toEqual([]);
    for (const k of ['ppe', 'controlsReady', 'starchBatchReady', 'iodineControlled', 'proteinsTested', 'lipidsCompared', 'reducingTested', 'dnaObserved', 'catalaseSuspensionReady', 'catalaseCurve', 'amylaseBatchReady', 'amylaseContrasted', 'safeParked', 'benchRestored'] as const) expect(f[k], `${k} ${diag}`).toBe(true);
    // Cada tubo de ensayo se lee a ojo; la catalasa por el gas recogido; el tubo de incubación AMY solo da alícuotas.
    for (const [id, x] of Object.entries(B.tubes)) {
      if (!x.label || x.label.startsWith('AMY/')) continue;
      expect(x.label.startsWith('CAT/') ? x.gasReadsS.length > 0 : x.readAt !== null, `${id} ${diag}`).toBe(true);
    }
    expect(Object.values(B.tubes).filter((x) => x.label).every((x) => x.discarded), diag).toBe(true);
    // Conservación y reproducción de la cinta por el dominio puro.
    const c = conservedBio(w);
    for (const k of Object.keys(c)) if (k.startsWith('bio:')) expect(Math.abs(c[k]), k).toBeLessThan(1e-6 * Math.max(1, Math.abs(B.initial[k.slice(4)] ?? 1)));
    const replay = newPracticeB04World(h.opts);
    let i = 0;
    while (replay.tick < w.tick || i < h.tape.length) {
      while (i < h.tape.length && h.tape[i][0] === replay.tick) dispatchBio(replay, h.tape[i++][1]);
      if (replay.tick >= w.tick) break;
      stepBioWorld(replay);
    }
    expect(JSON.stringify(replay.bio.readings)).toBe(JSON.stringify(B.readings));
    expect(JSON.stringify(replay.observations)).toBe(JSON.stringify(w.observations));
  }, 900000);
});
