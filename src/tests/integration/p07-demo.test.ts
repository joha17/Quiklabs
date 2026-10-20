/**
 * Demostración de la Práctica 7 sin navegador (§16): el mismo director y el mismo controlador que en la escena, con
 * una cámara y una vista mínimas. Recorre los gestos reales (verter, espátula, agitador, sonda en el vaso, puntas sobre
 * la muestra) y debe dejar las lecturas esperadas, con UN solo error deliberado: la sonda sin enjuagar (§16.8).
 */
import { describe, expect, it } from 'vitest';
import { BondingRuntime } from '../../app/p7/runtime';
import { BondingLab3D, type CameraApi07 } from '../../engine/bonding/BondingLab3D';
import type { BondingHost } from '../../engine/bonding/host';
import { DemoDirector07 } from '../../app/p7/demo/director';
import { buildDemoScript07 } from '../../app/p7/demo/script';
import { newPractice07World } from '../../practices/practice-07';
import { emptyP07Notebook } from '../../practices/practice-07/notebook';
import { materialTotals } from '../../simulation/bonding-world/world';
import { contactOf, controlReadings, kappaReadings } from '../../practices/practice-07/expected-results';

function harness(seed = 20261007) {
  const world = newPractice07World({ mode: 'PRACTICE', seed, scenarios: [] });
  const rt = new BondingRuntime(world, 'demo-test');
  for (const item of ['coat', 'goggles', 'shoes'] as const) rt.dispatch({ type: 'setPPE', item, enabled: true });
  rt.dispatch({ type: 'setGloves', gloves: 'nitrile' });
  rt.dispatch({ type: 'startWork' });
  let selected: string | null = null;
  const host: BondingHost = {
    runtime: rt, t: (k) => k, getSelected: () => selected, select: (id) => { selected = id; },
    notify: () => {}, sound: () => {}, reducedMotion: () => true, guidedHints: () => false, showNames: () => false, nameTag: (id) => id,
  };
  const lab = new BondingLab3D(host, 'LOW');
  const pos = { x: 0, y: 0, z: 40 };
  const camera: Partial<CameraApi07> = {
    goToStation: () => {}, lookAt: () => {}, focusObject: () => {}, orbit: () => {}, zoomBy: () => {}, reset: () => {}, settle: () => {},
    setOrbitEnabled: () => {}, edgePan: () => {}, screenOf: () => ({ x: 0, y: 0 }), eyeLevel: () => {}, position: () => ({ ...pos }),
  };
  lab.camera = camera as CameraApi07;
  lab.controller.view = { toBench: () => ({ x: 0, y: 0 }), pick: () => null, viewW: () => 1000, setOrbitEnabled: () => {}, edgePan: () => {} };
  const nb = emptyP07Notebook();
  let done = false;
  const steps: string[] = [];
  const director = new DemoDirector07(lab, buildDemoScript07({ notebook: () => {}, edit: (fn) => fn(nb) }), {
    onStep: (i) => steps.push(director.steps[i].key), onNote: () => {}, onDone: () => { done = true; },
    dispatch: (c) => rt.dispatch(c), select: (id) => { selected = id; }, t: (k) => k,
  });
  lab.onFrame = director.tick;
  const frame = (dtRaw: number) => {
    const dt = dtRaw * lab.playback.speed;
    const busy = !!lab.controller.held || Object.keys(rt.world.pours).length > 0;
    const scale = rt.timeScale;
    if (busy) rt.timeScale = 1;
    rt.advance(dt);
    rt.timeScale = scale;
    lab.controller.frame(dt);
    lab.onFrame?.(dt);
  };
  return { rt, lab, director, nb, steps, frame, isDone: () => done };
}

describe('Práctica 7 — demostración sin navegador', () => {
  it('se reproduce completa con los gestos reales y deja las lecturas del guion (§16)', async () => {
    const h = harness();
    const warns: string[] = [];
    const orig = console.warn;
    const origErr = console.error;
    console.warn = (...a: unknown[]) => warns.push(a.join(' '));
    console.error = (...a: unknown[]) => warns.push(a.map(String).join(' '));
    const run = h.director.run();
    try {
      for (let i = 0; i < 600_000 && !h.isDone(); i++) {
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
    const diag = `pasos ${h.steps.join(',')} · avisos ${warns.join(' | ')} · errores ${errs.join(',')} · alertas ${bad.join(',')} · lecturas ${w.readingOrder.map((id) => `${id}:${w.readings[id].targetId}=${w.readings[id].value}${w.readings[id].valid ? '' : '✗'}`).join(' ')}`;
    expect(h.isDone(), diag).toBe(true);
    expect(warns, diag).toEqual([]);
    // Un único error, el deliberado (sonda sin enjuagar), y ninguna alerta de seguridad.
    expect(errs, diag).toEqual(['err:probe_contamination']);
    expect(bad, diag).toEqual([]);
    // Lecturas del guion: control del detector, grafito y cobre conducen, sal seca no; blanco, NaCl, sacarosa, acético.
    expect(controlReadings(w).length, diag).toBeGreaterThan(0);
    expect(contactOf(w, 'metal')[0]?.value ?? 0, diag).toBeGreaterThan(5);
    expect(contactOf(w, 'graphite')[0]?.value ?? 0, diag).toBeGreaterThan(5);
    expect(contactOf(w, 'ionicDry')[0]?.value ?? 1, diag).toBeLessThan(0.05);
    const blank = kappaReadings(w, 'blank');
    const strong = kappaReadings(w, 'strong');
    const non = kappaReadings(w, 'nonElectrolyte');
    const weak = kappaReadings(w, 'weak');
    expect(blank.length, diag).toBeGreaterThanOrEqual(2);
    expect(strong.length, diag).toBeGreaterThan(0);
    expect(non.length, diag).toBe(1);
    expect(weak.length, diag).toBe(1);
    // Soluble no siempre conduce: la sacarosa queda cerca del blanco; el NaCl, órdenes de magnitud por encima.
    expect(Math.abs(non[0].value - blank[0].value), diag).toBeLessThan(3);
    expect(strong[0].unit, diag).toBe('mS/cm');
    // La sonda sin enjuagar contaminó un vaso (lectura alta); el agua nueva con la sonda limpia vuelve al blanco.
    const last = kappaReadings(w).at(-1)!;
    expect(last.targetId, diag).toBe('bk6');
    expect(Math.abs(last.value - blank[0].value), diag).toBeLessThan(2);
    for (const k of Object.keys(w.initialTotals)) expect(Math.abs((materialTotals(w)[k as 'water'] ?? 0) - (w.initialTotals[k as 'water'] ?? 0)), k).toBeLessThan(1e-6);
  }, 180_000);
});
