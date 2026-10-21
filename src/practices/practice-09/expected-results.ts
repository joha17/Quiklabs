/**
 * Lo que la rúbrica compara en la Práctica 9 (§12): las LECTURAS propias del intento (para corregir la interpretación)
 * y la VERDAD del escenario (qué cationes contiene de verdad la incógnita de ESTE intento, nunca una respuesta fija).
 * `inferable` calcula qué podía concluirse con los datos obtenidos y los límites de detección del propio escenario.
 */
import type { P09World, Reading09 } from '../../simulation/cation-analysis-world/types';
import { REAGENT } from '../../simulation/cation-analysis-world/world';
import { CATIONS, type Cation } from './notebook';

export const reading = (w: P09World, id: string | null | undefined): Reading09 | undefined => (id ? w.readings[id] : undefined);
export const readingsOf = (w: P09World, kind: Reading09['kind']) => w.readingOrder.map((id) => w.readings[id]).filter((r) => r.kind === kind);
export const validOf = (w: P09World, kind: Reading09['kind']) => readingsOf(w, kind).filter((r) => r.valid);

/** Lecturas de emisión válidas de un frasco de origen. */
export const emissionsOf = (w: P09World, root: string) => validOf(w, 'emission').filter((r) => r.snapshot.root === root);

/** El tubo recibió directamente el reactivo indicado. */
export const dosedWith = (w: P09World, tube: string, reagent: string) => !!w.evidence[`dosed:${tube}:${reagent}`];

/** Recipiente con la muestra que pasó por las dos precipitaciones (sobrenadante final). */
export function isFinalFraction(w: P09World, id: string | null | undefined) {
  const v = id ? w.vessels[id] : undefined;
  return !!v && v.reagents.includes(REAGENT.sulfate) && v.reagents.includes(REAGENT.alkali) && v.from.includes('smp1') && !SOLID_HEAVY(v);
}
const SOLID_HEAVY = (v: P09World['vessels'][string]) => (v.solid['SrSO4(s)'] ?? 0) + (v.solid['FeOH3(s)'] ?? 0) > 2e-5;

/** Lecturas (emisión o espectro) de una fracción final de la muestra. */
export const finalFlameReadings = (w: P09World) => [...validOf(w, 'emission'), ...validOf(w, 'spectrum')].filter((r) => r.snapshot.root === 'smp1' && isFinalFraction(w, r.snapshot.source));

/** Observaciones de tubos con reactivo de la marcha (cualquier resultado: también «sin sólido»). */
export const precipitationTests = (w: P09World, reagent: string) => validOf(w, 'observation').filter((r) => dosedWith(w, r.targetId, reagent) && r.snapshot.root === 'smp1');

/** VERDAD del escenario: qué cationes contiene la incógnita del intento. */
export const truthHas = (w: P09World, c: Cation) => w.unknown.cations.includes(c);

/**
 * Lo inferible con los datos del intento (§12): Sr y Fe por un sólido del color esperado en el tubo tratado; K por la
 * emisión violeta o por sus líneas 766/770 nm en la fracción final. Sin datos pertinentes → «indeterminado».
 */
export function inferable(w: P09World): Record<Cation, 'detected' | 'notDetected' | 'indeterminate'> {
  const out = {} as Record<Cation, 'detected' | 'notDetected' | 'indeterminate'>;
  const sr = precipitationTests(w, REAGENT.sulfate);
  const fe = precipitationTests(w, REAGENT.alkali);
  out['Sr2+'] = !sr.length ? 'indeterminate' : sr.some((r) => (r.category ?? '').startsWith('white') || (r.category ?? '').includes('AndWhite')) ? 'detected' : 'notDetected';
  out['Fe3+'] = !fe.length ? 'indeterminate' : fe.some((r) => (r.category ?? '').startsWith('brown')) ? 'detected' : 'notDetected';
  const fin = finalFlameReadings(w);
  const kSeen = fin.some((r) => (r.kind === 'spectrum' && (r.lines ?? []).some((l) => Math.abs(l.nm - 766.5) < 1 && l.intensity > 0.02)) || (r.kind === 'emission' && (r.category === 'violet' || r.category === 'lilac')));
  out['K+'] = !fin.length ? 'indeterminate' : kSeen ? 'detected' : 'notDetected';
  return out;
}

export const statusOk = (w: P09World, c: Cation, status: string) => {
  const inf = inferable(w)[c];
  if (status === 'indeterminate') return inf === 'indeterminate';
  return status === inf && (status === 'detected') === truthHas(w, c);
};

export { CATIONS };
