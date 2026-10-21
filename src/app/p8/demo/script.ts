/**
 * Guion de la demostración de la Práctica 8 (§16), para la ruta elegida en la intro (ISO, ASA o MS). La mano virtual
 * usa los mismos gestos del estudiante (tomar y llevar, verter inclinando, gotero, espátula, piseta, embudo) y los
 * mismos botones de los equipos. Muestra una consecuencia deliberada no destructiva (lectura de la probeta con
 * paralaje) y su corrección a la altura del ojo. Las esperas pasivas se aceleran sin comandos privilegiados. No marca
 * etapas, no genera nota ni se guarda. Textos en `p8.demo.steps.<clave>` (locales/es/practice8.json).
 */
import type { DemoDirector08, DemoStep08 } from './director';
import type { P08Notebook } from '../../../practices/practice-08/notebook';
import type { RouteId } from '../../../simulation/organic-world/types';
import { buchnerMouth, levelsZ, mouthOf, supportPoint } from '../../../engine/organic/layout';
import { phasesOf, vesselMl } from '../../../simulation/organic-world/world';
import { liquidMl, massG } from '../../../simulation/organic-chemistry/species';
import { PAN_POS } from '../../../practices/practice-08/definition';
import { ROUTES08 } from '../../../practices/practice-08/routes';
import { declaredPurity, plannedLimiting, rowMoles } from '../../../practices/practice-08/expected-results';

export interface DemoUiHooks08 {
  notebook(open: boolean, tab?: string): void;
  edit(fn: (nb: P08Notebook) => void): void;
}

/** Lecturas que la demo va dejando (para importarlas a la libreta al final). */
interface DemoRes {
  masses: string[];
  volumes: string[];
  temps: string[];
  support?: string;
  product?: string;
  analyses: string[];
}

const fmt = (x: number, dd = 3) => x.toFixed(dd).replace('.', ',');
const last = (d: DemoDirector08) => d.w.readingOrder[d.w.readingOrder.length - 1];

/** Destapa o tapa un frasco con el gesto de la tapa (clic sobre ella). */
async function cap(d: DemoDirector08, id: string, capped: boolean) {
  if (d.w.vessels[id]?.capped === capped || d.w.vessels[id]?.capped === undefined) return;
  await d.press(id, undefined, 0.3);
  d.c.instrumentPart(id, 'cap');
  d.endPress();
}

/** Botón de un equipo (la mano lo señala y lo pulsa). */
async function button(d: DemoDirector08, id: string, part: string) {
  await d.press(id, undefined, 0.4);
  d.c.instrumentPart(id, part);
  d.endPress();
}

const mouth = (d: DemoDirector08, id: string) => (id === 'buchner' ? buchnerMouth(d.w) : mouthOf(d.w, id));

/** Lleva un objeto a un punto y lo suelta (el controlador decide el apoyo: platillo, baño, aro, Büchner...). */
async function carry(d: DemoDirector08, id: string, x: number, y: number) {
  if (!(await d.grab(id))) return;
  await d.moveTo(x, y);
  await d.wait(0.2);
  await d.release();
}

async function carryTo(d: DemoDirector08, id: string, spot: string) {
  const p = spot === 'pan' ? PAN_POS : supportPoint(d.w, spot);
  if (p) await carry(d, id, p.x, p.y);
}

/**
 * Vierte lo sostenido sobre la boca de `target` hasta que `done()` (o se vacía) y lo devuelve a su sitio. Con
 * `tiltFor`, la mano mantiene la inclinación justo sobre el umbral de vertido (como un estudiante que dosifica).
 */
async function pour(d: DemoDirector08, src: string, target: string, done: () => boolean, maxS = 40, tiltFor?: () => number) {
  await cap(d, src, false);
  const m = mouth(d, target);
  const from = d.w.objects[src]?.pose;
  if (!m || !from || !(await d.grab(src))) return;
  await d.toZ(m.z + 6);
  await d.moveTo(m.x - 1.5, m.y);
  await d.toZ(m.z + 3);
  d.c.primaryDown();
  await d.until(() => {
    const h = d.c.held;
    if (tiltFor && h) h.tilt = Math.min(h.tilt, tiltFor());
    return done() || vesselMl(d.w.vessels[src]) < 0.06;
  }, maxS);
  d.c.primaryUp();
  await d.wait(1.2);
  await d.toZ(m.z + 6);
  await d.moveTo(from.x, from.y);
  await d.release();
}

