import { useTranslation } from 'react-i18next';
import { useP10 } from './store';
import { downloadJson } from '../persistence';
import { newSeed } from '../../simulation/core/rng';
import { expectedBoyle, expectedRep, runOf } from '../../practices/practice-10/expected-results';
import { notebookIssues } from '../../practices/practice-10/rubric';
import { REPS } from '../../practices/practice-10/notebook';
import { R_REF } from '../../simulation/gas-laws/ideal-gas';

const pct = (v: number) => `${Math.round(v * 100)} %`;
const f = (v: number | null | undefined, d = 2) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(d).replace('.', ','));
const e = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toExponential(3).replace('.', ','));

/** Revisión (§30.3, §31): lo que corresponde a las lecturas del estudiante, diagnóstico causal y la verdad del motor. */
export function ReviewScreen10({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const ev = useP10((s) => s.evaluation);
  const rt = useP10((s) => s.runtime);
  const nb = useP10((s) => s.notebook);
  const start = useP10((s) => s.start);
  const setSettings = useP10((s) => s.setSettings);
  const backToIntro = useP10((s) => s.backToIntro);
  const attemptId = useP10((s) => s.attemptId);
  const settings = useP10((s) => s.settings);
  if (!ev || !rt) return null;
  const w = rt.world;
  const feedback = ev.components.flatMap((c) => c.items.filter((i) => i.feedbackKey).map((i) => ({ comp: c.id, key: i.feedbackKey!, params: i.params })));
  const issues = notebookIssues(w, nb);
  const eb = expectedBoyle(w);
  return (
    <main className="review">
      <div className="review-card">
        <section className="panel" style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.4rem' }}>{t('p10.review.title')}</h1>
            <span className="hint">{t(`mode.${settings.mode}`)} · {t(`p10.modelBadge.${w.params.model}`)} · semilla {w.seed} · {Math.round(w.timeS / 60)} min</span>
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
              <strong>{t(`p10.comp.${c.id}`)} <span className="hint">({Math.round(c.weight * 100)} %)</span></strong>
              <span>{pct(c.score)}</span>
              <div className="bar"><span style={{ width: `${Math.round(c.score * 100)}%` }} /></div>
              <details style={{ gridColumn: '1 / -1' }}>
                <summary className="hint">{t('p3.review.detail')}</summary>
                <ul className="fb-list">
                  {c.items.map((i) => (
                    <li key={i.key}>
                      <span className={i.ok === true ? 'ok' : i.ok === null ? 'pending' : 'bad'}>{i.ok === true ? '✓' : i.ok === null ? '◐' : '✗'}</span>{' '}
                      {t(`p10.item.${i.key.replace('p10.', '')}`)} <span className="hint">({i.points.toFixed(1)}/{i.max})</span>
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
          {feedback.length ? <ul className="fb-list">{feedback.map((x, i) => <li key={i}><strong>{t(`p10.comp.${x.comp}`)}:</strong> {t(x.key, x.params)}</li>)}</ul> : <p className="ok">✓</p>}
          {issues.length > 0 && (
            <>
              <h3>{t('p10.review.issues')}</h3>
              <ul className="fb-list">{issues.map((k) => <li key={k}>{t(`p10.issue.${k.replace('nb:', '')}`)}</li>)}</ul>
            </>
          )}
        </section>

        <section className="panel">
          <h2>{t('p10.review.quant')}</h2>
          <div className="table-scroll">
            <table className="data">
              <thead><tr><th>{t('p10.review.qty')}</th><th>{t('p10.nb.col.r1')}</th><th>{t('p10.nb.col.r2')}</th></tr></thead>
              <tbody>
                {(['massG', 'nAliquot', 'nAcid', 'vL', 'tK', 'patm', 'pv', 'dP', 'pCo2', 'r', 'errorPct', 'uR'] as const).map((k) => (
                  <tr key={k}>
                    <td>{t(`p10.review.row.${k}`)}</td>
                    {REPS.map((rep) => {
                      const x = expectedRep(w, rep)[k];
                      return <td key={rep}>{k === 'nAliquot' || k === 'nAcid' ? e(x as number) : f(x as number, k === 'massG' ? 4 : k === 'tK' ? 2 : k === 'errorPct' ? 1 : k === 'vL' ? 5 : 4)}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="hint">{t('p10.review.ref', { r: f(R_REF, 6) })}</p>
        </section>

        <section className="panel">
          <h2>{t('p10.review.causes')}</h2>
          {REPS.map((rep) => {
            const run = runOf(w, rep);
            const x = expectedRep(w, rep);
            return (
              <div key={rep}>
                <strong>{t(`p10.nb.col.${rep}`)}</strong>
                {run ? (
                  <ul className="fb-list">
                    <li>{t('p10.review.truth', { gen: e(run.co2Generated), coll: e(run.co2Collected), diss: e(run.co2Dissolved), leak: e(run.co2Leaked), esc: e(run.co2Escaped), lim: t(`p10.limiting.${run.limiting}`) })}</li>
                    {x.causes.map((c) => <li key={c}>{t(`p10.cause.${c}`)}</li>)}
                  </ul>
                ) : <p className="hint">{t('p10.review.noRun')}</p>}
              </div>
            );
          })}
          <h3>{t('p10.review.boyle')}</h3>
          <ul className="fb-list">
            <li>{t('p10.review.boyleTruth', { dead: f(eb.dead, 2), n: f(eb.free?.n, 4), r2: f(eb.free?.r2, 5), pv: f(eb.pv.mean, 1), cv: f(eb.pv.cvPct, 2), pattern: t(`p10.nb.pattern.${eb.pattern}`) })}</li>
            {w.syringe.leakedMol > 0 && <li>{t('p10.review.leakBoyle', { pct: f((w.syringe.leakedMol / Math.max(1e-12, w.evidence.__boyleN0 ?? 1)) * 100, 1) })}</li>}
          </ul>
        </section>

        <section className="panel" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          <button className="btn primary" onClick={() => start({ sameSeed: true })}>{t('review.newSame')}</button>
          <button className="btn" onClick={() => { setSettings({ seed: newSeed() }); start({ sameSeed: true }); }}>{t('review.newSeed')}</button>
          <button className="btn" onClick={() => downloadJson(`informe-p10-${attemptId}.json`, { attemptId, settings, model: w.params.model, evaluation: ev, runs: w.runs, points: w.points, notebook: nb, issues, actions: rt.actions })}>{t('review.export')}</button>
          <button className="btn ghost" onClick={() => window.print()}>{t('p10.nb.print')}</button>
          <button className="btn ghost" onClick={backToIntro}>{t('review.back')}</button>
          <button className="btn ghost" onClick={onBack}>{t('menu.back')}</button>
        </section>
      </div>
    </main>
  );
}
