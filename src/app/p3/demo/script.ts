/**
 * Guion de la demostración de la Práctica 3: la ruta correcta completa, paso a paso, con los mismos gestos que hará
 * el estudiante. Los textos de cada paso están en `p3.demo.steps.<clave>` (locales/es/practice3.json).
 */
import type { DemoDirector3, DemoStep3 } from './director';
import type { P3Notebook } from '../../../practices/practice-03/notebook';
import { BURNER, CAPSULE, LOOP, TILE } from '../../../practices/practice-03/instruments';
import { holderSlotPose, loopIdFor, SOLUTION_ROWS, UNKNOWN_ID, type SolutionRow } from '../../../practices/practice-03/definition';
import { regionToNotebook } from '../../../practices/practice-03/rubric';

export interface DemoUiHooks {
  notebook(open: boolean, tab?: string): void;
  edit(fn: (nb: P3Notebook) => void): void;
  parts(open: boolean, label: string | null): void;
}

const KNOWN: SolutionRow[] = ['sol_nacl', 'sol_kcl', 'sol_cacl2', 'sol_cucl2', 'sol_licl', 'sol_bacl2'];

/** Posiciones (cm de mesada) de cada parte del mechero y de la llave, para señalarlas. */
function partPoint(d: DemoDirector3, part: string): { x: number; y: number; z: number } {
  const b = d.w.objects.burner.pose;
  const tap = d.w.objects.gas_tap.pose;
  switch (part) {
    case 'base': return { x: b.x - 3, y: b.y - 2, z: 1 };
    case 'gasInlet': return { x: b.x + BURNER.inlet.dx, y: b.y + BURNER.inlet.dy, z: BURNER.inlet.z };
    case 'hose': return { ...d.w.hose.mid };
    case 'needleValve': return { x: b.x + BURNER.needleKnob.dx, y: b.y + BURNER.needleKnob.dy, z: BURNER.needleKnob.z + 0.4 };
    case 'airInlets': return { x: b.x + 0.4, y: b.y - 0.9, z: BURNER.collarZ + 0.6 };
    case 'airCollar': return { x: b.x + 0.4, y: b.y - 1, z: BURNER.collarZ - 0.3 };
    case 'barrel': return { x: b.x + 0.4, y: b.y - 0.8, z: 9 };
    case 'mouth': return { x: b.x + 0.4, y: b.y - 0.6, z: BURNER.mouthZ };
    default: return { x: tap.x + 1, y: tap.y - 1, z: tap.z + 1.5 };
  }
}

const PARTS = ['base', 'gasInlet', 'hose', 'needleValve', 'airInlets', 'airCollar', 'barrel', 'mouth', 'tableValve'];

/** Ajusta la aguja poco a poco hasta ver una llama de 10 cm en la regla. */
async function adjustTo10(d: DemoDirector3) {
  await d.press('burner', partPoint(d, 'needleValve'), 0.4);
  for (let i = 0; i < 60; i++) {
    const h = d.w.burner.flame.heightCm;
    if (Math.abs(h - 10) <= 0.4) break;
    d.c.setValve('NEEDLE', d.c.valveValue('NEEDLE') + (h < 10 ? 0.01 : -0.01));
    await d.wait(0.12);
  }
  d.endPress();
  d.note(d.hooks.t('p3.demo.ui.height', { h: d.w.burner.flame.heightCm.toFixed(0) }));
}