/** Dosifica `ml` en el receptor: la inclinación se acerca al umbral a medida que falta menos. */
const pourMl = (d: DemoDirector08, src: string, target: string, ml: number) => {
  const start = vesselMl(d.w.vessels[target]);
  const need = () => ml - (vesselMl(d.w.vessels[target]) - start);
  const tilt = () => {
    const v = d.w.vessels[src];
    const tilt0 = 100 - 88 * Math.min(1, vesselMl(v) / Math.max(1, v.capacityMl));
    const n = need();
    return tilt0 + (n > 3 ? 14 : n > 0.6 ? 6 : 2);
  };
  return pour(d, src, target, () => need() <= 0.03, 60, tilt);
};

/** Vacía por completo (hasta que deja de salir). */
async function pourAll(d: DemoDirector08, src: string, target: string) {
  let prev = Infinity;
  let still = 0;
  await pour(d, src, target, () => {
    const ml = vesselMl(d.w.vessels[src]);
    still = prev - ml < 1e-4 ? still + 1 : 0;
    prev = ml;
    return still > 40;
    // Inclinación firme pero sin pasar de ~120°: más allá el líquido escurre por fuera del receptor (ORG10).
  }, 60, () => 118);
}

/** Gotero: aspira `ml` de un frasco y lo entrega dentro de `target`. */
async function drops(d: DemoDirector08, bottle: string, target: string, ml: number) {
  await cap(d, bottle, false);
  const mb = mouthOf(d.w, bottle)!;
  if (!(await d.grab('dp1'))) return;
  await d.toZ(mb.z + 5);
  await d.moveTo(mb.x, mb.y);
  await d.toZ(levelsZ(d.w, d.w.vessels[bottle]).floor + 1);
  await d.until(() => d.w.objects.dp1.support === bottle, 4);
  d.c.primaryDown();
  await d.until(() => liquidMl(d.w.droppers.dp1.content) >= ml, 10);
  d.c.primaryUp();
  await d.toZ(mb.z + 6);
  const mt = mouthOf(d.w, target)!;
  await d.moveTo(mt.x, mt.y);
  await d.toZ(mt.z - 1.5);
  await d.until(() => d.w.objects.dp1.support === target, 4);
  d.c.secondaryDown();
  await d.until(() => liquidMl(d.w.droppers.dp1.content) < 1e-4, 10);
  d.c.secondaryUp();
  await d.toZ(mt.z + 6);
  await d.moveTo(176, 14);
  await d.release();
  await cap(d, bottle, true);
}

/** Una cucharada de `jar` a `target` (cargar dentro del frasco, descargar dentro del recipiente). */
async function spoon(d: DemoDirector08, jar: string, target: string) {
  await cap(d, jar, false);
  const mj = mouthOf(d.w, jar)!;
  if (!(await d.grab('spatula'))) return;
  await d.moveTo(mj.x, mj.y);
  await d.toZ(d.w.objects[jar].pose.z + 1);
  await d.until(() => d.w.objects.spatula.support === jar, 4);
  d.c.primaryDown();
  await d.wait(0.4);
  const mt = mouthOf(d.w, target)!;
  await d.toZ(mt.z + 6);
  await d.moveTo(mt.x, mt.y);
  await d.toZ(levelsZ(d.w, d.w.vessels[target]).floor + 0.6);
  await d.until(() => d.w.objects.spatula.support === target, 4);
  d.c.primaryDown();
  await d.wait(0.4);
  await d.toZ(mt.z + 6);
  await d.moveTo(138, 12);
  await d.release();
}

