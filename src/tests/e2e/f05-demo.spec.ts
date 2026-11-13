/**
 * F05 — demostración automática: se reproduce completa en el navegador con los gestos reales, sin errores,
 * y deja el puesto cerrado.
 */
import { expect, test } from '@playwright/test';
import { openPanel } from './auth';

type AnyState = any;

test('la demostración de F05 se reproduce completa y deja el puesto cerrado', async ({ page }) => {
  test.setTimeout(20 * 60_000);
  const errors: string[] = [];
  const fallbacks: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    const txt = m.text();
    if (txt.includes('[demo f05]')) fallbacks.push(txt);
    if (m.type() === 'error') errors.push(txt);
  });
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await openPanel(page);
  await page.getByRole('button', { name: /Entrar al laboratorio: Rozamiento y dinámica de planos inclinados/ }).click();
  await page.waitForFunction(() => !!(window as AnyState).__f05);
  await page.evaluate(() => (window as AnyState).__f05.getState().setSettings({ quality: 'MEDIUM' }));
  await page.getByRole('button', { name: /Ver demostración/ }).click();
  await expect(page.locator('.demo-panel')).toBeVisible();
  await page.waitForFunction(() => (window as AnyState).__f05.getState().demo?.index >= 0, undefined, { timeout: 60_000 });
  await page.locator('.demo-panel select').selectOption('4');
  const seen = new Set<string>();
  const t0 = Date.now();
  while (Date.now() - t0 < 18 * 60_000) {
    const d = await page.evaluate(() => (window as AnyState).__f05.getState().demo);
    if (d?.key && !seen.has(d.key)) {
      seen.add(d.key);
      console.log(`· paso ${d.index + 1}/${d.total}: ${d.key}`);
      await page.screenshot({ path: `test-results/f05-demo-${String(d.index + 1).padStart(2, '0')}-${d.key}.png` });
    }
    if (d?.done) break;
    await page.waitForTimeout(1000);
  }
  await expect(page.getByRole('heading', { name: /Demostración terminada/ })).toBeVisible();
  const w = await page.evaluate(() => JSON.parse(JSON.stringify((window as AnyState).__f05.getState().runtime.world)));
  console.log(`· tiempo de práctica ${(w.timeS / 60).toFixed(1)} min · respaldos: ${fallbacks.length}`);
  for (const f of fallbacks) console.log(`  ${f}`);
  expect(errors).toEqual([]);
  expect(fallbacks).toEqual([]);
  const errs = Object.keys(w.evidence).filter((k) => k.startsWith('err:'));
  console.log(`· errores de técnica: ${errs.join(', ') || 'ninguno'}`);
  expect(errs).toEqual([]);
  const readings = Object.values(w.readings) as AnyState[];
  expect(readings.filter((r) => r.kind === 'pull').length).toBe(8);
  expect(readings.filter((r) => r.kind === 'angle').length).toBe(3);
  expect(readings.filter((r) => r.kind === 'slide').length).toBe(1);
  expect(readings.filter((r) => r.kind === 'mass').length).toBe(2);
  // El pico se lee a propósito en la ventana previa al arranque: su única bandera es BEFORE_SLIP.
  const flagged = readings.filter((r) => r.valid === false || r.qualityFlags.some((f: string) => f !== 'BEFORE_SLIP'));
  expect(flagged.map((r) => `${r.id}:${r.qualityFlags.join('+')}`), 'lecturas válidas y sin banderas').toEqual([]);
  expect(w.evidence.stationClosed).toBeTruthy();
  const bad = w.events.filter((e: AnyState) => e.severity === 'CRITICAL' || e.severity === 'ALERT').map((e: AnyState) => e.code);
  expect(bad, 'sin alertas de seguridad durante la demostración').toEqual([]);
});
