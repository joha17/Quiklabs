/**
 * Guion de la demostración de la Práctica 9 (§15): diez secuencias con la MANO VIRTUAL sobre el controlador real —
 * tomar y llevar, mojar el asa, gotear inclinando el gotero, pipeta (P aspira / U entrega), piseta sobre la balanza,
 * inclinar para decantar, botones de la campana, del emisor, de la centrífuga, del turbidímetro y de la cámara
 * espectral. Sin teletransporte ni respuestas ocultas: lo que la libreta registra son las lecturas que la demo hizo.
 * Las esperas pasivas (reposo del precipitado, centrifugado) se aceleran. No marca etapas, no genera nota ni se guarda.
 * Textos en `p9.demo.steps.<clave>` (locales/es/practice9.json).
 */
import type { DemoDirector09, DemoStep09 } from './director';
import type { P09Notebook, RowB } from '../../../practices/practice-09/notebook';
import { mouthOf } from '../../../engine/cations/layout';
import { vesselMl } from '../../../simulation/cation-analysis-world/world';
import { volumeMl } from '../../../simulation/cation-analysis-world/species';
import { CLEAN_POS, FLAME_POINT, PAD_POS, PAN_POS, TURB_POS, rackSlot, rotorSlot } from '../../../practices/practice-09/definition';

export interface DemoUiHooks09 {
  notebook(open: boolean, tab?: string): void;
  edit(fn: (nb: P09Notebook) => void): void;
}

/** Lecturas que la demo va dejando (para registrarlas en la libreta). */
interface DemoRes {
  atlas: Partial<Record<'ctlSr' | 'ctlK' | 'ctlNaK', string>>;
  supports: string[];
  observations: string[];
  turbidity: string[];
  masses: string[];
  spectra: string[];
  final: string[];
}

const last = (d: DemoDirector09) => d.w.readingOrder[d.w.readingOrder.length - 1];
const fmt = (x: number, dd = 2) => x.toFixed(dd).replace('.', ',');

/** Botón de un equipo (la mano lo señala y lo pulsa). */
async function button(d: DemoDirector09, id: string, part: string) {
  await d.press(id, undefined, 0.4);
  d.c.instrumentPart(id, part);
  d.endPress();
}

/** Destapa o tapa un frasco con el gesto de la tapa (clic sobre ella). */
async function cap(d: DemoDirector09, id: string, capped: boolean) {
  if (d.w.vessels[id]?.capped === capped || d.w.vessels[id]?.capped === undefined) return;
  await button(d, id, 'cap');
}

/** Tecla real del controlador sobre el objeto seleccionado (N observa el tubo, X observa la llama...). */
async function key(d: DemoDirector09, id: string | null, k: string) {
  if (id) await d.press(id, undefined, 0.3);
  d.c.onKeyDown(k, false);
  d.c.onKeyUp(k);
  d.endPress();
  await d.wait(0.3);
}

/** Lleva un objeto a un punto y lo suelta (el controlador decide el apoyo: gradilla, rotor, platillo, llama...). */
async function carry(d: DemoDirector09, id: string, at: { x: number; y: number }) {
  if (!(await d.grab(id))) return;
  await d.moveTo(at.x, at.y);
  await d.wait(0.2);
  await d.release();
}

/** Introduce la herramienta sostenida (asa o pipeta) por la boca de un recipiente. */
async function dipInto(d: DemoDirector09, target: string, depth = 2.5) {
  const m = mouthOf(d.w, target);
  if (!m) return;
  await d.moveTo(m.x, m.y);
  await d.toZ(m.z - depth);
  await d.until(() => d.w.objects[d.c.held?.id ?? '']?.support === target, 3);
}

async function liftOut(d: DemoDirector09) {
  await d.toZ(26);
  await d.wait(0.2);
}

/** Asa: al vaso de limpieza y P para limpiar el alambre. */
async function cleanLoop(d: DemoDirector09) {
  if (!(await d.grab('loop01'))) return;
  await dipInto(d, 'clean01', 1.5);
  await d.tapP();
  await liftOut(d);
  await d.moveTo(CLEAN_POS.x + 6, CLEAN_POS.y - 6);
  await d.release();
}

