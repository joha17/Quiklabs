/**
 * Libreta completa y correcta a partir de las lecturas de un intento (importadas, no escritas): la usan las pruebas y
 * la demostración. No es una ayuda para el estudiante: la libreta real nunca se rellena sola.
 */
import type { F04World } from '../../simulation/f04-world/types';
import { emptyF04Notebook, type F04Notebook } from './notebook';
import { expectedMassRow, expectedModel, expectedPairs, expectedRunRow, expectedRuns, expectedSlope } from './expected-results';
import type { RouteIdsF4 } from './route';

const fmt = (v: number, d: number) => (Number.isFinite(v) ? v.toFixed(d) : '');
const imp = (w: F04World, id: string | undefined) => ({ value: id && w.readings[id] ? String(w.readings[id].value) : '', uncertainty: '', readingId: id && w.readings[id] ? id : null });
const calc = (value: string, uncertainty = '') => ({ value, uncertainty, readingId: null });

export function fillNotebookF4(w: F04World, ids: RouteIdsF4, nb: F04Notebook = emptyF04Notebook()): F04Notebook {
  const p = w.params;
  nb.hypothesis = {
    question: '¿La aceleración del carro unido a la masa colgante sigue a = m_h g/(m_c + m_h), y las fuerzas de contacto entre dos carros son iguales y opuestas?',
    prediction: 'Con 450 g de carro y 50 g colgando, a ≈ 0,98 m/s² sin pérdidas (algo menos con roce e inercia de la polea) y T ≈ 0,44 N; F_PQ + F_QP ≈ 0.',
  };
  const rows: Record<keyof F04Notebook['instruments'], [string, string, string]> = {
    balance: ['1', fmt(p.uB.balanceG, 2), 'verified'], forceA: ['0.01', fmt(p.uB.forceN, 2), 'pending'], dyn: ['0.01', fmt(p.uB.forceN, 2), 'pending'],
    accel: ['0.01', fmt(p.uB.accel, 2), 'hypothetical'], gates: ['0.00001', fmt(p.uB.gateS, 5), 'hypothetical'], trackScale: ['0.1', fmt(p.uB.scaleCm, 3), 'verified'],
  };
  for (const [k, [res, u, st]] of Object.entries(rows)) nb.instruments[k as keyof F04Notebook['instruments']] = { resolution: res, uncertainty: u, status: st };
  nb.setup.cartM = imp(w, ids.cartM);
  nb.setup.hangerM = imp(w, ids.hangerM);
  nb.setup.g1 = imp(w, ids.g1);
  nb.setup.g2 = imp(w, ids.g2);
  nb.setup.aRest = imp(w, ids.aRest);
  nb.flagW = '1.0';
  ids.runs.slice(0, nb.runs.length).forEach((id, i) => {
    const e = expectedRunRow(w, nb, w.readings[id] ?? null);
    nb.runs[i] = { readingId: id || null, v1: fmt(e.v1, 4), v2: fmt(e.v2, 4), aGates: fmt(e.aGates, 4) };
  });
  ids.massRuns.slice(0, nb.massRuns.length).forEach((id, i) => {
    nb.massRuns[i] = { readingId: id || null, mh: '', aPred: '' };
    const e = expectedMassRow(w, nb, i);
    nb.massRuns[i].mh = fmt(e.mh, 4);
    nb.massRuns[i].aPred = fmt(e.aPred, 4);
  });
  ids.pairs.slice(0, nb.pairs.length).forEach((id, i) => (nb.pairs[i] = { readingId: id || null, sum: '' }));
  const ep = expectedPairs(w, nb);
  nb.pairs.forEach((r, i) => (r.sum = r.readingId ? fmt(ep.sums[i], 3) : ''));
  const ev = expectedRuns(w, nb);
  const em = expectedModel(w, nb);
  const es = expectedSlope(w, nb);
  nb.calc.aMean = calc(fmt(ev.aMean, 4), fmt(ev.uA, 4));
  nb.calc.TMean = calc(fmt(ev.TMean, 4), fmt(ev.uT, 4));
  nb.calc.aPred = calc(fmt(em.aPred, 4));
  nb.calc.Tpred = calc(fmt(em.Tpred, 4));
  nb.calc.discrepancy = calc(fmt(em.discrepancy, 2));
  nb.calc.mEff = calc(fmt(em.mEff, 4));
  nb.calc.aPredI = calc(fmt(em.aPredI, 4));
  nb.calc.slopeK = calc(fmt(es.slope, 3));
  nb.calc.mSys = calc(fmt(em.mSys, 4));
  nb.calc.sumF = calc(fmt(ep.sumF, 3));
  nb.mcq = 'accel';
  nb.contrastText = 'La aceleración medida quedó unos pocos % por debajo de m_h g/(m_c + m_h): el roce del carril y la inercia de la polea reducen la aceleración; con I/r² la predicción se acerca. La pendiente de T contra a reproduce la masa del carro.';
  nb.analysis = {
    q1: 'La masa colgante (la fuerza neta) controló la aceleración; la masa del carro y la configuración se mantuvieron fijas en las repeticiones.',
    q2: 'El sensor de fuerza fue el más sensible a la calibración: sin cero ni pendiente la tensión se corre varios %.',
    q3: 'El mayor residual lo produjo la inercia de la polea y el roce: la masa efectiva es m_c + m_h + I/r².',
    q4: 'Las fórmulas dejan de valer cuando el cordel se afloja, el portapesas toca el suelo, el carro entra al freno o el carril está inclinado.',
  };
  nb.closure = 'Portapesas y pesas en el estante, cordel suelto, freno puesto, carro retenido por el pestillo y la pareja en reposo; sin incidentes.';
  return nb;
}
