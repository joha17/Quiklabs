/**
 * Libreta completa y correcta a partir de las lecturas de un intento (importadas, no escritas): la usan las pruebas y
 * la demostración. No es una ayuda para el estudiante: la libreta real nunca se rellena sola.
 */
import type { F12World } from '../../simulation/f12-world/types';
import { emptyF12Notebook, type F12Notebook } from './notebook';
import { expectedCalcF12, expectedFlowRowF12, expectedLossRowF12 } from './expected-results';
import type { RouteIdsF12 } from './route';

const fmt = (v: number, d: number) => (Number.isFinite(v) ? v.toPrecision(d) : '');
const imp = (w: F12World, id: string | undefined) => ({ value: id && w.readings[id] ? String(w.readings[id].value) : '', uncertainty: '', readingId: id && w.readings[id] ? id : null });
const calc = (value: string, uncertainty = '') => ({ value, uncertainty, readingId: null });
const idOr = (w: F12World, id: string | undefined) => (id && w.readings[id] ? id : null);

export function fillNotebookF12(w: F12World, ids: RouteIdsF12, nb: F12Notebook = emptyF12Notebook()): F12Notebook {
  const p = w.params;
  nb.hypothesis = {
    question: '¿Cómo cambia la presión entre la entrada y la garganta del Venturi cuando cambia el caudal, se conserva el caudal entre secciones y cuánto pierde el tramo rugoso?',
    prediction: 'Con D1 = 4 cm y D2 = 2 cm la velocidad en la garganta es 4 veces la de la entrada; para 1 L/s, v1 ≈ 0,80 m/s, v2 ≈ 3,18 m/s y Δp12 ≈ 4,8 kPa, que crece con Q². El caudal volumétrico coincide con el del caudalímetro y el tramo rugoso agrega una pérdida ½ρKv² con K constante.',
  };
  const rows: Record<keyof F12Notebook['instruments'], [string, string, string]> = {
    sensor: [String(p.sensor.resolutions[1]), p.uB.sensorKPa.toFixed(3), 'pending'], meter: [String(p.meter.resLs), p.uB.meterLs.toFixed(3), 'pending'],
    caliper: [String(p.caliperResCm), p.uB.caliperCm.toFixed(4), 'verified'], beaker: [String(p.beaker.resML), p.uB.beakerML.toFixed(1), 'verified'],
    timer: [String(p.timerResS), p.uB.timerS.toFixed(2), 'verified'], ruler: [String(p.rulerResCm), p.uB.rulerCm.toFixed(3), 'verified'],
  };
  for (const [k, [res, u, st]] of Object.entries(rows)) nb.instruments[k as keyof F12Notebook['instruments']] = { resolution: res, uncertainty: u, status: st };
  for (const k of ['D1', 'D2', 'z1', 'z3', 'V', 't', 'Qm'] as const) nb.setup[k] = imp(w, ids[k]);
  nb.flowRows = nb.flowRows.map((row, i) => {
    const ps = ids.p[i] ?? [];
    const r = { ...row, qId: idOr(w, ids.q[i]), p1Id: idOr(w, ps[0]), p2Id: idOr(w, ps[1]), p3Id: idOr(w, ps[2]) };
    const e = expectedFlowRowF12(w, nb, r);
    return { ...r, v1: fmt(e.v1, 6), v2: fmt(e.v2, 6), dp12: fmt(e.dp12, 6), dp12Pred: fmt(e.dp12Pred, 6) };
  });
  nb.lossRows = nb.lossRows.map((row, i) => {
    const ps = ids.lp[i] ?? [];
    const r = { ...row, qId: idOr(w, ids.lq[i]), p1Id: idOr(w, ps[0]), p3Id: idOr(w, ps[2]) };
    const e = expectedLossRowF12(w, nb, r);
    return { ...r, v1: fmt(e.v1, 6), dp13: fmt(e.dp13, 6), K: fmt(e.K, 5), P: fmt(e.P, 5) };
  });
  const c = expectedCalcF12(w, nb);
  nb.calc.Qvol = calc(fmt(c.Qvol, 5), fmt(c.uQvol, 2));
  nb.calc.QDev = calc(fmt(c.QDev, 3));
  nb.calc.rhoFit = calc(fmt(c.rhoFit, 6), fmt(c.uRho, 2));
  nb.calc.K = calc(fmt(c.K, 5), fmt(c.uK, 2));
  nb.mcq = 'no_compressible';
  nb.contrastText = 'Δp12 creció con el cuadrado del caudal y el ajuste por el origen frente a ½(v₂² − v₁²) dio una pendiente cercana a la densidad del agua; lo que sobra se explica por las pérdidas de los conos. El caudal volumétrico coincidió con el caudalímetro dentro de la incertidumbre del cronometraje. Con el tramo rugoso apareció una caída adicional entre las tomas 1 y 3 con K casi constante.';
  nb.analysis = {
    q1: 'El caudal controló todo: al subir la velocidad de la bomba crecieron v1, v2 y la caída de presión en la garganta, como pide la continuidad A1v1 = A2v2.',
    q2: 'La presión en la garganta fue la más sensible: el aire en los tubos, el cero o una toma tapada la corren; en el caudal volumétrico, la sincronía del cronómetro con el desviador.',
    q3: 'El mayor residual vino de las pérdidas en el difusor y en los conos, que Bernoulli ideal no incluye, y del tiempo corto de la recolección.',
    q4: 'Bernoulli incompresible deja de valer para un gas a Ma > 0,3, con flujo no estacionario (bomba acelerando o válvula maniobrada) y donde las pérdidas no son despreciables.',
  };
  nb.closure = 'Bomba detenida, válvula sin maniobras bruscas, purga cerrada, vaso vacío en la mesada, tapón fuera del conducto y mesada seca; sin incidentes.';
  return nb;
}