/** Pesa en el platillo, espera la indicación estable, lee y devuelve el objeto a `back` (opcionalmente tara antes). */
async function weigh(d: DemoDirector08, id: string, back: string | null, zero = true) {
  if (!d.w.balance.powered) await button(d, 'balance01', 'power');
  if (zero && d.w.balance.panIds.length === 0 && Math.abs(d.w.balance.tareG) > 1e-6) {
    await d.simUntil(() => d.w.balance.stable, 4, 1);
    await button(d, 'balance01', 'tare');
  }
  await carryTo(d, id, 'pan');
  d.note(d.hooks.t('p8.demo.ui.waitStable'));
  await d.simUntil(() => d.w.balance.stable && d.w.timeS - d.w.balance.disturbedAt > 2.5, 12, 1);
  d.note(null);
  d.c.readBalance();
  const rid = last(d);
  await d.wait(0.6);
  if (back) await carryTo(d, id, back);
  return rid;
}

/** Piseta: chorros de 4 mL y luego de 0,5 mL bajo la boquilla hasta agregar `ml`. */
async function wash(d: DemoDirector08, target: string, ml: number) {
  const m = mouth(d, target)!;
  const from = d.w.objects.washBottle.pose;
  if (!(await d.grab('washBottle'))) return;
  await d.toZ(m.z + 2);
  await d.moveTo(m.x - 2.5, m.y);
  const start = massG(d.w.vessels.washBottle.liq);
  for (let i = 0; i < 80; i++) {
    const left = ml - (start - massG(d.w.vessels.washBottle.liq));
    if (left < 0.3) break;
    d.c.primaryDown(left >= 4);
    await d.wait(0.05);
    d.c.primaryUp();
    await d.wait(0.3);
  }
  await d.moveTo(from.x, from.y);
  await d.release();
}

/** Embudo tapado: agitaciones cortas con venteo entre ellas (§11.2). */
async function shakeVent(d: DemoDirector08, rounds: number) {
  await button(d, 'sf', 'stopper');
  if (!(await d.grab('sf'))) return;
  await d.toZ(34);
  for (let i = 0; i < rounds; i++) {
    d.c.shakeDown();
    await d.simUntil(() => false, 1, 1);
    d.c.shakeUp();
    d.c.onKeyDown('x', false);
    await d.wait(0.4);
  }
  const ring = supportPoint(d.w, 'ring01')!;
  await d.moveTo(ring.x, ring.y);
  await d.release();
  await button(d, 'sf', 'stopper');
}

/** Llave: abre hacia el recipiente bajo el vástago y cierra al llegar la interfase (o vacía todo). */
async function drain(d: DemoDirector08, toInterface: boolean) {
  const f = d.w.vessels.sf;
  d.note(d.hooks.t('p8.demo.ui.settle'));
  await d.simUntil(() => f.emulsion01 <= 0, 120, 5);
  d.note(null);
  const two = phasesOf(f).twoPhases;
  await d.press('sf', undefined, 0.3);
  d.c.toggleValve(1);
  await d.simUntil(() => {
    const ph = phasesOf(f);
    if (vesselMl(f) < 0.03) return true;
    if (!toInterface) return false;
    const left = liquidMl(ph.bottom);
    if (left < 1 && (f.valve01 ?? 0) > 0.5) d.dispatch({ type: 'setValve', opening01: 0.3, receiverId: f.receiverId ?? null });
    return !two || !ph.twoPhases || left < 0.08;
  }, 120, 1);
  d.c.toggleValve();
  d.endPress();
}

function predict(d: DemoDirector08, ui: DemoUiHooks08, route: RouteId) {
  ui.edit((nb) => {
    const A = nb.tableA;
    A.equation = route === 'ISO' ? 'C5H12O + C2H4O2 ⇌ C7H14O2 + H2O' : route === 'ASA' ? 'C7H6O3 + C4H6O3 → C9H8O4 + C2H4O2' : 'C7H6O3 + CH4O ⇌ C8H8O3 + H2O';
    A.reactionType = route === 'ASA' ? 'acetylation' : 'fischer';
    A.functionalGroup = route === 'ASA' ? 'phenolHydroxyl' : 'carboxyl';
    for (const s of ROUTES08[route].suggested) {
      const row = A.reagents.find((r) => r.species === s.species);
      if (!row || s.unit === 'drops') continue;
      Object.assign(row, { amount: fmt(s.amount, 2), unit: s.unit, purity: fmt(declaredPurity(d.w, s.species), 3), coefficient: '1' });
      row.moles = fmt(rowMoles(row), 6);
    }
    const plan = plannedLimiting(nb);
    if (plan) {
      A.limiting = plan.limiting;
      A.theoreticalG = fmt(plan.theoreticalG);
    }
    A.prediction = 'El reactivo limitante fija la masa máxima; uso la pureza declarada en cada ficha.';
    A.savedAtS = d.w.timeS;
  });
}

