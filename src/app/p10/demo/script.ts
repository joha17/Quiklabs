/**
 * Guion de la demostración de la Práctica 10: la ruta correcta con los mismos gestos que hará el estudiante (una
 * réplica de la Parte A y la Parte B completa). Textos en `p10.demo.steps.<clave>` (locales/es/practice10.json). La
 * libreta se llena solo con lecturas; los cálculos de R, el ajuste y las conclusiones quedan para el estudiante.
 */
import type { DemoDirector10, DemoStep10 } from './director';
import type { P10Notebook } from '../../../practices/practice-10/notebook';
import { ABALANCE_PAN, BATH_POS } from '../../../practices/practice-10/definition';
import { solveBurette } from '../../../simulation/gas-world/world';
import { sensorStable } from '../../../simulation/gas-world/boyle-rig';

export interface DemoUiHooks10 {
  notebook(open: boolean, tab?: string): void;
  edit(fn: (nb: P10Notebook) => void): void;
}

const fmt = (v: number, d: number) => v.toFixed(d).replace('.', ',');
const last = <T,>(a: T[]) => a[a.length - 1];

/** Lleva un recipiente sobre otro y lo inclina hasta pasar `ml` (o hasta que `stop()` lo diga). */
async function pourInto(d: DemoDirector10, src: string, target: string, stop: () => boolean, dx = -4) {
  const m = d.c.mouthOf(target);
  if (!m || !(await d.grab(src))) return;
  await d.moveTo(m.x + dx, m.y);
  await d.toZ(m.z + 2);
  d.c.primaryDown();
  await d.until(stop, 60);
  d.c.primaryUp();
  await d.wait(0.6);
  await d.release();
}

async function readBalanceStable(d: DemoDirector10) {
  d.dispatch({ type: 'setDoors', open: false });
  d.note(d.hooks.t('p10.demo.ui.waitStable'));
  await d.until(() => d.w.balance.stable, 20);
  d.note(null);
  d.c.readBalance();
  await d.wait(0.6);
  return last(d.w.massReadings);
}

async function weighGlass(d: DemoDirector10) {
  d.dispatch({ type: 'setDoors', open: true });
  await d.carry('watch_glass', ABALANCE_PAN.x, ABALANCE_PAN.y);
  const m = await readBalanceStable(d);
  d.dispatch({ type: 'setDoors', open: true });
  await d.carry('watch_glass', 38, 22);
  return m;
}

