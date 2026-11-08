/**
 * Guion de la demostración de F101: la MANO VIRTUAL recorre la práctica con los mismos comandos que el estudiante
 * (ceros del calibrador y del micrómetro, patrón, dimensiones del cilindro y de la esfera, balanza, probeta, mesa de
 * fuerzas, sensor 2D y libreta). Cada lectura se toma con la vista de lectura del instrumento, así que sale sin
 * paralaje. No genera nota.
 */
import type { DemoDirectorF101, DemoStepF101 } from './director';
import type { F101Notebook } from '../../../practices/practice-f101/notebook';
import type { F101Command } from '../../../simulation/f101-world/commands';
import type { Pose } from '../../../simulation/f101-world/types';
import { GEOF101, TABLE_CENTER } from '../../../simulation/f101-world/geometry';
import { projectedExtentMm } from '../../../simulation/instruments/vernier-caliper';
import { BALANCE_POS } from '../../../practices/practice-f101/definition';
import { fillNotebook } from '../../../practices/practice-f101/notebook-fill';
import { meniscusZ, micrometerAxis } from '../../../engine/f101/layout';

export interface DemoUiHooksF101 {
  notebook(open: boolean, tab?: string): void;
  edit(fn: (nb: F101Notebook) => void): void;
}

const pose = (x: number, y: number, z = 0): Pose => ({ x, y, z, rotationRad: 0 });
const PAN = pose(BALANCE_POS.x, BALANCE_POS.y, GEOF101.balance.panZ);

/** Montaje 3-4-5: 150 g a 0°, 200 g a 90° y 250 g a 233° (la equilibrante de las dos primeras). */
const SETUP: Array<{ pulley: string; hanger: string; angle: number; masses: string[] }> = [
  { pulley: 'pulley1', hanger: 'hanger1', angle: 0, masses: ['s100a'] },
  { pulley: 'pulley2', hanger: 'hanger2', angle: 90, masses: ['s100b', 's50a'] },
  { pulley: 'pulley3', hanger: 'hanger3', angle: 233, masses: ['s200a'] },
];

