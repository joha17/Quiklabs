import { defineConfig } from '@playwright/test';

// Usa Microsoft Edge instalado en el sistema (Windows) para no descargar navegadores.
// En otros sistemas: `npx playwright install chromium` y borre `channel`.
export default defineConfig({
  testDir: './src/tests/e2e',
  timeout: 90_000,
  // Una sola escena WebGL a la vez: las pruebas comparten la GPU y miden rendimiento.
  workers: 1,
  use: {
    baseURL: 'http://localhost:4173',
    channel: process.platform === 'win32' ? 'msedge' : undefined,
    viewport: { width: 1440, height: 900 },
    // WebGL acelerado por hardware también en modo sin ventana (si no, se usa el rasterizador por software).
    launchOptions: { args: ['--use-angle=default', '--enable-gpu', '--ignore-gpu-blocklist'] },
  },
  // Sitio + API (Worker) con KV local vacío en cada ejecución; wrangler compila primero (build.command).
  webServer: {
    command: `node -e "require('fs').rmSync('.wrangler/e2e',{recursive:true,force:true})" && npx wrangler dev --port 4173 --persist-to .wrangler/e2e --var SESSION_SECRET:${'e2e-'.padEnd(48, 'x')}`,
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
