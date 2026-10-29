/**
 * Guion de la demostración de B04 (§16): la MANO VIRTUAL sobre el controlador real prepara P1 (almidón pesado, agua
 * medida con probeta, placa con barra y ~30 °C leídos en el líquido) y P2 (hígado pesado y cortado fino, sin calor),
 * hace los cuatro ensayos de biomoléculas con su blanco de agua y su patrón en tubos rotulados ENSAYO/LOTE, tiñe un
 * frotis por Feulgen en los frascos y lo observa 4X → 10X → 40X junto al control sin hidrólisis, mide el O₂ de la
 * catalasa (cruda, hervida y blanco) con colector sellado, prepara P3 y sigue la hidrólisis del almidón leyendo Lugol
 * y Benedict en alícuotas separadas, completa la libreta con SUS lecturas y cierra el puesto. Las acciones usan los
 * mismos comandos públicos que el panel de acciones; el tiempo solo se acelera con las manos libres. No marca etapas,
 * no genera nota ni se guarda. Textos en `b04.demo.steps.<clave>`.
 */
import type { DemoDirectorB04, DemoStepB04 } from './director';
import type { B04Notebook } from '../../../practices/practice-b04/notebook';
import type { BioWorld } from '../../../simulation/bio-world/types';
import type { BioCommand } from '../../../simulation/bio-world/commands';
import type { BioController } from '../../../engine/optical/bioController';
import { MICROSCOPE_PARTS } from '../../../simulation/instruments/optical/microscope-types';
import { microscopeView } from '../../../simulation/optical-world/world';
import { STAGE_SEAT } from '../../../simulation/optical-world/geometry';
import { BALANCE_POS, BEAKER_POS, BOARD_B04, GEO_B04, PLATE_POS, STAIN_JAR_POS } from '../../../simulation/bio-world/geometry';
import { LOT_CODE, STAIN_JARS } from '../../../simulation/bio-world/world';
import { spotsFor } from '../../../engine/optical/layout';
import type { KnobB01 as KnobB04 } from '../../../engine/optical/controller';
import { KIN, type PartGrip } from '../../../engine/optical/parts';

export interface DemoUiHooksB04 {
  notebook(open: boolean, tab?: string): void;
  edit(fn: (nb: B04Notebook) => void): void;
}

interface DemoRes {
  massId: string;
  assays: Array<{ label: string; id: string; result: 'positive' | 'negative'; molecule: B04Notebook['assays']['rows'][number]['molecule'] }>;
  feulgen: string[];
  gas: Array<{ id: string; condition: string }>;
  amy: { lugol: string; benedict: string; control: string; ph: string };
}

const bw = (d: DemoDirectorB04) => d.w as unknown as BioWorld;
const ctl = (d: DemoDirectorB04) => d.c as unknown as BioController;
const last = (d: DemoDirectorB04) => d.w.observationOrder[d.w.observationOrder.length - 1];
const fp = (d: DemoDirectorB04) => bw(d).params.bio!;

async function part(d: DemoDirectorB04, id: string, p: string) {
  d.pointPart(id, p);
  await d.wait(0.4);
  d.c.instrumentPart(id, p);
  d.endPress();
}

const rotary = (axis: PartGrip['axis']): PartGrip => ({ kind: 'rotary', axis });
const PIECE: Partial<Record<KnobB04, { id: string; part: string; grip: PartGrip; rad: number }>> = {
  'mic:coarse': { id: 'mic', part: 'coarse', grip: rotary('x'), rad: 0.1 * KIN.radPerTurn },
  'mic:fine': { id: 'mic', part: 'fine', grip: rotary('x'), rad: 0.05 * KIN.radPerTurn },
  'mic:diaphragm': { id: 'mic', part: 'diaphragm', grip: { kind: 'lever', axis: 'y' }, rad: 0.02 * KIN.irisRadPer01 },
  'mic:turret': { id: 'mic', part: 'turret', grip: rotary('y'), rad: 12 * KIN.turretRadPerDeg },
};

