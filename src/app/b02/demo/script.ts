/**
 * Guion de la demostración de B02 (§16): la MANO VIRTUAL sobre el controlador real prepara y observa Elodea, un raspado
 * de papa con Lugol (esperando el contacto), un corte fino de tomate y un frotis bucal con azul de metileno, con una
 * recuperación controlada (una cubierta bajada deprisa y casi plana deja aire, se levanta y se baja inclinada y lenta)
 * y las herramientas limpiadas entre muestras para no contaminar. Los mandos de los instrumentos se TOMAN y se GIRAN sobre su pivote por el mismo camino
 * que el ratón (`grabPart` / `dragPart` / `releasePart`, con la tabla `KIN`): el revólver gira de a poco y encaja en su
 * enclavamiento, la palanca de la pinza se empuja. Enfoca mirando (la nitidez que se ve por el ocular), no con un
 * valor oculto. No marca etapas, no genera nota ni se guarda. Textos en `b02.demo.steps.<clave>`.
 */
import type { DemoDirectorB02, DemoStepB02 } from './director';
import type { B02Notebook } from '../../../practices/practice-b02/notebook';
import { MICROSCOPE_PARTS } from '../../../simulation/instruments/optical/microscope-types';
import { microscopeView } from '../../../simulation/optical-world/world';
import { BIO_WASTE, CLEAN_TRAY, COVER_BOX, PREP_SPOT, STAGE_SEAT } from '../../../simulation/optical-world/geometry';
import { BOARD_POS, CHEEK_POS, PREP2_SPOT } from '../../../simulation/cell-world/geometry';
import type { KnobB01 as KnobB02 } from '../../../engine/optical/controller';
import { KIN, type PartGrip } from '../../../engine/optical/parts';

export interface DemoUiHooksB02 {
  notebook(open: boolean, tab?: string): void;
  edit(fn: (nb: B02Notebook) => void): void;
}

type DemoRes = Record<'elodea' | 'potato' | 'tomato' | 'buccal', string[]>;

const last = (d: DemoDirectorB02) => d.w.observationOrder[d.w.observationOrder.length - 1];

/** Parte de un instrumento que se pulsa (interruptor, ocular, tapa): la mano la señala y hace clic. */
async function part(d: DemoDirectorB02, id: string, p: string) {
  d.pointPart(id, p);
  await d.wait(0.4);
  d.c.instrumentPart(id, p);
  d.endPress();
}

const rotary = (axis: PartGrip['axis']): PartGrip => ({ kind: 'rotary', axis });
/** Pieza 3D de cada mando y su giro por paso de la mano (rad, el mismo paso que Q/E en unidades del dominio). */
const PIECE: Partial<Record<KnobB02, { id: string; part: string; grip: PartGrip; rad: number }>> = {
  'mic:coarse': { id: 'mic', part: 'coarse', grip: rotary('x'), rad: 0.1 * KIN.radPerTurn },
  'mic:fine': { id: 'mic', part: 'fine', grip: rotary('x'), rad: 0.05 * KIN.radPerTurn },
  'mic:diaphragm': { id: 'mic', part: 'diaphragm', grip: { kind: 'lever', axis: 'y' }, rad: 0.02 * KIN.irisRadPer01 },
  'mic:turret': { id: 'mic', part: 'turret', grip: rotary('y'), rad: 12 * KIN.turretRadPerDeg },
  'ste:zoom': { id: 'ste', part: 'zoom', grip: rotary('x'), rad: 0.1 * KIN.zoomRadPerX },
  'ste:focus': { id: 'ste', part: 'focus', grip: rotary('x'), rad: 0.25 * KIN.radPerTurn },
};

