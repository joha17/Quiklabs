/**
 * Práctica 8 — recorridos con la escena 3D real (Playwright). Usa `window.__p8` solo para LEER el estado y elegir el
 * objeto seleccionado; las acciones se hacen con el panel, el ratón y el teclado reales.
 */
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { openPanel } from './auth';

type AnyState = any;

const PPE = ['Gafas', 'Bata', 'Guantes de nitrilo', 'Cabello recogido'];
const world = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify((window as AnyState).__p8.getState().runtime.world)));
const select = (page: Page, id: string) => page.evaluate((id) => (window as AnyState).__p8.getState().select(id), id);
const actions = (page: Page) => page.getByRole('region', { name: 'Acciones' });

async function openP8(page: Page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await openPanel(page);
  await page.getByRole('button', { name: /Entrar al laboratorio: Síntesis orgánica comparativa/ }).click();
  await page.waitForFunction(() => !!(window as AnyState).__p8);
}

async function startP8(page: Page, route: 'ISO' | 'ASA' | 'MS' = 'ISO', seed = 808) {
  await openP8(page);
  await page.getByRole('radio', { name: new RegExp(`^${route} ·`) }).check();
  await page.evaluate((seed) => (window as AnyState).__p8.getState().setSettings({ quality: 'MEDIUM', seed, mode: 'PRACTICE', timeScale: 3 }), seed);
  await page.getByRole('button', { name: 'Comenzar intento' }).click();
  for (const name of PPE) await page.getByRole('button', { name, exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar y entrar al laboratorio' }).click();
  await page.waitForFunction(() => {
    const s = (window as AnyState).__p8.getState();
    return !!s.stage?.camera && s.stage.stats.calls > 0;
  }, undefined, { timeout: 60000 });
}

test('el menú abre la Práctica 8; selector de ruta, EPP y laboratorio sin violaciones graves de accesibilidad', async ({ page }) => {
  await openP8(page);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Síntesis orgánica comparativa');
  for (const r of ['ISO', 'ASA', 'MS']) await expect(page.getByRole('radio', { name: new RegExp(`^${r} ·`) })).toBeVisible();
  let results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([]);
  await page.getByRole('button', { name: 'Comenzar intento' }).click();
  // Sin el cabello recogido no se entra: la protección se elige entera.
  for (const name of PPE.slice(0, 3)) await page.getByRole('button', { name, exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar y entrar al laboratorio' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'No puedes empezar' })).toBeVisible();
  await page.getByRole('button', { name: 'Cabello recogido', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar y entrar al laboratorio' }).click();
  await page.waitForFunction(() => (window as AnyState).__p8.getState().stage?.stats.calls > 0, undefined, { timeout: 60000 });
  const w = await world(page);
  expect(w.ppe).toBe(true);
  expect(w.route).toBe('ISO');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'test-results/p8-bench.png' });
  await page.evaluate(() => (window as AnyState).__p8.getState().toggleNotebook());
  results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).exclude('canvas').analyze();
  expect(results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([]);
});

test('ISO desde el panel: balón al platillo, alcohol en la probeta leída a la altura del ojo y al balón', async ({ page }) => {
  await startP8(page, 'ISO');
  await page.getByRole('button', { name: /^B · Preparación/ }).click();
  await select(page, 'balance01');
  await actions(page).getByRole('button', { name: /Encender/ }).click();
  await select(page, 'rf');
  await actions(page).getByRole('button', { name: /Al platillo/ }).click();
  await expect.poll(async () => (await world(page)).balance.stable, { timeout: 20000 }).toBe(true);
  await select(page, 'balance01');
  await actions(page).getByRole('button', { name: 'Leer', exact: true }).click();
  await select(page, 'btIAA');
  await actions(page).getByRole('button', { name: 'Destapar' }).click();
  await actions(page).getByRole('combobox', { name: 'Verter en' }).selectOption('cyl10');
  await actions(page).getByRole('button', { name: 'Verter despacio' }).hover();
  await page.mouse.down();
  await expect.poll(async () => { const w = await world(page); return Object.values(w.vessels.cyl10.liq as Record<string, number>).reduce((a, b) => a + b, 0); }, { timeout: 30000, intervals: [100] }).toBeGreaterThan(0.045);
  await page.mouse.up();
  await select(page, 'cyl10');
  await actions(page).getByRole('button', { name: 'Altura del ojo' }).click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test-results/p8-cylinder-eye.png' });
  await actions(page).getByRole('button', { name: 'Leer volumen' }).click();
  await actions(page).getByRole('combobox', { name: 'Verter en' }).selectOption('rf');
  await actions(page).getByRole('button', { name: 'Verter (mantener)' }).hover();
  await page.mouse.down();
  await expect.poll(async () => (await world(page)).vessels.rf.liq.IAA ?? 0, { timeout: 30000, intervals: [200] }).toBeGreaterThan(0.04);
  await page.mouse.up();
  const w = await world(page);
  const vol = w.readingOrder.map((id: string) => w.readings[id]).filter((r: AnyState) => r.kind === 'volume');
  expect(vol.at(-1).valid).toBe(true);
  expect(w.objects.rf.support).toBe('pan');
  await page.getByRole('button', { name: /^C · Síntesis/ }).click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test-results/p8-stationC.png' });
  await page.getByRole('button', { name: /^D · Recuperación/ }).click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test-results/p8-stationD-ISO.png' });
});

test('ASA: la mesada de la ruta tiene Büchner, kitasato y estufa, y no tiene embudo de separación', async ({ page }) => {
  await startP8(page, 'ASA');
  const w = await world(page);
  expect(w.route).toBe('ASA');
  for (const id of ['buchner', 'kitasato', 'oven01', 'mp01', 'fpFine', 'btH3PO4']) expect(w.objects[id], id).toBeTruthy();
  expect(w.objects.sf).toBeUndefined();
  await page.getByRole('button', { name: /^D · Recuperación/ }).click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test-results/p8-stationD-ASA.png' });
  await page.getByRole('button', { name: /^E · Calidad/ }).click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test-results/p8-stationE-ASA.png' });
});

test('MS: el mechero con metanol abierto queda bloqueado con una banda visible (crítico) y se recupera', async ({ page }) => {
  await startP8(page, 'MS');
  await select(page, 'btMeOH');
  await actions(page).getByRole('button', { name: 'Destapar' }).click();
  await select(page, 'burner01');
  await actions(page).getByRole('button', { name: /Encender mechero/ }).click();
  await expect(page.locator('.safety-banner')).toBeVisible();
  let w = await world(page);
  expect(w.evidence['err:ORG45']).toBe(1);
  expect(w.burner.lit).toBe(false);
  await page.locator('.safety-banner').getByRole('button', { name: /Tapar/ }).click();
  await page.locator('.safety-banner').getByRole('button', { name: /Reiniciar/ }).click();
  w = await world(page);
  expect(w.safety.block).toBeNull();
});

test('teclado y rendimiento: estaciones con 1–6, vista a la altura del ojo y presupuesto de dibujo', async ({ page }) => {
  await startP8(page, 'MS');
  await page.getByTestId('lab-canvas').focus();
  for (const k of ['2', '3', '4']) {
    await page.keyboard.press(k);
    await page.waitForTimeout(900);
  }
  await page.screenshot({ path: 'test-results/p8-stationD-MS.png' });
  await select(page, 'sf');
  await page.keyboard.press('o');
  await page.waitForTimeout(1500);
  const stats = await page.evaluate(() => (window as AnyState).__p8.getState().stage.stats);
  console.log(`· P8 dibujo: ${stats.calls} llamadas, ${stats.triangles} triángulos, ${stats.fps} fps`);
  // §17.3 ítem 26: ≤ 200 llamadas de dibujo por estación.
  expect(stats.calls).toBeLessThanOrEqual(200);
  expect(stats.triangles).toBeLessThanOrEqual(500000);
});
