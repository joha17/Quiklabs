import { useTranslation } from 'react-i18next';
import { useF102 } from './store';
import { downloadJson } from '../persistence';
import { newSeed } from '../../simulation/core/rng';
import { expectedAccel, expectedDrag, expectedFall, expectedPrediction } from '../../practices/practice-f102/expected-results';
import { notebookIssuesF102 } from '../../practices/practice-f102/rubric';
import { atwoodAccel } from '../../simulation/models/f102/equations';
import { SIMULATED_ERRORS_F102, errKeyF2 } from '../../practices/practice-f102/error-scenarios';

const pct = (v: number) => `${Math.round(v * 100)} %`;
const f = (v: number | null | undefined, d = 3) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(d).replace('.', ','));

/** Revisión: puntaje por componente, diagnóstico causal (errores F102-Exx) y comparación con la verdad del motor. */
export function ReviewScreenF102({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const ev = useF102((s) => s.evaluation);
  const rt = useF102((s) => s.runtime);
  const nb = useF102((s) => s.notebook);
  const start = useF102((s) => s.start);
  const setSettings = useF102((s) => s.setSettings);
  const backToIntro = useF102((s) => s.backToIntro);
  const attemptId = useF102((s) => s.attemptId);
  const settings = useF102((s) => s.settings);
  if (!ev || !rt) return null;
  const w = rt.world;
  const feedback = ev.components.flatMap((c) => c.items.filter((i) => i.feedbackKey && i.ok !== true).map((i) => ({ comp: c.id, key: i.feedbackKey!, params: i.params })));
  const issues = notebookIssuesF102(w, nb);
  const ea = expectedAccel(w, nb);
  const ep = expectedPrediction(w, nb);
  const ef = expectedFall(w, nb);
  const ed = expectedDrag(w, nb);
  // Verdad del motor: masas reales (no las rotuladas) e inercia de la polea del modo activo.
  const mhTrue = Number.isFinite(ep.mh) ? (ep.mh * w.masses.hanger01.trueG) / w.masses.hanger01.nominalG : NaN;
  const aEngine = atwoodAccel(w.masses.cart01.trueG / 1000, mhTrue, w.params.g, w.params.pulleyEqKg);
  const committed = SIMULATED_ERRORS_F102.filter((x) => (w.evidence[x.evidenceKey] ?? 0) > 0 || issues.includes(`nb:${errKeyF2(x)}`));
  return (
    <main className="review">
      <div className="review-card">
        <section className="panel" style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.4rem' }}>{t('f102.review.title')}</h1>
            <span className="hint">{t(`mode.${settings.mode}`)} · {t(`f102.intro.sci.${w.params.scientificMode}`)} · semilla {w.seed} · {Math.round(w.timeS / 60)} min</span>
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
              <strong>{t(`f102.comp.${c.id}`)} <span className="hint">({Math.round(c.weight * 100)} %)</span></strong>
              <span>{pct(c.score)}</span>
              <div className="bar"><span style={{ width: `${Math.round(c.score * 100)}%` }} /></div>
              <details style={{ gridColumn: '1 / -1' }}>
                <summary className="hint">{t('p3.review.detail')}</summary>
                <ul className="fb-list">
                  {c.items.map((i) => (
                    <li key={i.key}>
                      <span className={i.ok === true ? 'ok' : i.ok === null ? 'pending' : 'bad'}>{i.ok === true ? '✓' : i.ok === null ? '◐' : '✗'}</span>{' '}
                      {t(`f102.item.${i.key.replace('f102.', '')}`)} <span className="hint">({i.points.toFixed(1)}/{i.max})</span>
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
          {feedback.length ? <ul className="fb-list">{feedback.map((x, i) => <li key={i}><strong>{t(`f102.comp.${x.comp}`)}:</strong> {t(x.key, x.params)}</li>)}</ul> : <p className="ok">✓</p>}
        </section>

        <section className="panel">
          <h2>{t('f102.review.causes')}</h2>
          {committed.length ? (
            <ul className="fb-list">{committed.map((x) => <li key={x.id}><strong>{x.id}</strong> · {t(x.feedbackKey)}</li>)}</ul>
          ) : <p className="ok">✓ {t('f102.review.noErrors')}</p>}
        </section>

        <section className="panel">
          <h2>{t('f102.review.quant')}</h2>
          <div className="table-scroll">
            <table className="data">
              <thead><tr><th>{t('f102.review.qty')}</th><th>{t('f102.review.yours')}</th><th>{t('f102.review.engine')}</th></tr></thead>
              <tbody>
                <tr><td>{t('f102.review.accel')}</td><td>{f(ea.aMean, 3)} ± {f(ea.uA, 3)} m/s² · {t('f102.review.pred', { a: f(ep.aPred, 3) })}</td><td>{t('f102.review.aEngine', { a: f(aEngine, 3) })}</td></tr>
                <tr><td>{t('f102.review.g')}</td><td>{f(ef.gMean, 3)} ± {f(ef.uG, 3)} m/s²</td><td>{f(w.params.g, 2)} m/s² · {t('f102.review.delay', { ms: f(w.params.magnetDelayS * 1000, 1) })}</td></tr>
                <tr><td>{t('f102.review.terminal')}</td><td>{f(ed.ratio, 3)}</td><td>{t('f102.review.theory', { r: f(ed.theory, 3) })}</td></tr>
              </tbody>
            </table>
          </div>
          <p className="hint">{t('f102.review.note')}</p>
        </section>

        <section className="panel" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          <button className="btn primary" onClick={() => start({ sameSeed: true })}>{t('review.newSame')}</button>
          <button className="btn" onClick={() => { setSettings({ seed: newSeed() }); start({ sameSeed: true }); }}>{t('review.newSeed')}</button>
          <button className="btn" onClick={() => downloadJson(`informe-f102-${attemptId}.json`, { attemptId, settings, evaluation: ev, readings: w.readings, notebook: nb, issues, actions: rt.actions })}>{t('review.export')}</button>
          <button className="btn ghost" onClick={() => window.print()}>{t('p10.nb.print')}</button>
          <button className="btn ghost" onClick={backToIntro}>{t('review.back')}</button>
          <button className="btn ghost" onClick={onBack}>{t('menu.back')}</button>
        </section>
      </div>
    </main>
  );
}
