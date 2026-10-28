/**
 * Rúbrica pura de B03 (§13): 15 % seguridad y equipo, 15 % montaje de membranas, 15 % difusión, 20 % diálisis,
 * 15 % ósmosis, 10 % microscopía, 10 % libreta. Usa los hechos del intento y las lecturas PROPIAS: los cálculos se
 * corrigen contra los valores que el estudiante importó (con sus fugas y sesgos), nunca contra un resultado ideal.
 * Las respuestas abiertas quedan `ok: null`; una foto pendiente (PERMRES) difiere el ítem afectado, nunca lo tacha.
 */
import { finalizeComponent, item, type Evaluation } from '../../simulation/scoring/types';
import type { PermWorld } from '../../simulation/perm-world/types';
import { b03StageEvidence } from './evidence';
import { ASSAY_LABELS, controlRead, diffusionLeaked, mediaDone, observation, osmosisExpected, piExpected, reading, tubeTraceable } from './expected-results';
import { answeredCount, parseNum, type B03Notebook } from './notebook';

export const B03_WEIGHTS = { safety: 0.15, setup: 0.15, diffusion: 0.15, dialysis: 0.2, osmosis: 0.15, microscopy: 0.1, notebook: 0.1 } as const;

const n = (w: PermWorld, k: string) => w.evidence[k] ?? 0;
const near = (a: number, b: number, abs: number, rel = 0.05) => Number.isFinite(a) && Math.abs(a - b) <= Math.max(abs, rel * Math.abs(b));

/**
 * Errores de cálculo e interpretación (`nb:PERM*`): lo escrito en la libreta contrastado con las lecturas, las
 * capturas y los hechos del propio intento (curva disponible, fuga registrada, medio real de cada lámina).
 */
export function notebookIssuesB03(w: PermWorld, nb: B03Notebook): string[] {
  const out: string[] = [];
  if (!w.perm.curve && nb.diffusion.rows.some((r) => r.concentration.trim() !== '')) out.push('nb:PERM20');
  if (nb.diffusion.attribution === 'diffusion' && diffusionLeaked(w)) out.push('nb:PERM62');
  if (nb.dialysis.silverShows === 'allMinerals') out.push('nb:PERM61');
  for (const r of nb.micro.rows) {
    const o = observation(w, r.observationId);
    const c = r.observationId ? w.perm.elodeaCaptures[r.observationId] : undefined;
    if (!o || !c) continue;
    if (r.treatment && c.medium !== r.treatment) out.push('nb:PERM58');
    if (r.condition === 'plasmolyzed' && !o.assetId.startsWith('elodeaPlasmo')) out.push('nb:PERM57');
  }
  if (nb.micro.iso09 === 'isotonic') out.push('nb:PERM60');
  const pi = piExpected(w, nb);
  const piv = parseNum(nb.osmosis.piKPa);
  if (pi && Number.isFinite(piv) && near(piv, pi.celsius, 1, 0.03) && !near(piv, pi.kelvin, 1, 0.03)) out.push('nb:PERM63');
  const ex = osmosisExpected(w, nb);
  if (ex) {
    const fs = parseNum(nb.osmosis.fluxMlS);
    if (Number.isFinite(fs) && Math.abs(ex.dVB) > 0.05 && near(Math.abs(fs), Math.abs(ex.dVB), 0.01, 0.05)) out.push('nb:PERM64');
    const dvb = parseNum(nb.osmosis.dVB);
    const dva = parseNum(nb.osmosis.dVA);
    if ((Number.isFinite(dvb) && Math.abs(ex.dVB) > 0.05 && Math.sign(dvb) === -Math.sign(ex.dVB)) || (Number.isFinite(dva) && Math.abs(ex.dVA) > 0.05 && Math.sign(dva) === -Math.sign(ex.dVA))) out.push('nb:PERM65');
  }
  return [...new Set(out)];
}

const firstOf = (w: PermWorld, codes: string[], fallback: string, issues: string[] = []) => {
  const c = codes.find((k) => n(w, `err:${k}`) > 0 || issues.includes(`nb:${k}`));
  return c ? `b03fb.${c}` : `b03fb.${fallback}`;
};

