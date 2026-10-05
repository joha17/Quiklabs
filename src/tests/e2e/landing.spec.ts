/**
 * Página de inicio de Quiklabs: contenido principal, navegación interna, carrusel, entrada a un laboratorio y
 * accesibilidad (axe) en modo claro y oscuro.
 */
import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { ACCOUNTS } from './auth';

test('la página de inicio presenta Quiklabs y lleva a los laboratorios', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Quiklabs/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('QUIK');
  await expect(page.getByText('construye', { exact: true })).toBeVisible();
  // La escena 3D de fondo se dibuja (lienzo con tamaño).
  await expect(page.locator('canvas.lp-stage')).toBeVisible();
  // Las tres prácticas están en la portada, pero no se entra directo: el botón lleva a iniciar sesión.
  for (const name of [/Clasificación/, /Mechero/, /Reacciones químicas/]) {
    await expect(page.getByRole('button', { name: new RegExp(`Iniciar sesión para entrar: ${name.source}`) })).toBeAttached();
  }
  await expect(page.getByRole('button', { name: /Entrar al laboratorio:/ })).toHaveCount(0);
  // El enlace del menú lleva a la sección de docentes.
  await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Docentes' }).click();
  await expect(page.getByRole('heading', { name: /Pensado para/ })).toBeInViewport();
  // Carrusel de capturas: la flecha avanza a la segunda imagen.
  const gallery = page.getByRole('region', { name: 'Capturas del simulador' }).first();
  await gallery.scrollIntoViewIfNeeded();
  await gallery.getByRole('button', { name: 'Imagen siguiente' }).click();
  await expect(gallery.getByRole('button', { name: 'Ver imagen 2' })).toHaveAttribute('aria-current', 'true');
  // Simulador mínimo: con «Agregar 0,5 mL» el NaOH sube y el pH se recalcula.
  const card = page.getByRole('complementary', { name: 'Neutralización en vivo' });
  await card.scrollIntoViewIfNeeded();
  const read = async () => Number((await card.locator('dd').first().textContent())!.replace(' mL', '').replace(',', '.'));
  await card.getByRole('button', { name: 'Agregar 0,5 mL' }).click();
  const v0 = await read();
  for (let i = 0; i < 2; i++) await card.getByRole('button', { name: 'Agregar 0,5 mL' }).click();
  const v1 = Math.min(35, v0 + 1);
  await expect(card.locator('dd').first()).toHaveText(`${v1.toFixed(1).replace('.', ',')} mL`);
  // pH de HCl 0,10 M (25,0 mL) con v1 mL de NaOH 0,10 M, calculado aparte.
  const d = (2.5e-3 - 1e-4 * v1) / ((25 + v1) / 1000);
  const ph = -Math.log10((d + Math.sqrt(d * d + 4e-14)) / 2);
  await expect(card.locator('dd').nth(1)).toHaveText(ph.toFixed(2).replace('.', ','));
  // Desde la tarjeta se llega al login; con la cuenta docente se entra al panel y de ahí al laboratorio.
  await page.getByRole('button', { name: /Iniciar sesión para entrar: Reacciones químicas/ }).click();
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
  await page.getByLabel('Correo institucional').fill(ACCOUNTS.teacher.email);
  await page.getByLabel('Contraseña', { exact: true }).fill(ACCOUNTS.teacher.password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.getByRole('button', { name: /Entrar al laboratorio: Reacciones químicas/ }).click();
  await expect(page.getByRole('heading', { name: 'Reacciones químicas', level: 1 })).toBeVisible();
});

for (const scheme of ['light', 'dark'] as const) {
  test(`la página de inicio no tiene violaciones graves de accesibilidad (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    await page.goto('/');
    await page.waitForTimeout(500);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
  });
}

test('el botón de tema alterna claro/oscuro, se recuerda y vuelve a seguir al sistema', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const bg = () => page.evaluate(() => getComputedStyle(document.querySelector('.lp')!).backgroundColor);
  const btn = page.getByRole('button', { name: 'Modo oscuro' });
  await expect(btn).toHaveAttribute('aria-pressed', 'true');
  expect(await bg()).toBe('rgb(15, 23, 25)');
  await btn.click();
  await expect(btn).toHaveAttribute('aria-pressed', 'false');
  expect(await bg()).toBe('rgb(235, 232, 226)');
  await page.reload();
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('light');
  await page.getByRole('button', { name: 'Modo oscuro' }).click();
  expect(await page.evaluate(() => [document.documentElement.dataset.theme ?? null, localStorage.getItem('quiklabs.theme')])).toEqual([null, null]);
});

test('sin sesión no se abre un laboratorio; sin registro público; cuenta sin matrícula rechazada', async ({ page }) => {
  await page.goto('/#p4');
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
  await expect(page.getByRole('link', { name: /registr/i })).toHaveCount(0);
  await page.getByLabel('Correo institucional').fill('lucia.fernandez@estudiante.uni.example');
  await page.getByLabel('Contraseña', { exact: true }).fill('Quimica2026!');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('matrícula activa');
  const signup = await page.request.post('/api/auth/register', { data: { email: 'x@y.z', password: 'Abcdefghij12' } });
  expect(signup.status()).toBe(404);
});

test('cada rol entra a su panel', async ({ page }) => {
  for (const [who, text] of [['admin', 'Importar padrón'], ['teacher', 'Prácticas del grupo'], ['student', 'Mis entregas']] as const) {
    await page.goto('/#login');
    await page.getByLabel('Correo institucional').fill(ACCOUNTS[who].email);
    await page.getByLabel('Contraseña', { exact: true }).fill(ACCOUNTS[who].password);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page.getByText(text).first()).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`), who).toEqual([]);
    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
  }
});
