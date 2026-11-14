/**
 * Libreta completa y correcta a partir de las lecturas de un intento (importadas, no escritas): la usan las pruebas y
 * la demostración. No es una ayuda para el estudiante: la libreta real nunca se rellena sola.
 */
import type { F07World } from '../../simulation/f07-world/types';
import { emptyF07Notebook, type F07Notebook } from './notebook';
import { expectedCalcF7, expectedCm, expectedElasticRow, expectedImpulse, expectedStick, rdF7 } from './expected-results';
import type { RouteIdsF7 } from './route';

const fmt = (v: number, d: number) => (Number.isFinite(v) ? v.toFixed(d) : '');
const imp = (w: F07World, id: string | undefined) => ({ value: id && w.readings[id] ? String(w.readings[id].value) : '', uncertainty: '', readingId: id && w.readings[id] ? id : null });
const calc = (value: string, uncertainty = '') => ({ value, uncertainty, readingId: null });

export function fillNotebookF7(w: F07World, ids: RouteIdsF7, nb: F07Notebook = emptyF07Notebook()): F07Notebook {
  const p = w.params;
  nb.hypothesis = {
    question: '¿Se conserva el momento lineal total en un choque entre dos carros sobre un riel nivelado, sea elástico o con velcro, y el impulso que mide el sensor coincide con Δp de cada carro?',
    prediction: 'Con m₁ = 0,20 kg a 1,00 m/s contra m₂ = 0,30 kg quieto: elástico v₁ ≈ −0,20 m/s y v₂ ≈ 0,80 m/s, J₁ ≈ −0,24 N·s; con velcro v_f ≈ 0,40 m/s y se pierde ≈ 60 % de la energía cinética.',
  };
  const rows: Record<keyof F07Notebook['instruments'], [string, string, string]> = {
    balance: ['1', fmt(p.uB.balanceG, 2), 'verified'], caliper: ['0.01', fmt(p.uB.caliperCm, 4), 'verified'], level: ['0.05', fmt(p.uB.levelDeg, 3), 'verified'],
    gates: ['0.00001', fmt(p.uB.gateS, 5), 'hypothetical'], forceSensor: ['0.05', fmt(p.uB.forceN, 2), 'pending'], camera: ['0.001', fmt(p.uB.cameraMs, 3), 'hypothetical'],
    ruler: ['0.1', fmt(p.uB.rulerCm, 3), 'verified'],
  };
  for (const [k, [res, u, st]] of Object.entries(rows)) nb.instruments[k as keyof F07Notebook['instruments']] = { resolution: res, uncertainty: u, status: st };
  nb.setup.mA = imp(w, ids.mA);
  nb.setup.mB = imp(w, ids.mB);
  nb.setup.flagA = imp(w, ids.flagA);
  nb.setup.flagB = imp(w, ids.flagB);
  nb.setup.tilt = imp(w, ids.level);
  ids.elastic.slice(0, nb.elasticRows.length).forEach((id, i) => {
    const e = expectedElasticRow(w, nb, rdF7(w, id || null));
    nb.elasticRows[i] = { readingId: id || null, v1i: fmt(e.v1i, 4), v1f: fmt(e.v1f, 4), v2i: fmt(e.v2i, 4), v2f: fmt(e.v2f, 4), dp: fmt(e.dp, 5), e: fmt(e.e, 4) };
  });
  nb.stick = { readingId: ids.stick || null, v1i: '', vf: '', Klost: '' };
  const st = expectedStick(w, nb);
  nb.stick.v1i = fmt(st.v1i, 4);
  nb.stick.vf = fmt(st.vf, 4);
  nb.stick.Klost = fmt(st.Klost, 2);
  nb.impulse = { forceId: ids.forces[0] || null, readingId: ids.elastic[0] || null, J1: '', dp1: '', Fmax: '' };
  const im = expectedImpulse(w, nb);
  nb.impulse.J1 = fmt(im.J1, 5);
  nb.impulse.dp1 = fmt(im.dp1, 5);
  nb.impulse.Fmax = fmt(im.Fmax, 2);
  nb.cm = { readingId: ids.cm || null, mA: imp(w, ids.mA), mB: imp(w, ids.cmMassB), vBefore: '', vAfter: '' };
  const cm = expectedCm(w, nb);
  nb.cm.vBefore = fmt(cm.vBefore, 4);
  nb.cm.vAfter = fmt(cm.vAfter, 4);
  const ec = expectedCalcF7(w, nb);
  nb.calc.dp = calc(fmt(ec.dp, 5), fmt(ec.udp, 5));
  nb.calc.e = calc(fmt(ec.e, 4), fmt(ec.ue, 4));
  nb.calc.J = calc(fmt(ec.J, 5), fmt(ec.uJ, 5));
  nb.calc.Klost = calc(fmt(ec.Klost, 2));
  nb.calc.vcm = calc(fmt(ec.vcm, 4));
  nb.calc.impDisc = calc(fmt(ec.impDisc, 2));
  nb.mcq = 'lost';
  nb.contrastText = 'En los tres choques elásticos Δp quedó dentro de su incertidumbre y e ≈ 1; con velcro Σp también se conservó pero se perdió cerca del 60 % de la energía cinética. El área bajo F–t coincidió con Δp₁ y v_CM no cambió en el choque.';
  nb.analysis = {
    q1: 'Las masas de los carros y el tipo de paragolpes controlaron las velocidades finales; el riel nivelado, los topes y las fotopuertas se mantuvieron fijos.',
    q2: 'Las fotopuertas con el ancho de bandera medido fueron lo más sensible: una bandera distinta o girada escala la velocidad de un carro y rompe la conservación aparente.',
    q3: 'El mayor residual lo dejaron la rodadura de las ruedas y la pequeña inclinación remanente del riel, que dan un impulso externo durante el recorrido.',
    q4: 'La conservación de Σp deja de valer con el riel inclinado, un freno puesto, la mano empujando, un choque oblicuo que roza las pestañas o un carro que llega al tope.',
  };
  nb.closure = 'Carros quietos y separados con los frenos puestos, lanzadores destrabados, pesas en el estante, sensores desconectables sin carga; sin incidentes.';
  return nb;
}