/** Pinza: sujetar la cápsula por el borde frontal, llevarla a la llama, mantenerla y dejarla en la placa. */
async function capsuleTest(d: DemoDirector3, aboveMouth: number, holdS: number) {
  const m = d.mouth;
  const tile = d.w.objects.tile.pose;
  d.look(m.x + 25, m.y, 8, 70, 0.35);
  await d.grab('tongs');
  const cap = d.w.objects.capsule.pose;
  await d.moveTo(cap.x, cap.y - CAPSULE.rimR);
  await d.toZ(cap.z + CAPSULE.height);
  await d.moveTo(cap.x, cap.y - CAPSULE.rimR, 10);
  await d.until(() => d.c.clampReady, 2);
  d.c.toggleClamp();
  if (!d.w.capsule.clampedBy) d.dispatch({ type: 'clamp', tongsId: 'tongs', targetId: 'capsule', grip: 0.9 });
  await d.wait(0.4);
  await d.toZ(m.z + aboveMouth + CAPSULE.height);
  await d.moveTo(m.x, m.y - CAPSULE.rimR);
  d.look(m.x, m.y, m.z + 4, 45, 0.15);
  await d.wait(holdS);
  d.look(m.x + 25, m.y, 8, 70, 0.35);
  await d.moveTo(tile.x, tile.y - CAPSULE.rimR);
  await d.toZ(TILE.h + CAPSULE.height + 0.2);
  await d.release();
  if (d.w.objects.capsule.support !== 'tile') {
    d.dispatch({ type: 'unclamp', tongsId: 'tongs' });
    d.dispatch({ type: 'setPose', id: 'capsule', pose: { x: tile.x, y: tile.y, z: TILE.h, rotationRad: 0 }, support: 'tile' });
  }
}

/** Mantiene el asa apartada de la llama hasta que se enfría (no se mete un asa caliente en el tubo). */
async function coolLoop(d: DemoDirector3, loop: string) {
  const m = d.mouth;
  await d.moveTo(m.x - 22, m.y - 8);
  await d.until(() => (d.w.loops[loop]?.temperatureC ?? 0) < 50, 25);
}

/** Lleva el asa a la región óptima de la llama: sobre la punta del cono interno. */
async function toFlame(d: DemoDirector3) {
  const m = d.mouth;
  await d.toZ(m.z + Math.max(2, d.w.burner.flame.innerConeHeightCm * 1.15));
  await d.moveTo(m.x, m.y);
}

/** Carga: acercar el asa a la boca de su tubo (entra sola, imán) y retirarla con la muestra. */
async function load(d: DemoDirector3, sol: string, loop: string) {
  const tube = d.w.objects[sol].pose;
  await d.toZ(d.mouth.z + 4.5);
  await d.moveTo(tube.x, tube.y);
  if (!(await d.until(() => (d.w.loops[loop]?.surfaceWaterMg ?? 0) > 1, 3))) {
    console.warn(`[demo p3] respaldo: carga de ${loop}`);
  }
  await d.wait(0.6);
}

function seen(d: DemoDirector3, sol: string, filtered: boolean) {
  const o = d.w.observations[sol];
  const r = filtered ? o?.filter?.region : o?.noFilter?.region;
  return d.hooks.t(`p3.color.${regionToNotebook(r) || 'sin_cambio'}`);
}

/** Prueba completa de una disolución: comprobar el asa, cargar, sin filtro, con vidrio de cobalto, guardar. */
async function testSolution(d: DemoDirector3, sol: string, slot: number, explain: boolean) {
  const loop = loopIdFor(sol);
  const m = d.mouth;
  d.look(m.x - 40, m.y, 10, 105, 0.45);
  await d.grab(loop);
  // 1) Comprobación de limpieza: el asa vacía no debe cambiar el color de la llama.
  if (explain) d.note(d.hooks.t('p3.demo.ui.cleanCheck'));
  await toFlame(d);
  await d.wait(2.4);
  await coolLoop(d, loop);
  // 2) Cargar y observar sin filtro.
  if (explain) d.note(d.hooks.t('p3.demo.ui.load'));
  await load(d, sol, loop);
  if (explain) d.station('D');
  await toFlame(d);
  await d.until(() => !!d.w.observations[sol]?.noFilter, 4);
  await d.wait(2.5);
  d.note(d.hooks.t('p3.demo.ui.seenNoFilter', { label: d.w.solutions[sol].label, c: seen(d, sol, false) }));
  // 3) Recargar y observar a través del vidrio de cobalto (la otra mano lo sostiene frente a la vista).
  if (explain) d.look(m.x - 40, m.y, 10, 105, 0.45);
  await coolLoop(d, loop);
  await load(d, sol, loop);
  d.station('D');
  await toFlame(d);
  d.c.alignGlass();
  await d.until(() => !!d.w.observations[sol]?.filter, 4);
  await d.wait(2.5);
  d.note(d.hooks.t('p3.demo.ui.seenFilter', { label: d.w.solutions[sol].label, c: seen(d, sol, true) }));
  d.c.alignGlass();
  // 4) Enfriar y devolver a su ranura.
  d.look(m.x - 40, m.y, 10, 105, 0.45);
  await coolLoop(d, loop);
  const s = holderSlotPose(slot);
  await d.toZ(LOOP.holderRingZ + 2.5);
  await d.moveTo(s.x, s.y);
  await d.release();
  if (!d.w.objects[loop]?.support.startsWith('holder:')) {
    d.dispatch({ type: 'setPose', id: loop, pose: s, support: `holder:${slot}` });
  }
}

