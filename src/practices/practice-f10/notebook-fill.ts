/**
 * Libreta completa y correcta a partir de las lecturas de un intento (importadas, no escritas): la usan las pruebas y
 * la demostración. No es una ayuda para el estudiante: la libreta real nunca se rellena sola.
 */
import type { F10World } from '../../simulation/f10-world/types';
import { emptyF10Notebook, type F10Notebook } from './notebook';
import { expectedCalcF10, expectedElF10, expectedEqF10, expectedPlasticF10 } from './expected-results';
import type { RouteIdsF10 } from './route';

const fmt = (v: number, d: number) => (Number.isFinite(v) ? v.toPrecision(d) : '');
const imp = (w: F10World, id: string | undefined) => ({ value: id && w.readings[id] ? String(w.readings[id].value) : '', uncertainty: '', readingId: id && w.readings[id] ? id : null });
const calc = (value: string, uncertainty = '') => ({ value, uncertainty, readingId: null });
const idOr = (w: F10World, id: string | undefined) => (id && w.readings[id] ? id : null);

export function fillNotebookF10(w: F10World, ids: RouteIdsF10, nb: F10Notebook = emptyF10Notebook()): F10Notebook {
  const p = w.params;
  nb.hypothesis = {
    question: '¿Cómo se reparten el peso de la viga y de una carga entre dos apoyos según dónde cuelga la carga, y cómo se alarga una barra de acero bajo tracción antes y después de la fluencia?',
    prediction: 'Con la viga de 4,9 N centrada y la carga de 4,9 N en el medio, cada apoyo lleva 4,9 N; al correr la carga hacia B, R_B crece linealmente con pendiente W₁/(x_B − x_A). En la probeta ΔL crece proporcional a F con E ≈ 200 GPa; pasada la fluencia queda un alargamiento permanente.',
  };
  const rows: Record<keyof F10Notebook['instruments'], [string, string, string]> = {
    dyn: [String(p.dyn.resN), p.uB.dynN.toFixed(3), 'pending'], cells: [String(p.cell.resN), p.uB.cellN.toFixed(4), 'pending'], tape: [String(p.tapeResCm), p.uB.tapeCm.toFixed(3), 'verified'],
    caliper: [String(p.caliperResMm), p.uB.caliperMm.toFixed(4), 'verified'], loadCell: ['1', String(p.uB.loadCellN), 'pending'], gauge: [String(p.gauge.resMm), p.uB.gaugeMm.toFixed(5), 'pending'],
  };
  for (const [k, [res, u, st]] of Object.entries(rows)) nb.instruments[k as keyof F10Notebook['instruments']] = { resolution: res, uncertainty: u, status: st };
  nb.setup.Wb = imp(w, ids.Wb);
  nb.setup.W1 = imp(w, ids.W1);
  nb.setup.xCG = imp(w, ids.xCG);
  nb.setup.xA = imp(w, ids.xA);
  nb.setup.xB = imp(w, ids.xB);
  nb.setup.d = imp(w, ids.d);
  nb.setup.L0 = imp(w, ids.L0);
  nb.eqRows = nb.eqRows.map((row, i) => {
    const r = { ...row, raId: idOr(w, ids.ra[i]), rbId: idOr(w, ids.rb[i]), xId: idOr(w, ids.x[i]) };
    const e = expectedEqF10(w, nb, r);
    return { ...r, RbPred: fmt(e.RbPred, 5), RaPred: fmt(e.RaPred, 5), sumF: fmt(e.sumF, 3), tauA: fmt(e.tauA, 3) };
  });
  nb.elRows = nb.elRows.map((row, i) => {
    const r = { ...row, fId: idOr(w, ids.f[i]), eId: idOr(w, ids.e[i]) };
    const e = expectedElF10(w, nb, r);
    return { ...r, sigma: fmt(e.sigma, 6), eps: fmt(e.eps, 6) };
  });
  nb.plastic = { ...nb.plastic, revId: idOr(w, ids.rev), curveId: idOr(w, ids.curve), resId: idOr(w, ids.res) };
  const ep = expectedPlasticF10(w, nb);
  nb.plastic = { ...nb.plastic, epsRev: fmt(ep.epsRev, 4), sigmaMax: fmt(ep.sigmaMax, 6), epsRes: fmt(ep.epsRes, 5) };
  const ec = expectedCalcF10(w, nb);
  nb.calc.E = calc(fmt(ec.E, 5), fmt(ec.uE, 2));
  nb.calc.Edev = calc(fmt(ec.Edev, 3));
  nb.calc.W1slope = calc(fmt(ec.W1slope, 4), fmt(ec.uW1, 2));
  nb.mcq = 'residual';
  nb.contrastText = 'Las reacciones previstas con ΣF = 0 y Στ_A = 0 coincidieron con los sensores dentro de unas centésimas de newton, y la pendiente de R_B frente a x devolvió el peso de la carga. La pendiente σ–ε dio un módulo cercano al de tabla; tras la fluencia la probeta quedó con un alargamiento permanente que el comparador midió sin carga.';
  nb.analysis = {
    q1: 'En la viga, la posición de la carga controló cómo se reparte el peso entre los apoyos; en la prensa, el desplazamiento del travesaño fijó la deformación y la fuerza respondió.',
    q2: 'Lo más sensible fue el cero de cada instrumento y el montaje: la viga sin asentar o un apoyo sin trabar cambian las reacciones; la probeta excéntrica o el comparador sin calibrar cambian E.',
    q3: 'El mayor residual del equilibrio vino de la resolución de los sensores y de la posición del centro de masa; en E, de la incertidumbre del diámetro y del comparador.',
    q4: 'La estática deja de valer si la viga vuelca o se sostiene con la mano; la ley de Hooke deja de valer pasada la fluencia, donde la descarga es elástica pero deja una deformación residual.',
  };
  nb.closure = 'Probeta descargada, manivela en cero y frenada, protector cerrado, viga y carga en su estante y registrador detenido; sin incidentes.';
  return nb;
}
