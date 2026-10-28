/**
 * Guion de la demostración de B03 (§16): la MANO VIRTUAL sobre el controlador real remoja y monta una membrana,
 * muestra una fuga intencional con la pinza floja (charco y mezcla: no es transporte selectivo) y la corrige,
 * prueba el sello, carga el trazador y lee a 0/30/60 s, monta la diálisis y la ósmosis, incuba acelerando el tiempo
 * solo sin manipulación precisa, toma alícuotas a cuatro tubos rotulados con blanco y controles, prepara Elodea en
 * agua, NaCl 0,9 % y 5 % y la observa 4X → 10X → 40X, completa la libreta con SUS lecturas y cierra el puesto. Los
 * gestos son los del estudiante (tomar, llevar, P sobre lo que la mano tiene debajo); la pinza de las cámaras, la
 * tapa, los rótulos y las lecturas usan los mismos comandos públicos que el panel de acciones. No marca etapas, no
 * genera nota ni se guarda. Textos en `b03.demo.steps.<clave>`.
 */
import type { DemoDirectorB03, DemoStepB03 } from './director';
import type { B03Notebook } from '../../../practices/practice-b03/notebook';
import type { PermWorld, Side } from '../../../simulation/perm-world/types';
import type { PermController } from '../../../engine/optical/permController';
import { MICROSCOPE_PARTS } from '../../../simulation/instruments/optical/microscope-types';
import { microscopeView } from '../../../simulation/optical-world/world';
import { CLEAN_TRAY, COVER_BOX, PREP_SPOT, STAGE_SEAT } from '../../../simulation/optical-world/geometry';
import { BOTTLE_POS, CELL_POS, CHEM_WASTE, CYLINDER_POS, PIPETTE_POS, RINSE_BEAKER, SOAK_DISH, THERMO_POS, sideOffset } from '../../../simulation/perm-world/geometry';
import { R_KPA_L } from '../../../simulation/membrane-transport/model';
import type { KnobB01 as KnobB03 } from '../../../engine/optical/controller';
import { KIN, type PartGrip } from '../../../engine/optical/parts';

export interface DemoUiHooksB03 {
  notebook(open: boolean, tab?: string): void;
  edit(fn: (nb: B03Notebook) => void): void;
}

interface DemoRes {
  diffusion: string[];
  tubes: Record<string, string>;
  osm: { a0: string; b0: string; af: string; bf: string; temp: string };
  elodea: Record<'water' | 'nacl-0.9' | 'nacl-5', string>;
}

const pw = (d: DemoDirectorB03) => d.w as unknown as PermWorld;
const ctl = (d: DemoDirectorB03) => d.c as unknown as PermController;
const last = (d: DemoDirectorB03) => d.w.observationOrder[d.w.observationOrder.length - 1];
const sideX = (cell: string, s: Side) => CELL_POS[cell].x + sideOffset(s);

async function part(d: DemoDirectorB03, id: string, p: string) {
  d.pointPart(id, p);
  await d.wait(0.4);
  d.c.instrumentPart(id, p);
  d.endPress();
}

const rotary = (axis: PartGrip['axis']): PartGrip => ({ kind: 'rotary', axis });
const PIECE: Partial<Record<KnobB03, { id: string; part: string; grip: PartGrip; rad: number }>> = {
  'mic:coarse': { id: 'mic', part: 'coarse', grip: rotary('x'), rad: 0.1 * KIN.radPerTurn },
  'mic:fine': { id: 'mic', part: 'fine', grip: rotary('x'), rad: 0.05 * KIN.radPerTurn },
  'mic:diaphragm': { id: 'mic', part: 'diaphragm', grip: { kind: 'lever', axis: 'y' }, rad: 0.02 * KIN.irisRadPer01 },
  'mic:turret': { id: 'mic', part: 'turret', grip: rotary('y'), rad: 12 * KIN.turretRadPerDeg },
};

