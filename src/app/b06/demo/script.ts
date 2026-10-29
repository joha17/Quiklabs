/**
 * Guion de la demostración de B06 (§16): la MANO VIRTUAL sobre el controlador real clasifica las muestras, pela la
 * epidermis de Tradescantia con la pinza, monta Paramecium con metilcelulosa (registra la movilidad mientras lo mira),
 * monta Euglena, hace el frotis bucal con azul de metileno, observa los preparados permanentes de Bacillus y de sangre
 * y los devuelve a su ranura,
 * marca estructuras sobre sus capturas y mide un organismo con la escala calibrada. Una recuperación controlada: la
 * cubierta de la epidermis bajada deprisa y casi plana deja aire, se levanta y se baja inclinada y lenta. Los mandos se TOMAN y se GIRAN por el mismo
 * camino que el ratón; enfoca mirando la nitidez del ocular. No marca etapas, no genera nota ni se guarda. Textos en
 * `b06.demo.steps.<clave>`.
 */
import type { DemoDirectorB06, DemoStepB06 } from './director';
import type { B06Notebook } from '../../../practices/practice-b06/notebook';
import { MICROSCOPE_PARTS } from '../../../simulation/instruments/optical/microscope-types';
import { microscopeView } from '../../../simulation/optical-world/world';
import { BIO_WASTE, CLEAN_TRAY, COVER_BOX, PREP_SPOT, STAGE_SEAT, caseSlotIndex, caseSlotPos } from '../../../simulation/optical-world/geometry';
import { CHEEK_POS, PREP2_SPOT } from '../../../simulation/cell-world/geometry';
import { POT_POS } from '../../../simulation/div-world/geometry';
import { DIV_LAYOUT } from '../../../simulation/specimens/assets';
import { DIV_SPECIMENS } from '../../../simulation/div-world/types';
import type { KnobB01 as KnobB06 } from '../../../engine/optical/controller';
import { KIN, type PartGrip } from '../../../engine/optical/parts';

export interface DemoUiHooksB06 {
  notebook(open: boolean, tab?: string): void;
  edit(fn: (nb: B06Notebook) => void): void;
}

type DemoRes = Record<'tradescantia' | 'paramecium' | 'euglena' | 'buccal' | 'bacillus' | 'blood', string[]>;

const last = (d: DemoDirectorB06) => d.w.observationOrder[d.w.observationOrder.length - 1];

/** Parte de un instrumento que se pulsa (interruptor, ocular, tapa): la mano la señala y hace clic. */
async function part(d: DemoDirectorB06, id: string, p: string) {
  d.pointPart(id, p);
  await d.wait(0.4);
  d.c.instrumentPart(id, p);
  d.endPress();
}

const rotary = (axis: PartGrip['axis']): PartGrip => ({ kind: 'rotary', axis });
/** Pieza 3D de cada mando y su giro por paso de la mano (rad, el mismo paso que Q/E en unidades del dominio). */
const PIECE: Partial<Record<KnobB06, { id: string; part: string; grip: PartGrip; rad: number }>> = {
  'mic:coarse': { id: 'mic', part: 'coarse', grip: rotary('x'), rad: 0.1 * KIN.radPerTurn },
  'mic:fine': { id: 'mic', part: 'fine', grip: rotary('x'), rad: 0.05 * KIN.radPerTurn },
  'mic:diaphragm': { id: 'mic', part: 'diaphragm', grip: { kind: 'lever', axis: 'y' }, rad: 0.02 * KIN.irisRadPer01 },
  'mic:turret': { id: 'mic', part: 'turret', grip: rotary('y'), rad: 12 * KIN.turretRadPerDeg },
  'ste:zoom': { id: 'ste', part: 'zoom', grip: rotary('x'), rad: 0.1 * KIN.zoomRadPerX },
  'ste:focus': { id: 'ste', part: 'focus', grip: rotary('x'), rad: 0.25 * KIN.radPerTurn },
};

