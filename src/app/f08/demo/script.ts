/**
 * Guion de la demostración de F08: la MANO VIRTUAL recorre la práctica con los mismos comandos que el estudiante
 * (EPP y reconocimiento; sólidos y pesas en la balanza tarada y diámetros con el calibre; base sujeta, polea alineada,
 * tope y fotopuerta; encoder calibrado con el cero en la marca del transportador leída de frente y el sentido
 * comprobado; sensores en cero a 200 Hz; eje solo, disco ×3 con tensión, tacómetro y fotopuerta, aro centrado; barra
 * con las masas fijas a 10 y 25 cm; disco en el agujero de 5 cm; libreta y cierre). Usa la misma ruta que las pruebas
 * de integración (route.ts), paso a paso y con la cámara donde corresponde. No genera nota.
 */
import type { DemoDirectorF08, DemoStepF08 } from './director';
import type { F08Notebook } from '../../../practices/practice-f08/notebook';
import type { F08Command } from '../../../simulation/f08-world/commands';
import type { DropId, SolidId } from '../../../simulation/f08-world/types';
import { fillNotebookF8 } from '../../../practices/practice-f08/notebook-fill';
import { INSPECT_F8, ROUTE_CATCH, ROUTE_GATE, ROUTE_HOLE, ROUTE_RADII, ROUTE_TURNS, emptyRouteIdsF8 } from '../../../practices/practice-f08/route';
import { routeDropF08 } from '../../../practices/practice-f08';
import { busyF8 } from '../../../simulation/f08-world/world';
import { useF08 } from '../store';

export interface DemoUiHooksF08 {
  notebook(open: boolean, tab?: string): void;
  edit(fn: (nb: F08Notebook) => void): void;
}

const num = (v: number, d: number) => v.toFixed(d).replace('.', ',');

