/**
 * Biología B07 — recorrido con la escena 3D real (Playwright). Usa `window.__b07` solo para LEER el estado y elegir el
 * objeto seleccionado; las acciones se hacen con los paneles accesibles (mismos comandos que los gestos).
 */
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { openPanel } from './auth';

type AnyState = any;

const PPE = ['Bata', 'Calzado cerrado', 'Cabello recogido', 'Manos limpias'];
const world = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify((window as AnyState).__b07.getState().runtime.world)));
const select = (page: Page, id: string) => page.evaluate((id) => (window as AnyState).__b07.getState().select(id), id);

async function openB07(page: Page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await openPanel(page);
  await page.getByRole('button', { name: /Entrar al laboratorio: Microbiología en evidencia/ }).click();
  await page.waitForFunction(() => !!(window as AnyState).__b07);
}

async function startB07(page: Page) {
  await openB07(page);
  await page.evaluate(() => (window as AnyState).__b07.getState().setSettings({ quality: 'MEDIUM', seed: 2607, mode: 'PRACTICE', timeScale: 3 }));
  await page.getByRole('button', { name: 'Comenzar intento' }).click();
  for (const name of PPE) await page.getByRole('button', { name, exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar y entrar al laboratorio' }).click();
  await page.waitForFunction(() => (window as AnyState).__b07.getState().stage?.stats.calls > 0, undefined, { timeout: 60000 });
}

test('el panel abre B07; EPP y laboratorio sin violaciones graves de accesibilidad', async ({ page }) => {
  await openB07(page);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Microbiología en evidencia');
  let results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([]);
  await page.getByRole('button', { name: 'Comenzar intento' }).click();
  for (const name of PPE) await page.getByRole('button', { name, exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar y entrar al laboratorio' }).click();
  await page.waitForFunction(() => (window as AnyState).__b07.getState().stage?.stats.calls > 0, undefined, { timeout: 60000 });
  results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).exclude('canvas').analyze();
  expect(results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([]);
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'test-results/b07-lab.png' });
});

test('medios, visor y trazado con sus paneles y los apoyos en la mesada', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await startB07(page);
  await select(page, 'mNA');
  const bench = page.getByTestId('b07-bench');
  await expect(bench).toBeVisible();
  await bench.getByTestId('media-mNA').getByRole('button', { name: 'Leer la ficha' }).click();
  expect((await world(page)).micro.inspected).toContain('mNA');
  await select(page, 'plA');
  await page.getByRole('region', { name: 'Acciones' }).getByRole('button', { name: 'Al visor', exact: true }).click();
  await expect.poll(async () => (await world(page)).objects.plA.support).toBe('viewer');
  await page.waitForTimeout(300);
  await bench.getByRole('tab', { name: 'Visor' }).click();
  await bench.getByRole('combobox', { name: 'Colonia' }).selectOption({ index: 1 });
  await bench.getByRole('button', { name: 'Medir de borde a borde' }).click();
  const w = await world(page);
  expect(w.micro.measures[0].valid).toBe(true);
  await page.screenshot({ path: 'test-results/b07-viewer.png' });
  await bench.getByRole('tab', { name: 'Trazado' }).click();
  const c = bench.locator('canvas');
  const box = (await c.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.3, { steps: 8 });
  await page.mouse.up();
  await bench.getByRole('button', { name: 'Guardar trazado' }).click();
  expect((await world(page)).micro.trials.length).toBe(1);
  expect(errors).toEqual([]);
});
