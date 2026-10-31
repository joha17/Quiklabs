/**
 * Biología B08 — recorrido con la escena 3D real (Playwright). Usa `window.__b08` solo para LEER el estado y elegir el
 * objeto seleccionado; las acciones se hacen con los paneles accesibles (mismos comandos que los gestos).
 */
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { openPanel } from './auth';

type AnyState = any;

const PPE = ['Bata', 'Calzado cerrado', 'Cabello recogido', 'Manos limpias', 'Gafas de seguridad'];
const world = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify((window as AnyState).__b08.getState().runtime.world)));
const select = (page: Page, id: string) => page.evaluate((id) => (window as AnyState).__b08.getState().select(id), id);

async function openB08(page: Page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await openPanel(page);
  await page.getByRole('button', { name: /Entrar al laboratorio: Energía luminosa y pigmentos/ }).click();
  await page.waitForFunction(() => !!(window as AnyState).__b08);
}

async function enter(page: Page) {
  await page.getByRole('button', { name: 'Comenzar intento' }).click();
  for (const name of PPE) await page.getByRole('button', { name, exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar y entrar al laboratorio' }).click();
  await page.waitForFunction(() => (window as AnyState).__b08.getState().stage?.stats.calls > 0, undefined, { timeout: 60000 });
}

test('el panel abre B08; EPP y laboratorio sin violaciones graves de accesibilidad', async ({ page }) => {
  await openB08(page);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Energía luminosa y pigmentos');
  let results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([]);
  await enter(page);
  results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).exclude('canvas').analyze();
  expect(results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([]);
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'test-results/b08-lab.png' });
});

test('mesa de trabajo: rama al tubo, sello y campana con sus paneles', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openB08(page);
  await page.evaluate(() => (window as AnyState).__b08.getState().setSettings({ quality: 'MEDIUM', seed: 2608, mode: 'PRACTICE' }));
  await enter(page);
  await select(page, 'el1');
  await page.getByRole('region', { name: 'Acciones' }).getByRole('button', { name: 'En Tubo 1' }).click();
  await expect.poll(async () => (await world(page)).objects.el1.support).toBe('tube:gL');
  await select(page, 'gL');
  const bench = page.getByTestId('b08-bench');
  await expect(bench).toBeVisible();
  await bench.getByRole('button', { name: 'Llenar' }).click();
  await bench.getByRole('button', { name: 'Tapón', exact: true }).click();
  await bench.getByRole('button', { name: 'Acoplar capilar' }).click();
  const w = await world(page);
  expect(w.photo.tubes.gL.mL).toBe(30);
  expect(w.photo.tubes.gL.capConnected).toBe(true);
  await page.screenshot({ path: 'test-results/b08-gas.png' });
  // Fuera de la campana el solvente no se abre: el interlock habla y el frasco sigue cerrado.
  await select(page, 'hood');
  await bench.getByRole('button', { name: 'Abrir' }).first().click();
  expect((await world(page)).photo.solvents.bA.open).toBe(false);
  await page.screenshot({ path: 'test-results/b08-hood.png' });
  await select(page, 'stand');
  await page.screenshot({ path: 'test-results/b08-paper.png' });
  expect(errors).toEqual([]);
});
