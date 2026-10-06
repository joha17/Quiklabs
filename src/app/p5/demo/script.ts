/**
 * Guion de la demostración de la Práctica 5: la ruta correcta completa, paso a paso, con los mismos gestos que hará
 * el estudiante. Textos en `p5.demo.steps.<clave>` (locales/es/practice5.json). La libreta se llena solo con las
 * lecturas de la balanza; los cálculos, la ecuación y el análisis quedan para el estudiante.
 */
import type { DemoDirector5, DemoStep5 } from './director';
import type { P5Notebook, Table1Row } from '../../../practices/practice-05/notebook';
import { balanceTargetG, isLit, tubeAxis, tubeTempC } from '../../../simulation/stoich-world/world';
import { MOLAR_MASS } from '../../../simulation/stoichiometry/stoich';
import { CLAMP_ARM, TUBE5 } from '../../../practices/practice-05/definition';

export interface DemoUiHooks5 {
  notebook(open: boolean, tab?: string): void;
  edit(fn: (nb: P5Notebook) => void): void;
}

const SPOON_DX = 8.4;
const TONGS_TIP = 17;

/** Equilibra con las pesas como un estudiante (100 g, 10 g y la pesa fina), espera el fiel y lee. */
async function weighOnBalance(d: DemoDirector5) {
  d.lab.camera?.eyeLevel();
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
    await d.wait(0.3);
  }
  // Pesa fina: primero de 0,5 en 0,5 g y luego de 0,05 en 0,05 g hasta centrar el fiel.
  const fine = Math.max(0, Math.min(10, target - r0 - r1));
  let v = 0;
  while (v + 0.5 <= fine) {
    v += 0.5;
    d.dispatch({ type: 'setRider', beam: 2, valueG: v });
    await d.wait(0.12);
  }
  const goal = Math.round(fine / 0.05) * 0.05;
  while (v + 0.025 < goal) {
    v += 0.05;
    d.dispatch({ type: 'setRider', beam: 2, valueG: v });
    await d.wait(0.12);
  }
  d.dispatch({ type: 'setRider', beam: 2, valueG: goal });
  d.note(d.hooks.t('p5.demo.ui.waitPointer'));
  await d.until(() => b().stable && Math.abs(b().pointer) < 0.06, 25);
  d.note(null);
  d.c.readBalance();
  await d.wait(0.8);
  d.endPress();
  return d.w.measurements[d.w.measurements.length - 1];
}

/** Lleva el tubo (frío) de la gradilla al platillo, pesa y lo regresa. */
async function weighTube(d: DemoDirector5) {
  const pan = d.c.panPoint();
  await d.fast(2, () => d.carry('tube', pan.x, pan.y));
  const m = await weighOnBalance(d);
  const rack = d.lab.runtime.ctx.geo.rack;
  await d.fast(2, () => d.carry('tube', rack.x, rack.y));
  for (const beam of [0, 1, 2] as const) d.dispatch({ type: 'setRider', beam, valueG: 0 });
  return m;
}

/** Toma porciones con la espátula dedicada y las vuelca en el tubo (que está en la gradilla) hasta ≈ `g`. */
async function addSolid(d: DemoDirector5, species: 'KClO3' | 'MnO2', g: number) {
  const spat = species === 'KClO3' ? 'spatula_kclo3' : 'spatula_mno2';
  const bottle = species === 'KClO3' ? 'bottle_kclo3' : 'bottle_mno2';
  d.look(d.pose(bottle)!.x + 30, 40, 10, 95, 0.5);
  await d.press(bottle, { ...d.pose(bottle)!, z: 12.5 });
  d.c.toggleBottle(bottle);
  await d.wait(0.6);
  d.endPress();
  if (!(await d.grab(spat))) return;
  await d.toZ(16);
  const inTube = () => d.w.tube.contents[species] * MOLAR_MASS[species];
  for (let i = 0; i < 8 && inTube() < g * 0.95; i++) {
    const left = g - inTube();
    d.c.scoopAmount = species === 'MnO2' ? 'tip' : left > 0.6 ? 'level' : left > 0.3 ? 'small' : 'tip';
    const bp = d.pose(bottle)!;
    await d.moveTo(bp.x - SPOON_DX, bp.y);
    await d.until(() => d.c.held?.magnet?.mode === 'SCOOP', 2);
    await d.tapP();
    await d.wait(0.3);
    const m = d.c.tubeMouth();
    await d.moveTo(m.x - SPOON_DX, m.y);
    await d.until(() => d.c.held?.magnet?.mode === 'TIP', 2);
    await d.tapP();
    await d.wait(0.4);
  }
  await d.moveTo(d.pose(spat)!.x, 16);
  await d.release();
  await d.press(bottle, { ...d.pose(bottle)!, z: 12.5 });
  d.c.toggleBottle(bottle);
  await d.wait(0.4);
  d.endPress();
}

