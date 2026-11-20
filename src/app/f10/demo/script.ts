/**
 * Guion de la demostración de F10: la MANO VIRTUAL recorre la práctica con los mismos comandos que el estudiante
 * (EPP y reconocimiento; viga y carga pesadas en el dinamómetro en cero; mesada nivelada y centro de masa buscado en la
 * cuña; apoyos corridos, trabados, sensores en cero y viga asentada; cuatro posiciones de la carga con el gancho
 * cerrado y las dos reacciones leídas; probeta medida con el calibre, alineada y tomada; comparador calibrado, axial y
 * en cero; cinco escalones elásticos de la manivela; ciclo plástico registrado; libreta y cierre). Usa la misma ruta
 * que las pruebas de integración (route.ts), paso a paso y con la cámara donde corresponde. No genera nota.
 */
import type { DemoDirectorF10, DemoStepF10 } from './director';
import type { F10Notebook } from '../../../practices/practice-f10/notebook';
import type { F10Command, TapeTarget } from '../../../simulation/f10-world/commands';
import type { SupportId } from '../../../simulation/f10-world/types';
import { fillNotebookF10 } from '../../../practices/practice-f10/notebook-fill';
import { INSPECT_F10, emptyRouteIdsF10 } from '../../../practices/practice-f10/route';
import { routeLoadsF10, routePlasticF10, routeStepsF10, routeSupportsF10 } from '../../../practices/practice-f10';
import { busyF10, pressMovingF10, wedgeTiltF10 } from '../../../simulation/f10-world/world';
import { useF10 } from '../store';

export interface DemoUiHooksF10 {
  notebook(open: boolean, tab?: string): void;
  edit(fn: (nb: F10Notebook) => void): void;
}

const num = (v: number, d: number) => v.toFixed(d).replace('.', ',');

