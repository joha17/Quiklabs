/**
 * Inicio de sesión para las pruebas e2e: la portada ya no abre los laboratorios; hay que entrar con una cuenta.
 * Se usa la API (la cookie de sesión queda en el contexto del navegador). Cuentas ficticias de worker/seed/seed.sql.
 */
import { expect, type Page } from '@playwright/test';

export const ACCOUNTS = {
  admin: { email: 'admin@quiklabs.example', password: 'Admin#Quiklabs2026' },
  // La docente puede abrir todas las prácticas para revisarlas, sin generar entregas.
  teacher: { email: 'laura.mendez@uni.example', password: 'Docente2026!' },
  student: { email: 'valeria.solano@estudiante.uni.example', password: 'Quimica2026!' },
} as const;

export async function loginAs(page: Page, who: keyof typeof ACCOUNTS = 'teacher') {
  const r = await page.request.post('/api/auth/login', { data: ACCOUNTS[who] });
  expect(r.ok(), `login ${who}: ${r.status()} ${await r.text()}`).toBeTruthy();
}

/** Inicia sesión y abre el panel, donde están los botones «Entrar al laboratorio: …». */
export async function openPanel(page: Page, who: keyof typeof ACCOUNTS = 'teacher') {
  await loginAs(page, who);
  // Recarga completa: si la app ya estaba abierta, vuelve a leer la sesión (la cookie la puso la API).
  await page.goto('/#panel');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
}
