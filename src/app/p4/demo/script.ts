/**
 * Guion de la demostración de la Práctica 4: la ruta correcta completa, paso a paso, con los mismos gestos que hará
 * el estudiante. Textos en `p4.demo.steps.<clave>` (locales/es/practice4.json). La libreta se llena solo con lo
 * observado; las ecuaciones y el análisis quedan para el estudiante.
 */
import type { DemoDirector4, DemoStep4 } from './director';
import type { P4Notebook } from '../../../practices/practice-04/notebook';
import { MG_RIBBON } from '../../../practices/practice-04/instruments';
import { redoxElapsedS } from '../../../practices/practice-04/evidence';
import { liquidMl } from '../../../simulation/reaction-world/world';
import { isLit } from '../../../simulation/flame-world/world';

export interface DemoUiHooks4 {
  notebook(open: boolean, tab?: string): void;
  edit(fn: (nb: P4Notebook) => void): void;
}

const near = (d: DemoDirector4, id: string, dx = 0, dy = 0) => {
  const p = d.pose(id)!;
  return { x: p.x + dx, y: p.y + dy };
};

async function washIfUsed(d: DemoDirector4, id: string) {
  if (liquidMl(d.w.vessels[id]) > 0.001 || d.w.vessels[id].additions.length) {
    await d.press(id);
    d.dispatch({ type: 'washVessel', id });
    await d.wait(0.6);
    d.endPress();
  }
}

async function shakeTube(d: DemoDirector4, tube: string, seconds: number) {
  if (!(await d.grab(tube))) return;
  const p = d.pose(tube)!;
  const t0 = d.w.timeS;
  let k = 0;
  while (d.w.timeS - t0 < seconds) {
    const h = d.c.held;
    if (h) h.x = p.x + (k++ % 2 ? 0.9 : -0.9) - h.ox;
    d.dispatch({ type: 'setAgitation', id: tube, tool: 'SHAKE', intensity: 0.45 });
    await d.wait(0.12);
  }
  await d.release();
}