async function hold(d: DemoDirectorB03, knob: KnobB03, fn: (step: (dir: number, big?: boolean) => void) => Promise<void>) {
  const pc = PIECE[knob]!;
  d.pointPart(pc.id, pc.part);
  d.c.grabPart(pc.id, pc.part, pc.grip);
  try {
    await fn((dir, big) => d.c.dragPart(dir * pc.rad * (big ? 5 : 1)));
    await d.wait(0.1);
  } finally {
    d.c.releasePart();
    d.endPress();
  }
}

async function turn(d: DemoDirectorB03, knob: KnobB03, dir: 1 | -1, n: number, big = false) {
  const steps = knob === 'mic:turret' ? n * 10 : n;
  const k = knob === 'mic:turret' ? d.w.params.microscope.turretDetentDeg / 120 : 1;
  await hold(d, knob, async (step) => {
    for (let i = 0; i < steps; i++) {
      step(dir * k, big);
      await d.wait(0.06);
    }
  });
}

async function lever(d: DemoDirectorB03, open: boolean) {
  if (d.w.microscope.clipOpen === open) return;
  d.pointPart('mic', 'clip');
  d.c.grabPart('mic', 'clip', { kind: 'lever', axis: 'y' });
  for (let i = 0; i < 6; i++) {
    d.c.dragPart(((open ? 1 : -1) * KIN.clipOpenRad) / 5);
    await d.wait(0.06);
  }
  d.c.releasePart();
  d.endPress();
  await d.wait(0.2);
}

async function focusCompound(d: DemoDirectorB03) {
  const v = () => microscopeView(d.w);
  if (v().objectiveX === 4) {
    await hold(d, 'mic:coarse', async (step) => {
      for (let i = 0; i < 120 && v().sharpness01 < 0.25; i++) {
        step(1);
        await d.wait(0.05);
      }
    });
  }
  await hold(d, 'mic:fine', async (step) => {
    let best = v().sharpness01;
    for (const dir of [1, -1] as const) {
      for (let i = 0; i < 40; i++) {
        step(dir);
        await d.wait(0.05);
        const s = v().sharpness01;
        if (s + 1e-9 < best) {
          step(-dir);
          await d.wait(0.05);
          break;
        }
        best = s;
      }
    }
  });
}

async function capture(d: DemoDirectorB03) {
  if (d.w.view.instrument === null) d.c.toggleEyepiece('compound');
  await d.wait(d.w.params.observationHoldS + 0.4);
  d.c.onKeyDown('c', false);
  await d.wait(0.4);
  return last(d);
}

async function toolAt(d: DemoDirectorB03, tool: string, x: number, y: number, strong = false) {
  if (d.c.held?.id !== tool && !(await d.grab(tool))) return;
  await d.moveTo(x, y);
  await d.wait(0.3);
  d.c.primary(strong);
  await d.wait(0.5);
}

async function putDown(d: DemoDirectorB03, x: number, y: number) {
  if (!d.c.held) return;
  await d.moveTo(x, y);
  await d.release();
}

/** Frasco o probeta sobre el destino: P empieza a verter; P otra vez al llegar al volumen (a ojo, por el nivel). */
async function pour(d: DemoDirectorB03, source: string, target: string, ml: number, at: { x: number; y: number }, home: { x: number; y: number }, strong = false) {
  const [cell, side] = target.split(':');
  const v = () => (side ? pw(d).perm.cells[cell].sides[side as Side] : pw(d).perm.vessels[target]);
  const goal = v().volumeMl + ml;
  await toolAt(d, source, at.x, at.y, strong);
  await d.until(() => v().volumeMl >= goal - 0.05 || !pw(d).perm.pours[source], 40);
  if (pw(d).perm.pours[source]) d.c.primary(false);
  await d.wait(0.3);
  await putDown(d, home.x, home.y);
}

