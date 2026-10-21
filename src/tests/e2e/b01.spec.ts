/**
 * Biología B01 — recorridos con la escena 3D real (Playwright). Usa `window.__b01` solo para LEER el estado y elegir el
 * objeto seleccionado; las acciones se hacen con el panel, el ratón y el teclado reales.
 */
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { openPanel } from './auth';

type AnyState = any;

const PPE = ['Bata', 'Calzado cerrado', 'Cabello recogido', 'Manos limpias'];
const world = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify((window as AnyState).__b01.getState().runtime.world)));
const select = (page: Page, id: string) => page.evaluate((id) => (window as AnyState).__b01.getState().select(id), id);
const actions = (page: Page) => page.getByRole('region', { name: 'Acciones' });
const act = (page: Page, name: string | RegExp) => actions(page).getByRole('button', { name, exact: typeof name === 'string' }).click();

async function openB01(page: Page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await openPanel(page);
  await page.getByRole('button', { name: /Entrar al laboratorio: Del preparado a la observación/ }).click();
  await page.waitForFunction(() => !!(window as AnyState).__b01);
}

async function startB01(page: Page, seed = 1101, mode = 'PRACTICE') {
  await openB01(page);
  await page.evaluate(([seed, mode]) => (window as AnyState).__b01.getState().setSettings({ quality: 'MEDIUM', seed, mode, timeScale: 3 }), [seed, mode] as const);
  await page.getByRole('button', { name: 'Comenzar intento' }).click();
  for (const name of PPE) await page.getByRole('button', { name, exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar y entrar al laboratorio' }).click();
  await page.waitForFunction(() => {
    const s = (window as AnyState).__b01.getState();
    return !!s.stage?.camera && s.stage.stats.calls > 0;
  }, undefined, { timeout: 60000 });
}

/** Nitidez que muestra el panel docente (modo Docente). */
async function sharpness(page: Page) {
  const txt = (await page.locator('.debug').textContent()) ?? '';
  return Number(/nitidez ([0-9.]+)/.exec(txt)?.[1] ?? 0);
}

/** Micrométrico hacia el máximo de nitidez, como quien mira: prueba un sentido y, si empeora, el otro. */
async function fineFocus(page: Page) {
  const up = actions(page).getByRole('button', { name: 'Micrométrico ▲' });
  const down = actions(page).getByRole('button', { name: 'Micrométrico ▼' });
  let best = await sharpness(page);
  for (const [b, back] of [[up, down], [down, up]] as const) {
    for (let i = 0; i < 30; i++) {
      await b.press('Enter');
      const s = await sharpness(page);
      if (s + 1e-6 < best) {
        await back.press('Enter');
        break;
      }
      best = s;
    }
  }
  return best;
}

/** Montaje húmedo desde el panel accesible (mismos comandos que los gestos). */
async function wetMountByPanel(page: Page) {
  await page.getByRole('button', { name: /^B · Montaje/ }).click();
  await select(page, 'sl1');
  await act(page, 'Al área de montaje');
  await select(page, 'fc');
  await act(page, 'Tomar una hoja de Elodea');
  await act(page, 'Dejar en el portaobjetos');
  await act(page, 'Limpiar la pinza');
  await select(page, 'dw');
  await act(page, /Apretar el gotero/);
  await select(page, 'fc');
  await act(page, 'Tomar un cubreobjetos');
  await act(page, 'Bajar lento');
}

test('el panel abre B01 (Biología); EPP sin guantes obligatorios y laboratorio sin violaciones graves de accesibilidad', async ({ page }) => {
  await openB01(page);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Del preparado a la observación');
  let results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([]);
  await page.getByRole('button', { name: 'Comenzar intento' }).click();
  for (const name of PPE.slice(0, 3)) await page.getByRole('button', { name, exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar y entrar al laboratorio' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'No puedes empezar' })).toBeVisible();
  await page.getByRole('button', { name: 'Manos limpias', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar y entrar al laboratorio' }).click();
  await page.waitForFunction(() => (window as AnyState).__b01.getState().stage?.stats.calls > 0, undefined, { timeout: 60000 });
  const w = await world(page);
  expect(w.ppe).toBe(true);
  expect(w.safety.ppe.gloves).toBe(false);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'test-results/b01-bench.png' });
  await page.evaluate(() => (window as AnyState).__b01.getState().toggleNotebook());
  results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).exclude('canvas').analyze();
  expect(results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([]);
});

test('montaje húmedo y microscopio desde el panel: pinza, enfoque mirando, registro válido a 4X y 10X', async ({ page }) => {
  await startB01(page, 1101, 'DEBUG');
  await wetMountByPanel(page);
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'test-results/b01-mount.png' });
  let w = await world(page);
  expect(w.mounts.sl1.coverId).toBe('cv1');
  expect(w.mounts.sl1.bubbleFraction).toBeLessThan(0.1);
  await page.getByRole('button', { name: /^C · Microscopio/ }).click();
  await select(page, 'sl1');
  await act(page, 'A la platina');
  await select(page, 'mic');
  await act(page, /Encender/);
  await act(page, 'Cerrar la pinza');
  await act(page, /Mirar de lado/);
  await act(page, /Mirar por el ocular/);
  const eye = page.getByRole('complementary', { name: 'Ocular del microscopio' });
  await expect(eye).toBeVisible();
  // Macrométrico hasta ver nítido (lo que se ve por el ocular), luego micrométrico.
  await select(page, 'mic');
  const coarseUp = actions(page).getByRole('button', { name: 'Macrométrico ▲' });
  for (let i = 0; i < 80 && (await sharpness(page)) < 0.25; i++) await coarseUp.press('Enter');
  await fineFocus(page);
  await expect(eye.locator('.eyepiece-status')).toContainText(/enfoque nítido|casi enfocado/);
  await page.waitForTimeout(1800);
  await page.screenshot({ path: 'test-results/b01-eyepiece-4x.png' });
  await eye.getByRole('button', { name: /Registrar/ }).click();
  await act(page, 'Revólver ▶');
  expect(await fineFocus(page)).toBeGreaterThan(0.6);
  await page.waitForTimeout(1800);
  await page.screenshot({ path: 'test-results/b01-eyepiece-10x.png' });
  await eye.getByRole('button', { name: /Registrar/ }).click();
  w = await world(page);
  const obs = w.observationOrder.map((id: string) => w.observations[id]);
  expect(obs.length).toBe(2);
  expect(obs[0].objectiveX).toBe(4);
  expect(obs[0].isObservationValid).toBe(true);
  expect(obs[1].objectiveX).toBe(10);
  expect(Object.keys(w.evidence).filter((k) => k.startsWith('err:'))).toEqual([]);
});

test('teclado: mando del revólver con clic y Q/E, vista lateral con L y estereoscopio con la hoja', async ({ page }) => {
  await startB01(page);
  await page.getByTestId('lab-canvas').focus();
  await page.keyboard.press('3');
  await page.waitForTimeout(900);
  await page.screenshot({ path: 'test-results/b01-stationC.png' });
  await page.evaluate(() => { (window as AnyState).__b01.getState().stage.controller.knob = 'mic:turret'; });
  await page.keyboard.press('e');
  let w = await world(page);
  expect(w.microscope.turretDeg).toBe(120);
  await page.keyboard.press('q');
  w = await world(page);
  expect(w.microscope.turretDeg).toBe(0);
  await page.keyboard.press('l');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'test-results/b01-side.png' });
  w = await world(page);
  expect(w.microscope.sideCheckedAt).not.toBeNull();
  await page.getByRole('button', { name: /^E · Estereoscopio/ }).click();
  await select(page, 'ste');
  await act(page, /Encender/);
  await select(page, 'fc');
  await act(page, 'Tomar: Hoja vegetal');
  await act(page, 'A la base del estereoscopio');
  await select(page, 'ste');
  await act(page, /Mirar por el ocular/);
  await page.waitForTimeout(1800);
  await page.screenshot({ path: 'test-results/b01-stereo.png' });
  const eye = page.getByRole('complementary', { name: 'Oculares del estereoscopio' });
  await eye.getByRole('button', { name: /Registrar/ }).click();
  w = await world(page);
  const o = w.observations[w.observationOrder.at(-1)];
  expect(o.instrument).toBe('stereo');
  expect(o.isObservationValid).toBe(true);
  expect(o.channel).toBe('mono');
});

test('rendimiento: estaciones 1–6 dentro del presupuesto de dibujo', async ({ page }) => {
  await startB01(page);
  await page.getByTestId('lab-canvas').focus();
  for (const k of ['2', '3', '4', '5', '6']) {
    await page.keyboard.press(k);
    await page.waitForTimeout(900);
    await page.screenshot({ path: `test-results/b01-station-key${k}.png` });
  }
  await page.keyboard.press('3');
  await page.waitForTimeout(1200);
  const stats = await page.evaluate(() => (window as AnyState).__b01.getState().stage.stats);
  console.log(`· B01 dibujo: ${stats.calls} llamadas, ${stats.triangles} triángulos, ${stats.fps} fps`);
  expect(stats.calls).toBeLessThanOrEqual(200);
  expect(stats.triangles).toBeLessThanOrEqual(500000);
});
