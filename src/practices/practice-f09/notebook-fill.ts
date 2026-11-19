/**
 * Libreta completa y correcta a partir de las lecturas de un intento (importadas, no escritas): la usan las pruebas y
 * la demostración. No es una ayuda para el estudiante: la libreta real nunca se rellena sola.
 */
import type { F09World } from '../../simulation/f09-world/types';
import { emptyF09Notebook, type F09Notebook } from './notebook';
import { expectedCalcF9, expectedCircF9, expectedMomentumF9, expectedTorqueF9 } from './expected-results';
import type { RouteIdsF9 } from './route';

const fmt = (v: number, d: number) => (Number.isFinite(v) ? v.toPrecision(d) : '');
const imp = (w: F09World, id: string | undefined) => ({ value: id && w.readings[id] ? String(w.readings[id].value) : '', uncertainty: '', readingId: id && w.readings[id] ? id : null });
const calc = (value: string, uncertainty = '') => ({ value, uncertainty, readingId: null });
const idOr = (w: F09World, id: string | undefined) => (id && w.readings[id] ? id : null);

export function fillNotebookF9(w: F09World, ids: RouteIdsF9, nb: F09Notebook = emptyF09Notebook()): F09Notebook {
  const p = w.params;
  nb.hypothesis = {
    question: '¿Cómo depende la fuerza centrípeta de la velocidad angular, cómo responde la mesa a un torque y qué pasa con ω cuando las masas se acercan al eje sin torque externo?',
    prediction: 'Con m = 0,200 kg a r = 0,20 m y T = 2,0 s, F_c = 4π² m r / T² ≈ 0,39 N y crece con ω². Con τ = 0,40 N·m sobre I ≈ 0,03 kg·m², α ≈ 13 rad/s². Al recoger las masas de 25 a 6 cm, I baja a la mitad y ω casi se duplica con L constante.',
  };
  const rows: Record<keyof F09Notebook['instruments'], [string, string, string]> = {
    balance: ['0.1', p.uB.balanceG.toFixed(3), 'verified'], ruler: ['0.1', p.uB.rulerCm.toFixed(3), 'verified'], force: ['0.005', p.uB.forceN.toFixed(3), 'pending'],
    gate: ['0.0001', p.uB.gateS.toFixed(5), 'hypothetical'], encoder: ['0.001', p.uB.encoderRad.toFixed(5), 'pending'], dyn: ['0.05', p.uB.dynN.toFixed(3), 'pending'],
  };
  for (const [k, [res, u, st]] of Object.entries(rows)) nb.instruments[k as keyof F09Notebook['instruments']] = { resolution: res, uncertainty: u, status: st };
  nb.setup.mOrb = imp(w, ids.mOrb);
  nb.setup.mSlide = imp(w, ids.mSlide);
  nb.setup.rOrb = imp(w, ids.rOrb);
  nb.setup.rArm1 = imp(w, ids.rArm1);
  nb.setup.rArm2 = imp(w, ids.rArm2);
  nb.setup.rSlideC = imp(w, ids.rSlideC);
  nb.circRows = nb.circRows.map((row, i) => {
    const r = { ...row, forceId: idOr(w, ids.forces[i]), periodId: idOr(w, ids.periods[i]) };
    const e = expectedCircF9(w, nb, r);
    return { ...r, T: fmt(e.T, 6), omega: fmt(e.omega, 6), v: fmt(e.v, 5), Fpred: fmt(e.Fpred, 5), diff: fmt(e.diff, 3) };
  });
  nb.torqueRows = nb.torqueRows.map((row, i) => {
    const r = { ...row, dynId: idOr(w, ids.dyns[i]), encId: idOr(w, ids.encs[i]) };
    const e = expectedTorqueF9(w, nb, r, i);
    return { ...r, tau: fmt(e.tau, 5), alpha: fmt(e.alpha, 6), alphaC: fmt(e.alphaC, 4), I: fmt(e.I, 5) };
  });
  nb.momentum = { ...nb.momentum, w1Id: idOr(w, ids.w1), w2Id: idOr(w, ids.w2), r1Id: idOr(w, ids.r1), r2Id: idOr(w, ids.r2) };
  const ec = expectedCalcF9(w, nb);
  nb.calc.mr = calc(fmt(ec.mr, 4), fmt(ec.uMr, 2));
  nb.calc.mrPred = calc(fmt(ec.mrPred, 4));
  nb.calc.Itorque = calc(fmt(ec.Itorque, 5), fmt(ec.uI, 2));
  nb.calc.I0 = calc(fmt(ec.I0, 5));
  const mo = expectedMomentumF9(w, nb, ec.I0);
  nb.momentum = { ...nb.momentum, I1: fmt(mo.I1, 5), I2: fmt(mo.I2, 5), L1: fmt(mo.L1, 5), L2: fmt(mo.L2, 5), dL: fmt(mo.dL, 3), K1: fmt(mo.K1, 5), K2: fmt(mo.K2, 5) };
  nb.calc.Lratio = calc(fmt(mo.L2 / mo.L1, 4));
  nb.calc.Kratio = calc(fmt(mo.K2 / mo.K1, 4));
  nb.calc.tauFc = calc('0');
  nb.mcq = 'direction';
  nb.contrastText = 'La pendiente de F frente a ω² coincidió con m r dentro de su incertidumbre; los dos tirones dieron el mismo I con τ = r F y la corrección del tramo libre; al recoger las masas L se mantuvo casi constante (pérdida de un par de por ciento por el roce del eje) mientras la energía cinética creció por el trabajo del cordón.';
  nb.analysis = {
    q1: 'La velocidad angular controló la fuerza centrípeta (F ∝ ω² con m y r fijos); en el torque, el brazo de palanca con la misma fuerza; en la conservación, el radio de las masas.',
    q2: 'El sensor de fuerza fue lo más sensible: sin cero cada lectura arrastra el corrimiento y un salto brusco de consigna lo descalibra; el encoder sin calibrar multiplica ω por 400/360.',
    q3: 'El mayor residual lo dejó el roce del eje: sin la desaceleración libre I sale mayor y L baja un poco entre ω₁ y ω₂.',
    q4: 'F_c = m ω² r deja de valer si la mesa acelera, el cordón tiene holgura o la masa no está en su tope; L = I ω no se conserva con el motor acoplado, el freno puesto o el eje inclinado.',
  };
  nb.closure = 'Mesa frenada y quieta, motor en cero y desacoplado, cordón del tambor suelto, masas radiales bloqueadas, masa orbitante en el estante y guarda cerrada; sin incidentes.';
  return nb;
}