export function evaluateB03(w: PermWorld, nb: B03Notebook): Evaluation {
  const flags = b03StageEvidence(w, nb);
  const issues = notebookIssuesB03(w, nb);
  const has = (...ks: string[]) => ks.some((k) => issues.includes(`nb:${k}`));
  const errs = (...ks: string[]) => ks.reduce((s, k) => s + n(w, `err:${k}`), 0);
  const fb = (codes: string[], fallback: string) => firstOf(w, codes, fallback, issues);

  // ── Seguridad, EPP y cuidado del equipo (15) ──
  let safety = [
    item('b03.ppe', flags.ppe && errs('PPE') === 0 ? true : flags.ppe ? null : false, 3, 'b03fb.ppe', undefined, 0.5),
    item('b03.waste', Object.values(w.perm.tubes).filter((t) => t.reagentAt !== null).every((t) => t.discarded) && Object.values(w.perm.tubes).some((t) => t.discarded), 3, 'b03fb.waste'),
    item('b03.spills', w.perm.vessels.spill.volumeMl < 0.05 && w.benchSpillMl < 0.005 && errs('PERM08', 'PERM15', 'PERM25') === 0, 3, fb(['PERM08', 'PERM15', 'PERM25'], 'spills')),
    item('b03.glass', w.shards === 0 && errs('PERM50') === 0, 2, fb(['PERM50'], 'glass')),
    item('b03.scope', errs('PERM53', 'PERM54', 'PERM59') === 0 && !!flags.safeParked, 4, fb(['PERM53', 'PERM54', 'PERM59'], 'scope')),
  ];
  if (w.safety.incident) safety = safety.map((i) => ({ ...i, ok: false, points: 0, feedbackKey: 'b03fb.incident' }));

  // ── Montaje de membranas y control de calidad (15) ──
  const setup = [
    item('b03.membrane', !!w.evidence['membraneOk:c1'] || !!w.evidence['membraneOk:c2'] || !!w.evidence['membraneOk:c3'] ? errs('PERM05', 'PERM09', 'PERM21') === 0 : false, 4, fb(['PERM09', 'PERM05', 'PERM21'], 'membrane')),
    item('b03.fit', !!w.evidence.membraneInstalled && errs('PERM01', 'PERM03', 'PERM04', 'PERM06', 'PERM10') === 0, 4, fb(['PERM03', 'PERM01', 'PERM04', 'PERM06', 'PERM10'], 'fit')),
    item('b03.leakTest', w.perm.leakTestPassed.length > 0 && errs('PERM07') === 0, 4, fb(['PERM07'], 'leakTest')),
    item('b03.seal', w.perm.leakTestPassed.length > 0 && errs('PERM02', 'PERM43') === 0 ? true : w.perm.leakTestPassed.length > 0 && !!w.evidence['leakTest:found'] ? null : false, 3, fb(['PERM02', 'PERM43'], 'seal'), undefined, 0.6),
  ];

  // ── Difusión y mediciones temporales (15) ──
  const series = ['diff:t0', 'diff:t30', 'diff:t60'].filter((k) => !!w.evidence[k]).length;
  const diffusion = [
    item('b03.gradient', !!w.evidence.tracerLoaded && errs('PERM11', 'PERM12', 'PERM13', 'PERM14') === 0, 4, fb(['PERM11', 'PERM14', 'PERM12', 'PERM13'], 'gradient')),
    item('b03.series', series === 3 && errs('PERM16') === 0, 4, fb(['PERM16'], 'series'), { n: series }, (series / 3) * 0.6),
    item('b03.instrument', !!w.evidence['read:eye:c1:B'] || !!w.evidence['read:colorimeter:c1:B'] ? errs('PERM19') === 0 && !has('PERM20') : false, 3, fb(['PERM19', 'PERM20'], 'instrument')),
    item('b03.diffInterpretation', flags.diffusion && !has('PERM62') && errs('PERM15') === 0 ? null : false, 4, fb(['PERM62', 'PERM15'], 'diffInterpretation'), undefined, 0.6),
  ];

  // ── Diálisis y pruebas químicas (20) ──
  const traced = ASSAY_LABELS.filter((l) => tubeTraceable(w, l)).length;
  const controls = ['blank', 'pos-protein', 'pos-chloride'].filter((l) => controlRead(w, l as never)).length;
  const dialysis = [
    item('b03.loading', !!w.evidence.dialysisLoaded && errs('PERM22', 'PERM23', 'PERM24', 'PERM25') === 0, 4, fb(['PERM23', 'PERM22', 'PERM24', 'PERM25'], 'loading')),
    item('b03.tubes', traced === 4 && errs('PERM26', 'PERM27', 'PERM28', 'PERM29') === 0, 5, fb(['PERM26', 'PERM27', 'PERM28', 'PERM29'], 'tubes'), { n: traced }, (traced / 4) * 0.6),
    item('b03.reagents', traced > 0 && errs('PERM30', 'PERM31', 'PERM32', 'PERM33', 'PERM34', 'PERM35') === 0, 4, fb(['PERM30', 'PERM31', 'PERM32', 'PERM33', 'PERM34', 'PERM35'], 'reagents')),
    item('b03.controls', controls === 3, 3, 'b03fb.controls', { n: controls }, (controls / 3) * 0.6),
    item('b03.dialInterpretation', flags.dialysis && !has('PERM61') ? null : false, 4, fb(['PERM61'], 'dialInterpretation'), undefined, 0.6),
  ];

  // ── Ósmosis cuantitativa (15) ──
  const ex = osmosisExpected(w, nb);
  const o = nb.osmosis;
  const dvOk = !!ex && near(parseNum(o.dVA), ex.dVA, 0.05) && near(parseNum(o.dVB), ex.dVB, 0.05);
  const fluxOk = !!ex && (near(parseNum(o.fluxMlS), ex.fluxMlS, 2e-4, 0.1) || near(parseNum(o.fluxMlMin), ex.fluxMlMin, 0.01, 0.1));
  const osmosis = [
    item('b03.osmSetup', !!w.evidence.syrupLoaded && errs('PERM36', 'PERM37', 'PERM38', 'PERM39', 'PERM45') === 0, 3, fb(['PERM37', 'PERM38', 'PERM36', 'PERM39', 'PERM45'], 'osmSetup')),
    item('b03.volumes', !!ex && errs('PERM40', 'PERM44') === 0, 3, fb(['PERM40', 'PERM44'], 'volumes')),
    item('b03.conditions', !!reading(w, o.tempReadingId) && errs('PERM41', 'PERM42', 'PERM43') === 0, 3, fb(['PERM41', 'PERM42', 'PERM43'], 'conditions')),
    item('b03.flux', dvOk && fluxOk && !has('PERM64', 'PERM65'), 3, fb(['PERM65', 'PERM64'], 'flux')),
    item('b03.pressure', piExpected(w, nb) ? !has('PERM63') && near(parseNum(o.piKPa), piExpected(w, nb)!.kelvin, 1, 0.03) : false, 3, fb(['PERM63'], 'pressure')),
  ];

  // ── Microscopía celular (10) ──
  const media = mediaDone(w).length;
  const microscopy = [
    item('b03.mounts', media === 3 && errs('PERM46', 'PERM47', 'PERM48', 'PERM49') === 0, 4, fb(['PERM47', 'PERM46', 'PERM48', 'PERM49'], 'mounts'), { n: media }, (media / 3) * 0.6),
    item('b03.operation', media > 0 && errs('PERM51', 'PERM52', 'PERM55', 'PERM56') === 0, 3, fb(['PERM51', 'PERM52', 'PERM55', 'PERM56'], 'operation')),
    item('b03.identification', nb.micro.rows.some((r) => r.condition) && !has('PERM57', 'PERM58', 'PERM60'), 3, fb(['PERM57', 'PERM58', 'PERM60'], 'identification')),
  ];

  // ── Libreta y análisis integrador (10) ──
  const k = answeredCount(nb);
  const notebook = [
    item('b03.units', !has('PERM20', 'PERM63', 'PERM64', 'PERM65') && !!ex, 3, fb(['PERM63', 'PERM64', 'PERM65', 'PERM20'], 'units')),
    item('b03.limits', nb.balance.notSelective.trim().length > 10 ? null : false, 3, 'b03fb.limits', undefined, 0.5),
    item('b03.answers', k >= 5 ? null : false, 4, 'b03fb.answers', { n: k }, Math.min(1, k / 10) * 0.6),
  ];

  const components = [
    finalizeComponent('safety', B03_WEIGHTS.safety, safety),
    finalizeComponent('setup', B03_WEIGHTS.setup, setup),
    finalizeComponent('diffusion', B03_WEIGHTS.diffusion, diffusion),
    finalizeComponent('dialysis', B03_WEIGHTS.dialysis, dialysis),
    finalizeComponent('osmosis', B03_WEIGHTS.osmosis, osmosis),
    finalizeComponent('microscopy', B03_WEIGHTS.microscopy, microscopy),
    finalizeComponent('notebook', B03_WEIGHTS.notebook, notebook),
  ];
  const total = components.reduce((s, c) => s + c.weight * c.score, 0);
  const needsTeacherReview = components.flatMap((c) => c.items.filter((i) => i.ok === null).map((i) => i.key));
  return { components, total, needsTeacherReview };
}
