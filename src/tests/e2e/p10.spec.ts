/**
 * Práctica 10 — recorridos con la escena 3D real (Playwright). Usa `window.__p10` solo para LEER el estado y proyectar
 * puntos con la cámara; las acciones se hacen con el panel, el ratón y el teclado reales.
 */
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { openPanel } from './auth';

type AnyState = any;

const PPE = ['Bata abotonada y mangas ajustadas', 'Gafas de seguridad', 'Cabello recogido, sin ropa suelta', 'Calzado cerrado'];
const world = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify((window as AnyState).__p10.getState().runtime.world)));
const select = (page: Page, id: string) => page.evaluate((id) => (window as AnyState).__p10.getState().select(id), id);
const actions = (page: Page) => page.getByRole('region', { name: 'Acciones' });

async function openP10(page: Page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await openPanel(page);
  await page.getByRole('button', { name: /Entrar al laboratorio: Gases ideales/ }).click();
  await page.waitForFunction(() => !!(window as AnyState).__p10);
}

async function startP10(page: Page, seed = 1010) {
  await openP10(page);
  await page.evaluate((seed) => (window as AnyState).__p10.getState().setSettings({ quality: 'MEDIUM', seed, mode: 'PRACTICE', timeScale: 3 }), seed);
  await page.getByRole('button', { name: 'Comenzar intento' }).click();
  for (const name of PPE) await page.getByRole('button', { name, exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar y entrar al laboratorio' }).click();
  await page.waitForFunction(() => {
    const s = (window as AnyState).__p10.getState();
    return !!s.stage?.camera && s.stage.stats.calls > 0;
  }, undefined, { timeout: 60000 });
}

test('el menú abre la Práctica 10; portada y laboratorio sin violaciones graves de accesibilidad', async ({ page }) => {
  await openP10(page);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Gases ideales');
  let results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([]);
  await page.getByRole('button', { name: 'Comenzar intento' }).click();
  await expect(page.getByRole('button', { name: 'Confirmar y entrar al laboratorio' })).toBeDisabled();
  for (const name of PPE) await page.getByRole('button', { name, exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar y entrar al laboratorio' }).click();
  await page.waitForFunction(() => (window as AnyState).__p10.getState().stage?.stats.calls > 0, undefined, { timeout: 60000 });
  expect((await world(page)).ppe).toBe(true);
  await select(page, 'abalance');
  await expect(actions(page).getByRole('button', { name: /Tarar/ })).toBeVisible();
  await page.evaluate(() => (window as AnyState).__p10.getState().toggleNotebook());
  results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).exclude('canvas').analyze();
  expect(results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([]);
});

test('balanza analítica desde el panel: nivelar, puertas cerradas, tarar y leer una lectura estable', async ({ page }) => {
  await startP10(page);
  await page.getByRole('button', { name: /^A · Gravimetría/ }).click();
  await select(page, 'abalance');
  const panel = actions(page);
  await panel.getByRole('button', { name: 'Nivelar' }).click();
  if ((await world(page)).balance.doorsOpen) await panel.getByRole('button', { name: 'Cerrar puertas' }).click();
  await panel.getByRole('button', { name: /Tarar/ }).click();
  await expect.poll(async () => (await world(page)).balance.stable, { timeout: 15000 }).toBe(true);
  await panel.getByRole('button', { name: 'Leer', exact: true }).click();
  const w = await world(page);
  expect(w.balance.taredAt).not.toBeNull();
  expect(w.massReadings.length).toBeGreaterThan(0);
  expect(w.massReadings.at(-1).valid).toBe(true);
  expect(w.evidence['err:tareDoorsOpen'] ?? 0).toBe(0);
});

test('baño, bureta llena, invertida con la boca bajo el agua y sujeta en la prensa', async ({ page }) => {
  await startP10(page);
  await page.getByRole('button', { name: /^D · Recolección/ }).click();
  await select(page, 'beaker600');
  const fill = actions(page).getByRole('button', { name: /Agua al baño/ });
  await fill.hover();
  await page.mouse.down();
  await expect.poll(async () => (await world(page)).liquids.beaker600.ml, { timeout: 30000, intervals: [200] }).toBeGreaterThan(280);
  await page.mouse.up();
  await select(page, 'burette');
  await actions(page).getByRole('button', { name: /Llenar la bureta/ }).click();
  await actions(page).getByRole('button', { name: /Invertir con la boca bajo el agua/ }).click();
  await expect(actions(page).getByRole('button', { name: 'Sujetar en la prensa' })).toBeVisible();
  await actions(page).getByRole('button', { name: 'Sujetar en la prensa' }).click();
  const w = await world(page);
  expect(w.burette.inverted).toBe(true);
  expect(w.burette.clamped).toBe(true);
  expect(w.burette.initialAirMl).toBeLessThan(0.5);
  expect(w.evidence['err:invertedInAir'] ?? 0).toBe(0);
});

test('Boyle desde el panel: jeringa conectada a 10,0 mL, compresión sostenida y punto estable guardado', async ({ page }) => {
  await startP10(page);
  await page.getByRole('button', { name: /^E · Ley de Boyle/ }).click();
  await select(page, 'syringe');
  const panel = actions(page);
  // Émbolo a 10,0 mL ANTES de conectar (con el control deslizante, como un estudiante con teclado).
  await panel.getByRole('slider', { name: 'Émbolo' }).fill('10');
  await expect.poll(async () => (await world(page)).syringe.markMl, { timeout: 10000 }).toBeCloseTo(10, 1);
  await panel.getByRole('button', { name: 'Conectar al sensor' }).click();
  await expect.poll(async () => (await world(page)).syringe.connected).toBe(true);
  expect((await world(page)).syringe.markMl).toBeCloseTo(10, 1);
  await panel.getByRole('button', { name: /Iniciar recolección/ }).click();
  // Empujar el émbolo con el botón mantenido hasta ≈ 8 mL.
  await panel.getByRole('button', { name: 'Empujar' }).hover();
  await page.mouse.down();
  await expect.poll(async () => (await world(page)).syringe.targetMl, { timeout: 20000, intervals: [100] }).toBeLessThan(8.05);
  await page.mouse.up();
  await expect.poll(async () => (await world(page)).syringe.pressureKPa, { timeout: 15000 }).toBeGreaterThan(120);
  await expect(panel.getByText('lectura estable')).toBeVisible({ timeout: 20000 });
  const w0 = await world(page);
  const total = (w0.syringe.markMl + 0.8).toFixed(1).replace('.', ',');
  await panel.getByRole('textbox', { name: /Volumen total/ }).fill(total);
  await panel.getByRole('button', { name: /Keep/ }).click();
  const w = await world(page);
  expect(w.points).toHaveLength(1);
  const iso = (w.params.pressureKPa * 10.8) / (w.points[0].markMl + 0.8);
  expect(Math.abs(w.points[0].displayedKPa - iso)).toBeLessThan(3);
});
