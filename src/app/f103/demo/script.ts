/**
 * Guion de la demostración de F103: la MANO VIRTUAL recorre la práctica con los mismos comandos que el estudiante
 * (EPP, reconocimiento, soporte anclado y nivelado, cero del transportador, altura de la boca, plomada y cinta,
 * fotopuerta, barrido de ángulos sobre la plataforma, otra altura y viento, trayectoria con la pantalla, libreta y
 * cierre). Las escalas se leen con la cámara de frente o desde arriba, como pide el procedimiento, así que salen sin
 * paralaje. Usa la misma ruta que las pruebas de integración (route.ts), paso a paso. No genera nota.
 */
import type { DemoDirectorF103, DemoStepF103 } from './director';
import type { F103Notebook } from '../../../practices/practice-f103/notebook';
import type { F103Command } from '../../../simulation/f103-world/commands';
import type { EyeTargetF3 } from '../../../engine/f103/F103Lab3D';
import { fillNotebookF3 } from '../../../practices/practice-f103/notebook-fill';
import { INSPECT_F3, ROUTE_NOTCH, SWEEP_ANGLES, TRAJ_ANGLE, TRAJ_SCREEN_CM, emptyRouteIdsF3, gateMeanF3, platformTargetCm } from '../../../practices/practice-f103/route';
import { FLOOR_Z, GEOF103 } from '../../../simulation/f103-world/geometry';
import { muzzleRoom, platformRoom, screenRoom } from '../../../engine/f103/layout';

export interface DemoUiHooksF103 {
  notebook(open: boolean, tab?: string): void;
  edit(fn: (nb: F103Notebook) => void): void;
}

const num = (v: number, d: number) => v.toFixed(d).replace('.', ',');

