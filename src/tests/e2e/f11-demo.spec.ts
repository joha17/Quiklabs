/**
 * F11 — demostración automática: se reproduce completa en el navegador con los gestos reales, sin errores,
 * y deja el puesto cerrado.
 */
import { expect, test } from '@playwright/test';
import { openPanel } from './auth';

type AnyState = any;

test('la demostración de F11 se reproduce completa y deja el puesto cerrado', async ({ page }) => {
  test.setTimeout(20 * 60_000);
  const errors: string[] = [];
  const fallbacks: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    const txt = m.text();
    if (txt.includes('[demo f11]')) fallbacks.push(txt);
    if (m.type() === 'error') errors.push(txt);
  });
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await openPanel(page);
  await page.getByRole('button', { name: /Entrar al laboratorio: Hidrostática, densidad y flotación/ }).click();
  await page.waitForFunction(() => !!(window as AnyState).__f11);
  await page.evaluate(() => (window as AnyState).__f11.getState().setSettings({ quality: 'MEDIUM' }));
  await page.getByRole('button', { name: /Ver demostración/ }).click();
  await expect(page.locator('.demo-panel')).toBeVisible();
  await page.waitForFunction(() => (window as AnyState).__f11.getState().demo?.index >= 0, undefined, { timeout: 60_000 });
  await page.locator('.demo-panel select').selectOption('4');
  const seen = new Set<string>();
  const t0 = Date.now();
  while (Date.now() - t0 < 18 * 60_000) {
    const d = await page.evaluate(() => (window as AnyState).__f11.getState().demo);
    if (d?.key && !seen.has(d.key)) {
      seen.add(d.key);
      console.log(`· paso ${d.index + 1}/${d.total}: ${d.key}`);
      await page.screenshot({ path: `test-results/f11-demo-${String(d.index + 1).padStart(2, '0')}-${d.key}.png` });
    }
    if (d?.done) break;
    await page.waitForTimeout(1000);
  }
  await expect(page.getByRole('heading', { name: /Demostración terminada/ })).toBeVisible();
  const w = await page.evaluate(() => JSON.parse(JSON.stringify((window as AnyState).__f11.getState().runtime.world)));
  console.log(`· tiempo de práctica ${(w.timeS / 60).toFixed(1)} min · respaldos: ${fallbacks.length}`);
  for (const f of fallbacks) console.log(`  ${f}`);
  expect(errors).toEqual([]);
  expect(fallbacks).toEqual([]);
  const errs = Object.keys(w.evidence).filter((k) => k.startsWith('err:'));
  console.log(`· errores de técnica: ${errs.join(', ') || 'ninguno'}`);
  expect(errs).toEqual([]);
  const readings = Object.values(w.readings) as AnyState[];
  const count = (k: string) => readings.filter((r) => r.kind === k).length;
  console.log(`· lecturas: ${['pressure', 'ruler', 'level', 'mass', 'volume', 'weight', 'immersion', 'draft'].map((k) => `${k} ${count(k)}`).join(' · ')}`);
  expect(count('pressure')).toBeGreaterThanOrEqual(10);
  expect(count('ruler')).toBeGreaterThanOrEqual(10);
  expect(count('level')).toBeGreaterThanOrEqual(2);
  expect(count('mass')).toBeGreaterThanOrEqual(3);
  expect(count('volume')).toBeGreaterThanOrEqual(1);
  expect(count('weight')).toBeGreaterThanOrEqual(5);
  expect(count('immersion')).toBeGreaterThanOrEqual(4);
  expect(count('draft')).toBeGreaterThanOrEqual(3);
  // Informativas a propósito: el cero de la sonda se toma en el aire y el lastre pesado hunde la botella.
  const INFO = new Set(['IN_AIR', 'SUBMERGED', 'SANK']);
  const flagged = readings.filter((r) => r.valid === false || r.qualityFlags.some((f: string) => !INFO.has(f)));
  expect(flagged.map((r) => `${r.id}:${r.qualityFlags.join('+')}`), 'lecturas válidas y sin banderas').toEqual([]);
  expect(w.evidence.stationClosed).toBeTruthy();
  const bad = w.events.filter((e: AnyState) => e.severity === 'CRITICAL' || e.severity === 'ALERT').map((e: AnyState) => e.code);
  expect(bad, 'sin alertas de seguridad durante la demostración').toEqual([]);
});
