/**
 * Libreta completa y correcta a partir de las lecturas de un intento (importadas, no escritas): la usan las pruebas y
 * la demostración. No es una ayuda para el estudiante: la libreta real nunca se rellena sola.
 */
import type { F11World } from '../../simulation/f11-world/types';
import { emptyF11Notebook, type F11Notebook } from './notebook';
import { expectedBuoyF11, expectedCalcF11, expectedFloatF11, expectedPRowF11 } from './expected-results';
import type { RouteIdsF11 } from './route';

const fmt = (v: number, d: number) => (Number.isFinite(v) ? v.toPrecision(d) : '');
const imp = (w: F11World, id: string | undefined) => ({ value: id && w.readings[id] ? String(w.readings[id].value) : '', uncertainty: '', readingId: id && w.readings[id] ? id : null });
const calc = (value: string, uncertainty = '') => ({ value, uncertainty, readingId: null });
const idOr = (w: F11World, id: string | undefined) => (id && w.readings[id] ? id : null);

export function fillNotebookF11(w: F11World, ids: RouteIdsF11, nb: F11Notebook = emptyF11Notebook()): F11Notebook {
  const p = w.params;
  nb.hypothesis = {
    question: '¿Cómo crece la presión con la profundidad en dos líquidos de distinta densidad, cuánto empuje recibe un bloque según su volumen sumergido y qué fracción de un cuerpo queda bajo la superficie cuando flota?',
    prediction: 'En el agua la presión crece ≈ 9,8 kPa por metro (3,9 kPa a 40 cm) y en la salmuera más, en proporción a su densidad. El bloque de 500 cm³ totalmente sumergido recibe ≈ 4,9 N, igual al peso del agua rebosada. Un cuerpo flota con V_sub/V = ρ_obj/ρ_fluido y se hunde si es más denso que el líquido.',
  };
  const rows: Record<keyof F11Notebook['instruments'], [string, string, string]> = {
    probe: [String(p.probe.resolutions[1]), p.uB.probeKPa.toFixed(4), 'pending'], ruler: [String(p.rulerResCm), p.uB.rulerCm.toFixed(3), 'verified'], scale: [String(p.levelResCm), p.uB.levelCm.toFixed(3), 'verified'],
    dyn: [String(p.dyn.resN), p.uB.dynN.toFixed(4), 'pending'], balance: [String(p.balance.resG), p.uB.balanceG.toFixed(3), 'pending'], cylinder: [String(p.cyl.resML), p.uB.cylML.toFixed(2), 'verified'],
  };
  for (const [k, [res, u, st]] of Object.entries(rows)) nb.instruments[k as keyof F11Notebook['instruments']] = { resolution: res, uncertainty: u, status: st };
  for (const k of ['LA', 'LB', 'p0', 'mCyl', 'VCyl', 'W', 'mOver'] as const) nb.setup[k] = imp(w, ids[k]);
  nb.pARows = nb.pARows.map((row, i) => {
    const r = { ...row, pId: idOr(w, ids.pAp[i]), zId: idOr(w, ids.pAz[i]) };
    const e = expectedPRowF11(w, nb, r, 'A');
    return { ...r, h: fmt(e.h, 6), p: fmt(e.p, 6) };
  });
  nb.pBRows = nb.pBRows.map((row, i) => {
    const r = { ...row, pId: idOr(w, ids.pBp[i]), zId: idOr(w, ids.pBz[i]) };
    const e = expectedPRowF11(w, nb, r, 'B');
    return { ...r, h: fmt(e.h, 6), p: fmt(e.p, 6) };
  });
  const c0 = expectedCalcF11(w, nb);
  nb.calc.rhoA = calc(fmt(c0.rhoA, 6), fmt(c0.uA, 2));
  nb.calc.rhoB = calc(fmt(c0.rhoB, 6), fmt(c0.uB, 2));
  nb.calc.rhoCyl = calc(fmt(c0.rhoCyl, 6), fmt(c0.uCyl, 2));
  nb.buoyRows = nb.buoyRows.map((row, i) => {
    const r = { ...row, fId: idOr(w, ids.bf[i]), iId: idOr(w, ids.bi[i]) };
    const e = expectedBuoyF11(w, nb, r);
    return { ...r, Vsub: fmt(e.Vsub, 6), Fb: fmt(e.Fb, 5), FbPred: fmt(e.FbPred, 5) };
  });
  nb.floatRows = nb.floatRows.map((row, i) => {
    const r = { ...row, mId: idOr(w, ids.fm[i]), dId: idOr(w, ids.fd[i]) };
    const e = expectedFloatF11(w, nb, r);
    return { ...r, rho: fmt(e.rho, 6), fPred: fmt(e.fPred, 5), fMeas: fmt(e.fMeas, 5) };
  });
  const ec = expectedCalcF11(w, nb);
  nb.calc.FbDev = calc(fmt(ec.FbDev, 3));
  nb.mcq = 'less';
  nb.contrastText = 'Las dos curvas p(h) fueron rectas por el origen; la pendiente de la salmuera fue mayor en la proporción de su densidad, que coincidió con la medida en la probeta. El empuje creció con el volumen sumergido y, con el bloque cubierto, igualó el peso del agua rebosada; los objetos flotaron con la fracción prevista por ρ_obj/ρ_fluido y el más denso que la salmuera se hundió.';
  nb.analysis = {
    q1: 'La profundidad bajo la superficie y la densidad del líquido controlaron la presión; en el empuje, el volumen sumergido; en la flotación, el cociente entre las densidades.',
    q2: 'La presión fue la más sensible: el cero de la sonda, su pendiente sin calibrar o una burbuja en la membrana corren toda la curva; en el empuje, el cebado del vaso de rebose.',
    q3: 'El mayor residual vino de leer con oleaje o con la sonda todavía respondiendo; sin eso, de la resolución de la regla frente a las cotas pequeñas.',
    q4: 'p = ρ g h deja de valer con el líquido en movimiento, mezclado o estratificado; Arquímedes para un cuerpo quieto y libre deja de valer si toca el fondo, otro objeto o lo retiene un hilo.',
  };
  nb.closure = 'Llaves cerradas, agitador apagado, objetos secos en el estante, bloque descolgado, sonda en su porta-sonda, probeta y colector vacíos y mesada seca; sin incidentes.';
  return nb;
}
