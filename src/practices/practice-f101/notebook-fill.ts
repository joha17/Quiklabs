/**
 * Libreta completa y correcta a partir de las lecturas de un intento (importadas, no escritas): la usan las pruebas y
 * la demostración. No es una ayuda para el estudiante: la libreta real nunca se rellena sola.
 */
import type { F101World } from '../../simulation/f101-world/types';
import { emptyF101Notebook, type Dim, type F101Notebook } from './notebook';
import { dimReadings, expectedDensity, expectedDim, expectedVectors, massReading, volumeReadings, zeroReading } from './expected-results';

const fmt = (v: number, d: number) => (Number.isFinite(v) ? v.toFixed(d) : '');

/** Libreta completa y correcta a partir de las lecturas del intento (importadas, no escritas). */
export function fillNotebook(w: F101World, ids: Record<string, string>, nb: F101Notebook = emptyF101Notebook()): F101Notebook {
  const imp = (id: string | undefined) => ({ value: id && w.readings[id] ? String(w.readings[id].value) : '', uncertainty: '', readingId: id && w.readings[id] ? id : null });
  nb.hypothesis = { question: '¿Coincide la densidad geométrica del cilindro con la del material y cierra el polígono de fuerzas?', prediction: 'Densidad cercana a 2,70 g/cm³ y resultante de las tres fuerzas menor que 0,05 N.' };
  const p = w.params;
  const rows: Record<string, [string, string, string]> = {
    caliper: [String(p.caliper.resolutionMm), fmt(p.uB.caliperMm, 4), 'hypothetical'], micrometer: [String(p.micrometer.resolutionMm), fmt(p.uB.micrometerMm, 4), 'hypothetical'],
    ruler: ['1', fmt(p.uB.rulerMm, 2), 'hypothetical'], balance: ['0.01', '0.01', 'hypothetical'], gradCyl: ['1', fmt(p.uB.gradCylMl, 2), 'hypothetical'],
    dynamometer: ['0.1', fmt(p.uB.dynamometerN, 3), 'hypothetical'], angle: ['1', fmt(p.uB.angleDeg, 2), 'hypothetical'],
  };
  for (const [k, [res, u, st]] of Object.entries(rows)) nb.instruments[k as keyof F101Notebook['instruments']] = { resolution: res, uncertainty: u, status: st };
  nb.zeros.caliper = imp(ids.calZero ?? zeroReading(w, 'caliper01')?.id);
  nb.zeros.micrometer = imp(ids.microZero ?? zeroReading(w, 'micrometer01')?.id);
  nb.zeros.standard = imp(ids.standard);
  for (const d of ['cylD', 'cylH', 'ballD'] as Dim[]) {
    const rs = dimReadings(w, d).slice(-3);
    nb.dims[d] = rs.map((r) => imp(r.id));
    while (nb.dims[d].length < 3) nb.dims[d].push({ value: '', uncertainty: '', readingId: null });
    const e = expectedDim(w, nb, d);
    nb.means[d] = { value: fmt(e.mean, 3), uncertainty: fmt(e.u, 4), readingId: null };
  }
  nb.masses.cyl = imp(ids.mCyl ?? massReading(w, 'metalCyl01')?.id);
  nb.masses.ball = imp(ids.mBall ?? massReading(w, 'steelBall01')?.id);
  const vols = volumeReadings(w);
  nb.volumes.initial = imp(ids.v0 ?? vols.initial?.id);
  nb.volumes.final = imp(ids.v1 ?? vols.final?.id);
  const ed = expectedDensity(w, nb);
  nb.calc.volGeom = { value: fmt(ed.V, 4), uncertainty: fmt(ed.uV, 4), readingId: null };
  nb.calc.volDisp = { value: fmt(ed.vDisp, 1), uncertainty: fmt(Math.SQRT2 * p.uB.gradCylMl, 2), readingId: null };
  nb.calc.rho = { value: fmt(ed.rho, 4), uncertainty: fmt(ed.urho, 4), readingId: null };
  nb.calc.rhoSI = { value: fmt(ed.rhoSI, 1), uncertainty: fmt(ed.urho * 1000, 1), readingId: null };
  nb.calc.relErr = { value: fmt(ed.relErr, 2), uncertainty: '', readingId: null };
  const q = ids.eq ? w.readings[ids.eq] : null;
  nb.equilibriumId = q?.id ?? null;
  (q?.forces ?? []).slice(0, 3).forEach((f, i) => {
    nb.vectors[i].mass = { value: f.massG !== undefined ? String(f.massG) : `${f.readN} N`, uncertainty: '', readingId: q!.id };
    nb.vectors[i].angle = { value: String(f.angleRead), uncertainty: '', readingId: q!.id };
  });
  const ev = expectedVectors(w, nb);
  ev.forces.forEach((f, i) => {
    nb.vectors[i].F = fmt(f.F, 4);
    nb.vectors[i].Fx = fmt(f.x, 4);
    nb.vectors[i].Fy = fmt(f.y, 4);
  });
  nb.vec = {
    Rx: fmt(ev.R.x, 4), Ry: fmt(ev.R.y, 4), R: fmt(ev.Rmag, 4), thetaR: fmt(ev.thetaR, 1), equilibrant: fmt(ev.equilibrant, 1), residual: fmt(ev.residual, 4),
    dot12: fmt(ev.dot12, 4), cross12: fmt(ev.cross12, 4), unitX: fmt(ev.unitX, 4), unitY: fmt(ev.unitY, 4),
  };
  nb.contrastId = ids.sensor ?? null;
  nb.contrastText = 'El sensor del perno midió la resultante de F1 y F2 al retirar F3; coincide con la suma de componentes dentro de la incertidumbre angular.';
  nb.analysis = {
    q1: 'El diámetro del cilindro controló la incertidumbre del volumen porque entra al cuadrado en la fórmula del volumen.',
    q2: 'La lectura más sensible a la calibración fue la del sensor 2D: sin calibrar multiplicaba las fuerzas por 1,06.',
    q3: 'El mayor residual del polígono vino de la fricción de las poleas y de la lectura del ángulo con división de un grado.',
    q4: 'Las fórmulas dejan de valer si el hilo roza el borde, si el anillo toca el perno o si las piezas se deforman al medirlas.',
  };
  nb.closure = 'Portapesas y masas devueltos al soporte, perno colocado, probeta y mesada secas, balanza apagada; sin incidentes.';
  return nb;
}
