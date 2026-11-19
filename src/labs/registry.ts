/**
 * Registro único de laboratorios: la lista de ids, su área y su orden (el número de la tarjeta es la posición + 1).
 * Es código puro (sin React ni Three): lo comparten el Worker (validación de cursos y entregas), la calificación y la
 * interfaz. De aquí salen `LabId`, `LAB_IDS`, las rutas `#id`, el área de cada tarjeta, las claves de título
 * (`menu.labs.<id>.title`) y el patrón de los id de intento.
 *
 * Para sumar un laboratorio: una línea aquí, su entrada en `src/app/labModules.tsx` (pantalla, store e intento
 * guardado) y su adaptador en `ADAPTERS` de `src/practices/grading.ts`. TypeScript señala lo que falte. La base no
 * necesita migración: `course_labs.lab_id` ya no tiene una lista fija.
 */
export type Subject = 'chemistry' | 'biology' | 'physics';

/** Orden de presentación de las áreas. */
export const SUBJECTS: Subject[] = ['chemistry', 'biology', 'physics'];

export const LABS = [
  { id: 'p01', subject: 'chemistry' },
  { id: 'p2', subject: 'chemistry' },
  { id: 'p3', subject: 'chemistry' },
  { id: 'p4', subject: 'chemistry' },
  { id: 'p5', subject: 'chemistry' },
  { id: 'p6', subject: 'chemistry' },
  { id: 'p7', subject: 'chemistry' },
  { id: 'p8', subject: 'chemistry' },
  { id: 'p9', subject: 'chemistry' },
  { id: 'p10', subject: 'chemistry' },
  { id: 'b01', subject: 'biology' },
  { id: 'b02', subject: 'biology' },
  { id: 'b03', subject: 'biology' },
  { id: 'b04', subject: 'biology' },
  { id: 'b05', subject: 'biology' },
  { id: 'b06', subject: 'biology' },
  { id: 'b07', subject: 'biology' },
  { id: 'b08', subject: 'biology' },
  { id: 'b09', subject: 'biology' },
  { id: 'b10', subject: 'biology' },
  { id: 'f101', subject: 'physics' },
  { id: 'f102', subject: 'physics' },
  { id: 'f103', subject: 'physics' },
  { id: 'f04', subject: 'physics' },
  { id: 'f05', subject: 'physics' },
  { id: 'f06', subject: 'physics' },
  { id: 'f07', subject: 'physics' },
  { id: 'f08', subject: 'physics' },
  { id: 'f09', subject: 'physics' },
] as const satisfies readonly { id: string; subject: Subject }[];

export type LabId = (typeof LABS)[number]['id'];

export const LAB_IDS: LabId[] = LABS.map((l) => l.id);

const ID_SET = new Set<string>(LAB_IDS);
export const isLabId = (x: unknown): x is LabId => typeof x === 'string' && ID_SET.has(x);

export const LAB_SUBJECT = Object.fromEntries(LABS.map((l) => [l.id, l.subject])) as Record<LabId, Subject>;

/** Número de la tarjeta en el menú (1…). */
export const labNumber = (id: LabId): number => LAB_IDS.indexOf(id) + 1;

/** Clave i18n del título del laboratorio. */
export const labTitleKey = (id: LabId): string => `menu.labs.${id}.title`;

/** Los id de intento empiezan por `<labId>-<semilla en base 36>-`. */
export const ATTEMPT_ID_PATTERN = new RegExp(`^(?:${LAB_IDS.join('|')})-([0-9a-z]+)-`);