export function buildDemoScriptF103(ui: DemoUiHooksF103): DemoStepF103[] {
  const ids = emptyRouteIdsF3();
  let v0 = NaN;
  const D = (d: DemoDirectorF103, c: F103Command) => d.dispatch(c);
  const x0 = (d: DemoDirectorF103) => Math.round(d.w.launcher.x * 1000) / 10;

  /** Pone el ojo frente a la escala (o encima de la cinta), espera a que la vista quede derecha y lee con el controlador. */
  const look = async (d: DemoDirectorF103, target: EyeTargetF3, view: () => number, read: () => { id?: string; value?: number }) => {
    d.lab.camera?.eyeLevel(target);
    await d.until(() => Math.abs(view()) < 8, 4);
    await d.wait(0.4);
    const r = read();
    await d.wait(0.7);
    return r;
  };

  /** Cinta del suelo: el ojo justo encima de la marca que se lee (sin paralaje), luego la lectura. */
  const lookTape = async (d: DemoDirectorF103, x: number, read: () => { id?: string; value?: number }) => {
    d.lab.camera?.lookAt(x, GEOF103.floorTape.y, FLOOR_Z, 45, 1.5);
    await d.until(() => Math.abs(d.c.tapeView(x)) < 8, 4);
    await d.wait(0.4);
    const r = read();
    await d.wait(0.7);
    return r;
  };

  /** Espera a que el puntero del transportador o la burbuja se asienten (tiempo del mundo). */
  const settle = async (d: DemoDirectorF103, since: () => number, s = 2) => {
    await d.until(() => d.w.timeS - since() > s, 8);
    await d.wait(0.2);
  };

  /** Gira el mando de elevación de a 2° (se ve el cañón subir), deja asentar el puntero y lo lee de frente. */
  const setAngle = async (d: DemoDirectorF103, deg: number, read = true) => {
    await d.press('launcher01', undefined, 0.25);
    await d.steps01(d.w.launcher.angleDeg, deg, 2, (v) => D(d, { type: 'setAngle', deg: Math.round(v * 10) / 10 }), 0.03);
    D(d, { type: 'setAngle', deg });
    d.endPress();
    await settle(d, () => d.w.launcher.touchedS);
    if (!read) return '';
    const r = await look(d, 'launcher01', () => d.c.protractorView(), () => d.c.readProtractor());
    return r.id ?? '';
  };

  /** Arrastra una pieza por el suelo de a 5 cm. */
  const drag = async (d: DemoDirectorF103, from: number, to: number, fn: (v: number) => void) => {
    await d.steps01(from, to, 5, (v) => fn(Math.round(v * 10) / 10), 0.02);
    fn(to);
  };

  const moveScreen = async (d: DemoDirectorF103, xCm: number, inLane: boolean) => {
    await d.press('screen01', undefined, 0.25);
    if (inLane && !d.w.screen.inLane) D(d, { type: 'moveScreen', xCm: d.w.screen.x * 100, inLane: true });
    await drag(d, d.w.screen.x * 100, xCm, (v) => D(d, { type: 'moveScreen', xCm: v, inLane: inLane || d.w.screen.inLane }));
    D(d, { type: 'moveScreen', xCm, inLane });
    d.endPress();
  };

  const movePlatform = async (d: DemoDirectorF103, xCm: number) => {
    await d.press('platform01', undefined, 0.25);
    await drag(d, d.w.platform.x * 100, xCm, (v) => D(d, { type: 'movePlatform', xCm: v, yCm: GEOF103.lane.yc }));
    d.endPress();
  };

  /** Un disparo: carga la esfera, empuja la baqueta hasta la muesca, tira del cordón y sigue el vuelo. */
  const shoot = async (d: DemoDirectorF103, read: 'gate' | 'impact' | 'screen' | null, follow = true) => {
    await d.press('ballA', undefined, 0.25);
    D(d, { type: 'loadBall', ball: 'ballA' });
    await d.press('launcher01', undefined, 0.3);
    D(d, { type: 'cock', notch: ROUTE_NOTCH });
    await d.wait(0.25);
    d.endPress();
    d.c.fire();
    if (follow) {
      const m = muzzleRoom(d.w);
      d.lab.camera?.lookAt(m.x + 150, GEOF103.lane.yc, m.z - 10, 260, 0.15);
    }
    await d.until(() => !!d.w.lastShot?.landed, 10);
    await d.wait(0.5);
    let r: { id?: string; value?: number } = {};
    if (read === 'gate') r = await look(d, 'timer01', () => 0, () => d.c.readGate());
    else if (read === 'impact') r = await look(d, 'platform01', () => 0, () => d.c.readImpact());
    else if (read === 'screen') r = await look(d, 'screen01', () => d.c.screenView(), () => d.c.readScreen());
    D(d, { type: 'collectBall', ball: 'ballA' });
    return r.id ?? '';
  };

  /** Plataforma en la predicción con la v₀ medida; lee la cinta desde arriba del índice y el impacto. */
  const platformShot = async (d: DemoDirectorF103, angle: number) => {
    const t = platformTargetCm(d.w, v0, angle);
    await movePlatform(d, t.x);
    await settle(d, () => d.w.platform.movedS, 1.5);
    const tape = (await lookTape(d, platformRoom(d.w).x - GEOF103.platform.size / 2, () => d.c.readTape('platform'))).id ?? '';
    const impact = await shoot(d, 'impact');
    return { tape, impact };
  };

  return [
    {
      part: 'A', key: 'ppe',
      run: async (d) => {
        d.station('A');
        await d.wait(1);
        for (const item of ['coat', 'goggles', 'shoes', 'hair'] as const) {
          D(d, { type: 'equipPpe', item, on: true });
          await d.wait(0.25);
        }
        D(d, { type: 'startWork' });
        await d.wait(0.4);
      },
    },
    {
      part: 'A', key: 'inspect',
      run: async (d) => {
        for (const id of INSPECT_F3) {
          await d.press(id, undefined, 0.3);
          D(d, { type: 'inspect', target: id });
        }
        d.endPress();
      },
    },
    {
      part: 'A', key: 'anchor',
      run: async (d) => {
        await d.press('stand01', undefined, 0.4);
        if (d.w.launcher.yawDeg !== 0) D(d, { type: 'setYaw', deg: 0 });
        D(d, { type: 'anchorStand', on: true });
        await d.wait(0.4);
        let last = '';
        for (let i = 0; i < 4; i++) {
          await settle(d, () => d.w.stand.touchedS);
          const r = await look(d, 'stand01', () => 0, () => d.c.readLevel());
          last = r.id ?? last;
          const deg = r.value ?? 0;
          d.note(d.hooks.t('f103.demo.notes.level', { deg: num(deg, 1) }));
          if (Math.abs(deg) < 0.05) break;
          await d.press('stand01', undefined, 0.3);
          D(d, { type: 'turnLevelScrew', turns: -Math.round(deg / 0.1) });
        }
        ids.tilt = last;
        d.endPress();
      },
    },
    {
      part: 'A', key: 'zero',
      run: async (d) => {
        d.station('B');
        await setAngle(d, 0, false);
        await d.press('launcher01', undefined, 0.3);
        D(d, { type: 'zeroProtractor' });
        d.endPress();
        await look(d, 'launcher01', () => d.c.protractorView(), () => d.c.readProtractor());
      },
    },
    {
      part: 'A', key: 'height',
      run: async (d) => {
        ids.height = (await look(d, 'heightRuler01', () => d.c.rulerView(), () => d.c.readHeight('muzzle'))).id ?? '';
        await d.press('plumb01', muzzleRoom(d.w), 0.4);
        D(d, { type: 'dropPlumb' });
        await d.wait(0.5);
        await d.press('floorTape01', undefined, 0.4);
        D(d, { type: 'alignTape' });
        d.endPress();
        ids.plumb = (await lookTape(d, (d.w.plumbMark?.x ?? d.w.launcher.x) * 100, () => d.c.readTape('plumb'))).id ?? '';
      },
    },
    {
      part: 'B', key: 'gate',
      run: async (d) => {
        d.station('F');
        await d.wait(1);
        await d.press('gate01', undefined, 0.4);
        D(d, { type: 'mountGate', on: true });
        if (d.w.gate.offsetMm !== 0) D(d, { type: 'setGateOffset', mm: 0 });
        await d.press('timer01', undefined, 0.4);
        D(d, { type: 'connect', target: 'gate', on: true });
        D(d, { type: 'connect', target: 'platform', on: true });
        D(d, { type: 'setTimerRate', hz: 100000 });
        D(d, { type: 'setClockRange', range: 'long' });
        await d.press('platform01', undefined, 0.4);
        D(d, { type: 'calibratePlatform' });
        d.endPress();
        await d.wait(0.4);
      },
    },
    {
      part: 'B', key: 'velocity',
      run: async (d) => {
        d.station('C');
        await moveScreen(d, x0(d) + 70, true);
        await d.press('barrier01', undefined, 0.4);
        D(d, { type: 'closeBarrier', on: true });
        await d.press('launcher01', undefined, 0.4);
        D(d, { type: 'setCap', on: false });
        d.endPress();
        ids.gate.push(await shoot(d, 'gate'));
        const r = ids.gate[0] ? d.w.readings[ids.gate[0]] : null;
        if (r && Number.isFinite(r.value)) d.note(d.hooks.t('f103.demo.notes.gate', { t: num(r.value * 1000, 3), v: num((r.setup?.ballCm ?? 2.5) / 100 / r.value, 2) }));
        await d.wait(1);
        await d.fast(2.5, async () => {
          for (let i = 0; i < 2; i++) ids.gate.push(await shoot(d, 'gate', false));
        });
        await moveScreen(d, x0(d) + 100, false);
        v0 = gateMeanF3(d.w, ids.gate);
      },
    },
    {
      part: 'C', key: 'sweep',
      run: async (d) => {
        d.station('C');
        for (const [i, a] of SWEEP_ANGLES.entries()) {
          const run = async () => {
            const angle = await setAngle(d, a);
            ids.angles.push({ angle, ...(await platformShot(d, a)) });
          };
          if (i === 0) {
            await run();
            const imp = d.w.readings[ids.angles[0]?.impact];
            if (imp?.impact) d.note(d.hooks.t('f103.demo.notes.impact', { t: num(imp.impact.tFlight, 3) }));
            await d.wait(1);
          } else await d.fast(2.5, run);
        }
      },
    },
    {
      part: 'E', key: 'conditions',
      run: async (d) => {
        d.station('A');
        const alt = d.w.stand.heightCm >= 60 ? 30 : 60;
        await d.press('stand01', undefined, 0.4);
        await d.steps01(d.w.stand.heightCm, alt, 2, (v) => D(d, { type: 'setStandHeight', cm: Math.round(v) }), 0.03);
        d.endPress();
        await settle(d, () => d.w.stand.touchedS);
        const h2 = (await look(d, 'heightRuler01', () => d.c.rulerView(), () => d.c.readHeight('muzzle'))).id ?? '';
        await setAngle(d, 45);
        await d.fast(2.5, async () => {
          for (let i = 0; i < 2; i++) ids.conditions.push({ height: h2, ...(await platformShot(d, 45)) });
        });
        d.station('E');
        await d.press('fan01', undefined, 0.5);
        D(d, { type: 'setFan', speed: 1, dir: 'side' });
        d.endPress();
        d.note(d.hooks.t('f103.demo.notes.wind'));
        await d.wait(1.2);
        ids.conditions.push({ height: h2, ...(await platformShot(d, 45)) });
        await d.press('fan01', undefined, 0.4);
        D(d, { type: 'setFan', speed: 0 });
        d.endPress();
      },
    },
    {
      part: 'D', key: 'trajectory',
      run: async (d) => {
        d.station('D');
        await movePlatform(d, 650);
        ids.trajAngle = await setAngle(d, TRAJ_ANGLE);
        const base = x0(d);
        for (const [i, dx] of TRAJ_SCREEN_CM.entries()) {
          const run = async () => {
            await moveScreen(d, base + dx, true);
            await d.press('screen01', { ...screenRoom(d.w), z: screenRoom(d.w).z + 60 }, 0.3);
            D(d, { type: 'clearScreen' });
            d.endPress();
            const tape = (await lookTape(d, screenRoom(d.w).x, () => d.c.readTape('screen'))).id ?? '';
            const mark = await shoot(d, 'screen');
            ids.trajectory.push({ tape, mark });
          };
          if (i === 0) await run();
          else await d.fast(2.5, run);
        }
        await moveScreen(d, base + 100, false);
      },
    },
    {
      part: 'F', key: 'notebook',
      run: async (d) => {
        d.station('F');
        ui.notebook(true, 'readings');
        await d.wait(1.6);
        ui.edit((nb) => {
          fillNotebookF3(d.w, ids, nb);
        });
        for (const tab of ['setup', 'velocity', 'angles', 'trajectory', 'calc', 'analysis']) {
          ui.notebook(true, tab);
          await d.wait(1.4);
        }
        ui.notebook(false);
      },
    },
    {
      part: 'F', key: 'close',
      run: async (d) => {
        await d.press('launcher01', undefined, 0.4);
        D(d, { type: 'setCap', on: true });
        d.endPress();
        D(d, { type: 'closeStation' });
        await d.wait(1);
      },
    },
  ];
}
