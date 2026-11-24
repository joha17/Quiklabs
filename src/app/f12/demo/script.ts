/**
 * Guion de la demostración de F12: la MANO VIRTUAL recorre la práctica con los mismos comandos que el estudiante
 * (EPP y reconocimiento; empaquetaduras, juntas, abrazaderas, válvula, sensores en sus tomas, purga y nivel del
 * depósito; calibración y cero con la bomba detenida, diámetros internos con el calibre recto y cotas leídas de frente;
 * cinco caudales con el tramo liso; recolección cronometrada en el vaso; tramo rugoso con tres caudales; libreta y
 * cierre). Usa la misma ruta que las pruebas de integración (route.ts), en el mismo orden y con la cámara donde
 * corresponde. No genera nota.
 */
import type { DemoDirectorF12, DemoStepF12 } from './director';
import type { F12Notebook } from '../../../practices/practice-f12/notebook';
import type { F12Command } from '../../../simulation/f12-world/commands';
import type { EyeTargetF12 } from '../../../engine/f12/F12Lab3D';
import { fillNotebookF12 } from '../../../practices/practice-f12/notebook-fill';
import { INSPECT_F12, emptyRouteIdsF12 } from '../../../practices/practice-f12/route';
import { ROUTE_COLLECT_F12, ROUTE_LOSS_SPEEDS_F12, ROUTE_SPEEDS_F12, ROUTE_VALVE_F12 } from '../../../practices/practice-f12';
import { busyF12, flowingF12, settledF12, steadyF12, surgeF12 } from '../../../simulation/f12-world/world';
import { useF12 } from '../store';

export interface DemoUiHooksF12 {
  notebook(open: boolean, tab?: string): void;
  edit(fn: (nb: F12Notebook) => void): void;
}

