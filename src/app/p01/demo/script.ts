/**
 * Guion de la demostración de la Práctica 1 (§16): la técnica correcta con los mismos gestos que hará el estudiante.
 * Textos en `p01.demo.steps.<clave>` (locales/es/practice01.json). La libreta se llena solo con lecturas importadas y
 * un ejemplo de cálculo; el resto del análisis queda para el estudiante. Nunca marca etapas (`stage:*`) a mano.
 */
import type { DemoDirector01, DemoStep01 } from './director';
import type { P01Notebook } from '../../../practices/practice-01/notebook';
import { ICE_BATH_POS, PAN_POS, SPILL_TRAY_POS } from '../../../practices/practice-01/definition';
import { fluidMl, pipetteAboveMarkMl } from '../../../simulation/density-world/world';
import { caliperReadings, cylinderMassReadings, displacementReadings, nailMassReadings, sampleReadings } from '../../../practices/practice-01/expected-results';

export interface DemoUiHooks01 {
  notebook(open: boolean, tab?: string): void;
  edit(fn: (nb: P01Notebook) => void): void;
}

const fmt = (v: number, d: number) => v.toFixed(d).replace('.', ',');

/** Vierte de un recipiente sostenido a otro hasta `ml` y enrasa con la piseta. */
async function pourTo(d: DemoDirector01, src: string, target: string, ml: number) {
  const m = d.c.mouthOf(target);
  if (!m || !(await d.grab(src))) return;
  await d.moveTo(m.x - 3, m.y);
  await d.toZ(m.z + 3);
  d.c.primaryDown();
  // Al enderezar sigue cayendo agua: se corta antes y se completa gota a gota con la piseta.
  await d.until(() => fluidMl(d.w.fluids[target]) >= ml - 10 || fluidMl(d.w.fluids[src]) < 1, 40);
  d.c.primaryUp();
  await d.wait(0.8);
  await d.release();
  if (!(await d.grab('washBottle'))) return;
  await d.moveTo(m.x - 2.5, m.y);
  await d.toZ(m.z + 1);
  await d.until(() => {
    if (fluidMl(d.w.fluids[target]) < ml - 0.05) d.c.squeeze(1);
    return fluidMl(d.w.fluids[target]) >= ml - 0.05;
  }, 30);
  await d.release();
}

/** Lee la balanza cuando está estable. */
async function readStable(d: DemoDirector01) {
  d.note(d.hooks.t('p01.demo.ui.waitStable'));
  await d.until(() => d.w.balance.stable, 20);
  d.note(null);
  d.c.readBalance();
  await d.wait(0.6);
}

/** Tara con la indicación estable (si no, la lectura de tara queda marcada como inestable). */
async function tareStable(d: DemoDirector01) {
  await d.until(() => d.w.balance.stable, 15);
  d.c.tare();
  await d.wait(0.4);
}

/** Pipeta: entra al depósito, aspira por encima de la marca, enrasa con el ojo a nivel, sale y limpia la gota. */
async function fillPipette(d: DemoDirector01, source: string) {
  const m = d.c.mouthOf(source)!;
  if (!(await d.grab('pipette25'))) return;
  await d.moveTo(m.x, m.y);
  await d.toZ(d.w.objects[source].pose.z + 1.5);
  d.c.primaryDown();
  await d.until(() => pipetteAboveMarkMl(d.w) > 0.6, 30);
  d.c.primaryUp();
  d.lab.camera?.eyeLevel('pipette25');
  d.note(d.hooks.t('p01.demo.ui.eye'));
  await d.wait(1.6);
  d.c.adjustMeniscus();
  await d.wait(0.8);
  await d.toZ(m.z + 4);
  d.dispatch({ type: 'wipeTip', method: 'outside' });
  d.note(null);
  await d.wait(0.4);
}

/** Descarga en el Erlenmeyer (sobre el platillo), espera el escurrido sin soplar y deja la pipeta en la mesada. */
async function deliver(d: DemoDirector01) {
  const m = d.c.mouthOf('erlenmeyer150')!;
  await d.moveTo(m.x, m.y);
  await d.toZ(d.w.objects.erlenmeyer150.pose.z + 2);
  d.c.secondaryDown();
  await d.until(() => !!d.w.pipette.delivering && d.w.pipette.drainS > d.w.params.pipetteDrainTimeS + 1, 40);
  d.c.secondaryUp();
  await d.toZ(m.z + 6);
  await d.moveTo(146, 10);
  await d.release();
}

