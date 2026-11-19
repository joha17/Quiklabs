/**
 * Guion de la demostración de F09: la MANO VIRTUAL recorre la práctica con los mismos comandos que el estudiante
 * (EPP y reconocimiento; masas en la balanza tarada; base sujeta, eje nivelado, sensores conectados, en cero y
 * calibrados, cable sujeto; masas radiales bloqueadas a 15 cm; masa orbitante en la guía con el cordón tenso, el tope
 * trabado y su radio leído desde arriba; cuatro velocidades del motor subidas en rampa con fuerza y cinco vueltas;
 * dos tirones del dinamómetro con brazos de 20 y 10 cm; conservación del momento angular al recoger las masas de 25 a
 * 6 cm con el motor desacoplado; libreta y cierre). Usa la misma ruta que las pruebas de integración (route.ts), paso a
 * paso y con la cámara donde corresponde. No genera nota.
 */
import type { DemoDirectorF09, DemoStepF09 } from './director';
import type { F09Notebook } from '../../../practices/practice-f09/notebook';
import type { F09Command, RadiusTarget } from '../../../simulation/f09-world/commands';
import { fillNotebookF9 } from '../../../practices/practice-f09/notebook-fill';
import { INSPECT_F9, RAMP_RPM, ROUTE_ARMS, ROUTE_PULL, ROUTE_SLIDE_C, ROUTE_SLIDE_IN, ROUTE_SLIDE_OUT, ROUTE_SPIN_D, ROUTE_TURNS, emptyRouteIdsF9 } from '../../../practices/practice-f09/route';
import { routeOrbitRF09, routeSpeedsF09 } from '../../../practices/practice-f09';
import { useF09 } from '../store';

export interface DemoUiHooksF09 {
  notebook(open: boolean, tab?: string): void;
  edit(fn: (nb: F09Notebook) => void): void;
}

const RPM = 60 / (2 * Math.PI);
const num = (v: number, d: number) => v.toFixed(d).replace('.', ',');

