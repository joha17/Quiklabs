/**
 * Guion de la demostración de la Práctica 7 (§16) — «Una sustancia soluble no siempre conduce». La mano virtual usa
 * los mismos gestos del estudiante (tomar, verter, espátula, agitador, sonda dentro del vaso, puntas sobre la
 * muestra). Muestra un error deliberado no peligroso (sonda sin enjuagar) y su corrección. No marca etapas, no revela
 * incógnitas, no genera nota ni se guarda. Textos en `p7.demo.steps.<clave>` (locales/es/practice7.json).
 */
import type { DemoDirector07, DemoStep07 } from './director';
import type { P07Notebook } from '../../../practices/practice-07/notebook';
import { levelsZ, mouthOf, specimenTop } from '../../../engine/bonding/layout';
import { vesselMl } from '../../../simulation/bonding-world/world';

export interface DemoUiHooks07 {
  notebook(open: boolean, tab?: string): void;
  edit(fn: (nb: P07Notebook) => void): void;
}

/** Destapa un frasco con el gesto de la tapa (clic sobre ella). */
async function uncap(d: DemoDirector07, id: string) {
  if (!d.w.vessels[id]?.capped) return;
  await d.press(id, undefined, 0.4);
  d.dispatch({ type: 'setCap', vesselId: id, capped: false });
  d.endPress();
}

async function capOn(d: DemoDirector07, id: string) {
  if (d.w.vessels[id]?.capped !== false) return;
  await d.press(id, undefined, 0.3);
  d.dispatch({ type: 'setCap', vesselId: id, capped: true });
  d.endPress();
}

/** Vierte de un frasco o vaso sostenido sobre la boca del receptor hasta `ml` (corta antes; el pico sigue goteando). */
async function pourTo(d: DemoDirector07, src: string, target: string, ml: number) {
  await uncap(d, src);
  const m = mouthOf(d.w, target);
  if (!m || !(await d.grab(src))) return;
  await d.moveTo(m.x - 1.5, m.y);
  await d.toZ(m.z + 3);
  d.c.primaryDown();
  await d.until(() => vesselMl(d.w.vessels[target]) >= ml - 4 || vesselMl(d.w.vessels[src]) < 1, 40);
  d.c.primaryUp();
  await d.wait(1);
  await d.release();
}

/** Una cucharada de `jar` a `target` con la espátula (cargar dentro del frasco, descargar dentro del recipiente). */
async function spoon(d: DemoDirector07, jar: string, target: string) {
  await uncap(d, jar);
  const mj = mouthOf(d.w, jar)!;
  if (!(await d.grab('spatula'))) return;
  await d.moveTo(mj.x, mj.y);
  await d.toZ(d.w.objects[jar].pose.z + 1);
  await d.until(() => d.w.objects.spatula.support === jar, 4);
  d.c.primaryDown();
  await d.wait(0.4);
  const mt = mouthOf(d.w, target)!;
  await d.toZ(mt.z + 6);
  await d.moveTo(mt.x, mt.y);
  await d.toZ(levelsZ(d.w, d.w.vessels[target]).floor + 1);
  await d.until(() => d.w.objects.spatula.support === target, 4);
  d.c.primaryDown();
  await d.wait(0.4);
  await d.toZ(mt.z + 6);
  await d.moveTo(176, 12);
  await d.release();
}

/** Agita con la varilla dentro del recipiente y la saca. */
async function stir(d: DemoDirector07, vessel: string, s = 12) {
  const m = mouthOf(d.w, vessel)!;
  if (!(await d.grab('sr1'))) return;
  await d.moveTo(m.x, m.y);
  await d.toZ(levelsZ(d.w, d.w.vessels[vessel]).floor + 0.5);
  await d.until(() => d.w.objects.sr1.support === vessel, 4);
  d.c.primaryDown();
  await d.wait(s);
  d.c.primaryUp();
  await d.toZ(m.z + 8);
  await d.moveTo(152, 12);
  await d.release();
}

