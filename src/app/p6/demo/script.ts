/**
 * Guion de la demostración de la Práctica 6: la ruta correcta con los mismos gestos que hará el estudiante (Parte A con
 * el hierro). Textos en `p6.demo.steps.<clave>` (locales/es/practice6.json). La libreta se llena solo con lecturas;
 * los cálculos, la identificación del incógnito y la bomba quedan para el estudiante.
 */
import type { DemoDirector6, DemoStep6 } from './director';
import type { Col, P6Notebook } from '../../../practices/practice-06/notebook';
import { balanceTargetG, displayedSlope, displayedValue, metalGAt } from '../../../simulation/calorimetry-world/world';
import { CUP_POS, GEO6, PLATE_POS, PLATE_TOP } from '../../../practices/practice-06/definition';

export interface DemoUiHooks6 {
  notebook(open: boolean, tab?: string): void;
  edit(fn: (nb: P6Notebook) => void): void;
}

const SPOON_DX = 8.4;
const TONGS_TIP = 17;

async function weighOnBalance(d: DemoDirector6) {
  d.lab.camera?.eyeLevel('balance');
  const b = () => d.w.balance;
  await d.press('balance', undefined, 0.4);
  await d.wait(1.2);
  const target = balanceTargetG(d.w);
  const r0 = Math.max(0, Math.min(500, Math.floor(target / 100) * 100));
  if (b().riders[0] !== r0) d.dispatch({ type: 'setRider', beam: 0, valueG: r0 });
  await d.wait(0.4);
  const r1 = Math.max(0, Math.min(90, Math.floor((target - r0) / 10) * 10));
  for (let v = 0; v <= r1; v += 10) {
    d.dispatch({ type: 'setRider', beam: 1, valueG: v });
    await d.wait(0.25);
  }
  const fine = Math.max(0, Math.min(10, target - r0 - r1));
  let v = 0;
  while (v + 0.5 <= fine) {
    v += 0.5;
    d.dispatch({ type: 'setRider', beam: 2, valueG: v });
    await d.wait(0.1);
  }
  d.dispatch({ type: 'setRider', beam: 2, valueG: Math.round(fine * 100) / 100 });
  d.note(d.hooks.t('p6.demo.ui.waitPointer'));
  await d.until(() => b().stable && Math.abs(b().pointer) < 0.06, 25);
  d.note(null);
  d.c.readBalance();
  await d.wait(0.7);
  d.endPress();
  const m = d.w.massReadings[d.w.massReadings.length - 1];
  for (const beam of [0, 1, 2] as const) d.dispatch({ type: 'setRider', beam, valueG: 0 });
  return m;
}

async function weigh(d: DemoDirector6, id: string, back: { x: number; y: number }) {
  const pan = d.c.panPoint();
  await d.fast(2, () => d.carry(id, pan.x, pan.y));
  const m = await weighOnBalance(d);
  await d.fast(2, () => d.carry(id, back.x, back.y));
  return m;
}

function record(ui: DemoUiHooks6, tbl: 't61' | 't62', row: string, col: Col, value: number | undefined, id: string | null, decimals = 1, u = '0,05') {
  if (value === undefined) return;
  ui.edit((nb) => {
    (nb[tbl] as Record<string, Record<Col, { value: string; uncertainty: string; readingId: string | null }>>)[row][col] = { value: value.toFixed(decimals).replace('.', ','), uncertainty: u, readingId: id };
  });
}

