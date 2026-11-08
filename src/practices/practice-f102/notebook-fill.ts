/**
 * Libreta completa y correcta a partir de las lecturas de un intento (importadas, no escritas): la usan las pruebas y
 * la demostración. No es una ayuda para el estudiante: la libreta real nunca se rellena sola.
 */
import type { F102World } from '../../simulation/f102-world/types';
import { emptyF102Notebook, type F102Notebook } from './notebook';
import { expectedAccel, expectedAccelRow, expectedDrag, expectedFall, expectedPrediction, expectedUniform } from './expected-results';

/** Lecturas que la ruta tomó, por cuadro de la libreta. */
export interface RouteIdsF2 {
  setup: Record<string, string>;
  angle: string;
  uniform: string[];
  tape: string[];
  heights: string[];
  falls: string[];
  drag: string[];
}

const fmt = (v: number, d: number) => (Number.isFinite(v) ? v.toFixed(d) : '');
const imp = (w: F102World, id: string | undefined) => ({ value: id && w.readings[id] ? String(w.readings[id].value) : '', uncertainty: '', readingId: id && w.readings[id] ? id : null });

/** Libreta completa y correcta a partir de las lecturas del intento (importadas, no escritas). */
export function fillNotebookF2(w: F102World, ids: RouteIdsF2, nb: F102Notebook = emptyF102Notebook()): F102Notebook {
  const p = w.params;
  nb.hypothesis = { question: '¿El carro con masa colgante se mueve con aceleración constante y cuánto vale g en caída libre?', prediction: 'a cercana a m g/(M + m) y g dentro de 2 % de 9,81 m/s² para la esfera de acero.' };
  const rows: Record<keyof F102Notebook['instruments'], [string, string, string]> = {
    ruler: ['0.1', fmt(p.uB.rulerCm, 3), 'verified'], gateTimer: ['0.0001', fmt(p.uB.gateS, 5), 'hypothetical'], tapeTimer: ['0.02', fmt(p.uB.tapeCm, 3), 'hypothetical'],
    towerScale: ['0.1', fmt(p.uB.towerCm, 3), 'verified'], fallTimer: ['0.0001', fmt(p.uB.fallS, 4), 'hypothetical'], motionSensor: ['1', fmt(p.uB.motionMm, 2), 'pending'], inclinometer: ['0.1', fmt(p.uB.angleDeg, 3), 'hypothetical'],
  };
  for (const [k, [res, u, st]] of Object.entries(rows)) nb.instruments[k as keyof F102Notebook['instruments']] = { resolution: res, uncertainty: u, status: st };
  nb.setup.angle = imp(w, ids.angle);
  nb.setup.flag = imp(w, ids.setup.flag);
  nb.setup.gate1 = imp(w, ids.setup.gate1);
  nb.setup.gate2 = imp(w, ids.setup.gate2);
  ids.uniform.slice(0, nb.uniform.length).forEach((id, i) => {
    const e = expectedUniform(w, nb, w.readings[id]);
    nb.uniform[i] = { readingId: id, v1: fmt(e.v1, 4), v2: fmt(e.v2, 4), vAvg: fmt(e.vAvg, 4) };
  });
  ids.tape.slice(0, nb.accel.length).forEach((id, i) => {
    const r = w.readings[id];
    const e = expectedAccelRow(r);
    nb.accel[i] = { readingId: id, mHang: String(r.setup?.hangG ?? ''), mCart: String(r.setup?.cartG ?? ''), a: fmt(e.a, 4), ua: fmt(e.ua, 4), v0: fmt(e.v0, 4) };
  });
  ids.falls.slice(0, nb.fall.length).forEach((id, i) => {
    nb.fall[i] = { readingId: id, h: imp(w, ids.heights[i]), g: '' };
  });
  const ef = expectedFall(w, nb);
  ef.rows.forEach((r, i) => (nb.fall[i].g = fmt(r.g, 3)));
  ids.drag.slice(0, nb.drag.length).forEach((id, i) => (nb.drag[i] = { readingId: id, n: String(w.readings[id].setup?.filters ?? ''), vt: '' }));
  const ed = expectedDrag(w, nb);
  ed.rows.forEach((r, i) => (nb.drag[i].vt = fmt(r.vt, 3)));
  const ea = expectedAccel(w, nb);
  const ep = expectedPrediction(w, nb);
  nb.calc.aMean = { value: fmt(ea.aMean, 4), uncertainty: fmt(ea.uA, 4), readingId: null };
  nb.calc.aPred = { value: fmt(ep.aPred, 4), uncertainty: '', readingId: null };
  nb.calc.gMean = { value: fmt(ef.gMean, 3), uncertainty: fmt(ef.uG, 3), readingId: null };
  nb.calc.relErrG = { value: fmt(ef.relErr, 2), uncertainty: '', readingId: null };
  nb.calc.vtRatio = { value: fmt(ed.ratio, 3), uncertainty: '', readingId: null };
  nb.contrastText = 'La aceleración medida con la cinta quedó algo por debajo de m g/(M + m) por el rozamiento del carro y de la cinta; g de la esfera coincide con 9,81 dentro de su incertidumbre.';
  nb.analysis = {
    q1: 'Con el carril nivelado, v1 y v2 coinciden dentro de la incertidumbre: el movimiento entre compuertas es uniforme.',
    q2: 'La cinta muestra distancias que crecen linealmente entre puntos: la aceleración es constante mientras la masa no toca el suelo.',
    q3: 'La esfera de acero cae prácticamente libre; los filtros alcanzan una velocidad límite que crece como la raíz de la masa.',
    q4: 'El modelo deja de valer si el cordel se afloja, si la masa toca el suelo, si el carro choca o si el arrastre del aire es grande.',
  };
  nb.closure = 'Émbolo descargado, cordel y masas devueltos al soporte, electroimán apagado y esferas en la bandeja; sin incidentes.';
  return nb;
}
