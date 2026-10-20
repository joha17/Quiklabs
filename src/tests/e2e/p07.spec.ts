/**
 * Práctica 7 — recorridos con la escena 3D real (Playwright). Usa `window.__p7` solo para LEER el estado y elegir el
 * objeto seleccionado; las acciones se hacen con el panel, el ratón y el teclado reales.
 */
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { openPanel } from './auth';

type AnyState = any;

const PPE = ['Bata abotonada y mangas ajustadas', 'Gafas de seguridad', 'Calzado cerrado'];
const world = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify((window as AnyState).__p7.getState().runtime.world)));
const select = (page: Page, id: string) => page.evaluate((id) => (window as AnyState).__p7.getState().select(id), id);
const actions = (page: Page) => page.getByRole('region', { name: 'Acciones' });

async function openP7(page: Page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await openPanel(page);
  await page.getByRole('button', { name: /Entrar al laboratorio: Enlaces y propiedades/ }).click();
  await page.waitForFunction(() => !!(window as AnyState).__p7);
}

async function startP7(page: Page, seed = 707) {
  await openP7(page);
  await page.evaluate((seed) => (window as AnyState).__p7.getState().setSettings({ quality: 'MEDIUM', seed, mode: 'PRACTICE', timeScale: 3 }), seed);
  await page.getByRole('button', { name: 'Comenzar intento' }).click();
  for (const name of PPE) await page.getByRole('button', { name, exact: true }).click();
  await page.getByRole('radio', { name: 'nitrilo' }).check();
  await page.getByRole('button', { name: 'Confirmar y entrar al laboratorio' }).click();
  await page.waitForFunction(() => {
    const s = (window as AnyState).__p7.getState();
    return !!s.stage?.camera && s.stage.stats.calls > 0;
  }, undefined, { timeout: 60000 });
}

test('el menú abre la Práctica 7; portada, EPP con guantes y laboratorio sin violaciones graves de accesibilidad', async ({ page }) => {
  await openP7(page);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Enlaces y propiedades');
  let results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([]);
  await page.getByRole('button', { name: 'Comenzar intento' }).click();
  for (const name of PPE) await page.getByRole('button', { name, exact: true }).click();
  // Sin guantes elegidos, el laboratorio no deja entrar (la protección no se elige a ciegas).
  await page.getByRole('button', { name: 'Confirmar y entrar al laboratorio' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'No puedes empezar sin' })).toBeVisible();
  await page.getByRole('radio', { name: 'nitrilo' }).check();
  await page.getByRole('button', { name: 'Confirmar y entrar al laboratorio' }).click();
  await page.waitForFunction(() => (window as AnyState).__p7.getState().stage?.stats.calls > 0, undefined, { timeout: 60000 });
  expect((await world(page)).ppe).toBe(true);
  await page.screenshot({ path: 'test-results/p7-bench.png' });
  await page.evaluate(() => (window as AnyState).__p7.getState().toggleNotebook());
  results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).exclude('canvas').analyze();
  expect(results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([]);
});

test('detector desde el panel: control aprobado, cobre conduce y la sal seca no', async ({ page }) => {
  await startP7(page);
  await page.getByRole('button', { name: /^C · Conducción/ }).click();
  await select(page, 'det01');
  const panel = actions(page);
  await panel.getByRole('button', { name: /Encender/ }).click();
  await panel.getByRole('button', { name: 'Puntas al panel de control' }).click();
  await page.waitForTimeout(1500);
  await panel.getByRole('button', { name: 'Leer', exact: true }).click();
  expect((await world(page)).detector.controlTest).toBe('passed');
  await select(page, 'spCu');
  await actions(page).getByRole('button', { name: 'Apoyar las dos puntas' }).click();
  await page.waitForTimeout(1500);
  await actions(page).getByRole('button', { name: 'Leer', exact: true }).click();
  await select(page, 'spNaCl');
  await actions(page).getByRole('button', { name: 'Apoyar las dos puntas' }).click();
  await page.waitForTimeout(1500);
  await actions(page).getByRole('button', { name: 'Leer', exact: true }).click();
  await page.screenshot({ path: 'test-results/p7-detector.png' });
  const w = await world(page);
  const cur = w.readingOrder.map((id: string) => w.readings[id]).filter((r: AnyState) => r.kind === 'current' && r.valid);
  const cu = cur.find((r: AnyState) => r.targetId === 'spCu');
  const salt = cur.find((r: AnyState) => r.targetId === 'spNaCl');
  expect(cu.value).toBeGreaterThan(5);
  expect(salt.value).toBeLessThan(0.05);
  expect(Object.keys(w.evidence).filter((k) => k.startsWith('err:'))).toEqual([]);
});

test('conductímetro desde el panel: agua vertida, sonda sumergida y lectura estable del blanco', async ({ page }) => {
  await startP7(page);
  await page.getByRole('button', { name: /^D · Disoluciones/ }).click();
  await select(page, 'btWater');
  await actions(page).getByRole('button', { name: 'Destapar' }).click();
  await actions(page).getByRole('combobox', { name: 'Destino' }).selectOption('bk1');
  await actions(page).getByRole('button', { name: 'Verter (mantener)' }).hover();
  await page.mouse.down();
  await expect.poll(async () => { const w = await world(page); return (w.vessels.bk1.polar.water ?? 0); }, { timeout: 30000, intervals: [100] }).toBeGreaterThan(28);
  await page.mouse.up();
  await select(page, 'cond01');
  await actions(page).getByRole('button', { name: /Encender/ }).click();
  await select(page, 'probe01');
  await actions(page).getByRole('combobox', { name: 'Meter en' }).selectOption('bk1');
  await actions(page).getByRole('button', { name: 'Sumergir' }).click();
  await expect.poll(async () => (await world(page)).meter.stable, { timeout: 20000 }).toBe(true);
  await actions(page).getByRole('button', { name: 'Leer', exact: true }).click();
  await page.screenshot({ path: 'test-results/p7-meter.png' });
  const w = await world(page);
  const k = w.readingOrder.map((id: string) => w.readings[id]).filter((r: AnyState) => r.kind === 'conductivity');
  expect(k.at(-1).valid).toBe(true);
  expect(k.at(-1).value).toBeLessThan(20);
});

test('teclado: la vista a la altura del ojo de un tubo y el presupuesto de dibujo', async ({ page }) => {
  await startP7(page);
  await page.getByRole('button', { name: /^B · Dos disolventes/ }).click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test-results/p7-stationB.png' });
  await select(page, 'tube1');
  await page.getByRole('button', { name: 'Vista a la altura del ojo' }).click();
  await page.waitForTimeout(1500);
  const stats = await page.evaluate(() => (window as AnyState).__p7.getState().stage.stats);
  expect(stats.calls).toBeLessThan(900);
});
