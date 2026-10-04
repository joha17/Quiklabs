/**
 * Práctica 3 — demostración automática: se reproduce completa (a velocidad ×4) y debe terminar con la práctica
 * hecha correctamente, sin respaldos (todas las mecánicas respondieron) y en estado seguro.
 */
import { expect, test } from '@playwright/test';

type AnyState = any;

test('la demostración de la Práctica 3 se reproduce completa y deja la práctica bien hecha', async ({ page }) => {
  test.setTimeout(20 * 60_000);
  const errors: string[] = [];
  const fallbacks: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    const txt = m.text();
    if (txt.includes('[demo p3]')) fallbacks.push(txt);
    if (m.type() === 'error') errors.push(txt);
  });
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: /Entrar al laboratorio: Mechero/ }).click();
  await page.waitForFunction(() => !!(window as AnyState).__p3);
  await page.evaluate(() => (window as AnyState).__p3.getState().setSettings({ quality: 'MEDIUM' }));
  await page.getByRole('button', { name: /Ver demostración/ }).click();
  await expect(page.locator('.demo-panel')).toBeVisible();
  await page.waitForFunction(() => (window as AnyState).__p3.getState().demo?.index >= 0, undefined, { timeout: 60_000 });
  // El usuario no puede manipular objetos durante la demostración.
  expect(await page.evaluate(() => (window as AnyState).__p3.getState().stage.locked)).toBe(true);
  await page.locator('.demo-panel select').selectOption('4');
  const seen = new Set<string>();
  const t0 = Date.now();
  while (Date.now() - t0 < 18 * 60_000) {
    const d = await page.evaluate(() => (window as AnyState).__p3.getState().demo);
    if (d?.key && !seen.has(d.key)) {
      seen.add(d.key);
      console.log(`· paso ${d.index + 1}/${d.total}: ${d.key}`);
      await page.screenshot({ path: `test-results/p3-demo-${String(d.index + 1).padStart(2, '0')}-${d.key}.png` });
    }
    if (d?.done) break;
    await page.waitForTimeout(1000);
  }
  await expect(page.getByRole('heading', { name: /Demostración terminada/ })).toBeVisible();
  const w = await page.evaluate(() => JSON.parse(JSON.stringify((window as AnyState).__p3.getState().runtime.world)));
  const nb = await page.evaluate(() => (window as AnyState).__p3.getState().notebook);
  console.log(`· tiempo de práctica ${(w.timeS / 60).toFixed(1)} min · respaldos: ${fallbacks.length}`);
  for (const f of fallbacks) console.log(`  ${f}`);
  expect(errors).toEqual([]);
  expect(fallbacks).toEqual([]);
  // Resultado de la práctica hecha por la demostración.
  expect(Object.keys(w.parts.answers).length).toBe(9);
  expect(w.evidence.firstIgnitionOrderOk).toBe(1);
  expect(w.capsule.exposures.length).toBeGreaterThanOrEqual(2);
  for (const id of ['sol_nacl', 'sol_kcl', 'sol_cacl2', 'sol_cucl2', 'sol_licl', 'sol_bacl2', 'sol_mix', 'sol_unknown']) {
    expect(w.observations[id].noFilter, `${id} sin filtro`).toBeTruthy();
    expect(w.observations[id].filter, `${id} con filtro`).toBeTruthy();
  }
  expect(w.observations.sol_mix.noFilter.region).toMatch(/amarillo/);
  expect(['violeta', 'lila']).toContain(w.observations.sol_mix.filter.region);
  expect(nb.unknown.identity).toBe(w.unknown.cation);
  expect(w.burner.flameState).toBe('OFF');
  expect(w.burner.tableGasValve).toBe(0);
  const bad = w.events.filter((e: AnyState) => e.severity === 'CRITICAL' || e.severity === 'ALERT').map((e: AnyState) => e.code);
  expect(bad, 'sin alertas de seguridad durante la demostración').toEqual([]);
  const warns = w.events.filter((e: AnyState) => e.severity === 'WARN').map((e: AnyState) => e.code);
  console.log(`· avisos: ${warns.join(', ') || 'ninguno'}`);
  expect(warns).toEqual([]);
});
