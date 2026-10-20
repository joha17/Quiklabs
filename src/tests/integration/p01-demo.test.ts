/**
 * Demostración de la Práctica 1 sin navegador: el mismo director y el mismo controlador que en la escena, con una
 * cámara y una vista mínimas. Debe terminar con la técnica bien hecha y sin incidentes (los mismos gestos del estudiante).
 */
import { describe, expect, it } from 'vitest';
import { DensityRuntime } from '../../app/p01/runtime';
import { DensityLab3D, type CameraApi01, type EyeTarget01 } from '../../engine/density/DensityLab3D';
import type { DensityHost } from '../../engine/density/host';
import { cylinderLevelZ, pipetteLevelZ } from '../../engine/density/layout';
import { DemoDirector01 } from '../../app/p01/demo/director';
import { buildDemoScript01 } from '../../app/p01/demo/script';
import { newPractice01World } from '../../practices/practice-01';
import { emptyP01Notebook } from '../../practices/practice-01/notebook';
import { conservedTotals } from '../../simulation/density-world/world';
import { displacementReadings, trialReadings } from '../../practices/practice-01/expected-results';

function harness(seed = 20261001) {
  const world = newPractice01World({ mode: 'PRACTICE', seed, scenarios: [] });
  const rt = new DensityRuntime(world, 'demo-test');
  for (const item of ['coat', 'goggles', 'shoes', 'hair'] as const) rt.dispatch({ type: 'equipPpe', item, on: true });
  rt.dispatch({ type: 'startWork' });
  let selected: string | null = null;
  const notes: string[] = [];
  const host: DensityHost = {
    runtime: rt, t: (k) => k, getSelected: () => selected, select: (id) => { selected = id; },
    notify: (_l, key) => notes.push(key), sound: () => {}, reducedMotion: () => true, guidedHints: () => false, showNames: () => false, nameTag: (id) => id,
  };
  const lab = new DensityLab3D(host, 'LOW');
  const pos = { x: 0, y: 0, z: 40 };
  const camera: Partial<CameraApi01> = {
    goToStation: () => { pos.z = 40; }, lookAt: () => { pos.z = 40; }, focusObject: () => {}, orbit: () => {}, zoomBy: () => {}, reset: () => {}, settle: () => {},
    setOrbitEnabled: () => {}, edgePan: () => {}, screenOf: () => ({ x: 0, y: 0 }),
    eyeLevel: (t: EyeTarget01) => {
      const o = world.objects[t === 'balance' ? 'balance01' : t].pose;
      pos.x = o.x;
      pos.y = o.y;
      pos.z = t === 'cylinder50' ? cylinderLevelZ(rt.world) : t === 'pipette25' ? pipetteLevelZ(rt.world) : o.z + 10;
    },
    position: () => ({ ...pos }),
  };
  lab.camera = camera as CameraApi01;
  lab.controller.view = { toBench: () => ({ x: 0, y: 0 }), pick: () => null, viewW: () => 1000, setOrbitEnabled: () => {}, edgePan: () => {} };
  const nb = emptyP01Notebook();
  let done = false;
  const steps: string[] = [];
  const director = new DemoDirector01(lab, buildDemoScript01({ notebook: () => {}, edit: (fn) => fn(nb) }), {
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
  return { rt, lab, director, nb, steps, notes, frame, isDone: () => done };
}

describe('Práctica 1 — demostración sin navegador', () => {
  it('se reproduce completa: dos muestras limpias, clavos sumergidos, cilindro medido y sin incidentes', async () => {
    const h = harness();
    const warns: string[] = [];
    const orig = console.warn;
    console.warn = (...a: unknown[]) => warns.push(a.join(' '));
    const run = h.director.run();
    try {
      for (let i = 0; i < 400_000 && !h.isDone(); i++) {
        h.frame(1 / 30);
        if (i % 50 === 0) await Promise.resolve();
        await Promise.resolve();
      }
      await run;
    } finally {
      console.warn = orig;
    }
    const w = h.rt.world;
    const errs = Object.keys(w.evidence).filter((k) => k.startsWith('err:'));
    const bad = w.events.filter((e) => e.severity === 'CRITICAL' || e.severity === 'ALERT' || e.severity === 'WARN').map((e) => `${e.code}@${e.t.toFixed(0)}`);
    const diag = `pasos ${h.steps.join(',')} · avisos ${warns.join(' | ')} · errores ${errs.join(',')} · eventos ${bad.join(',')} · incidente ${w.safety.incident?.code ?? '-'}`;
    expect(h.isDone(), diag).toBe(true);
    expect(warns, diag).toEqual([]);
    expect(errs, diag).toEqual([]);
    expect(bad, diag).toEqual([]);
    expect(w.samples.map((s) => s.series), diag).toEqual(['room', 'cold']);
    for (const s of w.samples) expect(s.flags, `${s.series} ${diag}`).toEqual([]);
    expect(w.nails.every((n) => n.where === 'cylinder50'), diag).toBe(true);
    const lengths = w.readingOrder.map((id) => w.readings[id]).filter((r) => r.kind === 'length' && r.target !== 'empty');
    expect(lengths.length, diag).toBe(4);
    // Volúmenes de la técnica: 25 mL en la probeta de prueba y ~20 mL antes de los clavos (enrasados con la piseta).
    const tr = trialReadings(w);
    const dr = displacementReadings(w);
    console.log(`· prueba probeta ${tr.probe?.value} · pipeta ${tr.pipette?.value} · Vi ${dr.initial?.value} · Vf ${dr.final?.value} · t ${(w.timeS / 60).toFixed(1)} min`);
    expect(Math.abs((tr.probe?.value ?? 0) - 25), diag).toBeLessThanOrEqual(1);
    expect(Math.abs((dr.initial?.value ?? 0) - 20), diag).toBeLessThanOrEqual(1);
    expect((dr.final?.value ?? 0) - (dr.initial?.value ?? 0), diag).toBeGreaterThan(1.5);
    // Todas las lecturas limpias (como en el registro de la libreta: ✓).
    const flagged = w.readingOrder.map((id) => w.readings[id]).filter((r) => r.qualityFlags.some((q) => q !== 'TARE' && q !== 'AIR'));
    expect(flagged.map((r) => `${r.id}:${r.qualityFlags.join('+')}`), diag).toEqual([]);
    const c = conservedTotals(w);
    expect(Math.abs(c.water - w.initialTotals.waterMassG)).toBeLessThan(1e-6);
    expect(h.nb.tableB.room.mass.readingId, diag).toBeTruthy();
    expect(h.nb.tableB.cold.mass.readingId, diag).toBeTruthy();
  }, 120_000);
});