/** Mechero bajo la muestra, inspección, ventilación, encendido con la técnica de la Práctica 3 y llama suave. */
async function lightBurner(d: DemoDirector5, gentle = true) {
  const ax = tubeAxis(d.w, d.lab.runtime.ctx);
  await d.carry('burner', ax.sample.x, ax.sample.y);
  if (!d.w.gas.burner.hoseConnected) d.dispatch({ type: 'gas', cmd: { type: 'connectHose', connected: true } });
  if (!d.w.gas.room.extractionOn) d.dispatch({ type: 'gas', cmd: { type: 'setExtraction', on: true } });
  for (const t of ['hose', 'burner', 'extinguisher', 'blanket', 'estop']) d.dispatch({ type: 'inspect', target: t });
  d.look(ax.sample.x, ax.sample.y, 14, 70, 0.25);
  await d.turnValve('AIR', 0, 0.4);
  await d.turnValve('TABLE', 1, 0.8);
  if (!(await d.grab('lighter'))) return;
  const m = d.mouth;
  await d.moveTo(m.x + 1, m.y - 2);
  d.c.primaryDown();
  await d.turnValve('NEEDLE', 0.3, 0.9);
  await d.until(() => isLit(d.w.gas), 3);
  d.c.primaryUp();
  await d.moveTo(396, 12);
  await d.release();
  await d.turnValve('AIR', gentle ? 0.35 : 0.6, 1);
  if (!gentle) await d.turnValve('NEEDLE', 0.5, 0.6);
}

async function burnerOff(d: DemoDirector5) {
  await d.turnValve('AIR', 0, 0.4);
  await d.turnValve('NEEDLE', 0, 0.5);
  await d.turnValve('TABLE', 0, 0.4);
  d.c.burnerAway();
}

/** Calienta `seconds` (tiempo de simulación acelerado) moviendo la llama a lo largo del tubo. */
async function heat(d: DemoDirector5, seconds: number, gentleS: number) {
  const start = d.w.timeS;
  d.dispatch({ type: 'stopwatch', action: 'RESET' });
  d.dispatch({ type: 'stopwatch', action: 'START' });
  let k = 0;
  let normal = false;
  await d.simUntil(() => d.w.timeS - start >= seconds, seconds, 30, () => {
    if (!normal && d.w.timeS - start >= gentleS) {
      normal = true;
      d.c.setValve('AIR', 0.6);
      d.c.setValve('NEEDLE', 0.5);
    }
    d.c.burnerUnderSample();
    d.c.sweepBurner(k++ % 2 ? 0.4 : -0.4);
  });
  d.dispatch({ type: 'stopwatch', action: 'STOP' });
}

