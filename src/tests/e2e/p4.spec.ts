/**
 * Práctica 4 — recorridos con la escena 3D real (Playwright). Usa `window.__p4` solo para LEER el estado y proyectar
 * puntos con la cámara; las manipulaciones se hacen con el ratón y el teclado reales.
 */
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { openPanel } from './auth';

type Pt = { x: number; y: number };
type AnyState = any;

const PPE = ['Bata abotonada y mangas ajustadas', 'Gafas de seguridad', 'Cabello recogido, sin ropa suelta', 'Calzado cerrado'];

const world = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify((window as AnyState).__p4.getState().runtime.world)));
const ml = (v: AnyState) => (v.bulk.volL + v.plume.volL) * 1000;

async function startP4(page: Page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await openPanel(page);
  await page.getByRole('button', { name: /Entrar al laboratorio: Reacciones químicas/ }).click();
  await page.waitForFunction(() => !!(window as AnyState).__p4);
  await page.evaluate(() => (window as AnyState).__p4.getState().setSettings({ quality: 'MEDIUM', seed: 4343, mode: 'PRACTICE' }));
  await page.getByRole('button', { name: 'Comenzar intento' }).click();
  for (const name of PPE) await page.getByRole('button', { name, exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar y entrar al laboratorio' }).click();
  await page.waitForFunction(() => {
    const s = (window as AnyState).__p4.getState();
    return !!s.stage?.camera && s.stage.stats.calls > 0;
  }, undefined, { timeout: 60000 });
}

async function settle(page: Page) {
  await page.evaluate(() => (window as AnyState).__p4.getState().stage.camera.settle());
  await page.waitForTimeout(300);
}

async function pickPoint(page: Page, id: string): Promise<Pt> {
  const p = await page.evaluate((id) => {
    const s = (window as AnyState).__p4.getState();
    const w = s.runtime.world;
    const o = w.objects[id] ?? w.gas.objects[id];
    const r = document.querySelector('.canvas-host canvas')!.getBoundingClientRect();
    for (const dz of [3, 1, 5, 7, 0, 9, 11, 2]) {
      for (const dx of [0, -0.5, 0.5, -1, 1]) {
        for (const dy of [0, -1, 1]) {
          const a = s.stage.camera.screenOf(o.pose.x + dx, o.pose.y + dy, o.pose.z + dz);
          const h = s.stage.controller.view.pick(a.x, a.y, null);
          if (h?.id === id) return { x: a.x + r.left, y: a.y + r.top };
        }
      }
    }
    return null;
  }, id);
  expect(p, `sin punto visible para ${id}`).not.toBeNull();
  return p!;
}

/** Mueve el objeto tomado para que quede en (x, y) de la mesada. */
async function carryTo(page: Page, x: number, y: number) {
  const p = await page.evaluate(([x, y]) => {
    const s = (window as AnyState).__p4.getState();
    const h = s.stage.controller.held;
    const a = s.stage.camera.screenOf(x - (h?.ox ?? 0), y - (h?.oy ?? 0), h?.z ?? 0);
    const r = document.querySelector('.canvas-host canvas')!.getBoundingClientRect();
    return { x: a.x + r.left, y: a.y + r.top };
  }, [x, y] as const);
  await page.mouse.move(p.x, p.y, { steps: 20 });
  await page.waitForTimeout(700);
}

test('el menú abre la Práctica 4; portada y laboratorio sin violaciones graves de accesibilidad', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await openPanel(page);
  await page.getByRole('button', { name: /Entrar al laboratorio: Reacciones químicas/ }).click();
  await expect(page.getByRole('heading', { name: 'Reacciones químicas', level: 1 })).toBeVisible();
  let results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([]);
  await page.getByRole('button', { name: 'Comenzar intento' }).click();
  // Sin el EPP completo no se entra.
  await expect(page.getByRole('button', { name: 'Confirmar y entrar al laboratorio' })).toBeDisabled();
  for (const name of PPE) await page.getByRole('button', { name, exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar y entrar al laboratorio' }).click();
  await page.waitForFunction(() => (window as AnyState).__p4.getState().stage?.stats.calls > 0, undefined, { timeout: 60000 });
  expect((await world(page)).ppe).toBe(true);
  results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).exclude('canvas').analyze();
  expect(results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([]);
});

test('vertido con el ratón: frasco de HCl acoplado a la probeta y de la probeta al beaker', async ({ page }) => {
  await startP4(page);
  await page.locator('.station-btn', { hasText: /^A$/ }).click();
  await settle(page);
  let p = await pickPoint(page, 'bottle_hcl');
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.waitForTimeout(400);
  let w = await world(page);
  await carryTo(page, w.objects.cyl10.pose.x - 3, w.objects.cyl10.pose.y);
  const dock = await page.evaluate(() => (window as AnyState).__p4.getState().stage.controller.pourDock);
  expect(dock?.targetId).toBe('cyl10');
  // Mantener el botón derecho inclina el frasco; soltarlo lo endereza.
  await page.mouse.down({ button: 'right' });
  for (let i = 0; i < 80; i++) {
    await page.waitForTimeout(100);
    if (ml((await world(page)).vessels.cyl10) > 4.5) break;
  }
  await page.mouse.up({ button: 'right' });
  await page.waitForTimeout(1500);
  await page.mouse.up();
  await page.waitForTimeout(800);
  w = await world(page);
  expect(ml(w.vessels.cyl10)).toBeGreaterThan(3);
  expect(w.spills.length).toBe(0);
  expect(Math.abs(w.objects.bottle_hcl.pose.rotationRad)).toBeLessThan(0.1);
  const inCyl = ml(w.vessels.cyl10);
  p = await pickPoint(page, 'cyl10');
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.waitForTimeout(300);
  await carryTo(page, w.objects.beaker.pose.x - 4, w.objects.beaker.pose.y);
  await page.mouse.down({ button: 'right' });
  await page.waitForTimeout(4500);
  await page.mouse.up({ button: 'right' });
  await page.waitForTimeout(1200);
  await page.mouse.up();
  await page.waitForTimeout(600);
  w = await world(page);
  // Lo vertido llega al beaker (menos la retención en las paredes de la probeta).
  expect(ml(w.vessels.beaker)).toBeGreaterThan(inCyl - 0.4);
  expect(w.vessels.beaker.bulk.mol['H+'] + (w.vessels.beaker.plume.mol['H+'] ?? 0)).toBeGreaterThan(0);
});

test('gotero de fenolftaleína: aspira en su frasco y gotea en el beaker con la tecla P', async ({ page }) => {
  await startP4(page);
  await page.locator('.station-btn', { hasText: /^A$/ }).click();
  await settle(page);
  const p = await pickPoint(page, 'dropper_pheno');
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.waitForTimeout(400);
  let w = await world(page);
  await carryTo(page, w.objects.pheno.pose.x, w.objects.pheno.pose.y);
  await page.keyboard.press('p');
  await page.waitForTimeout(400);
  w = await world(page);
  expect(ml(w.vessels.dropper_pheno)).toBeGreaterThan(0.3);
  await carryTo(page, w.objects.beaker.pose.x, w.objects.beaker.pose.y);
  await page.keyboard.press('p');
  await page.waitForTimeout(400);
  await page.keyboard.press('p');
  await page.waitForTimeout(400);
  w = await world(page);
  await carryTo(page, w.objects.pheno.pose.x, w.objects.pheno.pose.y);
  await page.mouse.up();
  await page.waitForTimeout(800);
  w = await world(page);
  const hin = (w.vessels.beaker.bulk.mol.HIn ?? 0) + (w.vessels.beaker.plume.mol.HIn ?? 0);
  expect(hin).toBeGreaterThan(0);
  expect(w.objects.dropper_pheno.support).toBe('cap:pheno');
});

test('la entrega se bloquea con el mechero encendido', async ({ page }) => {
  await startP4(page);
  await page.evaluate(() => {
    const s = (window as AnyState).__p4.getState();
    const g = (cmd: unknown) => s.dispatch({ type: 'gas', cmd });
    g({ type: 'setValve', valve: 'AIR', value: 0.6 });
    g({ type: 'setValve', valve: 'TABLE', value: 1 });
    g({ type: 'setValve', valve: 'NEEDLE', value: 0.45 });
  });
  await page.waitForFunction(() => (window as AnyState).__p4.getState().runtime.world.gas.burner.needleGasValve > 0.4);
  await page.getByRole('button', { name: /Entregar/ }).first().click();
  await expect(page.getByRole('alert').filter({ hasText: /No se puede entregar/ })).toBeVisible();
});