function report(d: DemoDirector08, ui: DemoUiHooks08, r: DemoRes) {
  const w = d.w;
  ui.edit((nb) => {
    const imp = (e: { value: string; readingId: string | null; uncertainty: string; attemptId?: string }, id?: string) => {
      if (!id || !w.readings[id]) return;
      e.readingId = id;
      e.value = String(w.readings[id].value).replace('.', ',');
      e.uncertainty = fmt(w.readings[id].standardUncertainty, 3);
      e.attemptId = nb.attemptId || undefined;
    };
    const B = nb.tableB.rows;
    imp(B.massEmpty, r.masses[0]);
    imp(B.massReagent1, r.masses[1]);
    imp(B.massReagent2, r.masses[2]);
    imp(B.vol1, r.volumes[0]);
    imp(B.vol2, r.volumes[1]);
    imp(B.temp1, r.temps[0]);
    imp(B.temp2, r.temps[r.temps.length - 1]);
    const C = nb.tableC;
    imp(C.grossMass, r.product);
    imp(C.supportMass, r.support);
    if (r.product && r.support) {
      C.isolatedMass.value = fmt(w.readings[r.product].value - w.readings[r.support].value);
      C.isolatedMass.uncertainty = '0,003';
    }
    const pur = r.analyses.find((x) => w.readings[x]?.kind === 'purity');
    imp(C.purity, pur);
    if (pur) C.purity.value = fmt(w.readings[pur].value / 100);
    const other = r.analyses.find((x) => w.readings[x]?.kind !== 'purity');
    imp(C.analysis, other);
    if (other && w.readings[other].kind === 'density') {
      imp(C.density, other);
      C.densityTempC = '25,0';
    }
    C.technique = w.route === 'ASA' ? 'mp' : 'density';
    C.theoreticalG = nb.tableA.theoreticalG;
    const th = Number(C.theoreticalG.replace(',', '.'));
    const iso = Number(C.isolatedMass.value.replace(',', '.'));
    if (th > 0 && Number.isFinite(iso)) {
      C.apparentYield = fmt((100 * iso) / th, 1);
      if (pur) C.correctedYield = fmt((100 * iso * (w.readings[pur].value / 100)) / th, 1);
    }
    nb.analysis.q4 = 'Un rendimiento aparente mayor que 100 % indicaría agua, disolvente o precursor en la masa pesada: la reacción no crea materia.';
  });
}

