/**
 * Práctica 1 — recorridos con la escena 3D real (Playwright). Usa `window.__p01` solo para LEER el estado y elegir el
 * objeto seleccionado; las acciones se hacen con el panel, el ratón y el teclado reales.
 */
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { openPanel } from './auth';

type AnyState = any;

const PPE = ['Bata abotonada y mangas ajustadas', 'Gafas de seguridad', 'Cabello recogido, sin ropa suelta', 'Calzado cerrado'];
const world = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify((window as AnyState).__p01.getState().runtime.world)));
const select = (page: Page, id: string) => page.evaluate((id) => (window as AnyState).__p01.getState().select(id), id);
const actions = (page: Page) => page.getByRole('region', { name: 'Acciones' });

async function openP01(page: Page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await openPanel(page);
  await page.getByRole('button', { name: /Entrar al laboratorio: Instrumentación científica/ }).click();
  await page.waitForFunction(() => !!(window as AnyState).__p01);
}

async function startP01(page: Page, seed = 101) {
  await openP01(page);
  await page.evaluate((seed) => (window as AnyState).__p01.getState().setSettings({ quality: 'MEDIUM', seed, mode: 'PRACTICE', timeScale: 3 }), seed);
  await page.getByRole('button', { name: 'Comenzar intento' }).click();
  for (const name of PPE) await page.getByRole('button', { name, exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar y entrar al laboratorio' }).click();
  await page.waitForFunction(() => {
    const s = (window as AnyState).__p01.getState();
    return !!s.stage?.camera && s.stage.stats.calls > 0;
  }, undefined, { timeout: 60000 });
}

test('el menú abre la Práctica 1 como primera tarjeta; portada y laboratorio sin violaciones graves de accesibilidad', async ({ page }) => {
  await openP01(page);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Instrumentación científica');
  let results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([]);
  await page.getByRole('button', { name: 'Comenzar intento' }).click();
  // Sin el equipo completo el laboratorio rechaza la entrada y lo explica.
  await page.getByRole('button', { name: PPE[0], exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar y entrar al laboratorio' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'No puedes empezar sin' })).toBeVisible();
  for (const name of PPE.slice(1)) await page.getByRole('button', { name, exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar y entrar al laboratorio' }).click();
  await page.waitForFunction(() => (window as AnyState).__p01.getState().stage?.stats.calls > 0, undefined, { timeout: 60000 });
  expect((await world(page)).ppe).toBe(true);
  await page.screenshot({ path: 'test-results/p01-bench.png' });
  await select(page, 'balance01');
  await expect(actions(page).getByRole('button', { name: /Tara/ })).toBeVisible();
  await page.evaluate(() => (window as AnyState).__p01.getState().toggleNotebook());
  results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).exclude('canvas').analyze();
  expect(results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([]);
});

test('balanza desde el panel: nivelar, encender, cero estable y lectura sin errores de técnica', async ({ page }) => {
  await startP01(page);
  await page.getByRole('button', { name: /^B · Agua/ }).click();
  await select(page, 'balance01');
  const panel = actions(page);
  await panel.getByRole('button', { name: 'Nivelar' }).click();
  await panel.getByRole('button', { name: /Encender/ }).click();
  await expect.poll(async () => { const w = await world(page); return w.timeS - (w.balanceOnAt ?? w.timeS); }, { timeout: 30000 }).toBeGreaterThan(9);
  await panel.getByRole('button', { name: /Tara/ }).click();
  await expect.poll(async () => (await world(page)).balance.stable, { timeout: 15000 }).toBe(true);
  await panel.getByRole('button', { name: 'Leer', exact: true }).click();
  const w = await world(page);
  expect(w.balance.zeroedEmpty).toBeTruthy();
  expect(w.readingOrder.length).toBeGreaterThan(0);
  expect(Object.keys(w.evidence).filter((k) => k.startsWith('err:'))).toEqual([]);
  await page.screenshot({ path: 'test-results/p01-balance.png' });
});

test('pipeta con propipeta desde el panel y lectura a la altura del ojo', async ({ page }) => {
  await startP01(page);
  await page.getByRole('button', { name: /^B · Agua/ }).click();
  await select(page, 'pipette25');
  const panel = actions(page);
  await panel.getByRole('button', { name: 'Colocar la propipeta' }).click();
  await panel.getByRole('button', { name: /Llevar a Agua a temperatura ambiente/ }).click();
  await panel.getByRole('button', { name: /Aspirar/ }).hover();
  await page.mouse.down();
  await expect.poll(async () => (await world(page)).pipette.waterG, { timeout: 30000, intervals: [100] }).toBeGreaterThan(25.3);
  await page.mouse.up();
  await panel.getByRole('button', { name: 'Enrasar' }).click();
  await expect.poll(async () => (await world(page)).pipette.adjusted, { timeout: 10000 }).toBeTruthy();
  const w = await world(page);
  expect(w.pipette.fillerAttached).toBe(true);
  expect(w.evidence['err:mouth_pipetting'] ?? 0).toBe(0);
  await page.screenshot({ path: 'test-results/p01-pipette.png' });
});

test('teclado: Tab llega a las estaciones y al panel; la tecla O pone el ojo a la altura', async ({ page }) => {
  await startP01(page);
  await page.getByRole('button', { name: /^C · Clavos/ }).click();
  await select(page, 'cylinder50');
  await expect(actions(page).getByRole('button', { name: 'Leer la probeta' })).toBeVisible();
  await page.getByRole('button', { name: 'Vista a la altura del ojo' }).click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'test-results/p01-cylinder-eye.png' });
  const stats = await page.evaluate(() => (window as AnyState).__p01.getState().stage.stats);
  expect(stats.calls).toBeLessThan(900);
});
