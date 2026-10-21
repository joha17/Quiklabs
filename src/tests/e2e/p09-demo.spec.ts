/**
 * Práctica 9 — demostración automática (§15): se reproduce completa en el navegador con los gestos reales (asa, pipeta,
 * goteros, balanza, centrífuga, decantación, campana y llama virtual), sin errores de técnica ni alertas, y deja los dos
 * precipitados separados y el K⁺ confirmado en el sobrenadante final.
 */
import { expect, test } from '@playwright/test';
import { openPanel } from './auth';

type AnyState = any;

test('la demostración de la Práctica 9 se reproduce completa, sin errores, con Sr y Fe separados y el K confirmado', async ({ page }) => {
  test.setTimeout(20 * 60_000);
  const errors: string[] = [];
  const fallbacks: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    const txt = m.text();
    if (txt.includes('[demo p9]')) fallbacks.push(txt);
    if (m.type() === 'error') errors.push(txt);
  });
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await openPanel(page);
  await page.getByRole('button', { name: /Entrar al laboratorio: Identificación de cationes/ }).click();
  await page.waitForFunction(() => !!(window as AnyState).__p9);
  await page.evaluate(() => (window as AnyState).__p9.getState().setSettings({ quality: 'MEDIUM' }));
  await page.getByRole('button', { name: /Ver demostración/ }).click();
  await expect(page.locator('.demo-panel')).toBeVisible();
  await page.waitForFunction(() => (window as AnyState).__p9.getState().demo?.index >= 0, undefined, { timeout: 60_000 });
  await page.locator('.demo-panel select').selectOption('4');
  const seen = new Set<string>();
  const t0 = Date.now();
  while (Date.now() - t0 < 18 * 60_000) {
    const d = await page.evaluate(() => (window as AnyState).__p9.getState().demo);
    if (d?.key && !seen.has(d.key)) {
      seen.add(d.key);
      console.log(`· paso ${d.index + 1}/${d.total}: ${d.key}`);
      await page.screenshot({ path: `test-results/p9-demo-${String(d.index + 1).padStart(2, '0')}-${d.key}.png` });
    }
    if (d?.done) break;
    await page.waitForTimeout(1000);
  }
  await expect(page.getByRole('heading', { name: /Demostración terminada/ })).toBeVisible();
  const w = await page.evaluate(() => JSON.parse(JSON.stringify((window as AnyState).__p9.getState().runtime.world)));
  console.log(`· tiempo de práctica ${(w.timeS / 60).toFixed(1)} min · respaldos: ${fallbacks.length}`);
  for (const f of fallbacks) console.log(`  ${f}`);
  expect(errors).toEqual([]);
  expect(fallbacks).toEqual([]);
  const errs = Object.keys(w.evidence).filter((k) => k.startsWith('err:'));
  console.log(`· errores de técnica: ${errs.join(', ') || 'ninguno'}`);
  expect(errs).toEqual([]);
  expect(w.vessels.T1.solid['SrSO4(s)'] ?? 0).toBeGreaterThan(0);
  expect(w.vessels.T2.solid['FeOH3(s)'] ?? 0).toBeGreaterThan(0);
  const spec = w.readingOrder.map((id: string) => w.readings[id]).filter((x: AnyState) => x.kind === 'spectrum' && x.snapshot.source === 'T3');
  expect(spec.length).toBeGreaterThan(0);
  expect(spec.at(-1).lines.some((l: AnyState) => Math.abs(l.nm - 766.5) < 1 && l.intensity > 0.02)).toBe(true);
  expect(w.flame.ignited).toBe(false);
  const bad = w.events.filter((e: AnyState) => e.severity === 'CRITICAL' || e.severity === 'ALERT').map((e: AnyState) => e.code);
  expect(bad, 'sin alertas de seguridad durante la demostración').toEqual([]);
});