export function buildDemoScriptF101(ui: DemoUiHooksF101): DemoStepF101[] {
  const ids: Record<string, string> = {};
  const D = (d: DemoDirectorF101, c: F101Command) => d.dispatch(c);
  const r2 = (v: number) => Math.round(v * 100) / 100;

  // ───────────── Calibrador ─────────────

  const slideTo = async (d: DemoDirectorF101, mm: number) => {
    await d.steps01(d.w.caliper.jawMm, mm, 2, (v) => D(d, { type: 'setCaliperSlide', targetMm: r2(v) }), 0.03);
  };

  const readCaliper = async (d: DemoDirectorF101) => {
    const o = d.w.objects.caliper01.pose;
    await d.eye('caliper01', () => Math.abs(d.c.flatViewDeg(o.x, o.y, o.z + 0.6)) < 12);
    const r = d.c.readCaliper();
    await d.wait(0.8);
    return r.id ?? '';
  };

  const caliperZero = async (d: DemoDirectorF101) => {
    await d.press('caliper01', undefined, 0.3);
    D(d, { type: 'placeInCaliper', partId: null, dimension: 'd', tiltDeg: 0, spinDeg: 0 });
    await slideTo(d, -0.5);
    const id = await readCaliper(d);
    D(d, { type: 'releaseCaliper' });
    return id;
  };

  const caliperMeasure = async (d: DemoDirectorF101, partId: string, dimension: 'd' | 'h' | 'L', spinDeg = 0) => {
    const extent = dimension === 'h' ? 50 : 20;
    d.station('B');
    await d.press('caliper01', undefined, 0.2);
    await slideTo(d, extent + 8);
    await d.press(partId, undefined, 0.3);
    D(d, { type: 'placeInCaliper', partId, dimension, tiltDeg: 0, spinDeg });
    await d.wait(0.3);
    // El pulgar empuja el cursor medio milímetro más allá del contacto, con presión suave.
    const contact = d.w.caliper.part ? projectedExtentMm(d.w.caliper.part) : 0;
    await d.press('caliper01', undefined, 0.2);
    await slideTo(d, contact - 0.5);
    const id = await readCaliper(d);
    D(d, { type: 'releaseCaliper' });
    await slideTo(d, extent + 8);
    D(d, { type: 'placeInCaliper', partId: null, dimension, tiltDeg: 0, spinDeg: 0 });
    return id;
  };

  // ───────────── Micrómetro ─────────────

  const turn = (d: DemoDirectorF101, deltaDeg: number, via: 'thimble' | 'ratchet' = 'thimble') => D(d, { type: 'turnMicrometer', deltaDeg, via });

  const microOpen = async (d: DemoDirectorF101, toMm = 24) => {
    for (let i = 0; i < 40 && d.w.micrometer.spindleMm < toMm; i++) {
      turn(d, -Math.min(720, ((toMm - d.w.micrometer.spindleMm) / 0.5) * 360 + 1));
      await d.wait(0.05);
    }
  };

  /** Acerca con el tambor, retrocede un poco, toca en pasos finos y da un cuarto de vuelta con el trinquete. */
  const microClose = async (d: DemoDirectorF101) => {
    for (let i = 0; i < 200 && d.w.micrometer.forceN <= 0; i++) {
      turn(d, 720);
      await d.wait(0.05);
    }
    turn(d, -60);
    for (let i = 0; i < 80 && d.w.micrometer.forceN <= 0; i++) {
      turn(d, 2, 'ratchet');
      if (i % 4 === 0) await d.wait(0.03);
    }
    turn(d, 90, 'ratchet');
    await d.wait(0.3);
  };

  const readMicro = async (d: DemoDirectorF101) => {
    const a = micrometerAxis(d.w);
    await d.eye('micrometer01', () => Math.abs(d.c.frontViewDeg(a.x + 3, a.y, a.z)) < 12);
    const r = d.c.readMicrometer();
    await d.wait(0.8);
    return r.id ?? '';
  };

  const microMeasure = async (d: DemoDirectorF101, partId: string, spinDeg: number) => {
    d.station('B');
    await d.press('micrometer01', undefined, 0.2);
    await microOpen(d);
    await d.press(partId, undefined, 0.3);
    D(d, { type: 'placeInMicrometer', partId, spinDeg });
    await d.press('micrometer01', undefined, 0.2);
    await microClose(d);
    const id = await readMicro(d);
    await microOpen(d);
    D(d, { type: 'placeInMicrometer', partId: null, spinDeg: 0 });
    return id;
  };

  // ───────────── Balanza y probeta ─────────────

  const readMass = async (d: DemoDirectorF101) => {
    await d.wait(2);
    await d.until(() => d.w.balance.stable, 20);
    await d.eye('balance01', () => true);
    await d.press('balance01', undefined, 0.3);
    const r = d.c.readBalance();
    await d.wait(0.8);
    return r.id ?? '';
  };

  const weigh = async (d: DemoDirectorF101, id: string) => {
    d.station('C');
    await d.press(id, undefined, 0.4);
    D(d, { type: 'setPose', id, pose: PAN, support: 'pan' });
    const r = await readMass(d);
    d.station('C');
    await d.press(id, undefined, 0.3);
    D(d, { type: 'setPose', id, pose: pose(196, 18), support: 'bench' });
    await d.wait(1);
    return r;
  };

  const readVol = async (d: DemoDirectorF101) => {
    await d.wait(3);
    const eyeDz = () => (d.lab.camera?.position().z ?? 0) + d.lab.eyeOffsetCm - meniscusZ(d.w);
    await d.eye('gradCyl01', () => Math.abs(eyeDz()) < 0.5);
    const r = d.c.readVolume();
    await d.wait(0.8);
    return r.id ?? '';
  };

  // ───────────── Mesa de fuerzas ─────────────

  const recordEq = async (d: DemoDirectorF101) => {
    await d.eye('forceTable01', () => d.c.tableViewElevDeg() > 70);
    const r = d.c.recordEquilibrium();
    await d.wait(1);
    return r.id ?? '';
  };

  return [
    {
      part: 'A', key: 'inspect',
      run: async (d) => {
        d.station('A');
        await d.wait(1.2);
        for (const id of ['caliper01', 'micrometer01', 'ruler01', 'gaugeBlock01', 'massStd01']) {
          await d.press(id, undefined, 0.45);
          D(d, { type: 'inspect', target: id });
        }
        d.endPress();
      },
    },
    {
      part: 'B', key: 'zeros',
      run: async (d) => {
        d.station('B');
        await d.wait(1);
        ids.calZero = await caliperZero(d);
        d.station('B');
        await d.press('micrometer01', undefined, 0.4);
        D(d, { type: 'cleanFaces' });
        await d.wait(0.4);
        await microClose(d);
        ids.microZero = await readMicro(d);
        await microOpen(d);
        d.station('B');
        d.endPress();
      },
    },
    {
      part: 'B', key: 'standard',
      run: async (d) => {
        ids.standard = await caliperMeasure(d, 'gaugeBlock01', 'L');
        const r = d.w.readings[ids.standard];
        if (r) d.note(d.hooks.t('f101.demo.notes.standard', { v: String(r.value).replace('.', ',') }));
        await d.wait(1);
      },
    },
    {
      part: 'B', key: 'cylinder',
      run: async (d) => {
        ids.cylD0 = await caliperMeasure(d, 'metalCyl01', 'd', 0);
        await d.fast(3, async () => {
          ids.cylD1 = await caliperMeasure(d, 'metalCyl01', 'd', 60);
          ids.cylD2 = await caliperMeasure(d, 'metalCyl01', 'd', 120);
          for (const [i, s] of [0, 90, 180].entries()) ids[`cylH${i}`] = await caliperMeasure(d, 'metalCyl01', 'h', s);
        });
      },
    },
    {
      part: 'B', key: 'ball',
      run: async (d) => {
        ids.ballD0 = await microMeasure(d, 'steelBall01', 0);
        await d.fast(3, async () => {
          ids.ballD1 = await microMeasure(d, 'steelBall01', 45);
          ids.ballD2 = await microMeasure(d, 'steelBall01', 90);
        });
      },
    },
    {
      part: 'C', key: 'balance',
      run: async (d) => {
        d.station('C');
        await d.press('balance01', undefined, 0.4);
        D(d, { type: 'inspect', target: 'balance01' });
        D(d, { type: 'powerBalance', on: true });
        await d.wait(0.3);
        D(d, { type: 'levelBalance' });
        await d.wait(2);
        d.c.tare();
        await d.wait(1);
        ids.mCyl = await weigh(d, 'metalCyl01');
        ids.mBall = await weigh(d, 'steelBall01');
      },
    },
    {
      part: 'C', key: 'volume',
      run: async (d) => {
        d.station('C');
        await d.press('gradCyl01', undefined, 0.4);
        D(d, { type: 'inspect', target: 'gradCyl01' });
        ids.v0 = await readVol(d);
        d.station('C');
        await d.press('metalCyl01', undefined, 0.4);
        D(d, { type: 'dropIntoCylinder', partId: 'metalCyl01', heightCm: 1 });
        d.endPress();
        ids.v1 = await readVol(d);
        const a = d.w.readings[ids.v0];
        const b = d.w.readings[ids.v1];
        if (a && b) d.note(d.hooks.t('f101.demo.notes.volume', { v: String(Math.round((b.value - a.value) * 10) / 10).replace('.', ',') }));
        d.station('C');
        await d.press('gradCyl01', undefined, 0.4);
        D(d, { type: 'retrievePart', partId: 'metalCyl01' });
        await d.press('metalCyl01', undefined, 0.4);
        D(d, { type: 'dryPart', partId: 'metalCyl01' });
        d.endPress();
      },
    },
    {
      part: 'D', key: 'level',
      run: async (d) => {
        d.station('D');
        await d.wait(1);
        await d.press('forceTable01', undefined, 0.3);
        D(d, { type: 'inspect', target: 'forceTable01' });
        await d.press('level01', undefined, 0.4);
        D(d, { type: 'setPose', id: 'level01', pose: pose(TABLE_CENTER.x, TABLE_CENTER.y, GEOF101.forceTable.topZ), support: 'forceTable01' });
        await d.wait(0.8);
        D(d, { type: 'levelTable' });
        await d.wait(0.8);
        await d.press('level01', undefined, 0.3);
        D(d, { type: 'setPose', id: 'level01', pose: pose(48, 44), support: 'bench' });
        d.endPress();
      },
    },
    {
      part: 'D', key: 'forces',
      run: async (d) => {
        const oblique = d.w.scenarios.includes('F101-S08_oblique_forces');
        const setup = oblique ? SETUP.map((s) => ({ ...s, angle: s.angle + 20 })) : SETUP;
        for (const s of setup) {
          await d.press(s.pulley, undefined, 0.3);
          D(d, { type: 'setPulleyAngle', pulleyId: s.pulley, angleDeg: s.angle });
          D(d, { type: 'seatPulley', pulleyId: s.pulley, on: true });
        }
        for (const s of setup) {
          await d.press(s.hanger, undefined, 0.35);
          D(d, { type: 'hang', hangerId: s.hanger, pulleyId: s.pulley });
          for (const m of s.masses) {
            await d.press(m, undefined, 0.3);
            D(d, { type: 'loadMass', massId: m, hangerId: s.hanger });
          }
        }
        d.endPress();
        await d.wait(1);
      },
    },
    {
      part: 'D', key: 'equilibrium',
      run: async (d) => {
        await d.press('forceTable01', undefined, 0.4);
        d.c.togglePin();
        d.endPress();
        await d.wait(3);
        ids.eq = await recordEq(d);
        d.station('D');
      },
    },
    {
      part: 'E', key: 'sensor',
      run: async (d) => {
        d.station('E');
        await d.wait(1);
        await d.press('sensorBox01', undefined, 0.4);
        D(d, { type: 'inspect', target: 'sensorBox01' });
        D(d, { type: 'connectSensor', on: true });
        D(d, { type: 'setSensorRate', hz: 50 });
        await d.press('massStd01', undefined, 0.4);
        D(d, { type: 'setPose', id: 'massStd01', pose: pose(342, 48, 4), support: 'sensor01' });
        await d.wait(0.6);
        D(d, { type: 'calibrateSensor' });
        await d.wait(0.6);
        await d.press('massStd01', undefined, 0.3);
        D(d, { type: 'setPose', id: 'massStd01', pose: pose(54, 20), support: 'bench' });
        d.station('D');
        await d.press('forceTable01', undefined, 0.4);
        if (!d.w.table.pinIn) d.c.togglePin();
        await d.press('hanger3', undefined, 0.4);
        D(d, { type: 'hang', hangerId: 'hanger3', pulleyId: null });
        D(d, { type: 'loadMass', massId: 's200a', hangerId: null });
        d.endPress();
        await d.wait(2);
        await d.press('sensorBox01', undefined, 0.3);
        D(d, { type: 'startCapture' });
        await d.wait(2);
        ids.sensor = D(d, { type: 'stopCapture' }).id ?? '';
        d.endPress();
      },
    },
    {
      part: 'E', key: 'unload',
      run: async (d) => {
        d.station('D');
        if (!d.w.table.pinIn) d.c.togglePin();
        for (const s of SETUP) {
          for (const m of s.masses) {
            await d.press(m, undefined, 0.25);
            D(d, { type: 'loadMass', massId: m, hangerId: null });
          }
          await d.press(s.hanger, undefined, 0.25);
          D(d, { type: 'hang', hangerId: s.hanger, pulleyId: null });
        }
        d.endPress();
      },
    },
    {
      part: 'F', key: 'notebook',
      run: async (d) => {
        d.station('C');
        ui.notebook(true, 'readings');
        await d.wait(1.6);
        ui.edit((nb) => {
          fillNotebook(d.w, ids, nb);
        });
        for (const tab of ['data', 'calc', 'vectors', 'analysis']) {
          ui.notebook(true, tab);
          await d.wait(1.6);
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