/** Asa limpia → mojar en `source` → a la llama → esperar a que emita → observar (X). */
async function loopTest(d: DemoDirector09, source: string) {
  await cap(d, source, false);
  if (!(await d.grab('loop01'))) return null;
  await dipInto(d, source);
  await d.wait(0.3);
  await liftOut(d);
  await d.moveTo(FLAME_POINT.x, FLAME_POINT.y);
  await d.release();
  await d.wait(1.8);
  await key(d, 'emitter01', 'x');
  const id = last(d);
  if (source.startsWith('ctl')) await cap(d, source, true);
  return id;
}

/** Pipeta: aspira con P hasta `ml` de `src` y entrega con U todo en `dst`. */
async function pipette(d: DemoDirector09, src: string, dst: string, ml: number) {
  await cap(d, src, false);
  if (!(await d.grab('pip'))) return;
  await dipInto(d, src, 4);
  d.c.primaryDown();
  await d.until(() => volumeMl(d.w.pipette.content) >= ml - 0.025, 30);
  d.c.primaryUp();
  await liftOut(d);
  if (src === 'smp1' || src.startsWith('ctl')) await cap(d, src, true);
  if (!(await d.grab('pip'))) return;
  await dipInto(d, dst, dst === 'wgFlame' || dst === 'cupFlame' ? 1 : 2);
  d.c.secondaryDown();
  await d.until(() => volumeMl(d.w.pipette.content) <= 1e-6, 30);
  d.c.secondaryUp();
  await liftOut(d);
  await d.moveTo(386, 12);
  await d.release();
}

/** Gotero inclinado sobre la boca del tubo: Mayús+P suelta cinco gotas, P una. */
async function drops(d: DemoDirector09, bottle: string, tube: string, n: number) {
  await cap(d, bottle, false);
  const back = { ...d.w.objects[bottle].pose };
  if (!(await d.grab(bottle))) return;
  const m = mouthOf(d.w, tube)!;
  await d.moveTo(m.x, m.y);
  await d.wait(0.3);
  for (let left = n; left > 0;) {
    const five = left >= 5;
    d.c.primaryDown(five);
    d.c.primaryUp();
    left -= five ? 5 : 1;
    await d.wait(0.35);
  }
  await d.moveTo(back.x, back.y);
  await d.release();
  await cap(d, bottle, true);
}

/** Mezclar sosteniendo el tubo (A) y devolverlo a la gradilla. */
async function mix(d: DemoDirector09, tube: string, slot: number) {
  if (!(await d.grab(tube))) return;
  d.c.shakeDown();
  await d.wait(3);
  d.c.shakeUp();
  const s = rackSlot(slot);
  await d.moveTo(s.x, s.y);
  await d.release();
}

/** Pesar: al platillo, esperar el indicador estable y leer (botón de la pantalla). */
async function weigh(d: DemoDirector09, tube: string) {
  await carry(d, tube, PAN_POS);
  if (!d.w.balance.powered) await button(d, 'balance01', 'power');
  await d.until(() => d.w.balance.stable, 15);
  await button(d, 'balance01', 'display');
  return last(d);
}

/** Contrapeso: el tubo `counter` en el platillo y piseta hasta la masa leída de `tube` (±0,1 g). */
async function counterweight(d: DemoDirector09, res: DemoRes, tube: string, tubeSlot: number, counter: string, counterSlot: number) {
  const rTube = await weigh(d, tube);
  res.masses.push(rTube);
  const goal = d.w.readings[rTube].value;
  await carry(d, tube, rackSlot(tubeSlot));
  await carry(d, counter, PAN_POS);
  await d.until(() => d.w.balance.stable, 15);
  if (await d.grab('washBottle')) {
    const m = mouthOf(d.w, counter)!;
    await d.moveTo(m.x - 2.5, m.y);
    await d.toZ(m.z + 1);
    for (let i = 0; i < 30; i++) {
      await d.until(() => d.w.balance.stable, 10);
      // Medio mililitro por apretón (2 mL con Mayús mientras falta mucho): se detiene dentro de ±0,25 g.
      const diff = goal - d.w.balance.shownG;
      if (diff < 0.25) break;
      d.c.primaryDown(diff > 2.6);
      d.c.primaryUp();
      await d.wait(0.4);
    }
    await d.moveTo(338, 24);
    await d.release();
  }
  await d.until(() => d.w.balance.stable, 15);
  await button(d, 'balance01', 'display');
  res.masses.push(last(d));
  await carry(d, counter, rackSlot(counterSlot));
}