export function buildDemoScriptF08(ui: DemoUiHooksF08): DemoStepF08[] {
  const ids = emptyRouteIdsF8();
  const D = (d: DemoDirectorF08, c: F08Command) => d.dispatch(c);
  const lens = (target: string | null) => useF08.getState().setSettings({ lens: target });
  let drop: DropId = 'drop50';

  /** Objeto en la balanza: lo pone, espera a que la lectura se asiente (1,5 s del mundo) y la lee. */
  const weigh = async (d: DemoDirectorF08, id: string) => {
    await d.press(id, undefined, 0.4);
    D(d, { type: 'placeOnBalance', id });
    d.endPress();
    const t0 = d.w.timeS;
    d.lab.camera?.eyeLevel('balance01');
    await d.until(() => d.w.timeS - t0 > 2, 6);
    await d.press('balance01', undefined, 0.3);
    const r = d.c.readBalance();
    d.endPress();
    await d.wait(0.8);
    D(d, { type: 'removeFromBalance' });
    return r.id ?? '';
  };

  /** Frena el rotor y espera a que quede quieto. */
  const stopRotor = async (d: DemoDirectorF08) => {
    if (!d.w.rotor.brake) {
      await d.press('hub01', undefined, 0.3);
      D(d, { type: 'setBrake', on: true });
      d.endPress();
    }
    await d.until(() => Math.abs(d.w.rotor.omega) <= 1e-3, 20);
    await d.wait(0.5);
  };

  /** Acopla un sólido (guarda abierta, rotor quieto): saca el anterior, lo centra si hace falta. */
  const mount = async (d: DemoDirectorF08, id: SolidId, hole = 0) => {
    d.station('A');
    if (d.w.rotor.solid) await stopRotor(d);
    await d.press('guard01', undefined, 0.3);
    D(d, { type: 'setGuard', closed: false });
    d.endPress();
    if (d.w.rotor.solid) {
      await d.press(d.w.rotor.solid, undefined, 0.4);
      D(d, { type: 'removeSolid' });
      d.endPress();
    }
    await d.press(id, undefined, 0.5);
    D(d, { type: 'mountSolid', id, hole });
    d.endPress();
    if (d.w.rotor.ecc > 0) {
      await d.press(id, undefined, 0.4);
      D(d, { type: 'centerSolid' });
      d.endPress();
    }
    if (d.w.damaged[id]) D(d, { type: 'repairSolid', id });
  };

  /** Un ensayo con la mano: enrolla, cuelga y sostiene la masa, cierra la guarda, suelta el freno y la masa, espera, frena y lee. */
  const trial = async (d: DemoDirectorF08, read: { tension?: boolean; energy?: boolean; show?: boolean } = {}) => {
    d.station('C');
    const s = d.w.string;
    if (s.mass) D(d, { type: 'hangMass', id: s.mass, on: false });
    D(d, { type: 'setBrake', on: true });
    await d.press('hub01', undefined, 0.3);
    D(d, { type: 'windString', turns: ROUTE_TURNS });
    d.endPress();
    await d.press(drop, undefined, 0.4);
    D(d, { type: 'hangMass', id: drop, on: true });
    d.endPress();
    d.station('A');
    await d.press('guard01', undefined, 0.3);
    D(d, { type: 'setGuard', closed: true });
    await d.wait(0.5);
    await d.press('hub01', undefined, 0.3);
    D(d, { type: 'setBrake', on: false });
    d.endPress();
    d.station('C');
    await d.press(drop, undefined, 0.3);
    d.c.release();
    d.endPress();
    await d.wait(1);
    await d.until(() => !busyF8(d.w), 50);
    if (read.show) {
      lens('logger01');
      const rec = d.w.runs[d.w.runs.length - 1];
      d.note(d.hooks.t('f08.demo.notes.fit', { s: num(rec.slackT ?? 0, 2) }));
      await d.wait(2.6);
    }
    await stopRotor(d);
    const enc = D(d, { type: 'readEncoder' }).id ?? '';
    const tension = read.tension ? (D(d, { type: 'readTension' }).id ?? '') : '';
    const tach = read.energy ? (D(d, { type: 'readTach' }).id ?? '') : '';
    const gate = read.energy ? (D(d, { type: 'readGate' }).id ?? '') : '';
    if (read.show) await d.wait(1.4);
    lens(null);
    d.note(null);
    return { enc, tension, tach, gate };
  };

  return [
    {
      part: 'A', key: 'ppe',
      run: async (d) => {
        drop = routeDropF08(d.w.scenarios);
        d.station('A');
        for (const item of ['coat', 'goggles', 'shoes', 'hair'] as const) D(d, { type: 'equipPpe', item, on: true });
        D(d, { type: 'startWork' });
        await d.wait(1.2);
      },
    },
    {
      part: 'A', key: 'inspect',
      run: async (d) => {
        for (const id of INSPECT_F8) {
          await d.press(id, undefined, 0.3);
          D(d, { type: 'inspect', target: id });
        }
        d.endPress();
      },
    },
    {
      part: 'B', key: 'masses',
      run: async (d) => {
        d.station('B');
        await d.press('balance01', undefined, 0.5);
        D(d, { type: 'tareBalance' });
        d.endPress();
        await d.wait(0.6);
        ids.mDisc = await weigh(d, 'disc01');
        ids.mRing = await weigh(d, 'ring01');
        ids.mDrop = await weigh(d, drop);
        ids.mSlide = await weigh(d, 'slide1');
        d.station('B');
        await d.press('caliper01', undefined, 0.4);
        ids.dDisc = d.c.measure('disc01').id ?? '';
        await d.wait(0.5);
        ids.dRing = d.c.measure('ring01').id ?? '';
        await d.wait(0.5);
        ids.dDrum = d.c.measure('drum').id ?? '';
        ids.wFlag = d.c.measure('flag').id ?? '';
        ids.dHole = d.c.measure('hole').id ?? '';
        d.endPress();
        d.note(d.hooks.t('f08.demo.notes.masses'));
        await d.wait(1.6);
        lens(null);
        d.note(null);
      },
    },
    {
      part: 'B', key: 'setup',
      run: async (d) => {
        d.station('A');
        await d.press('base01', undefined, 0.4);
        D(d, { type: 'clampBase', on: true });
        d.endPress();
        d.station('C');
        await d.press('pulley01', undefined, 0.4);
        D(d, { type: 'alignPulley' });
        await d.press('catch01', undefined, 0.4);
        D(d, { type: 'setCatch', on: true, zCm: ROUTE_CATCH });
        await d.press('gate01', undefined, 0.4);
        await d.steps01(d.w.column.gateZ, ROUTE_GATE, ROUTE_GATE > d.w.column.gateZ ? 1 : -1, (v) => void D(d, { type: 'moveGate', zCm: v }), 0.05);
        D(d, { type: 'moveGate', zCm: ROUTE_GATE });
        d.endPress();
        d.note(d.hooks.t('f08.demo.notes.setup'));
        await d.wait(1.4);
        d.note(null);
      },
    },
    {
      part: 'C', key: 'encoder',
      run: async (d) => {
        d.station('D');
        await d.press('logger01', undefined, 0.4);
        for (const ch of ['encoder', 'tension', 'tach', 'gate'] as const) {
          D(d, { type: 'connect', channel: ch, on: true });
          await d.wait(0.2);
        }
        D(d, { type: 'setRate', hz: 200 });
        await d.press('encoder01', undefined, 0.4);
        D(d, { type: 'calibrateEncoder' });
        d.endPress();
        // La marca de la plataforma al 0 del transportador, leyendo de frente.
        for (let i = 0; i < 3; i++) {
          d.lab.camera?.eyeLevel('base01');
          await d.wait(3);
          await d.press('base01', undefined, 0.3);
          const a = d.c.readScale().value ?? 0;
          d.endPress();
          if (Math.abs(a) < 1) break;
          await d.press('hub01', undefined, 0.3);
          const st = a > 0 ? -2 : 2;
          for (let k = 0; k < Math.floor(Math.abs(a) / 2); k++) {
            D(d, { type: 'turnByHand', deg: st });
            await d.wait(0.03);
          }
          D(d, { type: 'turnByHand', deg: -a - st * Math.floor(Math.abs(a) / 2) });
          d.endPress();
        }
        lens('base01');
        await d.press('encoder01', undefined, 0.3);
        D(d, { type: 'zeroEncoder' });
        d.endPress();
        d.note(d.hooks.t('f08.demo.notes.zero'));
        await d.wait(1.4);
        lens(null);
        // Sentido: un cuarto de vuelta en el sentido de caída debe leer +90°.
        await d.press('hub01', undefined, 0.3);
        for (let k = 0; k < 15; k++) {
          D(d, { type: 'turnByHand', deg: 6 });
          await d.wait(0.03);
        }
        d.endPress();
        const q = D(d, { type: 'readEncoderAngle' }).value ?? 0;
        if (q < 0) D(d, { type: 'setEncoderDir', dir: 1 });
        await d.press('hub01', undefined, 0.3);
        for (let k = 0; k < 15; k++) {
          D(d, { type: 'turnByHand', deg: -6 });
          await d.wait(0.03);
        }
        d.endPress();
        d.station('C');
        await d.press('tension01', undefined, 0.4);
        if (d.w.tension.angleDeg !== 0) D(d, { type: 'mountTension', angleDeg: 0 });
        D(d, { type: 'zeroTension' });
        d.station('D');
        await d.press('tach01', undefined, 0.4);
        D(d, { type: 'setTachRange', n: 1 });
        d.endPress();
        d.note(d.hooks.t('f08.demo.notes.sensors'));
        await d.wait(1.4);
        d.note(null);
      },
    },
    {
      part: 'D', key: 'torque',
      run: async (d) => {
        ids.axle = (await trial(d, { show: true })).enc;
        await mount(d, 'disc01');
        for (let i = 0; i < 3; i++) {
          const r = await trial(d, i === 0 ? { tension: true, energy: true } : {});
          ids.disks.push(r.enc);
          if (i === 0) {
            ids.tension = r.tension;
            ids.tach = r.tach;
            ids.gate = r.gate;
          }
        }
        d.note(d.hooks.t('f08.demo.notes.disc'));
        await d.wait(1.4);
        d.note(null);
        await mount(d, 'ring01');
        ids.ring = (await trial(d)).enc;
      },
    },
    {
      part: 'E', key: 'slides',
      run: async (d) => {
        await mount(d, 'bar01');
        for (const rc of ROUTE_RADII) {
          d.station('E');
          if (d.w.base.guardClosed) {
            await d.press('guard01', undefined, 0.3);
            D(d, { type: 'setGuard', closed: false });
          }
          for (const s of ['slide1', 'slide2'] as const) {
            await d.press(s, undefined, 0.3);
            D(d, { type: 'lockMass', id: s, on: false });
            await d.steps01(d.w.slides[s].r * 100, rc, rc > d.w.slides[s].r * 100 ? 1 : -1, (v) => void D(d, { type: 'slideMass', id: s, rCm: v }), 0.04);
            D(d, { type: 'slideMass', id: s, rCm: rc });
            D(d, { type: 'lockMass', id: s, on: true });
            d.endPress();
          }
          d.lab.camera?.eyeLevel('slide1');
          await d.wait(3);
          ids.radii.push(d.c.readRadius('slide1').id ?? '');
          d.lab.camera?.eyeLevel('slide2');
          await d.wait(3);
          d.c.readRadius('slide2');
          await d.wait(0.8);
          lens(null);
          ids.masses.push((await trial(d)).enc);
        }
        d.note(d.hooks.t('f08.demo.notes.slides'));
        await d.wait(1.4);
        d.note(null);
        await mount(d, 'disc01', ROUTE_HOLE);
        ids.parallel = (await trial(d)).enc;
        d.note(d.hooks.t('f08.demo.notes.parallel'));
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
          fillNotebookF8(d.w, ids, nb);
        });
        for (const tab of ['setup', 'runs', 'masses', 'tension', 'energy', 'calc', 'analysis']) {
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
        await stopRotor(d);
        const m = d.w.string.mass;
        if (m) {
          await d.press(m, undefined, 0.4);
          D(d, { type: 'hangMass', id: m, on: false });
          d.endPress();
        }
        if (d.w.rotor.solid) {
          await d.press('guard01', undefined, 0.3);
          D(d, { type: 'setGuard', closed: false });
          await d.press(d.w.rotor.solid, undefined, 0.4);
          D(d, { type: 'removeSolid' });
          d.endPress();
        }
        await d.press('guard01', undefined, 0.3);
        D(d, { type: 'setGuard', closed: true });
        D(d, { type: 'closeStation' });
        d.endPress();
        await d.wait(1);
      },
    },
  ];
}
