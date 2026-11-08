/**
 * Guion de la demostración de F102: la MANO VIRTUAL recorre la práctica con los mismos comandos que el estudiante
 * (nivelación con el inclinómetro, compuertas, corridas con el lanzador, masa colgante y cinta, caída libre desde tres
 * alturas, filtros con el sensor de movimiento y libreta). Las lecturas de reglas y escalas se toman con la cámara de
 * frente, como pide el procedimiento, así que salen sin paralaje. No genera nota.
 */
import type { DemoDirectorF102, DemoStepF102 } from './director';
import type { F102Notebook } from '../../../practices/practice-f102/notebook';
import type { F102Command } from '../../../simulation/f102-world/commands';
import { fillNotebookF2, type RouteIdsF2 } from '../../../practices/practice-f102/notebook-fill';
import { TR, TW, gatePos, magnetPoleZ } from '../../../engine/f102/layout';

export interface DemoUiHooksF102 {
  notebook(open: boolean, tab?: string): void;
  edit(fn: (nb: F102Notebook) => void): void;
}

export function buildDemoScriptF102(ui: DemoUiHooksF102): DemoStepF102[] {
  const ids: RouteIdsF2 = { setup: {}, angle: '', uniform: [], tape: [], heights: [], falls: [], drag: [] };
  const D = (d: DemoDirectorF102, c: F102Command) => d.dispatch(c);
  const cm = (m: number) => Math.round(m * 1000) / 10;

  /** Espera (en tiempo del mundo) a que el inclinómetro se asiente tras apoyarlo o girar el tornillo. */
  const settle = async (d: DemoDirectorF102) => {
    await d.until(() => d.w.timeS - d.w.inclinometer.placedS > 2, 8);
    await d.wait(0.3);
  };

  /** Lleva el carro sostenido de una posición a otra, de a 2 cm (se ve la mano empujándolo). */
  const moveCart = async (d: DemoDirectorF102, toCm: number) => {
    await d.press('cart01', undefined, 0.2);
    const from = cm(d.w.cart.s);
    await d.steps01(from, toCm, 2, (v) => D(d, { type: 'holdCart', sCm: Math.round(v * 10) / 10 }), 0.03);
  };

  /** Corre la base de una compuerta a lo largo de la regla, de a 2 cm. */
  const moveGate = async (d: DemoDirectorF102, gateId: string, toCm: number) => {
    await d.press(gateId, undefined, 0.2);
    const from = cm(d.w.gates[gateId].s);
    if (Math.abs(from - toCm) < 0.05) return;
    await d.steps01(from, toCm, 2, (v) => D(d, { type: 'setGatePos', gateId, sCm: Math.round(v * 10) / 10 }), 0.03);
  };

  /** Lee la regla del carril con el ojo enfrente de la marca (vista frontal, sin paralaje). */
  const readRuler = async (d: DemoDirectorF102, target: 'gate1' | 'gate2' | 'flag') => {
    const p = target === 'flag' ? { x: d.w.objects.cart01.pose.x, y: d.w.objects.cart01.pose.y, z: d.w.objects.cart01.pose.z } : gatePos(d.w, target);
    const y = p.y - TR.w / 2;
    d.lab.camera?.lookAt(p.x, y, p.z - d.lab.eyeOffsetCm, 32, 0.06);
    await d.until(() => Math.abs(d.c.frontViewDeg(p.x, y, p.z)) < 8, 4);
    await d.wait(0.3);
    const r = d.c.readRuler(target);
    await d.wait(0.6);
    return r.id ?? '';
  };

  const readScale = async (d: DemoDirectorF102) => {
    const z = magnetPoleZ(d.w);
    d.lab.camera?.lookAt(TW.x, TW.y, z - d.lab.eyeOffsetCm, 70, 0.0);
    await d.until(() => Math.abs(d.c.elevationDeg(TW.x, TW.y, z)) < 4, 4);
    await d.wait(0.3);
    const r = d.c.readTowerScale();
    await d.wait(0.6);
    return r.id ?? '';
  };

  const placeGates = async (d: DemoDirectorF102, g1: number, g2: number) => {
    // Primero la más lejana, para que las bases no se crucen.
    await moveGate(d, 'gate2', g2);
    await moveGate(d, 'gate1', g1);
  };

  const launcherRun = async (d: DemoDirectorF102) => {
    await moveCart(d, 30);
    await d.press('cart01', undefined, 0.3);
    D(d, { type: 'cockLauncher', notchCm: 1 });
    await d.wait(0.3);
    await moveCart(d, 0);
    D(d, { type: 'releaseCart', pushMs: 0 });
    await d.wait(0.3);
    await d.press('gateTimer01', undefined, 0.3);
    D(d, { type: 'armGateTimer' });
    await d.wait(0.3);
    await d.press('cart01', undefined, 0.3);
    D(d, { type: 'pullLatch' });
    d.endPress();
    const g2 = d.w.gates.gate2.s;
    await d.until(() => d.w.cart.s >= g2 + 0.1, 8);
    D(d, { type: 'holdCart', sCm: cm(d.w.cart.s) });
    await d.press('gateTimer01', undefined, 0.4);
    const r = d.c.readGateTimer();
    await d.wait(0.9);
    await moveCart(d, 30);
    return r.id ?? '';
  };

  const tapeRun = async (d: DemoDirectorF102) => {
    await moveCart(d, 30);
    await d.press('tapeTimer01', undefined, 0.3);
    D(d, { type: 'startTape' });
    await d.wait(0.25);
    d.endPress();
    D(d, { type: 'releaseCart', pushMs: 0 });
    // Se corta antes de que el portapesas toque el piso (después la cinta ya no muestra la aceleración constante).
    await d.press('tapeTimer01', undefined, 1.0);
    const r = D(d, { type: 'stopTape' });
    await d.wait(0.6);
    await moveCart(d, 30);
    return r.id ?? '';
  };

  const magnetDrop = async (d: DemoDirectorF102, hCm: number, body: string) => {
    await d.press('tower01', { x: TW.x, y: TW.y, z: magnetPoleZ(d.w) }, 0.3);
    D(d, { type: 'tightenClamp', on: false });
    const from = d.w.magnet.h * 100;
    await d.steps01(from, hCm, 3, (v) => D(d, { type: 'setMagnetHeight', hCm: Math.round(v * 10) / 10 }), 0.03);
    D(d, { type: 'tightenClamp', on: true });
    D(d, { type: 'switchMagnet', on: true });
    await d.press(body, undefined, 0.3);
    D(d, { type: 'attachToMagnet', id: body, offsetMm: 0 });
    await d.wait(0.4);
    const h = await readScale(d);
    d.station('E');
    await d.wait(0.9);
    await d.press('photocell01', undefined, 0.3);
    D(d, { type: 'armFallTimer' });
    await d.press('tower01', { x: TW.x, y: TW.y, z: magnetPoleZ(d.w) }, 0.3);
    D(d, { type: 'switchMagnet', on: false });
    d.endPress();
    await d.wait(1.2);
    await d.press('photocell01', undefined, 0.3);
    const t = d.c.readFallTimer();
    await d.wait(0.8);
    await d.press(body, undefined, 0.3);
    D(d, { type: 'pickUpBody', id: body });
    return { h, t: t.id ?? '' };
  };

  const filterDrop = async (d: DemoDirectorF102, base: string) => {
    await d.press('motionSensor01', undefined, 0.3);
    D(d, { type: 'startMotion' });
    await d.wait(0.2);
    await d.press(base, undefined, 0.3);
    D(d, { type: 'dropByHand', id: base, heightCm: 120, offsetMm: 0, pushMs: 0 });
    d.endPress();
    await d.wait(2.6);
    await d.press('motionSensor01', undefined, 0.3);
    const r = D(d, { type: 'stopMotion' });
    await d.wait(0.6);
    await d.press(base, undefined, 0.3);
    D(d, { type: 'pickUpBody', id: base });
    return r.id ?? '';
  };

  return [
    {
      part: 'A', key: 'inspect',
      run: async (d) => {
        d.station('A');
        await d.wait(1.2);
        for (const id of ['inclinometer01', 'track01', 'cart01', 'gate1', 'gateTimer01', 'tapeTimer01', 'pulley01', 'tower01', 'photocell01', 'motionSensor01', 'gate2']) {
          await d.press(id, undefined, 0.35);
          D(d, { type: 'inspect', target: id });
        }
        d.endPress();
      },
    },
    {
      part: 'A', key: 'zero',
      run: async (d) => {
        await d.press('inclinometer01', undefined, 0.4);
        D(d, { type: 'placeInclinometer', where: 'bench' });
        d.note(d.hooks.t('f102.demo.notes.settle'));
        await settle(d);
        D(d, { type: 'zeroInclinometer' });
        await d.wait(0.6);
      },
    },
    {
      part: 'B', key: 'level',
      run: async (d) => {
        d.station('B');
        await d.press('inclinometer01', undefined, 0.4);
        D(d, { type: 'placeInclinometer', where: 'track' });
        let last = '';
        for (let i = 0; i < 8; i++) {
          await settle(d);
          const r = d.c.readInclinometer();
          last = r.id ?? last;
          const deg = r.value ?? 0;
          d.note(d.hooks.t('f102.demo.notes.angle', { deg: deg.toFixed(2).replace('.', ',') }));
          if (Math.abs(deg) < 0.05) break;
          const turns = -Math.round((Math.tan((deg * Math.PI) / 180) * d.w.params.feetSpanM * 1000) / d.w.params.footPitchMm);
          await d.press('track01', undefined, 0.3);
          D(d, { type: 'turnFootScrew', turns });
        }
        ids.angle = last;
        await d.press('inclinometer01', undefined, 0.3);
        D(d, { type: 'placeInclinometer', where: 'bench' });
        d.endPress();
      },
    },
    {
      part: 'B', key: 'gates',
      run: async (d) => {
        await placeGates(d, 50, 80);
        for (const g of ['gate1', 'gate2']) {
          await d.press(g, undefined, 0.3);
          D(d, { type: 'setGateYaw', gateId: g, yawDeg: 0 });
          D(d, { type: 'connectGate', gateId: g, on: true });
        }
        d.endPress();
      },
    },
    {
      part: 'B', key: 'ruler',
      run: async (d) => {
        ids.setup.gate1 = await readRuler(d, 'gate1');
        ids.setup.gate2 = await readRuler(d, 'gate2');
        ids.setup.flag = await readRuler(d, 'flag');
        d.station('B');
      },
    },
    {
      part: 'C', key: 'launch',
      run: async (d) => {
        d.station('C');
        await d.wait(1);
        ids.uniform.push(await launcherRun(d));
        const r = ids.uniform[0] ? d.w.readings[ids.uniform[0]] : null;
        if (r && Number.isFinite(r.value)) d.note(d.hooks.t('f102.demo.notes.gateTime', { t: Number(r.value).toFixed(4).replace('.', ',') }));
        await d.wait(1);
      },
    },
    {
      part: 'C', key: 'repeat',
      run: async (d) => {
        await d.fast(2, async () => {
          ids.uniform.push(await launcherRun(d));
          await placeGates(d, 40, 80);
          ids.uniform.push(await launcherRun(d));
          await placeGates(d, 50, 80);
        });
      },
    },
    {
      part: 'D', key: 'hang',
      run: async (d) => {
        d.station('D');
        await moveCart(d, 30);
        await d.press('pulley01', undefined, 0.4);
        D(d, { type: 'attachString', on: true });
        await d.wait(0.3);
        D(d, { type: 'seatString', on: true });
        await d.wait(0.3);
        D(d, { type: 'hangHanger', on: true });
        await d.wait(0.3);
        await d.press('m20a', undefined, 0.4);
        D(d, { type: 'loadMass', massId: 'm20a', on: true });
        await d.press('tapeTimer01', undefined, 0.4);
        D(d, { type: 'attachTape', on: true });
        await d.wait(0.3);
        D(d, { type: 'tensionTape' });
        d.endPress();
        await d.wait(0.5);
      },
    },
    {
      part: 'D', key: 'tape',
      run: async (d) => {
        ids.tape.push(await tapeRun(d));
        await d.fast(2, async () => {
          ids.tape.push(await tapeRun(d));
          ids.tape.push(await tapeRun(d));
        });
      },
    },
    {
      part: 'D', key: 'unhang',
      run: async (d) => {
        await moveCart(d, 30);
        await d.press('m20a', undefined, 0.3);
        D(d, { type: 'loadMass', massId: 'm20a', on: false });
        await d.press('pulley01', undefined, 0.3);
        D(d, { type: 'hangHanger', on: false });
        D(d, { type: 'attachString', on: false });
        await d.press('tapeTimer01', undefined, 0.3);
        D(d, { type: 'attachTape', on: false });
        d.endPress();
      },
    },
    {
      part: 'E', key: 'fall',
      run: async (d) => {
        d.station('E');
        await d.wait(1.2);
        await d.press('photocell01', undefined, 0.4);
        D(d, { type: 'capPhotocell', on: false });
        const body = d.w.scenarios.includes('F102-S11_drag_sphere') ? 'sphereL' : 'sphereS';
        const r = await magnetDrop(d, 60, body);
        ids.heights.push(r.h);
        ids.falls.push(r.t);
      },
    },
    {
      part: 'E', key: 'heights',
      run: async (d) => {
        const body = d.w.scenarios.includes('F102-S11_drag_sphere') ? 'sphereL' : 'sphereS';
        await d.fast(2, async () => {
          for (const h of [90, 120]) {
            const r = await magnetDrop(d, h, body);
            ids.heights.push(r.h);
            ids.falls.push(r.t);
          }
        });
      },
    },
    {
      part: 'E', key: 'filters',
      run: async (d) => {
        await d.press('tower01', { x: TW.x, y: TW.y, z: magnetPoleZ(d.w) }, 0.4);
        D(d, { type: 'swingMagnetArm', armIn: false });
        await d.press('motionSensor01', undefined, 0.4);
        D(d, { type: 'connectMotion', on: true });
        D(d, { type: 'setMotionRange', range: 'far' });
        D(d, { type: 'setMotionRate', hz: 50 });
        D(d, { type: 'aimMotion', aimDeg: 0 });
        await d.wait(0.3);
        D(d, { type: 'calibrateMotion' });
        await d.wait(0.5);
        ids.drag.push(await filterDrop(d, 'f1'));
        await d.press('f2', undefined, 0.4);
        D(d, { type: 'stackFilter', filterId: 'f2', onto: 'f1', offsetMm: 0 });
        await d.wait(0.4);
        ids.drag.push(await filterDrop(d, 'f1'));
        d.endPress();
      },
    },
    {
      part: 'F', key: 'notebook',
      run: async (d) => {
        d.station('B');
        ui.notebook(true, 'readings');
        await d.wait(1.6);
        ui.edit((nb) => {
          fillNotebookF2(d.w, ids, nb);
        });
        for (const tab of ['setup', 'uniform', 'accel', 'fall', 'calc', 'analysis']) {
          ui.notebook(true, tab);
          await d.wait(1.4);
        }
        ui.notebook(false);
      },
    },
    {
      part: 'F', key: 'close',
      run: async (d) => {
        D(d, { type: 'closeStation' });
        await d.wait(1);
      },
    },
  ];
}
