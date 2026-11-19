/**
 * Guion de la demostración de F05: la MANO VIRTUAL recorre la práctica con los mismos comandos que el estudiante
 * (EPP, reconocimiento, bloque y lastre en la balanza tarada, temperatura, diagramas de cuerpo libre, célula de carga
 * conectada, calibrada y en cero, cable a la altura del gancho, tirones con el pico y la meseta elegidos en la gráfica,
 * barrido de carga, ángulos críticos en madera y papel leídos de frente, bajada a 30° con las compuertas, libreta y
 * cierre). Usa la misma ruta que las pruebas de integración (route.ts), paso a paso y con la cámara donde corresponde.
 * No genera nota.
 */
import type { DemoDirectorF05, DemoStepF05 } from './director';
import type { F05Notebook } from '../../../practices/practice-f05/notebook';
import type { F05Command, FbdBody, Material } from '../../../simulation/f05-world/commands';
import { fillNotebookF5 } from '../../../practices/practice-f05/notebook-fill';
import { ANGLE_MATERIALS, INSPECT_F5, ROUTE_DRIVE, SLIDE_DEG, emptyRouteIdsF5, pullWindows } from '../../../practices/practice-f05/route';
import { BLOCK_START_S } from '../../../simulation/f05-world/geometry';
import { busyF5, fbdNeeds } from '../../../simulation/f05-world/world';
import { useF05 } from '../store';

export interface DemoUiHooksF05 {
  notebook(open: boolean, tab?: string): void;
  edit(fn: (nb: F05Notebook) => void): void;
}

const num = (v: number, d: number) => v.toFixed(d).replace('.', ',');

