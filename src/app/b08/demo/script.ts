/**
 * Guion de la demostración de B08 (§16): la MANO VIRTUAL sobre el controlador real recorre los catorce pasos con los mismos
 * comandos que el estudiante: par luz/oscuridad, serie BTB, extracción en campana, cromatografía y cierre. Las corridas se
 * solapan como en un laboratorio (la serie BTB arranca mientras corre el par) y se aceleran ×10 como máximo. No genera nota.
 */
import type { DemoDirectorB08, DemoStepB08 } from './director';
import type { B08Notebook } from '../../../practices/practice-b08/notebook';
import { BALANCE, BOTTLES_HOOD, BTB_TUBES, ORGANIC_WASTE, TANK_SLOT } from '../../../simulation/photo-world/geometry';
import { bandsOf, elapsedOf, seriesElapsed } from '../../../simulation/photo-world/world';
import type { PhotoWorld } from '../../../simulation/photo-world/types';

export interface DemoUiHooksB08 {
  notebook(open: boolean, tab?: string): void;
  edit(fn: (nb: B08Notebook) => void): void;
}

const ACCEL = 10;

export function buildDemoScriptB08(ui: DemoUiHooksB08): DemoStepB08[] {
  const ids: Record<string, string> = {};
  const W = (d: DemoDirectorB08) => d.w as PhotoWorld;
  const rd = (d: DemoDirectorB08, id: string) => W(d).photo.readings.find((r) => r.id === id)!;
  return [
    {
      part: 'A', key: 'safety',
      run: async (d) => {
        d.station('A');
        for (const id of ['organicWaste', 'hood', 'board']) {
          await d.press(id, undefined, 0.4);
          d.dispatch({ type: 'inspect', target: id });
        }
        ui.notebook(true, 'pre');
        ui.edit((nb) => {
          nb.prereport = { hypothesis: 'A la luz la columna sube y a oscuras baja', variable: 'Luz sobre dos ramas semejantes', precautions: 'Solventes solo en campana, con gafas y sin lámpara cerca' };
        });
        d.dispatch({ type: 'recordHypothesis', variable: 'Luz' });
        await d.wait(1.2);
        ui.notebook(false);
      },
    },
    {
      part: 'D', key: 'pair',
      run: async (d) => {
        d.station('D');
        await d.press('el1', undefined, 0.5);
        await d.press('el2', undefined, 0.5);
        await d.carry('el1', W(d).objects.gL.pose.x, W(d).objects.gL.pose.y);
        await d.carry('el2', W(d).objects.gD.pose.x, W(d).objects.gD.pose.y);
      },
    },
    {
      part: 'D', key: 'seal',
      run: async (d) => {
        for (const [tube, label] of [['gL', 'light'], ['gD', 'dark']] as const) {
          d.dispatch({ type: 'fillTube', tubeId: tube, mL: 30, tiltDeg: 30 });
          await d.wait(0.4);
          d.dispatch({ type: 'setStopper', tubeId: tube, seat01: 1 });
          d.dispatch({ type: 'connectCapillary', tubeId: tube, contact01: 1 });
          d.dispatch({ type: 'clearCapillary', tubeId: tube });
          d.dispatch({ type: 'levelCapillary', tubeId: tube, deg: 0 });
          d.dispatch({ type: 'labelTube', tubeId: tube, label });
          await d.wait(0.4);
        }
        await d.carry('gL', TANK_SLOT.aqA.x, TANK_SLOT.aqA.y);
        await d.carry('gD', TANK_SLOT.aqB.x, TANK_SLOT.aqB.y);
      },
    },
    {
      part: 'D', key: 'baseline',
      run: async (d) => {
        ids.baseL = d.dispatch({ type: 'markBaseline', tubeId: 'gL', eyeOffsetCm: 0 }).id ?? '';
        await d.wait(0.6);
        ids.baseD = d.dispatch({ type: 'markBaseline', tubeId: 'gD', eyeOffsetCm: 0 }).id ?? '';
        await d.wait(0.6);
      },
    },
    {
      part: 'D', key: 'lamp',
      run: async (d) => {
        await d.carry('coverG', W(d).objects.gD.pose.x, W(d).objects.gD.pose.y);
        await d.carry('lampG', TANK_SLOT.aqA.x, TANK_SLOT.aqA.y + 20);
        d.dispatch({ type: 'setLamp', lampId: 'lampG', on: true, powerPct: 100 });
        d.dispatch({ type: 'recordControls', dicKnown: true, tempC: 25, distanceCm: 20, powerIndex: 100, lightUnit: 'au' });
        await d.wait(0.8);
      },
    },
    {
      part: 'D', key: 'run',
      run: async (d) => {
        d.dispatch({ type: 'startGasRun' });
        await d.simUntil(() => (elapsedOf(W(d)) ?? 0) >= 240, 240, ACCEL);
      },
    },
    {
      part: 'E', key: 'btbSetup',
      run: async (d) => {
        d.station('E');
        for (const id of ['bN', 'bL', 'bD']) {
          d.dispatch({ type: 'fillBtb', tubeId: id, mL: 10 });
          d.dispatch({ type: 'addIndicator', tubeId: id, drops: 4 });
          d.dispatch({ type: 'doseCO2', tubeId: id, units: 3, aligned: true });
          await d.wait(0.4);
        }
        await d.carry('elB1', BTB_TUBES.bL.x, BTB_TUBES.bL.y);
        await d.carry('elB2', BTB_TUBES.bD.x, BTB_TUBES.bD.y);
        await d.carry('coverB', BTB_TUBES.bD.x, BTB_TUBES.bD.y);
        await d.carry('lampB', BTB_TUBES.bL.x, BTB_TUBES.bL.y + 20);
        d.dispatch({ type: 'setLamp', lampId: 'lampB', on: true, powerPct: 100 });
        for (const id of ['bN', 'bL', 'bD']) ids[`${id}0`] = d.dispatch({ type: 'readIndicator', tubeId: id }).id ?? '';
        d.dispatch({ type: 'startSeries' });
      },
    },
    {
      part: 'E', key: 'btbRead',
      run: async (d) => {
        const p = W(d).params.photo!;
        await d.simUntil(() => (elapsedOf(W(d)) ?? 0) >= p.runDurationS + 0.1, p.runDurationS, ACCEL);
        d.station('D');
        ids.finalL = d.dispatch({ type: 'readMeniscus', tubeId: 'gL', eyeOffsetCm: 0 }).id ?? '';
        ids.finalD = d.dispatch({ type: 'readMeniscus', tubeId: 'gD', eyeOffsetCm: 0 }).id ?? '';
        d.dispatch({ type: 'openStopper', tubeId: 'gL' });
        d.dispatch({ type: 'openStopper', tubeId: 'gD' });
        d.dispatch({ type: 'setLamp', lampId: 'lampG', on: false, powerPct: 100 });
        await d.wait(0.8);
        d.station('E');
        await d.simUntil(() => (seriesElapsed(W(d)) ?? 0) >= p.seriesDurationS + 0.1, p.seriesDurationS, ACCEL);
        for (const id of ['bN', 'bL', 'bD']) ids[`${id}1`] = d.dispatch({ type: 'readIndicator', tubeId: id }).id ?? '';
        d.dispatch({ type: 'setLamp', lampId: 'lampB', on: false, powerPct: 100 });
        await d.wait(0.8);
      },
    },
    {
      part: 'B', key: 'extract',
      run: async (d) => {
        d.station('B');
        for (const id of ['bA', 'bW', 'bH', 'bE']) await d.carry(id, BOTTLES_HOOD[id].x, BOTTLES_HOOD[id].y);
        await d.carry('leaf', BALANCE.x, BALANCE.y);
        d.dispatch({ type: 'weighLeaf' });
        d.dispatch({ type: 'transferLeaf', g: 1, inside: true });
        d.dispatch({ type: 'grind', strokes: 14 });
        await d.wait(0.8);
        for (const [id, mL] of [['bA', 4], ['bW', 4], ['bH', 3]] as const) {
          d.dispatch({ type: 'openSolvent', bottleId: id });
          d.dispatch({ type: 'addSolvent', bottleId: id, mL });
          d.dispatch({ type: 'closeSolvent', bottleId: id });
          await d.wait(0.5);
        }
      },
    },
    {
      part: 'B', key: 'phase',
      run: async (d) => {
        d.dispatch({ type: 'capSepTube', closed: true });
        d.dispatch({ type: 'shake', intensity01: 1, seconds: 10 });
        d.dispatch({ type: 'capSepTube', closed: false });
        const s = W(d).params.photo!.settleS;
        await d.simUntil(() => W(d).photo.sep.settledAt !== null && W(d).timeS - W(d).photo.sep.settledAt! >= s + 0.2, s + 2, ACCEL);
        d.dispatch({ type: 'aspirate', zone: 'upper' });
        await d.wait(0.8);
      },
    },
    {
      part: 'C', key: 'paper',
      run: async (d) => {
        d.station('C');
        const p = W(d).params.photo!;
        d.dispatch({ type: 'cutPaper' });
        d.dispatch({ type: 'markOrigin', tool: 'pencil', mm: p.originMm });
        for (let i = 0; i < 2; i++) {
          d.dispatch({ type: 'applySpot', size: 'small' });
          const t0 = W(d).timeS;
          await d.simUntil(() => W(d).timeS - t0 >= p.spotDryS + 0.2, p.spotDryS + 1, ACCEL);
        }
        d.dispatch({ type: 'openSolvent', bottleId: 'bE' });
        d.dispatch({ type: 'pourEluent', bottleId: 'bE', levelMm: 10 });
        d.dispatch({ type: 'closeSolvent', bottleId: 'bE' });
        d.dispatch({ type: 'hangPaper', tiltDeg: 0, clip: true });
        d.dispatch({ type: 'closeChamber', closed: true });
        await d.wait(0.8);
      },
    },
    {
      part: 'C', key: 'develop',
      run: async (d) => {
        await d.simUntil(() => W(d).photo.paper.frontMm >= 116, 700, ACCEL);
        d.dispatch({ type: 'removePaper' });
        ids.front = d.dispatch({ type: 'markSolventFront', mm: Math.round(W(d).photo.paper.frontMm) }).id ?? '';
        for (const b of bandsOf(W(d))) ids[`band:${b.id}`] = d.dispatch({ type: 'markBand', bandId: b.id, mm: Math.round(b.centerMm) }).id ?? '';
        await d.wait(1);
      },
    },
    {
      part: 'F', key: 'synth',
      run: async (d) => {
        const w = W(d);
        const o = w.photo.paper.originMm ?? 0;
        const fr = rd(d, ids.front).value;
        const dh = (a: string, b: string) => rd(d, b).value - rd(d, a).value;
        const dhL = dh(ids.baseL, ids.finalL);
        const dhD = dh(ids.baseD, ids.finalD);
        const hours = (id: string) => (rd(d, id).elapsedS ?? 0) / 3600;
        ui.notebook(true, 'gas');
        ui.edit((nb) => {
          nb.prep[0] = { tubeId: 'gL', treatment: 'light', biomass: '1,0 g', volume: '30 mL', dic: '2 mmol/L', light: '100 a.u.', tempC: '25', sealed: true };
          nb.prep[1] = { tubeId: 'gD', treatment: 'dark', biomass: '1,0 g', volume: '30 mL', dic: '2 mmol/L', light: '0 a.u.', tempC: '25', sealed: true };
          const gas = (i: number, a: string, b: string, v: number) => Object.assign(nb.gas[i], { baselineId: a, finalId: b, initial: String(rd(d, a).value), final: String(rd(d, b).value), dh: String(v), minutes: '20', hours: hours(b).toFixed(4), slope: (v / hours(b)).toFixed(1), slopeUnit: 'mm/h', radiusMm: '1,0', dvMl: (Math.PI * 0.01 * (v / 10)).toFixed(5) });
          gas(0, ids.baseL, ids.finalL, dhL);
          gas(1, ids.baseD, ids.finalD, dhD);
          nb.gross = { net: String(dhL * 3), dark: String(dhD * 3), gross: String(dhL * 3 + Math.abs(dhD * 3)), unit: 'mm/h', assumptionStated: true, humidityCorrected: false };
          for (const r of nb.btb) Object.assign(r, { plant: r.tubeId !== 'bN', light: r.tubeId === 'bL', readingId0: ids[`${r.tubeId}0`], readingIdEnd: ids[`${r.tubeId}1`], color0: rd(d, ids[`${r.tubeId}0`]).color, colorEnd: rd(d, ids[`${r.tubeId}1`]).color, interpretation: 'El color sigue al pH por el carbono inorgánico, no a la glucosa' });
          nb.bands = bandsOf(w).map((b) => {
            const c = rd(d, ids[`band:${b.id}`]).value;
            return { bandId: b.id, readingId: ids[`band:${b.id}`], frontReadingId: ids.front, color: b.color, origin: String(o), center: String(c), front: String(fr), dBand: String(c - o), dFront: String(fr - o), rf: ((c - o) / (fr - o)).toFixed(3), u: '0,01', identity: 'provisional', composite: b.composite, anomaly: false };
          });
          nb.extraction = { mass: '1,00', volumes: '4 + 4 + 3', grind: 'Fina', phase: 'Superior', aspect: 'Verde intenso', lightNote: 'Lejos de la lámpara' };
          nb.synthesis = { hypothesisResult: 'Se sostiene en esta corrida', conclusion: 'La columna subió a la luz y bajó a oscuras; el BTB viró a azul solo con planta iluminada; se separaron cuatro bandas', limits: 'Perfil sintético; bruta condicionada a una respiración constante; identidad de bandas provisional' };
        });
        await d.wait(2.4);
        ui.notebook(true, 'pig');
        await d.wait(2);
        ui.notebook(false);
      },
    },
    {
      part: 'F', key: 'close',
      run: async (d) => {
        d.station('F');
        await d.carry('paper', ORGANIC_WASTE.x, ORGANIC_WASTE.y);
        await d.carry('vial', ORGANIC_WASTE.x, ORGANIC_WASTE.y);
        ui.notebook(true, 'close');
        ui.edit((nb) => {
          nb.open = { notes: 'Sin incidencias', limitations: 'Simulación; valores sintéticos rotulados', errors: 'Ninguno' };
        });
        d.dispatch({ type: 'closeBench' });
        await d.wait(2.4);
        ui.notebook(false);
      },
    },
  ];
}
