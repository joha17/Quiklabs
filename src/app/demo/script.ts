/**
 * Guion de la demostración de la Práctica 2: la ruta correcta completa, paso a paso, con los mismos gestos que
 * hará el estudiante. Los textos de cada paso están en `demo.steps.<clave>` (locales/es).
 */
import type { DemoDirector, DemoStep } from './director';
import type { NotebookState, RowKey } from '../../practices/practice-02/notebook';
import { balanceReading, pourableSolidsG } from '../../simulation/world/world';
import { particulateMassG } from '../../simulation/solutions/mixture';
import { mouthOf, zoneById } from '../../engine/physics/supports';
import { partBResults } from '../../practices/practice-02/results';
import { tubeLabels } from '../../practices/practice-02/definition';

const TUBES = ['t1', 't2', 't3', 't4', 't5', 't6'];
const JARS = ['jar_zn', 'jar_graphite', 'jar_s', 'jar_nacl', 'jar_sucrose'];
const SAMPLE_G = 2.5;

export interface NotebookHooks {
  open(on: boolean, tab?: 't21' | 't22'): void;
  edit(fn: (nb: NotebookState) => void): void;
}

const fmt = (n: number, d = 2) => n.toFixed(d).replace('.', ',');

/** Pone y saca una muestra con la espátula: carga del frasco, deposita en el destino. */
async function spoon(d: DemoDirector, jar: string, target: string) {
  const load = () => particulateMassG(d.vessel('spatula').mix);
  const jm = mouthOf(d.vessel(jar));
  await d.moveTipTo(jm.x, jm.y);
  if (!(await d.until(() => load() > 0.02 && !d.c.busy('spatula'), 5))) {
    d.dispatch({ type: 'scoop', toolId: 'spatula', sourceId: jar });
  }
  const tm = mouthOf(d.vessel(target));
  await d.moveTipTo(tm.x, tm.y);
  if (!(await d.until(() => load() < 0.01 && !d.c.busy('spatula'), 5))) {
    d.dispatch({ type: 'tapTool', toolId: 'spatula', targetId: target });
  }
}

/** Si algo salpicó la mesada, se seca llevando el papel absorbente al derrame (como haría el estudiante). */
async function tidySpill(d: DemoDirector) {
  if (d.w.bench.spillMl <= 0.05) return;
  d.note(d.hooks.t('demo.ui.spill'));
  const sp = d.c.spillPos;
  d.look(sp.x, sp.y, 50);
  await d.carry('towel', sp.x, sp.y);
  if (!(await d.until(() => d.w.bench.spillMl <= 0.05, 4))) d.dispatch({ type: 'cleanSpill' });
  await d.wait(1);
  d.note(null);
}

/** Limpia la espátula pasándola por el papel absorbente (se limpia sola al llegar). */
async function cleanSpatula(d: DemoDirector) {
  const towel = d.vessel('towel');
  await d.moveTipTo(towel.pose.x, towel.pose.y);
  const clean = () => !d.vessel('spatula').lastLoaded && particulateMassG(d.vessel('spatula').mix) < 0.0005;
  if (!(await d.until(() => clean() && !d.c.busy('spatula'), 4))) {
    d.c.cleanTool('spatula');
    await d.until(() => clean() && !d.c.busy('spatula'), 3);
  }
}

