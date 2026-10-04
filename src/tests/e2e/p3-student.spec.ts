/**
 * Práctica 3 — recorrido completo de un estudiante, de principio a fin, solo con la interfaz real:
 * ratón (arrastre, rueda, clic derecho), teclado y botones/controles de la página.
 * `window.__p3` se usa únicamente para (a) proyectar puntos 3D a la pantalla y (b) leer lo que el estudiante
 * VE (altura en la regla, color de la llama, temperatura descrita) y verificar resultados. Ninguna acción se hace
 * despachando comandos al dominio.
 */
import { expect, test, type Page } from '@playwright/test';

type AnyState = any;
type Pt = { x: number; y: number };

const SOLUTIONS = ['sol_nacl', 'sol_kcl', 'sol_cacl2', 'sol_cucl2', 'sol_licl', 'sol_bacl2', 'sol_mix', 'sol_unknown'];
const LOOPS = SOLUTIONS.map((s) => `loop_${s.replace('sol_', '')}`);
const PARTS: Array<[string, string, string]> = [
  ['Base', 'burner', 'base'],
  ['Entrada lateral de gas', 'burner', 'gasInlet'],
  ['Manguera / conexión', 'hose', 'hose'],
  ['Válvula reguladora de gas (aguja)', 'burner', 'needleValve'],
  ['Entradas de aire', 'burner', 'airInlets'],
  ['Collar regulador de aire', 'burner', 'airCollar'],
  ['Cañón (tubo de mezcla)', 'burner', 'barrel'],
  ['Boca del cañón', 'burner', 'mouth'],
  ['Llave de gas de la mesa', 'gas_tap', 'tableValve'],
];

/** Lo que el estudiante ve / el estado para verificar. */
const world = (page: Page): Promise<AnyState> =>
  page.evaluate(() => JSON.parse(JSON.stringify((window as AnyState).__p3.getState().runtime.world)));
const held = (page: Page): Promise<AnyState> =>
  page.evaluate(() => JSON.parse(JSON.stringify((window as AnyState).__p3.getState().stage.controller.held ?? null)));

async function settle(page: Page) {
  await page.evaluate(() => (window as AnyState).__p3.getState().stage.camera.settle());
  await page.waitForTimeout(250);
}

async function station(page: Page, id: string) {
  await page.locator('header nav button.station-btn', { hasText: new RegExp(`^${id}$`) }).click();
  await settle(page);
}

async function screenOf(page: Page, x: number, y: number, z: number): Promise<Pt> {
  return page.evaluate(([x, y, z]) => {
    const s = (window as AnyState).__p3.getState();
    const a = s.stage.camera.screenOf(x, y, z);
    const r = document.querySelector('.canvas-host canvas')!.getBoundingClientRect();
    return { x: a.x + r.left, y: a.y + r.top };
  }, [x, y, z] as const);
}

/** Punto de pantalla donde el rayo del puntero toca exactamente ese objeto (o esa parte). */
async function pickPoint(page: Page, id: string, part?: string): Promise<Pt> {
  const p = await page.evaluate(([id, part]) => {
    const s = (window as AnyState).__p3.getState();
    const w = s.runtime.world;
    const o = id === 'hose' ? { pose: { ...w.hose.mid } } : w.objects[id];
    const r = document.querySelector('.canvas-host canvas')!.getBoundingClientRect();
    for (const dz of [0, 1, -1, 2, -2, 3, -3, 5, -5, 7, -7, 9, -9, 11, -11, 13, -13, 15, -15]) {
      for (const dx of [0, -1, 1, -2, 2, -4, 4, -6, -9, -12]) {
        for (const dy of [0, -1, 1, -3, 3]) {
          const a = s.stage.camera.screenOf(o.pose.x + dx, o.pose.y + dy, o.pose.z + dz);
          if (a.x < 5 || a.y < 5 || a.x > r.width - 5 || a.y > r.height - 5) continue;
          const h = s.stage.controller.view.pick(a.x, a.y, null);
          if (h?.id === id && (!part || h.part === part)) return { x: a.x + r.left, y: a.y + r.top };
        }
      }
    }
    return null;
  }, [id, part ?? null] as const);
  expect(p, `sin punto visible para ${id}${part ? `/${part}` : ''}`).not.toBeNull();
  return p!;
}

