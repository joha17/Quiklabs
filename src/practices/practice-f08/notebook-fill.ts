/**
 * Libreta completa y correcta a partir de las lecturas de un intento (importadas, no escritas): la usan las pruebas y
 * la demostración. No es una ayuda para el estudiante: la libreta real nunca se rellena sola.
 */
import type { F08World } from '../../simulation/f08-world/types';
import { emptyF08Notebook, type F08Notebook, type RunRow } from './notebook';
import { expectedCalcF8, expectedEnergyF8, expectedRunF8, expectedTensionF8, rdF8 } from './expected-results';
import type { RouteIdsF8 } from './route';

const fmt = (v: number, d: number) => (Number.isFinite(v) ? v.toPrecision(d) : '');
const imp = (w: F08World, id: string | undefined) => ({ value: id && w.readings[id] ? String(w.readings[id].value) : '', uncertainty: '', readingId: id && w.readings[id] ? id : null });
const calc = (value: string, uncertainty = '') => ({ value, uncertainty, readingId: null });

function runRowFrom(w: F08World, nb: F08Notebook, id: string | undefined): RunRow {
  const e = expectedRunF8(w, nb, rdF8(w, id || null));
  return { readingId: id || null, alpha: fmt(e.alpha, 6), alphaC: fmt(e.alphaC, 5), T: fmt(e.T, 6), I: fmt(e.I, 6) };
}

export function fillNotebookF8(w: F08World, ids: RouteIdsF8, nb: F08Notebook = emptyF08Notebook()): F08Notebook {
  const p = w.params;
  nb.hypothesis = {
    question: '¿Cómo depende la aceleración angular de un rotor del momento de inercia del cuerpo montado y de cómo se distribuye su masa respecto del eje?',
    prediction: 'Con M = 0,50 kg y R = 0,10 m, I_disco = ½ M R² = 0,0025 kg·m² y el aro el doble; con 50 g en un tambor de 2 cm α ≈ 2,4 rad/s² con el disco. Alejar las masas corredizas aumenta I en 2 m Δ(r²).',
  };
  const rows: Record<keyof F08Notebook['instruments'], [string, string, string]> = {
    balance: ['1', p.uB.balanceG.toFixed(2), 'verified'], caliper: ['0.01', p.uB.caliperCm.toFixed(4), 'verified'], protractor: ['1', p.uB.protractorDeg.toFixed(2), 'verified'],
    encoder: ['0.1', p.uB.encoderDeg.toFixed(3), 'pending'], tension: ['0.001', p.uB.tensionN.toFixed(3), 'pending'], tach: ['0.1', p.uB.tachRpm.toFixed(1), 'hypothetical'],
    gate: ['0.00001', p.uB.gateS.toFixed(5), 'hypothetical'], ruler: ['0.1', p.uB.rulerCm.toFixed(3), 'verified'],
  };
  for (const [k, [res, u, st]] of Object.entries(rows)) nb.instruments[k as keyof F08Notebook['instruments']] = { resolution: res, uncertainty: u, status: st };
  nb.setup.mDisc = imp(w, ids.mDisc);
  nb.setup.dDisc = imp(w, ids.dDisc);
  nb.setup.mRing = imp(w, ids.mRing);
  nb.setup.dRing = imp(w, ids.dRing);
  nb.setup.mDrop = imp(w, ids.mDrop);
  nb.setup.dDrum = imp(w, ids.dDrum);
  nb.setup.wFlag = imp(w, ids.wFlag);
  nb.setup.dHole = imp(w, ids.dHole);
  nb.setup.mSlide = imp(w, ids.mSlide);
  nb.axle = runRowFrom(w, nb, ids.axle);
  ids.disks.slice(0, nb.diskRows.length).forEach((id, i) => (nb.diskRows[i] = runRowFrom(w, nb, id)));
  nb.ring = runRowFrom(w, nb, ids.ring);
  ids.masses.slice(0, nb.massRows.length).forEach((id, i) => (nb.massRows[i] = { ...runRowFrom(w, nb, id), rId: ids.radii[i] || null }));
  nb.parallel = { ...runRowFrom(w, nb, ids.parallel), Ipar: '', Ipred: '' };
  const ec = expectedCalcF8(w, nb);
  nb.parallel.Ipar = fmt(ec.IparMeas, 6);
  nb.parallel.Ipred = fmt(ec.IparPred, 6);
  nb.tension = { readingId: ids.tension || null, encId: ids.disks[0] || null, T: '', Tmodel: '', diff: '' };
  const te = expectedTensionF8(w, nb);
  nb.tension.T = fmt(te.T, 5);
  nb.tension.Tmodel = fmt(te.Tmodel, 5);
  nb.tension.diff = fmt(te.diff, 3);
  nb.energy = { readingId: ids.gate || null, tachId: ids.tach || null, h: '', v: '', omega: '', K: '', U: '', bal: '' };
  const en = expectedEnergyF8(w, nb);
  nb.energy.h = fmt(en.h, 5);
  nb.energy.v = fmt(en.v, 5);
  nb.energy.omega = fmt(en.omega, 5);
  nb.energy.K = fmt(en.K, 5);
  nb.energy.U = fmt(en.U, 5);
  nb.energy.bal = fmt(en.bal, 4);
  const ec2 = expectedCalcF8(w, nb);
  nb.calc.Ebal = calc(fmt(ec2.Ebal, 4));
  nb.calc.Ipred = calc(fmt(ec.Ipred, 5));
  nb.calc.Idisk = calc(fmt(ec.Idisk, 5), fmt(ec.uIdisk, 2));
  nb.calc.Iring = calc(fmt(ec.Iring, 5), fmt(ec.uIring, 2));
  nb.calc.ratio = calc(fmt(ec.ratio, 4));
  nb.calc.parDisc = calc(fmt(ec.parDisc, 3));
  nb.calc.slope = calc(fmt(ec.slope, 4), fmt(ec.uSlope, 2));
  nb.mcq = 'farther';
  nb.contrastText = 'El I del disco medido (restando el eje y corrigiendo el roce con el tramo libre) coincidió con ½ M R² dentro de su incertidumbre; el aro dio casi el doble con la misma masa, el disco desplazado siguió el teorema de Steiner y la pendiente I vs r² fue cercana a 2 m.';
  nb.analysis = {
    q1: 'La distribución de la masa respecto del eje controló α: con el mismo torque, el aro y las masas alejadas giraron más lento; la masa de caída, el radio del tambor y la altura se mantuvieron.',
    q2: 'El encoder fue lo más sensible: sin calibrar las cuentas por vuelta los ángulos salen multiplicados por 400/360 y con el sentido invertido c cambia de signo.',
    q3: 'El mayor residual lo dejó el roce de los rodamientos: sin la corrección con la desaceleración libre I sale varios por ciento mayor.',
    q4: 'τ = I α deja de valer como eje fijo si el soporte se corre, una masa se desliza, el sólido está excéntrico o desbalanceado, o alguien toca el eje durante el ensayo.',
  };
  nb.closure = 'Rotor frenado y quieto, masa de caída en el estante, sólidos en la bandeja, guarda cerrada y sensores sin carga; sin incidentes.';
  return nb;
}