export function buildDemoScript(nb: NotebookHooks): DemoStep[] {
  return [
    // ════════════════ PARTE A ════════════════
    {
      part: 'A',
      key: 'ppe',
      run: async (d) => {
        d.lab.goToStation('A');
        await d.wait(5);
      },
    },
    {
      part: 'A',
      key: 'rack',
      run: async (d) => {
        d.look(30, 34, 50);
        for (let i = 0; i < 6; i++) {
          const go = () => d.placeIn(TUBES[i], `rack:${i}`);
          if (i < 2) await go();
          else await d.fast(3, go);
          if (i === 1) d.note(d.hooks.t('demo.ui.repeat'));
        }
      },
    },
    {
      part: 'A',
      key: 'label',
      run: async (d) => {
        const labels = tubeLabels(d.w.params.oilProfile);
        d.look(30, 26, 34);
        for (let i = 0; i < 6; i++) {
          await d.press(TUBES[i], i < 2 ? 0.8 : 0.35);
          d.c.labelPop(TUBES[i], labels[i]);
          await d.wait(i < 2 ? 1.0 : 0.5);
        }
        d.endPress();
      },
    },
    {
      part: 'A',
      key: 'samples',
      run: async (d) => {
        d.look(62, 36, 80);
        await d.grab('spatula');
        for (let i = 0; i < JARS.length; i++) {
          const go = async () => {
            await spoon(d, JARS[i], TUBES[i]);
            await cleanSpatula(d);
          };
          if (i < 2) await go();
          else await d.fast(2.5, go);
          if (i === 0) d.note(d.hooks.t('demo.ui.cleanSpatula'));
        }
        await d.moveTo(62, 14);
        await d.release();
      },
    },
    {
      part: 'A',
      key: 'oil',
      run: async (d) => {
        d.look(70, 34, 62);
        await d.grab('dropper');
        const bm = mouthOf(d.vessel('bottle_oil'));
        await d.moveTo(bm.x, bm.y);
        if (!(await d.until(() => d.lv('dropper') > 0.5 && !d.c.busy('dropper'), 6))) {
          d.dispatch({ type: 'aspirate', toolId: 'dropper', sourceId: 'bottle_oil', ml: 1 });
        }
        const tm = mouthOf(d.vessel('t6'));
        await d.moveTo(tm.x, tm.y);
        await d.until(() => d.c.alignedTarget('dropper') === 't6', 4);
        d.look(tm.x, tm.y, 30);
        for (let i = 0; i < 10; i++) {
          d.c.dropFrom('dropper');
          await d.wait(0.15);
          await d.until(() => !d.c.busy('dropper'), 3);
          if (i === 2) d.note(d.hooks.t('demo.ui.drops'));
        }
        await d.moveTo(72, 14);
        await d.release();
      },
    },
    {
      part: 'A',
      key: 'water',
      run: async (d) => {
        const cylHome = { x: 120, y: 26 };
        for (let i = 0; i < 6; i++) {
          const tube = TUBES[i];
          const go = async () => {
            d.lookAtObj('cyl', 40);
            await d.squeeze('cyl', 2.0, () => d.lv('cyl'));
            if (i === 0) {
              // Lectura del menisco a la altura de los ojos (sin paralaje).
              await d.release();
              await d.press('cyl', 0.3);
              d.lab.setLevelView(true);
              d.note(d.hooks.t('demo.ui.eyeLevel'));
              await d.wait(3);
              d.lab.setLevelView(false);
              d.note(null);
              d.endPress();
            }
            await d.carry('piseta', 130, 50);
            d.look(30, 26, 50);
            if (await d.dockFor('cyl', tube, { x: 0, y: -1 })) {
              await d.pour('cyl', () => d.lv('cyl') < 0.01, { timeoutS: 30 });
            } else {
              d.dispatch({ type: 'setPose', id: 'cyl', pose: { ...d.vessel('cyl').pose, rotationRad: 0 } });
            }
            await d.moveTo(cylHome.x, cylHome.y);
            await d.release();
          };
          if (i < 1) await go();
          else await d.fast(i < 2 ? 1.5 : 4, go);
          if (i === 0) d.note(d.hooks.t('demo.ui.repeat'));
        }
      },
    },
    {
      part: 'A',
      key: 'shake',
      run: async (d) => {
        d.look(30, 26, 36);
        for (let i = 0; i < 6; i++) {
          const go = () => d.agitate(TUBES[i], 3.5, 'SHAKE');
          if (i < 2) await go();
          else await d.fast(3, go);
        }
        await d.simUntil(() => false, 40, 10);
      },
    },
    {
      part: 'A',
      key: 'observe',
      run: async (d) => {
        d.look(30, 26, 32);
        await d.wait(3);
        // Se abanica cada tubo (la libreta pide haberlo hecho antes de anotar el olor). El aceite, primero.
        for (const [i, id] of ['t6', 't1', 't2', 't3', 't4', 't5'].entries()) {
          const go = async () => {
            await d.press(id, 0.5);
            d.c.fan(id);
            await d.wait(2.6);
          };
          if (i < 2) await go();
          else await d.fast(3, go);
          if (i === 1) d.note(d.hooks.t('demo.ui.repeat'));
        }
        d.endPress();
      },
    },
    {
      part: 'A',
      key: 'notebookA',
      run: async (d) => {
        nb.open(true, 't21');
        const veg = d.w.params.oilProfile === 'OIL_VEG';
        const rows: Array<[RowKey, string, string, string, string, string]> = [
          ['Zn', 'SOLID', 'gris_plateado', 'inodoro', 'insoluble', d.hooks.t('demo.obs.zn')],
          ['C', 'SOLID', 'negro', 'inodoro', 'insoluble', d.hooks.t('demo.obs.c')],
          ['S', 'SOLID', 'amarillo', 'inodoro', 'insoluble', d.hooks.t('demo.obs.s')],
          ['NaCl', 'SOLID', 'blanco', 'inodoro', 'soluble', d.hooks.t('demo.obs.nacl')],
          ['sacarosa', 'SOLID', 'blanco', 'inodoro', 'soluble', d.hooks.t('demo.obs.sucrose')],
          ['aceite', 'LIQUID', veg ? 'amarillo_palido' : 'incoloro', veg ? 'tenue' : 'casi_inodoro', 'inmiscible', d.hooks.t('demo.obs.oil')],
        ];
        for (const [row, state, color, odor, solubility, evidence] of rows) {
          for (const [field, value] of [['state', state], ['color', color], ['odor', odor], ['solubility', solubility], ['evidence', evidence]] as const) {
            nb.edit((n) => {
              n.table21[row][field] = value;
              n.table21[row].updatedAt = d.w.timeS;
            });
            await d.wait(0.25);
          }
        }
        d.note(d.hooks.t('demo.ui.formulaYours'));
        await d.wait(5);
        nb.open(false);
      },
    },

    // ════════════════ PARTE B ════════════════
    {
      part: 'B',
      key: 'weigh',
      run: async (d) => {
        d.lookAtObj('balance', 45);
        await d.placeIn('weigh_paper', 'balance');
        await d.press('balance', 0.6);
        d.c.tare();
        await d.wait(1.2);
        d.endPress();
        await d.grab('spatula');
        const reading = () => balanceReading(d.w) ?? 0;
        const load = () => particulateMassG(d.vessel('spatula').mix);
        let n = 0;
        while (reading() < SAMPLE_G - 0.05 && n++ < 60) {
          const go = async () => {
            const jm = mouthOf(d.vessel('jar_mix'));
            await d.moveTipTo(jm.x, jm.y);
            if (!(await d.until(() => load() > 0.02 && !d.c.busy('spatula'), 5))) d.dispatch({ type: 'scoop', toolId: 'spatula', sourceId: 'jar_mix' });
            // Si esta carga haría pasar de 2,55 g, se devuelve al frasco y se toma otra.
            if (reading() + load() > SAMPLE_G + 0.05) {
              d.c.tapInto('spatula', 'jar_mix');
              await d.until(() => load() < 0.01 && !d.c.busy('spatula'), 5);
              return;
            }
            const pm = mouthOf(d.vessel('weigh_paper'));
            await d.moveTipTo(pm.x, pm.y);
            if (!(await d.until(() => load() < 0.01 && !d.c.busy('spatula'), 5))) d.dispatch({ type: 'tapTool', toolId: 'spatula', targetId: 'weigh_paper' });
          };
          if (n <= 3) await go();
          else await d.fast(5, go);
          if (n === 3) d.note(d.hooks.t('demo.ui.weighRepeat'));
        }
        d.note(d.hooks.t('demo.ui.weighDone', { g: fmt(reading()) }));
        await d.moveTo(150, 8);
        await d.release();
        await d.wait(2.5);
      },
    },
    {
      part: 'B',
      key: 'transfer',
      run: async (d) => {
        d.lookAtObj('beaker1', 40);
        if (await d.dockFor('weigh_paper', 'beaker1', { x: -1, y: 0 })) {
          await d.pour('weigh_paper', () => pourableSolidsG(d.vessel('weigh_paper')) < 0.002, { timeoutS: 20 });
        }
        await d.moveTo(150, 14);
        await d.release();
      },
    },
    {
      part: 'B',
      key: 'water10',
      run: async (d) => {
        d.lookAtObj('cyl', 42);
        await d.squeeze('cyl', 10.0, () => d.lv('cyl'));
        await d.release();
        await d.press('cyl', 0.3);
        d.lab.setLevelView(true);
        d.note(d.hooks.t('demo.ui.eyeLevel10'));
        await d.wait(3);
        d.lab.setLevelView(false);
        d.note(null);
        d.endPress();
        await d.carry('piseta', 130, 50);
        d.lookAtObj('beaker1', 45);
        if (await d.dockFor('cyl', 'beaker1', { x: -1, y: 0 })) await d.pour('cyl', () => d.lv('cyl') < 0.01, { timeoutS: 40 });
        await d.moveTo(120, 26);
        await d.release();
      },
    },
    {
      part: 'B',
      key: 'dissolve',
      run: async (d) => {
        d.lookAtObj('beaker1', 30);
        await d.insertRod('beaker1');
        await d.stir('beaker1', 5);
        await d.release();
      },
    },
    {
      part: 'B',
      key: 'heat',
      run: async (d) => {
        d.lookAtObj('hotplate', 45);
        await d.placeIn('beaker1', 'hotplate');
        await d.grab('probe');
        const m = mouthOf(d.vessel('beaker1'));
        await d.moveTo(m.x + 0.3, m.y);
        if (!(await d.until(() => d.w.devices.probe.vesselId === 'beaker1', 3))) {
          d.dispatch({ type: 'insertProbe', vesselId: 'beaker1', touchingBottom: false });
        }
        await d.release();
        // Agitación constante con la varilla mientras se calienta.
        await d.press('rod', 0.4);
        d.dispatch({ type: 'setAgitation', vesselId: 'beaker1', intensity: 0.6, tool: 'ROD' });
        d.endPress();
        for (const pct of [25, 45, 60]) {
          await d.press('hotplate', 0.5);
          d.dispatch({ type: 'setHotplatePower', pct });
          d.endPress();
          d.note(d.hooks.t('demo.ui.power', { pct }));
          await d.simUntil(() => false, 40, 20);
        }
        await d.simUntil(() => d.vessel('beaker1').temperatureC >= 92, 900, 30);
        await d.press('hotplate', 0.5);
        d.dispatch({ type: 'setHotplatePower', pct: 45 });
        d.endPress();
        d.note(d.hooks.t('demo.ui.hold'));
        await d.wait(1.5);
        await d.simUntil(() => false, 150, 30);
        await d.press('hotplate', 0.5);
        d.dispatch({ type: 'setHotplatePower', pct: 0 });
        d.endPress();
      },
    },
    {
      part: 'B',
      key: 'fold',
      run: async (d) => {
        d.lookAtObj('paper1', 26);
        for (const action of ['HALF', 'QUARTER', 'OPEN_3_1'] as const) {
          await d.press('paper1', 0.6);
          d.dispatch({ type: 'foldPaper', paperId: 'paper1', action });
          d.note(d.hooks.t(`demo.ui.fold_${action}`));
          await d.wait(1.6);
        }
        d.endPress();
      },
    },
    {
      part: 'B',
      key: 'mount',
      run: async (d) => {
        d.lookAtObj('stand', 60);
        await d.placeIn('funnel', 'ring');
        await d.placeIn('paper1', 'funnel');
        const f = d.vessel('funnel');
        await d.carry('beaker2', f.pose.x - 2.7, f.pose.y);
        if (d.vessel('funnel').funnel?.dripTargetId !== 'beaker2') {
          d.dispatch({ type: 'setDripTarget', funnelId: 'funnel', targetId: 'beaker2', touchingWall: true });
        }
        d.note(d.hooks.t('demo.ui.wetPaper'));
        await d.squeeze('funnel', 0.6);
        await d.moveTo(f.pose.x + 16, f.pose.y + 18);
        await d.release();
      },
    },
    {
      part: 'B',
      key: 'decant',
      run: async (d) => {
        d.lookAtObj('hotplate', 50);
        await d.takeOut('probe', 196, 10);
        await d.takeOut('rod', 186, 10);
        d.lookAtObj('funnel', 45);
        await d.insertRod('funnel');
        await d.release();
        d.lookAtObj('hotplate', 50);
        await d.press('tongs', 0.5);
        if (d.w.devices.hand.mode !== 'TONGS') d.c.toggleTongs();
        d.endPress();
        await d.wait(1);
        await d.simUntil(() => false, 15, 5);
        d.lookAtObj('funnel', 40);
        const fl = () => d.lv('funnel');
        if (await d.dockFor('beaker1', 'funnel', { x: 1, y: 0 })) {
          await d.pour('beaker1', () => d.lv('beaker1') < 0.05 && pourableSolidsG(d.vessel('beaker1')) < 0.003, {
            timeoutS: 240, pauseWhen: () => fl() > 3.0, resumeWhen: () => fl() < 1.8,
          });
        }
        const f = d.vessel('funnel');
        await d.moveTo(f.pose.x + 13, f.pose.y - 8);
        await d.release();
      },
    },
    {
      part: 'B',
      key: 'wash',
      run: async (d) => {
        d.lookAtObj('beaker1', 40);
        await d.squeeze('beaker1', 2.0);
        const f = d.vessel('funnel');
        await d.moveTo(f.pose.x + 16, f.pose.y + 18);
        await d.release();
        await d.agitate('beaker1', 2.5, 'SWIRL');
        const fl = () => d.lv('funnel');
        if (await d.dockFor('beaker1', 'funnel', { x: 1, y: 0 })) {
          await d.pour('beaker1', () => d.lv('beaker1') < 0.05 && pourableSolidsG(d.vessel('beaker1')) < 0.003, {
            timeoutS: 120, pauseWhen: () => fl() > 3.0, resumeWhen: () => fl() < 1.8,
          });
        }
        await d.moveTo(f.pose.x + 13, f.pose.y - 8);
        await d.release();
        await d.press('tongs', 0.4);
        if (d.w.devices.hand.mode === 'TONGS') d.c.toggleTongs();
        d.endPress();
        d.lookAtObj('funnel', 32);
        await d.simUntil(() => fl() < 0.01 && (d.vessel('funnel').funnel?.dripRateMlPerS ?? 0) < 0.002, 900, 30);
      },
    },
    {
      part: 'B',
      key: 'split',
      run: async (d) => {
        d.lookAtObj('beaker2', 55);
        const f = d.vessel('funnel');
        const spot = { x: f.pose.x + 24, y: f.pose.y + 6 };
        await d.carry('cyl', spot.x, spot.y);
        await d.agitate('beaker2', 2, 'SWIRL');
        if (await d.dockFor('beaker2', 'cyl', { x: -1, y: 0 })) await d.pourMeasured('beaker2', () => d.lv('cyl'), 2.03);
        await d.moveTo(f.pose.x + 20, f.pose.y - 6);
        await d.release();
        d.note(d.hooks.t('demo.ui.aliquot', { ml: fmt(d.lv('cyl'), 1) }));
        await d.wait(2);
        d.lookAtObj('dish', 45);
        if (await d.dockFor('cyl', 'dish', { x: -1, y: 0 })) await d.pour('cyl', () => d.lv('cyl') < 0.01, { timeoutS: 30 });
        const dish = d.vessel('dish');
        await d.moveTo(dish.pose.x - 8, dish.pose.y + 14);
        await d.release();
      },
    },
    {
      part: 'B',
      key: 'evaporate',
      run: async (d) => {
        d.lookAtObj('dish', 35);
        const dish = d.vessel('dish');
        await d.carry('watch_glass', dish.pose.x + 2.2, dish.pose.y);
        if (d.vessel('dish').cover === 'NONE') d.dispatch({ type: 'cover', vesselId: 'dish', mode: 'PARTIAL' });
        await d.wait(0.8);
        d.lookAtObj('hotplate', 70);
        await d.placeIn('dish', 'hotplate');
        // También aquí la potencia se sube por escalones (un salto brusco hace hervir a borbotones).
        for (const pct of [30, 60]) {
          await d.press('hotplate', 0.5);
          d.dispatch({ type: 'setHotplatePower', pct });
          d.endPress();
          d.note(d.hooks.t('demo.ui.power', { pct }));
          if (pct === 30) await d.simUntil(() => false, 30, 15);
        }
        d.lookAtObj('dish', 30);
        await d.simUntil(() => d.vessel('dish').mix.waterG <= 0, 1800, 40);
        await d.press('hotplate', 0.5);
        d.dispatch({ type: 'setHotplatePower', pct: 0 });
        d.endPress();
        await d.simUntil(() => false, 240, 40);
        await tidySpill(d);
      },
    },
    {
      part: 'B',
      key: 'bath',
      run: async (d) => {
        d.lookAtObj('bath', 55);
        const start = d.lv('jug');
        if (await d.dockFor('jug', 'bath', { x: 1, y: 0 })) {
          await d.pour('jug', () => start - d.lv('jug') >= 160, { timeoutS: 90 });
        }
        await d.moveTo(520, 50);
        await d.release();
        await d.grab('ice_scoop');
        for (let i = 0; i < 2; i++) {
          const im = mouthOf(d.vessel('ice_bucket'));
          await d.moveTipTo(im.x, im.y);
          if (!(await d.until(() => d.vessel('ice_scoop').mix.iceG > 0 && !d.c.busy('ice_scoop'), 5))) {
            d.dispatch({ type: 'scoop', toolId: 'ice_scoop', sourceId: 'ice_bucket' });
          }
          const bm = mouthOf(d.vessel('bath'));
          await d.moveTipTo(bm.x, bm.y);
          if (!(await d.until(() => d.vessel('ice_scoop').mix.iceG <= 0 && !d.c.busy('ice_scoop'), 5))) {
            d.dispatch({ type: 'tapTool', toolId: 'ice_scoop', targetId: 'bath' });
          }
        }
        await d.moveTo(500, 18);
        await d.release();
        await d.simUntil(() => false, 60, 20);
      },
    },
    {
      part: 'B',
      key: 'crystallize',
      run: async (d) => {
        d.lookAtObj('beaker2', 40);
        d.note(d.hooks.t('demo.ui.coolFirst'));
        await d.wait(2);
        await d.simUntil(() => d.vessel('beaker2').temperatureC <= d.w.params.ambientC + 3, 1800, 40);
        d.look(400, 30, 120);
        await d.placeIn('beaker2', 'bath');
        if (d.vessel('beaker2').support !== 'bath' && zoneById(d.w, 'bath')) d.dispatch({ type: 'place', id: 'beaker2', support: 'bath' });
        d.lookAtObj('bath', 30);
        await d.simUntil(() => (d.vessel('beaker2').mix.crystals?.massG ?? 0) > 0.05, 1500, 40);
        await d.simUntil(() => false, 300, 40);
        await tidySpill(d);
      },
    },
    {
      part: 'B',
      key: 'notebookB',
      run: async (d) => {
        const r = partBResults(d.w);
        nb.open(true, 't22');
        const t = d.hooks.t;
        const set = async (fn: (n: NotebookState) => void) => {
          nb.edit(fn);
          await d.wait(0.6);
        };
        await set((n) => { n.table22.EVAPORATION.observations = t('demo.obs.evap'); });
        await set((n) => { n.table22.EVAPORATION.massG = fmt(r.dishSolidsG); });
        await set((n) => { n.table22.EVAPORATION.appearance = t('demo.obs.evapLook'); });
        await set((n) => { n.table22.CRYSTALLIZATION.observations = t('demo.obs.cryst'); });
        await set((n) => { n.table22.CRYSTALLIZATION.massG = fmt(r.crystalsG); });
        await set((n) => { n.table22.CRYSTALLIZATION.appearance = t('demo.obs.crystLook'); });
        d.note(t('demo.ui.activitiesYours'));
        await d.wait(5);
        nb.open(false);
      },
    },
  ];
}
