/**
 * Guion de la demostración de B01 (§16): catorce secuencias con la MANO VIRTUAL sobre el controlador real — tomar y
 * llevar, pinza, gotero, cubreobjetos con inclinación y velocidad, interruptores, ocular y registro — y una
 * recuperación controlada: una cubierta bajada deprisa y casi plana deja aire, se levanta y se vuelve a bajar inclinada
 * y lenta, sin saltos de estado. Los mandos de los instrumentos se TOMAN y se GIRAN sobre su pivote por el mismo camino
 * que el ratón (`grabPart` / `dragPart` / `releasePart`, con la tabla `KIN`): el revólver gira de a poco y encaja en su
 * enclavamiento, la palanca de la pinza se empuja. Enfoca mirando (la nitidez que se ve por el ocular), no con un
 * valor oculto. No marca etapas, no genera nota ni se guarda. Textos en `b01.demo.steps.<clave>`.
 */
import type { DemoDirectorB01, DemoStepB01 } from './director';
import type { B01Notebook } from '../../../practices/practice-b01/notebook';
import { MICROSCOPE_PARTS } from '../../../simulation/instruments/optical/microscope-types';
import { STEREO_PARTS } from '../../../simulation/instruments/optical/stereo-types';
import { microscopeView, stereoView } from '../../../simulation/optical-world/world';
import { CLEAN_TRAY, COVER_BOX, PREP_SPOT, SAMPLE_TRAY, STAGE_SEAT, STEREO_BASE, caseSlotIndex, caseSlotPos } from '../../../simulation/optical-world/geometry';
import type { KnobB01 } from '../../../engine/optical/controller';
import { KIN, type PartGrip } from '../../../engine/optical/parts';

export interface DemoUiHooksB01 {
  notebook(open: boolean, tab?: string): void;
  edit(fn: (nb: B01Notebook) => void): void;
}

interface DemoRes {
  fresh: string[];
  fixed: string[];
  leaf: string[];
  insect: string[];
}

const last = (d: DemoDirectorB01) => d.w.observationOrder[d.w.observationOrder.length - 1];

/** Parte de un instrumento que se pulsa (interruptor, ocular, tapa): la mano la señala y hace clic. */
async function part(d: DemoDirectorB01, id: string, p: string) {
  d.pointPart(id, p);
  await d.wait(0.4);
  d.c.instrumentPart(id, p);
  d.endPress();
}

const rotary = (axis: PartGrip['axis']): PartGrip => ({ kind: 'rotary', axis });
/** Pieza 3D de cada mando y su giro por paso de la mano (rad, el mismo paso que Q/E en unidades del dominio). */
const PIECE: Partial<Record<KnobB01, { id: string; part: string; grip: PartGrip; rad: number }>> = {
  'mic:coarse': { id: 'mic', part: 'coarse', grip: rotary('x'), rad: 0.1 * KIN.radPerTurn },
  'mic:fine': { id: 'mic', part: 'fine', grip: rotary('x'), rad: 0.05 * KIN.radPerTurn },
  'mic:diaphragm': { id: 'mic', part: 'diaphragm', grip: { kind: 'lever', axis: 'y' }, rad: 0.02 * KIN.irisRadPer01 },
  'mic:turret': { id: 'mic', part: 'turret', grip: rotary('y'), rad: 12 * KIN.turretRadPerDeg },
  'ste:zoom': { id: 'ste', part: 'zoom', grip: rotary('x'), rad: 0.1 * KIN.zoomRadPerX },
  'ste:focus': { id: 'ste', part: 'focus', grip: rotary('x'), rad: 0.25 * KIN.radPerTurn },
};

