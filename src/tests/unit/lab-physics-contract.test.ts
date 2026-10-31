/**
 * Contrato de todos los laboratorios, actuales y futuros: lo que se lleva en la mano no sale de la mesada y choca con lo
 * macizo. Un motor nuevo en `src/engine/<lab>/controller.ts` que no use los límites comunes hace fallar esta prueba.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ENGINE = join(process.cwd(), 'src/engine');
const labs = readdirSync(ENGINE).filter((d) => existsSync(join(ENGINE, d, 'controller.ts')));

describe('física común de los laboratorios', () => {
  it('encuentra los motores', () => {
    expect(labs.length).toBeGreaterThanOrEqual(11);
  });

  it.each(labs)('%s limita a la mesada y choca', (lab) => {
    const code = readFileSync(join(ENGINE, lab, 'controller.ts'), 'utf8');
    expect(code).toContain('clampToBench(');
    expect(/solidPush\?\.\(|sweepOnBench\(/.test(code)).toBe(true);
  });

  it.each(labs)('la vista de %s conecta el choque', (lab) => {
    const code = readFileSync(join(ENGINE, lab, 'controller.ts'), 'utf8');
    if (!code.includes('solidPush?.(')) return;
    const dir = lab === 'interaction' ? join(ENGINE, 'scene') : join(ENGINE, lab);
    const views = readdirSync(dir).filter((f) => f.endsWith('.tsx')).map((f) => readFileSync(join(dir, f), 'utf8'));
    expect(views.some((v) => v.includes('solidPushOf('))).toBe(true);
  });
});
