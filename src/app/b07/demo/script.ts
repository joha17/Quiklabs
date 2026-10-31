/**
 * Guion de la demostración de B07 (§16): la MANO VIRTUAL sobre el controlador real revisa el puesto, lee y clasifica los
 * medios, compara placas, traza dos distribuciones, prepara un frotis simulado con el asa, lo tiñe por fases con sus
 * lavados, revisa los controles y el frotis al microscopio con enfoque mirando, mide una colonia con escala y cierra. No
 * marca etapas, no genera nota ni se guarda. Textos en `b07.demo.steps.<clave>`.
 */
import type { DemoDirectorB07, DemoStepB07 } from './director';
import { colonyRow, type B07Notebook } from '../../../practices/practice-b07/notebook';
import { CLEAN_TRAY, STAGE_SEAT, caseSlotIndex, caseSlotPos } from '../../../simulation/optical-world/geometry';
import { LOOP_POS, PLATE_TRAY, SMEAR_PAD, STAIN_RACK, VIEWER } from '../../../simulation/micro-world/geometry';
import { MEDIA, type MediumId } from '../../../simulation/micro-world/model';
import { coloniesOf } from '../../../simulation/micro-world/world';
import type { MicroController } from '../../../engine/optical/microController';
import { microscopeView } from '../../../simulation/optical-world/world';
import type { KnobB01 as KnobB07 } from '../../../engine/optical/controller';
import { KIN, type PartGrip } from '../../../engine/optical/parts';

export interface DemoUiHooksB07 {
  notebook(open: boolean, tab?: string): void;
  edit(fn: (nb: B07Notebook) => void): void;
}

const last = (d: DemoDirectorB07) => d.w.observationOrder[d.w.observationOrder.length - 1];

/** Parte de un instrumento que se pulsa (interruptor, ocular, tapa): la mano la señala y hace clic. */
async function part(d: DemoDirectorB07, id: string, p: string) {
  d.pointPart(id, p);
  await d.wait(0.4);
  d.c.instrumentPart(id, p);
  d.endPress();
}

const rotary = (axis: PartGrip['axis']): PartGrip => ({ kind: 'rotary', axis });
/** Pieza 3D de cada mando y su giro por paso de la mano (rad, el mismo paso que Q/E en unidades del dominio). */
const PIECE: Partial<Record<KnobB07, { id: string; part: string; grip: PartGrip; rad: number }>> = {
  'mic:coarse': { id: 'mic', part: 'coarse', grip: rotary('x'), rad: 0.1 * KIN.radPerTurn },
  'mic:fine': { id: 'mic', part: 'fine', grip: rotary('x'), rad: 0.05 * KIN.radPerTurn },
  'mic:diaphragm': { id: 'mic', part: 'diaphragm', grip: { kind: 'lever', axis: 'y' }, rad: 0.02 * KIN.irisRadPer01 },
  'mic:turret': { id: 'mic', part: 'turret', grip: rotary('y'), rad: 12 * KIN.turretRadPerDeg },
  'ste:zoom': { id: 'ste', part: 'zoom', grip: rotary('x'), rad: 0.1 * KIN.zoomRadPerX },
  'ste:focus': { id: 'ste', part: 'focus', grip: rotary('x'), rad: 0.25 * KIN.radPerTurn },
};

