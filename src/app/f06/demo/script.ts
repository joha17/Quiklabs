/**
 * Guion de la demostración de F06: la MANO VIRTUAL recorre la práctica con los mismos comandos que el estudiante
 * (EPP, reconocimiento, carro, porta-pesas y pesa en la balanza tarada; resorte colgado con la regla alineada y cinco
 * lecturas en reposo; resorte al lanzador con su presilla; sensores conectados, calibrados, en cero y sincronizados a
 * 1000 Hz; freno y abrazadera; tres disparos con la gráfica F–x y P(t); dos alturas más leídas de frente; el péndulo con
 * dos amplitudes; un disparo con el patín de roce; libreta y cierre). Usa la misma ruta que las pruebas de integración
 * (route.ts), paso a paso y con la cámara donde corresponde. No genera nota.
 */
import type { DemoDirectorF06, DemoStepF06 } from './director';
import type { F06Notebook } from '../../../practices/practice-f06/notebook';
import type { F06Command } from '../../../simulation/f06-world/commands';
import { fillNotebookF6 } from '../../../practices/practice-f06/notebook-fill';
import { INSPECT_F6, ROUTE_PAD, emptyRouteIdsF6, routeCompression, routeHeights } from '../../../practices/practice-f06/route';
import { GEOF06 } from '../../../simulation/f06-world/geometry';
import { SLOTS, busyF6, standAmplitudeCm } from '../../../simulation/f06-world/world';
import { useF06 } from '../store';

export interface DemoUiHooksF06 {
  notebook(open: boolean, tab?: string): void;
  edit(fn: (nb: F06Notebook) => void): void;
}

const num = (v: number, d: number) => v.toFixed(d).replace('.', ',');