/** Sonda dentro del vaso a 2 cm bajo la superficie; espera la lectura estable y lee. */
async function measure(d: DemoDirector07, vessel: string) {
  const m = mouthOf(d.w, vessel)!;
  if (!(await d.grab('probe01'))) return;
  await d.toZ(m.z + 4);
  await d.moveTo(m.x, m.y);
  const lv = levelsZ(d.w, d.w.vessels[vessel]);
  await d.toZ(Math.max(lv.floor + 0.4, lv.surface - 2));
  await d.until(() => d.w.meter.vesselId === vessel, 6);
  d.note(d.hooks.t('p7.demo.ui.waitStable'));
  await d.until(() => d.w.meter.stable, 25);
  d.note(null);
  d.c.readConductivity();
  await d.wait(0.8);
  await d.toZ(m.z + 4);
}

/** Enjuaga la sonda (sostenida) sobre el residuo acuoso. */
async function rinse(d: DemoDirector07) {
  const m = mouthOf(d.w, 'wasteAq')!;
  if (d.c.held?.id !== 'probe01' && !(await d.grab('probe01'))) return;
  await d.toZ(m.z + 4);
  await d.moveTo(m.x, m.y);
  d.c.primaryDown();
  await d.wait(0.6);
}

/** Apoya las dos puntas sobre una muestra y lee el detector cuando el contacto se estabiliza. */
async function touch(d: DemoDirector07, specimen: string) {
  const top = specimenTop(d.w, specimen)!;
  for (const [tip, dx] of [['tipA', -top.halfL * 0.6], ['tipB', top.halfL * 0.6]] as const) {
    if (!(await d.grab(tip))) return;
    await d.moveTo(top.x + dx, top.y);
    await d.toZ(top.z + 0.5);
    await d.release();
  }
  await d.wait(1.4);
  d.c.readDetector();
  await d.wait(0.8);
}

/** Puntas en el panel de control del detector (prueba del circuito). */
async function controlTest(d: DemoDirector07) {
  const det = d.w.objects.det01.pose;
  const pad = { x: det.x + 3.2, y: det.y - 2.2 };
  for (const [tip, dx] of [['tipA', -0.6], ['tipB', 0.6]] as const) {
    if (!(await d.grab(tip))) return;
    await d.moveTo(pad.x + dx, pad.y);
    await d.release();
  }
  await d.wait(1.4);
  d.c.readDetector();
  await d.wait(0.6);
}