/** Toma la pieza del mando, la gira mientras dure `fn` (cada `step(dir)` es un paso) y la suelta. */
async function hold(d: DemoDirectorB06, knob: KnobB06, fn: (step: (dir: number, big?: boolean) => void) => Promise<void>) {
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
async function turn(d: DemoDirectorB06, knob: KnobB06, dir: 1 | -1, n: number, big = false) {
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
async function lever(d: DemoDirectorB06, open: boolean) {
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
async function focusCompound(d: DemoDirectorB06) {
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
async function towardSharpest(d: DemoDirectorB06, sharp: () => number, step: (dir: number) => void) {
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
async function capture(d: DemoDirectorB06) {
  if (d.w.view.instrument === null) d.c.toggleEyepiece('compound');
  await d.wait(d.w.params.observationHoldS + 0.4);
  d.c.onKeyDown('c', false);
  await d.wait(0.4);
  return last(d);
}

/** Herramienta a un punto y P. */
async function toolAt(d: DemoDirectorB06, tool: string, x: number, y: number, strong = false) {
  if (d.c.held?.id !== tool && !(await d.grab(tool))) return;
  await d.moveTo(x, y);
  await d.wait(0.3);
  d.c.primary(strong);
  await d.wait(0.5);
}

async function putDown(d: DemoDirectorB06, x: number, y: number) {
  if (!d.c.held) return;
  await d.moveTo(x, y);
  await d.release();
}

/** Cubreobjetos con la pinza: inclinado (45°) y lento sobre la lámina en (x, y). */
async function cover(d: DemoDirectorB06, x: number, y: number) {
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

/**
 * Lámina a la platina, 4X → 10X → 40X con enfoque mirando, capturas a 4X y 40X, y retiro a la bandeja. Con `to100`,
 * además el 100X (objetivo negro): solo con el micrométrico, porque queda a medio milímetro del cubreobjetos.
 */
async function observe(d: DemoDirectorB06, slide: string, out: string[], to100 = false, whileViewing?: () => Promise<void>, lowAt: 4 | 10 = 4) {
  d.station('C');
  if (microscopeView(d.w).objectiveX !== 4) await turn(d, 'mic:turret', -1, 1);
  await lever(d, true);
  await d.carry(slide, STAGE_SEAT.x, STAGE_SEAT.y);
  await lever(d, false);
  d.c.checkSide();
  await d.wait(0.8);
  await part(d, 'mic', 'ocular');
  await focusCompound(d);
  if (lowAt === 4) out.push(await capture(d));
  await turn(d, 'mic:turret', 1, 1);
  await focusCompound(d);
  if (lowAt === 10) out.push(await capture(d));
  await turn(d, 'mic:turret', 1, 1);
  await turn(d, 'mic:diaphragm', 1, 5);
  await focusCompound(d);
  out.push(await capture(d));
  if (to100) {
    await turn(d, 'mic:turret', 1, 1);
    await focusCompound(d);
    out.push(await capture(d));
  }
  if (whileViewing) await whileViewing();
  await turn(d, 'mic:diaphragm', -1, 5);
  await turn(d, 'mic:turret', -1, to100 ? 3 : 2);
  d.c.toggleEyepiece('compound');
  await turn(d, 'mic:coarse', -1, Math.ceil(d.w.microscope.coarseTurns / 0.5) + 1, true);
  await turn(d, 'mic:fine', d.w.microscope.fineTurns > 0 ? -1 : 1, Math.round(Math.abs(d.w.microscope.fineTurns) / 0.05));
  await lever(d, true);
  await d.carry(slide, CLEAN_TRAY.x, CLEAN_TRAY.y);
}

/** Lámina permanente: de su ranura a la platina, 4X → 10X → 40X con capturas a los objetivos pedidos, y de vuelta a su ranura. */
async function fixedObs(d: DemoDirectorB06, id: string, out: string[], at: Array<10 | 40>) {
  await d.press(id, undefined, 0.8);
  await lever(d, true);
  await d.carry(id, STAGE_SEAT.x, STAGE_SEAT.y);
  await lever(d, false);
  d.c.checkSide();
  await d.wait(0.8);
  await part(d, 'mic', 'ocular');
  await focusCompound(d);
  await turn(d, 'mic:turret', 1, 1);
  await focusCompound(d);
  if (at.includes(10)) out.push(await capture(d));
  await turn(d, 'mic:turret', 1, 1);
  await turn(d, 'mic:diaphragm', 1, 5);
  await focusCompound(d);
  if (at.includes(40)) out.push(await capture(d));
  await turn(d, 'mic:diaphragm', -1, 5);
  await turn(d, 'mic:turret', -1, 2);
  d.c.toggleEyepiece('compound');
  await turn(d, 'mic:coarse', -1, Math.ceil(d.w.microscope.coarseTurns / 0.5) + 1, true);
  await turn(d, 'mic:fine', d.w.microscope.fineTurns > 0 ? -1 : 1, Math.round(Math.abs(d.w.microscope.fineTurns) / 0.05));
  await lever(d, true);
  const p = caseSlotPos(caseSlotIndex(d.w.slideCase.home[id]));
  await d.carry(id, p.x, p.y);
}

/** Punto (u, v en la captura) del centro de un organismo del layout, si cae en el campo registrado. */
function inCapture(d: DemoDirectorB06, obsId: string, x: number, y: number): [number, number] | null {
  const o = d.w.observations[obsId];
  if (!o) return null;
  const [cx, cy, vw, vh] = o.normalizedViewport;
  const u = 0.5 + (x - cx) / vw;
  const v = 0.5 + (y - cy) / vh;
  return u > 0.03 && u < 0.97 && v > 0.03 && v < 0.97 ? [u, v] : null;
}

export function buildDemoScriptB06(ui: DemoUiHooksB06): DemoStepB06[] {
  const res: DemoRes = { tradescantia: [], paramecium: [], euglena: [], buccal: [], bacillus: [], blood: [] };
  const fresh = new Set(['euglena', 'paramecium', 'elodea', 'tradescantia', 'buccal']);
  return [
    {
      part: 'A', key: 'safety',
      run: async (d) => {
        d.station('A');
        for (const id of ['glassBin', 'bioWaste', 'trashBin']) {
          await d.press(id, undefined, 0.5);
          d.dispatch({ type: 'inspect', target: id });
        }
        // Fichas del reto: cada muestra, fresca o permanente (decisión registrada, no un gesto de mano).
        ui.notebook(true, 'pre');
        for (const s of DIV_SPECIMENS) {
          d.dispatch({ type: 'classifySample', specimen: s, choice: fresh.has(s) ? 'fresh' : 'fixed' });
          await d.wait(0.15);
        }
        ui.edit((nb) => {
          nb.prereport = { hypothesis: 'La bacteria no mostrará núcleo ni nucléolo; los protistas y las plantas sí tienen núcleo', expected: 'Estomas, cilios o forma del protista, núcleo bucal', precautions: 'Aceite solo con 100X; sin sangre fresca; bisturí sobre la tabla' };
        });
        await d.wait(1.2);
        ui.notebook(false);
        d.station('C');
        await d.wait(0.6);
        d.dispatch({ type: 'inspect', target: 'mic' });
        for (const p of MICROSCOPE_PARTS) d.dispatch({ type: 'inspect', target: `mic:${p}` });
        await part(d, 'mic', 'power');
        d.station('B');
      },
    },
    {
      part: 'B', key: 'tradescantia',
      run: async (d) => {
        await d.carry('sl1', PREP_SPOT.x, PREP_SPOT.y);
        // Tira fina de epidermis con la pinza, al centro de la lámina; la pinza se limpia antes de otra muestra.
        await toolAt(d, 'fc', POT_POS.x, POT_POS.y);
        await d.moveTo(PREP_SPOT.x, PREP_SPOT.y);
        d.c.primary(false);
        await d.wait(0.5);
        const lp = d.w.objects.lp.pose;
        await d.moveTo(lp.x, lp.y);
        d.c.primary(false);
        await d.wait(0.3);
        await putDown(d, 172, 18);
        await toolAt(d, 'dw', PREP_SPOT.x, PREP_SPOT.y);
        await putDown(d, 196, 36);
        // Error deliberado: cubierta casi plana y de golpe → entra aire (consecuencia visible); luego se corrige.
        await toolAt(d, 'fc', COVER_BOX.x, COVER_BOX.y);
        await d.moveTo(PREP_SPOT.x, PREP_SPOT.y);
        for (let i = 0; i < 5; i++) {
          d.c.onKeyDown('q', false);
          await d.wait(0.05);
        }
        d.note(d.hooks.t('b06.demo.ui.mistake'));
        d.c.primary(true);
        await d.until(() => !d.c.lowering, 5);
        await d.wait(1.2);
        d.note(d.hooks.t('b06.demo.ui.recover'));
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
        await putDown(d, 172, 18);
      },
    },
    { part: 'C', key: 'observeTradescantia', run: (d) => observe(d, 'sl1', res.tradescantia) },
    {
      part: 'B', key: 'paramecium',
      run: async (d) => {
        d.station('B');
        await d.carry('sl3', PREP_SPOT.x, PREP_SPOT.y);
        // Gota de cultivo con su propio gotero y una gota de metilcelulosa para frenar a los ciliados.
        const homecuP = { ...d.w.objects.cuP.pose };
        await toolAt(d, 'cuP', PREP_SPOT.x, PREP_SPOT.y);
        await putDown(d, homecuP.x, homecuP.y);
        const homemc = { ...d.w.objects.mc.pose };
        await toolAt(d, 'mc', PREP_SPOT.x, PREP_SPOT.y);
        await putDown(d, homemc.x, homemc.y);
        d.dispatch({ type: 'labelSlide', slideId: 'sl3', label: 'paramecium' });
        await cover(d, PREP_SPOT.x, PREP_SPOT.y);
      },
    },
    {
      part: 'C', key: 'observeParamecium',
      run: (d) => observe(d, 'sl3', res.paramecium, false, async () => {
        // La movilidad se registra MIRANDO la muestra viva (antes de cualquier Lugol); la velocidad no se estima sin video.
        d.dispatch({ type: 'recordMotility', slideId: 'sl3' });
        await d.wait(1);
      }),
    },
    {
      part: 'B', key: 'euglena',
      run: async (d) => {
        d.station('B');
        await d.carry('sl4', PREP_SPOT.x, PREP_SPOT.y);
        // Euglena en su propia gota (sin viscosante): la comparación de formas no exige frenarla.
        const homecuE = { ...d.w.objects.cuE.pose };
        await toolAt(d, 'cuE', PREP_SPOT.x, PREP_SPOT.y);
        await putDown(d, homecuE.x, homecuE.y);
        d.dispatch({ type: 'labelSlide', slideId: 'sl4', label: 'euglena' });
        await cover(d, PREP_SPOT.x, PREP_SPOT.y);
      },
    },
    {
      part: 'C', key: 'observeEuglena',
      // Euglena es pequeña: a 4X no se distingue, se registra a 10X y 40X.
      run: (d) => observe(d, 'sl4', res.euglena, false, async () => {
        d.dispatch({ type: 'recordMotility', slideId: 'sl4' });
        await d.wait(1);
      }, 10),
    },
    {
      part: 'D', key: 'buccal',
      run: async (d) => {
        d.station('D');
        // Área animal separada: lámina propia, hisopo estéril, extendido en una dirección y el hisopo a residuos biológicos.
        await d.carry('sl2', PREP2_SPOT.x, PREP2_SPOT.y);
        await toolAt(d, 'sw1', CHEEK_POS.x, CHEEK_POS.y);
        await d.moveTo(PREP2_SPOT.x, PREP2_SPOT.y);
        await d.wait(0.3);
        d.c.primary(false);
        await d.wait(0.4);
        await putDown(d, BIO_WASTE.x, BIO_WASTE.y);
        const homemb = { ...d.w.objects.mb.pose };
        await toolAt(d, 'mb', PREP2_SPOT.x, PREP2_SPOT.y);
        await putDown(d, homemb.x, homemb.y);
        await cover(d, PREP2_SPOT.x, PREP2_SPOT.y);
      },
    },
    { part: 'C', key: 'observeBuccal', run: (d) => observe(d, 'sl2', res.buccal) },
    {
      part: 'E', key: 'fixed',
      run: async (d) => {
        d.station('C');
        await part(d, 'case', 'lid');
        // Los bacilos se distinguen desde 40X: se localiza a 4X y 10X y se registra a 40X.
        await fixedObs(d, 'fxB', res.bacillus, [40]);
      },
    },
    {
      part: 'E', key: 'blood',
      run: async (d) => {
        // Frotis ya teñido por el docente (sin punción): 10X para elegir la monocapa, 40X para las células.
        await fixedObs(d, 'fxS', res.blood, [10, 40]);
        await part(d, 'case', 'lid');
      },
    },
    {
      part: 'F', key: 'marks',
      run: async (d) => {
        const w = d.w;
        const hi = (k: keyof DemoRes) => res[k][res[k].length - 1];
        ui.notebook(true, 'marks');
        // Marcas: el punto sobre la captura (el dominio decide si la estructura está ahí y es visible).
        const mark = (obs: string | undefined, s: 'stoma' | 'parameciumCell' | 'erythrocyte' | 'leukocyte', x: number, y: number) => {
          const pt = obs ? inCapture(d, obs, x, y) : null;
          if (obs && pt) d.dispatch({ type: 'markRegion', observationId: obs, structure: s, u: pt[0], v: pt[1] });
        };
        const [sx, sy] = DIV_LAYOUT.stomata[0];
        mark(hi('tradescantia'), 'stoma', sx, sy);
        const [px, py, rx, , rot] = DIV_LAYOUT.paramecium[0];
        mark(hi('paramecium'), 'parameciumCell', px, py);
        mark(hi('blood'), 'erythrocyte', DIV_LAYOUT.rbc[0][0], DIV_LAYOUT.rbc[0][1]);
        mark(hi('blood'), 'leukocyte', DIV_LAYOUT.wbc[0][0], DIV_LAYOUT.wbc[0][1]);
        await d.wait(1);
        // Medición calibrada: extremos del eje mayor del Paramecium (px de la captura) → µm con su incertidumbre.
        const po = hi('paramecium');
        const a = po ? inCapture(d, po, px - Math.cos(rot) * rx, py - Math.sin(rot) * rx) : null;
        const b = po ? inCapture(d, po, px + Math.cos(rot) * rx, py + Math.sin(rot) * rx) : null;
        const N = w.params.div?.imagePx ?? 1000;
        if (po && a && b && w.div.scale.available) d.dispatch({ type: 'measure', observationId: po, ax: Math.round(a[0] * N), ay: Math.round(a[1] * N), bx: Math.round(b[0] * N), by: Math.round(b[1] * N), scale: 'calibration' });
        await d.wait(1.6);
        const m = w.div.measurements[w.div.measurements.length - 1];
        const oc = w.params.microscope.ocularX;
        ui.notebook(true, 'org');
        ui.edit((nb) => {
          const row = (obs: string | undefined, specimen: 'bacillus' | 'paramecium' | 'euglena' | 'tradescantia' | 'buccal', cellType: 'prokaryote' | 'eukaryote', group: 'bacteria' | 'protist' | 'plant' | 'animal', cells: 'uni' | 'multi') =>
            obs ? { observationId: obs, specimen, cellType, group, motility: specimen === 'paramecium' || specimen === 'euglena' ? 'moving' as const : 'notEvaluable' as const, cells, wall: 'inferred' as const, nucleus: 'inferred' as const } : null;
          nb.organisms = [
            row(hi('bacillus'), 'bacillus', 'prokaryote', 'bacteria', 'uni'),
            row(hi('paramecium'), 'paramecium', 'eukaryote', 'protist', 'uni'),
            row(hi('tradescantia'), 'tradescantia', 'eukaryote', 'plant', 'multi'),
            row(hi('buccal'), 'buccal', 'eukaryote', 'animal', 'multi'),
            row(hi('euglena'), 'euglena', 'eukaryote', 'protist', 'uni'),
          ].filter((r) => r !== null);
          const bl = hi('blood');
          if (bl) nb.blood = { observationId: bl, cells: ['erythrocyte', 'leukocyte'], nuclear: 'El leucocito tiene núcleo; el eritrocito no', contrast: 'Bueno', subtype: '' };
          const to = hi('tradescantia');
          if (to) nb.epidermis = { observationId: to, specimen: 'tradescantia', totalMag: String(oc * (w.observations[to].objectiveX ?? 40)), stoma: 'visible', chloroplasts: 'notVisible', limits: 'La apertura del estoma no se evalúa con una foto' };
          nb.bacteria = { observationId: hi('bacillus') ?? null, shape: 'Bacilos, algunos en cadenas', nucleolus: 'absent' };
          if (m) nb.morpho = [{ observationId: m.observationId, measurementId: m.id, pixels: String(m.rawPixelDistance), umPerPx: String(m.umPerPx), lengthUm: String(m.lengthUm), uncertaintyUm: String(m.uncertaintyUm), unit: 'um', lengthMm: String(m.lengthUm / 1000) }];
          nb.comparison = [
            { specimen: 'bacillus', domain: 'prokaryote', organization: 'uni', evidence: 'observed' },
            { specimen: 'paramecium', domain: 'eukaryote', organization: 'uni', evidence: 'observed' },
            { specimen: 'tradescantia', domain: 'eukaryote', organization: 'multi', evidence: 'observed' },
          ];
        });
        await d.wait(2.4);
        ui.notebook(true, 'morpho');
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
        ui.edit((nb) => {
          nb.open = { notes: 'Estomas con células oclusivas; Paramecium más lento con metilcelulosa', limitations: 'Sin video no hay velocidad; el núcleo de la bacteria no existe', errors: 'Cubierta bajada deprisa: entró aire; se levantó y se bajó inclinada' };
        });
        ui.notebook(true, 'close');
        d.dispatch({ type: 'closeBench' });
        await d.wait(2.4);
        ui.notebook(false);
      },
    },
  ];
}