/** Toma la pieza del mando, la gira mientras dure `fn` (cada `step(dir)` es un paso) y la suelta. */
async function hold(d: DemoDirectorB02, knob: KnobB02, fn: (step: (dir: number, big?: boolean) => void) => Promise<void>) {
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

/** Gira un mando `n` pasos (el revólver: `n` posiciones, en diez pasos hasta cada enclavamiento). */
async function turn(d: DemoDirectorB02, knob: KnobB02, dir: 1 | -1, n: number, big = false) {
  const steps = knob === 'mic:turret' ? n * 10 : n;
  // El revólver: diez pasos por posición, sea de 120° (tres objetivos) o de 90° (cuatro).
  const k = knob === 'mic:turret' ? d.w.params.microscope.turretDetentDeg / 120 : 1;
  await hold(d, knob, async (step) => {
    for (let i = 0; i < steps; i++) {
      step(dir * k, big);
      await d.wait(0.06);
    }
  });
}

/** La palanca de la pinza se empuja hasta abrirla del todo (queda abierta) o se suelta para que la cierre el resorte. */
async function lever(d: DemoDirectorB02, open: boolean) {
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

/** Enfoque mirando por el ocular: macro hasta ver algo nítido (4X) y micro hacia el máximo de nitidez. */
async function focusCompound(d: DemoDirectorB02) {
  const v = () => microscopeView(d.w);
  if (v().objectiveX === 4) {
    await hold(d, 'mic:coarse', async (step) => {
      for (let i = 0; i < 120 && v().sharpness01 < 0.25; i++) {
        step(1);
        await d.wait(0.05);
      }
    });
  }
  await hold(d, 'mic:fine', (step) => towardSharpest(d, () => v().sharpness01, step));
}

/** Micrométrico (o perilla del estéreo) hacia el máximo de nitidez: prueba un sentido y, si empeora, el otro. */
async function towardSharpest(d: DemoDirectorB02, sharp: () => number, step: (dir: number) => void) {
  let best = sharp();
  for (const dir of [1, -1] as const) {
    for (let i = 0; i < 40; i++) {
      step(dir);
      await d.wait(0.05);
      const s = sharp();
      if (s + 1e-9 < best) {
        step(-dir);
        await d.wait(0.05);
        break;
      }
      best = s;
    }
  }
}

/** Mirar y registrar (C) cuando la vista lleva el tiempo mínimo estable. */
async function capture(d: DemoDirectorB02) {
  if (d.w.view.instrument === null) d.c.toggleEyepiece('compound');
  await d.wait(d.w.params.observationHoldS + 0.4);
  d.c.onKeyDown('c', false);
  await d.wait(0.4);
  return last(d);
}

/** Herramienta a un punto y P. */
async function toolAt(d: DemoDirectorB02, tool: string, x: number, y: number, strong = false) {
  if (d.c.held?.id !== tool && !(await d.grab(tool))) return;
  await d.moveTo(x, y);
  await d.wait(0.3);
  d.c.primary(strong);
  await d.wait(0.5);
}

async function putDown(d: DemoDirectorB02, x: number, y: number) {
  if (!d.c.held) return;
  await d.moveTo(x, y);
  await d.release();
}

/** Limpia la herramienta que quedó sobre la mesa con papel de lente (evita la contaminación cruzada). */
async function wipeTool(d: DemoDirectorB02, tool: string) {
  const o = d.w.objects[tool].pose;
  await toolAt(d, 'lp', o.x, o.y);
  await putDown(d, 180, 18);
}

/** Cubreobjetos con la pinza: inclinado (45°) y lento sobre la lámina en (x, y). */
async function cover(d: DemoDirectorB02, x: number, y: number) {
  await toolAt(d, 'fc', COVER_BOX.x, COVER_BOX.y);
  await d.moveTo(x, y);
  await d.wait(0.3);
  d.c.primary(false);
  await d.until(() => !d.c.lowering, 8);
  await d.wait(0.5);
  // La pinza tocó el cubreobjetos: se limpia antes de la próxima muestra.
  const lp = d.w.objects.lp.pose;
  await d.moveTo(lp.x, lp.y);
  d.c.primary(false);
  await d.wait(0.3);
  await putDown(d, 180, 18);
}

/** Lámina a la platina, 4X → 10X → 40X con enfoque mirando, capturas a 4X y 40X, y retiro a la bandeja. */
async function observe(d: DemoDirectorB02, slide: string, out: string[]) {
  d.station('C');
  if (microscopeView(d.w).objectiveX !== 4) await turn(d, 'mic:turret', -1, 1);
  await lever(d, true);
  await d.carry(slide, STAGE_SEAT.x, STAGE_SEAT.y);
  await lever(d, false);
  d.c.checkSide();
  await d.wait(0.8);
  await part(d, 'mic', 'ocular');
  await focusCompound(d);
  out.push(await capture(d));
  await turn(d, 'mic:turret', 1, 1);
  await focusCompound(d);
  await turn(d, 'mic:turret', 1, 1);
  await turn(d, 'mic:diaphragm', 1, 5);
  await focusCompound(d);
  out.push(await capture(d));
  await turn(d, 'mic:diaphragm', -1, 5);
  await turn(d, 'mic:turret', -1, 2);
  d.c.toggleEyepiece('compound');
  await turn(d, 'mic:coarse', -1, Math.ceil(d.w.microscope.coarseTurns / 0.5) + 1, true);
  await turn(d, 'mic:fine', d.w.microscope.fineTurns > 0 ? -1 : 1, Math.round(Math.abs(d.w.microscope.fineTurns) / 0.05));
  await lever(d, true);
  await d.carry(slide, CLEAN_TRAY.x, CLEAN_TRAY.y);
}

export function buildDemoScriptB02(ui: DemoUiHooksB02): DemoStepB02[] {
  const res: DemoRes = { elodea: [], potato: [], tomato: [], buccal: [] };
  return [
    {
      part: 'A', key: 'safety',
      run: async (d) => {
        d.station('A');
        for (const id of ['glassBin', 'bioWaste', 'trashBin']) {
          await d.press(id, undefined, 0.5);
          d.dispatch({ type: 'inspect', target: id });
        }
        d.station('C');
        await d.wait(0.6);
        for (const p of MICROSCOPE_PARTS) d.dispatch({ type: 'inspect', target: `mic:${p}` });
        await part(d, 'mic', 'power');
        d.station('B');
      },
    },
    {
      part: 'B', key: 'elodea',
      run: async (d) => {
        await d.carry('sl1', PREP_SPOT.x, PREP_SPOT.y);
        const el = d.w.objects.el.pose;
        await toolAt(d, 'fc', el.x, el.y);
        await d.moveTo(PREP_SPOT.x, PREP_SPOT.y);
        await d.wait(0.3);
        d.c.primary(false);
        await d.wait(0.5);
        const lp = d.w.objects.lp.pose;
        await d.moveTo(lp.x, lp.y);
        d.c.primary(false);
        await d.wait(0.4);
        await putDown(d, 180, 18);
        await toolAt(d, 'dw', PREP_SPOT.x, PREP_SPOT.y);
        await putDown(d, 196, 36);
        // Error deliberado: cubierta casi plana y de golpe → entra aire (consecuencia visible); luego se corrige.
        await toolAt(d, 'fc', COVER_BOX.x, COVER_BOX.y);
        await d.moveTo(PREP_SPOT.x, PREP_SPOT.y);
        for (let i = 0; i < 5; i++) {
          d.c.onKeyDown('q', false);
          await d.wait(0.05);
        }
        d.note(d.hooks.t('b02.demo.ui.mistake'));
        d.c.primary(true);
        await d.until(() => !d.c.lowering, 5);
        await d.wait(1.2);
        d.note(d.hooks.t('b02.demo.ui.recover'));
        d.c.primary(false);
        await d.wait(0.6);
        for (let i = 0; i < 5; i++) {
          d.c.onKeyDown('e', false);
          await d.wait(0.05);
        }
        d.c.primary(false);
        await d.until(() => !d.c.lowering, 8);
        d.note(null);
        await d.moveTo(lp.x, lp.y);
        d.c.primary(false);
        await d.wait(0.3);
        await putDown(d, 180, 18);
      },
    },
    { part: 'C', key: 'observeElodea', run: (d) => observe(d, 'sl1', res.elodea) },
    {
      part: 'B', key: 'potato',
      run: async (d) => {
        d.station('B');
        await d.carry('sl2', PREP_SPOT.x, PREP_SPOT.y);
        // Raspado suave con la espátula (sin desgarrar) y depósito al centro de la lámina.
        const pot = d.w.objects.pot.pose;
        await toolAt(d, 'sp', pot.x, pot.y);
        await d.moveTo(PREP_SPOT.x, PREP_SPOT.y);
        await d.wait(0.3);
        d.c.primary(false);
        await d.wait(0.4);
        await putDown(d, 112, 14);
        await wipeTool(d, 'sp');
        await toolAt(d, 'iod', PREP_SPOT.x, PREP_SPOT.y);
        await putDown(d, 204, 36);
        await cover(d, PREP_SPOT.x, PREP_SPOT.y);
        // El Lugol necesita tiempo de contacto: se espera (tiempo acelerado) antes de observar.
        const need = (d.w.params.cellPrep?.lugolMinContactS ?? 20) + 2;
        await d.simUntil(() => (d.w.mounts.sl2?.cell?.contactS.lugol ?? 0) >= need, need + 10);
      },
    },
    { part: 'C', key: 'observePotato', run: (d) => observe(d, 'sl2', res.potato) },
    {
      part: 'B', key: 'tomato',
      run: async (d) => {
        d.station('B');
        await d.carry('sl3', PREP_SPOT.x, PREP_SPOT.y);
        // Corte fino con el bisturí; el fragmento queda en la tabla y se toma con la pinza.
        const tom = d.w.objects.tom.pose;
        await toolAt(d, 'sc', tom.x, tom.y);
        await putDown(d, 112, 20);
        await wipeTool(d, 'sc');
        await toolAt(d, 'fc', BOARD_POS.x, BOARD_POS.y);
        await d.moveTo(PREP_SPOT.x, PREP_SPOT.y);
        await d.wait(0.3);
        d.c.primary(false);
        await d.wait(0.4);
        const lp = d.w.objects.lp.pose;
        await d.moveTo(lp.x, lp.y);
        d.c.primary(false);
        await d.wait(0.3);
        await putDown(d, 180, 18);
        await toolAt(d, 'dw', PREP_SPOT.x, PREP_SPOT.y);
        await putDown(d, 196, 36);
        await cover(d, PREP_SPOT.x, PREP_SPOT.y);
      },
    },
    { part: 'C', key: 'observeTomato', run: (d) => observe(d, 'sl3', res.tomato) },
    {
      part: 'D', key: 'buccal',
      run: async (d) => {
        d.station('D');
        // Área animal separada: lámina propia, hisopo estéril, extendido en una dirección y el hisopo a residuos biológicos.
        await d.carry('sl4', PREP2_SPOT.x, PREP2_SPOT.y);
        await toolAt(d, 'sw1', CHEEK_POS.x, CHEEK_POS.y);
        await d.moveTo(PREP2_SPOT.x, PREP2_SPOT.y);
        await d.wait(0.3);
        d.c.primary(false);
        await d.wait(0.4);
        await putDown(d, BIO_WASTE.x, BIO_WASTE.y);
        await toolAt(d, 'mb', PREP2_SPOT.x, PREP2_SPOT.y);
        await putDown(d, 212, 36);
        await cover(d, PREP2_SPOT.x, PREP2_SPOT.y);
      },
    },
    { part: 'C', key: 'observeBuccal', run: (d) => observe(d, 'sl4', res.buccal) },
    {
      part: 'F', key: 'record',
      run: async (d) => {
        const w = d.w;
        const oc = w.params.microscope.ocularX;
        const hi = (k: keyof DemoRes) => w.observations[res[k][res[k].length - 1]];
        ui.notebook(true, 'atlas');
        ui.edit((nb) => {
          const row = (k: 'tomato' | 'elodea' | 'potato', plastid: 'chromoplast' | 'chloroplast' | 'amyloplast', color: string) => {
            const o = hi(k);
            return o ? { observationId: o.id, specimen: k, totalMag: String(oc * (o.objectiveX ?? 4)), plastid, color, structures: o.visibleRegionIds.filter((s) => s !== 'nucleus').slice(0, 2) } : null;
          };
          nb.atlas = [row('tomato', 'chromoplast', 'rojo'), row('elodea', 'chloroplast', 'verde'), row('potato', 'amyloplast', 'azul oscuro con Lugol')].filter((r) => r !== null);
          const po = hi('potato');
          if (po) nb.potato = { observationId: po.id, stained: 'yes', grains: po.visibleRegionIds.includes('starchGrains') ? 'visible' : 'notVisible', interpretation: 'El Lugol tiñe los gránulos de almidón' };
          const bo = hi('buccal');
          if (bo) nb.buccal = { observationId: bo.id, stain: 'methylene-blue', smear: 'Extendido en una dirección', structures: bo.visibleRegionIds.filter((s) => ['cellBorder', 'nucleus', 'cytoplasm'].includes(s)) };
          const eo = hi('elodea');
          if (eo) nb.elodea = { observationId: eo.id, totalMag: String(oc * (eo.objectiveX ?? 4)), structures: eo.visibleRegionIds.filter((s) => s === 'chloroplasts' || s === 'cellWall'), motion: 'needsVideo' };
        });
        await d.wait(2.4);
        ui.notebook(true, 'close');
        ui.edit((nb) => {
          nb.comparison = { plantAnimal: 'La célula vegetal tiene pared y plastidios; la bucal no', plastids: 'Cloroplastos verdes, cromoplastos con pigmento, amiloplastos con almidón', limits: 'La membrana plasmática no se resuelve a campo claro' };
          nb.log = { action: 'Cubreobjetos de la Elodea', failure: 'Bajado deprisa y casi plano: entró aire', correction: 'Se levantó y se bajó inclinado y lento', consequence: 'Capturas sin burbujas' };
        });
        await d.wait(2);
        ui.notebook(false);
      },
    },
    {
      part: 'F', key: 'close',
      run: async (d) => {
        d.station('C');
        await part(d, 'mic', 'power');
        d.station('F');
        ui.notebook(true, 'close');
        d.dispatch({ type: 'closeBench' });
        await d.wait(2.4);
        ui.notebook(false);
      },
    },
  ];
}