/** Toma la pieza del mando, la gira mientras dure `fn` (cada `step(dir)` es un paso) y la suelta. */
async function hold(d: DemoDirectorB01, knob: KnobB01, fn: (step: (dir: number, big?: boolean) => void) => Promise<void>) {
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
async function turn(d: DemoDirectorB01, knob: KnobB01, dir: 1 | -1, n: number, big = false) {
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
async function lever(d: DemoDirectorB01, open: boolean) {
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
async function focusCompound(d: DemoDirectorB01) {
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
async function towardSharpest(d: DemoDirectorB01, sharp: () => number, step: (dir: number) => void) {
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

async function focusStereo(d: DemoDirectorB01) {
  await hold(d, 'ste:focus', (step) => towardSharpest(d, () => stereoView(d.w).sharpness01, step));
}

/** Mirar y registrar (C) cuando la vista lleva el tiempo mínimo estable. */
async function capture(d: DemoDirectorB01) {
  if (d.w.view.instrument === null) d.c.toggleEyepiece(d.w.objects.ste && d.w.stereo.sampleId && !d.w.microscope.slideOnStage ? 'stereo' : 'compound');
  await d.wait(d.w.params.observationHoldS + 0.4);
  d.c.onKeyDown('c', false);
  await d.wait(0.4);
  return last(d);
}

/** Herramienta a un punto y P. */
async function toolAt(d: DemoDirectorB01, tool: string, x: number, y: number, strong = false) {
  if (d.c.held?.id !== tool && !(await d.grab(tool))) return;
  await d.moveTo(x, y);
  await d.wait(0.3);
  d.c.primary(strong);
  await d.wait(0.5);
}

async function putDown(d: DemoDirectorB01, x: number, y: number) {
  if (!d.c.held) return;
  await d.moveTo(x, y);
  await d.release();
}

export function buildDemoScriptB01(ui: DemoUiHooksB01): DemoStepB01[] {
  const res: DemoRes = { fresh: [], fixed: [], leaf: [], insect: [] };
  return [
    {
      part: 'A', key: 'safety',
      run: async (d) => {
        d.station('A');
        for (const id of ['glassBin', 'bioWaste']) {
          await d.press(id, undefined, 0.6);
          d.dispatch({ type: 'inspect', target: id });
        }
        d.station('C');
        await d.wait(0.8);
        for (const p of MICROSCOPE_PARTS) d.dispatch({ type: 'inspect', target: `mic:${p}` });
        for (const p of STEREO_PARTS) d.dispatch({ type: 'inspect', target: `ste:${p}` });
        await d.press('mic', undefined, 0.8);
        d.station('B');
      },
    },
    {
      part: 'B', key: 'specimen',
      run: async (d) => {
        await d.carry('sl1', PREP_SPOT.x, PREP_SPOT.y);
        await d.press('sl1', undefined, 0.4);
        d.dispatch({ type: 'inspect', target: 'sl1' });
        const el = d.w.objects.el.pose;
        await toolAt(d, 'fc', el.x, el.y);
        await d.moveTo(PREP_SPOT.x, PREP_SPOT.y);
        await d.wait(0.3);
        d.c.primary(false);
        await d.wait(0.5);
        // La pinza queda con restos de la hoja: se limpia con papel de lente antes de seguir.
        const lp = d.w.objects.lp.pose;
        await d.moveTo(lp.x, lp.y);
        d.c.primary(false);
        await d.wait(0.4);
        await putDown(d, 180, 18);
      },
    },
    {
      part: 'B', key: 'mount',
      run: async (d) => {
        await toolAt(d, 'dw', PREP_SPOT.x, PREP_SPOT.y);
        await putDown(d, 166, 42);
        // Primer intento deliberado: cubierta casi plana y de golpe → entra aire (consecuencia visible).
        await toolAt(d, 'fc', COVER_BOX.x, COVER_BOX.y);
        await d.moveTo(PREP_SPOT.x, PREP_SPOT.y);
        for (let i = 0; i < 5; i++) {
          d.c.onKeyDown('q', false);
          await d.wait(0.05);
        }
        d.note(d.hooks.t('b01.demo.ui.mistake'));
        d.c.primary(true);
        await d.until(() => !d.c.lowering, 5);
        await d.wait(1.2);
        // Recuperación: levantar la cubierta y bajarla inclinada (45°) y lenta.
        d.note(d.hooks.t('b01.demo.ui.recover'));
        d.c.primary(false);
        await d.wait(0.6);
        for (let i = 0; i < 5; i++) {
          d.c.onKeyDown('e', false);
          await d.wait(0.05);
        }
        d.c.primary(false);
        await d.until(() => !d.c.lowering, 8);
        d.note(null);
        await d.wait(0.8);
        await putDown(d, 180, 18);
      },
    },
    {
      part: 'C', key: 'power',
      run: async (d) => {
        d.station('C');
        await part(d, 'mic', 'power');
        if (microscopeView(d.w).objectiveX !== 4) await turn(d, 'mic:turret', -1, 2);
      },
    },
    {
      part: 'C', key: 'clip',
      run: async (d) => {
        await lever(d, true);
        await d.carry('sl1', STAGE_SEAT.x, STAGE_SEAT.y);
        await lever(d, false);
      },
    },
    {
      part: 'C', key: 'approach',
      run: async (d) => {
        // Mirar de lado antes de acercar; luego por el ocular, macro hasta ver.
        d.c.checkSide();
        await d.wait(1.2);
        d.station('C');
        await part(d, 'mic', 'ocular');
        await focusCompound(d);
      },
    },
    {
      part: 'C', key: 'light',
      run: async (d) => {
        await focusCompound(d);
        res.fresh.push(await capture(d));
      },
    },
    {
      part: 'C', key: 'objectives',
      run: async (d) => {
        await turn(d, 'mic:turret', 1, 1);
        await focusCompound(d);
        res.fresh.push(await capture(d));
        await turn(d, 'mic:turret', 1, 1);
        await turn(d, 'mic:diaphragm', 1, 5);
        await focusCompound(d);
        res.fresh.push(await capture(d));
      },
    },
    {
      part: 'C', key: 'record',
      run: async (d) => {
        ui.notebook(true, 'micro');
        const w = d.w;
        ui.edit((nb) => {
          nb.micro = res.fresh.map((id) => {
            const o = w.observations[id];
            return { observationId: id, specimen: 'elodea' as const, totalMag: String(o.ocularX * (o.objectiveX ?? 4)), region: 'Centro de la hoja', structures: o.visibleRegionIds.slice(0, 2) };
          });
        });
        await d.wait(2.4);
        ui.notebook(false);
      },
    },
    {
      part: 'D', key: 'park',
      run: async (d) => {
        await turn(d, 'mic:diaphragm', -1, 5);
        await turn(d, 'mic:turret', -1, 2);
        d.c.toggleEyepiece('compound');
        await turn(d, 'mic:coarse', -1, Math.ceil(d.w.microscope.coarseTurns / 0.5) + 1, true);
        await lever(d, true);
        await d.carry('sl1', CLEAN_TRAY.x, CLEAN_TRAY.y);
        d.station('D');
        await part(d, 'case', 'lid');
      },
    },
    {
      part: 'D', key: 'fixed',
      run: async (d) => {
        const id = d.w.assignment.fixedSlideIds[0];
        await d.press(id, undefined, 0.8);
        await d.carry(id, STAGE_SEAT.x, STAGE_SEAT.y);
        await lever(d, false);
        d.c.checkSide();
        await d.wait(0.8);
        d.station('C');
        await part(d, 'mic', 'ocular');
        await focusCompound(d);
        res.fixed.push(await capture(d));
        await turn(d, 'mic:turret', 1, 1);
        await focusCompound(d);
        res.fixed.push(await capture(d));
        await turn(d, 'mic:turret', -1, 1);
        d.c.toggleEyepiece('compound');
        await turn(d, 'mic:coarse', -1, Math.ceil(d.w.microscope.coarseTurns / 0.5) + 1, true);
        await lever(d, true);
        const home = d.w.slideCase.home[id];
        const p = caseSlotPos(caseSlotIndex(home));
        d.station('D');
        await d.carry(id, p.x, p.y);
        await part(d, 'case', 'lid');
      },
    },
    {
      part: 'E', key: 'stereoLeaf',
      run: async (d) => {
        d.station('E');
        await part(d, 'ste', 'power');
        const leaf = d.w.objects.leaf1.pose;
        await toolAt(d, 'fc', leaf.x, leaf.y);
        await d.moveTo(STEREO_BASE.x, STEREO_BASE.y);
        d.c.primary(false);
        await d.wait(0.4);
        await putDown(d, 420, 12);
        await part(d, 'ste', 'oculars');
        await focusStereo(d);
        res.leaf.push(await capture(d));
        await turn(d, 'ste:zoom', 1, 20);
        await focusStereo(d);
        res.leaf.push(await capture(d));
        await turn(d, 'ste:zoom', -1, 20);
        d.c.toggleEyepiece('stereo');
        await toolAt(d, 'fc', STEREO_BASE.x, STEREO_BASE.y);
        await d.moveTo(SAMPLE_TRAY.x - 3, SAMPLE_TRAY.y);
        d.c.primary(false);
        await d.wait(0.4);
      },
    },
    {
      part: 'E', key: 'stereoInsect',
      run: async (d) => {
        const lp = d.w.objects.lp.pose;
        if (d.c.held?.id !== 'fc') await d.grab('fc');
        await d.moveTo(lp.x, lp.y);
        d.c.primary(false);
        await d.wait(0.4);
        const ins = d.w.objects.ins1.pose;
        await d.moveTo(ins.x, ins.y);
        d.c.primary(false);
        await d.wait(0.4);
        await d.moveTo(STEREO_BASE.x, STEREO_BASE.y);
        d.c.primary(false);
        await d.wait(0.4);
        await putDown(d, 420, 12);
        await part(d, 'ste', 'oculars');
        await focusStereo(d);
        res.insect.push(await capture(d));
        await turn(d, 'ste:zoom', 1, 10);
        await focusStereo(d);
        res.insect.push(await capture(d));
        d.c.toggleEyepiece('stereo');
        await toolAt(d, 'fc', STEREO_BASE.x, STEREO_BASE.y);
        await d.moveTo(SAMPLE_TRAY.x + 3, SAMPLE_TRAY.y);
        d.c.primary(false);
        await d.wait(0.4);
        await d.moveTo(lp.x, lp.y);
        d.c.primary(false);
        await d.wait(0.3);
        await putDown(d, 180, 18);
      },
    },
    {
      part: 'F', key: 'close',
      run: async (d) => {
        d.station('C');
        await part(d, 'mic', 'power');
        d.station('E');
        await part(d, 'ste', 'power');
        d.station('F');
        const w = d.w;
        ui.notebook(true, 'stereo');
        ui.edit((nb) => {
          const lo = w.observations[res.leaf[res.leaf.length - 1]];
          const io = w.observations[res.insect[res.insect.length - 1]];
          if (lo) nb.stereo.leaf = { observationId: lo.id, light: 'incident', structures: lo.visibleRegionIds.slice(0, 2) };
          if (io) nb.stereo.insect = { observationId: io.id, light: 'incident', structures: io.visibleRegionIds.slice(0, 3) };
          const fo = w.observations[res.fixed[res.fixed.length - 1]];
          if (fo) nb.fixed = [{ observationId: fo.id, label: w.slides[fo.slideId!]?.label ?? '', slot: w.slideCase.home[fo.slideId!] ?? '', description: 'Células epidérmicas alargadas con núcleo teñido', returned: true }];
          nb.prep = { specimen: 'elodea', cutType: 'none', waterMl: '0,05', cover: 'angled', incidents: 'Primer descenso rápido y casi plano: entró aire; se levantó y se bajó inclinado.' };
          nb.calc = { mag4: '40', mag10: '100', mag40: '400', fov4: '4,5', fov10: '1,8', fov40: '0,45' };
          nb.comparison = { fov: 'El estereoscopio muestra un campo mucho mayor', depth: 'Más profundidad de campo en el estereoscopio', purpose: 'Compuesto para células; estereoscopio para superficie y relieve' };
          nb.incidents = { error: 'Cubreobjetos bajado deprisa y casi plano', consequence: 'Burbujas sobre la hoja', recovery: 'Se levantó y se bajó inclinado y lento', inventory: 'Todo devuelto' };
        });
        await d.wait(2.4);
        ui.notebook(true, 'close');
        d.dispatch({ type: 'closeBench' });
        await d.wait(2.4);
        ui.notebook(false);
      },
    },
  ];
}
