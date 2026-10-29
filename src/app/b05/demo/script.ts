/**
 * Guion de la demostración de B05 (§16): la MANO VIRTUAL revisa residuos y EPP; prepara P2 (hígado troceado, pesado
 * y agitado SIN calor), P1 (almidón, agua medida con la probeta a la altura del menisco, placa a ~30 °C y lectura del
 * termómetro) y P3 (amilasa); conecta el colector, pone a cero el cronómetro y mide la catalasa (línea base cada 15 s
 * y blanco sin enzima, con el ojo a la altura del menisco); calienta un extracto en el baño hirviente para el
 * tratamiento térmico; incuba almidón con amilasa a 37 °C, toma alícuotas a 0/120/300/600 s reveladas con Lugol y dos
 * con Benedict en el baño caliente, con su control sin amilasa; monta papa con Lugol y la observa 4X → 10X → 40X;
 * completa la libreta con SUS lecturas, descarta por clase y cierra el puesto. Acelera el tiempo solo en las esperas
 * sin manipulación precisa. Los gestos usan los mismos comandos públicos que el panel de acciones. No marca etapas,
 * no genera nota ni se guarda. Textos en `b05.demo.steps.<clave>`.
 */
import type { DemoDirectorB05, DemoStepB05 } from './director';
import type { B05Notebook } from '../../../practices/practice-b05/notebook';
import type { EnzCommand } from '../../../simulation/enz-world/commands';
import type { EnzWorld } from '../../../simulation/enz-world/types';
import type { EnzController } from '../../../engine/optical/enzController';
import { microscopeView } from '../../../simulation/optical-world/world';
import { CLEAN_TRAY, COVER_BOX, PREP_SPOT, STAGE_SEAT } from '../../../simulation/optical-world/geometry';
import { BALANCE_POS, PLATE_POS } from '../../../simulation/enz-world/geometry';
import { gasMol } from '../../../simulation/enz-world/kinetics';
import { wasteClassOf } from '../../../simulation/enz-world/world';

const WASTE_OF = { aq: 'wAq', cu: 'wCu', bio: 'wBio' } as const;
import type { KnobB01 as KnobB05 } from '../../../engine/optical/controller';
import { KIN, type PartGrip } from '../../../engine/optical/parts';

export interface DemoUiHooksB05 {
  notebook(open: boolean, tab?: string): void;
  edit(fn: (nb: B05Notebook) => void): void;
}

interface DemoRes {
  prep: Partial<Record<'p1Mass' | 'p1Water' | 'p1Temp' | 'p2Water' | 'p3Mass' | 'p3Water', string>>;
  gas: Record<string, string[]>;
  amy: Record<string, string>;
  potato: string;
  liverG: number;
  ph: string;
}

const ew = (d: DemoDirectorB05) => d.w as EnzWorld;
const ctl = (d: DemoDirectorB05) => d.c as unknown as EnzController;
const last = (d: DemoDirectorB05) => d.w.observationOrder[d.w.observationOrder.length - 1];
const D = (d: DemoDirectorB05, c: EnzCommand) => d.dispatch(c);
const readId = (_d: DemoDirectorB05, r: ReturnType<EnzController['read']>) => (r?.ok && r.id ? r.id : '');
const fmt = (v: number, n = 2) => v.toFixed(n).replace('.', ',');

// ───────────── Microscopio (como B02/B03) ─────────────

async function part(d: DemoDirectorB05, id: string, p: string) {
  d.pointPart(id, p);
  await d.wait(0.4);
  d.c.instrumentPart(id, p);
  d.endPress();
}

const rotary = (axis: PartGrip['axis']): PartGrip => ({ kind: 'rotary', axis });
const PIECE: Partial<Record<KnobB05, { id: string; part: string; grip: PartGrip; rad: number }>> = {
  'mic:coarse': { id: 'mic', part: 'coarse', grip: rotary('x'), rad: 0.1 * KIN.radPerTurn },
  'mic:fine': { id: 'mic', part: 'fine', grip: rotary('x'), rad: 0.05 * KIN.radPerTurn },
  'mic:diaphragm': { id: 'mic', part: 'diaphragm', grip: { kind: 'lever', axis: 'y' }, rad: 0.02 * KIN.irisRadPer01 },
  'mic:turret': { id: 'mic', part: 'turret', grip: rotary('y'), rad: 12 * KIN.turretRadPerDeg },
};

