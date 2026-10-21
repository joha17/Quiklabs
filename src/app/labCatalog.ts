/**
 * Catálogo de laboratorios por área científica: Química (`p01`…`p10`) y Biología (`b01`…). Para sumar otra práctica o Física
 * basta con asignar el área al nuevo `LabId` aquí (las tarjetas muestran la insignia, los paneles agrupan por área y el
 * filtro aparece solo cuando hay más de un área).
 */
import type { LabId } from './shell';

export type Subject = 'chemistry' | 'biology' | 'physics';

/** Orden de presentación de las áreas. */
export const SUBJECTS: Subject[] = ['chemistry', 'biology', 'physics'];

export const LAB_SUBJECT: Record<LabId, Subject> = {
  p01: 'chemistry', p2: 'chemistry', p3: 'chemistry', p4: 'chemistry', p5: 'chemistry',
  p6: 'chemistry', p7: 'chemistry', p8: 'chemistry', p9: 'chemistry', p10: 'chemistry',
  b01: 'biology',
};

export const subjectOf = (id: LabId): Subject => LAB_SUBJECT[id];
