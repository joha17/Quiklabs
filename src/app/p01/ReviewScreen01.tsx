import { useTranslation } from 'react-i18next';
import { useP01 } from './store';
import { downloadJson } from '../persistence';
import { newSeed } from '../../simulation/core/rng';
import { expectedDisplacement, expectedGeometry, expectedWater, seriesTruth } from '../../practices/practice-01/expected-results';
import { notebookIssues } from '../../practices/practice-01/rubric';
import { SERIES } from '../../practices/practice-01/notebook';
import { rhoWaterGPerMl } from '../../simulation/density-models/water';
import { cylinderApparentMl, fluidMl } from '../../simulation/density-world/world';

const pct = (v: number) => `${Math.round(v * 100)} %`;
const f = (v: number | null | undefined, d = 3) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(d).replace('.', ','));

/** Revisión (§5.F, §13): lo que corresponde a las lecturas del estudiante, diagnóstico causal y la verdad del motor. */
export function ReviewScreen01({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const ev = useP01((s) => s.evaluation);
  const rt = useP01((s) => s.runtime);
  const nb = useP01((s) => s.notebook);
  const start = useP01((s) => s.start);
  const setSettings = useP01((s) => s.setSettings);
  const backToIntro = useP01((s) => s.backToIntro);
  const attemptId = useP01((s) => s.attemptId);
  const settings = useP01((s) => s.settings);
  if (!ev || !rt) return null;
  const w = rt.world;
  const feedback = ev.components.flatMap((c) => c.items.filter((i) => i.feedbackKey).map((i) => ({ comp: c.id, key: i.feedbackKey!, params: i.params })));
  const issues = notebookIssues(w, nb);
  const de = expectedDisplacement(w, nb);
  const ge = expectedGeometry(w, nb);
  return (
    <main className="review">
      <div className="review-card">
        <section className="panel" style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.4rem' }}>{t('p01.review.title')}</h1>
            <span className="hint">{t(`mode.${settings.mode}`)} · {t(`p01.conventionBadge.${w.params.convention}`)} · semilla {w.seed} · {Math.round(w.timeS / 60)} min</span>
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
              <strong>{t(`p01.comp.${c.id}`)} <span className="hint">({Math.round(c.weight * 100)} %)</span></strong>
              <span>{pct(c.score)}</span>
              <div className="bar"><span style={{ width: `${Math.round(c.score * 100)}%` }} /></div>
              <details style={{ gridColumn: '1 / -1' }}>
                <summary className="hint">{t('p3.review.detail')}</summary>
                <ul className="fb-list">
                  {c.items.map((i) => (
                    <li key={i.key}>
                      <span className={i.ok === true ? 'ok' : i.ok === null ? 'pending' : 'bad'}>{i.ok === true ? '✓' : i.ok === null ? '◐' : '✗'}</span>{' '}
                      {t(`p01.item.${i.key.replace('p01.', '')}`)} <span className="hint">({i.points.toFixed(1)}/{i.max})</span>
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
          {feedback.length ? <ul className="fb-list">{feedback.map((x, i) => <li key={i}><strong>{t(`p01.comp.${x.comp}`)}:</strong> {t(x.key, x.params)}</li>)}</ul> : <p className="ok">✓</p>}
          {issues.length > 0 && (
            <>
              <h3>{t('p01.review.issues')}</h3>
              <ul className="fb-list">{issues.map((k) => <li key={k}>{t(`p01fb.${k.replace('nb:', '')}`)}</li>)}</ul>
            </>
          )}
        </section>

        <section className="panel">
          <h2>{t('p01.review.quant')}</h2>
          <div className="table-scroll">
            <table className="data">
              <thead><tr><th>{t('p01.review.qty')}</th><th>{t('p01.review.yours')}</th><th>{t('p01.review.engine')}</th></tr></thead>
              <tbody>
                {SERIES.map((s) => {
                  const e = expectedWater(w, nb, s);
                  const tr = seriesTruth(w, s);
                  return (
                    <tr key={s}>
                      <td>{t('p01.review.rhoWater', { s: t(`p01.series.${s}`) })}</td>
                      <td>{f(e.rho, 4)} ± {f(e.urho, 4)} g/mL</td>
                      <td>{tr ? `${f(tr.deliveredG, 4)} g · ${f(tr.tempC, 1)} °C · ρ(T) = ${f(rhoWaterGPerMl(tr.tempC), 5)} g/mL` : '—'}</td>
                    </tr>
                  );
                })}
                <tr><td>{t('p01.review.rhoNails')}</td><td>{f(de.rho, 2)} ± {f(de.urho, 2)} g/mL ({f(de.errPct, 1)} %)</td><td>{f(w.nails.reduce((a, n) => a + n.massG, 0), 3)} g · {f(cylinderApparentMl(w) - fluidMl(w.fluids.cylinder50), 3)} mL</td></tr>
                <tr><td>{t('p01.review.rhoCyl')}</td><td>{f(ge.rho, 3)} ± {f(ge.urho, 3)} g/cm³ ({f(ge.errPct, 2)} %)</td><td>d {f(w.solid.diameterCm, 3)} cm · h {f(w.solid.heightCm, 3)} cm · ρ {f(w.solid.rhoGPerCm3, 2)} g/cm³</td></tr>
              </tbody>
            </table>
          </div>
          <p className="hint">{t('p01.review.note')}</p>
        </section>

        <section className="panel">
          <h2>{t('p01.review.causes')}</h2>
          <ul className="fb-list">
            {SERIES.map((s) => {
              const tr = seriesTruth(w, s);
              return tr && tr.flags.length ? <li key={s}>{t(`p01.series.${s}`)}: {tr.flags.map((x) => t(`p01.flagSample.${x}`)).join(' · ')}</li> : null;
            })}
            {Object.entries(w.evidence).filter(([k, v]) => k.startsWith('err:') && v).map(([k]) => <li key={k}>{t(`p01fb.${k.slice(4)}`)}</li>)}
          </ul>
        </section>

        <section className="panel" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          <button className="btn primary" onClick={() => start({ sameSeed: true })}>{t('review.newSame')}</button>
          <button className="btn" onClick={() => { setSettings({ seed: newSeed() }); start({ sameSeed: true }); }}>{t('review.newSeed')}</button>
          <button className="btn" onClick={() => downloadJson(`informe-p01-${attemptId}.json`, { attemptId, settings, evaluation: ev, readings: w.readings, samples: w.samples, notebook: nb, issues, actions: rt.actions })}>{t('review.export')}</button>
          <button className="btn ghost" onClick={() => window.print()}>{t('p10.nb.print')}</button>
          <button className="btn ghost" onClick={backToIntro}>{t('review.back')}</button>
          <button className="btn ghost" onClick={onBack}>{t('menu.back')}</button>
        </section>
      </div>
    </main>
  );
}
