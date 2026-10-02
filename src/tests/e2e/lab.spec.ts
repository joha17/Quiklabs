/**
 * §17.3 — Pruebas de interacción, visuales y de rendimiento sobre la escena 3D (Playwright) + auditoría axe-core.
 * Usan el asa `window.__lab` solo para LEER posiciones/estado, proyectar puntos con la cámara y preparar escenarios;
 * las manipulaciones se hacen con el ratón y el teclado reales.
 */
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { dispatchMut, stepMut } from '../../simulation/world/world';
import { mixAmounts } from '../../simulation/solutions/mixture';
import { CTX } from '../../practices/practice-02';
import type { World } from '../../simulation/entities/types';
import type { Command } from '../../simulation/world/commands';

type Pt = { x: number; y: number };
type AnyState = any;

const PPE = ['Bata de laboratorio abotonada', 'Gafas de seguridad', 'Cabello recogido', 'Calzado cerrado'];

async function startLab(page: Page, mode = 'PRACTICE') {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  // Calidad fija: la selección automática recrearía la escena a mitad de la prueba.
  await page.evaluate(() => (window as never as { __lab: { getState(): AnyState } }).__lab.getState().setSettings({ quality: 'MEDIUM' }));
  await page.getByLabel(new RegExp(mode === 'GUIDED' ? 'Guiado' : 'Práctica')).first().check();
  await page.getByRole('button', { name: 'Comenzar intento' }).click();
  for (const name of PPE) await page.getByRole('button', { name, exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar y entrar al laboratorio' }).click();
  // La escena 3D está lista cuando la cámara se registró y ya hubo fotogramas dibujados.
  await page.waitForFunction(() => {
    const s = (window as never as { __lab: { getState(): AnyState } }).__lab.getState();
    return !!s.stage?.camera && s.stage.stats.calls > 0;
  }, undefined, { timeout: 30000 });
  await page.waitForTimeout(500);
}

/** Un punto de pantalla donde el rayo del puntero toca exactamente ese objeto (no uno que esté delante). */
async function pickPoint(page: Page, id: string): Promise<Pt> {
  const p = await page.evaluate((id) => {
    const s = (window as never as { __lab: { getState(): AnyState } }).__lab.getState();
    const o = s.runtime.world.vessels[id] ?? s.runtime.world.props[id];
    for (let dz = 12; dz >= 0; dz -= 0.5) {
      for (const dx of [0, -0.6, 0.6]) {
        const a = s.stage.camera.screenOf(o.pose.x + dx, o.pose.y, o.pose.z + dz);
        if (s.stage.controller.view.pick(a.x, a.y, null)?.id === id) {
          const r = document.querySelector('.canvas-host canvas')!.getBoundingClientRect();
          return { x: a.x + r.left, y: a.y + r.top };
        }
      }
    }
    return null;
  }, id);
  expect(p, `sin punto visible para ${id}`).not.toBeNull();
  return p!;
}

async function world(page: Page): Promise<AnyState> {
  return page.evaluate(() => JSON.parse(JSON.stringify((window as never as { __lab: { getState(): AnyState } }).__lab.getState().runtime.world)));
}

/** Termina la transición de cámara y deja dibujar un par de fotogramas. */
async function settle(page: Page) {
  await page.evaluate(() => (window as never as { __lab: { getState(): AnyState } }).__lab.getState().stage.camera.settle());
  await page.waitForTimeout(150);
}

async function lookAt(page: Page, x: number, y: number, z: number, dist: number) {
  await page.evaluate(([x, y, z, d]) => (window as never as { __lab: { getState(): AnyState } }).__lab.getState().stage.camera.lookAt(x, y, z, d), [x, y, z, dist] as const);
  await settle(page);
}

async function waitIdle(page: Page) {
  await page.waitForFunction(() => (window as never as { __lab: { getState(): AnyState } }).__lab.getState().stage.animator.idle(), undefined, { timeout: 15000 });
  await page.waitForTimeout(100);
}

async function waitPhysics(page: Page) {
  await page.waitForFunction(() => (window as never as { __lab: { getState(): AnyState } }).__lab.getState().stage.physicsActive.size === 0, undefined, { timeout: 15000 });
}

/**
 * Puntos de pantalla para arrastrar un objeto de modo que su pose termine en (tx, ty):
 * el controlador proyecta el puntero sobre el plano de la mesada y conserva el desfase del agarre.
 */
async function dragPoints(page: Page, id: string, tx: number, ty: number, grabDz = 1): Promise<{ from: Pt; to: Pt }> {
  return page.evaluate(([id, tx, ty, dz]) => {
    const s = (window as never as { __lab: { getState(): AnyState } }).__lab.getState();
    const w = s.runtime.world;
    const st = s.stage;
    const p = (w.vessels[id] ?? w.props[id]).pose;
    // Punto de agarre: el pedido si el rayo toca ese objeto; si no, el primero (de abajo hacia arriba) que lo toque.
    let a = st.camera.screenOf(p.x, p.y, p.z + dz);
    if (st.controller.view.pick(a.x, a.y, null)?.id !== id) {
      search: for (let z = 0.2; z <= 14; z += 0.4) {
        for (const ox of [0, -0.8, 0.8, -2, 2]) {
          const c = st.camera.screenOf(p.x + ox, p.y, p.z + z);
          if (st.controller.view.pick(c.x, c.y, null)?.id === id) {
            a = c;
            break search;
          }
        }
      }
    }
    const b = st.controller.view.toBench(a.x, a.y, 0);
    const offX = p.x - b.x;
    const offY = p.y - b.y;
    const c = st.camera.screenOf(tx - offX, ty - offY, 0);
    const r = document.querySelector('.canvas-host canvas')!.getBoundingClientRect();
    return { from: { x: a.x + r.left, y: a.y + r.top }, to: { x: c.x + r.left, y: c.y + r.top } };
  }, [id, tx, ty, grabDz] as const);
}

/** Punto de pantalla al que llevar el puntero para que el objeto YA sostenido apunte a (tx, ty). */
async function heldPointerTo(page: Page, tx: number, ty: number): Promise<Pt> {
  return page.evaluate(([tx, ty]) => {
    const st = (window as never as { __lab: { getState(): AnyState } }).__lab.getState().stage;
    const h = st.controller.held;
    const c = st.camera.screenOf(tx - h.offX, ty - h.offY, 0);
    const r = document.querySelector('.canvas-host canvas')!.getBoundingClientRect();
    return { x: c.x + r.left, y: c.y + r.top };
  }, [tx, ty] as const);
}

async function drag(page: Page, from: Pt, to: Pt, steps = 25) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 8, from.y + 4, { steps: 3 });
  await page.mouse.move(to.x, to.y, { steps });
  await page.waitForTimeout(300);
  await page.mouse.up();
  await page.waitForTimeout(200);
}

