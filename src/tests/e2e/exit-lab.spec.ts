/**
 * Salir del laboratorio (P3 como muestra; el diálogo es común a todas las prácticas): cancelar sigue en el laboratorio,
 * guardar permite reanudar y salir sin guardar descarta el intento, también frente a los autoguardados y una recarga.
 */
import { expect, test, type Page } from '@playwright/test';
import { openPanel } from './auth';

type AnyState = any;
const PPE = ['Bata abotonada y mangas ajustadas', 'Gafas de seguridad', 'Cabello recogido, sin ropa suelta', 'Calzado cerrado'];

async function enterLab(page: Page) {
  await page.getByRole('button', { name: 'Comenzar intento' }).click();
  for (const name of PPE) await page.getByRole('button', { name, exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar y entrar al laboratorio' }).click();
  await page.waitForFunction(() => (window as AnyState).__p3.getState().ppeConfirmed);
}

async function openExit(page: Page) {
  await page.getByRole('button', { name: /Ayuda/ }).click();
  await page.getByRole('button', { name: 'Volver al inicio' }).click();
  await expect(page.getByRole('dialog', { name: 'Salir del laboratorio' })).toBeVisible();
}

test('salir del laboratorio pregunta si guardar; sin guardar se empieza de cero', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await openPanel(page);
  await page.getByRole('button', { name: /Entrar al laboratorio: Mechero/ }).click();
  await page.waitForFunction(() => !!(window as AnyState).__p3);
  await page.evaluate(() => (window as AnyState).__p3.getState().setSettings({ quality: 'LOW' }));

  // Cancelar: sigue en el laboratorio.
  await enterLab(page);
  await openExit(page);
  await page.getByRole('button', { name: 'Seguir en el laboratorio' }).click();
  expect(await page.evaluate(() => (window as AnyState).__p3.getState().screen)).toBe('lab');

  // Guardar y salir: el intento se puede reanudar.
  await openExit(page);
  await page.getByRole('button', { name: 'Guardar y salir' }).click();
  await expect(page.getByRole('button', { name: 'Reanudar intento guardado' })).toBeVisible();
  await page.getByRole('button', { name: 'Reanudar intento guardado' }).click();
  expect(await page.evaluate(() => (window as AnyState).__p3.getState().screen)).toBe('lab');

  // Salir sin guardar: no queda nada que reanudar, ni tras autoguardados o volver a la portada.
  await openExit(page);
  await page.getByRole('button', { name: 'Salir sin guardar' }).click();
  await expect(page.getByRole('button', { name: 'Comenzar intento' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reanudar intento guardado' })).toHaveCount(0);
  await page.waitForTimeout(6000);
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.reload();
  await expect(page.getByRole('button', { name: 'Comenzar intento' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reanudar intento guardado' })).toHaveCount(0);
});