export function buildDemoScript4(ui: DemoUiHooks4): DemoStep4[] {
  return [
    // ───────────── A. Neutralización ─────────────
    {
      part: 'A', key: 'start',
      run: async (d) => {
        d.station('A');
        await d.wait(1);
        await d.press('beaker');
        d.dispatch({ type: 'inspect', target: 'beaker' });
        await d.wait(1.2);
        d.endPress();
      },
    },
    {
      part: 'A', key: 'measureHcl',
      run: async (d) => {
        d.look(70, 30, 6, 45, 0.35);
        await d.pourInto('bottle_hcl', 'cyl10', 5.0);
        d.lab.camera?.eyeLevel('cyl10');
        d.note(d.hooks.t('p4.demo.ui.eye'));
        await d.wait(2.2);
        d.station('A');
      },
    },
    {
      part: 'A', key: 'hclToBeaker',
      run: async (d) => {
        await d.pourInto('cyl10', 'beaker', 5.0);
        await d.putBack('cyl10', { x: 72, y: 22 });
        await d.putBack('bottle_hcl', { x: 32, y: 50 });
      },
    },
    {
      part: 'A', key: 'phenol',
      run: async (d) => {
        await d.dropsInto('pheno', 'dropper_pheno', 'beaker', 2);
      },
    },
    {
      part: 'A', key: 'probe',
      run: async (d) => {
        if (await d.grab('probe')) {
          const b = d.pose('beaker')!;
          await d.moveTo(b.x - 0.5, b.y);
          await d.until(() => d.c.held?.magnet?.mode === 'IN', 2);
          await d.release();
        }
        await d.press('probe');
        await d.wait(2.5);
        d.note(d.hooks.t('p4.demo.ui.temp', { t: d.w.probe.readingC.toFixed(1).replace('.', ',') }));
        await d.wait(1.5);
        d.endPress();
      },
    },
    {
      part: 'A', key: 'measureNaoh',
      run: async (d) => {
        await d.pourInto('bottle_naoh10', 'cyl25', 5.0);
        d.lab.camera?.eyeLevel('cyl25');
        await d.wait(1.8);
        d.station('A');
        await d.putBack('bottle_naoh10', { x: 46, y: 50 });
      },
    },
    {
      part: 'A', key: 'addNaoh',
      run: async (d) => {
        // La varilla queda en el vaso y se agita entre las porciones; se vierte poco a poco.
        if (await d.grab('rod')) {
          const b = d.pose('beaker')!;
          await d.moveTo(b.x, b.y);
          await d.until(() => d.c.held?.magnet?.mode === 'IN', 2);
          await d.release();
        }
        d.look(96, 28, 6, 32, 0.25);
        for (let i = 0; i < 6 && liquidMl(d.w.vessels.cyl25) > 0.2; i++) {
          await d.pourInto('cyl25', 'beaker', 0.85);
          for (let k = 0; k < 6; k++) {
            d.dispatch({ type: 'setAgitation', id: 'beaker', tool: 'ROD', intensity: 0.5 });
            await d.wait(0.25);
          }
        }
        await d.pourInto('cyl25', 'beaker', 1);
      },
    },
    {
      part: 'A', key: 'observeA',
      run: async (d) => {
        for (let k = 0; k < 16; k++) {
          d.dispatch({ type: 'setAgitation', id: 'beaker', tool: 'ROD', intensity: 0.5 });
          await d.wait(0.25);
        }
        await d.wait(2);
        d.note(d.hooks.t('p4.demo.ui.temp', { t: d.w.probe.readingC.toFixed(1).replace('.', ',') }));
        ui.notebook(true, 'A');
        ui.edit((nb) => {
          nb.A.hclVolMl = '5,0';
          nb.A.hclConc = '0,10 M';
          nb.A.naohVolMl = '5,0';
          nb.A.naohConc = '0,10 M';
          nb.A.colorInitial = 'incolora';
          nb.A.during = 'remolinos_rosados';
          nb.A.colorFinal = 'incolora';
          nb.A.thermal = 'exotermica';
        });
        await d.wait(3);
        ui.notebook(false);
        if (await d.grab('probe')) await d.release();
      },
    },
    // ───────────── B. Precipitación ─────────────
    {
      part: 'B', key: 'b1',
      run: async (d) => {
        d.station('B');
        await d.wait(1);
        d.dispatch({ type: 'label', id: 'tube1', label: 'B1' });
        await d.fast(2, () => d.dropsInto('db_na2co3', 'dropper_na2co3', 'tube1', 20));
        d.look(near(d, 'tube1').x + 2, 46, 4, 34, 0.12);
        await d.fast(2, () => d.dropsInto('db_cacl2', 'dropper_cacl2', 'tube1', 20));
        d.look(near(d, 'tube1').x + 2, 46, 3, 30, 0.08);
        await d.wait(2.5);
        await shakeTube(d, 'tube1', 1.5);
        await d.wait(2);
      },
    },
    {
      part: 'B', key: 'b2',
      run: async (d) => {
        d.dispatch({ type: 'label', id: 'tube2', label: 'B2' });
        await d.fast(2, () => d.dropsInto('db_fecl3', 'dropper_fecl3', 'tube2', 20));
        d.look(near(d, 'tube2').x + 2, 46, 4, 34, 0.12);
        await d.fast(2, () => d.dropsInto('db_naoh15', 'dropper_naoh15', 'tube2', 20));
        d.look(near(d, 'tube2').x + 2, 46, 3, 30, 0.08);
        await d.wait(3);
        await shakeTube(d, 'tube2', 1.5);
        await d.wait(2);
        ui.notebook(true, 'B');
        ui.edit((nb) => {
          nb.B1.immediate = 'turbidez_blanca';
          nb.B1.pptColor = 'blanca';
          nb.B1.texture = 'fino_blanco';
          nb.B1.supernatant = 'turbio';
          nb.B2.immediate = 'precipitado_marron';
          nb.B2.pptColor = 'marron_rojizo';
          nb.B2.texture = 'gelatinoso_floculento';
          nb.B2.supernatant = 'amarillo';
        });
        await d.wait(3);
        ui.notebook(false);
      },
    },
    // ───────────── C. Desplazamiento Fe/Cu ─────────────
    {
      part: 'C', key: 'cuso4',
      run: async (d) => {
        d.station('C');
        await d.wait(1);
        // La probeta tenía HCl: se lava antes de medir otro reactivo (no contaminar la medida).
        await washIfUsed(d, 'cyl10');
        // La probeta se lleva a la estación C, junto al frasco de CuSO₄.
        await d.putBack('cyl10', { x: 290, y: 24 });
        d.station('C');
        await d.pourInto('bottle_cuso4', 'cyl10', 2.5);
        d.dispatch({ type: 'label', id: 'tube3', label: 'C1' });
        await d.pourInto('cyl10', 'tube3', 2.5);
        await d.putBack('cyl10', { x: 290, y: 24 });
        await d.putBack('bottle_cuso4', { x: 282, y: 50 });
      },
    },
    {
      part: 'C', key: 'nail',
      run: async (d) => {
        d.look(305, 28, 2, 30, 0.45);
        await d.press('nail');
        d.dispatch({ type: 'inspect', target: 'nail' });
        await d.wait(1.5);
        d.endPress();
        if (await d.grab('sandpaper')) {
          const n = d.pose('nail')!;
          await d.moveTo(n.x + 2, n.y - 1);
          for (let i = 0; i < 4; i++) {
            d.c.primaryDown();
            d.c.primaryUp();
            await d.wait(0.4);
          }
          await d.release();
        }
        if (await d.grab('tube_tongs')) {
          const n = d.pose('nail')!;
          await d.toZ(n.z + 0.5);
          await d.moveTo(n.x, n.y);
          await d.until(() => d.c.clampReady, 2);
          d.c.toggleClamp();
          if (!d.w.tongs.tube_tongs?.holding) d.dispatch({ type: 'clamp', tongsId: 'tube_tongs', targetId: 'nail', grip: 0.9 });
          await d.toZ(24);
          const t = d.pose('tube3')!;
          await d.moveTo(t.x, t.y);
          d.c.toggleClamp();
          await d.wait(0.4);
          if (!d.w.metals.nail?.immersedIn) {
            d.dispatch({ type: 'unclamp', tongsId: 'tube_tongs' });
            d.dispatch({ type: 'setPose', id: 'nail', pose: { x: t.x, y: t.y, z: t.z + 0.25, rotationRad: 0 }, support: 'in:tube3' });
          }
          await d.moveTo(t.x + 8, t.y - 30);
          await d.release();
        }
        d.dispatch({ type: 'stopwatch', action: 'START' });
        d.look(near(d, 'tube3').x + 2, 46, 3, 30, 0.08);
        await d.wait(1.5);
      },
    },
    {
      part: 'C', key: 'wait10',
      run: async (d) => {
        await d.simUntil(() => redoxElapsedS(d.w) >= d.w.params.redoxObserveS + 5, d.w.params.redoxObserveS + 20, 40);
        d.dispatch({ type: 'stopwatch', action: 'STOP' });
        d.dispatch({ type: 'inspect', target: 'nail' });
        await d.wait(2);
        ui.notebook(true, 'C1');
        ui.edit((nb) => {
          nb.C1.metal = 'Fe';
          nb.C1.surface = 'lijado';
          nb.C1.colorInitial = 'azul';
          nb.C1.metalChange = 'deposito_rojizo';
          nb.C1.timeMin = '10';
        });
        await d.wait(3);
        ui.notebook(false);
      },
    },
    // ───────────── D. Combustión del Mg ─────────────
    {
      part: 'D', key: 'burnerCheck',
      run: async (d) => {
        d.station('D');
        await d.wait(1);
        for (const id of ['extinguisher', 'blanket', 'estop']) {
          await d.press(id, undefined, 0.5);
          d.dispatch({ type: 'inspect', target: id });
        }
        d.dispatch({ type: 'gas', cmd: { type: 'setExtraction', on: true } });
        await d.press('hose', undefined, 0.6);
        d.dispatch({ type: 'inspect', target: 'hose' });
        d.dispatch({ type: 'gas', cmd: { type: 'connectHose', connected: true } });
        await d.press('burner', undefined, 0.6);
        d.dispatch({ type: 'inspect', target: 'burner' });
        d.endPress();
      },
    },
    {
      part: 'D', key: 'ignite',
      run: async (d) => {
        const m = d.mouth;
        d.look(m.x, m.y, m.z + 3, 55, 0.25);
        await d.turnValve('AIR', 0, 0.3);
        await d.press('gas_tap', undefined, 0.4);
        await d.turnValve('TABLE', 1, 0.8);
        d.endPress();
        if (await d.grab('lighter')) {
          await d.moveTo(m.x + 1, m.y);
          d.c.primaryDown();
          await d.wait(0.4);
          for (let i = 0; i < 12 && !isLit(d.w.gas); i++) {
            d.c.setValve('NEEDLE', d.c.valveValue('NEEDLE') + 0.025);
            await d.wait(0.12);
          }
          d.c.primaryUp();
          await d.moveTo(398, 12);
          await d.release();
        }
        await d.turnValve('NEEDLE', 0.32, 0.8);
        await d.wait(1.5);
        for (const a of [0.2, 0.4, 0.6, 0.7]) await d.turnValve('AIR', a, 0.5);
        await d.turnValve('NEEDLE', 0.5, 0.6);
        await d.wait(1.5);
      },
    },
    {
      part: 'D', key: 'mgSetup',
      run: async (d) => {
        d.dispatch({ type: 'acceptMgWarning' });
        const m = d.mouth;
        // Cápsula junto al mechero, donde caerá el residuo (está fría: se lleva con la mano).
        if (await d.grab('capsule')) {
          await d.moveTo(m.x + 7.5, m.y - 1);
          await d.release();
        }
        d.c.placeShield();
        await d.wait(1);
      },
    },
    {
      part: 'D', key: 'burnMg',
      run: async (d) => {
        const m = d.mouth;
        if (!(await d.grab('crucible_tongs'))) return;
        const r = d.pose('mg1')!;
        // La pinza toma la cinta por su extremo (la punta queda a 0,85 L hacia +x).
        await d.toZ(r.z + 0.3);
        await d.moveTo(r.x - MG_RIBBON.length * 0.85, r.y);
        await d.until(() => d.c.clampReady, 2);
        d.c.toggleClamp();
        if (!d.w.tongs.crucible_tongs?.holding) d.dispatch({ type: 'clamp', tongsId: 'crucible_tongs', targetId: 'mg1', grip: 0.9 });
        await d.toZ(m.z + 4);
        const hot = m.z + Math.max(1.5, d.w.gas.burner.flame.innerConeHeightCm * 1.15);
        await d.moveTo(m.x - MG_RIBBON.length * 0.85, m.y);
        await d.toZ(hot + 0.2);
        await d.until(() => d.w.ribbons.mg1?.phase === 'BRIGHT_COMBUSTION', 8);
        await d.wait(0.3);
        // Retirar parcialmente de la llama y mantener sobre la cápsula; observar a través de la pantalla.
        const cap = d.pose('capsule')!;
        await d.toZ(cap.z + 7);
        await d.moveTo(cap.x - MG_RIBBON.length * 0.85 + 1, cap.y);
        await d.until(() => d.w.ribbons.mg1?.phase !== 'BRIGHT_COMBUSTION', 12);
        await d.wait(1.5);
        d.c.toggleClamp();
        await d.wait(0.4);
        await d.moveTo(440, 10);
        await d.release();
      },
    },
    {
      part: 'D', key: 'burnerOff',
      run: async (d) => {
        await d.turnValve('AIR', 0, 0.5);
        await d.turnValve('NEEDLE', 0, 0.6);
        await d.turnValve('TABLE', 0, 0.5);
        d.dispatch({ type: 'inspect', target: 'burner' });
        await d.wait(1);
      },
    },
    // ───────────── E. Residuo del Mg ─────────────
    {
      part: 'E', key: 'cool',
      run: async (d) => {
        d.station('E');
        await d.simUntil(() => d.w.vessels.capsule.residueTempC < 45 && (d.w.objects.capsule?.temperatureC ?? 99) < 45, 300, 20);
      },
    },
    {
      part: 'E', key: 'water',
      run: async (d) => {
        await washIfUsed(d, 'cyl25');
        if (await d.grab('wash')) {
          const c = d.pose('cyl25')!;
          await d.moveTo(c.x - 5.5, c.y);
          await d.until(() => d.c.held?.magnet?.id === 'cyl25', 2);
          d.c.primaryDown();
          await d.until(() => liquidMl(d.w.vessels.cyl25) >= 5.05, 15);
          d.c.primaryUp();
          await d.release();
        }
        await d.pourInto('cyl25', 'capsule', 5);
        await d.stirWithRod('capsule', 4);
        await d.release();
        await d.dropsInto('pheno', 'dropper_pheno', 'capsule', 2);
        d.look(near(d, 'capsule').x, near(d, 'capsule').y, 2, 22, 0.6);
        await d.wait(4);
        ui.notebook(true, 'Mg');
        ui.edit((nb) => {
          nb.Mg.lengthCm = '3,0';
          nb.Mg.combustion = 'luz_blanca_intensa';
          nb.Mg.residue = 'polvo_blanco';
          nb.Mg.waterResult = 'suspension_blanca';
        });
        await d.wait(3);
        ui.notebook(false);
      },
    },
    // ───────────── F. Residuos ─────────────
    {
      part: 'F', key: 'waste',
      run: async (d) => {
        d.station('F');
        d.dispatch({ type: 'setGloves', on: true });
        if (await d.grab('ph_paper')) {
          const b = d.pose('beaker')!;
          await d.moveTo(b.x, b.y);
          d.c.primaryDown();
          d.c.primaryUp();
          await d.release();
        }
        await d.fast(2, async () => {
          await d.pourInto('beaker', 'waste_acidbase', 12);
          await d.pourInto('tube1', 'waste_solids', 3, { drain: true });
          await d.pourInto('tube2', 'waste_iron', 3, { drain: true });
        });
        await d.fast(2, async () => {
          // Al vaciar el tubo del todo, el clavo se desliza al contenedor de metales con la disolución.
          await d.pourInto('tube3', 'waste_metals', 3, { drain: true });
          await d.pourInto('capsule', 'waste_solids', 6);
        });
      },
    },
  ];
}
