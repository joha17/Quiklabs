/**
 * Libreta completa y correcta a partir de las lecturas de un intento (importadas, no escritas): la usan las pruebas y
 * la demostración. No es una ayuda para el estudiante: la libreta real nunca se rellena sola.
 */
import type { F06World } from '../../simulation/f06-world/types';
import { emptyF06Notebook, type F06Notebook } from './notebook';
import { expectedCalcF6, expectedHeightRow, expectedLaunchRow, expectedLoss, expectedPendRow, expectedRepRow, expectedSpring, expectedSpringRow, rdF6 } from './expected-results';
import type { RouteIdsF6 } from './route';

const fmt = (v: number, d: number) => (Number.isFinite(v) ? v.toFixed(d) : '');
const imp = (w: F06World, id: string | undefined) => ({ value: id && w.readings[id] ? String(w.readings[id].value) : '', uncertainty: '', readingId: id && w.readings[id] ? id : null });
const calc = (value: string, uncertainty = '') => ({ value, uncertainty, readingId: null });

export function fillNotebookF6(w: F06World, ids: RouteIdsF6, nb: F06Notebook = emptyF06Notebook()): F06Notebook {
  const p = w.params;
  nb.hypothesis = {
    question: '¿La energía elástica ½ k x² que guarda el resorte se convierte en cinética y luego en potencial gravitatoria sin pérdidas, y el roce resta exactamente su trabajo?',
    prediction: 'Con k ≈ 100 N/m y x = 15 cm: W = ½ k x² ≈ 1,1 J; abajo v ≈ 3,3 m/s; arriba a 25 cm K₂ = K₁ − m g h ≈ 0,6 J; con el patín de 0,15 N se pierden ≈ 0,1 J.',
  };
  const rows: Record<keyof F06Notebook['instruments'], [string, string, string]> = {
    balance: ['1', fmt(p.uB.balanceG, 2), 'verified'], ruler: ['0.1', fmt(p.uB.rulerCm, 3), 'verified'], gauge: ['0.1', fmt(p.uB.gaugeCm, 3), 'verified'],
    forceSensor: ['0.05', fmt(p.uB.forceN, 2), 'pending'], posSensor: ['0.0001', fmt(p.uB.posM, 6), 'hypothetical'], gates: ['0.00001', fmt(p.uB.gateS, 5), 'hypothetical'],
    angleSensor: ['0.1', fmt(p.uB.angleDeg, 3), 'hypothetical'],
  };
  for (const [k, [res, u, st]] of Object.entries(rows)) nb.instruments[k as keyof F06Notebook['instruments']] = { resolution: res, uncertainty: u, status: st };
  nb.setup.cartM = imp(w, ids.cartM);
  nb.setup.hangerM = imp(w, ids.hangerM);
  nb.setup.slotM = imp(w, ids.slotM);
  nb.setup.pendL = imp(w, ids.pendScale);
  nb.flagW = '2.0';
  nb.bobD = '2.5';
  ids.ruler.slice(0, nb.springRows.length).forEach((id, i) => {
    nb.springRows[i] = { readingId: id || null, F: fmt(expectedSpringRow(w, nb, rdF6(w, id || null)).F, 4) };
  });
  const sp = expectedSpring(w, nb);
  ids.launches.slice(0, nb.launchRows.length).forEach((id, i) => {
    const e = expectedLaunchRow(w, nb, rdF6(w, id || null));
    nb.launchRows[i] = { readingId: id || null, W: fmt(e.W, 4), Uel: fmt(e.Uel, 4) };
  });
  ids.reps.slice(0, nb.repRows.length).forEach((id, i) => {
    const e = expectedRepRow(w, nb, rdF6(w, id || null));
    nb.repRows[i] = { readingId: id || null, v1: fmt(e.v1, 4), K1: fmt(e.K1, 4) };
  });
  ids.heights.slice(0, nb.heightRows.length).forEach((x, i) => {
    const e = expectedHeightRow(w, nb, rdF6(w, x.gates || null), rdF6(w, x.height || null));
    nb.heightRows[i] = { readingId: x.gates || null, heightId: x.height || null, v2: fmt(e.v2, 4), Ug: fmt(e.Ug, 4), K2: fmt(e.K2, 4) };
  });
  nb.loss = { readingId: ids.loss.gates || null, heightId: ids.loss.height || null, v1: '', v2: '', Wnc: '' };
  const el = expectedLoss(w, nb);
  nb.loss.v1 = fmt(el.v1, 4);
  nb.loss.v2 = fmt(el.v2, 4);
  nb.loss.Wnc = fmt(el.Wnc, 4);
  ids.pendulums.slice(0, nb.pendRows.length).forEach((id, i) => {
    const e = expectedPendRow(w, nb, rdF6(w, id || null));
    nb.pendRows[i] = { readingId: id || null, v: fmt(e.v, 4), h: fmt(e.h, 5) };
  });
  const ec = expectedCalcF6(w, nb);
  nb.calc.k = calc(fmt(sp.k, 2), fmt(sp.uk, 2));
  nb.calc.W = calc(fmt(ec.W, 4), fmt(ec.uW, 4));
  nb.calc.K1 = calc(fmt(ec.K1, 4), fmt(ec.uK1, 4));
  nb.calc.eff = calc(fmt(ec.eff, 2));
  nb.calc.Wnet = calc(fmt(ec.Wnet, 4));
  nb.calc.Pmax = calc(fmt(ec.Pmax, 2));
  nb.calc.pendDisc = calc(fmt(ec.pendDisc, 2));
  nb.mcq = 'dissipated';
  nb.contrastText = 'El área bajo F–x coincidió con ½ k x² dentro de la incertidumbre; K₁ quedó apenas por debajo (el émbolo se queda con una parte) y en cada altura K₂ + m g h reprodujo K₁. Con el patín la energía mecánica bajó en W_nc < 0.';
  nb.analysis = {
    q1: 'La compresión del resorte (energía almacenada) y la altura de la parte alta controlaron la rapidez; el carro, el resorte y las compuertas se mantuvieron fijos.',
    q2: 'El sensor de fuerza fue el más sensible a la calibración: sin cero, sin pendiente o sin sincronizar con la posición el área bajo F–x se corre varios %.',
    q3: 'El mayor residual lo dejó el émbolo del lanzador, que se queda con su energía cinética al separarse, y la rodadura del carro en el riel.',
    q4: 'Las fórmulas dejan de valer fuera del tramo lineal del resorte, con el resorte dañado, con roce o amortiguador activos, o si el carro se empuja al soltarlo.',
  };
  nb.closure = 'Carro en el lanzador sin trabar y con el freno puesto, resorte descargado, pesas y porta-pesas en el estante, esfera del péndulo quieta; sin incidentes.';
  return nb;
}