async function dragObj(page: Page, id: string, tx: number, ty: number, grabDz = 1) {
  const { from, to } = await dragPoints(page, id, tx, ty, grabDz);
  await drag(page, from, to);
}

test.describe('Laboratorio 3D', () => {
  test('carga sin errores y pasa la auditoría de accesibilidad (sin errores graves)', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto('/');
    const axeIntro = await new AxeBuilder({ page }).analyze();
    expect(axeIntro.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([]);
    await startLab(page);
    await expect(page.getByTestId('lab-canvas')).toBeVisible();
    const axeLab = await new AxeBuilder({ page }).exclude('canvas').analyze();
    expect(axeLab.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([]);
    await page.screenshot({ path: 'e2e-shots/01-estacion-A.png' });
    expect(errors).toEqual([]);
  });

  test('equipo de protección: botones con ilustración, accesibles y obligatorios', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByRole('button', { name: 'Comenzar intento' }).click();
    const confirm = page.getByRole('button', { name: 'Confirmar y entrar al laboratorio' });
    await expect(confirm).toBeDisabled();
    for (const name of PPE) {
      const b = page.getByRole('button', { name, exact: true });
      await expect(b).toHaveAttribute('aria-pressed', 'false');
      await expect(b.locator('svg')).toBeVisible();
    }
    // Teclado: Tab hasta el primer accesorio y Espacio lo activa.
    await page.getByRole('button', { name: PPE[0], exact: true }).focus();
    await page.keyboard.press('Space');
    await expect(page.getByRole('button', { name: PPE[0], exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: PPE[1], exact: true }).click();
    await expect(page.getByText('2 de 4 puestos')).toBeVisible();
    await page.locator('.modal').screenshot({ path: 'e2e-shots/00-equipo-proteccion.png' });
    const axe = await new AxeBuilder({ page }).include('.modal').analyze();
    expect(axe.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([]);
    // Tema oscuro: mismo contraste.
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.locator('.modal').screenshot({ path: 'e2e-shots/00-equipo-proteccion-oscuro.png' });
    const axeDark = await new AxeBuilder({ page }).include('.modal').analyze();
    expect(axeDark.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([]);
    await page.emulateMedia({ colorScheme: 'light' });
    // Quitarse uno vuelve a bloquear la entrada; con los cuatro se habilita.
    await page.getByRole('button', { name: PPE[1], exact: true }).click();
    await expect(page.getByRole('button', { name: PPE[1], exact: true })).toHaveAttribute('aria-pressed', 'false');
    for (const name of PPE.slice(1)) await page.getByRole('button', { name, exact: true }).click();
    await expect(confirm).toBeEnabled();
    await confirm.click();
    await expect(page.locator('.modal')).toHaveCount(0);
  });

  test('arrastrar un tubo a la gradilla con el ratón (encaje suave)', async ({ page }) => {
    await startLab(page);
    const w = await world(page);
    const rack = w.props.rack.pose;
    await lookAt(page, (w.vessels.t1.pose.x + rack.x) / 2, (w.vessels.t1.pose.y + rack.y) / 2, 3, 70);
    await dragObj(page, 't1', rack.x - 10, rack.y, 4);
    await waitIdle(page);
    const w2 = await world(page);
    expect(w2.vessels.t1.support).toBe('rack:0');
    await page.screenshot({ path: 'e2e-shots/02-tubo-en-gradilla.png' });
  });

  test('teclado: seleccionar, tomar, mover y soltar sin ratón', async ({ page }) => {
    await startLab(page);
    await page.getByTestId('lab-canvas').focus();
    await page.keyboard.press('ArrowRight');
    const sel = await page.evaluate(() => (window as never as { __lab: { getState(): AnyState } }).__lab.getState().selected);
    expect(sel).toBeTruthy();
    const before = await world(page);
    const pose0 = before.vessels[sel]?.pose ?? before.props[sel]?.pose;
    await page.keyboard.press('Enter');
    for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(400);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1500); // la física apoya el objeto
    const after = await world(page);
    const pose1 = after.vessels[sel]?.pose ?? after.props[sel]?.pose;
    expect(Math.hypot(pose1.x - pose0.x, pose1.y - pose0.y)).toBeGreaterThan(1);
  });

  test('cámara: estaciones, órbita y zoom no alteran el estado del laboratorio', async ({ page }) => {
    await startLab(page);
    const hash = () => page.evaluate(() => {
      const s = (window as never as { __lab: { getState(): AnyState } }).__lab.getState();
      return { h: s.runtime.stateHash(), tick: s.runtime.world.tick, poses: JSON.stringify(Object.values(s.runtime.world.vessels).map((v: AnyState) => v.pose)) };
    });
    await page.evaluate(() => (window as never as { __lab: { getState(): AnyState } }).__lab.getState().setPaused(true));
    await page.waitForTimeout(1500); // que terminen de asentarse los cuerpos
    const a = await hash();
    const targets: number[] = [];
    for (const st of ['B', 'C', 'D', 'E', 'A']) {
      await page.getByRole('button', { name: st, exact: true }).click();
      await settle(page);
      targets.push(await page.evaluate(() => (window as never as { __lab: { getState(): AnyState } }).__lab.getState().stage.camera.screenOf(100, 30, 0).x));
    }
    await page.getByTestId('lab-canvas').focus();
    for (const k of ['3', 'j', 'j', 'i', '+', '+', '-', 'l', 'k', '0', '1']) await page.keyboard.press(k);
    await page.getByRole('button', { name: 'Orbitar a la izquierda' }).click();
    await page.getByRole('button', { name: 'Restablecer la vista de la estación' }).click();
    await settle(page);
    const b = await hash();
    expect(b).toEqual(a);
    // La cámara efectivamente se movió entre estaciones.
    expect(new Set(targets.map((x) => Math.round(x))).size).toBeGreaterThan(3);
  });

  test('guardar, recargar y reanudar sin alterar el estado', async ({ page }) => {
    await startLab(page);
    await page.waitForTimeout(1500);
    const a = await page.evaluate(() => {
      const s = (window as never as { __lab: { getState(): AnyState } }).__lab.getState();
      s.setPaused(true);
      s.save();
      return { tick: s.runtime.world.tick, hash: s.runtime.stateHash() };
    });
    await page.reload();
    await page.getByRole('button', { name: 'Reanudar intento guardado' }).click();
    await page.waitForTimeout(800);
    const b = await page.evaluate(() => {
      const s = (window as never as { __lab: { getState(): AnyState } }).__lab.getState();
      return { tick: s.runtime.world.tick, hash: s.runtime.stateHash(), paused: s.paused };
    });
    expect(b.tick).toBe(a.tick);
    expect(b.hash).toBe(a.hash);
    expect(b.paused).toBe(true);
  });

  /**
   * §17.1-10: el balance de masa es idéntico con y sin escena 3D. Se ejecuta una ruta de la Parte B en el
   * navegador (con escena, física y un arrastre real con el ratón), registrando cada comando con su tick.
   * Luego se reproduce en Node sobre el mismo estado inicial SIN escena y SIN las poses escritas por la vista
   * o la física (`setPose`): las cantidades de cada recipiente y el libro de balance deben coincidir exactamente.
   */
  test('17.1-10: balance de masa idéntico con y sin escena 3D (la física no decide resultados)', async ({ page }) => {
    test.setTimeout(240000);
    await startLab(page);
    const initial: World = await page.evaluate(() => {
      const s = (window as never as { __lab: { getState(): AnyState } }).__lab.getState();
      s.setPaused(true);
      const rt = s.runtime;
      const log: Array<{ tick: number; cmd: unknown }> = [];
      (window as never as { __cmdLog: unknown }).__cmdLog = log;
      const orig = rt.dispatch.bind(rt);
      rt.dispatch = (cmd: AnyState) => {
        log.push({ tick: rt.world.tick, cmd: JSON.parse(JSON.stringify(cmd)) });
        return orig(cmd);
      };
      return JSON.parse(JSON.stringify(rt.world));
    });

    // Arrastre real con el ratón (la física apoya el vaso y escribe su pose).
    const w0 = await world(page);
    await lookAt(page, w0.vessels.beaker2.pose.x, w0.vessels.beaker2.pose.y, 3, 70);
    await dragObj(page, 'beaker2', w0.vessels.beaker2.pose.x + 8, w0.vessels.beaker2.pose.y + 6, 3);
    await page.waitForTimeout(1500);

    // Ruta guionizada: pesar, transferir, disolver, calentar, con fotogramas de la escena entre pasos.
    const steps: Array<{ cmds: Command[]; runS: number }> = [
      { cmds: [{ type: 'place', id: 'weigh_paper', support: 'balance' }, { type: 'tareBalance' }], runS: 1 },
      ...Array.from({ length: 6 }, () => ({ cmds: [{ type: 'scoop', toolId: 'spatula', sourceId: 'jar_mix' }, { type: 'tapTool', toolId: 'spatula', targetId: 'weigh_paper' }] as Command[], runS: 1 })),
      { cmds: [{ type: 'setPour', sourceId: 'weigh_paper', targetId: 'beaker1', liquidRateMlS: 0, solidRateGS: 0.3, tiltDeg: 110, guided: true }], runS: 12 },
      { cmds: [{ type: 'stopPour', sourceId: 'weigh_paper' }, { type: 'setPour', sourceId: 'piseta', targetId: 'beaker1', liquidRateMlS: 1, solidRateGS: 0, tiltDeg: 0, guided: true }], runS: 10 },
      { cmds: [{ type: 'stopPour', sourceId: 'piseta' }, { type: 'insertRod', vesselId: 'beaker1' }, { type: 'setAgitation', vesselId: 'beaker1', intensity: 0.6, tool: 'ROD' }], runS: 20 },
      { cmds: [{ type: 'place', id: 'beaker1', support: 'hotplate' }, { type: 'insertProbe', vesselId: 'beaker1', touchingBottom: false }, { type: 'setHotplatePower', pct: 30 }], runS: 40 },
      { cmds: [{ type: 'setHotplatePower', pct: 60 }], runS: 120 },
      { cmds: [{ type: 'setHotplatePower', pct: 0 }], runS: 60 },
    ];
    for (const st of steps) {
      await page.evaluate(async ([cmds, runS]) => {
        const s = (window as never as { __lab: { getState(): AnyState } }).__lab.getState();
        const rt = s.runtime;
        for (const c of cmds) rt.dispatch(c);
        const n = Math.round(runS / rt.world.params.dtS);
        // Por tramos, dejando dibujar la escena (vistas, física, efectos) entre ellos.
        for (let done = 0; done < n; ) {
          const k = Math.min(60, n - done);
          rt.paused = false;
          for (let i = 0; i < k; i++) rt.advance(rt.world.params.dtS / rt.timeScale);
          rt.paused = true;
          done += k;
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        }
      }, [st.cmds, st.runS] as const);
    }
    const live = await world(page);
    const log: Array<{ tick: number; cmd: Command }> = await page.evaluate(() => (window as never as { __cmdLog: unknown }).__cmdLog as never);
    expect(log.some((e) => e.cmd.type === 'setPose')).toBe(true); // la vista/física sí escribió poses…
    expect(log.some((e) => e.cmd.type === 'drop')).toBe(false); // …sin golpes en esta ruta

    // Reproducción sin escena: mismos comandos en los mismos ticks, sin poses.
    const w: World = JSON.parse(JSON.stringify(initial));
    for (const e of log) {
      while (w.tick < e.tick) stepMut(w, CTX);
      if (e.cmd.type !== 'setPose') dispatchMut(w, e.cmd, CTX);
    }
    while (w.tick < live.tick) stepMut(w, CTX);
    expect(w.tick).toBe(live.tick);

    for (const id of Object.keys(live.vessels)) {
      const a: Record<string, number> = mixAmounts(live.vessels[id].mix);
      const b: Record<string, number> = mixAmounts(w.vessels[id].mix);
      expect(Object.keys(a).sort()).toEqual(Object.keys(b).sort());
      for (const k of Object.keys(a)) expect(Math.abs(a[k] - b[k]), `${id}.${k}`).toBeLessThan(1e-9);
      expect(Math.abs(live.vessels[id].temperatureC - w.vessels[id].temperatureC)).toBeLessThan(1e-9);
    }
    expect(JSON.stringify(live.ledger)).toBe(JSON.stringify(w.ledger));
    expect(live.vessels.beaker1.mix.dissolved.KNO3 ?? 0).toBeGreaterThan(0.2);
  });

  test('vertido con el ratón: inclinar con la rueda sobre el receptor', async ({ page }) => {
    await startLab(page);
    await page.evaluate(() => {
      const s = (window as never as { __lab: { getState(): AnyState } }).__lab.getState();
      const w = s.runtime.world;
      w.vessels.piseta.mix.waterG -= 4;
      w.vessels.cyl.mix.waterG += 4;
    });
    const w = await world(page);
    const cyl = w.vessels.cyl.pose;
    const b1 = w.vessels.beaker1.pose;
    await lookAt(page, (cyl.x + b1.x) / 2, (cyl.y + b1.y) / 2, 6, 60);
    // Base de la probeta a ~10 cm del vaso: al inclinar ~90°, el pico queda sobre la boca del vaso.
    const { from, to } = await dragPoints(page, 'cyl', b1.x - 9.8, b1.y, 5);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 10, from.y, { steps: 3 });
    await page.mouse.move(to.x, to.y, { steps: 30 });
    await page.waitForTimeout(400);
    for (let i = 0; i < 18; i++) {
      await page.mouse.wheel(0, 100);
      await page.waitForTimeout(40);
    }
    await page.waitForTimeout(2500);
    await page.screenshot({ path: 'e2e-shots/03-vertido.png' });
    const mid = await world(page);
    // Líquido horizontal: el plano que recorta el volumen del líquido es el del mundo (normal vertical),
    // aunque el recipiente esté inclinado.
    const planes = await page.evaluate(() => {
      const s = (window as never as { __lab: { getState(): AnyState } }).__lab.getState();
      const out: Array<[number, number, number]> = [];
      s.stage.three.scene.traverse((o: AnyState) => {
        if (o.name === 'liquid:beaker1' || o.name === 'liquid:cyl') for (const p of o.material.clippingPlanes ?? []) out.push([p.normal.x, p.normal.y, p.normal.z]);
      });
      return out;
    });
    expect(planes.length).toBeGreaterThan(0);
    for (const n of planes) {
      expect(Math.abs(n[0])).toBeLessThan(1e-6);
      expect(Math.abs(n[2])).toBeLessThan(1e-6);
    }
    await page.mouse.up();
    await page.waitForTimeout(300);
    const w2 = await world(page);
    const received = w2.vessels.beaker1.mix.waterG;
    const spilled = w2.ledger.spilled.H2O ?? 0;
    expect(received + spilled).toBeGreaterThan(0.5);
    expect(received).toBeGreaterThan(spilled);
    expect(Math.abs(mid.vessels.cyl.pose.rotationRad)).toBeGreaterThan(0.5);
  });

  test('Parte A con gestos: espátula, rotular, gotero y agitar un tubo', async ({ page }) => {
    await startLab(page);
    let w = await world(page);
    await lookAt(page, 50, 32, 2, 75);
    const dragAct = async (id: string, tx: number, ty: number, dz = 0.4) => {
      // Encuadre que contiene objeto y destino (lejos de los bordes, donde la cámara se desplaza sola).
      const p = (await world(page)).vessels[id].pose;
      await lookAt(page, (p.x + tx) / 2, (p.y + ty) / 2, 2, Math.max(60, Math.abs(p.x - tx) * 1.6));
      await dragObj(page, id, tx, ty, dz);
      await waitIdle(page); // animación de la acción
      await waitPhysics(page); // y que la física apoye lo soltado
    };
    // Espátula: soltar la punta sobre el frasco de zinc (carga) … y luego sobre el tubo 1 (deposita).
    const zn = w.vessels.jar_zn.pose;
    await dragAct('spatula', zn.x - 7, zn.y, 0.3);
    w = await world(page);
    expect(Object.values(w.vessels.spatula.mix.solid).reduce((a: number, b) => a + (b as number), 0)).toBeGreaterThan(0.04);
    const t1 = w.vessels.t1.pose;
    await dragAct('spatula', t1.x - 7, t1.y, 0.3);
    w = await world(page);
    expect(w.vessels.t1.mix.solid.Zn ?? 0).toBeGreaterThan(0.04);
    await page.screenshot({ path: 'e2e-shots/05-espatula.png' });
    // Rotular con el diálogo.
    await page.evaluate(() => (window as never as { __lab: { getState(): AnyState } }).__lab.getState().select('t1'));
    await page.getByRole('button', { name: 'Rotular' }).click();
    await page.getByRole('button', { name: 'Zn', exact: true }).click();
    await page.waitForTimeout(300);
    w = await world(page);
    expect(w.vessels.t1.label).toBe('Zn');
    // Gotero: aspirar del frasco de aceite y dejarlo en reposo sobre el tubo 6; clic = 1 gota.
    const oil = w.vessels.bottle_oil.pose;
    await dragAct('dropper', oil.x, oil.y, 0.4);
    w = await world(page);
    expect(w.vessels.dropper.mix.oil[w.params.oilProfile] ?? 0).toBeGreaterThan(0.5);
    const t6 = w.vessels.t6.pose;
    await dragAct('dropper', t6.x, t6.y, 0.4);
    w = await world(page);
    expect(w.vessels.dropper.support).toBe('mouth:t6');
    const tip = await pickPoint(page, 'dropper');
    for (let i = 0; i < 10; i++) {
      await page.mouse.click(tip.x, tip.y);
      await page.waitForTimeout(250);
    }
    await waitIdle(page);
    w = await world(page);
    const oilInTube = (w.vessels.t6.mix.oil[w.params.oilProfile] ?? 0) / 0.92;
    expect(oilInTube).toBeGreaterThan(0.4);
    expect(oilInTube).toBeLessThan(0.6);
    await page.screenshot({ path: 'e2e-shots/06-gotero.png' });
  });

  test('herramientas con imán: cargar, depositar, aspirar y gotear sin soltar el clic', async ({ page }) => {
    await startLab(page);
    let w = await world(page);
    const held = () => page.evaluate(() => (window as never as { __lab: { getState(): AnyState } }).__lab.getState().stage.controller.held?.id ?? null);
    const zn = w.vessels.jar_zn.pose;
    const t1 = w.vessels.t1.pose;
    const sp = w.vessels.spatula.pose;
    await lookAt(page, (zn.x + t1.x + sp.x) / 3, (zn.y + t1.y + sp.y) / 3, 2, 100);
    // Espátula: se toma una vez y, sin soltar, se acerca al frasco (carga sola) y luego al tubo (deposita sola).
    const a = await dragPoints(page, 'spatula', zn.x - 7, zn.y, 0.3);
    await page.mouse.move(a.from.x, a.from.y);
    await page.mouse.down();
    await page.mouse.move(a.from.x + 8, a.from.y + 4, { steps: 3 });
    await page.mouse.move(a.to.x, a.to.y, { steps: 20 });
    await page.waitForFunction(() => {
      const s = (window as never as { __lab: { getState(): AnyState } }).__lab.getState();
      return Object.values(s.runtime.world.vessels.spatula.mix.solid).some((g) => (g as number) > 0.04) && !s.stage.animator.busy('spatula');
    }, undefined, { timeout: 8000 });
    expect(await held()).toBe('spatula');
    // Sigue en la mano y vuelve a seguir al puntero (no repite la carga sobre el mismo frasco).
    const b = await heldPointerTo(page, t1.x - 7, t1.y);
    await page.mouse.move(b.x, b.y, { steps: 20 });
    await page.waitForFunction(() => {
      const s = (window as never as { __lab: { getState(): AnyState } }).__lab.getState();
      return (s.runtime.world.vessels.t1.mix.solid.Zn ?? 0) > 0.04 && !s.stage.animator.busy('spatula');
    }, undefined, { timeout: 8000 });
    expect(await held()).toBe('spatula');
    await page.screenshot({ path: 'e2e-shots/13-iman-espatula.png' });
    // Sin soltar, llevar la punta al papel absorbente: se limpia sola y sigue en la mano.
    const towel = (await world(page)).vessels.towel.pose;
    const spNow = (await world(page)).vessels.spatula.pose;
    await lookAt(page, (towel.x + spNow.x) / 2, (towel.y + spNow.y) / 2 + 3, 2, Math.max(100, Math.abs(towel.x - spNow.x) * 1.6));
    const tw = await heldPointerTo(page, towel.x - 7, towel.y);
    await page.mouse.move(tw.x, tw.y, { steps: 20 });
    await page.waitForFunction(() => {
      const s = (window as never as { __lab: { getState(): AnyState } }).__lab.getState();
      return s.runtime.world.vessels.spatula.lastLoaded === null && !s.stage.animator.busy('spatula');
    }, undefined, { timeout: 8000 });
    expect(await held()).toBe('spatula');
    await page.mouse.up();
    await waitIdle(page);
    await waitPhysics(page);
    w = await world(page);
    expect(w.vessels.spatula.support).toBe('bench');
    expect(w.events.filter((e: AnyState) => e.code === 'SCOOP').length).toBe(1);

    // Gotero: aspira solo del frasco de aceite y se acopla a la boca del tubo 6; clic derecho = 1 gota.
    const oil = w.vessels.bottle_oil.pose;
    const t6 = w.vessels.t6.pose;
    const dp = w.vessels.dropper.pose;
    await lookAt(page, (oil.x + t6.x + dp.x) / 3, (oil.y + t6.y + dp.y) / 3, 4, Math.max(100, Math.abs(oil.x - t6.x) * 1.5));
    const c = await dragPoints(page, 'dropper', oil.x, oil.y, 0.4);
    await page.mouse.move(c.from.x, c.from.y);
    await page.mouse.down();
    await page.mouse.move(c.from.x + 8, c.from.y + 4, { steps: 3 });
    await page.mouse.move(c.to.x, c.to.y, { steps: 20 });
    await page.waitForFunction(() => {
      const s = (window as never as { __lab: { getState(): AnyState } }).__lab.getState();
      const d = s.runtime.world.vessels.dropper;
      return Object.values(d.mix.oil).some((g) => (g as number) > 0.5) && !s.stage.animator.busy('dropper');
    }, undefined, { timeout: 8000 });
    const e = await heldPointerTo(page, t6.x, t6.y);
    await page.mouse.move(e.x, e.y, { steps: 20 });
    await page.waitForTimeout(800); // acople
    for (let i = 0; i < 10; i++) {
      await page.mouse.down({ button: 'right' });
      await page.mouse.up({ button: 'right' });
      await page.waitForTimeout(250);
    }
    await waitIdle(page);
    w = await world(page);
    const oilInTube = (w.vessels.t6.mix.oil[w.params.oilProfile] ?? 0) / 0.92;
    expect(oilInTube).toBeGreaterThan(0.4);
    expect(oilInTube).toBeLessThan(0.6);
    await page.mouse.up();
    await page.waitForTimeout(300);
    w = await world(page);
    expect(w.vessels.dropper.support).toBe('mouth:t6');
  });

  test('piseta acoplada a la probeta: echa agua, queda en reposo y se puede separar (y la probeta no la arrastra)', async ({ page }) => {
    await startLab(page);
    let w = await world(page);
    const cyl = w.vessels.cyl.pose;
    const ps = w.vessels.piseta.pose;
    const water = async () => (await world(page)).vessels.cyl.mix.waterG as number;
    await lookAt(page, (cyl.x + ps.x) / 2, (cyl.y + ps.y) / 2, 5, Math.max(80, Math.abs(cyl.x - ps.x) * 1.8));
    // 1) Tomar la piseta y acercar la boquilla a la probeta: se acopla; clic derecho mantenido = agua.
    const a = await dragPoints(page, 'piseta', cyl.x - 5.5, cyl.y, 6);
    await page.mouse.move(a.from.x, a.from.y);
    await page.mouse.down();
    await page.mouse.move(a.from.x + 8, a.from.y + 4, { steps: 3 });
    await page.mouse.move(a.to.x, a.to.y, { steps: 20 });
    await page.waitForTimeout(800);
    await page.mouse.down({ button: 'right' });
    await page.waitForTimeout(1500);
    await page.mouse.up({ button: 'right' });
    expect(await water()).toBeGreaterThan(0.5);
    await page.mouse.up();
    await page.waitForTimeout(300);
    w = await world(page);
    expect(w.vessels.piseta.support).toBe('mouth:cyl');
    // 2) En reposo: mantenerla pulsada sin mover sigue echando agua.
    const w1 = await water();
    const p = await pickPoint(page, 'piseta');
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    await page.waitForTimeout(1000);
    await page.mouse.up();
    const w2 = await water();
    expect(w2).toBeGreaterThan(w1 + 0.2);
    // 3) Arrastrarla la separa de la probeta (sin echar agua ni volver a acoplarse).
    const b = await dragPoints(page, 'piseta', cyl.x - 30, cyl.y - 15, 6);
    await drag(page, b.from, b.to);
    await waitPhysics(page);
    w = await world(page);
    expect(w.vessels.piseta.support).toBe('bench');
    expect(Math.hypot(w.vessels.piseta.pose.x - cyl.x, w.vessels.piseta.pose.y - cyl.y)).toBeGreaterThan(12);
    expect(Math.abs((await water()) - w2)).toBeLessThan(0.05);
    // 4) Acoplada otra vez y en reposo: mover la probeta NO arrastra la piseta (queda al lado, en la mesada).
    const ps2 = w.vessels.piseta.pose;
    await lookAt(page, (cyl.x + ps2.x) / 2, (cyl.y + ps2.y) / 2 + 5, 5, Math.max(90, Math.abs(cyl.x - ps2.x) * 1.8));
    const c = await dragPoints(page, 'piseta', cyl.x - 5.5, cyl.y, 6);
    await drag(page, c.from, c.to);
    await page.waitForTimeout(800);
    w = await world(page);
    if (w.vessels.piseta.support !== 'mouth:cyl') {
      // (si al soltar no quedó en reposo, acoplarla con el imán y soltarla)
      const d = await dragPoints(page, 'piseta', cyl.x - 5.5, cyl.y, 6);
      await page.mouse.move(d.from.x, d.from.y);
      await page.mouse.down();
      await page.mouse.move(d.to.x, d.to.y, { steps: 15 });
      await page.waitForTimeout(800);
      await page.mouse.up();
      w = await world(page);
    }
    expect(w.vessels.piseta.support).toBe('mouth:cyl');
    const e = await dragPoints(page, 'cyl', cyl.x + 20, cyl.y, 5);
    await drag(page, e.from, e.to);
    await waitPhysics(page);
    w = await world(page);
    expect(w.vessels.piseta.support).toBe('bench');
    expect(Math.hypot(w.vessels.piseta.pose.x - w.vessels.cyl.pose.x, w.vessels.piseta.pose.y - w.vessels.cyl.pose.y)).toBeGreaterThan(12);
  });

  test('acople automático piseta ↔ probeta: desde cualquier lado y soltando la probeta junto a la piseta', async ({ page }) => {
    await startLab(page);
    let w = await world(page);
    const cyl = w.vessels.cyl.pose;
    const ps = w.vessels.piseta.pose;
    await lookAt(page, (cyl.x + ps.x) / 2, (cyl.y + ps.y) / 2 + 5, 5, Math.max(90, Math.abs(cyl.x - ps.x) * 1.8));
    // 1) Acercar el CUERPO de la piseta a la probeta por su derecha (la boquilla apunta al otro lado): se alinea sola.
    const a = await dragPoints(page, 'piseta', cyl.x + 7.5, cyl.y + 1, 6);
    await page.mouse.move(a.from.x, a.from.y);
    await page.mouse.down();
    await page.mouse.move(a.from.x + 8, a.from.y + 4, { steps: 3 });
    await page.mouse.move(a.to.x, a.to.y, { steps: 20 });
    await page.waitForTimeout(1200);
    w = await world(page);
    expect(Math.abs(w.vessels.piseta.pose.x + 5.5 - cyl.x)).toBeLessThan(0.3); // boquilla sobre la boca
    expect(Math.abs(w.vessels.piseta.pose.y - cyl.y)).toBeLessThan(0.3);
    await page.mouse.down({ button: 'right' });
    await page.waitForTimeout(1000);
    await page.mouse.up({ button: 'right' });
    await page.mouse.up();
    await page.waitForTimeout(300);
    w = await world(page);
    expect(w.vessels.cyl.mix.waterG).toBeGreaterThan(0.4);
    expect(w.vessels.piseta.support).toBe('mouth:cyl');
    await page.screenshot({ path: 'e2e-shots/14-piseta-acoplada.png' });

    // 2) Separarla y dejarla en la mesada.
    const b = await dragPoints(page, 'piseta', cyl.x - 30, cyl.y + 10, 6);
    await drag(page, b.from, b.to);
    await waitPhysics(page);
    w = await world(page);
    expect(w.vessels.piseta.support).toBe('bench');
    // 3) Soltar la probeta cerca del punto bajo la boquilla: se encaja y la piseta queda acoplada.
    const p = w.vessels.piseta.pose;
    const c2 = w.vessels.cyl.pose;
    await lookAt(page, (c2.x + p.x) / 2, (c2.y + p.y) / 2 + 5, 5, Math.max(90, Math.abs(c2.x - p.x) * 1.8));
    const c = await dragPoints(page, 'cyl', p.x + 5.5 + 2.2, p.y - 1.5, 5);
    await drag(page, c.from, c.to);
    await page.waitForTimeout(500);
    w = await world(page);
    expect(w.vessels.piseta.support).toBe('mouth:cyl');
    expect(Math.abs(w.vessels.cyl.pose.x - (p.x + 5.5))).toBeLessThan(0.3);
    expect(Math.abs(w.vessels.cyl.pose.y - p.y)).toBeLessThan(0.3);
    expect(w.vessels.cyl.support).toBe('bench');
  });

  test('verter acoplado: la probeta se une al tubo, se inclina con el clic derecho y se endereza al soltar', async ({ page }) => {
    await startLab(page);
    await page.evaluate(() => {
      const w = (window as never as { __lab: { getState(): AnyState } }).__lab.getState().runtime.world;
      w.vessels.piseta.mix.waterG -= 2;
      w.vessels.cyl.mix.waterG += 2;
    });
    let w = await world(page);
    const cyl = w.vessels.cyl.pose;
    const t1 = w.vessels.t1.pose;
    const st = () => page.evaluate(() => {
      const s = (window as never as { __lab: { getState(): AnyState } }).__lab.getState();
      const c = s.stage.controller;
      return { dock: c.pourDock, held: c.held?.id ?? null, pose: s.runtime.world.vessels.cyl.pose, t1: s.runtime.world.vessels.t1.mix.waterG, cyl: s.runtime.world.vessels.cyl.mix.waterG, spilled: s.runtime.world.ledger.spilled.H2O ?? 0 };
    });
    await lookAt(page, (cyl.x + t1.x) / 2, (cyl.y + t1.y) / 2 + 3, 6, Math.max(90, Math.abs(cyl.x - t1.x) * 1.6));
    // Llevar la probeta junto al tubo 1, por delante (sin apuntar el pico): se acopla.
    const a = await dragPoints(page, 'cyl', t1.x, t1.y - 3.5, 5);
    await page.mouse.move(a.from.x, a.from.y);
    await page.mouse.down();
    await page.mouse.move(a.from.x + 8, a.from.y + 4, { steps: 3 });
    await page.mouse.move(a.to.x, a.to.y, { steps: 20 });
    await page.waitForTimeout(900);
    let s = await st();
    expect(s.dock?.targetId).toBe('t1');
    // Mantener el clic derecho: se inclina poco a poco y vierte en el tubo, con el pico sobre su boca.
    await page.mouse.down({ button: 'right' });
    await page.waitForTimeout(4500);
    s = await st();
    expect(Math.abs(s.pose.rotationRad)).toBeGreaterThan(1.2);
    await page.screenshot({ path: 'e2e-shots/15-probeta-vierte-en-tubo.png' });
    await page.mouse.up({ button: 'right' });
    await page.waitForTimeout(1600);
    s = await st();
    expect(Math.abs(s.pose.rotationRad)).toBeLessThan(0.1); // se enderezó sola
    expect(s.t1).toBeGreaterThan(1.5);
    expect(s.spilled).toBeLessThan(0.05);
    // Soltar: queda de pie en la mesada, al lado.
    await page.mouse.up();
    await waitIdle(page);
    w = await world(page);
    expect(w.vessels.cyl.support).toBe('bench');
    expect(Math.abs(w.vessels.cyl.pose.rotationRad)).toBeLessThan(0.01);
    expect(w.vessels.cyl.pose.z).toBeLessThan(0.1);
  });

  test('varilla y sonda entran solas al acercarlas; espátula se limpia sola sobre el papel; vaso se coloca bajo el embudo', async ({ page }) => {
    await startLab(page);
    let w = await world(page);
    const b1 = w.vessels.beaker1.pose;
    const rod = w.props.rod.pose;
    await lookAt(page, (b1.x + rod.x) / 2, (b1.y + rod.y) / 2 + 3, 4, Math.max(90, Math.abs(b1.x - rod.x) * 1.6));
    // Varilla: sin soltar, entra al vaso y sigue en la mano para agitar.
    const rp = await pickPoint(page, 'rod');
    await page.mouse.move(rp.x, rp.y);
    await page.mouse.down();
    await page.mouse.move(rp.x + 8, rp.y + 4, { steps: 3 });
    const rodTo = await heldPointerTo(page, b1.x, b1.y);
    await page.mouse.move(rodTo.x, rodTo.y, { steps: 20 });
    await page.waitForTimeout(700);
    w = await world(page);
    expect(w.devices.rod.vesselId).toBe('beaker1');
    expect(await page.evaluate(() => (window as never as { __lab: { getState(): AnyState } }).__lab.getState().stage.controller.held?.id)).toBe('rod');
    await page.mouse.up();
    // Sonda: entra sola y queda colocada (se suelta de la mano).
    const pr = w.props.probe.pose;
    await lookAt(page, (b1.x + pr.x) / 2, (b1.y + pr.y) / 2 + 3, 4, Math.max(90, Math.abs(b1.x - pr.x) * 1.6));
    const pp = await pickPoint(page, 'probe');
    await page.mouse.move(pp.x, pp.y);
    await page.mouse.down();
    await page.mouse.move(pp.x + 8, pp.y + 4, { steps: 3 });
    const probeTo = await heldPointerTo(page, b1.x, b1.y);
    await page.mouse.move(probeTo.x, probeTo.y, { steps: 20 });
    await page.waitForTimeout(700);
    await page.mouse.up();
    w = await world(page);
    expect(w.devices.probe.vesselId).toBe('beaker1');

    // Vaso receptor bajo el embudo montado en el aro (sobre la placa base, espiga contra la pared).
    await page.evaluate(() => {
      const s = (window as never as { __lab: { getState(): AnyState } }).__lab.getState();
      s.dispatch({ type: 'place', id: 'funnel', support: 'ring' });
    });
    await page.waitForTimeout(300);
    w = await world(page);
    const f = w.vessels.funnel.pose;
    const b2 = w.vessels.beaker2.pose;
    await lookAt(page, (f.x + b2.x) / 2, (f.y + b2.y) / 2 + 3, 4, Math.max(90, Math.abs(f.x - b2.x) * 1.6));
    await dragObj(page, 'beaker2', f.x + 2, f.y + 3, 3);
    await waitIdle(page);
    w = await world(page);
    expect(w.vessels.funnel.funnel.dripTargetId).toBe('beaker2');
    expect(w.vessels.funnel.funnel.stemTouchingWall).toBe(true);
    expect(w.vessels.beaker2.pose.z).toBeGreaterThan(1);
    await page.screenshot({ path: 'e2e-shots/16-vaso-bajo-embudo.png' });
  });

  /** Capturas por estación y nivel de calidad, con el presupuesto de dibujo de §3.9. */
  test('capturas por estación y calidad (presupuesto: ≤ 200 llamadas, ≤ 500 000 triángulos)', async ({ page }) => {
    test.setTimeout(240000);
    await startLab(page, 'GUIDED');
    const report: Record<string, unknown> = {};
    for (const q of ['HIGH', 'MEDIUM', 'LOW']) {
      await page.evaluate((q) => (window as never as { __lab: { getState(): AnyState } }).__lab.getState().setSettings({ quality: q }), q);
      await page.waitForFunction((q) => {
        const st = (window as never as { __lab: { getState(): AnyState } }).__lab.getState().stage;
        return st.quality === q && !!st.camera && st.three?.gl.domElement.isConnected;
      }, q, { timeout: 30000 });
      await page.waitForTimeout(1500);
      for (const st of ['A', 'B', 'C', 'D', 'E']) {
        await page.getByRole('button', { name: st, exact: true }).click();
        await settle(page);
        await page.waitForTimeout(1100); // al menos una medición de estadísticas por segundo
        const stats = await page.evaluate(() => (window as never as { __lab: { getState(): AnyState } }).__lab.getState().stage.stats);
        report[`${st}-${q}`] = stats;
        expect(stats.calls).toBeGreaterThan(10);
        expect(stats.calls).toBeLessThanOrEqual(200);
        expect(stats.triangles).toBeLessThanOrEqual(500000);
        await page.screenshot({ path: `e2e-shots/estacion-${st}-${q}.png` });
      }
    }
    console.log('RENDER_STATS', JSON.stringify(report));
  });

  test('sin objetos atravesados ni suspendidos (al inicio y tras soltar con física)', async ({ page }) => {
    await startLab(page);
    const w0 = await world(page);
    const b = w0.vessels.beaker2.pose;
    await lookAt(page, b.x, b.y, 3, 70);
    // Soltar desde la altura de transporte justo al lado de otro vaso: la física lo apoya sin solaparse.
    await dragObj(page, 'beaker2', w0.vessels.beaker1.pose.x + 3, w0.vessels.beaker1.pose.y, 3);
    await waitPhysics(page);
    const w = await world(page);
    const glass = Object.values(w.vessels).filter((v: AnyState) => v.support === 'bench' && v.integrity === 1 && ['BEAKER', 'GRADUATED_CYLINDER', 'PORCELAIN_DISH', 'FUNNEL', 'REAGENT_JAR', 'REAGENT_BOTTLE', 'BATH', 'JUG', 'WASH_BOTTLE', 'WASTE', 'ICE_BUCKET'].includes(v.type)) as AnyState[];
    const r = (v: AnyState) => ({ BEAKER: 2.5, GRADUATED_CYLINDER: 2.0, PORCELAIN_DISH: 3.5, FUNNEL: 3.25, REAGENT_JAR: 2.4, REAGENT_BOTTLE: 2.2, BATH: 5.7, JUG: 4.9, WASH_BOTTLE: 3.6, WASTE: 4.6, ICE_BUCKET: 5.9 } as Record<string, number>)[v.type];
    for (const v of glass) {
      const rest = v.type === 'FUNNEL' ? 4 : 0;
      expect(Math.abs(v.pose.z - rest), `${v.id} suspendido a z=${v.pose.z}`).toBeLessThan(0.6);
    }
    for (let i = 0; i < glass.length; i++) {
      for (let j = i + 1; j < glass.length; j++) {
        const a = glass[i];
        const c = glass[j];
        const d = Math.hypot(a.pose.x - c.pose.x, a.pose.y - c.pose.y);
        expect(d, `${a.id} atraviesa ${c.id}`).toBeGreaterThan((r(a) + r(c)) * 0.85);
      }
    }
  });

  test('pérdida del contexto WebGL: la escena se reconstruye desde el estado', async ({ page }) => {
    await startLab(page);
    const before = await page.evaluate(() => {
      const s = (window as never as { __lab: { getState(): AnyState } }).__lab.getState();
      s.setPaused(true);
      return s.runtime.stateHash();
    });
    await page.evaluate(async () => {
      const s = (window as never as { __lab: { getState(): AnyState } }).__lab.getState();
      const ext = s.stage.three.gl.getContext().getExtension('WEBGL_lose_context');
      ext.loseContext();
      await new Promise((r) => setTimeout(r, 300));
      ext.restoreContext();
    });
    await expect(page.getByText('Escena 3D restaurada')).toBeVisible();
    await page.waitForFunction(() => {
      const st = (window as never as { __lab: { getState(): AnyState } }).__lab.getState().stage;
      return !!st.camera && st.three?.gl.domElement.isConnected && !st.three.gl.getContext().isContextLost() && st.stats.calls > 10;
    }, undefined, { timeout: 20000 });
    const after = await page.evaluate(() => (window as never as { __lab: { getState(): AnyState } }).__lab.getState().runtime.stateHash());
    expect(after).toBe(before);
    await page.screenshot({ path: 'e2e-shots/10-contexto-restaurado.png' });
  });

  test('cristales que aparecen gradualmente según la masa; papel ajustado al embudo, roto y rebalsando', async ({ page }) => {
    await startLab(page);
    await page.evaluate(() => (window as never as { __lab: { getState(): AnyState } }).__lab.getState().setPaused(true));
    const counts: number[] = [];
    for (const g of [0.005, 0.05, 0.2, 0.6]) {
      await page.evaluate((g) => {
        const s = (window as never as { __lab: { getState(): AnyState } }).__lab.getState();
        const b = s.runtime.world.vessels.beaker2;
        b.mix.waterG = 4;
        b.mix.crystals = { substanceId: 'KNO3', massG: g, meanSizeMm: 1.2, sizeVariance: 0.2, purityFraction: 1, nucleated: true };
      }, g);
      await page.waitForTimeout(250);
      counts.push(await page.evaluate(() => {
        let n = -1;
        (window as never as { __lab: { getState(): AnyState } }).__lab.getState().stage.three.scene.traverse((o: AnyState) => {
          if (o.name === 'crystals:beaker2') n = o.count;
        });
        return n;
      }));
    }
    for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeGreaterThan(counts[i - 1]);
    const w = await world(page);
    await lookAt(page, w.vessels.beaker2.pose.x, w.vessels.beaker2.pose.y, 2, 24);
    await page.screenshot({ path: 'e2e-shots/11-cristales.png' });
    // Embudo en el aro con papel plegado, luego roto y rebalsando.
    await page.evaluate(() => {
      const s = (window as never as { __lab: { getState(): AnyState } }).__lab.getState();
      for (const a of ['HALF', 'QUARTER', 'OPEN_3_1']) s.dispatch({ type: 'foldPaper', paperId: 'paper1', action: a });
      s.dispatch({ type: 'place', id: 'funnel', support: 'ring' });
      s.dispatch({ type: 'place', id: 'paper1', support: 'funnel' });
      s.dispatch({ type: 'tearPaper', paperId: 'paper1' });
      const f = s.runtime.world.vessels.funnel;
      f.mix.waterG = 30;
      s.runtime.world.vessels.paper1.filter.overflowed = true;
    });
    const f = (await world(page)).vessels.funnel.pose;
    await lookAt(page, f.x, f.y, f.z, 30);
    await page.waitForTimeout(400);
    await page.screenshot({ path: 'e2e-shots/12-papel-roto-rebalse.png' });
    const vis = await page.evaluate(() => {
      const out: Record<string, boolean> = {};
      (window as never as { __lab: { getState(): AnyState } }).__lab.getState().stage.three.scene.traverse((o: AnyState) => {
        if (o.name?.startsWith('funnel:')) out[o.name] = o.visible;
      });
      return out;
    });
    expect(vis['funnel:paper']).toBe(true);
    expect(vis['funnel:tear']).toBe(true);
    expect(vis['funnel:overflow']).toBe(true);
  });

  test('capturas de acción: ebullición con varilla y sonda, y vista de la sala', async ({ page }) => {
    await startLab(page);
    await page.evaluate(() => {
      const s = (window as never as { __lab: { getState(): AnyState } }).__lab.getState();
      const w = s.runtime.world;
      const b = w.vessels.beaker1;
      b.mix.waterG = 10;
      b.mix.solid = { CARBON: 0.42 };
      b.mix.dissolved = { KNO3: 2.05 };
      b.mix.suspended = { CARBON: 0.8 };
      b.temperatureC = 99;
      s.dispatch({ type: 'place', id: 'beaker1', support: 'hotplate' });
      s.dispatch({ type: 'insertRod', vesselId: 'beaker1' });
      s.dispatch({ type: 'insertProbe', vesselId: 'beaker1', touchingBottom: false });
      s.dispatch({ type: 'setHotplatePower', pct: 30 });
      s.dispatch({ type: 'setHotplatePower', pct: 55 });
      s.dispatch({ type: 'setAgitation', vesselId: 'beaker1', intensity: 0.6, tool: 'ROD' });
      w.devices.hotplate.plateTempC = 190;
    });
    const w = await world(page);
    await lookAt(page, w.vessels.beaker1.pose.x, w.vessels.beaker1.pose.y, 8, 32);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'e2e-shots/08-calentando.png' });
    await page.evaluate(() => {
      const s = (window as never as { __lab: { getState(): AnyState } }).__lab.getState();
      s.stage.camera.lookAt(280, 40, 30, 330);
    });
    await settle(page);
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'e2e-shots/09-sala.png' });
  });
});