export function buildDemoScriptF12(ui: DemoUiHooksF12): DemoStepF12[] {
  const ids = emptyRouteIdsF12();
  const D = (d: DemoDirectorF12, c: F12Command) => d.dispatch(c);
  const lens = (target: string | null) => useF12.getState().setSettings({ lens: target });

  /** Espera una condición del mundo con plazo en tiempo DEL MUNDO. */
  const worldUntil = async (d: DemoDirectorF12, check: () => boolean, s: number) => {
    const t0 = d.w.timeS;
    await d.until(() => check() || d.w.timeS - t0 >= s, 900);
  };
  const worldWait = (d: DemoDirectorF12, s: number) => worldUntil(d, () => false, s);

  /** La cámara llega a la vista de lectura (de frente, a la altura del menisco o del índice) antes de leer. */
  const eyeLevel = async (d: DemoDirectorF12, target: EyeTargetF12) => {
    d.lab.camera?.eyeLevel(target);
    await d.wait(1);
    d.lab.camera?.settle();
    await d.wait(0.2);
  };

  /** Clic de la mano sobre un objeto y el comando que produce. */
  const tap = async (d: DemoDirectorF12, id: string, c: F12Command, pauseS = 0.3) => {
    await d.press(id, undefined, pauseS);
    const r = D(d, c);
    d.endPress();
    return r;
  };

  const waitSteady = (d: DemoDirectorF12) => worldWait(d, 1).then(() => d.fast(4, () => worldUntil(d, () => steadyF12(d.w) && settledF12(d.w), 60)));

  const stopPump = async (d: DemoDirectorF12) => {
    await tap(d, 'pump01', { type: 'setPump', on: false });
    await d.fast(4, () => worldUntil(d, () => d.w.pump.n <= 0.01 && !flowingF12(d.w) && !surgeF12(d.w), 40));
    await worldWait(d, 1);
  };

  /** La perilla de la bomba gira a pasos hasta la consigna. */
  const speedTo = async (d: DemoDirectorF12, v: number) => {
    await d.press('pump01', undefined, 0.2);
    await d.steps01(d.w.pump.set, v, 0.02, (x) => void D(d, { type: 'setSpeed', value: Math.round(x * 100) / 100 }), 0.03);
    d.endPress();
  };

  const purge = async (d: DemoDirectorF12, speed: number) => {
    await speedTo(d, speed);
    await tap(d, 'pump01', { type: 'setPump', on: true });
    await worldWait(d, 2);
    await tap(d, 'purge01', { type: 'setPurge', open: true });
    await d.fast(8, () => worldUntil(d, () => d.w.circuit.airCm3 <= 0, 200));
    await tap(d, 'purge01', { type: 'setPurge', open: false });
  };

  const readPoint = async (d: DemoDirectorF12, speed: number, qs: string[], ps: string[][]) => {
    await speedTo(d, speed);
    await waitSteady(d);
    await d.press('logger01', undefined, 0.3);
    ps.push(d.c.readPressures()?.ids ?? []);
    d.endPress();
    await d.press('meter01', undefined, 0.3);
    qs.push(d.c.readFlow()?.id ?? '');
    d.endPress();
    await d.wait(0.4);
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
        for (const id of INSPECT_F12) {
          await d.press(id, undefined, 0.2);
          D(d, { type: 'inspect', target: id });
        }
        d.endPress();
      },
    },
    {
      part: 'A', key: 'assemble',
      run: async (d) => {
        d.station('B');
        await d.wait(1);
        if (d.w.stopper === 'pipe') await tap(d, 'stopper01', { type: 'removeStopper' });
        if (d.w.circuit.spool !== 'smooth') await tap(d, 'spool01', { type: 'swapSpool', kind: 'smooth' });
        for (const j of ['J1', 'J2', 'J3'] as const) {
          await tap(d, `joint${j}`, { type: 'fitGasket', joint: j });
          await tap(d, `joint${j}`, { type: 'connectJoint', joint: j, on: true });
        }
        await tap(d, 'clamp01', { type: 'clampVenturi', on: true });
        while (d.w.valve.pos !== ROUTE_VALVE_F12) {
          await tap(d, 'valve01', { type: 'setValve', pos: d.w.valve.pos + Math.sign(ROUTE_VALVE_F12 - d.w.valve.pos) }, 0.5);
        }
      },
    },
    {
      part: 'A', key: 'sensors',
      run: async (d) => {
        for (const i of [1, 2, 3] as const) {
          if (d.w.ports[i].probe !== 'static') await tap(d, `tap${i}`, { type: 'setProbe', port: i, kind: 'static' });
          await tap(d, 'panel01', { type: 'connectSensor', sensor: i, port: i });
          await tap(d, `tap${i}`, { type: 'capPort', port: i, on: false });
        }
        d.station('D');
        await d.wait(1);
        await tap(d, 'logger01', { type: 'setRange', idx: 1 });
        await tap(d, 'logger01', { type: 'setRate', hz: 20 });
        await tap(d, 'logger01', { type: 'setPressureMode', mode: 'gauge' });
      },
    },
    {
      part: 'A', key: 'purge',
      run: async (d) => {
        d.station('C');
        await purge(d, 0.5);
        await stopPump(d);
        await eyeLevel(d, 'sump01');
        ids.sump = d.c.readSump()?.id ?? '';
        await d.wait(0.6);
        lens(null);
      },
    },
    {
      part: 'B', key: 'calibrate',
      run: async (d) => {
        d.station('D');
        await d.fast(3, () => worldUntil(d, () => settledF12(d.w), 10));
        await tap(d, 'panel01', { type: 'calibrateSensors' });
        await tap(d, 'logger01', { type: 'zeroSensors' });
        await tap(d, 'logger01', { type: 'newSeries' });
        await worldWait(d, 1);
        await d.press('logger01', undefined, 0.3);
        ids.p0 = d.c.readPressures()?.ids ?? [];
        d.endPress();
        lens('logger01');
        await d.wait(1.2);
        lens(null);
      },
    },
    {
      part: 'B', key: 'geometry',
      run: async (d) => {
        d.station('E');
        await d.wait(0.8);
        for (const s of ['D1', 'D2'] as const) {
          d.c.caliper.section = s;
          d.c.caliper.face = 'inner';
          d.c.caliper.tiltDeg = 0;
          await eyeLevel(d, 'caliper01');
          ids[s] = d.c.measure()?.id ?? '';
          await d.wait(0.6);
        }
        for (const p of [1, 3] as const) {
          d.c.lastPort = p;
          await eyeLevel(d, 'ruler01');
          const id = d.c.readHeight(p)?.id ?? '';
          if (p === 1) ids.z1 = id;
          else ids.z3 = id;
          await d.wait(0.6);
        }
        lens(null);
      },
    },
    {
      part: 'C', key: 'flow',
      run: async (d) => {
        d.station('B');
        await tap(d, 'logger01', { type: 'newSeries' });
        await speedTo(d, ROUTE_SPEEDS_F12[0]);
        await tap(d, 'pump01', { type: 'setPump', on: true });
        for (const s of ROUTE_SPEEDS_F12) await readPoint(d, s, ids.q, ids.p);
        lens('logger01');
        await d.wait(1);
        lens(null);
      },
    },
    {
      part: 'D', key: 'collect',
      run: async (d) => {
        d.station('E');
        await speedTo(d, ROUTE_COLLECT_F12.speed);
        await waitSteady(d);
        await tap(d, 'timer01', { type: 'timer', action: 'reset' });
        await tap(d, 'beaker01', { type: 'moveBeaker', to: 'outlet' }, 0.5);
        await d.press('outlet01', undefined, 0.3);
        D(d, { type: 'setDiverter', to: 'beaker' });
        D(d, { type: 'timer', action: 'start' });
        d.endPress();
        await d.fast(2, () => worldUntil(d, () => d.w.collect.beakerVol > ROUTE_COLLECT_F12.mL / 3, 60));
        await d.press('meter01', undefined, 0.2);
        ids.Qm = d.c.readFlow()?.id ?? '';
        d.endPress();
        await d.fast(2, () => worldUntil(d, () => d.w.collect.beakerVol >= ROUTE_COLLECT_F12.mL, 60));
        D(d, { type: 'setDiverter', to: 'sump' });
        D(d, { type: 'timer', action: 'stop' });
        await tap(d, 'beaker01', { type: 'moveBeaker', to: 'bench' }, 0.5);
        await eyeLevel(d, 'beaker01');
        ids.V = d.c.readBeaker()?.id ?? '';
        await d.wait(0.6);
        await eyeLevel(d, 'timer01');
        ids.t = d.c.readTimer()?.id ?? '';
        await d.wait(0.6);
        lens(null);
        await tap(d, 'beaker01', { type: 'emptyBeaker' });
      },
    },
    {
      part: 'E', key: 'loss',
      run: async (d) => {
        d.station('B');
        await stopPump(d);
        await tap(d, 'logger01', { type: 'newSeries' });
        await tap(d, 'spare01', { type: 'swapSpool', kind: 'rough' }, 0.5);
        await purge(d, ROUTE_LOSS_SPEEDS_F12[0]);
        for (const s of ROUTE_LOSS_SPEEDS_F12) await readPoint(d, s, ids.lq, ids.lp);
      },
    },
    {
      part: 'F', key: 'notebook',
      run: async (d) => {
        d.station('F');
        ui.notebook(true, 'readings');
        await d.wait(1.6);
        ui.edit((nb) => {
          fillNotebookF12(d.w, ids, nb);
        });
        for (const tab of ['setup', 'flow', 'loss', 'calc', 'analysis']) {
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
        if (d.w.collect.diverter === 'beaker') D(d, { type: 'setDiverter', to: 'sump' });
        if (d.w.timer.running) D(d, { type: 'timer', action: 'stop' });
        await stopPump(d);
        if (d.w.safety.block) D(d, { type: 'acknowledge' });
        D(d, { type: 'setPurge', open: false });
        if (d.w.collect.beakerAt !== 'bench') D(d, { type: 'moveBeaker', to: 'bench' });
        if (d.w.collect.beakerVol > 0) D(d, { type: 'emptyBeaker' });
        await tap(d, 'towel01', { type: 'mopSpill' });
        await worldUntil(d, () => !busyF12(d.w), 60);
        D(d, { type: 'closeStation' });
        await d.wait(1);
      },
    },
  ];
}