/** Centrífuga: tapa abierta, tubos en posiciones opuestas, tapa cerrada, girar y esperar a que se detenga. */
async function centrifuge(d: DemoDirector09, a: string, aSlot: number, b: string, bSlot: number) {
  d.station('D');
  if (d.w.centrifuge.lidClosed) await button(d, 'cf01', 'lid');
  await carry(d, a, rotorSlot(0));
  await carry(d, b, rotorSlot(2));
  await button(d, 'cf01', 'lid');
  await button(d, 'cf01', 'spin');
  await d.simUntil(() => d.w.centrifuge.spinUntil === null && d.w.centrifuge.rpm < 0.5, 120, 10);
  await button(d, 'cf01', 'lid');
  await carry(d, a, rackSlot(aSlot));
  await carry(d, b, rackSlot(bSlot));
}

/** Decantar: el tubo sobre la boca del receptor, inclinación sostenida y suave (sin pasar de ~104°). */
async function decant(d: DemoDirector09, src: string, srcSlot: number, dst: string) {
  if (!(await d.grab(src))) return;
  const m = mouthOf(d.w, dst)!;
  await d.moveTo(m.x, m.y);
  await d.wait(0.3);
  const v = d.w.vessels[src];
  let lastMl = vesselMl(v);
  let quiet = 0;
  await d.until(() => {
    const h = d.c.held;
    if (!h) return true;
    const ml = vesselMl(v);
    const goal = Math.min(104, 100 - 88 * Math.min(1, ml / v.capacityMl) + 6);
    if (h.tilt < goal - 1) d.c.primaryDown();
    else d.c.primaryUp();
    quiet = h.tilt >= goal - 3 && lastMl - ml < 1e-5 ? quiet + 1 : 0;
    lastMl = ml;
    return quiet > 40;
  }, 60);
  d.c.primaryUp();
  await d.until(() => !d.w.pours[src], 5);
  const s = rackSlot(srcSlot);
  await d.moveTo(s.x, s.y);
  await d.release();
}

async function turbidity(d: DemoDirector09, res: DemoRes, tube: string, slot: number) {
  await carry(d, tube, TURB_POS);
  await button(d, 'turb01', 'read');
  res.turbidity.push(last(d));
  await carry(d, tube, rackSlot(slot));
}

/** Soporte de llama (vidrio virtual o refractario) con 0,2 mL de `source`, observado sobre el emisor y limpiado. */
async function padTest(d: DemoDirector09, support: 'wgFlame' | 'cupFlame', source: string) {
  const home = { ...d.w.objects[support].pose };
  await pipette(d, source, support, 0.2);
  await carry(d, support, PAD_POS);
  await d.wait(2.2);
  await key(d, 'emitter01', 'x');
  const id = last(d);
  await carry(d, support, home);
  d.dispatch({ type: 'cleanSupport', supportId: support });
  return id;
}

