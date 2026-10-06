/**
 * Práctica 6 — recorridos con la escena 3D real (Playwright). Usa `window.__p6` solo para LEER el estado y proyectar
 * puntos con la cámara; las manipulaciones se hacen con el ratón y el teclado reales.
 */
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { openPanel } from './auth';

type Pt = { x: number; y: number };
type AnyState = any;

const PPE = ['Bata abotonada y mangas ajustadas', 'Gafas de seguridad', 'Cabello recogido, sin ropa suelta', 'Calzado cerrado'];
const world = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify((window as AnyState).__p6.getState().runtime.world)));

async function startP6(page: Page, seed = 6161) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await openPanel(page);
  await page.getByRole('button', { name: /Entrar al laboratorio: Calorimetría/ }).click();
  await page.waitForFunction(() => !!(window as AnyState).__p6);
  await page.evaluate((seed) => (window as AnyState).__p6.getState().setSettings({ quality: 'MEDIUM', seed, mode: 'PRACTICE', timeScale: 1 }), seed);
  await page.getByRole('button', { name: 'Comenzar intento' }).click();
  for (const name of PPE) await page.getByRole('button', { name, exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar y entrar al laboratorio' }).click();
  await page.waitForFunction(() => {
    const s = (window as AnyState).__p6.getState();
    return !!s.stage?.camera && s.stage.stats.calls > 0;
  }, undefined, { timeout: 60000 });
}

async function settle(page: Page) {
  await page.evaluate(() => (window as AnyState).__p6.getState().stage.camera.settle());
  await page.waitForTimeout(300);
}

async function pickPoint(page: Page, id: string, part?: string, dzs = [6, 3, 9, 1, 12, 15, 18, 0]): Promise<Pt> {
  const p = await page.evaluate(([id, part, dzs]) => {
    const s = (window as AnyState).__p6.getState();
    const o = s.runtime.world.objects[id];
    const r = document.querySelector('.canvas-host canvas')!.getBoundingClientRect();
    for (const dz of dzs as number[]) {
      for (const dx of [0, -1, 1, -2, 2, 3, -3]) {
        for (const dy of [0, -1, 1, -3, 3]) {
          const a = s.stage.camera.screenOf(o.pose.x + dx, o.pose.y + dy, o.pose.z + dz);
          if (a.x < 40 || a.y < 10 || a.x > r.width - 10 || a.y > r.height - 10) continue;
          const h = s.stage.controller.view.pick(a.x, a.y, null);
          if (h?.id === id && (!part || h.part === part)) return { x: a.x + r.left, y: a.y + r.top };
        }
      }
    }
    return null;
  }, [id, part ?? null, dzs] as const);
  expect(p, `sin punto visible para ${id}${part ? `/${part}` : ''}`).not.toBeNull();
  return p!;
}

async function carryTo(page: Page, x: number, y: number) {
  const p = await page.evaluate(([x, y]) => {
    const s = (window as AnyState).__p6.getState();
    const h = s.stage.controller.held;
    const a = s.stage.camera.screenOf(x, y, h?.z ?? 0);
    const r = document.querySelector('.canvas-host canvas')!.getBoundingClientRect();
    return { x: a.x + r.left, y: a.y + r.top };
  }, [x, y] as const);
  await page.mouse.move(p.x, p.y, { steps: 20 });
  await page.waitForTimeout(700);
}

test('el menú abre la Práctica 6; portada y laboratorio sin violaciones graves de accesibilidad', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await openPanel(page);
  await page.getByRole('button', { name: /Entrar al laboratorio: Calorimetría/ }).click();
  await expect(page.getByRole('heading', { name: 'Calorimetría', level: 1 })).toBeVisible();
  let results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([]);
  await page.getByRole('button', { name: 'Comenzar intento' }).click();
  await expect(page.getByRole('button', { name: 'Confirmar y entrar al laboratorio' })).toBeDisabled();
  for (const name of PPE) await page.getByRole('button', { name, exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar y entrar al laboratorio' }).click();
  await page.waitForFunction(() => (window as AnyState).__p6.getState().stage?.stats.calls > 0, undefined, { timeout: 60000 });
  expect((await world(page)).ppe).toBe(true);
  await page.evaluate(() => (window as AnyState).__p6.getState().select('bomb_unit'));
  await expect(page.getByRole('group', { name: 'Bomba calorimétrica virtual' })).toBeVisible();
  await page.evaluate(() => (window as AnyState).__p6.getState().toggleNotebook());
  results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).exclude('canvas').analyze();
  expect(results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([]);
});

test('vertido con el ratón: la botella sobre la probeta, clic derecho mantenido; piseta gota a gota y lectura del menisco', async ({ page }) => {
  await startP6(page);
  await page.locator('.station-btn', { hasText: /^A$/ }).click();
  await settle(page);
  let p = await pickPoint(page, 'water_bottle');
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.waitForTimeout(400);
  let w = await world(page);
  await carryTo(page, w.objects.cylinder.pose.x - 7, w.objects.cylinder.pose.y);
  await expect.poll(() => page.evaluate(() => (window as AnyState).__p6.getState().stage.controller.dockTarget)).toBe('cylinder');
  await page.mouse.down({ button: 'right' });
  for (let i = 0; i < 80; i++) {
    await page.waitForTimeout(100);
    if ((await world(page)).vessels.cylinder.waterG > 44) break;
  }
  await page.mouse.up({ button: 'right' });
  await page.waitForTimeout(1500);
  await carryTo(page, 150, 52);
  await page.mouse.up();
  await page.waitForTimeout(500);
  w = await world(page);
  expect(w.vessels.cylinder.waterG).toBeGreaterThan(30);
  expect(w.spilledG).toBeLessThan(1);
  const before = w.vessels.cylinder.waterG;
  // Piseta: P sobre la boca de la probeta = una gota.
  await page.evaluate(() => (window as AnyState).__p6.getState().stage.camera.lookAt(145, 30, 10, 90, 0.4));
  await settle(page);
  p = await pickPoint(page, 'wash');
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.waitForTimeout(300);
  await carryTo(page, w.objects.cylinder.pose.x - 2.5, w.objects.cylinder.pose.y);
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('p');
    await page.waitForTimeout(120);
  }
  await carryTo(page, 160, 22);
  await page.mouse.up();
  await page.waitForTimeout(300);
  w = await world(page);
  expect(w.vessels.cylinder.waterG - before).toBeCloseTo(0.25, 5);
  // Lectura desde arriba (paralaje) y a la altura del menisco.
  await page.locator('.canvas-host').focus();
  await page.keyboard.press('n');
  await page.waitForTimeout(200);
  await page.keyboard.press('v');
  await page.waitForTimeout(1200);
  await page.keyboard.press('n');
  await page.waitForTimeout(300);
  w = await world(page);
  expect(w.volumeReadings.length).toBe(2);
  expect(w.volumeReadings[0].atEyeLevel).toBe(false);
  expect(w.volumeReadings[1].atEyeLevel).toBe(true);
});

test('termómetro al calorímetro, tapa con un clic, tubo al baño y pinza para tubo', async ({ page }) => {
  await startP6(page);
  await page.locator('.station-btn', { hasText: /^B$/ }).click();
  await settle(page);
  // Termómetro: arrastrar al vaso.
  let p = await pickPoint(page, 'therm_cal', undefined, [0.6, 1, 2, 0]);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.waitForTimeout(300);
  await carryTo(page, 205, 36);
  await page.mouse.up();
  await page.waitForTimeout(400);
  let w = await world(page);
  expect(w.objects.therm_cal.support).toBe('cup');
  // Tapa: clic sobre ella.
  const lidWas = w.cal.lidClosed;
  const lid: Pt | null = await page.evaluate(() => {
    const s = (window as AnyState).__p6.getState();
    const r = document.querySelector('.canvas-host canvas')!.getBoundingClientRect();
    const c = s.runtime.world.objects.cup.pose;
    const lidAt = s.runtime.world.cal.lidClosed ? { x: c.x, y: c.y, z: 11 } : { x: c.x + 8.9, y: c.y - 1, z: 0.4 };
    for (const dx of [0, 1, -1, 2]) {
      const a = s.stage.camera.screenOf(lidAt.x + dx, lidAt.y, lidAt.z);
      const h = s.stage.controller.view.pick(a.x, a.y, null);
      if (h?.part === 'lid') return { x: a.x + r.left, y: a.y + r.top };
    }
    return null;
  });
  expect(lid).not.toBeNull();
  await page.mouse.click(lid!.x, lid!.y);
  await page.waitForTimeout(300);
  expect((await world(page)).cal.lidClosed).toBe(!lidWas);
  // Tubo vacío al baño (beaker en la plantilla desde el panel) y la pinza lo toma.
  await page.evaluate(() => {
    const s = (window as AnyState).__p6.getState();
    s.stage.controller.moveVessel('beaker', 'plate');
  });
  await page.locator('.station-btn', { hasText: /^A$/ }).click();
  await settle(page);
  p = await pickPoint(page, 'tube_fe', undefined, [8, 6, 10, 4]);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.waitForTimeout(400);
  await page.keyboard.press('3');
  await settle(page);
  w = await world(page);
  await carryTo(page, w.objects.beaker.pose.x, w.objects.beaker.pose.y);
  await page.mouse.up();
  await page.waitForTimeout(500);
  w = await world(page);
  expect(w.objects.tube_fe.support).toBe('bath');
  await page.evaluate(() => (window as AnyState).__p6.getState().stage.camera.lookAt(290, 25, 10, 95, 0.45));
  await settle(page);
  p = await pickPoint(page, 'tongs', undefined, [0.5, 1, 0]);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.waitForTimeout(300);
  const tb = w.objects.tube_fe.pose;
  await page.evaluate(([gz]) => {
    const h = (window as AnyState).__p6.getState().stage.controller.held;
    h.z = gz;
  }, [tb.z + 15 * 0.75] as const);
  await carryTo(page, tb.x - 17, tb.y);
  await expect.poll(() => page.evaluate(() => (window as AnyState).__p6.getState().stage.controller.clampReady)).toBe(true);
  await page.keyboard.press('p');
  await page.waitForTimeout(300);
  expect((await world(page)).objects.tube_fe.support).toBe('tongs');
  await page.mouse.up();
});

test('tomar el tubo caliente con la mano quema; con la plantilla encendida no se entrega', async ({ page }) => {
  await startP6(page);
  await page.evaluate(() => {
    const s = (window as AnyState).__p6.getState();
    const w = s.runtime.world;
    w.tubes.tube_fe.glassC = 90;
    w.tubes.tube_fe.metalC = 90;
    s.dispatch({ type: 'setPlate', knob: 0.5 });
  });
  await page.locator('.station-btn', { hasText: /^A$/ }).click();
  await settle(page);
  const p = await pickPoint(page, 'tube_fe', undefined, [8, 6, 10, 4]);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.waitForTimeout(300);
  await page.mouse.up();
  const w = await world(page);
  expect(w.objects.tube_fe.support).toBe('rack');
  expect(w.safety.burns).toBe(1);
  await page.getByRole('button', { name: /Primeros auxilios/ }).click();
  await page.getByRole('button', { name: /Entregar/ }).first().click();
  await expect(page.getByRole('alert').filter({ hasText: /No se puede entregar/ })).toBeVisible();
});

test('la demostración calibra, mide el agua por diferencia y arma el calorímetro con los gestos reales', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await openPanel(page);
  await page.getByRole('button', { name: /Entrar al laboratorio: Calorimetría/ }).click();
  await page.waitForFunction(() => !!(window as AnyState).__p6);
  await page.evaluate(() => (window as AnyState).__p6.getState().setSettings({ quality: 'LOW' }));
  await page.getByRole('button', { name: /Ver demostración/ }).click();
  await page.waitForFunction(() => (window as AnyState).__p6.getState().demo?.index >= 4, undefined, { timeout: 180000 });
  const w = await world(page);
  expect(w.balance.calibratedAt).not.toBeNull();
  const cyl = w.massReadings.filter((m: { valid: boolean; objectId: string }) => m.valid && m.objectId === 'cylinder');
  expect(cyl.length).toBeGreaterThanOrEqual(2);
  expect(w.vessels.cup.waterG).toBeGreaterThan(45);
  expect(w.objects.therm_cal.support).toBe('cup');
});
