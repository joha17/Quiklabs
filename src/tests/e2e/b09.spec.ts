/**
 * Biología B09 — recorrido con la escena 3D real (Playwright). Usa `window.__b09` solo para LEER el estado y elegir el
 * objeto seleccionado; las acciones se hacen con los paneles accesibles (mismos comandos que los gestos).
 */
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { openPanel } from './auth';

type AnyState = any;

const PPE = ['Bata', 'Calzado cerrado', 'Cabello recogido', 'Manos limpias', 'Guantes', 'Gafas'];
const world = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify((window as AnyState).__b09.getState().runtime.world)));
const select = (page: Page, id: string) => page.evaluate((id) => (window as AnyState).__b09.getState().select(id), id);

async function openB09(page: Page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await openPanel(page);
  await page.getByRole('button', { name: /Entrar al laboratorio: Arquitectura vegetal/ }).click();
  await page.waitForFunction(() => !!(window as AnyState).__b09);
}

async function enter(page: Page) {
  await page.getByRole('button', { name: 'Comenzar intento' }).click();
  for (const name of PPE) await page.getByRole('button', { name, exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar y entrar al laboratorio' }).click();
  await page.waitForFunction(() => (window as AnyState).__b09.getState().stage?.stats.calls > 0, undefined, { timeout: 60000 });
}

test('el panel abre B09; EPP y laboratorio sin violaciones graves de accesibilidad', async ({ page }) => {
  await openB09(page);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Arquitectura vegetal');
  let results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([]);
  await enter(page);
  results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).exclude('canvas').analyze();
  expect(results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([]);
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'test-results/b09-lab.png' });
});

test('mesa de trabajo: rotular la plántula, sujetar y cortar; el ácido fuera de zona se bloquea', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openB09(page);
  await page.evaluate(() => (window as AnyState).__b09.getState().setSettings({ quality: 'MEDIUM', seed: 2609, mode: 'PRACTICE' }));
  await enter(page);
  await select(page, 'bean');
  const bench = page.getByTestId('b09-bench');
  await expect(bench).toBeVisible();
  await bench.getByRole('button', { name: /Girar/ }).click();
  await bench.getByRole('combobox', { name: 'Zona A' }).selectOption('apicalBud');
  expect((await world(page)).plant.labels[0]).toMatchObject({ regionId: 'a', ok: true });
  await page.evaluate(() => (window as AnyState).__b09.getState().stage?.goToStation('B'));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test-results/b09-plants.png' });
  await select(page, 'cel');
  await bench.getByRole('button', { name: /Sujetar/ }).click();
  await bench.getByRole('button', { name: /Cortar/ }).click();
  const w = await world(page);
  expect(w.plant.sections).toHaveLength(1);
  expect(w.plant.sections[0].held).toBe(true);
  await page.evaluate(() => (window as AnyState).__b09.getState().stage?.goToStation('C'));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test-results/b09-cut.png' });
  await page.evaluate(() => (window as AnyState).__b09.getState().dispatch({ type: 'squeezeDropper', dispenserId: 'hcl', targetId: 'sl1', force01: 0.5, dxCm: 0, dyCm: 0 }));
  const after = await world(page);
  expect(after.dispensers.hcl.ml).toBe(5);
  expect(after.evidence['err:TV-64']).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