export function buildDemoScript3(ui: DemoUiHooks): DemoStep3[] {
  return [
    // ════════════════ A. Mechero ════════════════
    {
      part: 'A',
      key: 'ppe',
      run: async (d) => {
        d.station('A');
        await d.wait(5);
      },
    },
    {
      part: 'A',
      key: 'safety',
      run: async (d) => {
        d.look(110, 60, 28, 140, 0.3);
        for (const id of ['extinguisher', 'blanket', 'estop']) {
          await d.press(id, undefined, 1.2);
          d.dispatch({ type: 'inspect', target: id });
        }
        await d.press('extractor', undefined, 1);
        d.dispatch({ type: 'setExtraction', on: true });
        await d.wait(1.2);
        d.endPress();
      },
    },
    {
      part: 'A',
      key: 'inspect',
      run: async (d) => {
        d.station('A');
        await d.press('hose', undefined, 1.2);
        d.dispatch({ type: 'inspect', target: 'hose' });
        await d.wait(1.2);
        await d.press('burner', partPoint(d, 'needleValve'), 1.2);
        d.dispatch({ type: 'inspect', target: 'burner' });
        d.note(d.hooks.t('p3.demo.ui.valvesClosed'));
        await d.wait(2.5);
        d.endPress();
      },
    },
    {
      part: 'A',
      key: 'parts',
      run: async (d) => {
        const b = d.w.objects.burner.pose;
        d.look(b.x + 8, b.y, 8, 55, 0.3);
        ui.parts(true, null);
        for (const p of PARTS) {
          ui.parts(true, p);
          await d.press(null, partPoint(d, p), 1.1);
          d.dispatch({ type: 'identifyPart', part: p, answer: p });
          await d.wait(0.4);
        }
        ui.parts(true, null);
        await d.wait(1);
        ui.parts(false, null);
        d.endPress();
      },
    },
    {
      part: 'A',
      key: 'connect',
      run: async (d) => {
        d.station('A');
        await d.press('burner', partPoint(d, 'gasInlet'), 1);
        d.dispatch({ type: 'connectHose', connected: true });
        await d.wait(1);
        await d.press('gas_tap', partPoint(d, 'tableValve'), 0.6);
        await d.turnValve('TABLE', 1, 1.2);
        d.endPress();
        await d.wait(0.8);
      },
    },
    {
      part: 'A',
      key: 'ignite',
      run: async (d) => {
        const m = d.mouth;
        d.look(m.x, m.y, 10, 55, 0.25);
        await d.grab('lighter');
        await d.moveTo(m.x + 1, m.y);
        await d.wait(0.5);
        d.c.primaryDown();
        await d.wait(0.6);
        // La otra mano abre la aguja lentamente mientras el encendedor chispea en la boca.
        await d.turnValve('NEEDLE', 0.3, 1.6);
        await d.until(() => d.w.burner.litOnceAt !== null, 3);
        await d.wait(0.4);
        d.c.primaryUp();
        await d.moveTo(m.x - 30, m.y - 18);
        await d.release();
        if (d.w.burner.litOnceAt === null) {
          console.warn('[demo p3] respaldo: encendido');
          d.dispatch({ type: 'setPose', id: 'lighter', pose: { x: m.x + 1, y: m.y, z: m.z + 0.6, rotationRad: 0 }, support: 'hand' });
          d.dispatch({ type: 'spark', on: true });
          await d.wait(0.3);
          d.dispatch({ type: 'spark', on: false });
          d.dispatch({ type: 'setPose', id: 'lighter', pose: { x: m.x - 30, y: m.y - 18, z: 1.2, rotationRad: 0 }, support: 'bench' });
        }
        await d.wait(1);
      },
    },
    {
      part: 'A',
      key: 'yellow',
      run: async (d) => {
        d.station('D');
        await d.wait(1);
        await adjustTo10(d);
        await d.wait(4);
      },
    },
    // ════════════════ B. Combustión ════════════════
    {
      part: 'B',
      key: 'capsule1',
      run: async (d) => {
        await capsuleTest(d, 5, 10);
        const c = d.w.objects.capsule.pose;
        d.look(c.x, c.y, 1, 26, 0.12);
        d.note(d.hooks.t('p3.demo.ui.soot', { mg: d.w.capsule.sootMassMg.toFixed(2).replace('.', ',') }));
        await d.wait(4);
      },
    },
    {
      part: 'B',
      key: 'blue',
      run: async (d) => {
        d.station('D');
        await d.press('burner', partPoint(d, 'airCollar'), 0.6);
        await d.turnValve('AIR', 0.25, 2);
        await d.wait(1.5);
        await d.turnValve('AIR', 0.65, 2.5);
        d.endPress();
        await adjustTo10(d);
        await d.wait(4);
      },
    },
    {
      part: 'B',
      key: 'clean',
      run: async (d) => {
        const c = d.w.objects.capsule.pose;
        d.look(c.x, c.y, 2, 40, 0.5);
        await d.simUntil(() => d.w.objects.capsule.temperatureC < 44, 600, 20);
        for (let i = 0; i < 3 && d.w.capsule.sootMassMg > 0.004; i++) {
          await d.carry('cloth', c.x, c.y);
          await d.wait(0.5);
        }
        if (d.w.capsule.sootMassMg > 0.05) for (let i = 0; i < 3; i++) d.dispatch({ type: 'wipeCapsule' });
        await d.wait(1);
      },
    },
    {
      part: 'B',
      key: 'capsule2',
      run: async (d) => {
        await capsuleTest(d, 4, 9);
        const c = d.w.objects.capsule.pose;
        d.look(c.x, c.y, 1, 26, 0.12);
        const ex = d.w.capsule.exposures;
        const last = ex[ex.length - 1];
        d.note(d.hooks.t('p3.demo.ui.noSoot', { t: Math.round(last?.maxTempC ?? 0) }));
        await d.wait(4);
      },
    },
    // ════════════════ C. Cationes ════════════════
    {
      part: 'C',
      key: 'solutions',
      run: async (d) => {
        const r = d.w.objects.rack.pose;
        d.look(r.x, r.y, 4, 45, 0.35);
        for (const sol of ['sol_nacl', 'sol_cucl2']) {
          await d.press(sol, undefined, 1.4);
          d.dispatch({ type: 'inspect', target: sol });
        }
        d.endPress();
        await d.wait(2);
      },
    },
    {
      part: 'C',
      key: 'known',
      run: async (d) => {
        for (let i = 0; i < KNOWN.length; i++) {
          const go = () => testSolution(d, KNOWN[i], i, i < 2);
          if (i < 2) await go();
          else await d.fast(3, go);
          if (i === 1) d.note(d.hooks.t('p3.demo.ui.repeat'));
        }
      },
    },
    // ════════════════ D. Mezcla Na/K ════════════════
    {
      part: 'D',
      key: 'mix',
      run: async (d) => {
        await testSolution(d, 'sol_mix', SOLUTION_ROWS.indexOf('sol_mix'), true);
        d.note(d.hooks.t('p3.demo.ui.mix'));
        await d.wait(4);
      },
    },
    // ════════════════ E. Incógnita, libreta y apagado ════════════════
    {
      part: 'E',
      key: 'unknown',
      run: async (d) => {
        await testSolution(d, UNKNOWN_ID, SOLUTION_ROWS.indexOf(UNKNOWN_ID), false);
        await d.wait(1);
      },
    },
    {
      part: 'E',
      key: 'notebook',
      run: async (d) => {
        ui.notebook(true, 't33');
        await d.wait(1);
        const w = d.w;
        ui.edit((nb) => {
          nb.table32.initial = { color: 'amarillo', shape: 'irregular', luminosity: 'luminosa', soot: '', interpretation: '', updatedAt: Math.round(w.timeS) };
          nb.table32.capsule1 = { color: 'amarillo', shape: 'irregular', luminosity: 'luminosa', soot: 'negro', interpretation: '', updatedAt: Math.round(w.timeS) };
          nb.table32.airOpen = { color: 'azul', shape: 'dos_conos', luminosity: 'no_luminosa', soot: '', interpretation: '', updatedAt: Math.round(w.timeS) };
          nb.table32.capsule2 = { color: 'azul', shape: 'dos_conos', luminosity: 'no_luminosa', soot: 'no', interpretation: '', updatedAt: Math.round(w.timeS) };
          for (const r of SOLUTION_ROWS) {
            const o = w.observations[r];
            nb.table33[r] = {
              solutionColor: w.solutions[r].displayColor === 0xf4f8fb ? 'incolora' : 'azul_verdosa_palida',
              noFilter: regionToNotebook(o?.noFilter?.region),
              filter: regionToNotebook(o?.filter?.region),
              intensity: 'intensa_breve',
              observations: '',
              updatedAt: Math.round(w.timeS),
            };
          }
        });
        await d.wait(3);
        // Comparar la incógnita con los patrones propios (sin y con filtro).
        const u = w.observations[UNKNOWN_ID];
        const match = KNOWN.find((s) => w.observations[s]?.noFilter?.region === u?.noFilter?.region && w.observations[s]?.filter?.region === u?.filter?.region)
          ?? KNOWN.find((s) => w.observations[s]?.noFilter?.region === u?.noFilter?.region);
        if (match) {
          const cation = Object.keys(w.solutions[match].species)[0];
          ui.notebook(true, 'unknown');
          ui.edit((nb) => {
            nb.unknown.identity = cation;
            nb.unknown.confidence = 'alta';
            nb.unknown.justification = d.hooks.t('p3.demo.ui.justify', { label: w.solutions[match].label });
          });
          d.note(d.hooks.t('p3.demo.ui.unknownMatch', { label: w.solutions[match].label }));
        }
        await d.wait(4);
        d.note(d.hooks.t('p3.demo.ui.questionsYours'));
        await d.wait(3);
        ui.notebook(false);
      },
    },
    {
      part: 'E',
      key: 'shutdown',
      run: async (d) => {
        d.station('A');
        await d.press('burner', partPoint(d, 'airCollar'), 0.6);
        await d.turnValve('AIR', 0, 1);
        await d.press('burner', partPoint(d, 'needleValve'), 0.6);
        await d.turnValve('NEEDLE', 0, 1);
        await d.press('gas_tap', partPoint(d, 'tableValve'), 0.6);
        await d.turnValve('TABLE', 0, 1);
        await d.press('burner', partPoint(d, 'mouth'), 1);
        d.dispatch({ type: 'inspect', target: 'burner' });
        d.endPress();
        await d.wait(1);
        await d.simUntil(() => d.w.burner.bodyTemperatureC < 55 && d.w.objects.capsule.temperatureC < 55, 900, 20);
        await d.wait(1.5);
      },
    },
  ];
}
