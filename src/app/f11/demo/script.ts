/**
 * Guion de la demostración de F11: la MANO VIRTUAL recorre la práctica con los mismos comandos que el estudiante
 * (EPP y reconocimiento; tanque lleno por la canilla, sonda conectada, calibrada y en cero en el aire, presión en la
 * superficie y nivel leído de frente; cinco cotas en el agua; vaciado, salmuera homogeneizada y cinco cotas más;
 * probeta tarada, llenada, leída y pesada; bloque pesado en el aire, vaso cebado, colector tarado, cinco inmersiones y
 * agua rebosada; tres ensayos de flotación sin hilo con el calado leído de frente; libreta y cierre). Usa la misma ruta
 * que las pruebas de integración (route.ts), en el mismo orden y con la cámara donde corresponde. No genera nota.
 */
import type { DemoDirectorF11, DemoStepF11 } from './director';
import type { F11Notebook } from '../../../practices/practice-f11/notebook';
import type { F11Command } from '../../../simulation/f11-world/commands';
import type { FloatId } from '../../../simulation/f11-world/types';
import type { EyeTargetF11 } from '../../../engine/f11/F11Lab3D';
import { fillNotebookF11 } from '../../../practices/practice-f11/notebook-fill';
import { INSPECT_F11, emptyRouteIdsF11 } from '../../../practices/practice-f11/route';
import { routeDepthsF11, routeFloatsF11, routeImmersionsF11 } from '../../../practices/practice-f11';
import { busyF11, canState, floatsMovingF11, standMovingF11, tankLevel, wavesF11 } from '../../../simulation/f11-world/world';
import { useF11 } from '../store';

export interface DemoUiHooksF11 {
  notebook(open: boolean, tab?: string): void;
  edit(fn: (nb: F11Notebook) => void): void;
}

const num = (v: number, d: number) => v.toFixed(d).replace('.', ',');

