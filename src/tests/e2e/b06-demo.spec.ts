/**
 * Biología B06 — demostración automática (§16): se reproduce completa en el navegador con los gestos reales (pinza sobre
 * la maceta, goteros de cultivo, metilcelulosa, hisopado, cubreobjetos, láminas permanentes de la caja, mandos, ocular,
 * marcas y medición), con un único error deliberado (CEL-016) y su recuperación, y el puesto cerrado.
 */
import { expect, test } from '@playwright/test';
import { openPanel } from './auth';

type AnyState = any;

test('la demostración de B06 se reproduce completa con un error deliberado y su recuperación, y deja el puesto cerrado', async ({ page }) => {
  test.setTimeout(20 * 60_000);
  const errors: string[] = [];
  const fallbacks: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    const txt = m.text();
    if (txt.includes('[demo b06]')) fallbacks.push(txt);
    if (m.type() === 'error') errors.push(txt);
  });
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await openPanel(page);
  await page.getByRole('button', { name: /Entrar al laboratorio: Atlas celular comparado/ }).click();
  await page.waitForFunction(() => !!(window as AnyState).__b06);
  await page.evaluate(() => (window as AnyState).__b06.getState().setSettings({ quality: 'MEDIUM' }));
  await page.getByRole('button', { name: /Ver demostración/ }).click();
  await expect(page.locator('.demo-panel')).toBeVisible();
  await page.waitForFunction(() => (window as AnyState).__b06.getState().demo?.index >= 0, undefined, { timeout: 60_000 });
  await page.locator('.demo-panel select').selectOption('4');
  const seen = new Set<string>();
  const t0 = Date.now();
  while (Date.now() - t0 < 18 * 60_000) {
    const d = await page.evaluate(() => (window as AnyState).__b06.getState().demo);
    if (d?.key && !seen.has(d.key)) {
      seen.add(d.key);
      console.log(`· paso ${d.index + 1}/${d.total}: ${d.key}`);
      await page.screenshot({ path: `test-results/b06-demo-${String(d.index + 1).padStart(2, '0')}-${d.key}.png` });
    }
    if (d?.done) break;
    await page.waitForTimeout(1000);
  }
  await expect(page.getByRole('heading', { name: /Demostración terminada/ })).toBeVisible();
  const w = await page.evaluate(() => JSON.parse(JSON.stringify((window as AnyState).__b06.getState().runtime.world)));
  console.log(`· tiempo de práctica ${(w.timeS / 60).toFixed(1)} min · respaldos: ${fallbacks.length}`);
  for (const f of fallbacks) console.log(`  ${f}`);
  expect(errors).toEqual([]);
  expect(fallbacks).toEqual([]);
  const errs = Object.keys(w.evidence).filter((k) => k.startsWith('err:'));
  console.log(`· errores de técnica: ${errs.join(', ') || 'ninguno'}`);
  expect(errs).toEqual(['err:CEL-016']);
  const obs = w.observationOrder.map((id: string) => w.observations[id]);
  expect(obs.filter((o: AnyState) => o.isObservationValid && o.instrument === 'compound').length).toBeGreaterThanOrEqual(9);
  expect(w.div.marks.map((m: AnyState) => m.verdict)).toEqual(['valid', 'valid', 'valid', 'valid']);
  expect(w.div.measurements.length).toBe(1);
  expect(w.evidence.benchRestored).toBeTruthy();
  const bad = w.events.filter((e: AnyState) => e.severity === 'CRITICAL' || e.severity === 'ALERT').map((e: AnyState) => e.code);
  expect(bad, 'sin alertas de seguridad durante la demostración').toEqual([]);
});
