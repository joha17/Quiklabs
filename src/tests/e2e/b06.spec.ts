/**
 * Biología B06 — recorridos con la escena 3D real (Playwright). Usa `window.__b06` solo para LEER el estado y elegir el
 * objeto seleccionado; las acciones se hacen con el panel accesible (mismos comandos que los gestos).
 */
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { openPanel } from './auth';

type AnyState = any;

const PPE = ['Bata', 'Calzado cerrado', 'Cabello recogido', 'Manos limpias'];
const world = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify((window as AnyState).__b06.getState().runtime.world)));
const select = (page: Page, id: string) => page.evaluate((id) => (window as AnyState).__b06.getState().select(id), id);
const actions = (page: Page) => page.getByRole('region', { name: 'Acciones' });
/** Botón del panel; los mandos de los instrumentos están plegados bajo «Mandos accesibles» (se despliegan una vez). */
async function act(page: Page, name: string | RegExp) {
  const b = actions(page).getByRole('button', { name, exact: typeof name === 'string' });
  if (!(await b.count())) {
    const toggle = actions(page).getByRole('button', { name: /Mandos accesibles/ });
    if ((await toggle.count()) && (await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click();
  }
  await b.click();
}

async function openB06(page: Page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await openPanel(page);
  await page.getByRole('button', { name: /Entrar al laboratorio: Atlas celular comparado/ }).click();
  await page.waitForFunction(() => !!(window as AnyState).__b06);
}

async function startB06(page: Page, seed = 2606, mode = 'PRACTICE') {
  await openB06(page);
  await page.evaluate(([seed, mode]) => (window as AnyState).__b06.getState().setSettings({ quality: 'MEDIUM', seed, mode, timeScale: 3 }), [seed, mode] as const);
  await page.getByRole('button', { name: 'Comenzar intento' }).click();
  for (const name of PPE) await page.getByRole('button', { name, exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar y entrar al laboratorio' }).click();
  await page.waitForFunction(() => {
    const s = (window as AnyState).__b06.getState();
    return !!s.stage?.camera && s.stage.stats.calls > 0;
  }, undefined, { timeout: 60000 });
}

/** Lámina limpia a un área de preparación. */
async function slideTo(page: Page, id: string, spot: 'Al área de preparación vegetal' | 'Al área de preparación animal') {
  await page.getByRole('button', { name: /^B · Preparaciones vegetales/ }).click();
  await select(page, id);
  await act(page, spot);
}

/** Cubreobjetos con la pinza, bajado lento (inclinación por defecto). */
async function coverSlow(page: Page) {
  await select(page, 'fc');
  await act(page, 'Limpiar la pinza');
  await act(page, 'Tomar un cubreobjetos');
  await act(page, 'Bajar lento');
}

const errs = (w: AnyState) => Object.keys(w.evidence).filter((k) => k.startsWith('err:'));

test('el panel abre B06 (Biología); EPP y laboratorio sin violaciones graves de accesibilidad', async ({ page }) => {
  await openB06(page);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Atlas celular comparado');
  let results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([]);
  await page.getByRole('button', { name: 'Comenzar intento' }).click();
  for (const name of PPE) await page.getByRole('button', { name, exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar y entrar al laboratorio' }).click();
  await page.waitForFunction(() => (window as AnyState).__b06.getState().stage?.stats.calls > 0, undefined, { timeout: 60000 });
  const w = await world(page);
  expect(w.ppe).toBe(true);
  expect(Object.keys(w.objects)).toEqual(expect.arrayContaining(['tra', 'cuP', 'cuE', 'fxB', 'fxS']));
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'test-results/b06-bench.png' });
  for (const st of [/^B · Preparaciones vegetales/, /^C · Protistas vivos/, /^D · Láminas permanentes/]) {
    await page.getByRole('button', { name: st }).click();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `test-results/b06-station-${String(st).slice(2, 3)}.png` });
  }
  await page.evaluate(() => (window as AnyState).__b06.getState().toggleNotebook());
  results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).exclude('canvas').analyze();
  expect(results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([]);
});

test('epidermis de Tradescantia desde el panel: pinza sobre la maceta, gota de agua y cubreobjetos lento', async ({ page }) => {
  await startB06(page, 2606, 'PRACTICE');
  await slideTo(page, 'sl1', 'Al área de preparación vegetal');
  await select(page, 'fc');
  await act(page, 'Limpiar la pinza');
  await act(page, 'Pelar epidermis de Tradescantia');
  await act(page, 'Dejar en la lámina');
  await select(page, 'dw');
  await act(page, /Apretar el gotero/);
  await coverSlow(page);
  const w = await world(page);
  expect(w.mounts.sl1.cell.zones[0].kind).toBe('tradescantia');
  expect(w.mounts.sl1.coverId).toBeTruthy();
  expect(errs(w)).toEqual([]);
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'test-results/b06-tradescantia-mount.png' });
});

test('Paramecium desde el panel: gota de cultivo con su gotero, metilcelulosa y cubreobjetos; lámina permanente a la platina', async ({ page }) => {
  await startB06(page, 2606, 'PRACTICE');
  await slideTo(page, 'sl3', 'Al área de preparación vegetal');
  await select(page, 'cuP');
  await act(page, /Apretar el gotero/);
  await select(page, 'mc');
  await act(page, /Apretar el gotero/);
  await coverSlow(page);
  let w = await world(page);
  expect(w.div.live.sl3?.kind ?? w.mounts.sl3.cell.zones[0].kind).toBe('paramecium');
  expect(w.mounts.sl3.cell.stainMl.methylcellulose).toBeGreaterThan(0);
  await page.getByRole('button', { name: /^D · Láminas permanentes/ }).click();
  await select(page, 'case');
  await act(page, 'Abrir la caja');
  await select(page, 'fxB');
  await act(page, 'A la platina');
  w = await world(page);
  expect(w.microscope.slideOnStage).toBe('fxB');
  expect(errs(w)).toEqual([]);
});
