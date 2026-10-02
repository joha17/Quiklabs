import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'playwright-report', 'test-results'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
  // Las pruebas e2e leen el estado del navegador sin tipos.
  { files: ['src/tests/**/*.ts'], rules: { '@typescript-eslint/no-explicit-any': 'off' } },
  // Regla de arquitectura (§3.3): el dominio científico no puede importar Three.js, Rapier, React ni el motor.
  {
    files: ['src/simulation/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['three', 'three/*'], message: 'simulation/ no puede depender de Three.js.' },
            { group: ['@react-three/*'], message: 'simulation/ no puede depender de React Three Fiber/drei/Rapier.' },
            { group: ['@dimforge/*'], message: 'simulation/ no puede depender del motor de física.' },
            { group: ['react', 'react-dom', 'react/*'], message: 'simulation/ no puede depender de React.' },
            { group: ['**/engine/**', '**/app/**'], message: 'simulation/ no puede depender del motor ni de la UI.' },
          ],
        },
      ],
    },
  },
);
