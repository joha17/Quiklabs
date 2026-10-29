/**
 * Biología B04 — recorrido con la escena 3D real (Playwright). Usa `window.__b04` solo para LEER el estado y elegir el
 * objeto seleccionado; las acciones se hacen con el panel accesible (mismos comandos que los gestos).
 */
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { openPanel } from './auth';

type AnyState = any;

const PPE = ['Bata', 'Calzado cerrado', 'Cabello recogido', 'Manos limpias', 'Guantes', 'Gafas de seguridad'];
const world = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify((window as AnyState).__b04.getState().runtime.world)));
const select = (page: Page, id: string) => page.evaluate((id) => (window as AnyState).__b04.getState().select(id), id);
const actions = (page: Page) => page.getByRole('region', { name: 'Acciones' });
const act = (page: Page, name: string | RegExp) => actions(page).getByRole('button', { name, exact: typeof name === 'string' }).click();

test('el panel abre B04; EPP con gafas obligatorias, agua medida en probeta y tubo rotulado desde el panel accesible', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await openPanel(page);
  await page.getByRole('button', { name: /Entrar al laboratorio: Detectives moleculares/ }).click();
  await page.waitForFunction(() => !!(window as AnyState).__b04);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Detectives moleculares');
  let results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([]);
  await page.evaluate(() => (window as AnyState).__b04.getState().setSettings({ quality: 'MEDIUM', seed: 4404, mode: 'PRACTICE' }));
  await page.getByRole('button', { name: 'Comenzar intento' }).click();
  // Sin gafas no se entra: confirmar avisa qué falta.
  for (const name of PPE.slice(0, 5)) await page.getByRole('button', { name, exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar y entrar al laboratorio' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Gafas' }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Gafas de seguridad', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar y entrar al laboratorio' }).click();
  await page.waitForFunction(() => (window as AnyState).__b04.getState().stage?.stats.calls > 0, undefined, { timeout: 60000 });
  expect((await world(page)).ppe).toBe(true);

  // Agua destilada a la probeta de 100 mL: empezar a verter y detener cerca de la marca.
  await page.getByRole('button', { name: /^A · Preparaciones/ }).click();
  await select(page, 'bW');
  await actions(page).getByLabel('Verter en').selectOption('g100');
  await act(page, /Verter$/);
  await page.waitForFunction(() => (window as AnyState).__b04.getState().runtime.world.bio.vessels.g100.volumeMl >= 40, undefined, { timeout: 60000 });
  await act(page, /Detener el vertido/);
  let w = await world(page);
  expect(w.bio.vessels.g100.volumeMl).toBeGreaterThan(39);
  expect(w.bio.pours.bW).toBeUndefined();
  expect(w.bio.vessels.spill.volumeMl).toBeLessThan(0.01);

  // Rótulo ENSAYO/LOTE en un tubo de la gradilla A.
  await page.getByRole('button', { name: /^B · Ensayos/ }).click();
  await select(page, 'A1');
  await actions(page).getByLabel('Ensayo').selectOption('LUG');
  await actions(page).getByLabel('Código de lote').fill('L-AGU');
  await act(page, /Rotular LUG\/L-AGU/);
  w = await world(page);
  expect(w.bio.tubes.A1.label).toBe('LUG/L-AGU');

  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'test-results/b04-bench.png' });
  results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).exclude('canvas').analyze();
  expect(results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([]);
  expect(errors).toEqual([]);
});
