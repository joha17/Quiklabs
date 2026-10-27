/** Catálogo por área: cada laboratorio tiene un área conocida y con texto; Química p01…p10 y Biología b01…. */
import { describe, expect, it } from 'vitest';
import { LAB_SUBJECT, SUBJECTS } from '../../app/labCatalog';
import menu from '../../locales/es/practice3.json';

describe('catálogo de laboratorios por área', () => {
  it('cada laboratorio tiene un área válida con nombre en el menú', () => {
    for (const [id, sub] of Object.entries(LAB_SUBJECT)) {
      expect(SUBJECTS, id).toContain(sub);
      expect((menu.menu.subject as Record<string, string>)[sub], sub).toBeTruthy();
    }
    for (const [id, sub] of Object.entries(LAB_SUBJECT)) expect(sub, id).toBe(id.startsWith('b') ? 'biology' : 'chemistry');
    expect(Object.keys(LAB_SUBJECT).filter((id) => id.startsWith('p'))).toHaveLength(10);
    expect(LAB_SUBJECT.b01).toBe('biology');
    expect(LAB_SUBJECT.b02).toBe('biology');
  });
});