export function buildDemoScriptF11(ui: DemoUiHooksF11): DemoStepF11[] {
  const ids = emptyRouteIdsF11();
  const D = (d: DemoDirectorF11, c: F11Command) => d.dispatch(c);
  const lens = (target: string | null) => useF11.getState().setSettings({ lens: target });

  /** Espera tiempo del MUNDO (el líquido, la sonda y el soporte avanzan con él). */
  const worldWait = async (d: DemoDirectorF11, s: number, timeoutS = 60) => {
    const t0 = d.w.timeS;
    await d.until(() => d.w.timeS - t0 >= s, timeoutS);
  };

  /** Espera una condición del mundo con plazo en tiempo DEL MUNDO. */
  const worldUntil = async (d: DemoDirectorF11, check: () => boolean, s: number) => {
    const t0 = d.w.timeS;
    await d.until(() => check() || d.w.timeS - t0 >= s, 900);
  };

  /** La cámara llega a la vista de lectura (de frente, a la altura del menisco o del índice) antes de leer. */
  const eyeLevel = async (d: DemoDirectorF11, target: EyeTargetF11) => {
    d.lab.camera?.eyeLevel(target);
    await d.wait(1);
    d.lab.camera?.settle();
    await d.wait(0.2);
  };

  const waitCalm = (d: DemoDirectorF11) => worldUntil(d, () => !wavesF11(d.w), 20).then(() => worldWait(d, 0.3));

  /** Abre una llave hasta la marca y la cierra (el llenado se acelera: es solo esperar). */
  const fillTo = async (d: DemoDirectorF11, valve: 'setTap' | 'setPump', id: string, level: number) => {
    await d.press(id, undefined, 0.4);
    D(d, { type: valve, on: true });
    d.endPress();
    await d.fast(12, () => worldUntil(d, () => tankLevel(d.w) >= level, 400));
    D(d, { type: valve, on: false });
  };

  /** Una cota: baja la membrana a pasos, purga si hay burbuja, espera la respuesta de la sonda y lee presión y regla. */
  const readDepth = async (d: DemoDirectorF11, z: number, ps: string[], zs: string[]) => {
    const from = d.w.probe.z;
    await d.press('probe01', undefined, 0.2);
    await d.steps01(from, z, 1.5, (v) => void D(d, { type: 'setProbeZ', zCm: v }), 0.03);
    d.endPress();
    await worldWait(d, 0.3);
    if (d.w.probe.bubble) {
      await d.press('probe01', undefined, 0.3);
      D(d, { type: 'purgeProbe' });
      d.endPress();
    }
    await worldWait(d, 3);
    await d.press('logger01', undefined, 0.3);
    ps.push(d.c.readProbe().id ?? '');
    d.endPress();
    await eyeLevel(d, 'ruler01');
    zs.push(d.c.readRuler().id ?? '');
    await d.wait(0.6);
    lens(null);
  };

  const waitStand = async (d: DemoDirectorF11) => {
    await d.fast(3, () => worldUntil(d, () => !standMovingF11(d.w), 60));
    await worldWait(d, d.w.params.settleS + 0.2);
  };

  return [
    {
      part: 'A', key: 'ppe',
      run: async (d) => {
        d.station('A');
        for (const item of ['coat', 'goggles', 'shoes', 'hair'] as const) D(d, { type: 'equipPpe', item, on: true });
        D(d, { type: 'startWork' });
        await d.wait(1.2);
      },
    },
    {
      part: 'A', key: 'inspect',
      run: async (d) => {
        for (const id of INSPECT_F11) {
          await d.press(id, undefined, 0.2);
          D(d, { type: 'inspect', target: id });
        }
        d.endPress();
      },
    },
    {
      part: 'A', key: 'fill',
      run: async (d) => {
        d.station('A');
        if (d.w.valves.agitator) D(d, { type: 'setAgitator', on: false });
        await fillTo(d, 'setTap', 'tapA', d.w.params.fillCm);
      },
    },
    {
      part: 'A', key: 'probe',
      run: async (d) => {
        d.station('B');
        await d.press('guide01', undefined, 0.3);
        D(d, { type: 'setGuide', xCm: 30 });
        D(d, { type: 'lockGuide', on: true });
        await d.press('logger01', undefined, 0.3);
        D(d, { type: 'connectProbe', on: true });
        if (!d.w.probe.absolute) D(d, { type: 'setRange', idx: 1 });
        D(d, { type: 'setRate', hz: 20 });
        await d.press('holder01', undefined, 0.3);
        D(d, { type: 'calibrateProbe' });
        await d.press('logger01', undefined, 0.3);
        if (!d.w.probe.absolute) D(d, { type: 'zeroProbe' });
        D(d, { type: 'newSeries' });
        d.endPress();
        await worldWait(d, 1);
        ids.p0 = d.c.readProbe().id ?? '';
        await d.wait(0.6);
        await waitCalm(d);
        await eyeLevel(d, 'scale01');
        ids.LA = d.c.readLevel().id ?? '';
        const la = d.w.readings[ids.LA]?.value ?? 0;
        d.note(d.hooks.t('f11.demo.notes.level', { L: num(la, 1) }));
        await d.wait(1.4);
        d.note(null);
        lens(null);
      },
    },
    {
      part: 'B', key: 'depthA',
      run: async (d) => {
        d.station('B');
        await d.press('probe01', undefined, 0.4);
        D(d, { type: 'mountProbe', where: 'guide' });
        D(d, { type: 'newSeries' });
        d.endPress();
        for (const z of routeDepthsF11(tankLevel(d.w))) await readDepth(d, z, ids.pAp, ids.pAz);
        D(d, { type: 'setProbeZ', zCm: 44 });
      },
    },
    {
      part: 'C', key: 'brine',
      run: async (d) => {
        d.station('A');
        await d.press('drain01', undefined, 0.4);
        D(d, { type: 'setDrain', on: true });
        d.endPress();
        await d.fast(12, () => worldUntil(d, () => d.w.tank.vol.A + d.w.tank.vol.B <= 0, 400));
        D(d, { type: 'setDrain', on: false });
        await fillTo(d, 'setPump', 'pumpB', d.w.params.fillCm);
        if (d.w.tank.strat > 0.01) {
          await d.press('agitator01', undefined, 0.4);
          D(d, { type: 'setAgitator', on: true });
          d.endPress();
          await d.fast(4, () => worldUntil(d, () => d.w.tank.strat <= 0, 20));
          D(d, { type: 'setAgitator', on: false });
        }
        await waitCalm(d);
        await eyeLevel(d, 'scale01');
        ids.LB = d.c.readLevel().id ?? '';
        await d.wait(0.6);
        lens(null);
      },
    },
    {
      part: 'C', key: 'depthB',
      run: async (d) => {
        d.station('B');
        await d.press('logger01', undefined, 0.3);
        D(d, { type: 'newSeries' });
        d.endPress();
        for (const z of routeDepthsF11(tankLevel(d.w))) await readDepth(d, z, ids.pBp, ids.pBz);
        D(d, { type: 'setProbeZ', zCm: 44 });
        await d.press('probe01', undefined, 0.3);
        D(d, { type: 'mountProbe', where: 'holder' });
        d.endPress();
      },
    },
    {
      part: 'C', key: 'cylinder',
      run: async (d) => {
        d.station('D');
        await d.press('cyl01', undefined, 0.4);
        D(d, { type: 'placeOnBalance', item: 'cyl' });
        await d.press('balance01', undefined, 0.3);
        D(d, { type: 'tareBalance' });
        D(d, { type: 'clearBalance' });
        await d.press('resB', undefined, 0.4);
        D(d, { type: 'fillCylinder' });
        d.endPress();
        await eyeLevel(d, 'cyl01');
        ids.VCyl = d.c.readCylinder().id ?? '';
        await d.wait(0.6);
        d.station('D');
        await d.press('cyl01', undefined, 0.4);
        D(d, { type: 'placeOnBalance', item: 'cyl' });
        d.endPress();
        ids.mCyl = d.c.readBalance().id ?? '';
        await d.wait(0.8);
        lens(null);
        D(d, { type: 'clearBalance' });
        D(d, { type: 'emptyCylinder' });
      },
    },
    {
      part: 'D', key: 'buoyancy',
      run: async (d) => {
        d.station('E');
        await d.press('dyn01', undefined, 0.4);
        D(d, { type: 'zeroDyn' });
        if (d.w.dyn.aimDeg !== 0) D(d, { type: 'aimDyn', deg: 0 });
        await d.press('alu1', undefined, 0.4);
        D(d, { type: 'hangBlock' });
        d.endPress();
        await worldWait(d, 2);
        await eyeLevel(d, 'dyn01');
        ids.W = d.c.readDyn().id ?? '';
        await d.wait(0.6);
        lens(null);
        d.station('E');
        await d.press('can01', undefined, 0.4);
        D(d, { type: 'primeCan' });
        d.endPress();
        await worldWait(d, 5);
        await d.press('catch01', undefined, 0.3);
        D(d, { type: 'placeOnBalance', item: 'catch' });
        D(d, { type: 'tareBalance' });
        D(d, { type: 'clearBalance' });
        D(d, { type: 'placeCatch', at: 'spout' });
        d.endPress();
        const L0 = d.w.can.vol / ((Math.PI * d.w.params.can.dCm ** 2) / 4);
        await d.press('stand01', undefined, 0.3);
        D(d, { type: 'setStand', cm: Math.round(L0 * 100) / 100 });
        d.endPress();
        await waitStand(d);
        D(d, { type: 'zeroStand' });
        const ref = d.w.stand.ref ?? L0;
        for (const depth of routeImmersionsF11(d.w.scenarios)) {
          await d.press('stand01', undefined, 0.2);
          D(d, { type: 'setStand', cm: Math.round((ref - depth) * 100) / 100 });
          d.endPress();
          await waitStand(d);
          await eyeLevel(d, 'dyn01');
          ids.bf.push(d.c.readDyn().id ?? '');
          await eyeLevel(d, 'stand01');
          ids.bi.push(d.c.readStand().id ?? '');
          await d.wait(0.4);
          lens(null);
        }
        await worldUntil(d, () => canState(d.w).level <= d.w.params.can.spoutCm + 0.01, 10);
        await worldWait(d, 1);
        d.station('D');
        await d.press('catch01', undefined, 0.4);
        D(d, { type: 'placeOnBalance', item: 'catch' });
        d.endPress();
        ids.mOver = d.c.readBalance().id ?? '';
        const m = d.w.readings[ids.mOver]?.value ?? 0;
        d.note(d.hooks.t('f11.demo.notes.overflow', { m: num(m, 1) }));
        await d.wait(1.4);
        d.note(null);
        lens(null);
        D(d, { type: 'clearBalance' });
        D(d, { type: 'emptyCatch' });
        d.station('E');
        D(d, { type: 'setStand', cm: 20 });
        await waitStand(d);
        D(d, { type: 'unhangBlock' });
      },
    },
    {
      part: 'E', key: 'flotation',
      run: async (d) => {
        d.station('D');
        await d.press('balance01', undefined, 0.3);
        D(d, { type: 'clearBalance' });
        D(d, { type: 'tareBalance' });
        d.endPress();
        for (const tr of routeFloatsF11(d.w.scenarios)) {
          const id: FloatId = tr.id;
          d.station('D');
          if (id === 'bottle1') {
            await d.press('ballast01', undefined, 0.3);
            D(d, { type: 'setBallast', grams: tr.ballast });
          }
          await d.press(id, undefined, 0.4);
          D(d, { type: 'placeOnBalance', item: id });
          d.endPress();
          ids.fm.push(d.c.readBalance().id ?? '');
          await d.wait(0.6);
          lens(null);
          D(d, { type: 'clearBalance' });
          d.station('C');
          await d.press(id, undefined, 0.4);
          D(d, { type: 'releaseObject', id, xCm: tr.x });
          D(d, { type: 'untieThread', id });
          d.endPress();
          await worldWait(d, 1);
          await worldUntil(d, () => !floatsMovingF11(d.w) && !wavesF11(d.w), 30);
          await worldWait(d, 0.3);
          d.c.lastFloat = id;
          await eyeLevel(d, 'draft');
          ids.fd.push(d.c.readDraft(id).id ?? '');
          await d.wait(0.6);
          lens(null);
          await d.press(id, undefined, 0.3);
          D(d, { type: 'recoverObject', id });
          d.endPress();
          await waitCalm(d);
        }
      },
    },
    {
      part: 'F', key: 'notebook',
      run: async (d) => {
        d.station('F');
        ui.notebook(true, 'readings');
        await d.wait(1.6);
        ui.edit((nb) => {
          fillNotebookF11(d.w, ids, nb);
        });
        for (const tab of ['setup', 'pA', 'pB', 'buoy', 'float', 'calc', 'analysis']) {
          ui.notebook(true, tab);
          await d.wait(1.2);
        }
        ui.notebook(false);
      },
    },
    {
      part: 'F', key: 'close',
      run: async (d) => {
        d.station('A');
        for (const k of ['setTap', 'setPump', 'setDrain', 'setAgitator'] as const) D(d, { type: k, on: false });
        for (const id of ['float1', 'bottle1', 'alu1'] as const) if (d.w.floats[id].where === 'tank' || d.w.floats[id].where === 'bench') D(d, { type: 'recoverObject', id });
        if (d.w.dyn.holding) D(d, { type: 'unhangBlock' });
        if (d.w.probe.mount !== 'holder') D(d, { type: 'mountProbe', where: 'holder' });
        D(d, { type: 'clearBalance' });
        if (d.w.cyl.vol > 0) D(d, { type: 'emptyCylinder' });
        if (d.w.can.catchAt === 'spout') D(d, { type: 'placeCatch', at: 'rack' });
        await d.press('towel01', undefined, 0.3);
        D(d, { type: 'mopSpill' });
        d.endPress();
        await worldUntil(d, () => !busyF11(d.w), 60);
        await d.press('rack01', undefined, 0.3);
        D(d, { type: 'closeStation' });
        d.endPress();
        await d.wait(1);
      },
    },
  ];
}