export function buildDemoScriptF05(ui: DemoUiHooksF05): DemoStepF05[] {
  const ids = emptyRouteIdsF5();
  const D = (d: DemoDirectorF05, c: F05Command) => d.dispatch(c);
  const lens = (target: string | null) => useF05.getState().setSettings({ lens: target });

  /** Objeto en la balanza: lo pone, espera a que la lectura se asiente (1,5 s del mundo) y la lee. */
  const weigh = async (d: DemoDirectorF05, id: string) => {
    await d.press(id, undefined, 0.4);
    D(d, { type: 'placeOnBalance', id });
    d.endPress();
    const t0 = d.w.timeS;
    d.lab.camera?.eyeLevel('balance01');
    await d.until(() => d.w.timeS - t0 > 2, 6);
    await d.press('balance01', undefined, 0.3);
    const r = d.c.readBalance();
    d.endPress();
    await d.wait(1);
    D(d, { type: 'removeFromBalance' });
    return r.id ?? '';
  };

  /** Diagrama de cuerpo libre: cada flecha con quien la ejerce, luego se bloquea. */
  const fbd = async (d: DemoDirectorF05, body: FbdBody) => {
    await d.press('block01', undefined, 0.5);
    for (const [force, dir, partner] of fbdNeeds(body)) {
      D(d, { type: 'drawForce', body, force, dir, partner });
      await d.wait(0.45);
    }
    D(d, { type: 'lockFbd', body });
    await d.wait(0.8);
    d.endPress();
  };

  /** Lleva el tablero a un ángulo girando el elevador (de a varias vueltas, con la mano en la manivela). */
  const tilt = async (d: DemoDirectorF05, deg: number) => {
    await d.press('elevator01', undefined, 0.3);
    for (let i = 0; i < 60; i++) {
      const turns = Math.round((deg - d.w.plane.relDeg) / d.w.params.degPerTurn);
      if (!turns) break;
      D(d, { type: 'turnElevator', turns: Math.max(-10, Math.min(10, turns)) });
      await d.wait(0.12);
    }
    d.endPress();
  };

  /** Un tirón: engancha, arranca el motor, espera el registro, elige las ventanas en la gráfica y lee pico y meseta. */
  const pull = async (d: DemoDirectorF05, show: boolean) => {
    await d.press('spring01', undefined, 0.3);
    D(d, { type: 'attachCable', on: true });
    await d.press('puller01', undefined, 0.3);
    D(d, { type: 'setDrive', cmS: d.w.params.springC < 2 ? 1 : ROUTE_DRIVE });
    d.endPress();
    if (show) lens('logger01');
    await d.fast(show ? 3 : 8, () => d.until(() => !busyF5(d.w), 70));
    const rec = d.w.pulls[d.w.pulls.length - 1];
    const win = pullWindows(rec);
    if (show) {
      d.note(d.hooks.t('f05.demo.notes.window', { p: num(win.peak.t1, 2), t0: num(win.plateau.t0, 1), t1: num(win.plateau.t1, 1) }));
      await d.wait(2.2);
    }
    const peak = D(d, { type: 'readPull', t0: win.peak.t0, t1: win.peak.t1 }).id ?? '';
    const mean = D(d, { type: 'readPull', t0: win.plateau.t0, t1: win.plateau.t1 }).id ?? '';
    if (show) await d.wait(1.4);
    lens(null);
    d.note(null);
    await d.press('puller01', undefined, 0.3);
    D(d, { type: 'returnPuller' });
    D(d, { type: 'attachCable', on: false });
    await d.press('block01', undefined, 0.3);
    D(d, { type: 'placeBlock', s: BLOCK_START_S });
    d.endPress();
    return { peak, mean };
  };

  /** Ángulo crítico: inclina hasta unos grados antes y luego de a una vuelta hasta que el bloque arranca; lee de frente. */
  const critical = async (d: DemoDirectorF05, mat: Material) => {
    if (d.w.surface.material !== mat) {
      await d.press(mat === 'wood' ? 'stripRack01' : mat === 'paper' ? 'stripPaper' : 'stripRubber', undefined, 0.4);
      D(d, { type: 'setSurface', material: mat });
      d.endPress();
    }
    D(d, { type: 'inspect', target: 'plane01' });
    const mu = d.w.params.mu[mat].s;
    await tilt(d, Math.max(0, Math.floor((Math.atan(mu * d.w.params.wornFactor) * 180) / Math.PI) - 3));
    await d.wait(1);
    await d.press('elevator01', undefined, 0.2);
    for (let i = 0; i < 200 && d.w.tilt.slipVersion === null && d.w.plane.relDeg < 44; i++) {
      D(d, { type: 'turnElevator', turns: 1 });
      await d.wait(0.5);
    }
    d.endPress();
    await d.wait(2);
    d.lab.camera?.eyeLevel('gonio01');
    await d.wait(1.2);
    await d.press('gonio01', undefined, 0.3);
    const id = d.c.readAngle('plane').id ?? '';
    d.endPress();
    await d.wait(1);
    await tilt(d, 0);
    await d.wait(1);
    D(d, { type: 'placeBlock', s: BLOCK_START_S });
    return id;
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
        for (const id of INSPECT_F5) {
          await d.press(id, undefined, 0.35);
          D(d, { type: 'inspect', target: id });
        }
        d.endPress();
      },
    },
    {
      part: 'B', key: 'masses',
      run: async (d) => {
        d.station('B');
        for (const m of ['w250a', 'w250b']) if (d.w.objects[m].support !== 'rack') D(d, { type: 'placeMass', id: m, on: 'rack' });
        await d.press('balance01', undefined, 0.5);
        D(d, { type: 'tareBalance' });
        d.endPress();
        await d.wait(0.6);
        ids.blockM = await weigh(d, 'block01');
        ids.ballastM = await weigh(d, 'w250a');
        d.lab.camera?.eyeLevel('thermo01');
        await d.press('thermo01', undefined, 0.6);
        ids.temp = d.c.readTemp().id ?? '';
        d.endPress();
        d.note(d.hooks.t('f05.demo.notes.masses'));
        await d.wait(1.4);
      },
    },
    {
      part: 'F', key: 'fbd',
      run: async (d) => {
        d.station('F');
        await fbd(d, 'blockPull');
        await fbd(d, 'blockSlide');
        d.note(d.hooks.t('f05.demo.notes.fbd'));
        await d.wait(1.6);
      },
    },
    {
      part: 'C', key: 'sensor',
      run: async (d) => {
        d.station('C');
        if (d.w.surface.material !== 'wood') D(d, { type: 'setSurface', material: 'wood' });
        await d.press('elevator01', undefined, 0.4);
        D(d, { type: 'setLock', on: true });
        await d.press('plane01', undefined, 0.4);
        D(d, { type: 'clampBase', on: true });
        d.endPress();
        await tilt(d, 0);
        D(d, { type: 'placeBlock', s: BLOCK_START_S });
        await d.press('load01', undefined, 0.4);
        D(d, { type: 'connect', channel: 'load01', on: true });
        if (d.w.sensor.rangeIdx < 1) D(d, { type: 'setRange', n: 1 });
        if (d.w.sensor.angleDeg !== 0) D(d, { type: 'mountSensor', angleDeg: 0 });
        await d.press('logger01', undefined, 0.4);
        D(d, { type: 'setRate', hz: 200 });
        await d.press('load01', undefined, 0.4);
        D(d, { type: 'calibrateSensor' });
        await d.wait(0.4);
        D(d, { type: 'zeroSensor' });
        await d.press('puller01', undefined, 0.4);
        D(d, { type: 'setCableHeight', cm: 2 });
        d.endPress();
        d.note(d.hooks.t('f05.demo.notes.sensor'));
        await d.wait(1.6);
      },
    },
    {
      part: 'C', key: 'pulls',
      run: async (d) => {
        for (let i = 0; i < 3; i++) {
          const r = await pull(d, i === 0);
          ids.statics.push(r.peak);
          ids.kinetics.push(r.mean);
        }
      },
    },
    {
      part: 'C', key: 'sweep',
      run: async (d) => {
        ids.loads.push(ids.kinetics[0]);
        for (const m of ['w250a', 'w250b']) {
          await d.press(m, undefined, 0.4);
          D(d, { type: 'placeMass', id: m, on: 'block', offsetCm: 0 });
          d.endPress();
          ids.loads.push((await pull(d, false)).mean);
        }
        for (const m of ['w250a', 'w250b']) D(d, { type: 'placeMass', id: m, on: 'rack' });
        d.note(d.hooks.t('f05.demo.notes.sweep'));
        await d.wait(1.4);
      },
    },
    {
      part: 'D', key: 'angles',
      run: async (d) => {
        d.station('D');
        for (const mat of ANGLE_MATERIALS) ids.angles.push({ id: await critical(d, mat), material: mat });
        d.note(d.hooks.t('f05.demo.notes.angles'));
        await d.wait(1.4);
      },
    },
    {
      part: 'E', key: 'slide',
      run: async (d) => {
        d.station('E');
        await d.press('stripRack01', undefined, 0.4);
        D(d, { type: 'setSurface', material: 'wood' });
        D(d, { type: 'inspect', target: 'plane01' });
        await d.press('logger01', undefined, 0.4);
        D(d, { type: 'connect', channel: 'gates', on: true });
        D(d, { type: 'connect', channel: 'video', on: true });
        d.endPress();
        for (const g of ['gate1', 'gate2'] as const) {
          d.lab.camera?.eyeLevel(g);
          await d.wait(1.1);
          await d.press(g, undefined, 0.3);
          ids[g === 'gate1' ? 'g1' : 'g2'] = d.c.readScale(g).id ?? '';
          d.endPress();
        }
        d.station('E');
        await tilt(d, SLIDE_DEG);
        await d.press('block01', undefined, 0.4);
        D(d, { type: 'placeBlock', s: 'top' });
        d.endPress();
        await d.wait(1.5);
        d.lab.camera?.eyeLevel('gonio01');
        await d.wait(1.1);
        ids.slideTheta = d.c.readAngle('plane').id ?? '';
        d.station('E');
        await d.wait(0.8);
        await d.press('block01', undefined, 0.3);
        d.c.release();
        d.endPress();
        await d.until(() => !busyF5(d.w), 15);
        lens('logger01');
        await d.wait(1.6);
        ids.slide = D(d, { type: 'readSlide' }).id ?? '';
        await d.wait(1.4);
        lens(null);
      },
    },
    {
      part: 'F', key: 'notebook',
      run: async (d) => {
        d.station('F');
        ui.notebook(true, 'readings');
        await d.wait(1.6);
        ui.edit((nb) => {
          fillNotebookF5(d.w, ids, nb);
        });
        for (const tab of ['setup', 'static', 'kinetic', 'load', 'angles', 'slide', 'calc', 'analysis']) {
          ui.notebook(true, tab);
          await d.wait(1.2);
        }
        ui.notebook(false);
      },
    },
    {
      part: 'A', key: 'close',
      run: async (d) => {
        d.station('A');
        await tilt(d, 0);
        await d.wait(1);
        D(d, { type: 'placeBlock', s: BLOCK_START_S });
        await d.press('massRack01', undefined, 0.4);
        D(d, { type: 'closeStation' });
        d.endPress();
        await d.wait(1);
      },
    },
  ];
}