async function hold(d: DemoDirectorB05, knob: KnobB05, fn: (step: (dir: number, big?: boolean) => void) => Promise<void>) {
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

async function turn(d: DemoDirectorB05, knob: KnobB05, dir: 1 | -1, n: number, big = false) {
  const steps = knob === 'mic:turret' ? n * 10 : n;
  const k = knob === 'mic:turret' ? d.w.params.microscope.turretDetentDeg / 120 : 1;
  await hold(d, knob, async (step) => {
    for (let i = 0; i < steps; i++) {
      step(dir * k, big);
      await d.wait(0.06);
    }
  });
}

async function lever(d: DemoDirectorB05, open: boolean) {
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

async function focusCompound(d: DemoDirectorB05) {
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

async function capture(d: DemoDirectorB05) {
  if (d.w.view.instrument === null) d.c.toggleEyepiece('compound');
  await d.wait(d.w.params.observationHoldS + 0.4);
  d.c.onKeyDown('c', false);
  await d.wait(0.4);
  return last(d);
}

async function toolAt(d: DemoDirectorB05, tool: string, x: number, y: number, strong = false) {
  if (d.c.held?.id !== tool && !(await d.grab(tool))) return;
  await d.moveTo(x, y);
  await d.wait(0.3);
  d.c.primary(strong);
  await d.wait(0.5);
}

async function putDown(d: DemoDirectorB05, x: number, y: number) {
  if (!d.c.held) return;
  await d.moveTo(x, y);
  await d.release();
}

// ───────────── Gestos de B05 ─────────────

/** Vierte con la mano sobre el destino hasta que reciba `ml` (P para empezar, P para cortar). */
async function pour(d: DemoDirectorB05, source: string, target: string, ml: number) {
  const v = () => ew(d).enz.vessels[target];
  const goal = v().volumeMl + ml;
  const home = { ...d.w.objects[source].pose };
  const to = d.w.objects[target].pose;
  await toolAt(d, source, to.x, to.y);
  await d.until(() => v().volumeMl >= goal - 0.4 || !ew(d).enz.pours[source], 240);
  // Si el chorro se cortó antes (frasco poco inclinado), se vuelve a verter hasta el aforo.
  for (let k = 0; k < 6 && v().volumeMl < goal - 0.4 && !ew(d).enz.pours[source]; k++) {
    D(d, { type: 'startPour', sourceId: source, targetId: target, tiltDeg: 70 });
    await d.until(() => v().volumeMl >= goal - 0.4 || !ew(d).enz.pours[source], 240);
  }
  // Últimos mililitros con caudal fino (como el test: menos inclinación cerca del aforo).
  if (ew(d).enz.pours[source]) {
    D(d, { type: 'stopPour', sourceId: source });
    D(d, { type: 'startPour', sourceId: source, targetId: target, tiltDeg: 40 });
    await d.until(() => v().volumeMl >= goal - 1e-3 || !ew(d).enz.pours[source], 120);
    if (ew(d).enz.pours[source]) D(d, { type: 'stopPour', sourceId: source });
  }
  await d.wait(0.3);
  await putDown(d, home.x, home.y);
}

/** Vacía todo un recipiente en otro (probeta → beaker). */
async function emptyInto(d: DemoDirectorB05, source: string, target: string) {
  const home = { ...d.w.objects[source].pose };
  const to = d.w.objects[target].pose;
  if (!(await d.grab(source))) return;
  await d.moveTo(to.x, to.y);
  d.c.primary(true);
  await d.until(() => !ew(d).enz.pours[source], 40);
  await putDown(d, home.x, home.y);
}

/** Lectura de volumen con la cámara a la altura del menisco (sin paralaje). */
async function readLevel(d: DemoDirectorB05, target: string) {
  d.lab.camera?.eyeLevel(target);
  await d.wait(1.2);
  return readId(d, ctl(d).read(target === 'gc' ? 'collector' : 'scale', target));
}

/** Pipetea con los mismos comandos del panel: aspira, descarga y enjuaga. */
async function pipette(d: DemoDirectorB05, tool: string, from: string, to: string, ml: number) {
  await d.press(tool, undefined, 0.25);
  D(d, { type: 'aspirate', toolId: tool, sourceId: from, volumeMl: ml, speed01: 0.4 });
  await d.wait(0.25);
  D(d, { type: 'dispense', toolId: tool, targetId: to });
  await d.wait(0.25);
  D(d, { type: 'rinseTool', toolId: tool });
  d.endPress();
}

/** Bote a la balanza, tara, polvo con la espátula hasta la masa, lectura y trasvase al beaker. */
async function weigh(d: DemoDirectorB05, jar: string, g: number, beaker: string) {
  if (d.w.objects.wb.support !== 'bal') await d.carry('wb', BALANCE_POS.x, BALANCE_POS.y);
  await d.press('bal', undefined, 0.3);
  D(d, { type: 'tare', balanceId: 'bal' });
  let left = g / 0.99 / 0.995;
  while (left > 1e-6) {
    const take = Math.min(15, left);
    D(d, { type: 'scoop', toolId: 'sp2', sourceId: jar, massG: take });
    D(d, { type: 'transferSolid', fromId: 'sp2', toId: 'wb' });
    left -= take;
    await d.wait(0.3);
  }
  const id = readId(d, ctl(d).read('balance', 'bal'));
  D(d, { type: 'transferSolid', fromId: 'wb', toId: beaker });
  D(d, { type: 'rinseTool', toolId: 'sp2' });
  D(d, { type: 'rinseTool', toolId: 'wb' });
  d.endPress();
  return id;
}

/** Beaker a la placa con la mano, pastilla y agitación (y calor si se pide). */
async function stirOn(d: DemoDirectorB05, beaker: string, plate: string, bar: string, rpm: number, heatK?: number) {
  await d.carry(beaker, PLATE_POS[plate].x, PLATE_POS[plate].y);
  await d.press(plate, undefined, 0.3);
  D(d, { type: 'insertStirBar', barId: bar, vesselId: beaker });
  D(d, { type: 'setStir', plateId: plate, rpm });
  if (heatK) D(d, { type: 'setHeat', plateId: plate, on: true, setpointK: heatK });
  d.endPress();
}

/** Serie del colector: lee cada `every` s del cronómetro (ojo a la altura del menisco) acelerando la espera. */
async function gasSeries(d: DemoDirectorB05, n: number, every: number) {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    if (i > 0) {
      const t0 = d.w.timeS;
      await d.simUntil(() => d.w.timeS - t0 >= every, every, 6);
    }
    out.push(await readLevel(d, 'gc'));
  }
  return out;
}

/** Tubo de catalasa: rótulo, extracto (o agua), colector a cero, cronómetro y 10,00 mL de peróxido. */
async function catalaseTube(d: DemoDirectorB05, tube: string, label: string, from: string) {
  d.station('D');
  await d.press(tube, undefined, 0.3);
  D(d, { type: 'labelTube', tubeId: tube, label });
  await pipette(d, 'p5', from, tube, 2);
  D(d, { type: 'resetCollector' });
  D(d, { type: 'setCollector', tubeId: tube, seal01: 1 });
  D(d, { type: 'clock', clockId: 'sw1', action: 'reset' });
  D(d, { type: 'clock', clockId: 'sw1', action: 'start' });
  await pipette(d, 'p10', 'hp', tube, 10);
}

async function lugol(d: DemoDirectorB05, tube: string) {
  const home = { ...d.w.objects.dL.pose };
  const o = d.w.objects[tube].pose;
  for (let k = 0; k < 3; k++) await toolAt(d, 'dL', o.x, o.y);
  await putDown(d, home.x, home.y);
  return readId(d, ctl(d).read('eye', tube));
}

export function buildDemoScriptB05(ui: DemoUiHooksB05): DemoStepB05[] {
  const res: DemoRes = { prep: {}, gas: {}, amy: {}, potato: '', liverG: 1, ph: '' };
  return [
    {
      part: 'A', key: 'safety',
      run: async (d) => {
        d.station('A');
        for (const id of ['wAq', 'wCu', 'wBio', 'glassBin', 'bioWaste']) {
          await d.press(id, undefined, 0.4);
          D(d, { type: 'inspect', target: id });
        }
        d.endPress();
        // Baños encendidos al principio: tardan en estabilizarse (37 °C para la amilasa, hirviente para Benedict).
        d.station('C');
        for (const b of ['wb1', 'wb2']) {
          await d.press(b, undefined, 0.4);
          D(d, { type: 'setBath', bathId: b, on: true });
        }
        d.endPress();
      },
    },
    {
      part: 'B', key: 'starch',
      run: async (d) => {
        d.station('B');
        await pour(d, 'bW', 'g100', 100);
        res.prep.p1Water = await readLevel(d, 'g100');
        await emptyInto(d, 'g100', 'bk1');
        res.prep.p1Mass = await weigh(d, 'jS', 25, 'bk1');
        await stirOn(d, 'bk1', 'hp1', 'sb1', 500, 305.15);
        await d.simUntil(() => (ew(d).enz.batches.P1?.stirredS ?? 0) >= 300, 320, 20);
        res.prep.p1Temp = readId(d, ctl(d).read('thermo', 'bk1'));
      },
    },
    {
      part: 'B', key: 'amylase',
      run: async (d) => {
        d.station('B');
        await pour(d, 'bW', 'g10', 5);
        res.prep.p3Water = await readLevel(d, 'g10');
        await emptyInto(d, 'g10', 'bk2');
        res.prep.p3Mass = await weigh(d, 'jA', 0.2, 'bk2');
        await stirOn(d, 'bk2', 'hp2', 'sb2', 300);
        await d.simUntil(() => (ew(d).enz.batches.P3?.stirredS ?? 0) >= 120, 140, 20);
        // La amilasa queda disuelta; la placa 2 se libera para el extracto, que debe seguir agitándose mientras se usa.
        await d.press('hp2', undefined, 0.3);
        D(d, { type: 'setStir', plateId: 'hp2', rpm: 0 });
        D(d, { type: 'removeStirBar', barId: 'sb2' });
        d.endPress();
        await d.carry('bk2', 384, 60);
      },
    },
    {
      part: 'B', key: 'liver',
      run: async (d) => {
        d.station('B');
        await pour(d, 'bW', 'g25', 25);
        res.prep.p2Water = await readLevel(d, 'g25');
        await emptyInto(d, 'g25', 'bk3');
        const liv = d.w.objects.liv.pose;
        ctl(d).massG = 1;
        await toolAt(d, 'ls', liv.x, liv.y);
        const bd = d.w.objects.bdL.pose;
        await d.moveTo(bd.x, bd.y);
        for (let i = 0; i < 3; i++) {
          d.c.primary(false);
          await d.wait(0.35);
        }
        await putDown(d, bd.x + 9, bd.y + 4);
        await d.carry('wb', BALANCE_POS.x, BALANCE_POS.y);
        D(d, { type: 'tare', balanceId: 'bal' });
        D(d, { type: 'transferSolid', fromId: 'bdL', toId: 'wb' });
        const r = ctl(d).read('balance', 'bal');
        res.liverG = r?.ok && typeof r.value === 'number' ? r.value : 1;
        D(d, { type: 'transferSolid', fromId: 'wb', toId: 'bk3' });
        // Sin calor: la catalasa del hígado se desnaturaliza por encima de ~50 °C.
        await stirOn(d, 'bk3', 'hp2', 'sb2', 400);
        await d.simUntil(() => (ew(d).enz.batches.P2?.stirredS ?? 0) >= 240, 260, 20);
      },
    },
    {
      part: 'C', key: 'catalaseBase',
      run: async (d) => {
        await catalaseTube(d, 't1', 'cat-base', 'bk3');
        res.gas['cat-base'] = await gasSeries(d, 4, 30);
        D(d, { type: 'clock', clockId: 'sw1', action: 'stop' });
      },
    },
    {
      part: 'C', key: 'catalaseBlank',
      run: async (d) => {
        await catalaseTube(d, 't2', 'cat-blank', 'bW');
        res.gas['cat-blank'] = await gasSeries(d, 4, 30);
        D(d, { type: 'clock', clockId: 'sw1', action: 'stop' });
      },
    },
    {
      part: 'D', key: 'catalaseHeat',
      run: async (d) => {
        d.station('C');
        await d.press('t3', undefined, 0.3);
        D(d, { type: 'labelTube', tubeId: 't3', label: 'cat-heat' });
        await pipette(d, 'p5', 'bk3', 't3', 2);
        // Al baño hirviente y de vuelta SIEMPRE con la pinza (tubo caliente).
        D(d, { type: 'tongs', tubeId: 't3', to: 'wb2', depth01: 1 });
        const t0 = d.w.timeS;
        await d.simUntil(() => d.w.timeS - t0 >= 300, 300, 30);
        D(d, { type: 'tongs', tubeId: 't3', to: 'rack' });
        await d.simUntil(() => ew(d).enz.vessels.t3.tK < 303, 600, 30);
        D(d, { type: 'resetCollector' });
        D(d, { type: 'setCollector', tubeId: 't3', seal01: 1 });
        D(d, { type: 'clock', clockId: 'sw1', action: 'reset' });
        D(d, { type: 'clock', clockId: 'sw1', action: 'start' });
        await pipette(d, 'p10', 'hp', 't3', 10);
        res.gas['cat-heat'] = await gasSeries(d, 4, 30);
        D(d, { type: 'clock', clockId: 'sw1', action: 'stop' });
      },
    },
    {
      part: 'D', key: 'catalaseAcid',
      run: async (d) => {
        d.station('E');
        await d.press('t4', undefined, 0.3);
        D(d, { type: 'labelTube', tubeId: 't4', label: 'cat-acid' });
        await pipette(d, 'p5', 'bk3', 't4', 2);
        const o = d.w.objects.t4.pose;
        const home = { ...d.w.objects.dH.pose };
        for (let k = 0; k < ew(d).params.enz!.acidDropsAssigned; k++) await toolAt(d, 'dH', o.x, o.y);
        await putDown(d, home.x, home.y);
        D(d, { type: 'shake', targetId: 't4', strength01: 0.5 });
        await d.wait(1);
        res.ph = D(d, { type: 'dipStrip', targetId: 't4' }).id ?? '';
        d.station('D');
        D(d, { type: 'resetCollector' });
        D(d, { type: 'setCollector', tubeId: 't4', seal01: 1 });
        D(d, { type: 'clock', clockId: 'sw1', action: 'reset' });
        D(d, { type: 'clock', clockId: 'sw1', action: 'start' });
        await pipette(d, 'p10', 'hp', 't4', 10);
        res.gas['cat-acid'] = await gasSeries(d, 4, 30);
        D(d, { type: 'clock', clockId: 'sw1', action: 'stop' });
        D(d, { type: 'setCollector', tubeId: null });
      },
    },
    {
      part: 'E', key: 'amyIncubation',
      run: async (d) => {
        d.station('E');
        await d.press('t9', undefined, 0.3);
        D(d, { type: 'labelTube', tubeId: 't9', label: 'amy' });
        D(d, { type: 'labelTube', tubeId: 't10', label: 'amy-ctrl' });
        await pipette(d, 'p1', 'bk1', 't9', 1);
        await pipette(d, 'p5', 'bW', 't9', 3);
        await pipette(d, 'p1', 'bk1', 't10', 1);
        await pipette(d, 'p5', 'bW', 't10', 4);
        D(d, { type: 'tongs', tubeId: 't9', to: 'wb1' });
        D(d, { type: 'tongs', tubeId: 't10', to: 'wb1' });
        // Equilibrar la temperatura antes de agregar la enzima.
        const t0 = d.w.timeS;
        await d.simUntil(() => d.w.timeS - t0 >= 60, 60, 15);
        D(d, { type: 'clock', clockId: 'sw2', action: 'reset' });
        D(d, { type: 'clock', clockId: 'sw2', action: 'start' });
        await pipette(d, 'p1', 'bk2', 't9', 1);
        D(d, { type: 'shake', targetId: 't9', strength01: 0.5 });
      },
    },
    {
      part: 'E', key: 'amyAliquots',
      run: async (d) => {
        d.station('E');
        const L = ['t11', 't12', 't13', 't14'];
        const hotSince: Record<string, number> = {};
        const outOfBath = async (dd: DemoDirectorB05, b: string, k: string) => {
          await dd.simUntil(() => dd.w.timeS - hotSince[b] >= 200, 220, 30);
          D(dd, { type: 'tongs', tubeId: b, to: 'rack' });
          res.amy[k] = readId(dd, ctl(dd).read('eye', b));
        };
        const times = [0, 120, 300, 600];
        for (let i = 0; i < 4; i++) {
          await d.simUntil(() => (ew(d).enz.tubes.t9.contactAt !== null ? d.w.timeS - ew(d).enz.tubes.t9.contactAt! : 0) >= times[i] + 2, times[i] + 4, 30);
          D(d, { type: 'shake', targetId: 't9', strength01: 0.5 });
          D(d, { type: 'labelTube', tubeId: L[i], label: `L${i}` });
          await pipette(d, 'p1', 't9', L[i], 0.5);
          res.amy[`L${i}`] = await lugol(d, L[i]);
          if (i === 0 || i === 3) {
            const b = i === 0 ? 't15' : 't16';
            D(d, { type: 'labelTube', tubeId: b, label: i === 0 ? 'B0' : 'B3' });
            await pipette(d, 'p1', 't9', b, 0.5);
            const o = d.w.objects[b].pose;
            const home = { ...d.w.objects.dB.pose };
            await toolAt(d, 'dB', o.x, o.y);
            await putDown(d, home.x, home.y);
            D(d, { type: 'tongs', tubeId: b, to: 'wb2' });
            hotSince[b] = d.w.timeS;
          }
          // Cada Benedict sale del baño hirviente a los ~3,5 min (ni crudo ni sobrecalentado) y se lee.
          if (i === 1) await outOfBath(d, 't15', 'B0');
        }
        await outOfBath(d, 't16', 'B3');
        D(d, { type: 'labelTube', tubeId: 't8', label: 'Lc' });
        await pipette(d, 'p1', 't10', 't8', 0.5);
        res.amy.Lc = await lugol(d, 't8');
      },
    },
    {
      part: 'F', key: 'potato',
      run: async (d) => {
        d.station('F');
        await d.carry('sl2', PREP_SPOT.x, PREP_SPOT.y);
        const pot = d.w.objects.pot.pose;
        await toolAt(d, 'sp', pot.x, pot.y);
        await d.moveTo(PREP_SPOT.x, PREP_SPOT.y);
        await d.wait(0.3);
        d.c.primary(false);
        await d.wait(0.4);
        await putDown(d, pot.x, pot.y - 8);
        // La espátula quedó con papa: se limpia con papel de lente antes de seguir.
        const sp = d.w.objects.sp.pose;
        const lpHome = { ...d.w.objects.lp.pose };
        await toolAt(d, 'lp', sp.x, sp.y);
        await putDown(d, lpHome.x, lpHome.y);
        const iod = { ...d.w.objects.iod.pose };
        await toolAt(d, 'iod', PREP_SPOT.x, PREP_SPOT.y);
        await putDown(d, iod.x, iod.y);
        await toolAt(d, 'fc', COVER_BOX.x, COVER_BOX.y);
        await d.moveTo(PREP_SPOT.x, PREP_SPOT.y);
        await d.wait(0.3);
        d.c.primary(false);
        await d.until(() => !d.c.lowering, 8);
        await putDown(d, COVER_BOX.x + 8, COVER_BOX.y);
        const need = (d.w.params.cellPrep?.lugolMinContactS ?? 20) + 2;
        await d.simUntil(() => (d.w.mounts.sl2?.cell?.contactS.lugol ?? 0) >= need, need + 10);
      },
    },
    {
      part: 'F', key: 'observePotato',
      run: async (d) => {
        d.station('F');
        if (microscopeView(d.w).objectiveX !== 4) await turn(d, 'mic:turret', -1, 1);
        await part(d, 'mic', 'power');
        await lever(d, true);
        await d.carry('sl2', STAGE_SEAT.x, STAGE_SEAT.y);
        await lever(d, false);
        d.c.checkSide();
        await d.wait(0.8);
        await part(d, 'mic', 'ocular');
        await focusCompound(d);
        await capture(d);
        await turn(d, 'mic:turret', 1, 1);
        await focusCompound(d);
        res.potato = await capture(d);
        await turn(d, 'mic:turret', -1, 1);
        d.c.toggleEyepiece('compound');
        await turn(d, 'mic:coarse', -1, Math.ceil(d.w.microscope.coarseTurns / 0.5) + 1, true);
        await lever(d, true);
        await d.carry('sl2', CLEAN_TRAY.x, CLEAN_TRAY.y);
      },
    },
    {
      part: 'G', key: 'notebook',
      run: async (d) => {
        ui.notebook(true, 'rate');
        const w = ew(d);
        const base = (res.gas['cat-base'] ?? []).map((id) => w.enz.readings[id]).filter(Boolean);
        const p = w.params.enz!;
        const lastMl = base.length ? base[base.length - 1].value : 0;
        const slope = base.length > 1 ? (base[1].value - base[0].value) / Math.max(1, (base[1].clockS ?? 30) - (base[0].clockS ?? 0)) : 0;
        const n = gasMol(lastMl, p.ambientK, p.pressureKPa) * 1000;
        ui.edit((nb) => {
          nb.hypothesis = { catalase: 'El hígado contiene catalasa: descompone el H₂O₂ en agua y O₂ medible.', amylase: 'La amilasa hidroliza el almidón: el Lugol pasa de azul negro a ámbar con el tiempo.', heat: 'lowers' };
          Object.assign(nb.prep, res.prep);
          nb.controls = { blank: 'cat-blank', active: 'cat-base', noEnzyme: 'amy-ctrl' };
          nb.gas = (['cat-base', 'cat-blank', 'cat-heat', 'cat-acid'] as const).map((label) => ({ label, readingIds: [0, 1, 2, 3].map((i) => res.gas[label]?.[i] ?? null) }));
          nb.rate = {
            ...nb.rate, label: 'cat-base', fromS: '0', toS: String(Math.round(base[1]?.clockS ?? 30)), rateMlS: fmt(slope, 3), rateMlMin: fmt(slope * 60, 2), nO2Mmol: fmt(n, 3),
            predictedO2Mmol: fmt((p.catalaseH2O2Ml * p.h2o2M) / 2, 2), ventedIncluded: 'no', attribution: 'catalysis', ratePerG: fmt((slope * 60) / Math.max(0.05, (res.liverG * 2) / 25), 2), normUnit: 'gTissue', uncertaintyMl: fmt(p.collector.resolutionMl, 1),
          };
          nb.factors = { heatApparent: 'El extracto hervido casi no libera gas: la catalasa se desnaturalizó.', recovered: 'no', attribution: 'temperature' };
          nb.amylase.rows = nb.amylase.rows.map((r) => ({ ...r, readingId: res.amy[r.label] ?? null, timeS: r.label.startsWith('L') ? String([0, 120, 300, 600][Number(r.label[1])] ?? '') : r.label === 'B0' ? '0' : r.label === 'B3' ? '600' : '' }));
          nb.amylase.benedictMeans = 'reducing';
          nb.amylase.lugolNegative = 'notComplete';
          nb.micro = { observationId: res.potato || null, structure: 'starchGranules' };
        });
        await d.wait(2.5);
        ui.notebook(false);
      },
    },
    {
      part: 'G', key: 'close',
      run: async (d) => {
        d.station('A');
        const E = ew(d).enz;
        for (const [id, t] of Object.entries(E.tubes)) {
          if (t.discarded || E.vessels[id].volumeMl < 0.05) continue;
          D(d, { type: 'discardLiquid', vesselId: id, wasteId: WASTE_OF[wasteClassOf(E.vessels[id])] });
          await d.wait(0.1);
        }
        for (const pl of ['hp1', 'hp2']) {
          D(d, { type: 'setHeat', plateId: pl, on: false });
          D(d, { type: 'setStir', plateId: pl, rpm: 0 });
        }
        for (const bar of ['sb1', 'sb2']) if (E.bars[bar]) D(d, { type: 'removeStirBar', barId: bar });
        for (const b of ['bk1', 'bk2', 'bk3']) if (E.vessels[b].volumeMl > 1e-6) D(d, { type: 'discardLiquid', vesselId: b, wasteId: WASTE_OF[wasteClassOf(E.vessels[b])] });
        for (const b of ['wb1', 'wb2']) D(d, { type: 'setBath', bathId: b, on: false });
        await part(d, 'mic', 'power');
        D(d, { type: 'closeBench' });
        await d.wait(1);
      },
    },
  ];
}