/** Retira la llama, deja enfriar en la pinza y pasa el tubo a la gradilla con la pinza para tubo. */
async function cool(d: DemoDirector5) {
  await burnerOff(d);
  await d.simUntil(() => tubeTempC(d.w.tube) < 120, 150, 30);
  if (!(await d.grab('tongs'))) return;
  const ax = tubeAxis(d.w, d.lab.runtime.ctx);
  const gx = ax.bottom.x + ax.dir.x * TUBE5.length * 0.7;
  const gy = ax.bottom.y + ax.dir.y * TUBE5.length * 0.7;
  const gz = ax.bottom.z + ax.dir.z * TUBE5.length * 0.7;
  await d.toZ(gz + 4);
  await d.moveTo(gx - TONGS_TIP, gy);
  await d.toZ(gz - 0.5);
  await d.until(() => d.c.clampReady, 3);
  await d.tapP();
  await d.toZ(gz + 6);
  const rack = d.lab.runtime.ctx.geo.rack;
  await d.moveTo(rack.x - TONGS_TIP, rack.y);
  await d.toZ(TUBE5.length * 0.7 + 1);
  await d.tapP();
  await d.wait(0.3);
  await d.toZ(16);
  await d.moveTo(256 - TONGS_TIP, 16);
  await d.release();
  let n = 0;
  await d.simUntil(() => tubeTempC(d.w.tube) <= d.w.params.ambientC + 2, 1500, 40, () => {
    if (n++ % 4 === 0) d.c.measureIR();
  });
  d.c.measureIR();
  await d.wait(0.6);
}

/** Monta el tubo en la pinza del soporte (nuez apretada, 20°, boca hacia el fondo) con la pantalla. */
async function mount(d: DemoDirector5) {
  d.station('D');
  await d.press('stand', { ...d.pose('stand')!, z: d.w.clamp.heightCm });
  d.dispatch({ type: 'setClamp', nutTight: true, grip: 0.5, angleDeg: 20, mouthYawDeg: 0, heightCm: 23, gripAt: 0.66 });
  await d.wait(0.8);
  d.endPress();
  const s = d.lab.runtime.ctx.geo.stand;
  if (!(await d.grab('tube'))) return;
  await d.toZ(16);
  await d.moveTo(s.x, s.y - CLAMP_ARM);
  await d.release();
  if (!d.w.safety.shieldPlaced) d.c.placeShield(true);
  await d.wait(0.6);
}

function record(ui: DemoUiHooks5, row: Table1Row, m: { id: string; displayedMassG: number; loadTemperatureC: number } | undefined) {
  if (!m) return;
  ui.edit((nb) => {
    nb.table1[row] = { value: m.displayedMassG.toFixed(1).replace('.', ','), uncertainty: '0,05', observations: `${Math.round(m.loadTemperatureC)} °C`, measurementId: m.id };
  });
}