export function buildDemoScriptF10(ui: DemoUiHooksF10): DemoStepF10[] {
  const ids = emptyRouteIdsF10();
  const D = (d: DemoDirectorF10, c: F10Command) => d.dispatch(c);
  const lens = (target: string | null) => useF10.getState().setSettings({ lens: target });

  /** Espera tiempo del MUNDO (la viga, el dinamómetro y la prensa avanzan con él). */
  const worldWait = async (d: DemoDirectorF10, s: number, timeoutS = 60) => {
    const t0 = d.w.timeS;
    await d.until(() => d.w.timeS - t0 >= s, timeoutS);
  };

  /** Espera una condición del mundo con plazo en tiempo DEL MUNDO. */
  const worldUntil = async (d: DemoDirectorF10, check: () => boolean, s: number) => {
    const t0 = d.w.timeS;
    await d.until(() => check() || d.w.timeS - t0 >= s, 600);
  };

  /** Cinta leída de frente, con el ojo en la normal de la escala (la cámara llega antes de leer). */
  const readTape = async (d: DemoDirectorF10, target: TapeTarget) => {
    d.c.lastTape = target;
    d.lab.camera?.eyeLevel('tape01');
    await d.wait(1);
    d.lab.camera?.settle();
    await d.wait(0.2);
    const r = d.c.readTape(target);
    await d.wait(0.9);
    lens(null);
    return r.id ?? '';
  };

  /** Cuelga la viga o la carga del dinamómetro, espera a que deje de mecerse, lee de frente y la descuelga. */
  const weigh = async (d: DemoDirectorF10, id: 'beam' | 'load1') => {
    d.station('B');
    await d.press(id === 'beam' ? 'beam01' : 'load1', undefined, 0.4);
    D(d, { type: 'hangOnDyn', id });
    d.endPress();
    d.lab.camera?.eyeLevel('dyn01');
    await worldWait(d, 2, 8);
    d.lab.camera?.settle();
    await d.press('dyn01', undefined, 0.3);
    const r = d.c.readDyn();
    d.endPress();
    await d.wait(0.9);
    lens(null);
    D(d, { type: 'unhangDyn' });
    return r.id ?? '';
  };

  /** Lee las dos reacciones (pantallas de frente) y la posición de la carga, con la viga quieta. */
  const readEq = async (d: DemoDirectorF10) => {
    await worldUntil(d, () => d.w.timeS >= d.w.beam.settleUntil + 0.2, 6);
    for (const sid of ['A', 'B'] as SupportId[]) {
      await d.press(sid === 'A' ? 'supportA' : 'supportB', undefined, 0.3);
      const r = d.c.readCell(sid);
      d.endPress();
      (sid === 'A' ? ids.ra : ids.rb).push(r.id ?? '');
      await d.wait(0.5);
    }
    lens(null);
    ids.x.push(await readTape(d, 'load1'));
  };

  /** Lleva el travesaño a una consigna y espera que llegue y deje de vibrar. */
  const crank = async (d: DemoDirectorF10, mm: number) => {
    await d.press('crank01', undefined, 0.3);
    D(d, { type: 'setCrank', mm });
    d.endPress();
    await d.fast(3, () => worldUntil(d, () => !pressMovingF10(d.w), 60));
    await worldWait(d, d.w.params.vibrationS + 0.2);
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
        for (const id of INSPECT_F10) {
          await d.press(id, undefined, 0.25);
          D(d, { type: 'inspect', target: id });
        }
        d.endPress();
      },
    },
    {
      part: 'A', key: 'weights',
      run: async (d) => {
        d.station('B');
        await d.press('dyn01', undefined, 0.4);
        D(d, { type: 'zeroDyn' });
        if (d.w.dyn.aimDeg !== 0) D(d, { type: 'aimDyn', deg: 0 });
        d.endPress();
        ids.Wb = await weigh(d, 'beam');
        ids.W1 = await weigh(d, 'load1');
        const wb = d.w.readings[ids.Wb]?.value ?? 0;
        const w1 = d.w.readings[ids.W1]?.value ?? 0;
        d.note(d.hooks.t('f10.demo.notes.weights', { wb: num(wb, 2), w1: num(w1, 2) }));
        await d.wait(1.6);
        d.note(null);
      },
    },
    {
      part: 'A', key: 'cg',
      run: async (d) => {
        d.station('E');
        await d.press('level01', undefined, 0.4);
        D(d, { type: 'levelBench' });
        d.endPress();
        d.station('A');
        await d.press('beam01', undefined, 0.4);
        D(d, { type: 'placeBeam', where: 'wedge' });
        d.endPress();
        let lo = 20;
        let hi = 100;
        for (let i = 0; i < 20; i++) {
          const t = wedgeTiltF10(d.w);
          if (t === 'level') break;
          if (t === 'left') hi = d.w.beam.wedgeS;
          else lo = d.w.beam.wedgeS;
          await d.press('beam01', undefined, 0.15);
          D(d, { type: 'slideOnWedge', sCm: (lo + hi) / 2 });
          await d.wait(0.35);
        }
        d.endPress();
        ids.xCG = await readTape(d, 'cg');
        const x = d.w.readings[ids.xCG]?.value ?? 0;
        d.note(d.hooks.t('f10.demo.notes.cg', { cm: num(x, 1) }));
        await d.wait(1.4);
        d.note(null);
        await d.press('beam01', undefined, 0.3);
        D(d, { type: 'placeBeam', where: 'rack' });
        d.endPress();
      },
    },
    {
      part: 'B', key: 'supports',
      run: async (d) => {
        d.station('A');
        const [sA, sB] = routeSupportsF10(d.w.scenarios);
        for (const [sid, to] of [['A', sA], ['B', sB]] as const) {
          const obj = sid === 'A' ? 'supportA' : 'supportB';
          await d.press(obj, undefined, 0.3);
          await d.steps01(d.w.supports[sid].s, to, 2, (v) => void D(d, { type: 'setSupport', id: sid, sCm: v }), 0.03);
          D(d, { type: 'setSupport', id: sid, sCm: to });
          D(d, { type: 'clampSupport', id: sid, on: true });
          if (d.w.supports[sid].loose) D(d, { type: 'tightenKnife', id: sid });
          d.endPress();
        }
        d.station('F');
        await d.press('logger01', undefined, 0.4);
        D(d, { type: 'connect', channel: 'cells', on: true });
        d.endPress();
        d.station('A');
        await d.press('supportA', undefined, 0.3);
        D(d, { type: 'zeroCells' });
        await d.press('beam01', undefined, 0.4);
        D(d, { type: 'placeBeam', where: 'supports' });
        await d.wait(0.4);
        D(d, { type: 'seatBeam' });
        d.endPress();
        ids.xA = await readTape(d, 'supA');
        ids.xB = await readTape(d, 'supB');
        d.note(d.hooks.t('f10.demo.notes.supports', { a: num(sA, 0), b: num(sB, 0) }));
        await d.wait(1.4);
        d.note(null);
      },
    },
    {
      part: 'B', key: 'equilibrium',
      run: async (d) => {
        d.station('A');
        const xs = routeLoadsF10(d.w.scenarios);
        await d.press('load1', undefined, 0.4);
        D(d, { type: 'closeHook', id: 'load1', on: true });
        await d.wait(0.3);
        D(d, { type: 'hangLoad', id: 'load1', sCm: xs[0] });
        d.endPress();
        await readEq(d);
        for (const x of xs.slice(1)) {
          d.station('A');
          await d.press('load1', undefined, 0.3);
          await d.steps01(d.w.loads.load1.s, x, 3, (v) => void D(d, { type: 'moveLoad', id: 'load1', sCm: v }), 0.03);
          D(d, { type: 'moveLoad', id: 'load1', sCm: x });
          d.endPress();
          await readEq(d);
        }
        const ra = d.w.readings[ids.ra[0]]?.value ?? 0;
        const rb = d.w.readings[ids.rb[0]]?.value ?? 0;
        d.note(d.hooks.t('f10.demo.notes.equilibrium', { ra: num(ra, 2), rb: num(rb, 2), sum: num(ra + rb, 2) }));
        await d.wait(2);
        d.note(null);
        d.station('A');
        await d.press('load1', undefined, 0.3);
        D(d, { type: 'unhangLoad', id: 'load1' });
        await d.press('beam01', undefined, 0.3);
        D(d, { type: 'placeBeam', where: 'rack' });
        d.endPress();
      },
    },
    {
      part: 'C', key: 'press',
      run: async (d) => {
        d.station('C');
        await d.press('shield01', undefined, 0.3);
        D(d, { type: 'setShield', closed: false });
        d.endPress();
        d.station('B');
        await d.press('caliper01', undefined, 0.4);
        ids.d = d.c.readCaliper('spec1').id ?? '';
        d.endPress();
        await d.wait(0.9);
        lens(null);
        d.station('C');
        await d.press('spec1', undefined, 0.4);
        D(d, { type: 'installSpecimen', id: 'spec1' });
        d.endPress();
        ids.L0 = await readTape(d, 'L0');
        await d.press('gripBottom', undefined, 0.3);
        D(d, { type: 'alignGrips' });
        await d.press('crank01', undefined, 0.3);
        D(d, { type: 'lockCrank', on: false });
        await d.press('gripBottom', undefined, 0.3);
        D(d, { type: 'clampGrip', grip: 'bottom', on: true });
        await d.press('gripTop', undefined, 0.3);
        D(d, { type: 'clampGrip', grip: 'top', on: true });
        d.endPress();
        d.station('F');
        await d.press('logger01', undefined, 0.4);
        for (const ch of ['press', 'gauge'] as const) {
          D(d, { type: 'connect', channel: ch, on: true });
          await d.wait(0.2);
        }
        D(d, { type: 'setRate', hz: 20 });
        d.endPress();
        d.station('D');
        await d.press('gauge01', undefined, 0.4);
        D(d, { type: 'calibrateGauge' });
        D(d, { type: 'mountGauge', axis: 'axial' });
        if (d.w.gauge.angleDeg !== 0) D(d, { type: 'tiltGauge', deg: 0 });
        D(d, { type: 'routeCable', on: true });
        await d.press('loadCell01', undefined, 0.3);
        D(d, { type: 'setCellRange', n: 1 });
        await d.press('shield01', undefined, 0.3);
        D(d, { type: 'setShield', closed: true });
        d.endPress();
        await worldWait(d, 0.5);
        await d.press('loadCell01', undefined, 0.3);
        D(d, { type: 'zeroLoadCell' });
        await d.press('gauge01', undefined, 0.3);
        D(d, { type: 'zeroGauge' });
        d.endPress();
        d.note(d.hooks.t('f10.demo.notes.press', { d: num(d.w.readings[ids.d]?.value ?? 0, 2) }));
        await d.wait(1.6);
        d.note(null);
      },
    },
    {
      part: 'D', key: 'elastic',
      run: async (d) => {
        d.station('D');
        for (const mm of routeStepsF10(d.w.scenarios, d.w.params.material)) {
          await crank(d, mm);
          d.lab.camera?.eyeLevel('gauge01');
          lens('logger01');
          ids.f.push(d.c.readPress('readLoadCell').id ?? '');
          ids.e.push(d.c.readPress('readGauge').id ?? '');
          const f = d.w.readings[ids.f[ids.f.length - 1]]?.value ?? 0;
          const e = d.w.readings[ids.e[ids.e.length - 1]]?.value ?? 0;
          d.note(d.hooks.t('f10.demo.notes.step', { F: num(f, 0), dL: num(e, 3) }));
          await d.wait(1.2);
          d.note(null);
        }
        await crank(d, 0);
        ids.rev = d.c.readPress('readGauge').id ?? '';
        await d.wait(1);
        lens(null);
      },
    },
    {
      part: 'D', key: 'plastic',
      run: async (d) => {
        d.station('D');
        await d.press('logger01', undefined, 0.3);
        D(d, { type: 'startLog' });
        d.endPress();
        lens('logger01');
        await crank(d, routePlasticF10(d.w.scenarios));
        await crank(d, 0);
        await d.press('logger01', undefined, 0.3);
        D(d, { type: 'stopLog' });
        ids.curve = d.c.readPress('readCurve').id ?? '';
        d.endPress();
        ids.res = d.c.readPress('readGauge').id ?? '';
        lens('logger01');
        const res = d.w.readings[ids.res]?.value ?? 0;
        d.note(d.hooks.t('f10.demo.notes.plastic', { res: num(res, 3) }));
        await d.wait(2.4);
        d.note(null);
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
          fillNotebookF10(d.w, ids, nb);
        });
        for (const tab of ['setup', 'eq', 'el', 'plastic', 'calc', 'analysis']) {
          ui.notebook(true, tab);
          await d.wait(1.2);
        }
        ui.notebook(false);
      },
    },
    {
      part: 'F', key: 'close',
      run: async (d) => {
        d.station('C');
        if (d.w.press.target > 0) await crank(d, 0);
        await worldUntil(d, () => !busyF10(d.w), 60);
        await d.press('crank01', undefined, 0.3);
        D(d, { type: 'lockCrank', on: true });
        await d.press('shield01', undefined, 0.3);
        D(d, { type: 'setShield', closed: true });
        d.endPress();
        d.station('A');
        if (d.w.loads.load1.where !== 'rack') D(d, { type: 'unhangLoad', id: 'load1' });
        if (d.w.beam.where !== 'rack') D(d, { type: 'placeBeam', where: 'rack' });
        D(d, { type: 'closeStation' });
        await d.wait(1);
      },
    },
  ];
}
