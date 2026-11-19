/**
 * Guion de la demostración de F07: la MANO VIRTUAL recorre la práctica con los mismos comandos que el estudiante
 * (EPP, reconocimiento, carros pesados en la balanza tarada y banderas medidas con el calibre; riel nivelado leyendo la
 * burbuja de frente; topes amortiguados, frenos sueltos, ruedas libres y carros centrados; fotopuertas sujetas y
 * sensor de fuerza calibrado y en cero a 5000 Hz; tres choques elásticos con la gráfica F(t); un choque con velcro;
 * el carro B cargado para el centro de masa con la cámara; libreta y cierre). Usa la misma ruta que las pruebas de
 * integración (route.ts), paso a paso y con la cámara donde corresponde. No genera nota.
 */
import type { DemoDirectorF07, DemoStepF07 } from './director';
import type { F07Notebook } from '../../../practices/practice-f07/notebook';
import type { F07Command } from '../../../simulation/f07-world/commands';
import type { CartId } from '../../../simulation/f07-world/types';
import { fillNotebookF7 } from '../../../practices/practice-f07/notebook-fill';
import { CM_MASS, INSPECT_F7, ROUTE_COCK, emptyRouteIdsF7 } from '../../../practices/practice-f07/route';
import { GEOF07 } from '../../../simulation/f07-world/geometry';
import { CART_MASSES, busyF7 } from '../../../simulation/f07-world/world';
import { useF07 } from '../store';

export interface DemoUiHooksF07 {
  notebook(open: boolean, tab?: string): void;
  edit(fn: (nb: F07Notebook) => void): void;
}

const num = (v: number, d: number) => v.toFixed(d).replace('.', ',');