/** Mueve el puntero (con el objeto en la mano) sobre un punto de la mesada, a la altura actual de transporte. */
async function carryTo(page: Page, x: number, y: number, steps = 18) {
  const h = await held(page);
  const p = await screenOf(page, x - (h?.ox ?? 0), y - (h?.oy ?? 0), h?.z ?? 0);
  await page.mouse.move(p.x, p.y, { steps });
  await page.waitForTimeout(350);
}

/** Sube o baja lo que se sostiene con la rueda del ratón hasta la altura z (cm). */
async function wheelToZ(page: Page, z: number) {
  for (let i = 0; i < 80; i++) {
    const h = await held(page);
    if (!h) return;
    const cur = h.magnet ? h.magnet.z : h.z;
    if (Math.abs(cur - z) < 0.3) break;
    await page.mouse.wheel(0, cur > z ? 100 : -100);
  }
  await page.waitForTimeout(400);
}

async function inventorySelect(page: Page, name: string) {
  const drawer = page.locator('aside.drawer.left');
  if (!(await drawer.isVisible())) await page.getByRole('button', { name: 'Material' }).click();
  await drawer.getByRole('button', { name, exact: true }).click();
  await page.waitForTimeout(250);
}

async function closeInventory(page: Page) {
  if (await page.locator('aside.drawer.left').isVisible()) await page.getByRole('button', { name: 'Material' }).click();
}

/** Ajusta un control deslizante de válvula con el teclado (flechas), como lo haría alguien sin ratón. */
async function valveKeys(page: Page, id: 'NEEDLE' | 'AIR' | 'TABLE', key: 'ArrowRight' | 'ArrowLeft' | 'Home' | 'End', times = 1) {
  const s = page.locator(`#valve-${id}`);
  await s.focus();
  for (let i = 0; i < times; i++) await s.press(key);
}

/** Lee la altura de la llama en la narración del panel de seguridad (lo mismo que se ve en la regla). */
async function flameCm(page: Page): Promise<number> {
  const txt = await page.locator('.p3-flame-line').innerText();
  const m = txt.match(/(\d+) cm/);
  return m ? Number(m[1]) : 0;
}

/** Ajusta la válvula de aguja con el control accesible hasta ver una llama de 10 cm. */
async function adjustTo10cm(page: Page) {
  await inventorySelect(page, 'Mechero de Bunsen');
  await closeInventory(page);
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(250);
    const h = (await world(page)).burner.flame.heightCm;
    if (Math.abs(h - 10) <= 0.5) break;
    await valveKeys(page, 'NEEDLE', h < 10 ? 'ArrowRight' : 'ArrowLeft');
  }
  expect(await flameCm(page)).toBe(10);
}

async function setSpeed(page: Page, v: string) {
  await page.locator('#p3speed').selectOption(v);
}

async function waitUntil(page: Page, fn: (w: AnyState) => boolean, maxMs: number) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    if (fn(await world(page))) return;
    await page.waitForTimeout(400);
  }
  throw new Error('condición no alcanzada');
}

// Cada acción falla con un mensaje claro si un control no aparece (en vez de esperar hasta el límite global).
test.use({ actionTimeout: 15_000 });