export function buildDemoScript09(ui: DemoUiHooks09): DemoStep09[] {
  const res: DemoRes = { atlas: {}, supports: [], observations: [], turbidity: [], masses: [], spectra: [], final: [] };
  return [
    {
      part: 'A', key: 'hypothesis',
      run: async (d) => {
        d.station('A');
        await d.press('smp1', undefined, 0.8);
        d.dispatch({ type: 'inspect', target: 'smp1' });
        ui.notebook(true, 'A');
        await d.wait(0.8);
        ui.edit((nb) => {
          nb.tableA['Sr2+'] = { predictedSolid: 'sulfate', predictedColor: 'crimson', reason: 'SrSO₄ es poco soluble; el Sr emite en el rojo' };
          nb.tableA['Fe3+'] = { predictedSolid: 'hydroxide', predictedColor: 'none', reason: 'Fe(OH)₃ es muy insoluble y pardo' };
          nb.tableA['K+'] = { predictedSolid: 'none', predictedColor: 'violet', reason: 'Las sales de K son solubles; violeta débil' };
          nb.tableA.savedAtS = d.w.timeS;
        });
        await d.wait(2.4);
        ui.notebook(false);
      },
    },
    {
      part: 'B', key: 'cleanControl',
      run: async (d) => {
        d.station('B');
        // Campana lista antes de encender: extracción, mampara a 40 cm y luz local a media potencia.
        await button(d, 'hood01', 'fan');
        await button(d, 'hood01', 'sashDown');
        await button(d, 'hood01', 'sashDown');
        await button(d, 'hood01', 'light');
        await button(d, 'emitter01', 'ignite');
        await cleanLoop(d);
        res.atlas.ctlSr = (await loopTest(d, 'ctlSr')) ?? undefined;
        if (res.atlas.ctlSr) res.supports.push(res.atlas.ctlSr);
        await cleanLoop(d);
      },
    },
    {
      part: 'B', key: 'contamination',
      run: async (d) => {
        res.atlas.ctlK = (await loopTest(d, 'ctlK')) ?? undefined;
        await cleanLoop(d);
        res.atlas.ctlNaK = (await loopTest(d, 'ctlNaK')) ?? undefined;
        await button(d, 'spec01', 'read');
        res.spectra.push(last(d));
        await cleanLoop(d);
      },
    },
    {
      part: 'C', key: 'hood',
      run: async (d) => {
        d.station('C');
        await d.press('hood01', undefined, 0.8);
        d.dispatch({ type: 'inspect', target: 'hood01' });
        await button(d, 'hood01', 'light');
        await d.wait(0.6);
        const k = await loopTest(d, 'ctlK');
        if (k) res.atlas.ctlK = k;
        // La línea de 766 nm del K es débil: ganancia ×4 en la cámara espectral (sin saturar el fondo de la llama).
        await button(d, 'spec01', 'gain');
        await button(d, 'spec01', 'read');
        res.spectra.push(last(d));
        await cleanLoop(d);
      },
    },
    {
      part: 'C', key: 'twoMethods',
      run: async (d) => {
        // Luz local 20 → 100 → 45 % (el regulador es cíclico).
        await button(d, 'hood01', 'light');
        await button(d, 'hood01', 'light');
        await d.press('wgFlame', undefined, 1);
        res.supports.push(await padTest(d, 'wgFlame', 'ctlSr'));
        await button(d, 'emitter01', 'ignite');
      },
    },
    {
      part: 'D', key: 'firstSeparation',
      run: async (d) => {
        d.station('D');
        await pipette(d, 'smp1', 'T1', 3.0);
        d.dispatch({ type: 'setLabel', vesselId: 'T1', label: d.w.unknown.code });
        await drops(d, 'dbSO4', 'T1', 14);
        await mix(d, 'T1', 0);
        await d.simUntil(() => false, 30, 10);
        await key(d, 'T1', 'n');
        res.observations.push(last(d));
      },
    },
    {
      part: 'D', key: 'fractionation',
      run: async (d) => {
        await counterweight(d, res, 'T1', 0, 'T4', 3);
        await centrifuge(d, 'T1', 0, 'T4', 3);
        await d.press('T1', undefined, 0.6);
        d.lab.camera?.eyeLevel('T1');
        await d.wait(1.2);
        await decant(d, 'T1', 0, 'T2');
        await key(d, 'T1', 'n');
        res.observations.push(last(d));
        await turbidity(d, res, 'T2', 1);
      },
    },
    {
      part: 'D', key: 'secondSeparation',
      run: async (d) => {
        await drops(d, 'dbOH', 'T2', 22);
        await mix(d, 'T2', 1);
        await d.simUntil(() => false, 30, 10);
        await key(d, 'T2', 'n');
        res.observations.push(last(d));
        // Contrapeso nuevo: el anterior ya pesa más que este tubo (no se le puede quitar agua sin otro error).
        await counterweight(d, res, 'T2', 1, 'T6', 5);
        await centrifuge(d, 'T2', 1, 'T6', 5);
        await decant(d, 'T2', 1, 'T3');
        await key(d, 'T2', 'n');
        res.observations.push(last(d));
        await turbidity(d, res, 'T3', 2);
      },
    },
    {
      part: 'E', key: 'confirmation',
      run: async (d) => {
        d.station('E');
        await button(d, 'hood01', 'light');
        await button(d, 'emitter01', 'ignite');
        await cleanLoop(d);
        const e = await loopTest(d, 'T3');
        if (e) res.final.push(e);
        await button(d, 'spec01', 'read');
        res.final.push(last(d));
        await cleanLoop(d);
        await button(d, 'emitter01', 'ignite');
      },
    },
    {
      part: 'F', key: 'conclusion',
      run: async (d) => {
        d.station('F');
        const w = d.w;
        const row = (id: string | undefined, contamination = ''): RowB => {
          const r = id ? w.readings[id] : undefined;
          return { readingId: id ?? null, color: (r?.category ?? '') as RowB['color'], intensity: !r ? '' : r.value > 0.6 ? 'strong' : r.value > 0.2 ? 'medium' : 'weak', lightPct: r ? String(r.snapshot.lightPct) : '', contamination };
        };
        const imp = (id: string | undefined) => {
          const r = id ? w.readings[id] : undefined;
          return r ? { value: fmt(r.value), uncertainty: fmt(r.standardUncertainty, 3), readingId: r.id, attemptId: 'demo' } : { value: '', uncertainty: '', readingId: null };
        };
        const statusOf = (ids: Array<string | undefined>, test: (rid: string) => boolean) => (ids.some((x) => x && w.readings[x] && test(x)) ? 'detected' : 'notDetected') as 'detected' | 'notDetected';
        ui.notebook(true, 'D');
        ui.edit((nb) => {
          nb.tableB.ctlSr = row(res.atlas.ctlSr);
          nb.tableB.ctlK = row(res.atlas.ctlK);
          nb.tableB.ctlNaK = row(res.atlas.ctlNaK, 'El Na enmascara el violeta del K');
          nb.tableC = { loopId: res.supports[0] ?? null, glassId: res.supports[1] ?? null, cupId: null, differences: 'El vidrio de reloj virtual prolonga la señal; solo es una representación.', glassRating: 'virtualOnly' };
          nb.tableD.sr = { tube: 'T1', reagent: 'sulfate', drops: '14', dropVolumeMl: '0,05', volumeAdded: { value: fmt(w.evidence['vol:T1:dbSO4'] ?? 0), uncertainty: '0,05', readingId: null }, turbidityId: res.turbidity[0] ?? null, observationId: res.observations[0] ?? null, solid: 'white', nuCation: '1', nuAnion: '1' };
          nb.tableD.fe = { tube: 'T2', reagent: 'hydroxide', drops: '22', dropVolumeMl: '0,05', volumeAdded: { value: fmt(w.evidence['vol:T2:dbOH'] ?? 0), uncertainty: '0,05', readingId: null }, turbidityId: res.turbidity[1] ?? null, observationId: res.observations[2] ?? null, solid: 'brown', nuCation: '1', nuAnion: '3' };
          nb.tableE.rows = [
            { tube: 'T1', counterTube: 'T4', massTube: imp(res.masses[0]), massCounter: imp(res.masses[1]), spinS: '60', decantedMl: { value: '', uncertainty: '', readingId: null }, losses: 'película en las paredes' },
            { tube: 'T2', counterTube: 'T6', massTube: imp(res.masses[2]), massCounter: imp(res.masses[3]), spinS: '60', decantedMl: { value: '', uncertainty: '', readingId: null }, losses: 'arrastre mínimo' },
          ];
        });
        await d.wait(2.4);
        ui.notebook(true, 'F');
        ui.edit((nb) => {
          const sr = statusOf([res.observations[0]], (x) => (w.readings[x].category ?? '').split('|')[0] === 'white');
          const fe = statusOf([res.observations[2]], (x) => (w.readings[x].category ?? '').startsWith('brown'));
          const k = statusOf(res.final, (x) => w.readings[x].valid && (['violet', 'lilac'].includes(w.readings[x].category ?? '') || (w.readings[x].lines ?? []).some((l) => Math.abs(l.nm - 766.5) < 1 && l.intensity > 0.02)));
          nb.tableF['Sr2+'] = { status: sr, evidenceIds: [res.observations[0], res.atlas.ctlSr].filter(Boolean) as string[], limitation: 'Por debajo del límite de detección no se vería el sólido.' };
          nb.tableF['Fe3+'] = { status: fe, evidenceIds: [res.observations[2], res.turbidity[1]].filter(Boolean) as string[], limitation: 'Un pardo tenue puede confundirse con el color de la solución.' };
          nb.tableF['K+'] = { status: k, evidenceIds: res.final.filter(Boolean), limitation: 'El Na puede enmascarar el violeta: se usó poca luz y la vista espectral.' };
          nb.tableF.kCharge = '+1';
        });
        await d.wait(2.4);
        ui.notebook(true, 'G');
        ui.edit((nb) => {
          nb.tableG = [
            { from: 'smp1', action: 'aliquot', to: 'T1' },
            { from: 'T1', action: 'sulfate', to: 'T1' },
            { from: 'T1', action: 'centrifuge', to: 'T1' },
            { from: 'T1', action: 'decant', to: 'T2' },
            { from: 'T2', action: 'hydroxide', to: 'T2' },
            { from: 'T2', action: 'decant', to: 'T3' },
            { from: 'T3', action: 'flame', to: 'T3' },
          ];
        });
        await d.wait(3);
        ui.notebook(false);
      },
    },
  ];
}
