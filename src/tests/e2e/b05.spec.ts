/**
 * Biología B05 — recorrido con la escena 3D real (Playwright). Usa `window.__b05` solo para LEER el estado y elegir el
 * objeto seleccionado; las acciones se hacen con el panel accesible (mismos comandos que los gestos).
 */
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { openPanel } from './auth';

type AnyState = any;

const PPE = ['Bata', 'Calzado cerrado', 'Cabello recogido', 'Manos limpias', 'Guantes'];
const world = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify((window as AnyState).__b05.getState().runtime.world)));
const select = (page: Page, id: string) => page.evaluate((id) => (window as AnyState).__b05.getState().select(id), id);
const actions = (page: Page) => page.getByRole('region', { name: 'Acciones' });
const act = (page: Page, name: string | RegExp) => actions(page).getByRole('button', { name, exact: typeof name === 'string' }).click();

async function openB05(page: Page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await openPanel(page);
  await page.getByRole('button', { name: /Entrar al laboratorio: Cinética en acción/ }).click();
  await page.waitForFunction(() => !!(window as AnyState).__b05);
}

test('el panel abre B05; EPP con guantes, agua medida en la probeta desde el panel accesible y lectura al menisco', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openB05(page);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Cinética en acción');
  let results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([]);
  await page.evaluate(() => (window as AnyState).__b05.getState().setSettings({ quality: 'MEDIUM', seed: 5505, mode: 'PRACTICE' }));
  await page.getByRole('button', { name: 'Comenzar intento' }).click();
  // Sin guantes no se entra: confirmar avisa qué falta.
  for (const name of PPE.slice(0, 4)) await page.getByRole('button', { name, exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar y entrar al laboratorio' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Guantes' }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Guantes', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar y entrar al laboratorio' }).click();
  await page.waitForFunction(() => (window as AnyState).__b05.getState().stage?.stats.calls > 0, undefined, { timeout: 60000 });
  expect((await world(page)).ppe).toBe(true);

  // P2: agua destilada a la probeta de 25 mL, detener cerca del aforo y leer.
  await page.getByRole('button', { name: /^B · Preparaciones y controles/ }).click();
  await select(page, 'bW');
  await actions(page).getByLabel('Verter en').selectOption('g25');
  await act(page, /Verter$/);
  await page.waitForFunction(() => (window as AnyState).__b05.getState().runtime.world.enz.vessels.g25.volumeMl >= 20, undefined, { timeout: 60000 });
  await act(page, /Dejar de verter/);
  let w = await world(page);
  expect(w.enz.vessels.g25.volumeMl).toBeGreaterThan(19);
  expect(w.enz.pours.bW).toBeUndefined();
  expect(w.enz.vessels.spill.volumeMl).toBeLessThan(0.01);
  await select(page, 'g25');
  await act(page, /Leer el volumen/);
  w = await world(page);
  const r = w.enz.readings[w.enz.readingOrder[w.enz.readingOrder.length - 1]];
  expect(r.instrument).toBe('scale');
  expect(r.targetId).toBe('g25');

  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'test-results/b05-bench.png' });
  results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).exclude('canvas').analyze();
  expect(results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([]);
  expect(errors).toEqual([]);
});
