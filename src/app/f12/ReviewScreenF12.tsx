import { useTranslation } from 'react-i18next';
import { useF12 } from './store';
import { downloadJson } from '../persistence';
import { newSeed } from '../../simulation/core/rng';
import { expectedCalcF12 } from '../../practices/practice-f12/expected-results';
import { notebookIssuesF12 } from '../../practices/practice-f12/rubric';
import { SIMULATED_ERRORS_F12, errKeyF12 } from '../../practices/practice-f12/error-scenarios';
import { trueLossKF12 } from '../../simulation/f12-world/world';

const pct = (v: number) => `${Math.round(v * 100)} %`;
const f = (v: number | null | undefined, d = 3) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(d).replace('.', ','));

/** Revisión: puntaje por componente, diagnóstico causal (errores F12-Exx) y comparación con la verdad del motor. */
export function ReviewScreenF12({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const ev = useF12((s) => s.evaluation);
  const rt = useF12((s) => s.runtime);
  const nb = useF12((s) => s.notebook);
  const start = useF12((s) => s.start);
  const setSettings = useF12((s) => s.setSettings);
  const backToIntro = useF12((s) => s.backToIntro);
  const attemptId = useF12((s) => s.attemptId);
  const settings = useF12((s) => s.settings);
  if (!ev || !rt) return null;
  const w = rt.world;
  const feedback = ev.components.flatMap((c) => c.items.filter((i) => i.feedbackKey && i.ok !== true).map((i) => ({ comp: c.id, key: i.feedbackKey!, params: i.params })));
  const issues = notebookIssuesF12(w, nb);
  const ec = expectedCalcF12(w, nb);
  // Verdad del motor: densidad del agua, diámetros interiores y K del tramo rugoso entre las tomas 1 y 3.
  const p = w.params;
  const trueK = trueLossKF12(w, 'rough');
  const committed = SIMULATED_ERRORS_F12.filter((x) => (w.evidence[x.evidenceKey] ?? 0) > 0 || issues.includes(`nb:${errKeyF12(x)}`));
  return (
    <main className="review">
      <div className="review-card">
        <section className="panel" style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.4rem' }}>{t('f12.review.title')}</h1>
            <span className="hint">{t(`mode.${settings.mode}`)} · {t(`f12.intro.sci.${w.params.scientificMode}`)} · semilla {w.seed} · {Math.round(w.timeS / 60)} min</span>
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
              <strong>{t(`f12.comp.${c.id}`)} <span className="hint">({Math.round(c.weight * 100)} %)</span></strong>
              <span>{pct(c.score)}</span>
              <div className="bar"><span style={{ width: `${Math.round(c.score * 100)}%` }} /></div>
              <details style={{ gridColumn: '1 / -1' }}>
                <summary className="hint">{t('p3.review.detail')}</summary>
                <ul className="fb-list">
                  {c.items.map((i) => (
                    <li key={i.key}>
                      <span className={i.ok === true ? 'ok' : i.ok === null ? 'pending' : 'bad'}>{i.ok === true ? '✓' : i.ok === null ? '◐' : '✗'}</span>{' '}
                      {t(`f12.item.${i.key.replace('f12.', '')}`)} <span className="hint">({i.points.toFixed(1)}/{i.max})</span>
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
          {feedback.length ? <ul className="fb-list">{feedback.map((x, i) => <li key={i}><strong>{t(`f12.comp.${x.comp}`)}:</strong> {t(x.key, x.params)}</li>)}</ul> : <p className="ok">✓</p>}
        </section>

        <section className="panel">
          <h2>{t('f12.review.causes')}</h2>
          {committed.length ? (
            <ul className="fb-list">{committed.map((x) => <li key={x.id}><strong>{x.id}</strong> · {t(x.feedbackKey)}</li>)}</ul>
          ) : <p className="ok">✓ {t('f12.review.noErrors')}</p>}
        </section>

        <section className="panel">
          <h2>{t('f12.review.quant')}</h2>
          <div className="table-scroll">
            <table className="data">
              <thead><tr><th>{t('f12.review.qty')}</th><th>{t('f12.review.yours')}</th><th>{t('f12.review.engine')}</th></tr></thead>
              <tbody>
                <tr><td>{t('f12.review.Qvol')}</td><td>{f(ec.Qvol, 3)} ± {f(ec.uQvol, 3)} L/s</td><td>—</td></tr>
                <tr><td>{t('f12.review.QDev')}</td><td>{f(ec.QDev, 1)} %</td><td>—</td></tr>
                <tr><td>{t('f12.review.rho')}</td><td>{f(ec.rhoFit, 0)} ± {f(ec.uRho, 0)} kg/m³</td><td>{f(p.rho, 0)} kg/m³</td></tr>
                <tr><td>{t('f12.review.K')}</td><td>{f(ec.K, 2)} ± {f(ec.uK, 2)}</td><td>{f(trueK, 2)}</td></tr>
                <tr><td>{t('f12.review.D')}</td><td>—</td><td>{f(p.D1 * 100, 2)} cm · {f(p.D2 * 100, 2)} cm</td></tr>
              </tbody>
            </table>
          </div>
          <p className="hint">{t('f12.review.note')}</p>
        </section>

        <section className="panel" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          <button className="btn primary" onClick={() => start({ sameSeed: true })}>{t('review.newSame')}</button>
          <button className="btn" onClick={() => { setSettings({ seed: newSeed() }); start({ sameSeed: true }); }}>{t('review.newSeed')}</button>
          <button className="btn" onClick={() => downloadJson(`informe-f12-${attemptId}.json`, { attemptId, settings, evaluation: ev, readings: w.readings, notebook: nb, issues, actions: rt.actions })}>{t('review.export')}</button>
          <button className="btn ghost" onClick={() => window.print()}>{t('p10.nb.print')}</button>
          <button className="btn ghost" onClick={backToIntro}>{t('review.back')}</button>
          <button className="btn ghost" onClick={onBack}>{t('menu.back')}</button>
        </section>
      </div>
    </main>
  );
}
