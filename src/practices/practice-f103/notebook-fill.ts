/**
 * Libreta completa y correcta a partir de las lecturas de un intento (importadas, no escritas): la usan las pruebas y
 * la demostración. No es una ayuda para el estudiante: la libreta real nunca se rellena sola.
 */
import type { F103World } from '../../simulation/f103-world/types';
import { emptyF103Notebook, type F103Notebook } from './notebook';
import { expectedRanges, expectedTrajectory, expectedVelocity, expectedVelocityRow } from './expected-results';
import type { RouteIdsF3 } from './route';

const fmt = (v: number, d: number) => (Number.isFinite(v) ? v.toFixed(d) : '');
const imp = (w: F103World, id: string | undefined) => ({ value: id && w.readings[id] ? String(w.readings[id].value) : '', uncertainty: '', readingId: id && w.readings[id] ? id : null });

export function fillNotebookF3(w: F103World, ids: RouteIdsF3, nb: F103Notebook = emptyF103Notebook()): F103Notebook {
  const p = w.params;
  nb.hypothesis = { question: '¿El alcance de la esfera sigue la parábola con la v₀ medida en la boca, y cómo cambia con el ángulo y la altura?', prediction: 'El alcance es máximo cerca de 45° (algo menos con la boca elevada) y la predicción sin aire queda a pocos % del alcance medido.' };
  const rows: Record<keyof F103Notebook['instruments'], [string, string, string]> = {
    protractor: ['0.5', fmt(p.uB.protractorDeg, 3), 'hypothetical'], level: ['0.1', fmt(p.uB.levelDeg, 3), 'verified'], floorTape: ['0.1', fmt(p.uB.tapeCm, 3), 'verified'],
    heightRuler: ['0.1', fmt(p.uB.rulerCm, 3), 'verified'], gate: ['0.00001', fmt(p.uB.gateS, 5), 'hypothetical'], platform: ['0.1', fmt(p.uB.platformCm, 2), 'pending'], screen: ['0.1', fmt(p.uB.screenCm, 2), 'verified'],
  };
  for (const [k, [res, u, st]] of Object.entries(rows)) nb.instruments[k as keyof F103Notebook['instruments']] = { resolution: res, uncertainty: u, status: st };
  nb.setup.tilt = imp(w, ids.tilt);
  nb.setup.muzzleH = imp(w, ids.height);
  nb.setup.tapeZero = imp(w, ids.plumb);
  nb.setup.trajAngle = imp(w, ids.trajAngle);
  const g0 = ids.gate.map((id) => w.readings[id]).find(Boolean);
  nb.ballD = String(g0?.setup?.ballCm ?? 2.5);
  ids.gate.slice(0, nb.velocity.length).forEach((id, i) => (nb.velocity[i] = { readingId: id, v0: fmt(expectedVelocityRow(nb, w.readings[id]).v0, 3) }));
  ids.angles.slice(0, nb.angles.length).forEach((a, i) => (nb.angles[i] = { readingId: a.impact, angle: imp(w, a.angle), xPlat: imp(w, a.tape), R: '', Rpred: '', Tpred: '' }));
  ids.conditions.slice(0, nb.conditions.length).forEach((c, i) => (nb.conditions[i] = { readingId: c.impact, h: imp(w, c.height), xPlat: imp(w, c.tape), R: '', Rpred: '' }));
  ids.trajectory.slice(0, nb.trajectory.length).forEach((t, i) => (nb.trajectory[i] = { readingId: t.mark, x: imp(w, t.tape) }));
  const ev = expectedVelocity(w, nb);
  nb.calc.v0Mean = { value: fmt(ev.v0Mean, 3), uncertainty: fmt(ev.uV, 3), readingId: null };
  const er = expectedRanges(w, nb);
  er.rows.forEach((r, i) => {
    if (!nb.angles[i].readingId) return;
    nb.angles[i].R = fmt(r.R, 3);
    nb.angles[i].Rpred = fmt(r.Rpred, 3);
    nb.angles[i].Tpred = fmt(r.Tpred, 3);
  });
  er.conditions.forEach((r, i) => {
    if (!nb.conditions[i].readingId) return;
    nb.conditions[i].R = fmt(r.R, 3);
    nb.conditions[i].Rpred = fmt(r.Rpred, 3);
  });
  nb.calc.rangeErr = { value: fmt(er.rangeErr, 2), uncertainty: '', readingId: null };
  const et = expectedTrajectory(w, nb);
  nb.calc.fitC1 = { value: fmt(et.fit.c1, 4), uncertainty: '', readingId: null };
  nb.calc.fitC2 = { value: fmt(et.fit.c2, 4), uncertainty: '', readingId: null };
  nb.calc.fitV0 = { value: fmt(et.fit.v0, 3), uncertainty: '', readingId: null };
  nb.calc.vx = { value: fmt(et.vx, 3), uncertainty: '', readingId: null };
  nb.calc.vy1 = { value: fmt(et.vy1, 3), uncertainty: '', readingId: null };
  nb.calc.vy2 = { value: fmt(et.vy2, 3), uncertainty: '', readingId: null };
  nb.contrastText = 'Los alcances medidos quedaron unos pocos % por debajo de la parábola con la v₀ de la fotopuerta: el aire frena algo la esfera. El máximo cae cerca de 45° y con la boca más alta el alcance crece.';
  nb.analysis = {
    q1: 'La componente horizontal de la velocidad es casi constante; la vertical disminuye 9,8 m/s cada segundo y cambia de signo en el vértice.',
    q2: 'Con la boca elevada el ángulo de alcance máximo es menor que 45° porque la esfera sigue cayendo después de volver a la altura de salida.',
    q3: 'Los puntos de la pantalla siguen una parábola; su ajuste da una v₀ y un ángulo compatibles con los medidos directamente.',
    q4: 'El modelo ideal deja de valer con viento, con esferas livianas o grandes (arrastre), si el disparo sale del plano o si se toma un rebote como alcance.',
  };
  nb.closure = 'Resorte descargado, protector puesto, ventilador apagado y las cinco esferas en la bandeja; sin incidentes.';
  return nb;
}