export function buildDemoScript07(ui: DemoUiHooks07): DemoStep07[] {
  return [
    {
      part: 'A', key: 'ppe', run: async (d) => {
        d.station('A');
        await d.wait(2);
        d.station('C');
        await d.press('det01', undefined, 0.8);
        d.dispatch({ type: 'inspect', target: 'det01' });
        d.station('D');
        await d.press('cond01', undefined, 0.8);
        d.dispatch({ type: 'inspect', target: 'cond01' });
        d.endPress();
      },
    },
    {
      part: 'A', key: 'hypotheses', run: async (d) => {
        d.station('B');
        await d.press('jarNaCl', undefined, 0.8);
        await d.press('jarSucrose', undefined, 0.8);
        d.endPress();
        ui.notebook(true, 'A');
        await d.wait(0.6);
        // Dos predicciones contrastantes, sin saber aún cuál es cuál (§16.2).
        ui.edit((nb) => {
          Object.assign(nb.tableA[0], { sample: 'jarNaCl', appearance: 'sólido blanco cristalino', conducts: 'unsure', conductsWhy: 'no sé si conduce seco', water: 'homogeneous', evidence: 'conductímetro', savedAtS: d.w.timeS });
          Object.assign(nb.tableA[1], { sample: 'jarSucrose', appearance: 'sólido blanco cristalino', conducts: 'unsure', conductsWhy: 'se parece al otro', water: 'homogeneous', evidence: 'conductímetro', savedAtS: d.w.timeS });
        });
        await d.wait(2.5);
        ui.notebook(false);
      },
    },
    {
      part: 'B', key: 'dissolve', run: async (d) => {
        d.station('D');
        await d.fast(2, () => pourTo(d, 'btWater', 'bk2', 30));
        await d.fast(2, () => pourTo(d, 'btWater', 'bk3', 30));
        for (let i = 0; i < 2; i++) await d.fast(2, () => spoon(d, 'jarNaCl', 'bk2'));
        d.dispatch({ type: 'cleanTool', toolId: 'spatula' });
        for (let i = 0; i < 2; i++) await d.fast(2, () => spoon(d, 'jarSucrose', 'bk3'));
        d.dispatch({ type: 'cleanTool', toolId: 'spatula' });
        await d.fast(2, () => stir(d, 'bk2'));
        await d.fast(2, () => stir(d, 'bk3'));
        await d.wait(3);
        d.c.observe('bk2');
        d.c.observe('bk3');
        await d.wait(1);
      },
    },
    {
      part: 'C', key: 'blank', run: async (d) => {
        await d.fast(2, () => pourTo(d, 'btWater', 'bk1', 30));
        await capOn(d, 'btWater');
        await d.press('cond01', undefined, 0.5);
        d.dispatch({ type: 'powerMeter', on: true });
        d.dispatch({ type: 'setStandard', value: 1413 });
        d.endPress();
        await uncap(d, 'std1413');
        // Calibración con el patrón rotulado, después el blanco (que no es exactamente cero).
        await measure(d, 'std1413');
        d.c.calibrate();
        await d.wait(0.6);
        await capOn(d, 'std1413');
        await rinse(d);
        d.dispatch({ type: 'setMeterRange', range: 'LOW' });
        await measure(d, 'bk1');
        await rinse(d);
      },
    },
    {
      part: 'C', key: 'twoSolutions', run: async (d) => {
        d.dispatch({ type: 'setMeterRange', range: 'HIGH' });
        await measure(d, 'bk2');
        await rinse(d);
        d.dispatch({ type: 'setMeterRange', range: 'LOW' });
        await measure(d, 'bk3');
        await rinse(d);
        await d.release();
      },
    },
    {
      part: 'D', key: 'solids', run: async (d) => {
        d.station('C');
        await d.press('det01', undefined, 0.5);
        d.dispatch({ type: 'powerDetector', on: true });
        d.endPress();
        await controlTest(d);
        await touch(d, 'spGraphite');
        await touch(d, 'spCu');
        await touch(d, 'spNaCl');
        for (const tip of ['tipA', 'tipB']) await d.carry(tip, tip === 'tipA' ? 243 : 261, 47);
      },
    },
    {
      part: 'E', key: 'weakAcid', run: async (d) => {
        d.station('D');
        await d.fast(2, () => pourTo(d, 'btAcetic', 'bk4', 30));
        await capOn(d, 'btAcetic');
        d.dispatch({ type: 'setMeterRange', range: 'MID' });
        await measure(d, 'bk4');
        await rinse(d);
        await d.release();
      },
    },
    {
      part: 'E', key: 'deliberateError', run: async (d) => {
        // Error deliberado y no peligroso (§16.8): de la solución de NaCl al agua nueva SIN enjuagar la sonda.
        d.dispatch({ type: 'setMeterRange', range: 'HIGH' });
        await measure(d, 'bk2');
        await uncap(d, 'btWater');
        await d.release();
        await d.fast(2, () => pourTo(d, 'btWater', 'bk5', 30));
        d.dispatch({ type: 'setMeterRange', range: 'LOW' });
        d.note(d.hooks.t('p7.demo.ui.noRinse'));
        await measure(d, 'bk5');
        d.note(null);
        await rinse(d);
        await rinse(d);
        await d.release();
      },
    },
    {
      part: 'E', key: 'repeat', run: async (d) => {
        // Se repite con agua limpia en otro vaso y la sonda enjuagada: la lectura vuelve al blanco.
        await d.fast(2, () => pourTo(d, 'btWater', 'bk6', 30));
        await capOn(d, 'btWater');
        await measure(d, 'bk6');
        await rinse(d);
        await d.release();
      },
    },
    {
      part: 'F', key: 'matrix', run: async (d) => {
        ui.notebook(true, 'F');
        await d.wait(1);
        ui.edit((nb) => {
          nb.tableF.sucrose.explanation = 'La sacarosa se disolvió, pero κ quedó cerca del blanco: moléculas sin carga.';
          nb.tableF.salt.explanation = 'La sal seca no encendió el detector; disuelta, κ subió mucho: iones móviles.';
          nb.tableF.graphite.explanation = 'El grafito conduce como sólido, pero es una red covalente, no un metal.';
        });
        await d.wait(3);
        ui.notebook(true, 'D');
        await d.wait(2.5);
        ui.notebook(false);
      },
    },
  ];
}
