/**
 * Libreta completa y correcta a partir de las lecturas de un intento (importadas, no escritas): la usan las pruebas y
 * la demostración. No es una ayuda para el estudiante: la libreta real nunca se rellena sola.
 */
import type { F05World } from '../../simulation/f05-world/types';
import { emptyF05Notebook, type F05Notebook } from './notebook';
import { expectedAngleRow, expectedModelF5, expectedMus, expectedSlide, expectedSlopeF5, pullNormal, rdF5 } from './expected-results';
import type { RouteIdsF5 } from './route';

const fmt = (v: number, d: number) => (Number.isFinite(v) ? v.toFixed(d) : '');
const imp = (w: F05World, id: string | undefined) => ({ value: id && w.readings[id] ? String(w.readings[id].value) : '', uncertainty: '', readingId: id && w.readings[id] ? id : null });
const calc = (value: string, uncertainty = '') => ({ value, uncertainty, readingId: null });

export function fillNotebookF5(w: F05World, ids: RouteIdsF5, nb: F05Notebook = emptyF05Notebook()): F05Notebook {
  const p = w.params;
  nb.hypothesis = {
    question: '¿La fuerza de rozamiento cumple F_s ≤ μ_s N y F_k = μ_k N, y el ángulo en que el bloque arranca solo cumple tan θ_c = μ_s?',
    prediction: 'Madera sobre madera: pico ≈ 0,45 · m g, meseta ≈ 0,30 · m g, F_k proporcional a N; θ_c ≈ 24° y en la bajada a 30° a ≈ 2,4 m/s².',
  };
  const rows: Record<keyof F05Notebook['instruments'], [string, string, string]> = {
    balance: ['1', fmt(p.uB.balanceG, 2), 'verified'], loadCell: ['0.01', fmt(p.uB.forceN, 2), 'pending'], goniometer: ['0.5', fmt(p.uB.angleDeg, 2), 'verified'],
    gates: ['0.00001', fmt(p.uB.gateS, 5), 'hypothetical'], planeScale: ['0.1', fmt(p.uB.scaleCm, 3), 'verified'], thermometer: ['0.5', fmt(p.uB.tempC, 2), 'verified'],
  };
  for (const [k, [res, u, st]] of Object.entries(rows)) nb.instruments[k as keyof F05Notebook['instruments']] = { resolution: res, uncertainty: u, status: st };
  for (const k of ['blockM', 'ballastM', 'temp', 'g1', 'g2', 'slideTheta'] as const) nb.setup[k] = imp(w, ids[k]);
  nb.flagW = '1.0';
  nb.material = rdF5(w, ids.statics[0] ?? null)?.setup?.material ?? 'wood';
  ids.statics.slice(0, nb.staticRows.length).forEach((id, i) => (nb.staticRows[i] = { readingId: id || null, N: '', muS: '' }));
  ids.kinetics.slice(0, nb.kineticRows.length).forEach((id, i) => (nb.kineticRows[i] = { readingId: id || null, N: '', muK: '' }));
  ids.loads.slice(0, nb.loadRows.length).forEach((id, i) => (nb.loadRows[i] = { readingId: id || null, N: fmt(pullNormal(w, nb, rdF5(w, id || null)), 4) }));
  const em = expectedMus(w, nb);
  nb.staticRows.forEach((r, i) => {
    if (!r.readingId) return;
    r.N = fmt(em.sRows[i].N, 4);
    r.muS = fmt(em.sRows[i].muS, 4);
  });
  nb.kineticRows.forEach((r, i) => {
    if (!r.readingId) return;
    r.N = fmt(em.kRows[i].N, 4);
    r.muK = fmt(em.kRows[i].muK, 4);
  });
  ids.angles.slice(0, nb.angleRows.length).forEach((a, i) => {
    const e = expectedAngleRow(rdF5(w, a.id || null));
    nb.angleRows[i] = { readingId: a.id || null, material: e.material || a.material, muS: fmt(e.muS, 4) };
  });
  nb.slide = { readingId: ids.slide || null, v1: '', v2: '', a: '', muK: '' };
  const es = expectedSlide(w, nb);
  nb.slide.v1 = fmt(es.v1, 4);
  nb.slide.v2 = fmt(es.v2, 4);
  nb.slide.a = fmt(es.a, 4);
  nb.slide.muK = fmt(es.muK, 4);
  const sl = expectedSlopeF5(w, nb);
  const mod = expectedModelF5(w, nb);
  nb.calc.muS = calc(fmt(em.muS, 4), fmt(em.uS, 4));
  nb.calc.muK = calc(fmt(em.muK, 4), fmt(em.uK, 4));
  nb.calc.slopeMu = calc(fmt(sl.slope, 4));
  nb.calc.thetaPred = calc(fmt(mod.thetaPred, 2));
  nb.calc.thetaDisc = calc(fmt(mod.thetaDisc, 2));
  nb.calc.muKSlide = calc(fmt(mod.muKSlide, 4));
  nb.calc.Wfr = calc(fmt(mod.Wfr, 4));
  nb.mcq = 'proportional';
  nb.contrastText = 'μ_s quedó por encima de μ_k en las tres réplicas; la meseta creció en proporción a la normal (pendiente ≈ μ_k) y tan θ_c reprodujo μ_s horizontal dentro de la incertidumbre del goniómetro. El μ_k de la bajada coincide con el del tirón.';
  nb.analysis = {
    q1: 'La normal (carga sobre el bloque) y el material fueron las variables controladas; el cable paralelo, la rapidez del tirador y el bloque se mantuvieron fijos.',
    q2: 'La célula de carga fue el instrumento más sensible al montaje: sin cero, sin calibrar o inclinada respecto del cable las fuerzas se corren varios %.',
    q3: 'El mayor residual entre θ_c medido y arctan μ_s lo dejó la resolución de 0,5° del goniómetro y el paso de 0,25° del elevador.',
    q4: 'El modelo de Coulomb deja de valer si el bloque acelera, el cable oscila o tira inclinado, la superficie se raya o la lectura incluye el golpe contra el tope.',
  };
  nb.closure = 'Tablero abajo y bloqueado, bloque en la partida, lastres y tiras en su estante, tirador al inicio de su carril y cable suelto; sin incidentes.';
  return nb;
}