test('recorrido completo de un estudiante en la Práctica 3', async ({ page }) => {
  test.setTimeout(25 * 60_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const log = (m: string) => console.log(`· ${m}`);

  // ── Menú → Práctica 3 → configuración → EPP ──
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: /Entrar al laboratorio: Mechero/ }).click();
  await page.getByLabel(/Práctica/).first().check();
  await page.locator('#p3seed').fill('20261004');
  await page.waitForFunction(() => !!(window as AnyState).__p3);
  await page.evaluate(() => (window as AnyState).__p3.getState().setSettings({ quality: 'MEDIUM' }));
  await page.getByRole('button', { name: 'Comenzar intento' }).click();
  // El encendido sin EPP no es posible: se exige ponerse cada elemento.
  await expect(page.getByRole('button', { name: 'Confirmar y entrar al laboratorio' })).toBeDisabled();
  for (const name of ['Bata abotonada y mangas ajustadas', 'Gafas de seguridad', 'Cabello recogido, sin ropa suelta', 'Calzado cerrado']) {
    await page.getByRole('button', { name, exact: true }).click();
  }
  await page.getByRole('button', { name: 'Confirmar y entrar al laboratorio' }).click();
  await page.waitForFunction(() => {
    const s = (window as AnyState).__p3.getState();
    return !!s.stage?.camera && s.stage.stats.calls > 0;
  }, undefined, { timeout: 60_000 });
  log('laboratorio abierto');
  // El panel de seguridad tapa parte de la escena: se contrae (la narración de la llama sigue visible).
  await page.locator('.p3-safety-head button').click();

  // ── A. Seguridad: ubicar extintor, manta y corte; encender extracción ──
  for (const name of ['Extintor', 'Manta ignífuga', 'Corte de gas de emergencia']) {
    await inventorySelect(page, name);
    await page.locator('#actions').getByRole('button', { name: 'Ubicar', exact: true }).click();
  }
  await closeInventory(page);
  await page.locator('.p3-safety-head button').click();
  await page.locator('.p3-safety').getByRole('button', { name: /Extracción/ }).click();
  await page.locator('.p3-safety-head button').click();
  let w = await world(page);
  expect(w.safety.located).toMatchObject({ extinguisher: true, blanket: true, estop: true });
  expect(w.room.extractionOn).toBe(true);

  // ── Inspección de manguera y mechero (válvulas cerradas) ──
  await station(page, 'A');
  const hoseP = await pickPoint(page, 'hose');
  await page.mouse.click(hoseP.x, hoseP.y);
  await page.locator('#actions').getByRole('button', { name: 'Inspeccionar manguera' }).click();
  await inventorySelect(page, 'Mechero de Bunsen');
  await closeInventory(page);
  await page.locator('#actions').getByRole('button', { name: 'Inspeccionar mechero' }).click();
  w = await world(page);
  expect(w.hose.inspected).toBe(true);
  expect(w.evidence.valvesConfirmedClosed).toBeTruthy();
  await expect(page.locator('.stage-pill')).toContainText(/Identificación de partes/, { timeout: 5000 });
  log('inspección previa completa');

  // ── Identificación de partes sobre el modelo 3D ──
  await page.getByRole('button', { name: '🔎 Partes' }).click();
  for (const [label, obj, part] of PARTS) {
    await station(page, 'A');
    await page.locator('.parts-panel').getByRole('button', { name: label, exact: true }).click();
    await settle(page);
    const p = await pickPoint(page, obj, part);
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(200);
  }
  w = await world(page);
  expect(Object.keys(w.parts.answers).length).toBe(9);
  expect(w.parts.wrong).toBe(0);
  await page.getByRole('button', { name: '🔎 Partes' }).click();
  log('9 de 9 partes identificadas');

  // ── Conectar la manguera, abrir la llave de mesa (arrastrando la palanca) ──
  await inventorySelect(page, 'Mechero de Bunsen');
  await closeInventory(page);
  await page.locator('#actions').getByRole('button', { name: 'Conectar manguera' }).click();
  await station(page, 'A');
  const tap = await pickPoint(page, 'gas_tap', 'tableValve');
  await page.mouse.move(tap.x, tap.y);
  await page.mouse.down();
  await page.mouse.move(tap.x, tap.y - 200, { steps: 12 });
  await page.mouse.up();
  w = await world(page);
  expect(w.burner.hoseConnected).toBe(true);
  expect(w.burner.tableGasValve).toBeGreaterThan(0.95);
  expect(w.burner.airCollar).toBe(0);

  // ── Encendido: encendedor en la boca, chispa (clic derecho) y aguja con la rueda (otra mano) ──
  const b = w.objects.burner.pose;
  const lp = await pickPoint(page, 'lighter');
  await page.mouse.move(lp.x, lp.y);
  await page.mouse.down();
  await carryTo(page, b.x + 1, b.y, 25);
  await page.mouse.down({ button: 'right' });
  await page.waitForTimeout(300);
  for (let i = 0; i < 14; i++) {
    await page.mouse.wheel(0, -100);
    await page.waitForTimeout(70);
  }
  await page.waitForTimeout(500);
  await page.mouse.up({ button: 'right' });
  await page.mouse.up();
  w = await world(page);
  expect(['YELLOW_LUMINOUS', 'IGNITING']).toContain(w.burner.flameState);
  expect(w.evidence.firstIgnitionOrderOk).toBe(1);
  expect(Math.hypot(w.objects.lighter.pose.x - b.x, w.objects.lighter.pose.y - b.y)).toBeGreaterThan(6);
  log(`encendido según la guía: ${w.burner.flameState}`);

  // ── Llama amarilla de 10 cm ──
  await adjustTo10cm(page);
  await page.waitForTimeout(4500);
  w = await world(page);
  expect(w.burner.flameState).toBe('YELLOW_LUMINOUS');
  expect(w.evidence.heightOkYellowS).toBeGreaterThan(2);
  log('llama amarilla de 10 cm');

  // ── Primera cápsula: pinza, llama amarilla, placa refractaria ──
  await station(page, 'B');
  const tg = await pickPoint(page, 'tongs');
  await page.mouse.move(tg.x, tg.y);
  await page.mouse.down();
  const cap0 = w.objects.capsule.pose;
  await carryTo(page, cap0.x, cap0.y - 4.2);
  await wheelToZ(page, cap0.z + 2.3);
  await carryTo(page, cap0.x, cap0.y - 4.2, 6);
  await expect(page.locator('#actions')).toContainText('En posición');
  await page.mouse.down({ button: 'right' });
  await page.mouse.up({ button: 'right' });
  w = await world(page);
  expect(w.capsule.clampedBy).toBe('tongs');
  await wheelToZ(page, 14.5 + 5 + 2.3);
  await carryTo(page, b.x, b.y - 4.2, 25);
  await page.waitForTimeout(11_000);
  w = await world(page);
  expect(w.capsule.activeExposure?.durationS ?? 0).toBeGreaterThan(8);
  const tile = w.objects.tile.pose;
  await carryTo(page, tile.x, tile.y - 4.2, 25);
  await wheelToZ(page, 1.1 + 2.3 + 0.2);
  await page.mouse.up();
  await page.waitForTimeout(800);
  w = await world(page);
  expect(w.objects.capsule.support).toBe('tile');
  expect(w.capsule.sootCoverage).toBeGreaterThan(0.3);
  log(`primera cápsula: ${w.capsule.sootMassMg.toFixed(2)} mg de hollín, ${w.objects.capsule.temperatureC.toFixed(0)} °C`);

  // ── Llama azul: abrir el aire poco a poco y reajustar a 10 cm ──
  await inventorySelect(page, 'Mechero de Bunsen');
  await closeInventory(page);
  for (let i = 0; i < 8; i++) {
    await valveKeys(page, 'AIR', 'ArrowRight', 8);
    await page.waitForTimeout(300);
  }
  await adjustTo10cm(page);
  await page.waitForTimeout(4000);
  w = await world(page);
  expect(w.burner.flameState).toBe('BLUE_STABLE');
  expect(w.flameLog.twoConesS).toBeGreaterThan(3);
  expect(w.flameLog.transitionSeen).toBe(true);
  log(`llama azul de dos conos, aire ${(w.burner.airCollar * 100).toFixed(0)} %`);

  // ── Esperar a que la cápsula se enfríe (tiempo acelerado) y limpiarla con el paño ──
  await setSpeed(page, '10');
  await inventorySelect(page, 'Cápsula de porcelana');
  await expect(page.locator('#action-desc')).toContainText(/caliente|tibio/);
  await waitUntil(page, (x) => x.objects.capsule.temperatureC < 44, 120_000);
  await expect(page.locator('#action-desc')).toContainText('manipulable');
  await closeInventory(page);
  await setSpeed(page, '2');
  await station(page, 'B');
  for (let i = 0; i < 3; i++) {
    const cl = await pickPoint(page, 'cloth');
    await page.mouse.move(cl.x, cl.y);
    await page.mouse.down();
    const c = (await world(page)).objects.capsule.pose;
    await carryTo(page, c.x, c.y);
    await page.mouse.up();
    await page.waitForTimeout(300);
  }
  w = await world(page);
  expect(w.capsule.sootMassMg).toBeLessThan(0.05);
  log('cápsula fría y limpia');

  // ── Segunda cápsula en la llama azul ──
  const tg2 = await pickPoint(page, 'tongs');
  await page.mouse.move(tg2.x, tg2.y);
  await page.mouse.down();
  const cap1 = w.objects.capsule.pose;
  await carryTo(page, cap1.x, cap1.y - 4.2);
  await wheelToZ(page, cap1.z + 2.3);
  await carryTo(page, cap1.x, cap1.y - 4.2, 6);
  await page.mouse.down({ button: 'right' });
  await page.mouse.up({ button: 'right' });
  await wheelToZ(page, 14.5 + 4 + 2.3);
  await carryTo(page, b.x, b.y - 4.2, 25);
  await page.waitForTimeout(10_000);
  await carryTo(page, tile.x, tile.y - 4.2, 25);
  await wheelToZ(page, 1.1 + 2.3 + 0.2);
  await page.mouse.up();
  await page.waitForTimeout(800);
  w = await world(page);
  const ex = w.capsule.exposures;
  expect(ex.length).toBeGreaterThanOrEqual(2);
  const second = ex[ex.length - 1];
  expect(second.sootAfterMg - second.sootBeforeMg).toBeLessThan(0.05);
  expect(second.maxTempC).toBeGreaterThan(ex[0].maxTempC);
  log(`segunda cápsula: sin hollín nuevo, ${second.maxTempC.toFixed(0)} °C (la primera llegó a ${ex[0].maxTempC.toFixed(0)} °C)`);

  // ── Cationes: con cada asa — comprobar limpieza, cargar, observar sin y con vidrio, guardar ──
  await station(page, 'C');
  const optimalZ = 14.5 + w.burner.flame.innerConeHeightCm * 1.15;
  const cool = async () => {
    await carryTo(page, b.x - 22, b.y - 8, 12);
    await page.waitForTimeout(12_500);
  };
  for (let i = 0; i < SOLUTIONS.length; i++) {
    const sol = SOLUTIONS[i];
    const loop = LOOPS[i];
    const p = await pickPoint(page, loop);
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    expect((await held(page))?.id).toBe(loop);
    // Comprobación de limpieza en la llama azul.
    await carryTo(page, b.x, b.y, 25);
    await wheelToZ(page, optimalZ);
    await page.waitForTimeout(2600);
    await cool();
    // Cargar: el asa entra sola al acercarla a la boca de su tubo.
    const tube = (await world(page)).objects[sol].pose;
    await carryTo(page, tube.x, tube.y, 25);
    await page.waitForTimeout(1600);
    w = await world(page);
    expect(w.loops[loop].surfaceWaterMg, `${loop} cargó muestra`).toBeGreaterThan(1);
    // Llama sin filtro.
    await carryTo(page, b.x, b.y, 25);
    await page.waitForTimeout(4500);
    await cool();
    // Recargar y observar con el vidrio de cobalto (tecla G: la otra mano lo sostiene frente a la vista).
    await carryTo(page, tube.x, tube.y, 25);
    await page.waitForTimeout(1600);
    await carryTo(page, b.x, b.y, 25);
    await page.keyboard.press('g');
    await page.waitForTimeout(4500);
    await page.keyboard.press('g');
    await cool();
    // Guardar en su ranura.
    const slot = (await world(page)).objects[loop];
    const hs = await page.evaluate((i) => {
      const s = (window as AnyState).__p3.getState().runtime.world.objects.holder.pose;
      return { x: s.x - 3.5 * 3.2 + i * 3.2, y: s.y };
    }, i);
    await carryTo(page, hs.x, hs.y, 20);
    await page.mouse.up();
    await page.waitForTimeout(300);
    w = await world(page);
    expect(w.objects[loop].support, `${loop} vuelve a su ranura`).toBe(`holder:${i}`);
    const o = w.observations[sol];
    log(`${w.solutions[sol].label}: sin filtro ${o.noFilter?.region} · con filtro ${o.filter?.region} · limpia: ${!!w.evidence[`cleanChecked:${loop}`]} · ${slot.temperatureC.toFixed(0)} °C al guardar`);
    expect(o.noFilter, `${sol} observado sin filtro`).toBeTruthy();
    expect(o.filter, `${sol} observado con filtro`).toBeTruthy();
  }

  // ── Apagado: aire → aguja → llave de mesa; comprobar ──
  await inventorySelect(page, 'Mechero de Bunsen');
  await valveKeys(page, 'AIR', 'Home');
  await page.waitForTimeout(400);
  await valveKeys(page, 'NEEDLE', 'Home');
  await page.waitForTimeout(400);
  await inventorySelect(page, 'Llave de gas de la mesa');
  await valveKeys(page, 'TABLE', 'Home');
  await inventorySelect(page, 'Mechero de Bunsen');
  await page.locator('#actions').getByRole('button', { name: 'Inspeccionar mechero' }).click();
  await closeInventory(page);
  w = await world(page);
  expect(w.burner.flameState).toBe('OFF');
  expect(w.evidence.shutdownAirFirst).toBe(1);
  expect(w.evidence.shutdownNeedleFirst).toBe(1);
  expect(w.evidence.shutdownConfirmed).toBeTruthy();
  log('apagado en el orden de la guía');

  // ── Libreta: registrar lo observado (el estudiante describe lo que vio) ──
  const nbOpen = async () => {
    if (!(await page.locator('aside.drawer:not(.left)').isVisible())) await page.getByRole('button', { name: '📓 Libreta' }).click();
  };
  await nbOpen();
  await page.getByRole('tab', { name: 'Cuadro 3.2' }).click();
  const r32: Record<string, [string, string, string, string?]> = {
    initial: ['amarillo', 'irregular', 'luminosa'],
    capsule1: ['amarillo', 'irregular', 'luminosa', 'negro'],
    airOpen: ['azul', 'dos_conos', 'no_luminosa'],
    capsule2: ['azul', 'dos_conos', 'no_luminosa', 'no'],
  };
  for (const [row, [c, s, l, soot]] of Object.entries(r32)) {
    await page.selectOption(`#c-${row}`, c);
    await page.selectOption(`#s-${row}`, s);
    await page.selectOption(`#l-${row}`, l);
    if (soot) await page.selectOption(`#h-${row}`, soot);
    await page.fill(`#i-${row}`, row.startsWith('capsule1') ? 'Depósito de carbono: cambio físico, combustión incompleta.' : 'Observado durante la práctica.');
  }
  w = await world(page);
  const toNb = (r?: string) => (!r || r === 'sin_color' || r === 'blanquecino' ? 'oscura' : r);
  await page.getByRole('tab', { name: 'Cuadro 3.3' }).click();
  for (const sol of SOLUTIONS) {
    const o = w.observations[sol];
    await page.selectOption(`#sc-${sol}`, w.solutions[sol].displayColor === 0xf4f8fb ? 'incolora' : 'azul_verdosa_palida');
    await page.selectOption(`#nf-${sol}`, toNb(o.noFilter?.region));
    await page.selectOption(`#f-${sol}`, toNb(o.filter?.region));
    await page.selectOption(`#in-${sol}`, 'intensa_breve');
  }
  // Incógnita: comparar su color (sin y con filtro) con los patrones propios.
  const known: Record<string, string> = { sol_nacl: 'Na+', sol_kcl: 'K+', sol_cacl2: 'Ca2+', sol_cucl2: 'Cu2+', sol_licl: 'Li+', sol_bacl2: 'Ba2+' };
  const u = w.observations.sol_unknown;
  const match = Object.entries(known).find(([s]) => w.observations[s].noFilter?.region === u.noFilter?.region && w.observations[s].filter?.region === u.filter?.region)
    ?? Object.entries(known).find(([s]) => w.observations[s].noFilter?.region === u.noFilter?.region);
  expect(match, 'la incógnita coincide con algún patrón').toBeTruthy();
  await page.getByRole('tab', { name: 'Incógnita' }).click();
  await page.selectOption('#u-id', match![1]);
  await page.selectOption('#u-c', 'alta');
  await page.fill('#u-j', `Mismo color que mi patrón ${w.solutions[match![0]].label}, sin y con vidrio de cobalto.`);
  await page.getByRole('tab', { name: 'Preguntas' }).click();
  for (const q of ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7']) await page.fill(`#p3${q}`, 'Respuesta del estudiante con la explicación de lo observado en la práctica.');
  await page.getByRole('button', { name: '📓 Libreta' }).click();
  log(`incógnita N.º ${w.unknown.number}: propuesta ${match![1]} (real ${w.unknown.cation})`);

  // ── Esperar a que el mechero se enfríe y entregar ──
  await setSpeed(page, '10');
  await waitUntil(page, (x) => x.burner.bodyTemperatureC < 58 && x.objects.capsule.temperatureC < 58, 120_000);
  await page.getByRole('button', { name: 'Entregar', exact: true }).click();
  await expect(page.locator('.modal')).not.toContainText('No puedes entregar');
  await page.locator('.modal .btn.primary').click();
  await expect(page.getByRole('heading', { name: /Revisión del intento/ })).toBeVisible();
  const total = await page.locator('.score-big').innerText();
  const failed = await page.locator('.fb-list li:has(.bad)').allTextContents();
  const pending = await page.locator('.fb-list li:has(.pending)').allTextContents();
  log(`calificación ${total}`);
  for (const f of failed) log(`✗ ${f.replace(/\s+/g, ' ')}`);
  for (const f of pending) log(`◐ ${f.replace(/\s+/g, ' ')}`);
  await page.screenshot({ path: 'test-results/p3-estudiante-revision.png', fullPage: true });
  expect(errors).toEqual([]);
  expect(failed).toEqual([]);
  expect(parseInt(total, 10)).toBeGreaterThanOrEqual(85);
  w = await world(page);
  expect(w.unknown.cation).toBe(match![1]);
});