export function buildDemoScriptF06(ui: DemoUiHooksF06): DemoStepF06[] {
  const ids = emptyRouteIdsF6();
  const D = (d: DemoDirectorF06, c: F06Command) => d.dispatch(c);
  const lens = (target: string | null) => useF06.getState().setSettings({ lens: target });

  /** Objeto en la balanza: lo pone, espera a que la lectura se asiente (1,5 s del mundo) y la lee. */
  const weigh = async (d: DemoDirectorF06, id: string) => {
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

  /** Lectura de la regla ya en reposo (espera la amortiguación de la carga, más rápido en pantalla). */
  const ruler = async (d: DemoDirectorF06) => {
    const t0 = d.w.timeS;
    // Espera a que el puntero quede quieto (no un tiempo fijo: con más carga la oscilación dura más).
    await d.fast(4, () => d.until(() => d.w.timeS - t0 > 2 && standAmplitudeCm(d.w) < 0.02, 40));
    d.lab.camera?.eyeLevel('ruler01');
    await d.wait(0.9);
    await d.press('ruler01', undefined, 0.3);
    const id = d.c.readRuler().id ?? '';
    d.endPress();
    return id;
  };

  /** Lleva la parte alta del riel a h con la perilla de la columna y la lee de frente, ya quieta. */
  const height = async (d: DemoDirectorF06, h: number) => {
    await d.press('track01', undefined, 0.3);
    await d.steps01(d.w.track.h, h, d.w.track.h < h ? 0.01 : -0.01, (v) => void D(d, { type: 'setHeight', m: v }), 0.05);
    D(d, { type: 'setHeight', m: h });
    d.endPress();
    const t0 = d.w.timeS;
    d.lab.camera?.eyeLevel('gauge01');
    await d.until(() => d.w.timeS - t0 > 1.5, 4);
    await d.press('gauge01', undefined, 0.3);
    const id = d.c.readHeight('launcher').id ?? '';
    d.endPress();
    return id;
  };

  /** Un disparo: comprime muesca a muesca, suelta con el gatillo, espera el recorrido y lee; devuelve el carro. */
  const shoot = async (d: DemoDirectorF06, x: number, show: boolean, readLaunch: boolean) => {
    d.station('B');
    await d.press('cart01', undefined, 0.3);
    await d.steps01(0, x, 0.01, (v) => void D(d, { type: 'compress', x: v }), 0.06);
    D(d, { type: 'compress', x });
    d.endPress();
    await d.wait(0.5);
    await d.press('launcher01', undefined, 0.3);
    d.c.release();
    d.endPress();
    await d.until(() => !busyF6(d.w), 12);
    if (show) {
      lens('logger01');
      const rec = d.w.runs[d.w.runs.length - 1];
      d.note(d.hooks.t('f06.demo.notes.area', { cm: num(rec.x0 * 100, 0) }));
      await d.wait(2.6);
    }
    const launch = readLaunch ? (D(d, { type: 'readLaunch' }).id ?? '') : '';
    const gates = D(d, { type: 'readGates' }).id ?? '';
    if (show) await d.wait(1.4);
    lens(null);
    d.note(null);
    await d.press('cart01', undefined, 0.3);
    D(d, { type: 'returnCart' });
    d.endPress();
    return { launch, gates };
  };

  /** Una oscilación: aparta la esfera, la suelta sin empuje lateral, espera el paso por la compuerta y lee. */
  const swing = async (d: DemoDirectorF06, deg: number) => {
    await d.press('pend01', undefined, 0.3);
    await d.steps01(0, deg, 1, (v) => void D(d, { type: 'holdBob', deg: v }), 0.04);
    D(d, { type: 'holdBob', deg });
    await d.wait(0.6);
    D(d, { type: 'releaseBob', lateralMs: 0 });
    d.endPress();
    await d.until(() => !!d.w.swing && d.w.swing.done, 6);
    await d.wait(0.6);
    await d.press('angle01', undefined, 0.3);
    const id = d.c.readPendulum().id ?? '';
    d.endPress();
    await d.wait(1.2);
    D(d, { type: 'stopBob' });
    lens(null);
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
        for (const id of INSPECT_F6) {
          await d.press(id, undefined, 0.3);
          D(d, { type: 'inspect', target: id });
        }
        d.endPress();
      },
    },
    {
      part: 'A', key: 'masses',
      run: async (d) => {
        d.station('A');
        for (const m of ['cw1', 'cw2']) if (d.w.objects[m].support === 'cart') D(d, { type: 'loadCart', id: m, on: false });
        await d.press('balance01', undefined, 0.5);
        D(d, { type: 'tareBalance' });
        d.endPress();
        await d.wait(0.6);
        ids.cartM = await weigh(d, 'cart01');
        ids.hangerM = await weigh(d, 'hanger01');
        ids.slotM = await weigh(d, 'm100a');
        d.note(d.hooks.t('f06.demo.notes.masses'));
        await d.wait(1.4);
      },
    },
    {
      part: 'A', key: 'spring',
      run: async (d) => {
        d.station('A');
        if (d.w.springs.spring01.at !== 'stand') D(d, { type: 'mountSpring', id: 'spring01', at: 'stand' });
        await d.press('ruler01', undefined, 0.4);
        D(d, { type: 'alignRuler' });
        await d.press('hanger01', undefined, 0.4);
        D(d, { type: 'hangHanger', on: true });
        d.endPress();
        ids.ruler.push(await ruler(d));
        for (const m of SLOTS) {
          d.station('A');
          await d.press(m, undefined, 0.35);
          D(d, { type: 'hangMass', id: m, on: true });
          d.endPress();
          ids.ruler.push(await ruler(d));
        }
        d.note(d.hooks.t('f06.demo.notes.spring'));
        await d.wait(1.4);
        d.note(null);
        await d.press('hanger01', undefined, 0.3);
        D(d, { type: 'hangHanger', on: false });
        d.endPress();
      },
    },
    {
      part: 'D', key: 'sensors',
      run: async (d) => {
        d.station('D');
        await d.press('spring01', undefined, 0.5);
        D(d, { type: 'mountSpring', id: 'spring01', at: 'launcher' });
        await d.press('launcher01', undefined, 0.4);
        D(d, { type: 'secureSpring', on: true });
        await d.press('logger01', undefined, 0.4);
        for (const ch of ['force', 'position', 'gates', 'angle'] as const) {
          D(d, { type: 'connect', channel: ch, on: true });
          await d.wait(0.2);
        }
        D(d, { type: 'setRate', hz: 1000 });
        D(d, { type: 'syncChannels', on: true });
        await d.press('force01', undefined, 0.4);
        if (d.w.sensor.rangeIdx < 1) D(d, { type: 'setRange', n: 1 });
        if (d.w.sensor.angleDeg !== 0) D(d, { type: 'mountSensor', angleDeg: 0 });
        D(d, { type: 'calibrateSensor' });
        await d.wait(0.4);
        D(d, { type: 'zeroSensor' });
        d.station('B');
        await d.press('track01', undefined, 0.4);
        D(d, { type: 'clampTrack', on: true });
        await d.press('brake01', undefined, 0.4);
        D(d, { type: 'setBrake', on: true });
        D(d, { type: 'setFriction', n: 0 });
        D(d, { type: 'setDamper', c: 0 });
        D(d, { type: 'moveGate', id: 'gate1', s: GEOF06.gate.s1 });
        D(d, { type: 'moveGate', id: 'gate2', s: GEOF06.gate.s2 });
        d.endPress();
        d.note(d.hooks.t('f06.demo.notes.sensors'));
        await d.wait(1.6);
      },
    },
    {
      part: 'B', key: 'launches',
      run: async (d) => {
        const x = routeCompression(d.w);
        const hs = routeHeights(d.w);
        const href = await height(d, hs[0]);
        for (let i = 0; i < 3; i++) {
          const r = await shoot(d, x, i === 0, true);
          ids.launches.push(r.launch);
          ids.reps.push(r.gates);
        }
        ids.heights.push({ gates: ids.reps[0], height: href });
      },
    },
    {
      part: 'B', key: 'heights',
      run: async (d) => {
        const x = routeCompression(d.w);
        for (const h of routeHeights(d.w).slice(1)) {
          const hid = await height(d, h);
          ids.heights.push({ gates: (await shoot(d, x, false, false)).gates, height: hid });
        }
        d.note(d.hooks.t('f06.demo.notes.heights'));
        await d.wait(1.4);
      },
    },
    {
      part: 'C', key: 'pendulum',
      run: async (d) => {
        d.station('C');
        if (Math.abs(d.w.pend.L - d.w.params.pendL0) > 1e-6) D(d, { type: 'setLength', m: d.w.params.pendL0 });
        const t0 = d.w.timeS;
        d.lab.camera?.eyeLevel('pendScale');
        await d.until(() => d.w.timeS - t0 > 1.5, 4);
        await d.press('pend01', undefined, 0.3);
        ids.pendScale = d.c.readPendScale().id ?? '';
        d.endPress();
        d.station('C');
        for (const a of d.w.params.pendAmps) ids.pendulums.push(await swing(d, a));
        d.note(d.hooks.t('f06.demo.notes.pendulum'));
        await d.wait(1.4);
      },
    },
    {
      part: 'E', key: 'losses',
      run: async (d) => {
        const x = routeCompression(d.w);
        const hl = await height(d, routeHeights(d.w)[0]);
        d.station('E');
        await d.press('pad01', undefined, 0.5);
        D(d, { type: 'setFriction', n: ROUTE_PAD });
        d.endPress();
        ids.loss = { gates: (await shoot(d, x, false, false)).gates, height: hl };
        await d.press('pad01', undefined, 0.4);
        D(d, { type: 'setFriction', n: 0 });
        d.endPress();
        d.note(d.hooks.t('f06.demo.notes.losses'));
        await d.wait(1.4);
      },
    },
    {
      part: 'F', key: 'notebook',
      run: async (d) => {
        d.station('F');
        ui.notebook(true, 'readings');
        await d.wait(1.6);
        ui.edit((nb) => {
          fillNotebookF6(d.w, ids, nb);
        });
        for (const tab of ['setup', 'spring', 'launch', 'reps', 'heights', 'loss', 'pendulum', 'calc', 'analysis']) {
          ui.notebook(true, tab);
          await d.wait(1.2);
        }
        ui.notebook(false);
      },
    },
    {
      part: 'A', key: 'close',
      run: async (d) => {
        d.station('B');
        await d.press('cart01', undefined, 0.4);
        D(d, { type: 'returnCart' });
        d.station('A');
        await d.press('massRack01', undefined, 0.4);
        D(d, { type: 'closeStation' });
        d.endPress();
        await d.wait(1);
      },
    },
  ];
}