export function buildDemoScriptF09(ui: DemoUiHooksF09): DemoStepF09[] {
  const ids = emptyRouteIdsF9();
  const D = (d: DemoDirectorF09, c: F09Command) => d.dispatch(c);
  const lens = (target: string | null) => useF09.getState().setSettings({ lens: target });

  /** Espera tiempo del MUNDO (la mesa, el cronómetro y el tirón avanzan con él). */
  const worldWait = async (d: DemoDirectorF09, s: number, timeoutS = 60) => {
    const t0 = d.w.timeS;
    await d.until(() => d.w.timeS - t0 >= s, timeoutS);
  };

  /** Espera una condición del mundo con plazo en tiempo DEL MUNDO (el reloj del director corre con la velocidad elegida). */
  const worldUntil = async (d: DemoDirectorF09, check: () => boolean, s: number) => {
    const t0 = d.w.timeS;
    await d.until(() => check() || d.w.timeS - t0 >= s, 600);
  };

  /** Objeto en la balanza: lo pone, espera a que la lectura se asiente (1,5 s del mundo) y la lee. */
  const weigh = async (d: DemoDirectorF09, id: string) => {
    await d.press(id, undefined, 0.4);
    D(d, { type: 'placeOnBalance', id });
    d.endPress();
    d.lab.camera?.eyeLevel('balance01');
    await worldWait(d, 2, 8);
    await d.press('balance01', undefined, 0.3);
    const r = d.c.readBalance();
    d.endPress();
    await d.wait(0.8);
    D(d, { type: 'removeFromBalance' });
    return r.id ?? '';
  };

  /** Regla radial leída desde arriba, con el ojo en el plano normal a la escala (la cámara llega antes de leer). */
  const readR = async (d: DemoDirectorF09, target: RadiusTarget) => {
    d.c.lastRadius = target;
    d.lab.camera?.eyeLevel('ruler01');
    await d.wait(1);
    d.lab.camera?.settle();
    await d.wait(0.2);
    const r = d.c.readRadius(target);
    await d.wait(0.9);
    lens(null);
    return r.id ?? '';
  };

  const guard = async (d: DemoDirectorF09, closed: boolean) => {
    if (d.w.base.guardClosed === closed) return;
    await d.press('guard01', undefined, 0.3);
    D(d, { type: 'setGuard', closed });
    d.endPress();
  };

  const brake = async (d: DemoDirectorF09, level: 0 | 1 | 2) => {
    if (d.w.rotor.brake === level) return;
    await d.press('brake01', undefined, 0.3);
    D(d, { type: 'setBrake', level });
    d.endPress();
  };

  /** Sube la consigna en pasos de a lo sumo RAMP_RPM esperando que la mesa siga cada paso (sin saltos bruscos). */
  const rampTo = async (d: DemoDirectorF09, rpm: number) => {
    const cur = () => Math.abs(d.w.rotor.omega) * RPM;
    await d.press('motor01', undefined, 0.3);
    for (let i = 0; i < 12 && Math.abs(rpm - cur()) > RAMP_RPM; i++) {
      D(d, { type: 'setMotor', rpm: cur() + Math.sign(rpm - cur()) * RAMP_RPM });
      await worldWait(d, 1);
    }
    D(d, { type: 'setMotor', rpm });
    d.endPress();
  };

  /** Detiene la mesa: consigna cero, embrague fuera, freno de retención y espera a que quede quieta. */
  const stopTable = async (d: DemoDirectorF09) => {
    if (d.w.motor.clutch && Math.abs(d.w.rotor.omega) > 0.05) {
      await d.press('motor01', undefined, 0.3);
      D(d, { type: 'setMotor', rpm: 0 });
      d.endPress();
      await worldWait(d, 1.5);
    }
    D(d, { type: 'setMotor', rpm: 0 });
    D(d, { type: 'setClutch', on: false });
    await brake(d, 2);
    await worldUntil(d, () => Math.abs(d.w.rotor.omega) <= 1e-3, 30);
    await worldWait(d, 0.5);
  };

  /** Lleva las dos masas radiales a un radio (mesa quieta, guarda abierta) y las bloquea. */
  const placeSlides = async (d: DemoDirectorF09, rCm: number) => {
    d.station('D');
    await guard(d, false);
    for (const s of ['slide1', 'slide2'] as const) {
      await d.press(s, undefined, 0.3);
      D(d, { type: 'lockMass', id: s, on: false });
      const from = d.w.slides[s].r * 100;
      await d.steps01(from, rCm, 1, (v) => void D(d, { type: 'setSlide', id: s, rCm: v }), 0.04);
      D(d, { type: 'setSlide', id: s, rCm });
      D(d, { type: 'lockMass', id: s, on: true });
      d.endPress();
    }
  };

  /** Un tirón: ranura, cordón enrollado una vuelta, carro a la fuerza de la ruta, lectura del dinamómetro y del encoder. */
  const torqueTrial = async (d: DemoDirectorF09, armCm: number, show: boolean) => {
    d.station('C');
    await guard(d, false);
    await d.press('drum01', undefined, 0.4);
    D(d, { type: 'setArm', rCm: armCm });
    d.endPress();
    const arm = await readR(d, 'arm');
    await d.press('drum01', undefined, 0.4);
    D(d, { type: 'windCord', turns: 1, dir: 1 });
    d.endPress();
    await d.press('dyn01', undefined, 0.3);
    await d.steps01(d.w.drum.pullN, ROUTE_PULL, 0.2, (v) => void D(d, { type: 'setPull', forceN: v }), 0.04);
    D(d, { type: 'setPull', forceN: ROUTE_PULL });
    d.endPress();
    await guard(d, true);
    await brake(d, 0);
    d.lab.camera?.eyeLevel('dyn01');
    await d.wait(1);
    d.lab.camera?.settle();
    await d.press('dyn01', undefined, 0.2);
    D(d, { type: 'startPull' });
    d.endPress();
    await worldWait(d, 0.4);
    const dyn = d.c.readDyn().id ?? '';
    await worldUntil(d, () => !d.w.run || d.w.run.done, 40);
    lens('logger01');
    const enc = D(d, { type: 'readEncoder' }).id ?? '';
    if (show) {
      const e = d.w.readings[enc];
      d.note(d.hooks.t('f09.demo.notes.fit', { a: num(e?.fit?.alpha ?? 0, 2), ac: num(Math.abs(e?.fit?.alphaC ?? 0), 3) }));
      await d.wait(2.6);
      d.note(null);
    }
    await d.wait(1);
    lens(null);
    d.station('A');
    await stopTable(d);
    return { dyn, enc, arm };
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
        for (const id of INSPECT_F9) {
          await d.press(id, undefined, 0.3);
          D(d, { type: 'inspect', target: id });
        }
        d.endPress();
      },
    },
    {
      part: 'A', key: 'masses',
      run: async (d) => {
        d.station('F');
        await guard(d, false);
        await d.press('balance01', undefined, 0.5);
        D(d, { type: 'tareBalance' });
        d.endPress();
        await d.wait(0.6);
        ids.mOrb = await weigh(d, 'orbit01');
        ids.mSlide = await weigh(d, 'slide1');
        d.note(d.hooks.t('f09.demo.notes.masses'));
        await d.wait(1.4);
        lens(null);
        d.note(null);
      },
    },
    {
      part: 'A', key: 'setup',
      run: async (d) => {
        d.station('A');
        await d.press('base01', undefined, 0.4);
        D(d, { type: 'clampBase', on: true });
        await d.press('level01', undefined, 0.4);
        D(d, { type: 'levelAxis' });
        d.endPress();
        d.station('E');
        await d.press('logger01', undefined, 0.4);
        for (const ch of ['encoder', 'force', 'gate'] as const) {
          D(d, { type: 'connect', channel: ch, on: true });
          await d.wait(0.2);
        }
        D(d, { type: 'setRate', hz: 200 });
        await d.press('encoder01', undefined, 0.4);
        D(d, { type: 'calibrateEncoder' });
        await d.press('gate01', undefined, 0.4);
        D(d, { type: 'routeCable', on: true });
        await d.press('force01', undefined, 0.4);
        if (d.w.force.angleDeg !== 0) D(d, { type: 'mountForce', angleDeg: 0 });
        D(d, { type: 'zeroForce' });
        D(d, { type: 'setForceRange', n: 1 });
        d.station('C');
        await d.press('dyn01', undefined, 0.4);
        D(d, { type: 'zeroDyn' });
        if (d.w.drum.aimDeg !== 0) D(d, { type: 'aimDyn', deg: 0 });
        d.endPress();
        d.note(d.hooks.t('f09.demo.notes.setup'));
        await d.wait(1.4);
        d.note(null);
      },
    },
    {
      part: 'B', key: 'orbit',
      run: async (d) => {
        await placeSlides(d, ROUTE_SLIDE_C);
        d.station('B');
        await d.press('orbit01', undefined, 0.5);
        D(d, { type: 'mountOrbit', on: true });
        await d.wait(0.4);
        D(d, { type: 'tightenCord' });
        const target = routeOrbitRF09(d.w.scenarios);
        await d.steps01(d.w.orbit.r * 100, target, 1, (v) => void D(d, { type: 'setOrbitRadius', rCm: v }), 0.05);
        D(d, { type: 'setOrbitRadius', rCm: target });
        await d.press('guide01', undefined, 0.4);
        D(d, { type: 'lockStop', on: true });
        d.endPress();
        ids.rOrb = await readR(d, 'orbit01');
        d.station('C');
        await d.press('drum01', undefined, 0.4);
        D(d, { type: 'setArm', rCm: ROUTE_ARMS[0] });
        d.endPress();
        ids.rArm1 = await readR(d, 'arm');
        ids.rSlideC = await readR(d, 'slide1');
        await readR(d, 'slide2');
        d.note(d.hooks.t('f09.demo.notes.orbit', { cm: num(target, 0) }));
        await d.wait(1.4);
        d.note(null);
      },
    },
    {
      part: 'B', key: 'centripetal',
      run: async (d) => {
        d.station('A');
        await guard(d, true);
        await brake(d, 0);
        await d.press('motor01', undefined, 0.4);
        D(d, { type: 'setClutch', on: true });
        d.endPress();
        for (const rpm of routeSpeedsF09(d.w.scenarios)) {
          d.station('A');
          await d.fast(3, () => rampTo(d, rpm));
          await worldWait(d, 3);
          d.station('E');
          await d.press('logger01', undefined, 0.3);
          lens('logger01');
          ids.forces.push(d.c.readSensor('readForce').id ?? '');
          D(d, { type: 'timeTurns', turns: ROUTE_TURNS });
          d.endPress();
          await worldWait(d, 0.1);
          await d.fast(3, () => worldUntil(d, () => !d.w.timing, 40));
          const last = d.w.readingOrder[d.w.readingOrder.length - 1];
          ids.periods.push(d.w.readings[last]?.kind === 'period' ? last : '');
          const f = d.w.readings[ids.forces[ids.forces.length - 1]];
          const p = d.w.readings[last];
          d.note(d.hooks.t('f09.demo.notes.speed', { rpm, F: num(f?.value ?? 0, 3), T: num(p?.value ?? 0, 3), n: ROUTE_TURNS }));
          await d.wait(1.6);
          d.note(null);
        }
        lens(null);
        d.station('A');
        await stopTable(d);
      },
    },
    {
      part: 'C', key: 'torque',
      run: async (d) => {
        d.station('B');
        await guard(d, false);
        await d.press('guide01', undefined, 0.3);
        D(d, { type: 'lockStop', on: false });
        await d.press('orbit01', undefined, 0.4);
        D(d, { type: 'mountOrbit', on: false });
        d.endPress();
        for (let i = 0; i < ROUTE_ARMS.length; i++) {
          const r = await torqueTrial(d, ROUTE_ARMS[i], i === 0);
          ids.dyns.push(r.dyn);
          ids.encs.push(r.enc);
          if (i === 1) ids.rArm2 = r.arm;
        }
        d.note(d.hooks.t('f09.demo.notes.torque'));
        await d.wait(1.6);
        d.note(null);
      },
    },
    {
      part: 'D', key: 'momentum',
      run: async (d) => {
        await placeSlides(d, ROUTE_SLIDE_OUT);
        ids.r1 = await readR(d, 'slide1');
        await readR(d, 'slide2');
        d.station('A');
        await guard(d, true);
        await brake(d, 0);
        await d.press('motor01', undefined, 0.4);
        D(d, { type: 'setClutch', on: true });
        d.endPress();
        await d.fast(3, () => rampTo(d, ROUTE_SPIN_D));
        await worldWait(d, 3);
        await d.press('motor01', undefined, 0.4);
        D(d, { type: 'setClutch', on: false });
        d.endPress();
        await worldWait(d, 1);
        d.station('D');
        lens('logger01');
        ids.w1 = D(d, { type: 'readOmega' }).id ?? '';
        await d.press('pull01', undefined, 0.5);
        D(d, { type: 'pullIn', rCm: ROUTE_SLIDE_IN });
        d.endPress();
        await worldWait(d, 0.2);
        await worldUntil(d, () => d.w.pullTarget === null, 15);
        await worldWait(d, 1);
        ids.w2 = D(d, { type: 'readOmega' }).id ?? '';
        const w1 = d.w.readings[ids.w1]?.value ?? 0;
        const w2 = d.w.readings[ids.w2]?.value ?? 0;
        d.note(d.hooks.t('f09.demo.notes.momentum', { w1: num(w1, 2), w2: num(w2, 2) }));
        await d.wait(2.4);
        d.note(null);
        lens(null);
        d.station('A');
        await stopTable(d);
        await guard(d, false);
        ids.r2 = await readR(d, 'slide1');
        await readR(d, 'slide2');
      },
    },
    {
      part: 'F', key: 'notebook',
      run: async (d) => {
        d.station('F');
        ui.notebook(true, 'readings');
        await d.wait(1.6);
        ui.edit((nb) => {
          fillNotebookF9(d.w, ids, nb);
        });
        for (const tab of ['setup', 'circ', 'torque', 'momentum', 'calc', 'analysis']) {
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
        await stopTable(d);
        await guard(d, false);
        for (const s of ['slide1', 'slide2'] as const) {
          if (d.w.slides[s].locked) continue;
          await d.press(s, undefined, 0.3);
          D(d, { type: 'lockMass', id: s, on: true });
        }
        if (d.w.objects.orbit01.support !== 'rack') {
          await d.press('orbit01', undefined, 0.4);
          D(d, { type: 'mountOrbit', on: false });
        }
        d.endPress();
        await guard(d, true);
        D(d, { type: 'closeStation' });
        await d.wait(1);
      },
    },
  ];
}