export function buildDemoScript5(ui: DemoUiHooks5): DemoStep5[] {
  return [
    // ───────────── A. Seguridad y calibración ─────────────
    {
      part: 'A', key: 'start',
      run: async (d) => {
        d.station('C');
        await d.wait(0.8);
        await d.press('tube', { ...d.pose('tube')!, z: 12 });
        d.dispatch({ type: 'inspect', target: 'tube' });
        await d.wait(1);
        for (const t of ['spatula_kclo3', 'spatula_mno2', 'balance']) d.dispatch({ type: 'inspect', target: t });
        d.endPress();
      },
    },
    {
      part: 'A', key: 'calibrate',
      run: async (d) => {
        d.station('A');
        await d.wait(1);
        for (const beam of [0, 1, 2] as const) d.dispatch({ type: 'setRider', beam, valueG: 0 });
        if (Math.abs(d.w.balance.levelErrorDeg) > 0.05) {
          await d.press('balance', { ...d.pose('balance')!, x: d.pose('balance')!.x - 10, z: 3 });
          d.dispatch({ type: 'levelBalance' });
          await d.wait(0.6);
        }
        d.lab.camera?.eyeLevel();
        await d.wait(2.5);
        // Tornillo de cero: se gira poco a poco hasta que el fiel quede en la marca.
        const b = d.w.balance;
        await d.press('balance', { x: d.pose('balance')!.x - 21, y: d.pose('balance')!.y - 3, z: 3 });
        const err = b.zeroErrorG - b.zeroScrewG + b.levelErrorDeg * 0.06;
        const steps = Math.max(1, Math.round(Math.abs(err) / 0.02));
        for (let i = 0; i < steps; i++) {
          d.dispatch({ type: 'turnZeroScrew', deltaG: err / steps });
          await d.wait(0.15);
        }
        d.note(d.hooks.t('p5.demo.ui.waitPointer'));
        await d.until(() => b.stable && Math.abs(b.pointer) < 0.06, 25);
        d.note(null);
        d.c.readBalance();
        await d.wait(1);
        d.endPress();
      },
    },
    // ───────────── B. Pesadas por diferencia y mezcla ─────────────
    {
      part: 'B', key: 'weighEmpty',
      run: async (d) => {
        d.station('C');
        await d.wait(0.6);
        record(ui, 'tubeEmpty', await weighTube(d));
      },
    },
    {
      part: 'B', key: 'addMnO2',
      run: async (d) => {
        await addSolid(d, 'MnO2', 0.1);
        record(ui, 'tubeMnO2', await weighTube(d));
      },
    },
    {
      part: 'B', key: 'addKClO3',
      run: async (d) => {
        await addSolid(d, 'KClO3', 1.5);
        record(ui, 'tubeMnO2KClO3', await weighTube(d));
      },
    },
    {
      part: 'B', key: 'mix',
      run: async (d) => {
        d.station('B');
        if (!(await d.grab('tube'))) return;
        await d.moveTo(205, 26);
        const t0 = d.w.timeS;
        let k = 0;
        // Golpecitos laterales suaves: el polvo negro y el blanco se vuelven un gris uniforme.
        while (d.w.tube.homogeneity < 0.85 && d.w.timeS - t0 < 12) {
          const h = d.c.held;
          if (h) h.x = 205 + (k++ % 2 ? 1.6 : -1.6);
          await d.wait(0.11);
        }
        await d.wait(0.4);
        await d.release();
      },
    },
    // ───────────── C. Montaje y primer calentamiento ─────────────
    {
      part: 'C', key: 'assemble',
      run: async (d) => {
        await mount(d);
      },
    },
    {
      part: 'C', key: 'ignite',
      run: async (d) => {
        await lightBurner(d, true);
      },
    },
    {
      part: 'C', key: 'heat1',
      run: async (d) => {
        d.look(d.pose('stand')!.x, 30, 18, 60, 0.2);
        await heat(d, d.w.params.firstCycleS + 20, 300);
      },
    },
    // ───────────── D. Enfriamiento, pesada y masa constante ─────────────
    {
      part: 'D', key: 'cool1',
      run: async (d) => {
        await cool(d);
      },
    },
    {
      part: 'D', key: 'weigh1',
      run: async (d) => {
        record(ui, 'heat1', await weighTube(d));
      },
    },
    {
      part: 'D', key: 'heat2',
      run: async (d) => {
        await mount(d);
        await lightBurner(d, true);
        await heat(d, 300, 60);
        await cool(d);
      },
    },
    {
      part: 'D', key: 'weigh2',
      run: async (d) => {
        const m = await weighTube(d);
        record(ui, 'heat2', m);
        if (d.w.evidence.constantMass) record(ui, 'constant', m);
        ui.notebook(true, 'chart');
        await d.wait(3);
      },
    },
    // ───────────── E. Libreta, residuos y cierre ─────────────
    {
      part: 'E', key: 'notebook',
      run: async (d) => {
        ui.notebook(true, 'masses');
        await d.wait(4);
        ui.notebook(false);
      },
    },
    {
      part: 'E', key: 'dispose',
      run: async (d) => {
        d.station('E');
        if (!(await d.grab('tube'))) return;
        const wst = d.pose('waste')!;
        await d.toZ(16);
        await d.moveTo(wst.x, wst.y);
        await d.tapP();
        await d.wait(0.6);
        const rack = d.lab.runtime.ctx.geo.rack;
        await d.fast(2, () => d.moveTo(rack.x, rack.y));
        await d.release();
      },
    },
    {
      part: 'E', key: 'end',
      run: async (d) => {
        d.station('A');
        await d.wait(2.5);
      },
    },
  ];
}