/** Pipeta: Q/E hasta el volumen, aspira en el origen y descarga en el destino. */
async function pipette(d: DemoDirectorB03, from: { x: number; y: number }, to: { x: number; y: number }, ml: number) {
  if (!(await d.grab('pi'))) return;
  const c = ctl(d);
  while (c.pipetteMl !== ml) c.onKeyDown(c.pipetteMl < ml ? 'e' : 'q', false);
  await d.moveTo(from.x, from.y);
  d.c.primary(false);
  await d.wait(0.5);
  await d.moveTo(to.x, to.y);
  d.c.primary(false);
  await d.wait(0.5);
}

async function rinsePipette(d: DemoDirectorB03) {
  await toolAt(d, 'pi', RINSE_BEAKER.x, RINSE_BEAKER.y);
}

/** Lectura de volumen con la cámara a la altura del menisco (sin paralaje). */
async function readLevel(d: DemoDirectorB03, target: string) {
  d.lab.camera?.eyeLevel(target);
  await d.wait(1.2);
  return ctl(d).read('scale', target)?.id ?? '';
}

/** Membrana al plato de remojo, espera a que se humedezca y a la junta de la cámara (centrada); pinza con dos vueltas. */
async function mount(d: DemoDirectorB03, membrane: string, cell: string, turns = 2) {
  await d.carry(membrane, SOAK_DISH.x, SOAK_DISH.y);
  await d.simUntil(() => (pw(d).perm.membranes[membrane]?.wet01 ?? 0) >= 0.7, 60, 10);
  await d.carry(membrane, CELL_POS[cell].x, CELL_POS[cell].y);
  await d.press(cell, undefined, 0.4);
  d.dispatch({ type: 'turnClamp', cellId: cell, deltaTurns: turns });
  await d.wait(0.4);
  d.endPress();
}

/** Hoja de Elodea con el medio de su gotero y cubreobjetos inclinado y lento; la pinza se limpia. */
async function elodeaMount(d: DemoDirectorB03, slide: string, dropper: string) {
  await d.carry(slide, PREP_SPOT.x, PREP_SPOT.y);
  const el = d.w.objects.el.pose;
  await toolAt(d, 'fc', el.x, el.y);
  await d.moveTo(PREP_SPOT.x, PREP_SPOT.y);
  await d.wait(0.3);
  d.c.primary(false);
  await d.wait(0.4);
  const lp = d.w.objects.lp.pose;
  await d.moveTo(lp.x, lp.y);
  d.c.primary(false);
  await d.wait(0.3);
  await putDown(d, 172, 18);
  const home = d.w.objects[dropper].pose;
  await toolAt(d, dropper, PREP_SPOT.x, PREP_SPOT.y);
  await putDown(d, home.x, home.y);
  await toolAt(d, 'fc', COVER_BOX.x, COVER_BOX.y);
  await d.moveTo(PREP_SPOT.x, PREP_SPOT.y);
  await d.wait(0.3);
  d.c.primary(false);
  await d.until(() => !d.c.lowering, 8);
  await d.wait(0.4);
  await d.moveTo(lp.x, lp.y);
  d.c.primary(false);
  await d.wait(0.3);
  await putDown(d, 172, 18);
}

/** Lámina a la platina, 4X → 10X → 40X enfocando con la vista, captura a 40X y retiro a la bandeja. */
async function observe(d: DemoDirectorB03, slide: string) {
  d.station('E');
  if (microscopeView(d.w).objectiveX !== 4) await turn(d, 'mic:turret', -1, 1);
  await lever(d, true);
  await d.carry(slide, STAGE_SEAT.x, STAGE_SEAT.y);
  await lever(d, false);
  d.c.checkSide();
  await d.wait(0.8);
  await part(d, 'mic', 'ocular');
  await focusCompound(d);
  await capture(d);
  await turn(d, 'mic:turret', 1, 1);
  await focusCompound(d);
  await turn(d, 'mic:turret', 1, 1);
  await turn(d, 'mic:diaphragm', 1, 5);
  await focusCompound(d);
  const id = await capture(d);
  await turn(d, 'mic:diaphragm', -1, 5);
  await turn(d, 'mic:turret', -1, 2);
  d.c.toggleEyepiece('compound');
  await turn(d, 'mic:coarse', -1, Math.ceil(d.w.microscope.coarseTurns / 0.5) + 1, true);
  await turn(d, 'mic:fine', d.w.microscope.fineTurns > 0 ? -1 : 1, Math.round(Math.abs(d.w.microscope.fineTurns) / 0.05));
  await lever(d, true);
  await d.carry(slide, CLEAN_TRAY.x, CLEAN_TRAY.y);
  return id;
}

