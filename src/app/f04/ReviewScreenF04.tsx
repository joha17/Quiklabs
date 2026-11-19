import { useTranslation } from 'react-i18next';
import { useF04 } from './store';
import { downloadJson } from '../persistence';
import { newSeed } from '../../simulation/core/rng';
import { expectedModel, expectedPairs, expectedRuns, expectedSlope, rdF4 } from '../../practices/practice-f04/expected-results';
import { notebookIssuesF04 } from '../../practices/practice-f04/rubric';
import { lossFraction } from '../../simulation/models/f04/regimes';
import { cartMassKg } from '../../simulation/f04-world/world';
import { SIMULATED_ERRORS_F04, errKeyF4 } from '../../practices/practice-f04/error-scenarios';

const pct = (v: number) => `${Math.round(v * 100)} %`;
const f = (v: number | null | undefined, d = 3) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(d).replace('.', ','));

/** Revisión: puntaje por componente, diagnóstico causal (errores F04-Exx) y comparación con la verdad del motor. */
export function ReviewScreenF04({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const ev = useF04((s) => s.evaluation);
  const rt = useF04((s) => s.runtime);
  const nb = useF04((s) => s.notebook);
  const start = useF04((s) => s.start);
  const setSettings = useF04((s) => s.setSettings);
  const backToIntro = useF04((s) => s.backToIntro);
  const attemptId = useF04((s) => s.attemptId);
  const settings = useF04((s) => s.settings);
  if (!ev || !rt) return null;
  const w = rt.world;
  const feedback = ev.components.flatMap((c) => c.items.filter((i) => i.feedbackKey && i.ok !== true).map((i) => ({ comp: c.id, key: i.feedbackKey!, params: i.params })));
  const issues = notebookIssuesF04(w, nb);
  const er = expectedRuns(w, nb);
  const em = expectedModel(w, nb);
  const es = expectedSlope(w, nb);
  const ep = expectedPairs(w, nb);
  // Verdad del motor: medias verdaderas de las ventanas leídas, masa real del sistema y fracción de pérdidas del modo.
  const runs = nb.runs.map((x) => rdF4(w, x.readingId)).filter((r) => r?.run);
  const mean = (xs: number[]) => (xs.length ? xs.reduce((q, x) => q + x, 0) / xs.length : NaN);
  const aTrue = mean(runs.map((r) => r!.run!.trueA ?? NaN));
  const TTrue = mean(runs.map((r) => r!.run!.trueT ?? NaN));
  const pairs = nb.pairs.map((x) => rdF4(w, x.readingId)).filter((r) => r?.pair);
  const p = w.params;
  const mc = cartMassKg(w);
  const loss = lossFraction(mc, em.mh, p.g, p.pulleyI, p.pulleyR, p.rollingN);
  const committed = SIMULATED_ERRORS_F04.filter((x) => (w.evidence[x.evidenceKey] ?? 0) > 0 || issues.includes(`nb:${errKeyF4(x)}`));
  return (
    <main className="review">
      <div className="review-card">
        <section className="panel" style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.4rem' }}>{t('f04.review.title')}</h1>
            <span className="hint">{t(`mode.${settings.mode}`)} · {t(`f04.intro.sci.${w.params.scientificMode}`)} · semilla {w.seed} · {Math.round(w.timeS / 60)} min</span>
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
              <strong>{t(`f04.comp.${c.id}`)} <span className="hint">({Math.round(c.weight * 100)} %)</span></strong>
              <span>{pct(c.score)}</span>
              <div className="bar"><span style={{ width: `${Math.round(c.score * 100)}%` }} /></div>
              <details style={{ gridColumn: '1 / -1' }}>
                <summary className="hint">{t('p3.review.detail')}</summary>
                <ul className="fb-list">
                  {c.items.map((i) => (
                    <li key={i.key}>
                      <span className={i.ok === true ? 'ok' : i.ok === null ? 'pending' : 'bad'}>{i.ok === true ? '✓' : i.ok === null ? '◐' : '✗'}</span>{' '}
                      {t(`f04.item.${i.key.replace('f04.', '')}`)} <span className="hint">({i.points.toFixed(1)}/{i.max})</span>
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
          {feedback.length ? <ul className="fb-list">{feedback.map((x, i) => <li key={i}><strong>{t(`f04.comp.${x.comp}`)}:</strong> {t(x.key, x.params)}</li>)}</ul> : <p className="ok">✓</p>}
        </section>

        <section className="panel">
          <h2>{t('f04.review.causes')}</h2>
          {committed.length ? (
            <ul className="fb-list">{committed.map((x) => <li key={x.id}><strong>{x.id}</strong> · {t(x.feedbackKey)}</li>)}</ul>
          ) : <p className="ok">✓ {t('f04.review.noErrors')}</p>}
        </section>

        <section className="panel">
          <h2>{t('f04.review.quant')}</h2>
          <div className="table-scroll">
            <table className="data">
              <thead><tr><th>{t('f04.review.qty')}</th><th>{t('f04.review.yours')}</th><th>{t('f04.review.engine')}</th></tr></thead>
              <tbody>
                <tr><td>{t('f04.review.a')}</td><td>{f(er.aMean, 3)} ± {f(er.uA, 3)} m/s²</td><td>{f(aTrue, 3)} m/s²</td></tr>
                <tr><td>{t('f04.review.T')}</td><td>{f(er.TMean, 3)} ± {f(er.uT, 3)} N</td><td>{f(TTrue, 3)} N</td></tr>
                <tr><td>{t('f04.review.pred')}</td><td>{f(em.aPred, 3)} m/s² · {f(em.discrepancy, 1)} %</td><td>{t('f04.review.loss', { p: f(loss * 100, 1) })}</td></tr>
                <tr><td>{t('f04.review.slope')}</td><td>{f(es.slope, 3)} kg</td><td>{f(mc, 3)} kg</td></tr>
                <tr><td>{t('f04.review.third')}</td><td>{f(ep.sumF, 3)} N</td><td>{pairs.length ? '0,000 N' : '—'}</td></tr>
              </tbody>
            </table>
          </div>
          <p className="hint">{t('f04.review.note')}</p>
        </section>

        <section className="panel" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          <button className="btn primary" onClick={() => start({ sameSeed: true })}>{t('review.newSame')}</button>
          <button className="btn" onClick={() => { setSettings({ seed: newSeed() }); start({ sameSeed: true }); }}>{t('review.newSeed')}</button>
          <button className="btn" onClick={() => downloadJson(`informe-f04-${attemptId}.json`, { attemptId, settings, evaluation: ev, readings: w.readings, notebook: nb, issues, actions: rt.actions })}>{t('review.export')}</button>
          <button className="btn ghost" onClick={() => window.print()}>{t('p10.nb.print')}</button>
          <button className="btn ghost" onClick={backToIntro}>{t('review.back')}</button>
          <button className="btn ghost" onClick={onBack}>{t('menu.back')}</button>
        </section>
      </div>
    </main>
  );
}
