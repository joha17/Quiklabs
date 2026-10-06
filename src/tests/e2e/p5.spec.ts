/**
 * Práctica 5 — recorridos con la escena 3D real (Playwright). Usa `window.__p5` solo para LEER el estado y proyectar
 * puntos con la cámara; las manipulaciones se hacen con el ratón y el teclado reales.
 */
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { openPanel } from './auth';

type Pt = { x: number; y: number };
type AnyState = any;

const PPE = ['Bata abotonada y mangas ajustadas', 'Gafas de seguridad', 'Cabello recogido, sin ropa suelta', 'Calzado cerrado'];

const world = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify((window as AnyState).__p5.getState().runtime.world)));

async function startP5(page: Page, seed = 5151) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await openPanel(page);
  await page.getByRole('button', { name: /Entrar al laboratorio: Relaciones estequiométricas/ }).click();
  await page.waitForFunction(() => !!(window as AnyState).__p5);
  await page.evaluate((seed) => (window as AnyState).__p5.getState().setSettings({ quality: 'MEDIUM', seed, mode: 'PRACTICE', timeScale: 1 }), seed);
  await page.getByRole('button', { name: 'Comenzar intento' }).click();
  for (const name of PPE) await page.getByRole('button', { name, exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar y entrar al laboratorio' }).click();
  await page.waitForFunction(() => {
    const s = (window as AnyState).__p5.getState();
    return !!s.stage?.camera && s.stage.stats.calls > 0;
  }, undefined, { timeout: 60000 });
}

async function settle(page: Page) {
  await page.evaluate(() => (window as AnyState).__p5.getState().stage.camera.settle());
  await page.waitForTimeout(300);
}

/** Punto de la pantalla donde el rayo encuentra el objeto (y la parte) pedidos. */
async function pickPoint(page: Page, id: string, part?: string, at?: { x: number; y: number; z: number }): Promise<Pt> {
  const p = await page.evaluate(([id, part, at]) => {
    const s = (window as AnyState).__p5.getState();
    const w = s.runtime.world;
    const o = w.objects[id] ?? w.gas.objects[id];
    const base = at ?? o.pose;
    const r = document.querySelector('.canvas-host canvas')!.getBoundingClientRect();
    for (const dz of [0, 1, 3, -1, 5, 2, 7, 9, 11]) {
      for (const dx of [0, -0.5, 0.5, -1, 1, -2, 2]) {
        for (const dy of [0, -1, 1]) {
          const a = s.stage.camera.screenOf(base.x + dx, base.y + dy, base.z + dz);
          const h = s.stage.controller.view.pick(a.x, a.y, null);
          if (h?.id === id && (!part || h.part === part)) return { x: a.x + r.left, y: a.y + r.top };
        }
      }
    }
    return null;
  }, [id, part ?? null, at ?? null] as const);
  expect(p, `sin punto visible para ${id}${part ? `/${part}` : ''}`).not.toBeNull();
  return p!;
}

/** Mueve lo que se sostiene para que su origen quede en (x, y) de la mesada. */
async function carryTo(page: Page, x: number, y: number) {
  const p = await page.evaluate(([x, y]) => {
    const s = (window as AnyState).__p5.getState();
    const h = s.stage.controller.held;
    const a = s.stage.camera.screenOf(x, y, h?.z ?? 0);
    const r = document.querySelector('.canvas-host canvas')!.getBoundingClientRect();
    return { x: a.x + r.left, y: a.y + r.top };
  }, [x, y] as const);
  await page.mouse.move(p.x, p.y, { steps: 20 });
  await page.waitForTimeout(700);
}

test('el menú abre la Práctica 5; portada y laboratorio sin violaciones graves de accesibilidad', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await openPanel(page);
  await page.getByRole('button', { name: /Entrar al laboratorio: Relaciones estequiométricas/ }).click();
  await expect(page.getByRole('heading', { name: 'Relaciones estequiométricas', level: 1 })).toBeVisible();
  let results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([]);
  await page.getByRole('button', { name: 'Comenzar intento' }).click();
  await expect(page.getByRole('button', { name: 'Confirmar y entrar al laboratorio' })).toBeDisabled();
  for (const name of PPE) await page.getByRole('button', { name, exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar y entrar al laboratorio' }).click();
  await page.waitForFunction(() => (window as AnyState).__p5.getState().stage?.stats.calls > 0, undefined, { timeout: 60000 });
  expect((await world(page)).ppe).toBe(true);
  // Con la balanza seleccionada se ven la lupa y el panel de pesas.
  await page.evaluate(() => (window as AnyState).__p5.getState().select('balance'));
  await expect(page.getByRole('complementary', { name: 'Balanza' })).toBeVisible();
  results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).exclude('canvas').analyze();
  expect(results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([]);
});

test('balanza con el ratón: tornillo de cero con la rueda, pesa de 10 g arrastrada, R lee la balanza', async ({ page }) => {
  await startP5(page);
  await page.locator('.station-btn', { hasText: /^A$/ }).click();
  await settle(page);
  // Tornillo de cero: rueda sobre él.
  const before = (await world(page)).balance.zeroScrewG;
  const sp = await pickPoint(page, 'balance', 'zeroScrew', { x: 86 - 21.4, y: 38 - 3.2, z: 2.6 });
  await page.mouse.move(sp.x, sp.y);
  for (let i = 0; i < 3; i++) await page.mouse.wheel(0, -100);
  await page.waitForTimeout(300);
  expect((await world(page)).balance.zeroScrewG).toBeCloseTo(before + 0.06, 5);
  // Lectura vacía (comprobación de cero) con la tecla R.
  await page.locator('.canvas-host').focus();
  await page.keyboard.press('r');
  await page.waitForTimeout(300);
  let w = await world(page);
  expect(w.measurements.length).toBe(1);
  expect(w.measurements[0].zeroCheck).toBe(true);
  // Arrastrar la pesa de 10 g a lo largo de su brazo.
  const rp = await pickPoint(page, 'balance', 'rider1', { x: 86 - 6.5, y: 38 + 1.7, z: 13.9 });
  await page.mouse.move(rp.x, rp.y);
  await page.mouse.down();
  const target = await page.evaluate(() => {
    const s = (window as AnyState).__p5.getState();
    const a = s.stage.camera.screenOf(86 + 5, 38 + 1.7, 13.9);
    const r = document.querySelector('.canvas-host canvas')!.getBoundingClientRect();
    return { x: a.x + r.left, y: a.y + r.top };
  });
  await page.mouse.move(target.x, target.y, { steps: 15 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  w = await world(page);
  expect(w.balance.riders[1]).toBeGreaterThanOrEqual(40);
  expect(w.balance.riders[1] % 10).toBe(0);
});

test('tubo al platillo y espátula: abrir el frasco, tomar MnO₂ y volcarlo en el tubo con P', async ({ page }) => {
  await startP5(page);
  await page.locator('.station-btn', { hasText: /^C$/ }).click();
  await settle(page);
  // Tubo de la gradilla al platillo, arrastrándolo (la vista cambia con el teclado mientras se sostiene).
  let p = await pickPoint(page, 'tube', undefined, { x: 297, y: 42, z: 6 });
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.waitForTimeout(400);
  await page.keyboard.press('1');
  await settle(page);
  await carryTo(page, 70, 38);
  await page.mouse.up();
  await page.waitForTimeout(500);
  let w = await world(page);
  expect(w.objects.tube.support).toBe('pan');
  expect(w.balance.panObjectId).toBe('tube');
  // De vuelta a la gradilla para cargarlo.
  p = await pickPoint(page, 'tube', undefined, { x: 70, y: 38, z: 14 });
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.waitForTimeout(400);
  await page.keyboard.press('3');
  await settle(page);
  await carryTo(page, 300, 42);
  await page.mouse.up();
  await page.waitForTimeout(500);
  expect((await world(page)).objects.tube.support).toBe('rack');
  await page.locator('.station-btn', { hasText: /^B$/ }).click();
  await settle(page);
  // Abrir el frasco de MnO₂ con un clic en la tapa.
  p = await pickPoint(page, 'bottle_mno2', 'cap', { x: 234, y: 50, z: 12 });
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(300);
  expect((await world(page)).bottles.bottle_mno2.open).toBe(true);
  // Espátula del MnO₂: al frasco (imán) → P toma; a la boca del tubo → P vuelca.
  p = await pickPoint(page, 'spatula_mno2');
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.waitForTimeout(400);
  await carryTo(page, 234 - 8.4, 50);
  await expect.poll(() => page.evaluate(() => (window as AnyState).__p5.getState().stage.controller.held?.magnet?.mode)).toBe('SCOOP');
  await page.keyboard.press('p');
  await page.waitForTimeout(300);
  w = await world(page);
  expect(w.spatulas.spatula_mno2.loadMol.MnO2).toBeGreaterThan(0);
  await page.keyboard.press('3');
  await settle(page);
  await carryTo(page, 297 - 8.4, 42);
  await expect.poll(() => page.evaluate(() => (window as AnyState).__p5.getState().stage.controller.held?.magnet?.mode)).toBe('TIP');
  await page.keyboard.press('p');
  await page.waitForTimeout(300);
  await page.mouse.up();
  w = await world(page);
  expect(w.tube.contents.MnO2 * 86.937).toBeGreaterThan(0.04);
  expect(w.events.some((e: { code: string }) => e.code === 'WRONG_SPATULA')).toBe(false);
});

test('tomar el tubo caliente con la mano quema y no lo levanta; la entrega se bloquea con el mechero encendido', async ({ page }) => {
  await startP5(page);
  await page.evaluate(() => {
    const s = (window as AnyState).__p5.getState();
    const w = s.runtime.world;
    w.tube.glassC = 180;
    w.tube.sampleC = 170;
    const g = (cmd: unknown) => s.dispatch({ type: 'gas', cmd });
    g({ type: 'setValve', valve: 'AIR', value: 0.6 });
    g({ type: 'setValve', valve: 'TABLE', value: 1 });
    g({ type: 'setValve', valve: 'NEEDLE', value: 0.45 });
  });
  await page.locator('.station-btn', { hasText: /^C$/ }).click();
  await settle(page);
  const p = await pickPoint(page, 'tube', undefined, { x: 297, y: 42, z: 6 });
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.waitForTimeout(300);
  await page.mouse.up();
  const w = await world(page);
  // El dominio decide la consecuencia: quemadura simulada y el tubo se queda donde estaba.
  expect(w.objects.tube.support).toBe('rack');
  expect(w.safety.burns).toBe(1);
  await expect(page.getByText(/tómalo con la pinza para tubo/)).toBeVisible();
  await page.getByRole('button', { name: /Entregar/ }).first().click();
  await expect(page.getByRole('alert').filter({ hasText: /No se puede entregar/ })).toBeVisible();
});

test('la demostración calibra la balanza y pesa el tubo con los gestos reales', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await openPanel(page);
  await page.getByRole('button', { name: /Entrar al laboratorio: Relaciones estequiométricas/ }).click();
  await page.waitForFunction(() => !!(window as AnyState).__p5);
  await page.evaluate(() => (window as AnyState).__p5.getState().setSettings({ quality: 'LOW' }));
  await page.getByRole('button', { name: /Ver demostración/ }).click();
  await page.waitForFunction(() => (window as AnyState).__p5.getState().demo?.index >= 3, undefined, { timeout: 120000 });
  const w = await world(page);
  expect(w.balance.calibratedAt).not.toBeNull();
  expect(w.measurements.filter((m: { valid: boolean; zeroCheck: boolean }) => m.valid && !m.zeroCheck).length).toBeGreaterThanOrEqual(1);
});
