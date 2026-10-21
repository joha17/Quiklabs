/**
 * Práctica 9 — recorridos con la escena 3D real (Playwright). Usa `window.__p9` solo para LEER el estado y elegir el
 * objeto seleccionado; las acciones se hacen con el panel, el ratón y el teclado reales.
 */
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { openPanel } from './auth';

type AnyState = any;

const PPE = ['Gafas de seguridad', 'Bata', 'Guantes de nitrilo'];
const world = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify((window as AnyState).__p9.getState().runtime.world)));
const select = (page: Page, id: string) => page.evaluate((id) => (window as AnyState).__p9.getState().select(id), id);
const actions = (page: Page) => page.getByRole('region', { name: 'Acciones' });
const ml = (v: AnyState) => (v.liq.H2O ?? 0) * 18.015 / 0.997;

async function openP9(page: Page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await openPanel(page);
  await page.getByRole('button', { name: /Entrar al laboratorio: Identificación de cationes/ }).click();
  await page.waitForFunction(() => !!(window as AnyState).__p9);
}

async function startP9(page: Page, seed = 909) {
  await openP9(page);
  await page.evaluate((seed) => (window as AnyState).__p9.getState().setSettings({ quality: 'MEDIUM', seed, mode: 'PRACTICE', timeScale: 3 }), seed);
  await page.getByRole('button', { name: 'Comenzar intento' }).click();
  for (const name of PPE) await page.getByRole('button', { name, exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar y entrar al laboratorio' }).click();
  await page.waitForFunction(() => {
    const s = (window as AnyState).__p9.getState();
    return !!s.stage?.camera && s.stage.stats.calls > 0;
  }, undefined, { timeout: 60000 });
}

/** Campana lista desde el panel: extracción, mampara a 35 cm. */
async function hoodReady(page: Page) {
  await select(page, 'hood01');
  await actions(page).getByRole('button', { name: 'Encender extracción' }).click();
  await actions(page).getByRole('slider', { name: 'Altura de la mampara' }).fill('35');
}

test('el menú abre la Práctica 9; EPP, aviso virtual permanente y laboratorio sin violaciones graves de accesibilidad', async ({ page }) => {
  await openP9(page);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Huellas de los iones');
  await expect(page.getByRole('note').filter({ hasText: 'REPRESENTACIÓN VIRTUAL' })).toBeVisible();
  let results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([]);
  await page.getByRole('button', { name: 'Comenzar intento' }).click();
  // Sin guantes no se entra: la protección se elige entera.
  for (const name of PPE.slice(0, 2)) await page.getByRole('button', { name, exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar y entrar al laboratorio' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'No puedes empezar' })).toBeVisible();
  await page.getByRole('button', { name: 'Guantes de nitrilo', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar y entrar al laboratorio' }).click();
  await page.waitForFunction(() => (window as AnyState).__p9.getState().stage?.stats.calls > 0, undefined, { timeout: 60000 });
  const w = await world(page);
  expect(w.ppe).toBe(true);
  expect(w.evidence['err:E01']).toBe(1);
  await expect(page.locator('.virtual-note').first()).toBeVisible();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'test-results/p9-bench.png' });
  await page.evaluate(() => (window as AnyState).__p9.getState().toggleNotebook());
  results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).exclude('canvas').analyze();
  expect(results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([]);
});

test('sin extracción la llama virtual no enciende (banda de bloqueo) y se recupera desde la banda', async ({ page }) => {
  await startP9(page);
  await page.getByRole('button', { name: /^B · Atlas/ }).click();
  await select(page, 'emitter01');
  await actions(page).getByRole('button', { name: /Encender llama virtual/ }).click();
  await expect(page.locator('.safety-banner')).toBeVisible();
  let w = await world(page);
  expect(w.flame.ignited).toBe(false);
  expect(w.evidence['err:E02']).toBe(1);
  await page.locator('.safety-banner').getByRole('button', { name: /Encender extracción/ }).click();
  await page.locator('.safety-banner').getByRole('button', { name: /Bajar la mampara/ }).click();
  await page.locator('.safety-banner').getByRole('button', { name: /Reiniciar/ }).click();
  w = await world(page);
  expect(w.safety.block).toBeNull();
  expect(w.hood.fanOn).toBe(true);
  expect(w.hood.sashCm).toBeLessThanOrEqual(40);
});

test('atlas desde el panel: asa limpia, control de Sr en la llama, luz local baja y espectro en tabla accesible', async ({ page }) => {
  await startP9(page);
  await page.getByRole('button', { name: /^B · Atlas/ }).click();
  await hoodReady(page);
  await select(page, 'emitter01');
  await actions(page).getByRole('button', { name: '45 %' }).click();
  await actions(page).getByRole('button', { name: /Encender llama virtual/ }).click();
  await select(page, 'loop01');
  await actions(page).getByRole('button', { name: 'Asa al vaso de limpieza' }).click();
  await actions(page).getByRole('button', { name: 'Limpiar el asa' }).click();
  await select(page, 'ctlSr');
  await actions(page).getByRole('button', { name: 'Destapar' }).click();
  await select(page, 'loop01');
  await actions(page).getByRole('combobox', { name: 'Introducir en' }).selectOption('ctlSr');
  await actions(page).getByRole('button', { name: 'Mojar el asa' }).click();
  await actions(page).getByRole('button', { name: /Asa a la llama/ }).click();
  // La carga del asa se vaporiza en pocos segundos: se mira y se registra enseguida (≥ 1 s de llama).
  await page.waitForTimeout(700);
  await page.screenshot({ path: 'test-results/p9-flame-sr.png' });
  await select(page, 'emitter01');
  await actions(page).getByRole('button', { name: /Observar la llama/ }).click();
  await select(page, 'spec01');
  await actions(page).getByRole('button', { name: /Leer espectro/ }).click();
  await expect(page.getByRole('complementary', { name: 'Vista espectral' }).getByRole('table')).toBeVisible();
  const w = await world(page);
  const em = w.readingOrder.map((id: string) => w.readings[id]).filter((r: AnyState) => r.kind === 'emission');
  expect(em.at(-1).valid).toBe(true);
  expect(em.at(-1).category).toBe('crimson');
  expect(Object.keys(w.evidence).filter((k) => k.startsWith('err:'))).toEqual([]);
  await page.getByRole('button', { name: /^C · Campana/ }).click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test-results/p9-stationC.png' });
});

test('separación desde el panel: alícuota con la pipeta, sulfato gota a gota y sólido blanco observado', async ({ page }) => {
  await startP9(page);
  await page.getByRole('button', { name: /^D · Separación/ }).click();
  await select(page, 'smp1');
  await actions(page).getByRole('button', { name: 'Destapar' }).click();
  await select(page, 'pip');
  await actions(page).getByRole('combobox', { name: 'Introducir en' }).selectOption('smp1');
  await actions(page).getByRole('button', { name: 'Introducir', exact: true }).click();
  await actions(page).getByRole('button', { name: 'Aspirar (mantener)' }).hover();
  await page.mouse.down();
  await expect.poll(async () => { const w = await world(page); return (w.pipette.content.H2O ?? 0) * 18.015; }, { timeout: 30000, intervals: [100] }).toBeGreaterThan(2.0);
  await page.mouse.up();
  await actions(page).getByRole('combobox', { name: 'Introducir en' }).selectOption('T1');
  await actions(page).getByRole('button', { name: 'Introducir', exact: true }).click();
  await actions(page).getByRole('button', { name: 'Entregar (mantener)' }).hover();
  await page.mouse.down();
  await expect.poll(async () => ml((await world(page)).vessels.T1), { timeout: 30000, intervals: [100] }).toBeGreaterThan(1.9);
  await page.mouse.up();
  await select(page, 'dbSO4');
  await actions(page).getByRole('button', { name: 'Destapar' }).click();
  await actions(page).getByRole('combobox', { name: 'Gotear en' }).selectOption('T1');
  await actions(page).getByRole('spinbutton', { name: 'Gotas' }).fill('12');
  await actions(page).getByRole('button', { name: /Agregar 12 gotas/ }).click();
  await select(page, 'T1');
  await actions(page).getByRole('button', { name: 'Tomar (teclado)' }).click();
  await actions(page).getByRole('button', { name: 'Agitar (mantener)' }).hover();
  await page.mouse.down();
  await page.waitForTimeout(1500);
  await page.mouse.up();
  await actions(page).getByRole('button', { name: 'A la gradilla' }).click().catch(() => undefined);
  await page.waitForTimeout(12000);
  await select(page, 'T1');
  await actions(page).getByRole('button', { name: 'Observar el tubo' }).click();
  await actions(page).getByRole('button', { name: 'Altura del ojo' }).click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test-results/p9-tube-white.png' });
  const w = await world(page);
  const obs = w.readingOrder.map((id: string) => w.readings[id]).filter((r: AnyState) => r.kind === 'observation');
  expect(obs.at(-1).category.split('|')[0]).toBe('white');
  await page.getByRole('button', { name: /^D · Separación/ }).click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test-results/p9-stationD.png' });
});

test('teclado y rendimiento: estaciones con 1–6, vista a la altura del ojo y presupuesto de dibujo', async ({ page }) => {
  await startP9(page);
  await page.getByTestId('lab-canvas').focus();
  for (const k of ['2', '3', '4', '5', '6']) {
    await page.keyboard.press(k);
    await page.waitForTimeout(900);
    await page.screenshot({ path: `test-results/p9-station-key${k}.png` });
  }
  await page.keyboard.press('3');
  await page.waitForTimeout(1200);
  const stats = await page.evaluate(() => (window as AnyState).__p9.getState().stage.stats);
  console.log(`· P9 dibujo: ${stats.calls} llamadas, ${stats.triangles} triángulos, ${stats.fps} fps`);
  expect(stats.calls).toBeLessThanOrEqual(200);
  expect(stats.triangles).toBeLessThanOrEqual(500000);
});
