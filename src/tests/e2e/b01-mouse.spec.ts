/**
 * Biología B01 — operación de los instrumentos SOLO con el ratón sobre las piezas 3D (§17.2–8, §17.16): clic sostenido
 * y arrastre real (`page.mouse`) sobre la perilla, la palanca, el revólver, los mandos X/Y, los oculares… sin abrir el
 * panel de acciones. `window.__b01` se usa únicamente para LEER el estado y la posición en pantalla de cada pieza.
 */
import { expect, test, type Page } from '@playwright/test';
import { openPanel } from './auth';

type AnyState = any;
const PPE = ['Bata', 'Calzado cerrado', 'Cabello recogido', 'Manos limpias'];

const mic = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify((window as AnyState).__b01.getState().runtime.world.microscope)));
const ste = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify((window as AnyState).__b01.getState().runtime.world.stereo)));
const world = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify((window as AnyState).__b01.getState().runtime.world)));

async function startB01(page: Page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await openPanel(page);
  await page.getByRole('button', { name: /Entrar al laboratorio: Del preparado a la observación/ }).click();
  await page.waitForFunction(() => !!(window as AnyState).__b01);
  await page.evaluate(() => (window as AnyState).__b01.getState().setSettings({ quality: 'MEDIUM', seed: 1101, mode: 'PRACTICE', timeScale: 1 }));
  await page.getByRole('button', { name: 'Comenzar intento' }).click();
  for (const name of PPE) await page.getByRole('button', { name, exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar y entrar al laboratorio' }).click();
  await page.waitForFunction(() => (window as AnyState).__b01.getState().stage?.stats.calls > 0, undefined, { timeout: 60000 });
}

/** Lleva la cámara frente a la pieza (azimut y elevación de la vista) y devuelve su punto en pantalla. */
async function aim(page: Page, id: string, part: string, az = 0, elev = 0.3, dist = 32, off: [number, number, number] = [0, 0, 0]) {
  const at = await page.evaluate(([id, part, az, elev, dist, off]) => {
    const st = (window as AnyState).__b01.getState().stage;
    const c = st.controller.view.partAnchor(id, part);
    // `off` (cm): un punto del borde de la pieza (el centro de un mando coaxial lo tapa el otro mando).
    const a = { x: c.x + off[0], y: c.y + off[1], z: c.z + off[2] };
    st.camera.lookAt(a.x, a.y, a.z, dist, elev);
    st.camera.settle();
    if (az) {
      st.camera.orbit(az, 0);
      st.camera.settle();
    }
    return a;
  }, [id, part, az, elev, dist, off] as const);
  await page.waitForTimeout(250);
  const box = (await page.getByTestId('lab-canvas').locator('canvas').boundingBox())!;
  const s = await page.evaluate(([x, y, z]) => (window as AnyState).__b01.getState().stage.camera.screenOf(x, y, z), [at.x, at.y, at.z] as const);
  return { x: box.x + s.x, y: box.y + s.y };
}

/** Pieza bajo el puntero (lo que el estudiante ve en el rótulo). */
const hovered = (page: Page) => page.evaluate(() => {
  const c = (window as AnyState).__b01.getState().stage.controller;
  return c.hoverPart ? `${c.hoverPart.id}:${c.hoverPart.part}` : null;
});

/** Clic sostenido sobre la pieza, arrastre en `n` pasos de (dx, dy) px y soltar. */
async function drag(page: Page, p: { x: number; y: number }, dx: number, dy: number, n = 12, until?: () => Promise<boolean>) {
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  for (let i = 1; i <= n; i++) {
    await page.mouse.move(p.x + dx * i, p.y + dy * i);
    if (until && (await until())) break;
  }
  await page.mouse.up();
  await page.waitForTimeout(120);
}

async function expectPart(page: Page, p: { x: number; y: number }, name: string) {
  await page.mouse.move(p.x, p.y);
  await expect.poll(() => hovered(page)).toBe(name);
  await expect(page.locator('.part-tip')).toBeVisible();
}

test('microscopio solo con el ratón: interruptor, rueda de luz, revólver con enclavamiento, macro, micro, X/Y, pinza, iris, condensador, oculares y dioptrías', async ({ page }) => {
  test.setTimeout(180000);
  await startB01(page);
  const actionsBefore = await page.evaluate(() => (window as AnyState).__b01.getState().runtime.actions.length);

  // Interruptor: un clic.
  let p = await aim(page, 'mic', 'power', -1.2, 0.25);
  await expectPart(page, p, 'mic:power');
  await page.mouse.click(p.x, p.y);
  expect((await mic(page)).power).toBe(true);

  // Rueda de intensidad: arrastre sobre la propia rueda.
  p = await aim(page, 'mic', 'light', 1.2, 0.25);
  await expectPart(page, p, 'mic:light');
  const l0 = (await mic(page)).light01;
  await drag(page, p, 0, -12);
  expect(Math.abs((await mic(page)).light01 - l0)).toBeGreaterThan(0.05);

  // Revólver: se gira tomando el anillo; entre posiciones no hay objetivo y al soltar cerca de una, encaja.
  p = await aim(page, 'mic', 'turret', 0.6, 0.35);
  await expectPart(page, p, 'mic:turret');
  await drag(page, p, -4, 0, 12);
  let m = await mic(page);
  const between = m.turretDeg % 120 > 14 && m.turretDeg % 120 < 106;
  if (between) expect((await world(page)).evidence['err:E71']).toBe(1);
  await drag(page, p, -3, 0, 120, async () => {
    const a = (await mic(page)).turretDeg;
    return Math.abs(a - 120) < 8 || Math.abs(a - 240) < 8;
  });
  m = await mic(page);
  expect([120, 240]).toContain(m.turretDeg);
  // De vuelta al 4X por el otro lado del anillo.
  await drag(page, p, 3, 0, 200, async () => {
    const a = (await mic(page)).turretDeg;
    return a < 8 || a > 352;
  });
  expect((await mic(page)).turretDeg).toBe(0);

  // Macro y micro: cada uno sobre su rueda; la platina sube o baja con el mando.
  p = await aim(page, 'mic', 'coarse', 1.3, 0.2, 40, [0, 0, 1.9]);
  await expectPart(page, p, 'mic:coarse');
  const c0 = (await mic(page)).coarseTurns;
  await drag(page, p, 10, 0);
  expect(Math.abs((await mic(page)).coarseTurns - c0)).toBeGreaterThan(0.05);
  p = await aim(page, 'mic', 'fine', 1.3, 0.2, 32);
  await expectPart(page, p, 'mic:fine');
  const f0 = (await mic(page)).fineTurns;
  await drag(page, p, 0, 8);
  expect(Math.abs((await mic(page)).fineTurns - f0)).toBeGreaterThan(0.02);

  // Mandos coaxiales X/Y bajo la platina.
  for (const [part, key] of [['stageX', 'stageXmm'], ['stageY', 'stageYmm']] as const) {
    p = await aim(page, 'mic', part, 0.8, 0.1, 28);
    await expectPart(page, p, `mic:${part}`);
    const v0 = (await mic(page))[key];
    await drag(page, p, 8, 0);
    expect(Math.abs((await mic(page))[key] - v0), part).toBeGreaterThan(0.2);
  }

  // Pinza: se empuja el brazo de la palanca (abierta, apunta hacia el alumno); soltada casi cerrada, el resorte la cierra.
  p = await aim(page, 'mic', 'clip', -0.3, 0.75, 30, [1.4, -1.8, 0.2]);
  await expectPart(page, p, 'mic:clip');
  expect((await mic(page)).clipOpen).toBe(true);
  await drag(page, p, 0, -6, 12);
  expect((await mic(page)).clipOpen).toBe(false);
  p = await aim(page, 'mic', 'clip', -0.3, 0.75, 30, [2.3, 0, 0.2]);
  await expectPart(page, p, 'mic:clip');
  await drag(page, p, 0, 6, 12);
  expect((await mic(page)).clipOpen).toBe(true);

  // Palanca del iris y perilla del condensador.
  p = await aim(page, 'mic', 'diaphragm', 0.4, 0.05, 26, [0, -3.3, 0]);
  await expectPart(page, p, 'mic:diaphragm');
  const d0 = (await mic(page)).diaphragm01;
  await drag(page, p, 6, 0);
  expect(Math.abs((await mic(page)).diaphragm01 - d0)).toBeGreaterThan(0.05);
  p = await aim(page, 'mic', 'condenser', -1.2, 0.05, 26);
  await expectPart(page, p, 'mic:condenser');
  const k0 = (await mic(page)).condenser01;
  await drag(page, p, 0, 8);
  expect(Math.abs((await mic(page)).condenser01 - k0)).toBeGreaterThan(0.05);

  // Ocular: clic = mirar; arrastre del tubo = distancia interpupilar. Anillo de dioptrías en el tubo izquierdo.
  p = await aim(page, 'mic', 'diopterL', -1.3, 0.3, 26, [-1.1, 0, 0]);
  await expectPart(page, p, 'mic:diopterL');
  await drag(page, p, 8, 0);
  expect(Math.abs((await mic(page)).leftDiopter)).toBeGreaterThan(0.2);
  p = await aim(page, 'mic', 'ocular', 0, 0.45, 34);
  const ipd0 = (await mic(page)).ipdMm;
  await drag(page, p, 5, 0, 8);
  expect((await mic(page)).ipdMm).not.toBe(ipd0);
  await page.mouse.click(p.x, p.y);
  await expect(page.getByRole('complementary', { name: 'Ocular del microscopio' })).toBeVisible();
  expect((await world(page)).view.instrument).toBe('compound');
  await page.screenshot({ path: 'test-results/b01-mouse-microscope.png' });

  // Todo por gestos: cada arrastre quedó en la bitácora como un gesto sobre su pieza.
  const acts = await page.evaluate((n) => (window as AnyState).__b01.getState().runtime.actions.slice(n).map((a: AnyState) => `${a.action}:${a.payload.part ?? ''}`), actionsBefore);
  for (const part of ['mic:light', 'mic:turret', 'mic:coarse', 'mic:fine', 'mic:stageX', 'mic:stageY', 'mic:clip', 'mic:diaphragm', 'mic:condenser', 'mic:diopterL', 'mic:ocular']) expect(acts, part).toContain(`gesture:${part}`);
});

test('estereoscopio solo con el ratón: interruptor, diales de luz, zoom, enfoque (el cabezal se mueve), carro de la columna, oculares y dioptrías', async ({ page }) => {
  test.setTimeout(180000);
  await startB01(page);
  let p = await aim(page, 'ste', 'power', 1.3, 0.25);
  await expectPart(page, p, 'ste:power');
  await page.mouse.click(p.x, p.y);
  expect((await ste(page)).power).toBe(true);
  for (const [part, key, az] of [['incident', 'incident01', 1.3], ['transmitted', 'transmitted01', -1.3]] as const) {
    p = await aim(page, 'ste', part, az, 0.25);
    await expectPart(page, p, `ste:${part}`);
    const v0 = (await ste(page))[key];
    await drag(page, p, 0, -10);
    expect(Math.abs((await ste(page))[key] - v0), part).toBeGreaterThan(0.05);
  }
  // Zoom: más aumento, menos campo.
  p = await aim(page, 'ste', 'zoom', 1.2, 0.25, 34);
  await expectPart(page, p, 'ste:zoom');
  const z0 = (await ste(page)).zoomX;
  await drag(page, p, 0, -10);
  expect(Math.abs((await ste(page)).zoomX - z0)).toBeGreaterThan(0.2);
  // Enfoque: la perilla mueve el cuerpo óptico (la lente sube o baja), no la muestra.
  p = await aim(page, 'ste', 'focus', 1.2, 0.2, 34);
  await expectPart(page, p, 'ste:focus');
  const s0 = await ste(page);
  const lens = () => page.evaluate(() => {
    const st = (window as AnyState).__b01.getState().stage;
    return st.controller.view.partAnchor('ste', 'zoom').z;
  });
  const y0 = await lens();
  await drag(page, p, 0, -10);
  const s1 = await ste(page);
  expect(Math.abs(s1.focusTurns - s0.focusTurns)).toBeGreaterThan(0.05);
  // Lente = base + (cabezal + vueltas × paso): 2 mm por vuelta → 0,2 cm.
  expect((await lens()) - y0).toBeCloseTo((s1.focusTurns - s0.focusTurns) * 0.2, 4);
  // Carro de la columna: arrastre vertical cambia la altura del cabezal.
  p = await aim(page, 'ste', 'head', -0.6, 0.15, 36);
  const h0 = (await ste(page)).headZmm;
  await drag(page, p, 0, -6, 8);
  expect(Math.abs((await ste(page)).headZmm - h0)).toBeGreaterThan(1);
  // Oculares (interpupilar) y anillos de dioptrías.
  p = await aim(page, 'ste', 'diopterR', 1.3, 0.25, 26, [1.1, 0, 0]);
  await expectPart(page, p, 'ste:diopterR');
  await drag(page, p, 8, 0);
  expect(Math.abs((await ste(page)).rightDiopter)).toBeGreaterThan(0.2);
  p = await aim(page, 'ste', 'oculars', 0, 0.5, 30);
  const ipd0 = (await ste(page)).ipdMm;
  await drag(page, p, 5, 0, 8);
  expect((await ste(page)).ipdMm).not.toBe(ipd0);
  await page.screenshot({ path: 'test-results/b01-mouse-stereo.png' });
});
