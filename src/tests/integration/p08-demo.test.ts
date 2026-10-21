/**
 * Demostración de la Práctica 8 sin navegador (§16): el mismo director y el mismo controlador que en la escena, con
 * una cámara y una vista mínimas, para las tres rutas. Recorre los gestos reales (verter, gotero, espátula, piseta,
 * embudo, botones de los equipos) y debe dejar producto aislado y analizado, con UN solo error deliberado: la lectura
 * de la probeta con paralaje (§16.6). La cinta de la demo se reproduce igual por el dominio puro (§16, contrato).
 */
import { describe, expect, it } from 'vitest';
import { OrganicRuntime } from '../../app/p8/runtime';
import { OrganicLab3D, type CameraApi08 } from '../../engine/organic/OrganicLab3D';
import type { OrganicHost } from '../../engine/organic/host';
import { DemoDirector08 } from '../../app/p8/demo/director';
import { buildDemoScript08 } from '../../app/p8/demo/script';
import { newPractice08World } from '../../practices/practice-08';
import { emptyP08Notebook } from '../../practices/practice-08/notebook';
import { massG } from '../../simulation/organic-chemistry/species';
import { conservedTotals08, dispatchP08, levels08, stepP08World } from '../../simulation/organic-world/world';
import type { P08Command } from '../../simulation/organic-world/commands';
import type { RouteId } from '../../simulation/organic-world/types';
import { productMassReadings, readingsOf } from '../../practices/practice-08/expected-results';
import { p08StageEvidence } from '../../practices/practice-08/evidence';

function harness(route: RouteId, seed = 20261008) {
  const opts = { mode: 'PRACTICE' as const, seed, route, scenarios: [] };
  const world = newPractice08World(opts);
  const rt = new OrganicRuntime(world, 'demo-test');
  const tape: Array<[number, P08Command]> = [];
  const orig = rt.dispatch.bind(rt);
  rt.dispatch = (c) => {
    tape.push([rt.world.tick, JSON.parse(JSON.stringify(c))]);
    return orig(c);
  };
  for (const item of ['goggles', 'coat', 'gloves', 'hair'] as const) rt.dispatch({ type: 'setPPE', item, enabled: true });
  rt.dispatch({ type: 'startWork' });
  let selected: string | null = null;
  const host: OrganicHost = {
    runtime: rt, t: (k) => k, getSelected: () => selected, select: (id) => { selected = id; },
    notify: () => {}, sound: () => {}, reducedMotion: () => true, guidedHints: () => false, showNames: () => false, nameTag: (id) => id,
  };
  const lab = new OrganicLab3D(host, 'LOW');
  const pos = { x: 0, y: 0, z: 40 };
  const camera: Partial<CameraApi08> = {
    goToStation: () => {}, lookAt: (_x, _y, z) => { pos.z = z + 30; }, focusObject: () => {}, orbit: () => {}, zoomBy: () => {}, reset: () => {}, settle: () => {},
    setOrbitEnabled: () => {}, edgePan: () => {}, screenOf: () => ({ x: 0, y: 0 }),
    // A la altura del ojo: la cámara queda horizontal al menisco (como la cámara real).
    eyeLevel: (id) => { if (rt.world.vessels[id]) pos.z = levels08(rt.world, id).surface; },
    position: () => ({ ...pos }),
  };
  lab.camera = camera as CameraApi08;
  lab.controller.view = { toBench: () => ({ x: 0, y: 0 }), pick: () => null, viewW: () => 1000, setOrbitEnabled: () => {}, edgePan: () => {} };
  const nb = emptyP08Notebook(route, 'demo');
  let done = false;
  const steps: string[] = [];
  const director = new DemoDirector08(lab, buildDemoScript08({ notebook: () => {}, edit: (fn) => fn(nb) }, route), {
    onStep: (i) => {
      steps.push(director.steps[i].key);
      if (process.env.P8_DEMO_DEBUG) {
        const w = rt.world;
        const sum = Object.values(w.vessels).filter((v) => ['rf', 'sf', 'bkAq', 'erDry', 'fracPot', 'vialP', 'fpFine', 'kitasato', 'cyl10', 'cyl25'].includes(v.id))
          .map((v) => `${v.id}[${w.objects[v.id]?.support}]:${Object.entries(v.liq).map(([k, n]) => `${k}=${((n ?? 0) * 1000).toFixed(1)}`).join(',')}`).join(' | ');
        console.log(`@${director.steps[i].key} t=${w.timeS.toFixed(0)} bench=${JSON.stringify(w.outside.bench)} ${sum}`);
      }
    },
    onNote: () => {}, onDone: () => { done = true; },
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
  return { rt, lab, director, nb, steps, frame, tape, opts, isDone: () => done };
}

describe('Práctica 8 — demostración sin navegador', () => {
  for (const route of ['ISO', 'ASA', 'MS'] as const) {
    it(`${route}: se reproduce completa con los gestos reales y deja producto aislado y analizado (§16)`, async () => {
      const h = harness(route);
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
      const diag = `pasos ${h.steps.join(',')} · avisos ${warns.join(' | ')} · errores ${errs.join(',')} · alertas ${bad.join(',')} · lecturas ${w.readingOrder.map((id) => `${id}:${w.readings[id].targetId}=${w.readings[id].value}${w.readings[id].valid ? '' : '✗'}`).join(' ')}`;
      expect(h.isDone(), diag).toBe(true);
      expect(h.lab.controller.held, diag).toBeNull();
      expect(warns, diag).toEqual([]);
      expect(errs, diag).toEqual(['err:ORG09']);
      expect(bad, diag).toEqual([]);
      // La mano virtual no derrama: todo lo vertido llega a su receptor.
      expect(massG(w.outside.bench), diag).toBeLessThan(0.02);
      const flags = p08StageEvidence(w, h.nb);
      expect(flags.product_isolated, diag).toBe(true);
      expect(flags.product_characterized, diag).toBe(true);
      expect(productMassReadings(w).length, diag).toBeGreaterThan(0);
      expect(readingsOf(w, 'purity')[0]?.value ?? 0, diag).toBeGreaterThan(90);
      const app = Number(h.nb.tableC.apparentYield.replace(',', '.'));
      expect(app, diag).toBeGreaterThan(30);
      // Conservación y reproducción de la cinta por el dominio puro.
      const e0 = conservedTotals08(newPractice08World(h.opts));
      const e1 = conservedTotals08(w);
      for (const k of Object.keys(e0)) expect(Math.abs(e1[k] - e0[k]), k).toBeLessThan(1e-9);
      const replay = newPractice08World(h.opts);
      let i = 0;
      while (replay.tick < w.tick || i < h.tape.length) {
        while (i < h.tape.length && h.tape[i][0] === replay.tick) dispatchP08(replay, h.tape[i++][1]);
        if (replay.tick >= w.tick) break;
        stepP08World(replay);
      }
      expect(JSON.stringify(replay.vessels)).toBe(JSON.stringify(w.vessels));
    }, 600000);
  }
});