export function buildDemoScript08(ui: DemoUiHooks08, route: RouteId): DemoStep08[] {
  const r: DemoRes = { masses: [], volumes: [], temps: [], analyses: [] };
  const liquid = route !== 'ASA';
  const alcohol = route === 'ISO' ? 'btIAA' : null;
  const steps: DemoStep08[] = [
    {
      part: 'A', key: `cards_${route}`, run: async (d) => {
        d.station('A');
        await d.wait(2.5);
        d.station('B');
        const ids = route === 'ISO' ? ['btIAA', 'btAcOH', 'btH2SO4'] : route === 'ASA' ? ['jarSA', 'btAA', 'btH3PO4'] : ['jarSA', 'btMeOH', 'btH2SO4'];
        for (const id of [...ids, 'balance01', 'th01']) {
          await d.press(id, undefined, 0.6);
          d.dispatch({ type: 'inspect', target: id });
        }
        d.endPress();
      },
    },
    {
      part: 'A', key: 'predict', run: async (d) => {
        ui.notebook(true, 'A');
        await d.wait(0.8);
        predict(d, ui, route);
        await d.wait(3);
        ui.notebook(false);
      },
    },
  ];
  if (route === 'ISO') {
    steps.push(
      {
        part: 'B', key: 'weighFlask', run: async (d) => {
          d.station('B');
          r.masses.push(await weigh(d, 'rf', null));
        },
      },
      {
        part: 'B', key: 'parallax', run: async (d) => {
          await d.fast(2, () => pourMl(d, alcohol!, 'cyl10', 5));
          await cap(d, alcohol!, true);
          // Consecuencia deliberada no destructiva (§16.6): mirar la probeta desde arriba da un volumen sesgado.
          d.look(d.w.objects.cyl10.pose.x, d.w.objects.cyl10.pose.y, 30, 40, 0.9);
          await d.wait(1);
          d.c.readVolume('cyl10');
          await d.wait(1.5);
          d.lab.camera?.eyeLevel('cyl10');
          await d.wait(1.5);
          d.c.readVolume('cyl10');
          r.volumes.push(last(d));
          await d.wait(1);
        },
      },
      {
        part: 'B', key: 'doseISO', run: async (d) => {
          await d.fast(2, () => pourAll(d, 'cyl10', 'rf'));
          r.masses.push(await weigh(d, 'rf', null, false));
          await d.fast(2, () => pourMl(d, 'btAcOH', 'cyl25', 7));
          await cap(d, 'btAcOH', true);
          d.lab.camera?.eyeLevel('cyl25');
          await d.wait(0.8);
          d.c.readVolume('cyl25');
          r.volumes.push(last(d));
          await d.fast(2, () => pourAll(d, 'cyl25', 'rf'));
          r.masses.push(await weigh(d, 'rf', 'cork01', false));
          await d.fast(2, () => drops(d, 'btH2SO4', 'rf', 0.25));
        },
      },
    );
  } else {
    steps.push(
      {
        part: 'B', key: 'weighSA', run: async (d) => {
          d.station('B');
          if (!d.w.balance.powered) await button(d, 'balance01', 'power');
          await carryTo(d, 'wg1', 'pan');
          await d.simUntil(() => d.w.balance.stable, 6, 1);
          await button(d, 'balance01', 'tare');
          for (let i = 0; i < 8 && massG(d.w.vessels.wg1.solid) < 1.75; i++) await d.fast(2, () => spoon(d, 'jarSA', 'wg1'));
          await cap(d, 'jarSA', true);
          await d.simUntil(() => d.w.balance.stable && d.w.timeS - d.w.balance.disturbedAt > 2.5, 12, 1);
          d.c.readBalance();
          r.masses.push(last(d));
          // Por diferencia: se vuelca el sólido al balón y se pesa lo que quedó en el vidrio, con la misma tara.
          await d.press('wg1', undefined, 0.6);
          d.dispatch({ type: 'dispose', vesselId: 'wg1', targetId: 'rf' });
          d.endPress();
          await d.simUntil(() => false, 1.5, 1);
          await d.simUntil(() => d.w.balance.stable && d.w.timeS - d.w.balance.disturbedAt > 2.5, 12, 1);
          d.c.readBalance();
          r.masses.push(last(d));
          await carry(d, 'wg1', 128, 20);
        },
      },
      {
        part: 'B', key: 'parallax', run: async (d) => {
          const bt = route === 'ASA' ? 'btAA' : 'btMeOH';
          const cyl = route === 'ASA' ? 'cyl10' : 'cyl25';
          await d.fast(2, () => pourMl(d, bt, cyl, route === 'ASA' ? 5 : 10));
          await cap(d, bt, true);
          d.look(d.w.objects[cyl].pose.x, d.w.objects[cyl].pose.y, 30, 40, 0.9);
          await d.wait(1);
          d.c.readVolume(cyl);
          await d.wait(1.5);
          d.lab.camera?.eyeLevel(cyl);
          await d.wait(1.5);
          d.c.readVolume(cyl);
          r.volumes.push(last(d));
          await d.fast(2, () => pourAll(d, cyl, 'rf'));
          await d.fast(2, () => drops(d, route === 'ASA' ? 'btH3PO4' : 'btH2SO4', 'rf', 0.25));
        },
      },
    );
  }
  steps.push({
    part: 'C', key: liquid ? 'refluxSetup' : 'bathSetup', run: async (d) => {
      d.station('C');
      await carryTo(d, 'rf', 'bath01');
      await carryTo(d, 'th01', 'rf');
      if (liquid) {
        await carryTo(d, 'condenser01', 'rf');
        await button(d, 'condenser01', 'water');
      }
      await d.press('plate01', undefined, 0.5);
      d.dispatch({ type: 'setMagneticStir', level01: 0.5 });
      d.dispatch({ type: 'setPlate', on: true, setpointC: ROUTES08[route].bathC });
      d.endPress();
    },
  }, {
    part: 'C', key: 'heat', run: async (d) => {
      const t0 = d.w.timeS;
      const heatS = ROUTES08[route].heatS;
      let n = 0;
      // El estudiante lee la temperatura del líquido de vez en cuando; la extensión de la reacción no se ve (§16.7).
      await d.simUntil(() => d.w.timeS - t0 >= heatS, heatS + 5, 60, () => {
        if (n++ % 10 === 2) {
          d.c.readThermometer();
          r.temps.push(last(d));
        }
      });
      d.c.readThermometer();
      r.temps.push(last(d));
      await button(d, 'plate01', 'power');
    },
  });
  if (liquid) {
    steps.push(
      {
        part: 'D', key: 'cool', run: async (d) => {
          d.dispatch({ type: 'useTongs', on: true });
          await carryTo(d, 'rf', 'ice01');
          d.dispatch({ type: 'setMagneticStir', level01: 0 });
          await d.simUntil(() => d.w.vessels.rf.tempC <= 30, 900, 30);
          d.dispatch({ type: 'useTongs', on: false });
          await carry(d, 'th01', 292, 16);
          await carry(d, 'condenser01', 300, 52);
          await button(d, 'condenser01', 'water');
        },
      },
      {
        part: 'D', key: `extract_${route}`, run: async (d) => {
          d.station('D');
          await carryTo(d, route === 'ISO' ? 'bkAq' : 'erDry', 'below:ring01');
          await d.fast(2, () => pourAll(d, 'rf', 'sf'));
          await carryTo(d, 'rf', 'cork01');
          await wash(d, 'sf', route === 'MS' ? 15 : 10);
          await shakeVent(d, 2);
          if (route === 'ISO') await drain(d, true);
          await d.fast(2, () => pourMl(d, 'btNaHCO3', 'cyl25', 20));
          await cap(d, 'btNaHCO3', true);
          await d.fast(2, () => pourAll(d, 'cyl25', 'sf'));
          // Primero sin tapón, girando: el CO₂ escapa; luego tapado, con venteo.
          d.dispatch({ type: 'setStir', vesselId: 'sf', motion01: 0.5 });
          await d.simUntil(() => false, 40, 5);
          d.dispatch({ type: 'setStir', vesselId: 'sf', motion01: 0 });
          await shakeVent(d, 3);
          await drain(d, true);
          if (route === 'ISO') {
            await carry(d, 'bkAq', 362, 18);
            await carryTo(d, 'erDry', 'below:ring01');
          } else {
            await carry(d, 'erDry', 386, 18);
            await carryTo(d, 'bkAq', 'below:ring01');
          }
          await drain(d, false);
        },
      },
      {
        part: 'D', key: 'dry', run: async (d) => {
          if (route === 'ISO') await carry(d, 'erDry', 386, 18);
          else await carry(d, 'bkAq', 362, 18);
          for (let i = 0; i < 2; i++) await d.fast(2, () => spoon(d, 'jarNa2SO4', 'erDry'));
          await cap(d, 'jarNa2SO4', true);
          d.dispatch({ type: 'setStir', vesselId: 'erDry', motion01: 0.5 });
          await d.simUntil(() => false, 90, 15);
          d.dispatch({ type: 'setStir', vesselId: 'erDry', motion01: 0 });
          await d.fast(2, () => pourAll(d, 'erDry', 'fracPot'));
        },
      },
      {
        part: 'D', key: 'fractions', run: async (d) => {
          r.support = await weigh(d, 'vialP', 'frac01');
          const [lo, hi] = ROUTES08[route].cut!;
          await d.press('frac01', undefined, 0.5);
          d.dispatch({ type: 'setFractionCut', loC: lo, hiC: hi });
          d.endPress();
          await button(d, 'frac01', 'run');
          await d.simUntil(() => !d.w.fractions.running, 70, 10);
          r.product = await weigh(d, 'vialP', null);
          await carry(d, 'vialP', 414, 16);
          await d.press('bkAq', undefined, 0.4);
          d.dispatch({ type: 'dispose', vesselId: 'bkAq', targetId: 'wasteAq' });
          d.endPress();
        },
      },
    );
  } else {
    steps.push(
      {
        part: 'D', key: 'quench', run: async (d) => {
          d.dispatch({ type: 'useTongs', on: true });
          await carry(d, 'th01', 292, 16);
          await carryTo(d, 'rf', 'cork01');
          d.dispatch({ type: 'useTongs', on: false });
          await d.simUntil(() => d.w.vessels.rf.tempC <= 45, 900, 30);
          r.support = await weigh(d, 'fpFine', null);
          await carry(d, 'fpFine', 372, 14);
          d.station('D');
          await d.fast(2, () => pourAll(d, 'bkIce', 'rf'));
          await carryTo(d, 'rf', 'ice01');
          d.dispatch({ type: 'setStir', vesselId: 'rf', motion01: 0.4 });
          d.note(d.hooks.t('p8.demo.ui.crystals'));
          await d.simUntil(() => d.w.vessels.rf.tempC <= 4, 900, 30);
          await d.simUntil(() => false, 120, 30);
          d.dispatch({ type: 'setStir', vesselId: 'rf', motion01: 0 });
        },
      },
      {
        part: 'D', key: 'filter', run: async (d) => {
          await carryTo(d, 'fpFine', 'buchner');
          await button(d, 'buchner', 'seal');
          await button(d, 'pump01', 'power');
          await d.fast(2, () => pourAll(d, 'rf', 'buchner'));
          await carryTo(d, 'rf', 'cork01');
          await d.simUntil(() => false, 30, 10);
          await wash(d, 'buchner', 4);
          await d.simUntil(() => false, 60, 10);
          await button(d, 'pump01', 'power');
        },
      },
      {
        part: 'D', key: 'oven', run: async (d) => {
          await carryTo(d, 'fpFine', 'oven01');
          await button(d, 'oven01', 'power');
          await d.simUntil(() => false, 900, 60);
          await button(d, 'oven01', 'power');
          await carry(d, 'fpFine', 380, 20);
          d.note(d.hooks.t('p8.demo.ui.coolBeforeWeighing'));
          await d.simUntil(() => d.w.vessels.fpFine.tempC <= 28, 600, 30);
          r.product = await weigh(d, 'fpFine', null);
          await carry(d, 'fpFine', 380, 20);
          await d.press('kitasato', undefined, 0.4);
          d.dispatch({ type: 'dispose', vesselId: 'kitasato', targetId: 'wasteAcid' });
          d.endPress();
        },
      },
    );
  }
  steps.push(
    {
      part: 'E', key: liquid ? 'analyzeLiquid' : 'analyzeSolid', run: async (d) => {
        d.station('E');
        const src = liquid ? 'vialP' : 'fpFine';
        for (const method of (liquid ? ['purity', 'density'] : ['purity', 'mp']) as Array<'purity' | 'density' | 'mp'>) {
          await d.press(src, undefined, 0.5);
          d.dispatch({ type: 'takeSample', sourceId: src });
          await button(d, method === 'mp' ? 'mp01' : 'analyzer01', method === 'mp' ? 'run' : method);
          await d.simUntil(() => d.w.analyzer.readyAt === null, 60, 5);
          r.analyses.push(last(d));
          await d.wait(1.5);
        }
      },
    },
    {
      part: 'F', key: 'report', run: async (d) => {
        d.station('F');
        ui.notebook(true, 'C');
        await d.wait(0.8);
        report(d, ui, r);
        await d.wait(4);
        ui.notebook(false);
      },
    },
  );
  return steps;
}
