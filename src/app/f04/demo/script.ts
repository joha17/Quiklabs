/**
 * Guion de la demostración de F04: la MANO VIRTUAL recorre la práctica con los mismos comandos que el estudiante
 * (EPP, reconocimiento, masas en la balanza tarada, diagramas de cuerpo libre, sensores, nivelado con el acelerómetro,
 * polea y cordel, compuertas leídas de frente en la escala, ensayos repetidos con la ventana limpia, barrido de masa
 * colgante, tercera ley con la pareja, libreta y cierre). Usa la misma ruta que las pruebas de integración (route.ts),
 * paso a paso y con la cámara donde corresponde. No genera nota.
 */
import type { DemoDirectorF04, DemoStepF04 } from './director';
import type { F04Notebook } from '../../../practices/practice-f04/notebook';
import type { F04Command, FbdBody } from '../../../simulation/f04-world/commands';
import { fillNotebookF4 } from '../../../practices/practice-f04/notebook-fill';
import { INSPECT_F4, PAIR_PUSHES, SWEEP_MASSES, cleanWindow, emptyRouteIdsF4 } from '../../../practices/practice-f04/route';
import { fbdNeeds } from '../../../simulation/f04-world/world';
import { useF04 } from '../store';

export interface DemoUiHooksF04 {
  notebook(open: boolean, tab?: string): void;
  edit(fn: (nb: F04Notebook) => void): void;
}

const num = (v: number, d: number) => v.toFixed(d).replace('.', ',');

