import { useTranslation } from 'react-i18next';
import { useF101 } from './store';
import { downloadJson } from '../persistence';
import { newSeed } from '../../simulation/core/rng';
import { expectedDensity, expectedVectors } from '../../practices/practice-f101/expected-results';
import { notebookIssuesF101 } from '../../practices/practice-f101/rubric';
import { partVolumeMl } from '../../simulation/f101-world/world';
import { SIMULATED_ERRORS_F101, errKeyF } from '../../practices/practice-f101/error-scenarios';

const pct = (v: number) => `${Math.round(v * 100)} %`;
const f = (v: number | null | undefined, d = 3) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(d).replace('.', ','));

/** Revisión: puntaje por componente, diagnóstico causal (errores F101-Exx) y comparación con la verdad del motor. */
export function ReviewScreenF101({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const ev = useF101((s) => s.evaluation);
  const rt = useF101((s) => s.runtime);
  const nb = useF101((s) => s.notebook);
  const start = useF101((s) => s.start);
  const setSettings = useF101((s) => s.setSettings);
  const backToIntro = useF101((s) => s.backToIntro);
  const attemptId = useF101((s) => s.attemptId);
  const settings = useF101((s) => s.settings);
  if (!ev || !rt) return null;
  const w = rt.world;
  const feedback = ev.components.flatMap((c) => c.items.filter((i) => i.feedbackKey && i.ok !== true).map((i) => ({ comp: c.id, key: i.feedbackKey!, params: i.params })));
  const issues = notebookIssuesF101(w, nb);
  const ed = expectedDensity(w, nb);
  const vec = expectedVectors(w, nb);
  const cyl = w.parts.metalCyl01;
  const committed = SIMULATED_ERRORS_F101.filter((x) => (w.evidence[x.evidenceKey] ?? 0) > 0 || issues.includes(`nb:${errKeyF(x)}`));
  return (
    <main className="review">
      <div className="review-card">
        <section className="panel" style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.4rem' }}>{t('f101.review.title')}</h1>
            <span className="hint">{t(`mode.${settings.mode}`)} · {t(`f101.intro.sci.${w.params.scientificMode}`)} · semilla {w.seed} · {Math.round(w.timeS / 60)} min</span>
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
              <strong>{t(`f101.comp.${c.id}`)} <span className="hint">({Math.round(c.weight * 100)} %)</span></strong>
              <span>{pct(c.score)}</span>
              <div className="bar"><span style={{ width: `${Math.round(c.score * 100)}%` }} /></div>
              <details style={{ gridColumn: '1 / -1' }}>
                <summary className="hint">{t('p3.review.detail')}</summary>
                <ul className="fb-list">
                  {c.items.map((i) => (
                    <li key={i.key}>
                      <span className={i.ok === true ? 'ok' : i.ok === null ? 'pending' : 'bad'}>{i.ok === true ? '✓' : i.ok === null ? '◐' : '✗'}</span>{' '}
                      {t(`f101.item.${i.key.replace('f101.', '')}`)} <span className="hint">({i.points.toFixed(1)}/{i.max})</span>
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
          {feedback.length ? <ul className="fb-list">{feedback.map((x, i) => <li key={i}><strong>{t(`f101.comp.${x.comp}`)}:</strong> {t(x.key, x.params)}</li>)}</ul> : <p className="ok">✓</p>}
        </section>

        <section className="panel">
          <h2>{t('f101.review.causes')}</h2>
          {committed.length ? (
            <ul className="fb-list">{committed.map((x) => <li key={x.id}><strong>{x.id}</strong> · {t(x.feedbackKey)}</li>)}</ul>
          ) : <p className="ok">✓ {t('f101.review.noErrors')}</p>}
        </section>

        <section className="panel">
          <h2>{t('f101.review.quant')}</h2>
          <div className="table-scroll">
            <table className="data">
              <thead><tr><th>{t('f101.review.qty')}</th><th>{t('f101.review.yours')}</th><th>{t('f101.review.engine')}</th></tr></thead>
              <tbody>
                <tr><td>{t('f101.review.rho')}</td><td>{f(ed.rho, 3)} ± {f(ed.urho, 3)} g/cm³</td><td>d {f(cyl.dMm, 3)} mm · h {f(cyl.hMm, 3)} mm · m {f(cyl.massG, 3)} g</td></tr>
                <tr><td>{t('f101.review.vDisp')}</td><td>{f(ed.V, 3)} cm³ · {f(ed.vDisp, 1)} mL</td><td>{f(partVolumeMl(w, 'metalCyl01'), 3)} cm³</td></tr>
                <tr><td>{t('f101.review.resultant')}</td><td>{f(vec.Rmag, 3)} N · {f(vec.thetaR, 1)}°</td><td>{t('f101.review.residual', { n: f(vec.residual, 3) })}</td></tr>
              </tbody>
            </table>
          </div>
          <p className="hint">{t('f101.review.note')}</p>
        </section>

        <section className="panel" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          <button className="btn primary" onClick={() => start({ sameSeed: true })}>{t('review.newSame')}</button>
          <button className="btn" onClick={() => { setSettings({ seed: newSeed() }); start({ sameSeed: true }); }}>{t('review.newSeed')}</button>
          <button className="btn" onClick={() => downloadJson(`informe-f101-${attemptId}.json`, { attemptId, settings, evaluation: ev, readings: w.readings, notebook: nb, issues, actions: rt.actions })}>{t('review.export')}</button>
          <button className="btn ghost" onClick={() => window.print()}>{t('p10.nb.print')}</button>
          <button className="btn ghost" onClick={backToIntro}>{t('review.back')}</button>
          <button className="btn ghost" onClick={onBack}>{t('menu.back')}</button>
        </section>
      </div>
    </main>
  );
}
