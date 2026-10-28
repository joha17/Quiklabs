import { describe, expect, it } from 'vitest';
import { LAB_IDS } from '../../../worker/core/types';
import { GRADED_LABS } from '../../practices/grading';
import { isLab, ROUTES } from '../../app/shell';

describe('rutas de la aplicación', () => {
  it('cada laboratorio del servidor y de la calificación abre por su enlace (#id)', () => {
    for (const id of new Set([...LAB_IDS, ...GRADED_LABS])) {
      expect(ROUTES, id).toContain(id);
      expect(isLab(id), id).toBe(true);
    }
  });
});
