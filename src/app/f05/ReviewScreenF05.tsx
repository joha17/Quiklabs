import { useTranslation } from 'react-i18next';
import { useF05 } from './store';
import { downloadJson } from '../persistence';
import { newSeed } from '../../simulation/core/rng';
import { expectedModelF5, expectedMus, expectedSlide, expectedSlopeF5, rdF5 } from '../../practices/practice-f05/expected-results';
import { notebookIssuesF05 } from '../../practices/practice-f05/rubric';
import { criticalAngle } from '../../simulation/models/f05/equations';
import { SIMULATED_ERRORS_F05, errKeyF5 } from '../../practices/practice-f05/error-scenarios';

const pct = (v: number) => `${Math.round(v * 100)} %`;
const f = (v: number | null | undefined, d = 3) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(d).replace('.', ','));

/** Revisión: puntaje por componente, diagnóstico causal (errores F05-Exx) y comparación con la verdad del motor. */
export function ReviewScreenF05({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const ev = useF05((s) => s.evaluation);
  const rt = useF05((s) => s.runtime);
  const nb = useF05((s) => s.notebook);
  const start = useF05((s) => s.start);
  const setSettings = useF05((s) => s.setSettings);
  const backToIntro = useF05((s) => s.backToIntro);
  const attemptId = useF05((s) => s.attemptId);
  const settings = useF05((s) => s.settings);
  if (!ev || !rt) return null;
  const w = rt.world;
  const feedback = ev.components.flatMap((c) => c.items.filter((i) => i.feedbackKey && i.ok !== true).map((i) => ({ comp: c.id, key: i.feedbackKey!, params: i.params })));
  const issues = notebookIssuesF05(w, nb);
  const emu = expectedMus(w, nb);
  const es = expectedSlopeF5(w, nb);
  const em = expectedModelF5(w, nb);
  const sl = expectedSlide(w, nb);
  // Verdad del motor: coeficientes del revestimiento elegido, ángulo crítico que les corresponde y aceleración real de la bajada.
  const mat = (nb.material || 'wood') as keyof typeof w.params.mu;
  const mu = w.params.mu[mat] ?? w.params.mu.wood;
  const slideR = rdF5(w, nb.slide.readingId);
  const committed = SIMULATED_ERRORS_F05.filter((x) => (w.evidence[x.evidenceKey] ?? 0) > 0 || issues.includes(`nb:${errKeyF5(x)}`));
  return (
    <main className="review">
      <div className="review-card">
        <section className="panel" style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.4rem' }}>{t('f05.review.title')}</h1>
            <span className="hint">{t(`mode.${settings.mode}`)} · {t(`f05.intro.sci.${w.params.scientificMode}`)} · semilla {w.seed} · {Math.round(w.timeS / 60)} min</span>
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
              <strong>{t(`f05.comp.${c.id}`)} <span className="hint">({Math.round(c.weight * 100)} %)</span></strong>
              <span>{pct(c.score)}</span>
              <div className="bar"><span style={{ width: `${Math.round(c.score * 100)}%` }} /></div>
              <details style={{ gridColumn: '1 / -1' }}>
                <summary className="hint">{t('p3.review.detail')}</summary>
                <ul className="fb-list">
                  {c.items.map((i) => (
                    <li key={i.key}>
                      <span className={i.ok === true ? 'ok' : i.ok === null ? 'pending' : 'bad'}>{i.ok === true ? '✓' : i.ok === null ? '◐' : '✗'}</span>{' '}
                      {t(`f05.item.${i.key.replace('f05.', '')}`)} <span className="hint">({i.points.toFixed(1)}/{i.max})</span>
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
          {feedback.length ? <ul className="fb-list">{feedback.map((x, i) => <li key={i}><strong>{t(`f05.comp.${x.comp}`)}:</strong> {t(x.key, x.params)}</li>)}</ul> : <p className="ok">✓</p>}
        </section>

        <section className="panel">
          <h2>{t('f05.review.causes')}</h2>
          {committed.length ? (
            <ul className="fb-list">{committed.map((x) => <li key={x.id}><strong>{x.id}</strong> · {t(x.feedbackKey)}</li>)}</ul>
          ) : <p className="ok">✓ {t('f05.review.noErrors')}</p>}
        </section>

        <section className="panel">
          <h2>{t('f05.review.quant')}</h2>
          <div className="table-scroll">
            <table className="data">
              <thead><tr><th>{t('f05.review.qty')}</th><th>{t('f05.review.yours')}</th><th>{t('f05.review.engine')}</th></tr></thead>
              <tbody>
                <tr><td>{t('f05.review.muS')}</td><td>{f(emu.muS, 3)} ± {f(emu.uS, 3)}</td><td>{f(mu.s, 3)}</td></tr>
                <tr><td>{t('f05.review.muK')}</td><td>{f(emu.muK, 3)} ± {f(emu.uK, 3)}</td><td>{f(mu.k, 3)}</td></tr>
                <tr><td>{t('f05.review.slope')}</td><td>{f(es.slope, 3)}</td><td>{f(mu.k, 3)}</td></tr>
                <tr><td>{t('f05.review.theta')}</td><td>{f(em.thetaMeas, 1)}° · {f(em.thetaPred, 1)}° · {f(em.thetaDisc, 1)} %</td><td>{f(criticalAngle(mu.s), 1)}°</td></tr>
                <tr><td>{t('f05.review.a')}</td><td>{f(sl.a, 2)} m/s² · μ_k {f(em.muKSlide, 3)}</td><td>{f(slideR?.slide?.trueA, 2)} m/s²</td></tr>
                <tr><td>{t('f05.review.Wfr')}</td><td>{f(em.Wfr, 3)} J</td><td>—</td></tr>
              </tbody>
            </table>
          </div>
          <p className="hint">{t('f05.review.note')}</p>
        </section>

        <section className="panel" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          <button className="btn primary" onClick={() => start({ sameSeed: true })}>{t('review.newSame')}</button>
          <button className="btn" onClick={() => { setSettings({ seed: newSeed() }); start({ sameSeed: true }); }}>{t('review.newSeed')}</button>
          <button className="btn" onClick={() => downloadJson(`informe-f05-${attemptId}.json`, { attemptId, settings, evaluation: ev, readings: w.readings, notebook: nb, issues, actions: rt.actions })}>{t('review.export')}</button>
          <button className="btn ghost" onClick={() => window.print()}>{t('p10.nb.print')}</button>
          <button className="btn ghost" onClick={backToIntro}>{t('review.back')}</button>
          <button className="btn ghost" onClick={onBack}>{t('menu.back')}</button>
        </section>
      </div>
    </main>
  );
}
