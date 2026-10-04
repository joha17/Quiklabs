import base from '/home/johannes/Proyectos/Quiklabs/playwright.config';
export default { ...base, testDir: '/home/johannes/Proyectos/Quiklabs/src/tests/e2e', webServer: undefined, use: { ...base.use, launchOptions: { ...base.use!.launchOptions, executablePath: '/usr/bin/chromium' } } };