export function buildDemoScript10(ui: DemoUiHooks10): DemoStep10[] {
  let mEmpty = 0;
  let mFull = 0;
  let r0 = 50;
  return [
    {
      part: 'A', key: 'inspect', run: async (d) => {
        d.station('A');
        for (const t of ['abalance', 'burette', 'hose', 'syringe']) {
          d.dispatch({ type: 'inspect', target: t });
          await d.wait(0.4);
        }
      },
    },
    {
      part: 'A', key: 'bath', run: async (d) => {
        d.station('D');
        await d.fast(2, () => pourInto(d, 'tap_jug', 'beaker600', () => d.w.liquids.beaker600.ml >= d.w.params.bathWaterMl - 3, -6));
      },
    },
    {
      part: 'A', key: 'burette', run: async (d) => {
        d.dispatch({ type: 'fillBurette', ml: 100 });
        await d.wait(0.6);
        if (!(await d.grab('burette'))) return;
        await d.moveTo(BATH_POS.x + 0.6, BATH_POS.y);
        await d.wait(0.4);
        await d.tapP();
        await d.wait(0.6);
        d.c.clampBurette();
        await d.wait(0.6);
      },
    },
    {
      part: 'A', key: 'aforo', run: async (d) => {
        d.lab.camera?.eyeLevel('burette');
        await d.wait(0.8);
        d.dispatch({ type: 'setStopcock', open: true });
        await d.until(() => {
          const s = solveBurette(d.w);
          return s.readingMl !== null && s.readingMl <= 50.02;
        }, 40);
        d.dispatch({ type: 'setStopcock', open: false });
        await d.wait(1);
        d.c.readVolume('burette');
        r0 = last(d.w.volumeReadings)?.valueMl ?? 50;
        await d.wait(0.6);
      },
    },
    {
      part: 'A', key: 'lines', run: async (d) => {
        d.station('D');
        await d.carry('u_tube', BATH_POS.x - 2, BATH_POS.y);
        d.dispatch({ type: 'connect', id: 'c_hose_u', secured: true });
        d.dispatch({ type: 'connect', id: 'c_stopper', secured: true });
        await d.wait(0.8);
      },
    },
    {
      part: 'A', key: 'weigh', run: async (d) => {
        d.station('A');
        d.lab.camera?.eyeLevel('balance');
        d.dispatch({ type: 'levelBalance' });
        d.dispatch({ type: 'setDoors', open: false });
        await d.until(() => d.w.balance.stable, 10);
        d.c.tare();
        await d.wait(0.5);
        mEmpty = (await weighGlass(d)).displayedG;
        d.station('A');
        // Cargar el bicarbonato fuera de la cabina, en porciones, con la espátula.
        for (let k = 0; k < 8 && d.w.solids.watchGlassG < d.w.params.targetBicarbG - 0.015; k++) {
          d.dispatch({ type: 'scoop', amountG: Math.min(0.15, d.w.params.targetBicarbG - d.w.solids.watchGlassG + 0.01) });
          await d.wait(0.3);
          d.dispatch({ type: 'tapSpatula', targetId: 'watch_glass', fraction: 1 });
          await d.wait(0.3);
        }
        mFull = (await weighGlass(d)).displayedG;
        const dec = d.w.params.balance.resolutionG < 0.001 ? 4 : 3;
        ui.edit((n) => {
          n.t102.glassEmpty.value = fmt(mEmpty, dec);
          n.t102.glassSample.value = fmt(mFull, dec);
        });
      },
    },
    {
      part: 'A', key: 'dissolve', run: async (d) => {
        d.station('B');
        d.dispatch({ type: 'transferSolid', fromId: 'watch_glass', toId: 'beaker150', careful: true });
        d.dispatch({ type: 'rinseInto', sourceId: 'watch_glass', targetId: 'beaker150', ml: 8 });
        await d.wait(0.5);
        await d.fast(2, () => pourInto(d, 'water_bottle', 'beaker150', () => d.w.liquids.beaker150.ml >= 45));
        for (let i = 0; i < 10; i++) {
          d.dispatch({ type: 'swirl', id: 'beaker150', intensity: 0.5 });
          await d.wait(0.25);
        }
      },
    },
    {
      part: 'A', key: 'flask', run: async (d) => {
        const flask = d.pose('flask')!;
        await d.carry('funnel', flask.x, flask.y);
        await pourInto(d, 'beaker150', 'flask', () => d.w.liquids.beaker150.ml < 0.5, -3);
        for (let i = 0; i < 3; i++) {
          d.dispatch({ type: 'rinseInto', sourceId: 'beaker150', targetId: 'flask', ml: 8 });
          await d.wait(0.4);
        }
        d.dispatch({ type: 'rinseInto', sourceId: 'funnel', targetId: 'flask', ml: 3 });
        await d.carry('funnel', 140, 12);
        await d.fast(2, () => pourInto(d, 'water_bottle', 'flask', () => d.w.liquids.flask.ml >= d.w.flask.trueMarkMl - 4, -3));
        // Gota a gota con la piseta y el ojo a la altura de la marca.
        d.lab.camera?.eyeLevel('flask');
        if (await d.grab('wash')) {
          const m = d.c.mouthOf('flask')!;
          await d.moveTo(m.x - 2.5, m.y);
          await d.toZ(m.z - 9);
          for (let k = 0; k < 120 && d.w.liquids.flask.ml < d.w.flask.trueMarkMl - 0.025; k++) {
            d.c.squeeze(d.w.flask.trueMarkMl - d.w.liquids.flask.ml > 1 ? 10 : 1);
            await d.wait(0.12);
          }
          await d.release();
        }
        d.lab.camera?.eyeLevel('flask');
        await d.wait(0.6);
        d.c.readVolume('flask');
        d.dispatch({ type: 'stopperFlask', on: true });
        for (let i = 0; i < 12; i++) {
          d.c.invertFlask();
          await d.wait(0.25);
        }
        d.dispatch({ type: 'stopperFlask', on: false });
      },
    },
    {
      part: 'A', key: 'pipette', run: async (d) => {
        d.station('B');
        d.dispatch({ type: 'attachPropipette', on: true });
        const f = d.pose('flask')!;
        await d.carry('pipette', f.x, f.y);
        d.dispatch({ type: 'conditionPipette' });
        await d.wait(0.5);
        d.dispatch({ type: 'aspirate', ml: d.w.params.pipetteMl + 1 });
        d.lab.camera?.eyeLevel('pipette');
        await d.wait(0.8);
        d.c.adjustPipette();
        await d.wait(0.5);
        const e = d.pose('erlenmeyer')!;
        await d.carry('pipette', e.x, e.y);
        d.dispatch({ type: 'deliverPipette', targetId: 'erlenmeyer', blow: false });
        await d.wait(0.6);
      },
    },
    {
      part: 'A', key: 'vinegar', run: async (d) => {
        d.station('C');
        await pourInto(d, 'vinegar_bottle', 'cylinder', () => d.w.liquids.cylinder.ml >= 9.95, -3);
        d.lab.camera?.eyeLevel('cylinder');
        await d.wait(0.6);
        d.c.readVolume('cylinder');
        ui.edit((n) => {
          n.prep.vinegarMl = fmt(last(d.w.volumeReadings)?.valueMl ?? 10, 1);
        });
      },
    },
    {
      part: 'A', key: 'react', run: async (d) => {
        d.station('C');
        const m = d.c.mouthOf('erlenmeyer')!;
        await d.carry('stopper', m.x, m.y);
        d.dispatch({ type: 'leakTest' });
        await d.wait(0.8);
        d.dispatch({ type: 'insertStopper', on: false });
        d.dispatch({ type: 'addVinegar' });
        await d.wait(0.3);
        d.dispatch({ type: 'insertStopper', on: true });
        await d.simUntil(() => d.w.reactor.stage === 'COMPLETE', 300, 6, () => d.c.swirlNow(0.35));
      },
    },
    {
      part: 'A', key: 'equilibrate', run: async (d) => {
        d.station('D');
        await d.carry('thermometer', BATH_POS.x, BATH_POS.y);
        await d.simUntil(() => d.w.burette.stage === 'READABLE' && Math.abs(d.w.thermometer.displayedC - d.w.bathC) < 0.1, 400, 10);
      },
    },
    {
      part: 'A', key: 'measure', run: async (d) => {
        d.c.readThermometer();
        await d.wait(0.4);
        d.lab.camera?.eyeLevel('burette');
        await d.wait(0.8);
        d.c.readVolume('burette');
        await d.wait(0.4);
        d.c.readBarometer('LOCAL');
        await d.carry('ruler', BATH_POS.x, BATH_POS.y);
        d.lab.camera?.eyeLevel('ruler');
        await d.wait(0.8);
        d.c.measureHeight();
        await d.wait(0.4);
        const w = d.w;
        const vb = [...w.volumeReadings].reverse().find((v) => v.instrument === 'burette');
        ui.edit((n) => {
          n.t103.readingInitial.r1.value = fmt(r0, 2);
          if (vb) n.t103.readingFinal.r1.value = fmt(vb.valueMl, 2);
          n.t103.tC.r1.value = fmt(last(w.tempReadings)?.valueC ?? NaN, 1);
          n.t103.baroMmHg.r1.value = fmt(last(w.baroReadings)?.mmHg ?? NaN, 1);
          n.t103.hMm.r1.value = fmt(last(w.heightReadings)?.valueMm ?? NaN, 0);
        });
        ui.notebook(true, 'r');
        await d.wait(2.5);
        ui.notebook(false);
      },
    },
    {
      part: 'B', key: 'boyleSetup', run: async (d) => {
        d.station('E');
        d.dispatch({ type: 'inspect', target: 'sensor' });
        await d.wait(0.6);
        d.c.setPlunger(10, true);
        await d.wait(1.2);
        d.c.setPlunger(10, false);
        const port = d.pose('sensor')!;
        await d.carry('syringe', port.x - 6.5, port.y - 2);
        d.dispatch({ type: 'startCollection', on: true });
        await d.wait(0.6);
      },
    },
    {
      part: 'B', key: 'boyle', run: async (d) => {
        for (const mark of [5, 7, 9, 11, 13, 15, 17, 19]) {
          const from = d.w.syringe.markMl;
          const steps = 12;
          for (let i = 1; i <= steps; i++) {
            d.c.setPlunger(from + ((mark - from) * i) / steps, true);
            await d.wait(0.08);
          }
          await d.until(() => Math.abs(d.w.syringe.markMl - mark) < 0.03, 3);
          if (Math.abs(d.w.syringe.markMl - mark) >= 0.03) d.c.setPlunger(d.w.syringe.targetMl + (mark - d.w.syringe.markMl), true);
          d.note(d.hooks.t('p10.demo.ui.waitPressure'));
          await d.until(() => sensorStable(d.w), 15);
          d.note(null);
          d.dispatch({ type: 'keepPoint', enteredTotalMl: mark + d.w.sensor.internalVolumeMl });
          await d.wait(0.5);
        }
        d.c.setPlunger(d.w.syringe.markMl, false);
      },
    },
    {
      part: 'B', key: 'notebook', run: async (d) => {
        d.dispatch({ type: 'startCollection', on: false });
        ui.edit((n) => {
          for (const p of d.w.points) n.boyle.push({ pointIndex: p.index, markMl: fmt(p.markMl, 1), deadMl: fmt(d.w.sensor.internalVolumeMl, 1), totalMl: fmt(p.enteredTotalMl, 1), pKPa: fmt(p.displayedKPa, 2), tK: '' });
          n.pressureKind = 'ABSOLUTE';
        });
        ui.notebook(true, 'fit');
        await d.wait(3);
      },
    },
  ];
}
