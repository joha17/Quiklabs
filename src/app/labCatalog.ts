/**
 * Catálogo de laboratorios por área científica: Química (`p01`…`p10`), Biología (`b01`…) y Física (`f101`…). El área
 * de cada laboratorio se declara en `src/labs/registry.ts` (las tarjetas muestran la insignia, los paneles agrupan por
 * área y el filtro aparece solo cuando hay más de un área).
 */
import { LAB_SUBJECT, SUBJECTS, type LabId, type Subject } from '../labs/registry';

export { LAB_SUBJECT, SUBJECTS, type Subject };

export const subjectOf = (id: LabId): Subject => LAB_SUBJECT[id];
