/**
 * Biología B02 — recorridos con la escena 3D real (Playwright). Usa `window.__b02` solo para LEER el estado y elegir el
 * objeto seleccionado; las acciones se hacen con el panel accesible (mismos comandos que los gestos).
 */
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { openPanel } from './auth';

type AnyState = any;

const PPE = ['Bata', 'Calzado cerrado', 'Cabello recogido', 'Manos limpias'];
const world = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify((window as AnyState).__b02.getState().runtime.world)));
const select = (page: Page, id: string) => page.evaluate((id) => (window as AnyState).__b02.getState().select(id), id);
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

async function openB02(page: Page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await openPanel(page);
  await page.getByRole('button', { name: /Entrar al laboratorio: Células bajo la lente/ }).click();
  await page.waitForFunction(() => !!(window as AnyState).__b02);
}

async function startB02(page: Page, seed = 2202, mode = 'PRACTICE') {
  await openB02(page);
  await page.evaluate(([seed, mode]) => (window as AnyState).__b02.getState().setSettings({ quality: 'MEDIUM', seed, mode, timeScale: 3 }), [seed, mode] as const);
  await page.getByRole('button', { name: 'Comenzar intento' }).click();
  for (const name of PPE) await page.getByRole('button', { name, exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar y entrar al laboratorio' }).click();
  await page.waitForFunction(() => {
    const s = (window as AnyState).__b02.getState();
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


/** Lámina limpia al área de preparación vegetal. */
async function slideToPrep(page: Page, id: string) {
  await page.getByRole('button', { name: /^B · Preparación vegetal/ }).click();
  await select(page, id);
  await act(page, 'Al área de preparación vegetal');
}

/** Cubreobjetos con la pinza, bajado lento (inclinación por defecto). */
async function coverSlow(page: Page) {
  await select(page, 'fc');
  await act(page, 'Limpiar la pinza');
  await act(page, 'Tomar un cubreobjetos');
  await act(page, 'Bajar lento');
}

/** Lámina a la platina, 4X, enfoque mirando y registro. */
async function observe4x(page: Page, slide: string) {
  await page.getByRole('button', { name: /^C · Microscopio/ }).click();
  await select(page, slide);
  await act(page, 'A la platina');
  await select(page, 'mic');
  const w = await world(page);
  if (!w.microscope.power) await act(page, /Encender/);
  await act(page, 'Cerrar la pinza');
  await act(page, /Mirar de lado/);
  await act(page, /Mirar por el ocular/);
  const eye = page.getByRole('complementary', { name: 'Ocular del microscopio' });
  await expect(eye).toBeVisible();
  const coarseUp = actions(page).getByRole('button', { name: 'Macrométrico ▲' });
  for (let i = 0; i < 80 && (await sharpness(page)) < 0.25; i++) await coarseUp.press('Enter');
  await fineFocus(page);
  await page.waitForTimeout(1800);
  return eye;
}

test('el panel abre B02 (Biología); EPP y laboratorio sin violaciones graves de accesibilidad', async ({ page }) => {
  await openB02(page);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Células bajo la lente');
  let results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([]);
  await page.getByRole('button', { name: 'Comenzar intento' }).click();
  for (const name of PPE) await page.getByRole('button', { name, exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar y entrar al laboratorio' }).click();
  await page.waitForFunction(() => (window as AnyState).__b02.getState().stage?.stats.calls > 0, undefined, { timeout: 60000 });
  const w = await world(page);
  expect(w.ppe).toBe(true);
  expect(Object.keys(w.cell.sources)).toEqual(expect.arrayContaining(['pot', 'tom', 'el', 'bucc']));
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'test-results/b02-bench.png' });
  await page.getByRole('button', { name: /^B · Preparación vegetal/ }).click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'test-results/b02-station-B.png' });
  await page.getByRole('button', { name: /^D · Preparación animal/ }).click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'test-results/b02-station-D.png' });
  await page.evaluate(() => (window as AnyState).__b02.getState().toggleNotebook());
  results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).exclude('canvas').analyze();
  expect(results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([]);
});

test('papa con Lugol desde el panel: raspado, espátula limpia, gota, espera de contacto y registro válido a 4X', async ({ page }) => {
  await startB02(page, 2202, 'DEBUG');
  await slideToPrep(page, 'sl2');
  await select(page, 'sp');
  await act(page, 'Raspar Papa cruda');
  await act(page, 'Dejar en la lámina');
  await act(page, 'Limpiar con papel de lente');
  await select(page, 'iod');
  await act(page, /Apretar el gotero/);
  await coverSlow(page);
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'test-results/b02-potato-mount.png' });
  let w = await world(page);
  expect(w.mounts.sl2.cell.zones[0].kind).toBe('potato');
  expect(w.mounts.sl2.cell.stainMl.lugol).toBeGreaterThan(0);
  expect(w.cell.toolResidue.sp ?? null).toBeNull();
  // El Lugol necesita contacto: se espera (el tiempo del intento corre ×3).
  await page.waitForFunction(() => ((window as AnyState).__b02.getState().runtime.world.mounts.sl2.cell.contactS.lugol ?? 0) > 22, undefined, { timeout: 60000 });
  const eye = await observe4x(page, 'sl2');
  await page.screenshot({ path: 'test-results/b02-eyepiece-potato-4x.png' });
  await eye.getByRole('button', { name: /Registrar/ }).click();
  w = await world(page);
  const o = w.observations[w.observationOrder[0]];
  expect(o.isObservationValid).toBe(true);
  expect(o.assetId).toContain('potatoLugol');
  expect(Object.keys(w.evidence).filter((k) => k.startsWith('err:'))).toEqual([]);
});

test('frotis bucal desde el panel: hisopo, extendido, residuos biológicos, azul de metileno y cubreobjetos', async ({ page }) => {
  await startB02(page, 2202, 'PRACTICE');
  await page.getByRole('button', { name: /^D · Preparación animal/ }).click();
  await select(page, 'sl4');
  await act(page, 'Al área de preparación animal');
  await select(page, 'sw1');
  await act(page, 'Hisopar la fuente de epitelio');
  await act(page, 'Extender en la lámina');
  await act(page, 'A residuos biológicos');
  await select(page, 'mb');
  await act(page, /Apretar el gotero/);
  await coverSlow(page);
  const w = await world(page);
  expect(w.mounts.sl4.cell.zones[0].kind).toBe('buccal');
  expect(w.mounts.sl4.cell.stainMl['methylene-blue']).toBeGreaterThan(0);
  expect(w.objects.sw1.support).toBe('bioWaste');
  expect(Object.keys(w.evidence).filter((k) => k.startsWith('err:'))).toEqual([]);
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'test-results/b02-buccal-mount.png' });
});