export function buildDemoScriptF07(ui: DemoUiHooksF07): DemoStepF07[] {
  const ids = emptyRouteIdsF7();
  const D = (d: DemoDirectorF07, c: F07Command) => d.dispatch(c);
  const lens = (target: string | null) => useF07.getState().setSettings({ lens: target });

  /** Objeto en la balanza: lo pone, espera a que la lectura se asiente (1,5 s del mundo) y la lee. */
  const weigh = async (d: DemoDirectorF07, id: string) => {
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

  /** Lectura del nivel ya quieto, de frente; corrige con el tornillo hasta que la burbuja quede centrada. */
  const level = async (d: DemoDirectorF07) => {
    let id = '';
    for (let i = 0; i < 4; i++) {
      const t0 = d.w.timeS;
      d.lab.camera?.eyeLevel('level01');
      await d.until(() => d.w.timeS - t0 > 1.2, 4);
      await d.press('level01', undefined, 0.3);
      const r = d.c.readLevel();
      d.endPress();
      id = r.id ?? '';
      if (Math.abs(r.value ?? 0) < 0.025) break;
      await d.press('track01', undefined, 0.3);
      const target = d.w.track.screwDeg - (r.value ?? 0);
      await d.steps01(d.w.track.screwDeg, target, target > d.w.track.screwDeg ? 0.05 : -0.05, (v) => void D(d, { type: 'setLevelScrew', deg: v }), 0.06);
      D(d, { type: 'setLevelScrew', deg: target });
      d.endPress();
    }
    return id;
  };

  /** Un choque: el blanco al centro, el carro A trabado muesca a muesca, suelta con el gatillo, espera y lee. */
  const collide = async (d: DemoDirectorF07, show: 'force' | 'camera' | null, read: { force?: boolean; motion?: boolean }, launchB = true) => {
    d.station('B');
    if (d.w.bumper.joined) D(d, { type: 'separateCarts' });
    // Primero A al lanzador y después B al centro (como la ruta): si la pareja quedó al fondo tras el velcro, el
    // carro B no se puede dejar en el centro con A todavía delante.
    await d.press('cartA', undefined, 0.3);
    await d.steps01(0, ROUTE_COCK, 1, (v) => void D(d, { type: 'cock', cart: 'cartA', cm: v }), 0.18);
    D(d, { type: 'cock', cart: 'cartA', cm: ROUTE_COCK });
    d.endPress();
    await d.press('cartB', undefined, 0.3);
    if (launchB && Math.abs(d.w.params.v2) > 1e-6) D(d, { type: 'cock', cart: 'cartB', cm: ROUTE_COCK });
    else D(d, { type: 'placeCart', cart: 'cartB', s: GEOF07.cartB0 });
    d.endPress();
    await d.wait(0.5);
    d.station('A');
    await d.press('launcherA', undefined, 0.3);
    d.c.release();
    d.endPress();
    await d.until(() => !busyF7(d.w), 18);
    if (show) {
      lens(show === 'force' ? 'logger01' : 'camera01');
      const rec = d.w.runs[d.w.runs.length - 1];
      d.note(d.hooks.t(show === 'force' ? 'f07.demo.notes.area' : 'f07.demo.notes.cmGraph', { ms: num(((rec.contactEndT ?? 0) - (rec.contactT ?? 0)) * 1000, 0) }));
      await d.wait(2.6);
    }
    const gates = D(d, { type: 'readGates' }).id ?? '';
    const force = read.force ? (D(d, { type: 'readForce' }).id ?? '') : '';
    const motion = read.motion ? (D(d, { type: 'readMotion' }).id ?? '') : '';
    if (show) await d.wait(1.4);
    lens(null);
    d.note(null);
    return { gates, force, motion };
  };

  const carts: CartId[] = ['cartA', 'cartB'];

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
        for (const id of INSPECT_F7) {
          await d.press(id, undefined, 0.3);
          D(d, { type: 'inspect', target: id });
        }
        d.endPress();
      },
    },
    {
      part: 'D', key: 'masses',
      run: async (d) => {
        d.station('D');
        for (const m of CART_MASSES) {
          const sup = d.w.objects[m].support;
          if (sup === 'cartA' || sup === 'cartB') D(d, { type: 'loadCart', id: m, cart: sup, on: false });
        }
        await d.press('balance01', undefined, 0.5);
        D(d, { type: 'tareBalance' });
        d.endPress();
        await d.wait(0.6);
        ids.mA = await weigh(d, 'cartA');
        ids.mB = await weigh(d, 'cartB');
        await d.press('caliper01', undefined, 0.4);
        ids.flagA = D(d, { type: 'measureFlag', cart: 'cartA' }).id ?? '';
        await d.wait(0.6);
        ids.flagB = D(d, { type: 'measureFlag', cart: 'cartB' }).id ?? '';
        d.endPress();
        lens('caliper01');
        d.note(d.hooks.t('f07.demo.notes.masses'));
        await d.wait(1.6);
        lens(null);
        d.note(null);
      },
    },
    {
      part: 'A', key: 'level',
      run: async (d) => {
        d.station('A');
        ids.level = await level(d);
        lens('level01');
        d.note(d.hooks.t('f07.demo.notes.level'));
        await d.wait(1.4);
        lens(null);
        d.note(null);
        await d.press('ends01', undefined, 0.4);
        D(d, { type: 'setEndDampers', on: true });
        d.endPress();
        d.station('B');
        for (const c of carts) {
          await d.press(c, undefined, 0.35);
          D(d, { type: 'setCartBrake', cart: c, on: false });
          D(d, { type: 'freeWheel', cart: c });
          D(d, { type: 'centerCart', cart: c });
          D(d, { type: 'alignFlag', cart: c });
          if (d.w.carts[c].damaged) D(d, { type: 'repairCart', cart: c });
          d.endPress();
        }
      },
    },
    {
      part: 'C', key: 'sensors',
      run: async (d) => {
        d.station('C');
        await d.press('logger01', undefined, 0.4);
        for (const ch of ['gates', 'force', 'camera'] as const) {
          D(d, { type: 'connect', channel: ch, on: true });
          await d.wait(0.2);
        }
        D(d, { type: 'setRate', hz: 5000 });
        await d.press('gateA', undefined, 0.4);
        D(d, { type: 'clampGates', on: true });
        D(d, { type: 'moveGate', id: 'gateA', s: GEOF07.gate.sA });
        D(d, { type: 'moveGate', id: 'gateB', s: GEOF07.gate.sB });
        await d.press('force01', undefined, 0.4);
        if (d.w.sensor.rangeIdx < 1) D(d, { type: 'setRange', n: 1 });
        if (d.w.sensor.angleDeg !== 0) D(d, { type: 'mountSensor', angleDeg: 0 });
        D(d, { type: 'calibrateSensor' });
        await d.wait(0.4);
        D(d, { type: 'zeroSensor' });
        await d.press('bumpers01', undefined, 0.4);
        if (d.w.bumper.type === 'magnet' && !d.w.bumper.polarityOk) D(d, { type: 'flipMagnet' });
        if (d.w.bumper.type !== 'spring') D(d, { type: 'setBumper', bumper: 'spring' });
        d.endPress();
        d.note(d.hooks.t('f07.demo.notes.sensors'));
        await d.wait(1.6);
        d.note(null);
      },
    },
    {
      part: 'B', key: 'elastic',
      run: async (d) => {
        for (let i = 0; i < 3; i++) {
          const r = await collide(d, i === 0 ? 'force' : null, { force: true });
          ids.elastic.push(r.gates);
          ids.forces.push(r.force);
        }
        d.note(d.hooks.t('f07.demo.notes.elastic'));
        await d.wait(1.4);
        d.note(null);
      },
    },
    {
      part: 'B', key: 'stick',
      run: async (d) => {
        d.station('D');
        await d.press('bumpers01', undefined, 0.5);
        D(d, { type: 'setBumper', bumper: 'velcro' });
        await d.wait(0.4);
        D(d, { type: 'fixVelcro', on: true });
        d.endPress();
        ids.stick = (await collide(d, null, {}, false)).gates;
        d.note(d.hooks.t('f07.demo.notes.stick'));
        await d.wait(1.6);
        d.note(null);
        await d.press('cartB', undefined, 0.4);
        D(d, { type: 'separateCarts' });
        d.station('D');
        await d.press('bumpers01', undefined, 0.4);
        D(d, { type: 'setBumper', bumper: 'spring' });
        d.endPress();
      },
    },
    {
      part: 'E', key: 'cm',
      run: async (d) => {
        d.station('D');
        await d.press(CM_MASS, undefined, 0.5);
        D(d, { type: 'loadCart', id: CM_MASS, cart: 'cartB', on: true });
        d.endPress();
        ids.cmMassB = await weigh(d, 'cartB');
        d.station('E');
        ids.cm = (await collide(d, 'camera', { motion: true })).motion;
        d.note(d.hooks.t('f07.demo.notes.cm'));
        await d.wait(1.4);
        d.note(null);
      },
    },
    {
      part: 'F', key: 'notebook',
      run: async (d) => {
        d.station('F');
        ui.notebook(true, 'readings');
        await d.wait(1.6);
        ui.edit((nb) => {
          fillNotebookF7(d.w, ids, nb);
        });
        for (const tab of ['setup', 'elastic', 'stick', 'impulse', 'cm', 'calc', 'analysis']) {
          ui.notebook(true, tab);
          await d.wait(1.2);
        }
        ui.notebook(false);
      },
    },
    {
      part: 'D', key: 'close',
      run: async (d) => {
        d.station('D');
        if (d.w.bumper.joined) D(d, { type: 'separateCarts' });
        await d.press(CM_MASS, undefined, 0.4);
        D(d, { type: 'loadCart', id: CM_MASS, cart: 'cartB', on: false });
        d.station('B');
        for (const c of carts) {
          await d.press(c, undefined, 0.35);
          D(d, { type: 'setCartBrake', cart: c, on: true });
        }
        d.station('D');
        await d.press('massRack01', undefined, 0.4);
        D(d, { type: 'closeStation' });
        d.endPress();
        await d.wait(1);
      },
    },
  ];
}
