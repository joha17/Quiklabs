/**
 * Recorrido completo de B04 hecho solo con comandos: preparaciones, cuatro ensayos con controles, Feulgen al
 * microscopio, catalasa con cuatro condiciones y amilasa con alícuotas separadas. Sin errores, puesto cerrado,
 * todas las etapas acreditadas y nota alta; el balance de masa se conserva.
 */
import { describe, expect, it } from 'vitest';
import { b04StageEvidence } from '../../practices/practice-b04/evidence';
import { evaluateB04 } from '../../practices/practice-b04/rubric';
import { conservedBio } from '../../simulation/bio-world/world';
import { errKeysB04, idealAttemptB04 } from '../helpersB04';

describe('B04 · recorrido ideal', () => {
  const { w, nb } = idealAttemptB04();

  it('no deja errores registrados', () => {
    expect(errKeysB04(w)).toEqual([]);
  });

  it('acredita todas las etapas y cierra el puesto', () => {
    const f = b04StageEvidence(w, nb);
    const missing = Object.entries(f).filter(([k, v]) => !v && !['dnaSkipped', 'adhEnabled', 'adhEvaluated'].includes(k)).map(([k]) => k);
    expect(missing).toEqual([]);
  });

  it('conserva el balance de masa', () => {
    const c = conservedBio(w);
    for (const [k, v] of Object.entries(c)) if (k.startsWith('bio:')) expect(Math.abs(v), k).toBeLessThan(1e-6 * Math.max(1, Math.abs(w.bio.initial[k.slice(4)] ?? 1)));
  });

  it('obtiene nota alta con ítems de criterio docente pendientes', () => {
    const ev = evaluateB04(w, nb);
    const bad = ev.components.flatMap((c) => c.items.filter((i) => i.ok === false).map((i) => `${i.key} → ${i.feedbackKey}`));
    expect(bad).toEqual([]);
    expect(ev.total).toBeGreaterThan(0.85);
  });
});
