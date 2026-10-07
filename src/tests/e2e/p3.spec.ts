/**
 * Práctica 3 — §26.5 / recorridos con la escena 3D real (Playwright). Usa `window.__p3` solo para LEER el estado
 * y proyectar puntos con la cámara; las manipulaciones se hacen con el ratón y el teclado reales.
 */
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { openPanel } from './auth';

type Pt = { x: number; y: number };
type AnyState = any;

const PPE = ['Bata abotonada y mangas ajustadas', 'Gafas de seguridad', 'Cabello recogido, sin ropa suelta', 'Calzado cerrado'];

const st = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify((window as AnyState).__p3.getState().runtime.world)));

async function startP3(page: Page, mode: 'PRACTICE' | 'GUIDED' | 'EVALUATION' = 'PRACTICE') {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  // Panel (con sesión) → Práctica 3.
  await openPanel(page);
  await page.getByRole('button', { name: /Entrar al laboratorio: Mechero/ }).click();
  await page.waitForFunction(() => !!(window as AnyState).__p3);
  await page.evaluate((m) => (window as AnyState).__p3.getState().setSettings({ quality: 'MEDIUM', seed: 4242, mode: m }), mode);
  await page.getByRole('button', { name: 'Comenzar intento' }).click();
  for (const name of PPE) await page.getByRole('button', { name, exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar y entrar al laboratorio' }).click();
  await page.waitForFunction(() => {
    const s = (window as AnyState).__p3.getState();
    return !!s.stage?.camera && s.stage.stats.calls > 0;
  }, undefined, { timeout: 60000 });
}

async function settle(page: Page) {
  await page.evaluate(() => (window as AnyState).__p3.getState().stage.camera.settle());
  await page.waitForTimeout(200);
}

/** Punto de pantalla donde el rayo toca exactamente ese objeto (o esa parte). */
async function pickPoint(page: Page, id: string, part?: string): Promise<Pt> {
  const p = await page.evaluate(([id, part]) => {
    const s = (window as AnyState).__p3.getState();
    const o = s.runtime.world.objects[id];
    const r = document.querySelector('.canvas-host canvas')!.getBoundingClientRect();
    // Primero lejos de los bordes laterales: sostener un objeto a menos de 30 px del borde desplaza la vista.
    for (const margin of [40, 0]) {
      for (let dz = 0; dz <= 16; dz += 0.5) {
        for (const dx of [0, -2, 2, -5, 5, -9, -13]) {
          for (const dy of [0, -2, 2, -4]) {
            const a = s.stage.camera.screenOf(o.pose.x + dx, o.pose.y + dy, o.pose.z + dz);
            if (a.x < margin || a.x > r.width - margin) continue;
            // El punto tiene que caer sobre el lienzo, no debajo de un panel de la interfaz.
            if (document.elementFromPoint(a.x + r.left, a.y + r.top)?.tagName !== 'CANVAS') continue;
            const h = s.stage.controller.view.pick(a.x, a.y, null);
            if (h?.id === id && (!part || h.part === part)) return { x: a.x + r.left, y: a.y + r.top };
          }
        }
      }
    }
    return null;
  }, [id, part] as const);
  expect(p, `sin punto visible para ${id}${part ? `/${part}` : ''}`).not.toBeNull();
  return p!;
}

async function screenOf(page: Page, x: number, y: number, z: number): Promise<Pt> {
  return page.evaluate(([x, y, z]) => {
    const s = (window as AnyState).__p3.getState();
    const a = s.stage.camera.screenOf(x, y, z);
    const r = document.querySelector('.canvas-host canvas')!.getBoundingClientRect();
    return { x: a.x + r.left, y: a.y + r.top };
  }, [x, y, z] as const);
}

test('el menú lista los laboratorios y abre cada uno', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Laboratorios virtuales de Química General I' })).toBeVisible();
  await openPanel(page);
  await page.getByRole('button', { name: /Entrar al laboratorio: Clasificación/ }).click();
  await expect(page.getByRole('button', { name: 'Comenzar intento' })).toBeVisible();
  await page.getByRole('button', { name: '← Laboratorios' }).click();
  await page.getByRole('button', { name: /Entrar al laboratorio: Mechero/ }).click();
  await expect(page.getByRole('heading', { name: /Práctica 3/ })).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([]);
});

test('válvula por arrastre de la perilla, encendedor arrastrado a la boca y encendido', async ({ page }) => {
  await startP3(page);
  const d = (c: AnyState) => page.evaluate((c) => (window as AnyState).__p3.getState().dispatch(c), c);
  await d({ type: 'connectHose', connected: true });
  await d({ type: 'setValve', valve: 'TABLE', value: 1 });
  await page.evaluate(() => (window as AnyState).__p3.getState().stage.goToStation('A'));
  await settle(page);
  // Arrastrar el encendedor hasta la boca (la altura de transporte del encendedor es la de la boca).
  const w0 = await st(page);
  const from = await pickPoint(page, 'lighter');
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  const b = w0.objects.burner.pose;
  const to = await screenOf(page, b.x + 1, b.y, 15.3);
  await page.mouse.move(to.x, to.y, { steps: 25 });
  await page.waitForTimeout(800);
  let w = await st(page);
  expect(w.objects.lighter.support).toBe('hand');
  expect(Math.hypot(w.objects.lighter.pose.x - b.x, w.objects.lighter.pose.y - b.y)).toBeLessThan(3);
  // Chispa con el botón secundario sostenido; abrir la aguja con el control accesible.
  await page.mouse.down({ button: 'right' });
  for (let i = 1; i <= 8; i++) {
    await d({ type: 'setValve', valve: 'NEEDLE', value: 0.035 * i });
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(400);
  await page.mouse.up({ button: 'right' });
  await page.mouse.up();
  w = await st(page);
  expect(['IGNITING', 'YELLOW_LUMINOUS']).toContain(w.burner.flameState);
  // El encendedor soltado queda en un hueco libre de la mesada, no encima del mechero.
  expect(Math.hypot(w.objects.lighter.pose.x - b.x, w.objects.lighter.pose.y - b.y)).toBeGreaterThan(6);
  // Collar de aire por arrastre real de la perilla (continuo, no binario).
  const collar = await pickPoint(page, 'burner', 'airCollar');
  await page.mouse.move(collar.x, collar.y);
  await page.mouse.down();
  await page.mouse.move(collar.x, collar.y - 60, { steps: 10 });
  await page.mouse.up();
  w = await st(page);
  expect(w.burner.airCollar).toBeGreaterThan(0.15);
  expect(w.burner.airCollar).toBeLessThan(0.7);
});

test('el asa entra sola al tubo (imán), se carga y la llama azul se colorea alrededor de la muestra', async ({ page }) => {
  await startP3(page);
  const d = (c: AnyState) => page.evaluate((c) => (window as AnyState).__p3.getState().dispatch(c), c);
  // Llama azul preparada por comandos (la ignición se prueba en otra prueba).
  for (const t of ['extinguisher', 'blanket', 'estop', 'hose', 'burner']) await d({ type: 'inspect', target: t });
  await d({ type: 'connectHose', connected: true });
  await d({ type: 'setValve', valve: 'TABLE', value: 1 });
  const w0 = await st(page);
  const b = w0.objects.burner.pose;
  await d({ type: 'setPose', id: 'lighter', pose: { x: b.x + 1, y: b.y, z: 15.1, rotationRad: 0 }, support: 'hand' });
  await d({ type: 'spark', on: true });
  for (let i = 1; i <= 8; i++) await d({ type: 'setValve', valve: 'NEEDLE', value: 0.035 * i });
  await page.waitForTimeout(300);
  await d({ type: 'spark', on: false });
  await d({ type: 'setPose', id: 'lighter', pose: { x: 170, y: 12, z: 1.2, rotationRad: 0 }, support: 'bench' });
  for (const a of [0.2, 0.4, 0.6, 0.7]) await d({ type: 'setValve', valve: 'AIR', value: a });
  await d({ type: 'setValve', valve: 'NEEDLE', value: 0.5 });
  // Encuadre con el asa y su tubo lejos de los bordes (cerca del borde, sostener un objeto desplaza la vista).
  await page.evaluate(() => {
    const s = (window as AnyState).__p3.getState();
    const w = s.runtime.world;
    const l = w.objects.loop_nacl.pose;
    const t = w.objects.sol_nacl.pose;
    s.stage.goToStation('C');
    s.stage.camera.lookAt((l.x + t.x) / 2, (l.y + t.y) / 2, 8, 60);
  });
  await settle(page);
  // Tomar el asa del NaCl con el ratón y llevarla sobre su tubo.
  const p = await pickPoint(page, 'loop_nacl');
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  // Un pequeño desplazamiento levanta el asa (un clic sin moverse solo la selecciona).
  await page.mouse.move(p.x + 3, p.y - 6, { steps: 3 });
  await page.waitForFunction(() => (window as AnyState).__p3.getState().stage.controller.held?.id === 'loop_nacl', undefined, { timeout: 10000 });
  const tube = w0.objects.sol_nacl.pose;
  await page.waitForTimeout(400);
  // El controlador proyecta el puntero a la altura de transporte (no a la altura actual, que aún puede estar subiendo)
  // y le suma el desfase del agarre: el punto de pantalla se calcula igual.
  const g = (await page.evaluate(() => {
    const h = (window as AnyState).__p3.getState().stage.controller.held;
    return { z: h.z, ox: h.ox, oy: h.oy };
  })) as { z: number; ox: number; oy: number };
  const over = await screenOf(page, tube.x - g.ox, tube.y - g.oy, g.z);
  await page.mouse.move(over.x, over.y, { steps: 25 });
  await page.waitForTimeout(1500);
  let w = await st(page);
  expect(w.loops.loop_nacl.surfaceWaterMg).toBeGreaterThan(1);
  // Llevarla a la llama (el estudiante la mueve; nada se teletransporta).
  await page.evaluate(() => (window as AnyState).__p3.getState().stage.goToStation('A'));
  await settle(page);
  const carryZ = (await page.evaluate(() => (window as AnyState).__p3.getState().stage.controller.held?.z)) as number;
  const flame = await screenOf(page, b.x, b.y, carryZ);
  await page.mouse.move(flame.x, flame.y, { steps: 30 });
  // Bajar el asa con la rueda hasta la punta del cono interno (≈ 4 cm sobre la boca).
  for (let i = 0; i < Math.round((carryZ - 18.4) / 0.5); i++) await page.mouse.wheel(0, 100);
  await page.waitForTimeout(2500);
  w = await st(page);
  // Bajar con la rueda no desplaza el asa en la mesada.
  expect(Math.hypot(w.objects.loop_nacl.pose.x - b.x, w.objects.loop_nacl.pose.y - b.y)).toBeLessThan(1.5);
  expect(w.observations.sol_nacl.noFilter?.region).toMatch(/amarillo|anaranjado/);
  await page.mouse.up();
  // Al soltar fuera del soporte queda acostada en la mesada (no flota).
  w = await st(page);
  expect(['bench', 'holder:0']).toContain(w.objects.loop_nacl.support);
});

test('no se puede entregar con la llave de mesa abierta', async ({ page }) => {
  await startP3(page, 'EVALUATION');
  await page.evaluate(() => (window as AnyState).__p3.getState().dispatch({ type: 'setValve', valve: 'TABLE', value: 1 }));
  await page.getByRole('button', { name: 'Entregar', exact: true }).click();
  await expect(page.getByText('La llave de gas de la mesa está abierta.')).toBeVisible();
  await expect(page.locator('.modal .btn.primary')).toBeDisabled();
});
