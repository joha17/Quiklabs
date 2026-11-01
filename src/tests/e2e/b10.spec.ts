/**
 * Biología B10 — recorrido con la escena 3D real (Playwright). Usa `window.__b10` solo para LEER el estado y elegir el objeto seleccionado;
 * las acciones se hacen con los paneles accesibles (mismos comandos que los gestos).
 */
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { openPanel } from './auth';

type AnyState = any;

const PPE = ['Bata', 'Calzado cerrado', 'Cabello recogido', 'Manos limpias', 'Guantes', 'Gafas'];
const world = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify((window as AnyState).__b10.getState().runtime.world)));
const select = (page: Page, id: string) => page.evaluate((id) => (window as AnyState).__b10.getState().select(id), id);

async function openB10(page: Page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await openPanel(page);
  await page.getByRole('button', { name: /Entrar al laboratorio: Tejidos animales/ }).click();
  await page.waitForFunction(() => !!(window as AnyState).__b10);
}

async function enter(page: Page) {
  await page.getByRole('button', { name: 'Comenzar intento' }).click();
  for (const name of PPE) await page.getByRole('button', { name, exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar y entrar al laboratorio' }).click();
  await page.waitForFunction(() => (window as AnyState).__b10.getState().stage?.stats.calls > 0, undefined, { timeout: 60000 });
}

test('el panel abre B10; EPP y laboratorio sin violaciones graves de accesibilidad', async ({ page }) => {
  await openB10(page);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Tejidos animales');
  let results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([]);
  await enter(page);
  results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).exclude('canvas').analyze();
  expect(results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([]);
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'test-results/b10-lab.png' });
});

test('el visor: elegir el estante, abrir un modelo, girar y rotular; lo que está de espaldas se rechaza', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openB10(page);
  await page.evaluate(() => (window as AnyState).__b10.getState().setSettings({ quality: 'MEDIUM', seed: 2610, mode: 'PRACTICE' }));
  await enter(page);
  await select(page, 'skullRack');
  const viewer = page.getByTestId('b10-viewer');
  await expect(viewer).toBeVisible();
  await viewer.getByRole('button', { name: /Cráneo 1/ }).click();
  expect((await world(page)).animal.openModel).toBe('skullHorse');
  // El foramen magno está atrás: de frente al lado izquierdo, el rótulo se rechaza.
  await viewer.getByRole('combobox', { name: 'Parte de la región H' }).selectOption('foramenMagnum');
  expect((await world(page)).animal.labels).toEqual([]);
  // Se gira con el ratón sobre el modelo: arrastrar cambia la orientación guardada en el mundo.
  const box = (await viewer.locator('canvas').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 150, box.y + box.height / 2, { steps: 6 });
  await page.mouse.up();
  const v = (await world(page)).animal.views.skullHorse;
  expect(v.rotatedDeg).toBeGreaterThan(50);
  // El teclado hace lo mismo.
  await viewer.locator('canvas').focus();
  for (let i = 0; i < 6; i++) await page.keyboard.press('e');
  const w = await world(page);
  expect(w.animal.views.skullHorse.rotatedDeg).toBeGreaterThan(v.rotatedDeg);
  await page.evaluate(() => (window as AnyState).__b10.getState().dispatch({ type: 'orientModel', modelId: 'skullHorse', yawDeg: 270, pitchDeg: 0, zoom: 1 }));
  await viewer.getByRole('combobox', { name: 'Parte de la región H' }).selectOption('foramenMagnum');
  expect((await world(page)).animal.labels[0].ok).toBe(true);
  await page.screenshot({ path: 'test-results/b10-viewer.png' });
  expect(errors).toEqual([]);
});

test('la mesa de orientación clasifica material e instrumento', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openB10(page);
  await enter(page);
  await select(page, 'orient');
  const bench = page.getByTestId('b10-bench');
  await expect(bench).toBeVisible();
  await bench.getByRole('combobox', { name: 'Qué es: Daphnia en agua' }).selectOption('specimen');
  await bench.getByRole('combobox', { name: 'Se observa con: Daphnia en agua' }).selectOption('stereo');
  const w = await world(page);
  expect(w.animal.cards.matDaphnia).toMatchObject({ classOk: true, instrumentOk: true });
  expect(errors).toEqual([]);
});