async function hold(d: DemoDirectorB04, knob: KnobB04, fn: (step: (dir: number, big?: boolean) => void) => Promise<void>) {
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

async function turn(d: DemoDirectorB04, knob: KnobB04, dir: 1 | -1, n: number, big = false) {
  const steps = knob === 'mic:turret' ? n * 10 : n;
  const k = knob === 'mic:turret' ? d.w.params.microscope.turretDetentDeg / 120 : 1;
  await hold(d, knob, async (step) => {
    for (let i = 0; i < steps; i++) {
      step(dir * k, big);
      await d.wait(0.06);
    }
  });
}

async function lever(d: DemoDirectorB04, open: boolean) {
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

async function focusCompound(d: DemoDirectorB04) {
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

async function capture(d: DemoDirectorB04) {
  if (d.w.view.instrument === null) d.c.toggleEyepiece('compound');
  await d.wait(d.w.params.observationHoldS + 0.4);
  d.c.onKeyDown('c', false);
  await d.wait(0.4);
  return last(d);
}

/** La mano señala el objeto y se despacha el mismo comando que el panel de acciones. */
async function act(d: DemoDirectorB04, id: string, cmd: BioCommand, pauseS = 0.35) {
  await d.press(id, undefined, pauseS);
  const r = d.dispatch(cmd);
  d.endPress();
  return r;
}

const pose = (x: number, y: number, z = 0) => ({ x, y, z, rotationRad: 0 });
const place = (d: DemoDirectorB04, id: string, support: string, at: { x: number; y: number }, z = 0) => act(d, id, { type: 'setPose', id, pose: pose(at.x, at.y, z), support });

/** Vierte con la inclinación del estudiante y endereza al llegar a la marca (menos inclinación cerca del final). */
async function pour(d: DemoDirectorB04, source: string, target: string, ml: number, tiltDeg = 55) {
  const v = () => bw(d).bio.vessels[target];
  const goal = v().volumeMl + ml;
  await act(d, source, { type: 'startPour', sourceId: source, targetId: target, tiltDeg });
  await d.simUntil(() => {
    const p = bw(d).bio.pours[source];
    if (p && goal - v().volumeMl < 2 && p.tiltDeg > 40) d.dispatch({ type: 'startPour', sourceId: source, targetId: target, tiltDeg: 40 });
    return v().volumeMl >= goal - 1e-3 || !p;
  }, 600, 4);
  if (bw(d).bio.pours[source]) d.dispatch({ type: 'stopPour', sourceId: source });
}

async function emptyInto(d: DemoDirectorB04, source: string, target: string) {
  await act(d, source, { type: 'startPour', sourceId: source, targetId: target, tiltDeg: 110 });
  await d.simUntil(() => !bw(d).bio.pours[source], 120, 4);
}

/** Pipeta graduada: cero leído, aspira lento, entrega escurriendo y se enjuaga. */
async function pipette(d: DemoDirectorB04, from: string, to: string, ml: number) {
  const c = ctl(d);
  c.pipetteMl = ml;
  if (!bw(d).bio.pipettes.pi.zeroChecked) await act(d, 'pi', { type: 'readInstrument', instrument: 'scale', targetId: 'pi' });
  await act(d, from, { type: 'aspirate', toolId: 'pi', sourceId: from, volumeMl: ml, speed01: 0.3 }, 0.25);
  await act(d, to, { type: 'dispense', toolId: 'pi', targetId: to, mode: 'drain' }, 0.25);
  d.dispatch({ type: 'rinseTool', toolId: 'pi' });
}

async function drops(d: DemoDirectorB04, dropper: 'dI' | 'dNa' | 'dCu', tube: string, n: number) {
  await d.press(tube, undefined, 0.25);
  for (let i = 0; i < n; i++) d.dispatch({ type: 'squeezeDropper', dispenserId: dropper, targetId: tube, force01: 0.5, dxCm: 0, dyCm: 0 });
  d.endPress();
}

const mix = (d: DemoDirectorB04, tube: string, durationS = 5) => act(d, tube, { type: 'mixTube', tubeId: tube, vigor01: 0.5, durationS }, 0.2);
const readEye = async (d: DemoDirectorB04, tube: string) => (await act(d, tube, { type: 'readInstrument', instrument: 'eye', targetId: tube }, 0.3)).id ?? '';
const waitSim = (d: DemoDirectorB04, s: number, accel = 20) => {
  const t0 = d.w.timeS;
  return d.simUntil(() => d.w.timeS - t0 >= s, s + 5, accel);
};

/** Pesa en el bote tarado con la espátula, en tandas (la espátula retiene un poco). */
async function weigh(d: DemoDirectorB04, jar: 'jSt' | 'jAm', g: number) {
  const B = () => bw(d).bio;
  await place(d, 'bt', 'bal', BALANCE_POS, GEO_B04.balance.h + 0.3);
  await act(d, 'bal', { type: 'tare', balanceId: 'bal' });
  for (let i = 0; i < 20; i++) {
    const left = g - Object.values(B().boat.load).reduce((a, b) => a + b, 0);
    if (left < 0.005) break;
    await act(d, jar, { type: 'scoopSolid', toolId: 'spa', sourceId: jar, massG: Math.min(5, left / 0.99) }, 0.2);
    await act(d, 'bt', { type: 'depositSolid', toolId: 'spa', targetId: 'bt' }, 0.2);
  }
  const r = await act(d, 'bal', { type: 'readInstrument', instrument: 'balance', targetId: 'bal' });
  d.dispatch({ type: 'dryTool', toolId: 'spa' });
  return r.id ?? '';
}

async function onPlate(d: DemoDirectorB04, beaker: string, plate: 'hp1' | 'hp2', bar: string, rpm: number) {
  await place(d, beaker, plate, { x: PLATE_POS[plate].x, y: PLATE_POS[plate].y - 1.5 }, GEO_B04.hotplate.h + 0.4);
  await act(d, bar, { type: 'insertStirBar', barId: bar, vesselId: beaker });
  await act(d, plate, { type: 'setStirRate', plateId: plate, rpm });
}

/** Lámina a la platina, 4X → 10X → 40X enfocando con la vista, captura a 40X y retiro a su ranura de la caja. */
async function observe(d: DemoDirectorB04, slide: string) {
  d.station('D');
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
  await capture(d);
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
  const home = spotsFor(d.w, 'fixedSlide').find((s) => s.id === `case:${d.w.slideCase.home[slide]}`);
  if (home) await place(d, slide, home.id, home, home.z);
  await lever(d, false);
  return id;
}

/** Ensayos de biomoléculas: muestra, patrón (control positivo) y agua (blanco) por ensayo; molécula que indica el positivo. */
const ASSAY_TUBES: Array<{ tube: string; assay: 'LUG' | 'BIU' | 'EMU' | 'BEN'; lot: string }> = [
  { tube: 'A1', assay: 'LUG', lot: 'P1' }, { tube: 'A2', assay: 'LUG', lot: 'bW' }, { tube: 'A3', assay: 'LUG', lot: 'sPot' },
  { tube: 'A4', assay: 'BIU', lot: 'sStd' }, { tube: 'A5', assay: 'BIU', lot: 'bW' }, { tube: 'A6', assay: 'BIU', lot: 'sEgg' },
  { tube: 'B1', assay: 'EMU', lot: 'sOil' }, { tube: 'B2', assay: 'EMU', lot: 'bW' }, { tube: 'B3', assay: 'EMU', lot: 'sMilk' },
  { tube: 'C1', assay: 'BEN', lot: 'sGlu' }, { tube: 'C2', assay: 'BEN', lot: 'bW' }, { tube: 'C3', assay: 'BEN', lot: 'sUnk1' },
];
/** Benedict: ~2 min hasta pasar de 80 °C más la dosis térmica; fuera del baño, ~13 min hasta < 50 °C. */
const BENEDICT_BATH_S = 260;
const BENEDICT_COOL_S = 800;
const MOLECULE = { LUG: 'starch', BIU: 'protein', EMU: 'lipid', BEN: 'reducingSugar' } as const;
const POSITIVE = /^(lugol:(black|blue)|biuret:(violet|weak)|emulsion:(milky|cloudy)|benedict:(green|yellow|orange|brick))/;

export function buildDemoScriptB04(ui: DemoUiHooksB04): DemoStepB04[] {
  const res: DemoRes = { massId: '', assays: [], feulgen: [], gas: [], amy: { lugol: '', benedict: '', control: '', ph: '' } };
  return [
    {
      part: 'F', key: 'safety',
      run: async (d) => {
        d.station('F');
        for (const id of ['glassBin', 'bioWaste', 'trashBin', 'cw', 'bu']) {
          await d.press(id, undefined, 0.4);
          d.dispatch({ type: 'inspect', target: id });
        }
        d.endPress();
        d.station('D');
        for (const p of MICROSCOPE_PARTS) d.dispatch({ type: 'inspect', target: `mic:${p}` });
        await part(d, 'mic', 'power');
      },
    },
    {
      part: 'A', key: 'prepP1',
      run: async (d) => {
        d.station('A');
        // Agua medida con la probeta (lectura a la altura del menisco), luego el polvo pesado en el bote tarado.
        await pour(d, 'bW', 'g100', 100);
        d.lab.camera?.eyeLevel('g100');
        await d.wait(1);
        ctl(d).read('scale', 'g100');
        await emptyInto(d, 'g100', 'bk1');
        await weigh(d, 'jSt', 25);
        await act(d, 'bt', { type: 'emptyBoat', targetId: 'bk1' });
        d.dispatch({ type: 'dryTool', toolId: 'bt' });
        await onPlate(d, 'bk1', 'hp1', 'sb1', 500);
        await act(d, 'hp1', { type: 'setHotplateSetpoint', plateId: 'hp1', temperatureK: 306.15 });
        await act(d, 'hp1', { type: 'setHotplatePower', plateId: 'hp1', on: true });
        d.note(d.hooks.t('b04.demo.ui.liquidTemp'));
        await d.simUntil(() => bw(d).bio.vessels.bk1.tK >= 303.15, 700, 30);
        await act(d, 'hp1', { type: 'setHotplatePower', plateId: 'hp1', on: false });
        await waitSim(d, 60);
        d.note(null);
        await act(d, 'bk1', { type: 'readInstrument', instrument: 'thermo', targetId: 'bk1' });
        await act(d, 'bk1', { type: 'labelVessel', vesselId: 'bk1', label: 'P1' });
      },
    },
    {
      part: 'A', key: 'prepP2',
      run: async (d) => {
        d.station('A');
        await place(d, 'liv', 'bal', BALANCE_POS, GEO_B04.balance.h + 0.3);
        res.massId = (await act(d, 'bal', { type: 'readInstrument', instrument: 'balance', targetId: 'bal' })).id ?? '';
        await place(d, 'liv', 'cb', BOARD_B04, BOARD_B04.z);
        await act(d, 'liv', { type: 'cutTissue', sampleId: 'liv', toolId: 'sc', cutSizeCm: 0.5 });
        await pour(d, 'bW', 'g100', 25);
        await emptyInto(d, 'g100', 'bk2');
        await act(d, 'liv', { type: 'addTissue', sampleId: 'liv', vesselId: 'bk2' });
        await onPlate(d, 'bk2', 'hp2', 'sb2', 400);
        await waitSim(d, 300, 30);
        await act(d, 'bk2', { type: 'labelVessel', vesselId: 'bk2', label: 'P2' });
      },
    },
    {
      part: 'B', key: 'assays',
      run: async (d) => {
        d.station('C');
        // El baño de Benedict se enciende primero: tarda en llegar a la consigna.
        await act(d, 'ba1', { type: 'setBathSetpoint', bathId: 'ba1', temperatureK: 368.15 });
        await act(d, 'ba1', { type: 'setBathPower', bathId: 'ba1', on: true });
        d.station('B');
        for (const x of ASSAY_TUBES) await act(d, x.tube, { type: 'labelVessel', vesselId: x.tube, label: `${x.assay}/${LOT_CODE[x.lot]}` }, 0.2);
        for (const x of ASSAY_TUBES) {
          const src = x.lot === 'P1' ? 'bk1' : x.lot;
          await pipette(d, src, x.tube, x.assay === 'EMU' ? 0.5 : 2);
        }
        for (const x of ASSAY_TUBES.filter((q) => q.assay === 'LUG')) {
          await drops(d, 'dI', x.tube, 3);
          await mix(d, x.tube);
        }
        for (const x of ASSAY_TUBES.filter((q) => q.assay === 'BIU')) {
          await drops(d, 'dNa', x.tube, 10);
          await drops(d, 'dCu', x.tube, 3);
          await mix(d, x.tube);
        }
        // Emulsión: etanol con el tubo tapado y agitado; luego agua.
        for (const x of ASSAY_TUBES.filter((q) => q.assay === 'EMU')) {
          await pipette(d, 'bEt', x.tube, 3);
          await act(d, x.tube, { type: 'capTube', tubeId: x.tube, capped: true });
          await mix(d, x.tube, 20);
          await act(d, x.tube, { type: 'capTube', tubeId: x.tube, capped: false });
          await pipette(d, 'bW', x.tube, 3);
          await mix(d, x.tube);
        }
        // La emulsión se lee enseguida, antes de que las fases se separen.
        const emu: Record<string, string> = {};
        for (const x of ASSAY_TUBES.filter((q) => q.assay === 'EMU')) emu[x.tube] = await readEye(d, x.tube);
        d.station('C');
        for (const x of ASSAY_TUBES.filter((q) => q.assay === 'BEN')) {
          await pipette(d, 'bBe', x.tube, 2);
          await mix(d, x.tube);
        }
        await d.simUntil(() => bw(d).bio.baths.ba1.readyAt !== null, 900, 30);
        for (const x of ASSAY_TUBES.filter((q) => q.assay === 'BEN')) await act(d, 'tg', { type: 'tongs', tubeId: x.tube, to: 'ba1', depth01: 1 });
        await waitSim(d, BENEDICT_BATH_S, 20);
        for (const x of ASSAY_TUBES.filter((q) => q.assay === 'BEN')) await act(d, 'tg', { type: 'tongs', tubeId: x.tube, to: 'home' });
        d.note(d.hooks.t('b04.demo.ui.coolBeforeRead'));
        await waitSim(d, BENEDICT_COOL_S, 30);
        d.note(null);
        d.station('B');
        for (const x of ASSAY_TUBES) {
          const id = emu[x.tube] ?? (await readEye(d, x.tube));
          const q = bw(d).bio.readings[id]?.quality ?? '';
          const pos = POSITIVE.test(q) && x.lot !== 'bW';
          res.assays.push({ label: `${x.assay}/${LOT_CODE[x.lot]}`, id, result: pos ? 'positive' : 'negative', molecule: pos ? MOLECULE[x.assay] : 'none' });
        }
        // Tubos leídos a residuos químicos (cobre, yodo, etanol).
        for (const x of ASSAY_TUBES) await act(d, x.tube, { type: 'disposeVessel', vesselId: x.tube, wasteId: 'cw' }, 0.15);
      },
    },
    {
      part: 'D', key: 'feulgen',
      run: async (d) => {
        d.station('D');
        d.dispatch({ type: 'openSlideCase', open: true });
        // Frotis sin teñir por los cuatro frascos: fijar → hidrolizar → lavar → Schiff, con los tiempos de cada uno.
        const f = fp(d).feulgen;
        const times: Record<(typeof STAIN_JARS)[number], number> = { jFix: f.fixMinS + 5, jHcl: f.hydroMinS + 30, jWash: f.washMinS + 5, jSch: f.schiffMinS + 10 };
        for (const j of STAIN_JARS) {
          await place(d, 'fxU', j, STAIN_JAR_POS[j], 2);
          await waitSim(d, times[j], 30);
        }
        d.note(d.hooks.t('b04.demo.ui.feulgenControl'));
        await d.wait(2);
        d.note(null);
        res.feulgen.push(await observe(d, 'fxU'));
        res.feulgen.push(await observe(d, 'fxN'));
        d.dispatch({ type: 'openSlideCase', open: false });
      },
    },
    {
      part: 'C', key: 'catalase',
      run: async (d) => {
        d.station('E');
        await act(d, 'ba2', { type: 'setBathSetpoint', bathId: 'ba2', temperatureK: 368.15 });
        await act(d, 'ba2', { type: 'setBathPower', bathId: 'ba2', on: true });
        // Extracto hervido: el tubo se calienta en el baño con la pinza y se enfría antes del peróxido.
        await act(d, 'D3', { type: 'labelVessel', vesselId: 'D3', label: 'CAT/P2-95' });
        await pipette(d, 'bk2', 'D3', 1);
        await d.simUntil(() => bw(d).bio.baths.ba2.readyAt !== null, 900, 30);
        await act(d, 'tg', { type: 'tongs', tubeId: 'D3', to: 'ba2', depth01: 1 });
        await waitSim(d, 300, 30);
        // El pretratamiento queda registrado: temperatura del extracto en el baño.
        await act(d, 'D3', { type: 'readInstrument', instrument: 'thermo', targetId: 'D3' });
        await act(d, 'tg', { type: 'tongs', tubeId: 'D3', to: 'home' });
        await act(d, 'ba2', { type: 'setBathPower', bathId: 'ba2', on: false });
        await waitSim(d, 600, 30);
        // Mismo volumen y peróxido en cada tubo (hígado crudo, blanco, hervido y papa); gas con colector sellado a 60 s.
        const runs: Array<[string, string, string]> = [['D1', 'CAT/P2', 'bk2'], ['D2', 'CAT/L-AGU', 'bW'], ['D3', '', ''], ['D4', 'CAT/L-PAP', 'sPot']];
        for (const [tube, lbl, src] of runs) {
          if (lbl) {
            await act(d, tube, { type: 'labelVessel', vesselId: tube, label: lbl });
            await pipette(d, src, tube, 1);
          }
          await act(d, tube, { type: 'connectCollector', tubeId: tube, sealed: true });
          await act(d, tube, { type: 'startTimer', tubeId: tube });
          await pipette(d, 'bH', tube, 2);
          await waitSim(d, 60, 10);
          const id = (await act(d, tube, { type: 'readInstrument', instrument: 'gas', targetId: tube })).id ?? '';
          res.gas.push({ id, condition: bw(d).bio.tubes[tube].condition ?? '' });
          await act(d, tube, { type: 'disconnectCollector', tubeId: tube });
        }
      },
    },
    {
      part: 'C', key: 'amylase',
      run: async (d) => {
        d.station('A');
        // P1 deja la placa 1 (sin barra) para preparar P3 sin calor.
        await act(d, 'hp1', { type: 'setStirRate', plateId: 'hp1', rpm: 0 });
        await act(d, 'sb1', { type: 'retrieveStirBar', barId: 'sb1' });
        await place(d, 'bk1', 'bench', BEAKER_POS.bk1);
        await pour(d, 'bW', 'g10', 5);
        await emptyInto(d, 'g10', 'bk3');
        await weigh(d, 'jAm', 0.2);
        await act(d, 'bt', { type: 'emptyBoat', targetId: 'bk3' });
        d.dispatch({ type: 'dryTool', toolId: 'bt' });
        await onPlate(d, 'bk3', 'hp1', 'sb3', 300);
        await waitSim(d, 180, 30);
        await act(d, 'bk3', { type: 'labelVessel', vesselId: 'bk3', label: 'P3' });
        d.station('E');
        // Control sin enzima: almidón del mismo lote con Lugol, leído junto a las alícuotas.
        await act(d, 'D5', { type: 'labelVessel', vesselId: 'D5', label: 'LUG/P1' });
        await pipette(d, 'bk1', 'D5', 1);
        await act(d, 'D6', { type: 'labelVessel', vesselId: 'D6', label: 'AMY/P1' });
        await pipette(d, 'bk1', 'D6', 3);
        res.amy.ph = (await act(d, 'D6', { type: 'usePhStrip', vesselId: 'D6' })).id ?? '';
        await act(d, 'D6', { type: 'startTimer', tubeId: 'D6' });
        await pipette(d, 'bk3', 'D6', 1);
        await waitSim(d, fp(d).incubationS + 5, 30);
        // Alícuotas separadas: una para Lugol y otra para Benedict (nunca ambos reactivos en el mismo tubo).
        await act(d, 'D7', { type: 'labelVessel', vesselId: 'D7', label: 'LUG/P3' });
        await pipette(d, 'D6', 'D7', 1);
        await act(d, 'D8', { type: 'labelVessel', vesselId: 'D8', label: 'BEN/P3' });
        await pipette(d, 'D6', 'D8', 1);
        for (const tube of ['D5', 'D7']) {
          await drops(d, 'dI', tube, 3);
          await mix(d, tube);
        }
        await pipette(d, 'bBe', 'D8', 2);
        await mix(d, 'D8');
        await act(d, 'tg', { type: 'tongs', tubeId: 'D8', to: 'ba1', depth01: 1 });
        await waitSim(d, BENEDICT_BATH_S, 20);
        await act(d, 'tg', { type: 'tongs', tubeId: 'D8', to: 'home' });
        await act(d, 'ba1', { type: 'setBathPower', bathId: 'ba1', on: false });
        await waitSim(d, BENEDICT_COOL_S, 30);
        res.amy.control = await readEye(d, 'D5');
        res.amy.lugol = await readEye(d, 'D7');
        res.amy.benedict = await readEye(d, 'D8');
      },
    },
    {
      part: 'F', key: 'record',
      run: async (d) => {
        const w = bw(d);
        const r = (id: string) => w.bio.readings[id];
        ui.notebook(true, 'inventory');
        ui.edit((nb) => {
          const role = { 'L-AGU': 'negative', 'L-PRO': 'positive', 'L-GLU': 'positive', 'L-ACE': 'positive', P1: 'positive' } as const;
          nb.inventory.rows = nb.inventory.rows.map((row) => ({ ...row, role: role[row.lot as keyof typeof role] ?? 'sample', initialReadingId: res.assays.find((a) => a.label.endsWith(`/${row.lot}`))?.id ?? null }));
          nb.inventory.massReadingId = res.massId || null;
          nb.inventory.uncertainty = '±0,1 g en la balanza; ±0,5 mL en la probeta';
        });
        await d.wait(1.4);
        ui.notebook(true, 'assays');
        ui.edit((nb) => {
          nb.assays.rows = res.assays.map((a) => ({ label: a.label, readingId: a.id || null, result: a.result, molecule: a.molecule }));
        });
        await d.wait(1.4);
        ui.notebook(true, 'feulgen');
        ui.edit((nb) => {
          nb.feulgen.rows = res.feulgen.map((id, i) => ({
            observationId: id || null, structures: i === 0 ? ['epithelialCells', 'nucleus', 'dnaStain'] : ['epithelialCells', 'nucleus'], dnaClaim: i === 0,
            comment: i === 0 ? 'Núcleos magenta tras hidrólisis y Schiff; el citoplasma queda pálido.' : 'Sin hidrólisis los núcleos no toman color: el magenta del frotis teñido depende de la hidrólisis.',
          }));
        });
        await d.wait(1.4);
        ui.notebook(true, 'catalase');
        ui.edit((nb) => {
          nb.catalase.rows = res.gas.map((g) => ({ readingId: g.id || null, condition: g.condition, normalized: r(g.id) && r(res.massId) ? (r(g.id).value / Math.max(1e-6, r(res.massId).value)).toFixed(2).replace('.', ',') : '' }));
          nb.catalase.liverMassReadingId = res.massId || null;
          nb.catalase.normalizedBy = 'mass';
          nb.catalase.claim = 'heatInactivates';
          nb.catalase.conclusion = 'El extracto crudo liberó O₂ y el hervido casi nada; el blanco de agua no dio gas: la catalasa se desnaturaliza con el calor.';
        });
        await d.wait(1.4);
        ui.notebook(true, 'amylase');
        ui.edit((nb) => {
          nb.amylase = {
            lugolReadingId: res.amy.lugol || null, benedictReadingId: res.amy.benedict || null, controlReadingId: res.amy.control || null, phReadingId: res.amy.ph || null,
            claim: 'partial', basis: 'both',
            conclusion: 'Tras la incubación el Lugol vira menos que el control y Benedict da precipitado: el almidón se hidrolizó a azúcares reductores.',
          };
        });
        await d.wait(1.4);
        ui.notebook(true, 'synthesis');
        ui.edit((nb) => {
          nb.comparison = {
            energy: 'Almidón y lípidos son reservas de energía; la glucosa es la forma que se usa de inmediato.',
            structure: 'Las proteínas forman estructuras y enzimas como la catalasa y la amilasa.',
            information: 'El ADN, visto en los núcleos por Feulgen, guarda la información hereditaria.',
          };
        });
        await d.wait(1.6);
        ui.notebook(false);
      },
    },
    {
      part: 'F', key: 'close',
      run: async (d) => {
        d.station('A');
        // Placas apagadas, barras fuera, beakers y tubos a residuos; la pipeta vacía.
        for (const p of ['hp1', 'hp2'] as const) await act(d, p, { type: 'setStirRate', plateId: p, rpm: 0 });
        for (const b of ['sb2', 'sb3'] as const) await act(d, b, { type: 'retrieveStirBar', barId: b });
        for (const bk of ['bk1', 'bk2', 'bk3']) await act(d, bk, { type: 'disposeVessel', vesselId: bk, wasteId: 'cw' }, 0.2);
        d.station('E');
        for (const tube of ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8']) await act(d, tube, { type: 'disposeVessel', vesselId: tube, wasteId: 'cw' }, 0.15);
        d.station('D');
        await part(d, 'mic', 'power');
        d.station('F');
        ui.notebook(true, 'synthesis');
        d.dispatch({ type: 'closeBench' });
        await d.wait(2.4);
        ui.notebook(false);
      },
    },
  ];
}