export function buildDemoScript01(ui: DemoUiHooks01): DemoStep01[] {
  return [
    {
      part: 'A', key: 'inspect', run: async (d) => {
        d.station('A');
        for (const id of ['rec_beaker', 'rec_burette', 'rec_analytical']) {
          await d.press(id, undefined, 0.8);
          d.dispatch({ type: 'inspect', target: id });
        }
        d.station('B');
        await d.wait(1);
        for (const id of ['balance01', 'pipette25', 'thermometer01']) {
          await d.press(id, undefined, 0.8);
          d.dispatch({ type: 'inspect', target: id });
        }
        d.station('C');
        await d.press('cylinder50', undefined, 0.8);
        d.dispatch({ type: 'inspect', target: 'cylinder50' });
        d.station('D');
        await d.press('caliper01', undefined, 0.8);
        d.dispatch({ type: 'inspect', target: 'caliper01' });
        d.endPress();
      },
    },
    {
      part: 'A', key: 'trials', run: async (d) => {
        d.station('C');
        await d.fast(2, () => pourTo(d, 'waterRoom01', 'cylinder50', 25));
        await d.wait(1.5);
        d.lab.camera?.eyeLevel('cylinder50');
        d.note(d.hooks.t('p01.demo.ui.eye'));
        await d.wait(1.6);
        d.c.readVolume('cylinder50');
        d.note(null);
        await d.wait(0.6);
        d.dispatch({ type: 'emptyInto', sourceId: 'cylinder50', targetId: 'waste01' });
        d.station('B');
        await d.carry('pipetteFiller', d.w.objects.pipette25.pose.x, d.w.objects.pipette25.pose.y);
        await fillPipette(d, 'waterRoom01');
        d.lab.camera?.eyeLevel('pipette25');
        await d.wait(1.2);
        d.c.readVolume('pipette25');
        await d.wait(0.6);
        // De vuelta al depósito: era solo una lectura de prueba.
        const m = d.c.mouthOf('waterRoom01')!;
        await d.toZ(d.w.objects.waterRoom01.pose.z + 2);
        d.c.secondaryDown();
        await d.until(() => d.w.pipette.waterG < 0.2, 20);
        d.c.secondaryUp();
        await d.toZ(m.z + 6);
        await d.moveTo(146, 10);
        await d.release();
      },
    },
    {
      part: 'B', key: 'tare', run: async (d) => {
        d.station('B');
        d.lab.camera?.lookAt(PAN_POS.x, PAN_POS.y, 6, 50, 0.45);
        await d.press('balance01');
        d.dispatch({ type: 'powerBalance', on: true });
        d.dispatch({ type: 'levelBalance' });
        await d.simUntil(() => d.w.balanceOnAt !== null && d.w.timeS - d.w.balanceOnAt > 10, 12, 4);
        await tareStable(d);
        d.endPress();
        await d.carry('erlenmeyer150', PAN_POS.x, PAN_POS.y);
        await tareStable(d);
        await d.wait(0.6);
      },
    },
    {
      part: 'B', key: 'roomSample', run: async (d) => {
        await fillPipette(d, 'waterRoom01');
        d.lab.camera?.lookAt(PAN_POS.x, PAN_POS.y, 12, 60, 0.35);
        await deliver(d);
        await readStable(d);
      },
    },
    {
      part: 'B', key: 'thermo', run: async (d) => {
        const e = d.w.objects.erlenmeyer150.pose;
        await d.carry('thermometer01', e.x, e.y);
        d.lab.camera?.eyeLevel('thermometer01');
        d.note(d.hooks.t('p01.demo.ui.waitTemp'));
        await d.until(() => Math.abs(d.w.thermometer.displayedC - d.w.fluids.erlenmeyer150.tempC) < 0.08, 40);
        d.note(null);
        d.c.readThermometer();
        await d.wait(0.6);
        await d.carry('thermometer01', 150, 24);
        await d.carry('erlenmeyer150', 172, 24);
        d.dispatch({ type: 'emptyInto', sourceId: 'erlenmeyer150', targetId: 'waste01' });
        d.dispatch({ type: 'cleanObject', objectId: 'erlenmeyer150', action: 'dry' });
      },
    },
    {
      part: 'B', key: 'coldSample', run: async (d) => {
        await d.carry('waterCold01', ICE_BATH_POS.x, ICE_BATH_POS.y);
        await d.simUntil(() => d.w.fluids.waterCold01.tempC < d.w.params.coldBathTargetC + 0.6, 400, 30);
        await d.carry('waterCold01', 128, 26);
        await d.carry('erlenmeyer150', PAN_POS.x, PAN_POS.y);
        await tareStable(d);
        // Enjuagar la pipeta con el agua nueva: no arrastra restos de la serie anterior.
        if (!(await d.grab('pipette25'))) return;
        const m = d.c.mouthOf('waterCold01')!;
        await d.moveTo(m.x, m.y);
        await d.toZ(d.w.objects.waterCold01.pose.z + 1.5);
        d.dispatch({ type: 'rinsePipette' });
        await d.release();
        await fillPipette(d, 'waterCold01');
        await deliver(d);
        await readStable(d);
        const e = d.w.objects.erlenmeyer150.pose;
        await d.carry('thermometer01', e.x, e.y);
        await d.until(() => Math.abs(d.w.thermometer.displayedC - d.w.fluids.erlenmeyer150.tempC) < 0.08, 40);
        d.c.readThermometer();
        await d.wait(0.6);
        await d.carry('thermometer01', 150, 24);
        await d.carry('erlenmeyer150', 172, 24);
      },
    },
    {
      part: 'C', key: 'nails', run: async (d) => {
        d.lab.camera?.lookAt(PAN_POS.x + 20, PAN_POS.y - 10, 6, 70, 0.5);
        await tareStable(d);
        await d.carry('weighBoat01', PAN_POS.x, PAN_POS.y);
        await readStable(d);
        await d.press('nailsBatch01');
        d.dispatch({ type: 'transferNails', from: 'nailsBatch01', to: 'weighBoat01', count: 6, gentle: true, tool: 'tongs' });
        d.endPress();
        await readStable(d);
        d.station('C');
        await d.carry('weighBoat01', 248, 12);
        await d.fast(2, () => pourTo(d, 'waterRoom01', 'cylinder50', 20));
        await d.wait(1.5);
        d.lab.camera?.eyeLevel('cylinder50');
        await d.wait(1.6);
        d.c.readVolume('cylinder50');
        await d.wait(0.5);
        if (!(await d.grab('weighBoat01'))) return;
        await d.moveTo(SPILL_TRAY_POS.x - 2, SPILL_TRAY_POS.y);
        await d.toZ(19);
        for (let i = 0; i < 6; i++) {
          d.c.nailsIntoCylinder(true);
          await d.wait(0.5);
        }
        await d.moveTo(248, 12);
        await d.release();
        await d.press('cylinder50');
        d.dispatch({ type: 'tapCylinder' });
        d.endPress();
        await d.wait(2.5);
        d.lab.camera?.eyeLevel('cylinder50');
        await d.wait(1.6);
        d.c.readVolume('cylinder50');
        await d.wait(0.6);
      },
    },
    {
      part: 'D', key: 'cylinder', run: async (d) => {
        d.lab.camera?.lookAt(PAN_POS.x, PAN_POS.y, 6, 50, 0.45);
        await tareStable(d);
        await d.carry('watchGlass01', PAN_POS.x, PAN_POS.y);
        await readStable(d);
        const g = d.w.objects.watchGlass01.pose;
        await d.carry('solidCylinder01', g.x, g.y);
        await readStable(d);
        await d.carry('watchGlass01', 338, 28);
        await d.carry('solidCylinder01', 352, 40);
        d.station('D');
        d.lab.camera?.eyeLevel('caliper01');
        await d.press('caliper01');
        for (const [target, orientationDeg] of [['empty', 0], ['diameter', 0], ['diameter', 90], ['height', 0], ['height', 180]] as const) {
          d.dispatch({ type: 'setCaliper', target, angleDeg: 0, force01: 0.4, orientationDeg });
          await d.wait(0.8);
          d.c.readCaliper();
          await d.wait(0.5);
        }
        d.dispatch({ type: 'setCaliper', target: 'none', angleDeg: 0, force01: 0.4, orientationDeg: 0 });
        d.endPress();
      },
    },
    {
      part: 'E', key: 'notebook', run: async (d) => {
        d.station('E');
        ui.notebook(true, 'B');
        await d.wait(1);
        const w = d.w;
        ui.edit((nb) => {
          const imp = (e: P01Notebook['trialProbe'], id: string | undefined, dec: number) => {
            if (!id) return;
            e.readingId = id;
            e.value = fmt(w.readings[id].value, dec);
          };
          for (const s of ['room', 'cold'] as const) {
            const r = sampleReadings(w, s);
            imp(nb.tableB[s].mass, r.mass?.id, 2);
            imp(nb.tableB[s].temp, r.temp?.id, 1);
            nb.tableB[s].volume.value = '25,00';
            nb.tableB[s].volume.uncertainty = '0,03';
          }
          // Un ejemplo de cálculo desde la evidencia (el resto queda para el estudiante).
          const m = w.readings[nb.tableB.room.mass.readingId ?? '']?.value;
          if (m) nb.tableB.room.density.value = fmt(m / 25, 4);
          const nm = nailMassReadings(w);
          const dr = displacementReadings(w);
          imp(nb.tableC.boatMass, nm.boat?.id, 2);
          imp(nb.tableC.boatNailsMass, nm.boatNails?.id, 2);
          imp(nb.tableC.vInitial, dr.initial?.id, 1);
          imp(nb.tableC.vFinal, dr.final?.id, 1);
          const cm = cylinderMassReadings(w);
          const cal = caliperReadings(w);
          imp(nb.tableD.glassMass, cm.glass?.id, 2);
          imp(nb.tableD.totalMass, cm.total?.id, 2);
          imp(nb.tableD.d1, cal.diameters[0]?.id, 3);
          imp(nb.tableD.d2, cal.diameters[1]?.id, 3);
          imp(nb.tableD.h1, cal.heights[0]?.id, 3);
          imp(nb.tableD.h2, cal.heights[1]?.id, 3);
        });
        await d.wait(2.5);
        ui.notebook(true, 'C');
        await d.wait(2);
        ui.notebook(true, 'D');
        await d.wait(2);
      },
    },
    {
      part: 'E', key: 'close', run: async (d) => {
        ui.notebook(true, 'log');
        await d.wait(3);
        ui.notebook(false);
      },
    },
  ];
}