/** Toma la pieza del mando, la gira mientras dure `fn` (cada `step(dir)` es un paso) y la suelta. */
async function hold(d: DemoDirectorB07, knob: KnobB07, fn: (step: (dir: number, big?: boolean) => void) => Promise<void>) {
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
async function turn(d: DemoDirectorB07, knob: KnobB07, dir: 1 | -1, n: number, big = false) {
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
async function lever(d: DemoDirectorB07, open: boolean) {
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
async function focusCompound(d: DemoDirectorB07) {
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
async function towardSharpest(d: DemoDirectorB07, sharp: () => number, step: (dir: number) => void) {
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
async function capture(d: DemoDirectorB07) {
  if (d.w.view.instrument === null) d.c.toggleEyepiece('compound');
  await d.wait(d.w.params.observationHoldS + 0.4);
  d.c.onKeyDown('c', false);
  await d.wait(0.4);
  return last(d);
}

/** Herramienta a un punto y P. */
async function toolAt(d: DemoDirectorB07, tool: string, x: number, y: number, strong = false) {
  if (d.c.held?.id !== tool && !(await d.grab(tool))) return;
  await d.moveTo(x, y);
  await d.wait(0.3);
  d.c.primary(strong);
  await d.wait(0.5);
}

async function putDown(d: DemoDirectorB07, x: number, y: number) {
  if (!d.c.held) return;
  await d.moveTo(x, y);
  await d.release();
}

/**
 * Lámina a la platina, 4X → 10X → 40X con enfoque mirando, capturas a 4X y 40X, y retiro a la bandeja. Con `to100`,
 * además el 100X (objetivo negro): solo con el micrométrico, porque queda a medio milímetro del cubreobjetos.
 */
async function observe(d: DemoDirectorB07, slide: string, out: string[], to100 = false, whileViewing?: () => Promise<void>, lowAt: 4 | 10 = 4) {
  d.station('E');
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
async function fixedObs(d: DemoDirectorB07, id: string, out: string[], at: Array<10 | 40>) {
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

const HIGH = (w: DemoDirectorB07['w'], obs: string[]) => obs.filter(Boolean).reverse().find((id) => w.observations[id]?.isObservationValid) ?? null;

export function buildDemoScriptB07(ui: DemoUiHooksB07): DemoStepB07[] {
  const res = { own: [] as string[], pos: [] as string[], neg: [] as string[] };
  let readA = '';
  let readB = '';
  let colA = '';
  let trialA = '';
  let trialB = '';
  return [
    {
      part: 'A', key: 'safety',
      run: async (d) => {
        d.station('A');
        for (const id of ['glassBin', 'bioWaste', 'trashBin']) {
          await d.press(id, undefined, 0.5);
          d.dispatch({ type: 'inspect', target: id });
        }
        ui.notebook(true, 'pre');
        ui.edit((nb) => {
          nb.prereport = { hypothesis: 'Las colonias de la placa asignada corresponderán a un organismo; el Gram orienta la pared, no la especie', expected: 'Lectura contrastada con los dos controles', precautions: 'Placas selladas; sin llama; aceite solo con 100X' };
        });
        await d.wait(1.2);
        ui.notebook(false);
      },
    },
    {
      part: 'A', key: 'media',
      run: async (d) => {
        for (const id of ['mNA', 'mEMB', 'mNB'] as const) {
          await d.press(id, undefined, 0.5);
          d.dispatch({ type: 'inspectMedia', mediaId: id });
          await d.wait(0.5);
          d.dispatch({ type: 'classifyMedia', mediaId: id, consistency: MEDIA[id].consistency, func: MEDIA[id].func });
        }
        d.dispatch({ type: 'commitMedia' });
        ui.notebook(true, 'media');
        ui.edit((nb) => {
          for (const r of nb.media) {
            const m = MEDIA[r.mediaId as MediumId];
            Object.assign(r, { consistency: m.consistency, formulation: m.formulation, func: m.func, compositionSource: 'card', appearance: 'Según ficha autorizada', justification: 'Lo declara la ficha' });
            if (r.mediaId === 'mEMB') Object.assign(r, { selectiveMeans: 'inhibits', differentialMeans: 'distinguishes' });
          }
        });
        await d.wait(1.6);
        ui.notebook(false);
      },
    },
    {
      part: 'B', key: 'plates',
      run: async (d) => {
        d.station('B');
        for (const id of ['plC', 'plB', 'plA']) {
          await d.carry(id, VIEWER.x, VIEWER.y);
          await d.wait(0.8);
          if (id === 'plA' || id === 'plB') {
            const c = coloniesOf(d.w, id)[0];
            const r = d.dispatch({ type: 'recordColony', plateId: id, colonyId: c.id });
            if (id === 'plA') {
              readA = r.id ?? '';
              colA = c.id;
            } else readB = r.id ?? '';
          }
          if (id !== 'plA') await d.carry(id, PLATE_TRAY.x, PLATE_TRAY.y);
        }
      },
    },
    {
      part: 'B', key: 'distribution',
      run: async (d) => {
        const zone = (x0: number, y0: number) => [[x0, y0], [x0 + 2, y0], [x0, y0 + 0.6], [x0 + 2, y0 + 0.6]];
        trialA = d.dispatch({ type: 'strokePlate', technique: 'fourZone', strokes: [zone(-3, -3), zone(1, -3), zone(1, 1.4), zone(-3, 1.4)] }).id ?? '';
        await d.wait(1.2);
        trialB = d.dispatch({ type: 'strokePlate', technique: 'single', strokes: [[[-3, 0], [3, 0]]] }).id ?? '';
        await d.wait(1.2);
        d.dispatch({ type: 'compareMethods' });
      },
    },
    {
      part: 'D', key: 'smear',
      run: async (d) => {
        (d.c as MicroController).selectedColony = colA;
        await toolAt(d, 'loop', VIEWER.x, VIEWER.y);
        await putDown(d, LOOP_POS.x, LOOP_POS.y);
        d.station('D');
        await d.carry('sl1', SMEAR_PAD.x, SMEAR_PAD.y);
        await toolAt(d, 'loop', SMEAR_PAD.x, SMEAR_PAD.y);
        await putDown(d, SMEAR_PAD.x - 18, SMEAR_PAD.y);
        await d.until(() => !!d.w.evidence['dried:sl1'], 30);
        d.dispatch({ type: 'markSmearDry', slideId: 'sl1' });
        await d.carry('sl1', STAIN_RACK.x, STAIN_RACK.y);
      },
    },
    {
      part: 'D', key: 'stain',
      run: async (d) => {
        for (const b of ['stP', 'stM', 'stD', 'stC']) {
          const home = d.w.objects[b].pose;
          const [hx, hy] = [home.x, home.y];
          await toolAt(d, b, STAIN_RACK.x, STAIN_RACK.y);
          await putDown(d, hx, hy);
          const wash = d.w.objects.stW.pose;
          const [wx, wy] = [wash.x, wash.y];
          await toolAt(d, 'stW', STAIN_RACK.x, STAIN_RACK.y);
          await putDown(d, wx, wy);
        }
      },
    },
    {
      part: 'E', key: 'controls',
      run: async (d) => {
        d.station('E');
        await part(d, 'mic', 'power');
        await part(d, 'case', 'lid');
        await fixedObs(d, 'fxP', res.pos, [40]);
        await fixedObs(d, 'fxN', res.neg, [40]);
        await part(d, 'case', 'lid');
      },
    },
    { part: 'E', key: 'observe', run: (d) => observe(d, 'sl1', res.own) },
    {
      part: 'F', key: 'measure',
      run: async (d) => {
        d.station('C');
        const w = d.w;
        const c = coloniesOf(w, 'plA')[0];
        const dm = d.dispatch({ type: 'measureColony', plateId: 'plA', colonyId: c.id, ax: c.x - c.rPx, ay: c.y, bx: c.x + c.rPx, by: c.y, scale: 'calibration' }).id ?? '';
        await d.wait(1.6);
        const m = w.micro.measures.find((x) => x.id === dm);
        const b = coloniesOf(w, 'plB')[0];
        const hi = HIGH(w, res.own);
        const row = (read: string, plateId: string, k: typeof c) => ({ ...colonyRow(), readingId: read, plateId, colonyId: k.id, form: k.form, margin: k.margin, elevation: k.elevation, surface: k.surface, pigment: k.pigment, count: String(coloniesOf(w, plateId).length), countUnit: 'visibleColonies' as const, identity: 'preliminary' as const, borderDeclared: !!k.hiddenEdge });
        ui.notebook(true, 'colony');
        ui.edit((nb) => {
          nb.colonies = [
            { ...row(readA, 'plA', c), measureId: m?.id ?? null, diameter: m ? m.mm.toFixed(2) : '', uncertainty: m ? m.uMm.toFixed(2) : '', unit: m ? 'mm' : '' },
            row(readB, 'plB', b),
          ];
          nb.techniques = [trialA, trialB].map((id) => {
            const x = w.micro.trials.find((q) => q.id === id);
            return { trialId: id, technique: x?.technique ?? '', overlap: x ? x.overlap01.toFixed(2) : '', separation: x ? x.separation01.toFixed(2) : '', limits: 'Índice geométrico, no un recuento', replicates: false };
          });
          const look = hi ? w.observations[hi] : null;
          nb.gram = [{ observationId: hi, sampleCode: 'U1', controlPosObs: HIGH(w, res.pos), controlNegObs: HIGH(w, res.neg), quality: 'Fases completas, lavadas', color: 'violet', shape: 'cocci', interpretation: 'gram-positive', species: '', limits: 'El Gram orienta la pared; no da la especie', membraneVisible: false, negativeStainSame: false }];
          nb.optics = [{ observationId: hi, objective: String(look?.objectiveX ?? ''), ocular: String(w.params.microscope.ocularX), totalMag: String(w.params.microscope.ocularX * (look?.objectiveX ?? 0)), oil: false, focus: 'Nítido', zone: 'Central' }];
          nb.integrative = { hypothesis: 'Un organismo Gram positivo en la placa A', medium: 'Agar nutritivo, general', colony: 'Circular, borde entero, convexa', gram: 'Cocos violeta, igual que el control positivo', contradictions: 'Ninguna en esta muestra', confidence: 'Media', claim: 'preliminary', conclusion: 'Compatible con un organismo Gram positivo; no se afirma especie', nextTest: 'Una prueba bioquímica, solo como propuesta conceptual' };
        });
        await d.wait(2.4);
        ui.notebook(true, 'gram');
        await d.wait(2);
        ui.notebook(false);
      },
    },
    {
      part: 'F', key: 'close',
      run: async (d) => {
        d.station('B');
        await d.carry('plA', PLATE_TRAY.x, PLATE_TRAY.y);
        d.station('E');
        await part(d, 'mic', 'power');
        d.station('F');
        ui.edit((nb) => {
          nb.open = { notes: 'Colonias crema, cocos violeta frente a los controles', limitations: 'Imágenes ilustrativas; sin especie', errors: 'Sin incidencias' };
        });
        ui.notebook(true, 'close');
        d.dispatch({ type: 'closeBench' });
        await d.wait(2.4);
        ui.notebook(false);
      },
    },
  ];
}