export function buildDemoScript6(ui: DemoUiHooks6): DemoStep6[] {
  return [
    {
      part: 'A', key: 'start',
      run: async (d) => {
        d.station('A');
        await d.wait(0.8);
        for (const t of ['balance', 'cylinder', 'tube_fe', 'tube_x', 'therm_cal', 'therm_bath', 'cup']) d.dispatch({ type: 'inspect', target: t });
        await d.press('cylinder', undefined, 1);
        d.endPress();
      },
    },
    {
      part: 'A', key: 'calibrate',
      run: async (d) => {
        for (const beam of [0, 1, 2] as const) d.dispatch({ type: 'setRider', beam, valueG: 0 });
        if (Math.abs(d.w.balance.levelErrorDeg) > 0.05) d.dispatch({ type: 'levelBalance' });
        d.lab.camera?.eyeLevel('balance');
        await d.wait(2.5);
        const b = d.w.balance;
        await d.press('balance', { x: d.pose('balance')!.x - 21, y: d.pose('balance')!.y - 3, z: 3 });
        const err = b.zeroErrorG - b.zeroScrewG + b.levelErrorDeg * 0.06;
        const steps = Math.max(1, Math.round(Math.abs(err) / 0.02));
        for (let i = 0; i < steps; i++) {
          d.dispatch({ type: 'turnZeroScrew', deltaG: err / steps });
          await d.wait(0.15);
        }
        d.note(d.hooks.t('p6.demo.ui.waitPointer'));
        await d.until(() => b.stable && Math.abs(b.pointer) < 0.06, 25);
        d.note(null);
        d.c.readBalance();
        await d.wait(1);
        d.endPress();
      },
    },
    {
      part: 'A', key: 'water',
      run: async (d) => {
        const empty = await weigh(d, 'cylinder', { x: 130, y: 24 });
        record(ui, 't61', 'cylEmpty', 'fe', empty?.displayedMassG, empty?.id ?? null);
        d.station('A');
        // Llenar con la botella (vertido inclinado) y enrasar con la piseta.
        if (await d.grab('water_bottle')) {
          await d.toZ(24);
          await d.moveTo(130 - 7, 24);
          d.c.primaryDown();
          await d.until(() => d.w.vessels.cylinder.waterG > 47 || d.w.vessels.water_bottle.waterG < 5, 25);
          d.c.primaryUp();
          await d.wait(1.2);
          await d.moveTo(150, 52);
          await d.release();
        }
        if (await d.grab('wash')) {
          await d.toZ(9);
          await d.moveTo(130 - 2.5, 24);
          for (let i = 0; i < 80 && d.w.vessels.cylinder.waterG / 0.9978 < 49.96; i++) {
            d.c.squeeze(1);
            await d.wait(0.12);
          }
          await d.moveTo(160, 22);
          await d.release();
        }
        d.lab.camera?.eyeLevel('cylinder');
        await d.wait(1.5);
        const r = d.c.readCylinder();
        if (r.value !== undefined) ui.edit((nb) => { nb.volume.fe = r.value!.toFixed(1).replace('.', ','); });
        const full = await weigh(d, 'cylinder', { x: 130, y: 24 });
        record(ui, 't61', 'cylWater', 'fe', full?.displayedMassG, full?.id ?? null);
      },
    },
    {
      part: 'B', key: 'cup',
      run: async (d) => {
        d.station('B');
        if (d.w.cal.lidClosed) d.c.toggleLid();
        if (await d.grab('cylinder')) {
          await d.toZ(14);
          await d.moveTo(CUP_POS.x - 4, CUP_POS.y);
          d.c.primaryDown();
          await d.until(() => d.w.vessels.cylinder.waterG < 0.3, 25);
          d.c.primaryUp();
          await d.wait(1.5);
          await d.moveTo(130, 24);
          await d.release();
        }
        await d.carry('therm_cal', CUP_POS.x, CUP_POS.y);
        await d.carry('stirrer', CUP_POS.x, CUP_POS.y);
        d.c.toggleLid();
        await d.wait(1);
      },
    },
    {
      part: 'B', key: 'metal',
      run: async (d) => {
        const empty = await weigh(d, 'tube_fe', { x: 30, y: 38 });
        record(ui, 't62', 'tubeEmpty', 'fe', empty?.displayedMassG, empty?.id ?? null);
        d.station('A');
        if (await d.grab('spatula')) {
          await d.toZ(14);
          for (let i = 0; i < 14 && metalGAt(d.w, 'tube:tube_fe') < 23.8; i++) {
            const jar = d.pose('jar_fe')!;
            await d.moveTo(jar.x - SPOON_DX, jar.y);
            await d.until(() => d.c.held?.magnet?.mode === 'PICK', 2);
            await d.tapP();
            const tb = d.pose('tube_fe')!;
            await d.moveTo(tb.x - SPOON_DX, tb.y);
            await d.until(() => d.c.held?.magnet?.mode === 'DROP', 2);
            await d.tapP();
          }
          await d.moveTo(50, 16);
          await d.release();
        }
        const full = await weigh(d, 'tube_fe', { x: 30, y: 38 });
        record(ui, 't62', 'tubeMetal', 'fe', full?.displayedMassG, full?.id ?? null);
      },
    },
    {
      part: 'C', key: 'bath',
      run: async (d) => {
        d.station('C');
        await d.carry('beaker', PLATE_POS.x, PLATE_POS.y);
        if (await d.grab('water_bottle')) {
          await d.toZ(26);
          await d.moveTo(PLATE_POS.x - 9, PLATE_POS.y);
          d.c.primaryDown();
          await d.until(() => d.w.vessels.beaker.waterG > 320, 40);
          d.c.primaryUp();
          await d.wait(1.5);
          await d.moveTo(150, 52);
          await d.release();
        }
        await d.carry('therm_bath', PLATE_POS.x, PLATE_POS.y);
        if (await d.grab('tube_fe')) {
          await d.toZ(PLATE_TOP + GEO6.beaker.floor + 0.8 + 6);
          await d.moveTo(PLATE_POS.x, PLATE_POS.y);
          await d.toZ(PLATE_TOP + GEO6.beaker.floor + 0.8);
          await d.release();
        }
        await d.press('hotplate', { x: PLATE_POS.x - 3, y: PLATE_POS.y - 11, z: 4 });
        d.c.setKnob(0.6);
        await d.wait(0.8);
        d.endPress();
      },
    },
    {
      part: 'C', key: 'heat',
      run: async (d) => {
        d.dispatch({ type: 'stopwatch', action: 'RESET' });
        await d.simUntil(() => d.w.vessels.beaker.waterC > d.w.bath.boilingC - 0.3, 900, 30, () => d.dispatch({ type: 'readThermometer', id: 'therm_bath' }));
        d.c.setKnob(0.3);
        d.dispatch({ type: 'stopwatch', action: 'START' });
        const t0 = d.w.timeS;
        await d.simUntil(() => d.w.timeS - t0 >= 610, 610, 30, () => d.dispatch({ type: 'readThermometer', id: 'therm_bath' }));
        d.dispatch({ type: 'stopwatch', action: 'STOP' });
      },
    },
    {
      part: 'D', key: 'transfer',
      run: async (d) => {
        d.station('B');
        await d.wait(0.5);
        const ti = d.c.readThermometer('therm_cal', false);
        record(ui, 't61', 'tiWater', 'fe', ti.ok ? displayedValue(d.w, 'therm_cal') : undefined, d.w.tempReadings[d.w.tempReadings.length - 1]?.id ?? null, 1, '0,1');
        d.station('C');
        const tb = d.c.readThermometer('therm_bath', false);
        record(ui, 't62', 'tiMetal', 'fe', tb.ok ? displayedValue(d.w, 'therm_bath') : undefined, d.w.tempReadings[d.w.tempReadings.length - 1]?.id ?? null, 1, '0,1');
        d.c.setKnob(0);
        // Pinza para tubo: sujetar por el tercio superior, llevar al vaso, abrir, verter, cerrar.
        if (await d.grab('tongs')) {
          const t = d.pose('tube_fe')!;
          const gz = t.z + GEO6.tube.length * 0.75;
          await d.toZ(gz + 5);
          await d.moveTo(t.x - TONGS_TIP, t.y);
          await d.toZ(gz - 0.5);
          await d.until(() => d.c.clampReady, 3);
          await d.tapP();
          await d.toZ(GEO6.cup.h + 1.2 + GEO6.tube.length * 0.75 + 3);
          d.station('B');
          await d.fast(1.5, () => d.moveTo(CUP_POS.x - TONGS_TIP, CUP_POS.y));
          d.c.toggleLid();
          await d.tapP();
          await d.wait(0.4);
          d.c.toggleLid();
          await d.moveTo(30 - TONGS_TIP, 38);
          await d.toZ(GEO6.tube.length * 0.75 + 1);
          await d.tapP();
          await d.toZ(16);
          await d.moveTo(268 - TONGS_TIP, 12);
          await d.release();
        }
      },
    },
    {
      part: 'D', key: 'peak',
      run: async (d) => {
        d.station('B');
        const t0 = d.w.timeS;
        await d.until(() => {
          if (Math.round((d.w.timeS - t0) * 4) % 2 === 0) d.c.stir(0.6);
          return d.w.timeS - t0 > 25 && displayedSlope(d.w, 'cal', 8) <= 0.002;
        }, 240);
        d.c.readThermometer('therm_cal', true);
        record(ui, 't61', 'tf', 'fe', displayedValue(d.w, 'therm_cal'), d.w.tempReadings[d.w.tempReadings.length - 1]?.id ?? null, 1, '0,1');
        record(ui, 't62', 'tfMetal', 'fe', displayedValue(d.w, 'therm_cal'), null, 1, '0,1');
        ui.notebook(true, 'graphs');
        await d.wait(3);
      },
    },
    {
      part: 'E', key: 'end',
      run: async (d) => {
        ui.notebook(true, 'water');
        await d.wait(3);
        ui.notebook(false);
        d.station('A');
        await d.wait(2);
      },
    },
  ];
}
