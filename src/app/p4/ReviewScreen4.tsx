import { useTranslation } from 'react-i18next';
import { useP4 } from './store';
import { downloadJson } from '../persistence';
import { newSeed } from '../../simulation/core/rng';
import { metalCuMg, speciesMol, vesselPH } from '../../simulation/reaction-world/world';
import { deliveredMl, experimentVessels, redoxElapsedS } from '../../practices/practice-04/evidence';
import { allEquations } from '../../practices/practice-04/equations';
import { expectedResults } from '../../practices/practice-04/expected-results';

const pct = (v: number) => `${Math.round(v * 100)} %`;
const f = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d).replace('.', ',') : '—');

/** Revisión (§21.5): comparación con valores teóricos calculados con las cantidades realmente usadas. */
export function ReviewScreen4({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const ev = useP4((s) => s.evaluation);
  const rt = useP4((s) => s.runtime);
  const nb = useP4((s) => s.notebook);
  const start = useP4((s) => s.start);
  const setSettings = useP4((s) => s.setSettings);
  const backToIntro = useP4((s) => s.backToIntro);
  const attemptId = useP4((s) => s.attemptId);
  const settings = useP4((s) => s.settings);
  if (!ev || !rt) return null;
  const w = rt.world;
  const feedback = ev.components.flatMap((c) => c.items.filter((i) => i.feedbackKey).map((i) => ({ comp: c.id, key: i.feedbackKey!, params: i.params })));
  const xv = experimentVessels(w);
  const a = deliveredMl(w, xv.A);
  const b1 = deliveredMl(w, xv.B1);
  const b2 = deliveredMl(w, xv.B2);
  const c1 = deliveredMl(w, xv.C1);
  const nCa = ((b1.cacl2 ?? 0) / 1000) * 0.15;
  const nCO3 = ((b1.na2co3 ?? 0) / 1000) * 0.15;
  const caco3Theo = Math.min(nCa, nCO3) * 100.09 * 1000;
  const caco3Real = xv.B1 ? speciesMol(w.vessels[xv.B1], 'CaCO3(s)') * 100.09 * 1000 : 0;
  const nFe = ((b2.fecl3 ?? 0) / 1000) * 0.15;
  const nOH = ((b2.naoh15 ?? 0) / 1000) * 0.15;
  const feTheo = Math.min(nFe, nOH / 3) * 1000;
  const feReal = xv.B2 ? speciesMol(w.vessels[xv.B2], 'Fe(OH)3(s)') * 1000 : 0;
  const cuMax = ((c1.cuso4 ?? 0) / 1000) * 0.25 * 63.546 * 1000;
  const nail = w.metals.nail;
  const burned = Object.values(w.ribbons).find((r) => r.burnFrac > 0.5);
  const mgoTheo = burned ? (burned.massInitialG / 24.305) * 40.304 * 1000 : 0;
  const mgoRec = burned ? burned.toCapsuleMol * 40.304 * 1000 : 0;
  const eqs = allEquations(w, nb);
  const exp = expectedResults(w);
  return (
    <main className="review">
      <div className="review-card">
        <section className="panel" style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.4rem' }}>{t('p4.review.title')}</h1>
            <span className="hint">{t(`mode.${settings.mode}`)} · semilla {w.seed} · {Math.round(w.timeS / 60)} min</span>
          </div>
          <span style={{ flex: 1 }} />
          <div style={{ textAlign: 'right' }}>
            <div className="label">{t('review.total')}</div>
            <div className="score-big">{pct(ev.total)}</div>
          </div>
        </section>

        <section className="panel">
          <h2>{t('review.components')}</h2>
          {ev.components.map((c) => (
            <div key={c.id} className="comp">
              <strong>{t(`p4.comp.${c.id}`)} <span className="hint">({Math.round(c.weight * 100)} %)</span></strong>
              <span>{pct(c.score)}</span>
              <div className="bar"><span style={{ width: `${Math.round(c.score * 100)}%` }} /></div>
              <details style={{ gridColumn: '1 / -1' }}>
                <summary className="hint">{t('p3.review.detail')}</summary>
                <ul className="fb-list">
                  {c.items.map((i) => (
                    <li key={i.key}>
                      <span className={i.ok === true ? 'ok' : i.ok === null ? 'pending' : 'bad'}>{i.ok === true ? '✓' : i.ok === null ? '◐' : '✗'}</span>{' '}
                      {t(`p4.item.${i.key.replace('p4.', '')}`)} <span className="hint">({i.points.toFixed(1)}/{i.max})</span>
                    </li>
                  ))}
                </ul>
              </details>
            </div>
          ))}
          {ev.needsTeacherReview.length > 0 && <p className="hint">{t('p3.review.teacher', { n: ev.needsTeacherReview.length })}</p>}
        </section>

        <section className="panel">
          <h2>{t('review.feedback')}</h2>
          {feedback.length ? (
            <ul className="fb-list">{feedback.map((x, i) => <li key={i}><strong>{t(`p4.comp.${x.comp}`)}:</strong> {t(x.key, x.params)}</li>)}</ul>
          ) : <p className="ok">✓</p>}
        </section>

        <section className="panel">
          <h2>{t('p4.review.quant')}</h2>
          <div className="table-scroll">
            <table className="data">
              <thead><tr><th>{t('p4.review.test')}</th><th>{t('p4.review.used')}</th><th>{t('p4.review.obtained')}</th><th>{t('p4.review.theory')}</th></tr></thead>
              <tbody>
                <tr>
                  <td>{t('p4.exp.A')}</td>
                  <td>HCl {f(a.hcl ?? 0)} mL · NaOH {f((a.naoh10 ?? 0) + (a.naoh15 ?? 0) + (a.naohX ?? 0))} mL · {t('p4.review.drops')} {f(a.pheno ?? 0, 2)} mL</td>
                  <td>pH {xv.A ? f(vesselPH(w.vessels[xv.A]), 1) : '—'} · ΔT {xv.A && w.vessels[xv.A].tempLog.first !== null ? f(w.vessels[xv.A].tempLog.max - (w.vessels[xv.A].tempLog.first ?? 0), 2) : '—'} °C</td>
                  <td>{t('p4.review.aTheory', { c: exp.A.colorFinal.map((c) => t(`p4.color.${c}`)).join(' / ') })}</td>
                </tr>
                <tr>
                  <td>{t('p4.exp.B1')}</td>
                  <td>Na₂CO₃ {f(b1.na2co3 ?? 0)} mL · CaCl₂ {f(b1.cacl2 ?? 0)} mL</td>
                  <td>CaCO₃ {f(caco3Real, 1)} mg</td>
                  <td>{f(caco3Theo, 1)} mg · {t('p4.review.limiting')} {exp.B1.limiting.map((l) => t(`p4.opt.limiting.${l}`)).join(' / ')}</td>
                </tr>
                <tr>
                  <td>{t('p4.exp.B2')}</td>
                  <td>FeCl₃ {f(b2.fecl3 ?? 0)} mL · NaOH {f(b2.naoh15 ?? 0)} mL</td>
                  <td>Fe(OH)₃ {f(feReal, 4)} mmol</td>
                  <td>{f(feTheo, 4)} mmol · {t('p4.review.limiting')} {exp.B2.limiting.map((l) => t(`p4.opt.limiting.${l}`)).join(' / ')}</td>
                </tr>
                <tr>
                  <td>{t('p4.exp.C1')}</td>
                  <td>CuSO₄ {f(c1.cuso4 ?? 0)} mL · {f(redoxElapsedS(w) / 60, 1)} min</td>
                  <td>Cu {nail ? f(metalCuMg(nail), 1) : '—'} mg</td>
                  <td>{t('p4.review.cuMax', { mg: f(cuMax, 1) })}</td>
                </tr>
                <tr>
                  <td>{t('p4.exp.C2')}</td>
                  <td>Mg {burned ? f(burned.massInitialG * 1000, 1) : '—'} mg</td>
                  <td>MgO {f(mgoRec, 1)} mg {burned ? `(${Math.round((mgoRec / Math.max(1e-9, mgoTheo)) * 100)} %)` : ''}</td>
                  <td>{f(mgoTheo, 1)} mg</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="hint">{t('p4.review.note')}</p>
        </section>

        <section className="panel">
          <h2>{t('p4.review.equations')}</h2>
          <ul className="fb-list">
            {eqs.map((e) => (
              <li key={`${e.id}-${e.kind}`}>
                <span className={e.v?.ok ? 'ok' : e.v?.complete ? 'pending' : 'bad'}>{e.v?.ok ? '✓' : e.v?.complete ? '◐' : '✗'}</span> {t(`p4.exp.${e.id}`)} — {t(`p4.eqkind.${e.kind}`)}
                {e.v && !e.v.ok && e.v.errors.length > 0 && <span className="hint"> · {e.v.errors.map((x) => t(`p4.eqerr.${x.code}`, x.params)).join(' · ')}</span>}
              </li>
            ))}
          </ul>
        </section>

        <section className="panel">
          <h2>{t('p4.review.waste')}</h2>
          {w.disposals.length ? (
            <ul className="fb-list">
              {w.disposals.map((d, i) => (
                <li key={i}><span className={d.correct ? 'ok' : 'bad'}>{d.correct ? '✓' : '✗'}</span> {d.sourceId} → {t(`p4.obj.${d.containerId}`)} ({f(d.volumeMl, 1)} mL){!d.correct && <span className="hint"> · {t('p4.review.expected')}: {t(`p4.waste.${d.expected}`)}</span>}</li>
              ))}
            </ul>
          ) : <p className="hint">{t('p4.review.noWaste')}</p>}
        </section>

        <section className="panel" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          <button className="btn primary" onClick={() => start({ sameSeed: true })}>{t('review.newSame')}</button>
          <button className="btn" onClick={() => { setSettings({ seed: newSeed() }); start({ sameSeed: true }); }}>{t('review.newSeed')}</button>
          <button className="btn" onClick={() => downloadJson(`informe-p4-${attemptId}.json`, { attemptId, settings, evaluation: ev, disposals: w.disposals, notebook: nb, actions: rt.actions })}>{t('review.export')}</button>
          <button className="btn ghost" onClick={backToIntro}>{t('review.back')}</button>
          <button className="btn ghost" onClick={onBack}>{t('menu.back')}</button>
        </section>
      </div>
    </main>
  );
}