export function buildDemoScriptF04(ui: DemoUiHooksF04): DemoStepF04[] {
  const ids = emptyRouteIdsF4();
  const D = (d: DemoDirectorF04, c: F04Command) => d.dispatch(c);
  const lens = (target: string | null) => useF04.getState().setSettings({ lens: target });

  /** Pesa en la balanza: la pone, espera a que la lectura se asiente (1,5 s del mundo) y la lee. */
  const weigh = async (d: DemoDirectorF04, id: string) => {
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

  /** Diagrama de cuerpo libre: cada flecha con su compañero de interacción, luego se bloquea. */
  const fbd = async (d: DemoDirectorF04, body: FbdBody, obj: string) => {
    await d.press(obj, undefined, 0.5);
    for (const [force, dir, partner] of fbdNeeds(body)) {
      D(d, { type: 'drawForce', body, force, dir, partner });
      await d.wait(0.45);
    }
    D(d, { type: 'lockFbd', body });
    await d.wait(0.6);
    d.endPress();
  };

  /** Un ensayo: suelta el pestillo, sigue al carro, espera al freno, elige la ventana limpia en la gráfica y la lee. */
  const trial = async (d: DemoDirectorF04, show: boolean) => {
    await d.press('latch01', undefined, 0.3);
    d.c.release();
    d.endPress();
    await d.until(() => !!d.w.run && d.w.run.done, 12);
    const rec = d.w.runs[d.w.runs.length - 1];
    const win = cleanWindow(rec);
    if (show) {
      lens('logger01');
      d.note(d.hooks.t('f04.demo.notes.window', { t0: num(win.t0, 2), t1: num(win.t1, 2) }));
      await d.wait(2.2);
    }
    const id = D(d, { type: 'readRun', t0: win.t0, t1: win.t1 }).id ?? '';
    if (show) await d.wait(1.6);
    lens(null);
    await d.press('cart01', undefined, 0.3);
    D(d, { type: 'returnCart' });
    d.endPress();
    await d.wait(0.4);
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
        for (const id of INSPECT_F4) {
          await d.press(id, undefined, 0.35);
          D(d, { type: 'inspect', target: id });
        }
        d.endPress();
      },
    },
    {
      part: 'E', key: 'masses',
      run: async (d) => {
        d.station('E');
        await d.press('balance01', undefined, 0.5);
        D(d, { type: 'tareBalance' });
        d.endPress();
        await d.wait(0.6);
        ids.cartM = await weigh(d, 'cart01');
        ids.hangerM = await weigh(d, 'hanger01');
        d.note(d.hooks.t('f04.demo.notes.masses'));
        await d.wait(1.4);
      },
    },
    {
      part: 'F', key: 'fbd',
      run: async (d) => {
        d.station('F');
        await fbd(d, 'cart', 'cart01');
        d.station('B');
        await d.wait(0.8);
        await fbd(d, 'hanger', 'hanger01');
        d.note(d.hooks.t('f04.demo.notes.fbd'));
        await d.wait(1.4);
      },
    },
    {
      part: 'C', key: 'sensors',
      run: async (d) => {
        d.station('C');
        await d.press('logger01', undefined, 0.4);
        for (const ch of ['accel01', 'forceA', 'gates'] as const) {
          D(d, { type: 'connect', channel: ch, on: true });
          await d.wait(0.3);
        }
        D(d, { type: 'setRate', hz: 200 });
        d.endPress();
        await d.press('cart01', undefined, 0.4);
        D(d, { type: 'clipCable', on: true });
        d.endPress();
        await d.press('forceA', undefined, 0.4);
        if (d.w.sensors.forceA.angleDeg !== 0) D(d, { type: 'mountSensor', id: 'forceA', angleDeg: 0 });
        D(d, { type: 'calibrateSensor', id: 'forceA' });
        await d.wait(0.4);
        D(d, { type: 'zeroSensor', id: 'forceA' });
        d.endPress();
        d.note(d.hooks.t('f04.demo.notes.sensors'));
        await d.wait(1.2);
      },
    },
    {
      part: 'A', key: 'level',
      run: async (d) => {
        d.station('A');
        for (let i = 0; i < 6; i++) {
          await d.until(() => d.w.timeS - d.w.track.touchedS > 2, 6);
          await d.press('accel01', undefined, 0.3);
          const r = D(d, { type: 'readTilt' });
          d.endPress();
          ids.aRest = r.id ?? ids.aRest;
          const a = r.value ?? 0;
          if (Math.abs(a) <= 0.01 && Math.abs(d.w.track.tiltDeg) <= 0.1) break;
          const deg = (-Math.asin(Math.max(-1, Math.min(1, a / d.w.params.g))) * 180) / Math.PI;
          const turns = Math.max(-40, Math.min(40, -Math.round(deg / d.w.params.levelDegPerTurn)));
          d.note(d.hooks.t('f04.demo.notes.level', { a: num(a, 2), n: turns }));
          await d.press('track01', undefined, 0.3);
          await d.steps01(0, turns, 1, () => D(d, { type: 'turnLevelScrew', turns: Math.sign(turns) }), 0.05);
          d.endPress();
        }
      },
    },
    {
      part: 'B', key: 'string',
      run: async (d) => {
        d.station('B');
        await d.wait(0.8);
        await d.press('pulley01', undefined, 0.4);
        D(d, { type: 'clampPulley', on: true });
        await d.wait(0.3);
        D(d, { type: 'threadString', path: 'groove' });
        d.endPress();
        await d.press('cart01', undefined, 0.4);
        D(d, { type: 'attachString', on: true });
        d.endPress();
        await d.press('hanger01', undefined, 0.4);
        D(d, { type: 'hangHanger', on: true });
        await d.wait(0.8);
        d.note(d.hooks.t('f04.demo.notes.taut'));
        D(d, { type: 'tensionString' });
        d.endPress();
        await d.wait(1.4);
      },
    },
    {
      part: 'E', key: 'gates',
      run: async (d) => {
        d.station('A');
        const g2 = Math.min(0.7, Math.round((d.w.brake.s - 0.08) * 100) / 100);
        const g1 = Math.min(0.3, Math.round((g2 - 0.25) * 100) / 100);
        for (const [id, s] of [['gate2', g2], ['gate1', g1]] as const) {
          await d.press(id, undefined, 0.3);
          const from = d.w.gates[id].s;
          if (from !== s) await d.steps01(from, s, 0.02, (v) => D(d, { type: 'moveGate', id, s: Math.round(v * 1000) / 1000 }), 0.03);
          D(d, { type: 'moveGate', id, s });
          d.endPress();
        }
        for (const id of ['gate1', 'gate2'] as const) {
          d.lab.camera?.eyeLevel(id);
          await d.until(() => Math.abs(d.c.scaleView(id)) < 4, 4);
          await d.wait(0.4);
          const r = d.c.readScale(id);
          if (id === 'gate1') ids.g1 = r.id ?? '';
          else ids.g2 = r.id ?? '';
          await d.wait(1);
        }
        lens(null);
        d.note(d.hooks.t('f04.demo.notes.gates'));
        await d.wait(1);
      },
    },
    {
      part: 'A', key: 'runs',
      run: async (d) => {
        d.station('A');
        await d.wait(0.8);
        ids.runs.push(await trial(d, true));
        await d.fast(2.5, async () => {
          for (let i = 0; i < 2; i++) ids.runs.push(await trial(d, false));
        });
      },
    },
    {
      part: 'B', key: 'sweep',
      run: async (d) => {
        ids.massRuns.push(ids.runs[0]);
        for (const m of SWEEP_MASSES) {
          d.station('B');
          await d.press(m, undefined, 0.5);
          D(d, { type: 'placeMass', id: m, on: 'hanger' });
          d.endPress();
          await d.wait(0.6);
          d.station('A');
          ids.massRuns.push(await d.fast(2, () => trial(d, false)));
        }
        for (const m of SWEEP_MASSES) D(d, { type: 'placeMass', id: m, on: 'rack' });
        d.note(d.hooks.t('f04.demo.notes.sweep'));
        await d.wait(1.4);
      },
    },
    {
      part: 'D', key: 'pair',
      run: async (d) => {
        d.station('D');
        await d.wait(0.8);
        for (const ch of ['dynP', 'dynQ'] as const) {
          await d.press(ch, undefined, 0.35);
          D(d, { type: 'connect', channel: ch, on: true });
          if (d.w.sensors[ch].rangeIdx < 1) D(d, { type: 'setRange', id: ch, n: 1 });
          D(d, { type: 'calibrateSensor', id: ch });
          D(d, { type: 'zeroSensor', id: ch });
          d.endPress();
        }
        if (d.w.sensors.dynP.axisSign === d.w.sensors.dynQ.axisSign) {
          d.note(d.hooks.t('f04.demo.notes.sign'));
          await d.press('dynP', undefined, 0.5);
          D(d, { type: 'setAxisSign', id: 'dynP', sign: -1 });
          d.endPress();
          await d.wait(1.2);
        }
        await fbd(d, 'cartP', 'cartP');
        for (const [i, f] of PAIR_PUSHES.entries()) {
          await d.press('cartP', undefined, 0.4);
          D(d, { type: 'push', forceN: f, durationS: 0.3 });
          d.endPress();
          const t0 = d.w.timeS;
          await d.until(() => d.w.timeS - t0 > 0.8, 4);
          if (i === 0) {
            lens('pair');
            await d.wait(1.2);
          }
          ids.pairs.push(D(d, { type: 'readPair' }).id ?? '');
          await d.wait(i === 0 ? 1.8 : 0.8);
          lens(null);
          D(d, { type: 'resetPair' });
        }
        d.note(d.hooks.t('f04.demo.notes.third'));
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
          fillNotebookF4(d.w, ids, nb);
        });
        for (const tab of ['setup', 'runs', 'masses', 'pairs', 'calc', 'analysis']) {
          ui.notebook(true, tab);
          await d.wait(1.4);
        }
        ui.notebook(false);
      },
    },
    {
      part: 'F', key: 'close',
      run: async (d) => {
        d.station('B');
        await d.press('hanger01', undefined, 0.4);
        D(d, { type: 'hangHanger', on: false });
        d.endPress();
        await d.press('cart01', undefined, 0.4);
        D(d, { type: 'attachString', on: false });
        d.endPress();
        D(d, { type: 'closeStation' });
        await d.wait(1);
      },
    },
  ];
}