const TUBES: Array<{ tube: string; label: string; from: string; reagent: 'dBi' | 'dAg' }> = [
  { tube: 't1', label: 'A-Biuret', from: 'c2:A', reagent: 'dBi' },
  { tube: 't2', label: 'A-Ag', from: 'c2:A', reagent: 'dAg' },
  { tube: 't3', label: 'B-Biuret', from: 'c2:B', reagent: 'dBi' },
  { tube: 't4', label: 'B-Ag', from: 'c2:B', reagent: 'dAg' },
  { tube: 't5', label: 'blank', from: 'bW', reagent: 'dBi' },
  { tube: 't6', label: 'pos-protein', from: 'bE', reagent: 'dBi' },
  { tube: 't7', label: 'pos-chloride', from: 'bN', reagent: 'dAg' },
];

export function buildDemoScriptB03(ui: DemoUiHooksB03): DemoStepB03[] {
  const res: DemoRes = { diffusion: [], tubes: {}, osm: { a0: '', b0: '', af: '', bf: '', temp: '' }, elodea: { water: '', 'nacl-0.9': '', 'nacl-5': '' } };
  const posOf = (id: string) => {
    const [cell, side] = id.split(':');
    if (side) return { x: sideX(cell, side as Side), y: CELL_POS[cell].y };
    const o = (d0 as DemoDirectorB03).w.objects[id].pose;
    return { x: o.x, y: o.y };
  };
  let d0: DemoDirectorB03 | null = null;
  return [
    {
      part: 'F', key: 'safety',
      run: async (d) => {
        d0 = d;
        d.station('F');
        for (const id of ['glassBin', 'bioWaste', 'trashBin', 'cw']) {
          await d.press(id, undefined, 0.4);
          d.dispatch({ type: 'inspect', target: id });
        }
        d.station('A');
        // Membranas de la bandeja: se miran (la de película no deja pasar agua ni solutos; el celofán no está caracterizado).
        for (const id of ['md1', 'mpf', 'mce']) {
          await d.press(id, undefined, 0.6);
          d.dispatch({ type: 'inspect', target: id });
        }
        d.endPress();
        d.station('E');
        for (const p of MICROSCOPE_PARTS) d.dispatch({ type: 'inspect', target: `mic:${p}` });
        await part(d, 'mic', 'power');
      },
    },
    {
      part: 'A', key: 'leak',
      run: async (d) => {
        d.station('A');
        // Fuga intencional: pinza con media vuelta (por debajo del sello) y agua en los dos lados.
        await mount(d, 'md1', 'c1', 0.5);
        await pour(d, 'bW', 'c1:A', 15, { x: sideX('c1', 'A'), y: CELL_POS.c1.y }, BOTTLE_POS.bW);
        await pour(d, 'bW', 'c1:B', 15, { x: sideX('c1', 'B'), y: CELL_POS.c1.y }, BOTTLE_POS.bW);
        d.note(d.hooks.t('b03.demo.ui.leak'));
        await d.simUntil(() => pw(d).perm.cells.c1.leakOutMl > 0.6, 30, 3);
        d.note(d.hooks.t('b03.demo.ui.recover'));
        await d.press('c1', undefined, 0.4);
        d.dispatch({ type: 'turnClamp', cellId: 'c1', deltaTurns: 1.5 });
        d.endPress();
        await toolAt(d, 'pp', CELL_POS.c1.x, CELL_POS.c1.y - 6);
        d.dispatch({ type: 'wipe', targetId: 'bench', toolId: 'pp' });
        await putDown(d, 170, 28);
        d.note(null);
        // Prueba del sello: dos lecturas del mismo lado separadas por el tiempo de la prueba.
        await pour(d, 'bW', 'c1:A', 15 - pw(d).perm.cells.c1.sides.A.volumeMl, { x: sideX('c1', 'A'), y: CELL_POS.c1.y }, BOTTLE_POS.bW);
        await pour(d, 'bW', 'c1:B', 15 - pw(d).perm.cells.c1.sides.B.volumeMl, { x: sideX('c1', 'B'), y: CELL_POS.c1.y }, BOTTLE_POS.bW);
        await readLevel(d, 'c1:A');
        await d.simUntil(() => false, (pw(d).params.perm?.leakTestS ?? 20) + 2, 5);
        await readLevel(d, 'c1:A');
      },
    },
    {
      part: 'A', key: 'diffusion',
      run: async (d) => {
        d.station('A');
        d.dispatch({ type: 'zeroColorimeter' });
        await pipette(d, BOTTLE_POS.bI, { x: sideX('c1', 'A'), y: CELL_POS.c1.y }, 5);
        await rinsePipette(d);
        await putDown(d, PIPETTE_POS.x, PIPETTE_POS.y);
        d.dispatch({ type: 'setLid', cellId: 'c1', closed: true });
        const c1 = pw(d).perm.cells.c1;
        const read = () => res.diffusion.push(ctl(d).read('eye', 'c1:B')?.id ?? '');
        read();
        await d.simUntil(() => d.w.timeS - (c1.tracerAt ?? 0) >= 30, 40, 5);
        read();
        await d.simUntil(() => d.w.timeS - (c1.tracerAt ?? 0) >= 60, 40, 5);
        read();
        res.diffusion.push(ctl(d).read('colorimeter', 'c1:B')?.id ?? '');
      },
    },
    {
      part: 'B', key: 'dialysis',
      run: async (d) => {
        d.station('B');
        await mount(d, 'md2', 'c2');
        await pour(d, 'bW', 'c2:A', 15, { x: sideX('c2', 'A'), y: CELL_POS.c2.y }, BOTTLE_POS.bW);
        // La clara se mide en la probeta (lectura sin paralaje) y se vacía entera en el lado B.
        await pour(d, 'bE', 'g1', 10, CYLINDER_POS.g1, BOTTLE_POS.bE);
        await readLevel(d, 'g1');
        d.station('B');
        await pour(d, 'g1', 'c2:B', 20, { x: sideX('c2', 'B'), y: CELL_POS.c2.y }, CYLINDER_POS.g1, true);
        await pipette(d, BOTTLE_POS.bN, { x: sideX('c2', 'B'), y: CELL_POS.c2.y }, 5);
        await rinsePipette(d);
        await putDown(d, PIPETTE_POS.x, PIPETTE_POS.y);
        d.dispatch({ type: 'setLid', cellId: 'c2', closed: true });
      },
    },
    {
      part: 'C', key: 'osmosis',
      run: async (d) => {
        d.station('C');
        await mount(d, 'md3', 'c3');
        await pour(d, 'bS', 'g2', 20, CYLINDER_POS.g2, BOTTLE_POS.bS);
        await readLevel(d, 'g2');
        d.station('C');
        await pour(d, 'g2', 'c3:A', 25, { x: sideX('c3', 'A'), y: CELL_POS.c3.y }, CYLINDER_POS.g2, true);
        await pour(d, 'bW', 'g2', 20, CYLINDER_POS.g2, BOTTLE_POS.bW);
        await readLevel(d, 'g2');
        d.station('C');
        await pour(d, 'g2', 'c3:B', 25, { x: sideX('c3', 'B'), y: CELL_POS.c3.y }, CYLINDER_POS.g2, true);
        d.dispatch({ type: 'setLid', cellId: 'c3', closed: true });
        res.osm.a0 = await readLevel(d, 'c3:A');
        res.osm.b0 = await readLevel(d, 'c3:B');
        d.station('C');
        await toolAt(d, 'th', CELL_POS.c3.x, CELL_POS.c3.y);
        res.osm.temp = pw(d).perm.readingOrder[pw(d).perm.readingOrder.length - 1];
        await putDown(d, THERMO_POS.x, THERMO_POS.y);
      },
    },
    {
      part: 'C', key: 'incubate',
      run: async (d) => {
        // Nada en la mano ni en la pipeta: el dominio acepta acelerar el tiempo.
        d.dispatch({ type: 'requestTimeScale', x: 30 });
        const t0 = pw(d).perm.cells.c3.loadedAt ?? d.w.timeS;
        await d.simUntil(() => d.w.timeS - t0 >= (pw(d).params.perm?.osmosis.incubationS ?? 1200) + 5, 1300, 30);
        res.osm.af = await readLevel(d, 'c3:A');
        res.osm.bf = await readLevel(d, 'c3:B');
        d.note(d.hooks.t('b03.demo.ui.hydrostatic'));
        await d.wait(2.4);
        d.note(null);
      },
    },
    {
      part: 'B', key: 'assays',
      run: async (d) => {
        d.station('B');
        for (const x of TUBES) d.dispatch({ type: 'labelTube', tubeId: x.tube, label: x.label });
        let prev = '';
        for (const x of TUBES) {
          if (prev && prev !== x.from) await rinsePipette(d);
          await pipette(d, posOf(x.from), posOf(x.tube), 2);
          prev = x.from;
        }
        await rinsePipette(d);
        await putDown(d, PIPETTE_POS.x, PIPETTE_POS.y);
        for (const reagent of ['dBi', 'dAg'] as const) {
          const home = d.w.objects[reagent].pose;
          for (const x of TUBES.filter((q) => q.reagent === reagent)) await toolAt(d, reagent, posOf(x.tube).x, posOf(x.tube).y, true);
          await putDown(d, home.x, home.y);
        }
        await d.simUntil(() => false, (pw(d).params.perm?.assay.biuretDelayS ?? 120) + 5, 20);
        for (const x of TUBES) res.tubes[x.label] = ctl(d).read('eye', x.tube)?.id ?? '';
        // Vaciado de cámaras y tubos a residuos químicos (plata y cobre).
        for (const c of ['c1', 'c2', 'c3']) d.dispatch({ type: 'drainCell', cellId: c });
        for (const x of TUBES) await d.carry(x.tube, CHEM_WASTE.x, CHEM_WASTE.y);
      },
    },
    {
      part: 'D', key: 'elodea',
      run: async (d) => {
        d.station('D');
        const media: Array<['water' | 'nacl-0.9' | 'nacl-5', string, string]> = [['water', 'sl1', 'dw'], ['nacl-0.9', 'sl2', 'n09'], ['nacl-5', 'sl3', 'n5']];
        for (const [m, slide, dropper] of media) {
          d.station('D');
          await elodeaMount(d, slide, dropper);
          // La respuesta osmótica tarda: se espera con el tiempo acelerado antes de observar.
          await d.simUntil(() => false, 150, 15);
          if (m === 'nacl-0.9') {
            d.note(d.hooks.t('b03.demo.ui.iso09'));
            await d.wait(2.2);
            d.note(null);
          }
          res.elodea[m] = await observe(d, slide);
        }
      },
    },
    {
      part: 'F', key: 'record',
      run: async (d) => {
        const w = pw(d);
        const r = (id: string) => w.perm.readings[id];
        ui.notebook(true, 'membrane');
        ui.edit((nb) => {
          nb.membrane = { material: 'dialysis', code: 'D-12', areaCm2: '10', integrity: 'intact', control: 'sealed', permeability: 'known', hypothesis: { water: 'pass', salt: 'pass', protein: 'retain', tracer: 'pass' } };
          nb.diffusion.rows = res.diffusion.map((id) => ({ readingId: id || null, concentration: '', note: '' }));
          nb.diffusion.attribution = 'diffusion';
          nb.diffusion.conclusion = 'Con el sello probado, el color del lado B aumentó de 0 a 60 s: el trazador atraviesa la membrana por difusión.';
        });
        await d.wait(1.6);
        ui.notebook(true, 'dialysis');
        ui.edit((nb) => {
          nb.dialysis.rows = nb.dialysis.rows.map((row) => {
            const rd = r(res.tubes[row.label]);
            const pos = !!rd && /violet|precipitate/.test(rd.quality ?? '');
            return { ...row, readingId: rd?.id ?? null, interpretation: rd ? (pos ? 'positive' : 'negative') : '' };
          });
          nb.dialysis.silverShows = 'chloride';
          nb.dialysis.conclusion = 'El cloruro pasó al lado A (precipitado con AgNO₃); la proteína quedó en B (Biuret violeta solo en B), con blanco y controles coherentes.';
        });
        await d.wait(1.6);
        ui.notebook(true, 'osmosis');
        ui.edit((nb) => {
          const [a0, b0, af, bf, tp] = [r(res.osm.a0), r(res.osm.b0), r(res.osm.af), r(res.osm.bf), r(res.osm.temp)];
          if (!a0 || !b0 || !af || !bf) return;
          const dur = Math.max(af.t, bf.t) - Math.min(a0.t, b0.t);
          nb.osmosis = {
            ...nb.osmosis, vA0: a0.id, vB0: b0.id, vAf: af.id, vBf: bf.id, tempReadingId: tp?.id ?? null,
            durationMin: (dur / 60).toFixed(1), dVA: (af.value - a0.value).toFixed(1), dVB: (bf.value - b0.value).toFixed(1),
            fluxMlMin: ((Math.abs(bf.value - b0.value) / dur) * 60).toFixed(3), fluxMlS: (Math.abs(bf.value - b0.value) / dur).toFixed(5), uncertaintyMl: '0,2',
            deltaOsm: '2', piKPa: tp ? (R_KPA_L * (tp.value + 273.15) * 2).toFixed(0) : '',
            explanation: 'El agua pasó del lado con agua al del jarabe, de menor a mayor concentración de soluto; la columna más alta frena el flujo.',
          };
        });
        await d.wait(1.6);
        ui.notebook(true, 'micro');
        ui.edit((nb) => {
          nb.micro.rows = (['water', 'nacl-0.9', 'nacl-5'] as const).map((m) => {
            const id = res.elodea[m];
            const c = id ? w.perm.elodeaCaptures[id] : null;
            return { observationId: id || null, treatment: m, totalMag: '400', condition: c ? (c.state === 'plasmolyzed' ? 'plasmolyzed' : 'turgid') : '', structures: ['cellWall', 'chloroplasts'] };
          });
          nb.micro.iso09 = 'depends';
          nb.balance = { water: 'El agua inicial se reparte entre cámaras, residuos, derrame y evaporación.', solutes: 'Cada soluto cargado está en su lado, en los tubos o en residuos.', notSelective: 'La fuga inicial de la cámara 1 mezcló los lados sin pasar por la membrana.' };
        });
        await d.wait(2);
        ui.notebook(false);
      },
    },
    {
      part: 'F', key: 'close',
      run: async (d) => {
        d.station('E');
        await part(d, 'mic', 'power');
        d.station('F');
        ui.notebook(true, 'balance');
        d.dispatch({ type: 'closeBench' });
        await d.wait(2.4);
        ui.notebook(false);
      },
    },
  ];
}
