/**
 * Biología B03 — recorrido con la escena 3D real (Playwright). Usa `window.__b03` solo para LEER el estado y elegir el
 * objeto seleccionado; las acciones se hacen con el panel accesible (mismos comandos que los gestos).
 */
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { openPanel } from './auth';

type AnyState = any;

const PPE = ['Bata', 'Calzado cerrado', 'Cabello recogido', 'Manos limpias', 'Guantes'];
const world = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify((window as AnyState).__b03.getState().runtime.world)));
const select = (page: Page, id: string) => page.evaluate((id) => (window as AnyState).__b03.getState().select(id), id);
const actions = (page: Page) => page.getByRole('region', { name: 'Acciones' });
const act = (page: Page, name: string | RegExp) => actions(page).getByRole('button', { name, exact: typeof name === 'string' }).click();

async function openB03(page: Page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await openPanel(page);
  await page.getByRole('button', { name: /Entrar al laboratorio: Fronteras celulares/ }).click();
  await page.waitForFunction(() => !!(window as AnyState).__b03);
}

test('el panel abre B03; EPP con guantes obligatorios, membrana montada y vertido desde el panel accesible', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openB03(page);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Fronteras celulares');
  let results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([]);
  await page.evaluate(() => (window as AnyState).__b03.getState().setSettings({ quality: 'MEDIUM', seed: 3303, mode: 'PRACTICE' }));
  await page.getByRole('button', { name: 'Comenzar intento' }).click();
  // Sin guantes no se entra: confirmar avisa qué falta.
  for (const name of PPE.slice(0, 4)) await page.getByRole('button', { name, exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar y entrar al laboratorio' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Guantes' }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Guantes', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar y entrar al laboratorio' }).click();
  await page.waitForFunction(() => (window as AnyState).__b03.getState().stage?.stats.calls > 0, undefined, { timeout: 60000 });
  expect((await world(page)).ppe).toBe(true);

  // Membrana: remojo, junta de la cámara 1 y pinza hasta el sello.
  await page.getByRole('button', { name: /^A · Membranas y difusión/ }).click();
  await select(page, 'md1');
  await act(page, 'Al plato de remojo');
  await page.waitForFunction(() => (window as AnyState).__b03.getState().runtime.world.perm.membranes.md1.wet01 >= 0.7, undefined, { timeout: 90000 });
  await select(page, 'md1');
  await act(page, 'Colocar en la junta');
  await select(page, 'c1');
  for (let i = 0; i < 8; i++) await act(page, /Apretar ¼ de vuelta/);
  let w = await world(page);
  expect(w.perm.cells.c1.membraneId).toBe('md1');
  expect(w.perm.cells.c1.clampTurns).toBeGreaterThanOrEqual(w.params.perm.sealTurns);

  // Agua al lado A: empezar a verter y detener al llegar a unos 10 mL.
  await select(page, 'bW');
  await actions(page).getByLabel('Verter en').selectOption('c1:A');
  await act(page, /Empezar a verter/);
  await page.waitForFunction(() => (window as AnyState).__b03.getState().runtime.world.perm.cells.c1.sides.A.volumeMl >= 10, undefined, { timeout: 60000 });
  await act(page, /Detener el vertido/);
  w = await world(page);
  expect(w.perm.cells.c1.sides.A.volumeMl).toBeGreaterThan(9);
  expect(w.perm.pours.bW).toBeUndefined();
  expect(w.perm.vessels.spill.volumeMl).toBeLessThan(0.01);

  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'test-results/b03-bench.png' });
  results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).exclude('canvas').analyze();
  expect(results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([]);
  expect(errors).toEqual([]);
});
