import { useTranslation } from 'react-i18next';
import { useF11 } from './store';
import { downloadJson } from '../persistence';
import { newSeed } from '../../simulation/core/rng';
import { expectedCalcF11 } from '../../practices/practice-f11/expected-results';
import { notebookIssuesF11 } from '../../practices/practice-f11/rubric';
import { SIMULATED_ERRORS_F11, errKeyF11 } from '../../practices/practice-f11/error-scenarios';

const pct = (v: number) => `${Math.round(v * 100)} %`;
const f = (v: number | null | undefined, d = 3) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(d).replace('.', ','));

/** Revisión: puntaje por componente, diagnóstico causal (errores F11-Exx) y comparación con la verdad del motor. */
export function ReviewScreenF11({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const ev = useF11((s) => s.evaluation);
  const rt = useF11((s) => s.runtime);
  const nb = useF11((s) => s.notebook);
  const start = useF11((s) => s.start);
  const setSettings = useF11((s) => s.setSettings);
  const backToIntro = useF11((s) => s.backToIntro);
  const attemptId = useF11((s) => s.attemptId);
  const settings = useF11((s) => s.settings);
  if (!ev || !rt) return null;
  const w = rt.world;
  const feedback = ev.components.flatMap((c) => c.items.filter((i) => i.feedbackKey && i.ok !== true).map((i) => ({ comp: c.id, key: i.feedbackKey!, params: i.params })));
  const issues = notebookIssuesF11(w, nb);
  const ec = expectedCalcF11(w, nb);
  // Verdad del motor: las densidades verdaderas de los dos líquidos y el empuje verdadero sobre el bloque de aluminio
  // completamente sumergido.
  const p = w.params;
  const trueFb = (p.rhoA * p.g * p.alu.L * p.alu.W * p.alu.H) / 1e6;
  const committed = SIMULATED_ERRORS_F11.filter((x) => (w.evidence[x.evidenceKey] ?? 0) > 0 || issues.includes(`nb:${errKeyF11(x)}`));
  return (
    <main className="review">
      <div className="review-card">
        <section className="panel" style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.4rem' }}>{t('f11.review.title')}</h1>
            <span className="hint">{t(`mode.${settings.mode}`)} · {t(`f11.intro.sci.${w.params.scientificMode}`)} · semilla {w.seed} · {Math.round(w.timeS / 60)} min</span>
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
              <strong>{t(`f11.comp.${c.id}`)} <span className="hint">({Math.round(c.weight * 100)} %)</span></strong>
              <span>{pct(c.score)}</span>
              <div className="bar"><span style={{ width: `${Math.round(c.score * 100)}%` }} /></div>
              <details style={{ gridColumn: '1 / -1' }}>
                <summary className="hint">{t('p3.review.detail')}</summary>
                <ul className="fb-list">
                  {c.items.map((i) => (
                    <li key={i.key}>
                      <span className={i.ok === true ? 'ok' : i.ok === null ? 'pending' : 'bad'}>{i.ok === true ? '✓' : i.ok === null ? '◐' : '✗'}</span>{' '}
                      {t(`f11.item.${i.key.replace('f11.', '')}`)} <span className="hint">({i.points.toFixed(1)}/{i.max})</span>
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
          {feedback.length ? <ul className="fb-list">{feedback.map((x, i) => <li key={i}><strong>{t(`f11.comp.${x.comp}`)}:</strong> {t(x.key, x.params)}</li>)}</ul> : <p className="ok">✓</p>}
        </section>

        <section className="panel">
          <h2>{t('f11.review.causes')}</h2>
          {committed.length ? (
            <ul className="fb-list">{committed.map((x) => <li key={x.id}><strong>{x.id}</strong> · {t(x.feedbackKey)}</li>)}</ul>
          ) : <p className="ok">✓ {t('f11.review.noErrors')}</p>}
        </section>

        <section className="panel">
          <h2>{t('f11.review.quant')}</h2>
          <div className="table-scroll">
            <table className="data">
              <thead><tr><th>{t('f11.review.qty')}</th><th>{t('f11.review.yours')}</th><th>{t('f11.review.engine')}</th></tr></thead>
              <tbody>
                <tr><td>{t('f11.review.rhoA')}</td><td>{f(ec.rhoA, 0)} ± {f(ec.uA, 0)} kg/m³</td><td>{f(p.rhoA, 0)} kg/m³</td></tr>
                <tr><td>{t('f11.review.rhoB')}</td><td>{f(ec.rhoB, 0)} ± {f(ec.uB, 0)} kg/m³</td><td>{f(p.rhoB, 0)} kg/m³</td></tr>
                <tr><td>{t('f11.review.rhoCyl')}</td><td>{f(ec.rhoCyl, 0)} ± {f(ec.uCyl, 0)} kg/m³</td><td>{f(p.rhoB, 0)} kg/m³</td></tr>
                <tr><td>{t('f11.review.Fb')}</td><td>{f(ec.FbFull, 3)} N · {f(ec.Fover, 3)} N</td><td>{f(trueFb, 3)} N</td></tr>
                <tr><td>{t('f11.review.FbDev')}</td><td>{f(ec.FbDev, 1)} %</td><td>—</td></tr>
              </tbody>
            </table>
          </div>
          <p className="hint">{t('f11.review.note')}</p>
        </section>

        <section className="panel" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          <button className="btn primary" onClick={() => start({ sameSeed: true })}>{t('review.newSame')}</button>
          <button className="btn" onClick={() => { setSettings({ seed: newSeed() }); start({ sameSeed: true }); }}>{t('review.newSeed')}</button>
          <button className="btn" onClick={() => downloadJson(`informe-f11-${attemptId}.json`, { attemptId, settings, evaluation: ev, readings: w.readings, notebook: nb, issues, actions: rt.actions })}>{t('review.export')}</button>
          <button className="btn ghost" onClick={() => window.print()}>{t('p10.nb.print')}</button>
          <button className="btn ghost" onClick={backToIntro}>{t('review.back')}</button>
          <button className="btn ghost" onClick={onBack}>{t('menu.back')}</button>
        </section>
      </div>
    </main>
  );
}
