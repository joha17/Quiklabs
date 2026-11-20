import { useTranslation } from 'react-i18next';
import { useF10 } from './store';
import { downloadJson } from '../persistence';
import { newSeed } from '../../simulation/core/rng';
import { expectedCalcF10, rdF10 } from '../../practices/practice-f10/expected-results';
import { notebookIssuesF10 } from '../../practices/practice-f10/rubric';
import { SIMULATED_ERRORS_F10, errKeyF10 } from '../../practices/practice-f10/error-scenarios';

const pct = (v: number) => `${Math.round(v * 100)} %`;
const f = (v: number | null | undefined, d = 3) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(d).replace('.', ','));

/** Revisión: puntaje por componente, diagnóstico causal (errores F10-Exx) y comparación con la verdad del motor. */
export function ReviewScreenF10({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const ev = useF10((s) => s.evaluation);
  const rt = useF10((s) => s.runtime);
  const nb = useF10((s) => s.notebook);
  const start = useF10((s) => s.start);
  const setSettings = useF10((s) => s.setSettings);
  const backToIntro = useF10((s) => s.backToIntro);
  const attemptId = useF10((s) => s.attemptId);
  const settings = useF10((s) => s.settings);
  if (!ev || !rt) return null;
  const w = rt.world;
  const feedback = ev.components.flatMap((c) => c.items.filter((i) => i.feedbackKey && i.ok !== true).map((i) => ({ comp: c.id, key: i.feedbackKey!, params: i.params })));
  const issues = notebookIssuesF10(w, nb);
  const ec = expectedCalcF10(w, nb);
  // Verdad del motor: el E del material de las probetas ensayadas, el peso verdadero de la carga y la deformación
  // residual verdadera de la lectura que usaste.
  const fr = nb.elRows.map((r) => rdF10(w, r.fId)).find((r) => r?.press?.trueE);
  const trueE = fr?.press?.trueE ?? w.params.materials[w.params.material].E;
  const trueW1 = w.params.loadKg * w.params.g;
  const res = rdF10(w, nb.plastic.resId);
  const trueRes = res ? res.trueValue : NaN;
  const yourRes = res ? res.value : NaN;
  const committed = SIMULATED_ERRORS_F10.filter((x) => (w.evidence[x.evidenceKey] ?? 0) > 0 || issues.includes(`nb:${errKeyF10(x)}`));
  return (
    <main className="review">
      <div className="review-card">
        <section className="panel" style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.4rem' }}>{t('f10.review.title')}</h1>
            <span className="hint">{t(`mode.${settings.mode}`)} · {t(`f10.intro.sci.${w.params.scientificMode}`)} · semilla {w.seed} · {Math.round(w.timeS / 60)} min</span>
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
              <strong>{t(`f10.comp.${c.id}`)} <span className="hint">({Math.round(c.weight * 100)} %)</span></strong>
              <span>{pct(c.score)}</span>
              <div className="bar"><span style={{ width: `${Math.round(c.score * 100)}%` }} /></div>
              <details style={{ gridColumn: '1 / -1' }}>
                <summary className="hint">{t('p3.review.detail')}</summary>
                <ul className="fb-list">
                  {c.items.map((i) => (
                    <li key={i.key}>
                      <span className={i.ok === true ? 'ok' : i.ok === null ? 'pending' : 'bad'}>{i.ok === true ? '✓' : i.ok === null ? '◐' : '✗'}</span>{' '}
                      {t(`f10.item.${i.key.replace('f10.', '')}`)} <span className="hint">({i.points.toFixed(1)}/{i.max})</span>
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
          {feedback.length ? <ul className="fb-list">{feedback.map((x, i) => <li key={i}><strong>{t(`f10.comp.${x.comp}`)}:</strong> {t(x.key, x.params)}</li>)}</ul> : <p className="ok">✓</p>}
        </section>

        <section className="panel">
          <h2>{t('f10.review.causes')}</h2>
          {committed.length ? (
            <ul className="fb-list">{committed.map((x) => <li key={x.id}><strong>{x.id}</strong> · {t(x.feedbackKey)}</li>)}</ul>
          ) : <p className="ok">✓ {t('f10.review.noErrors')}</p>}
        </section>

        <section className="panel">
          <h2>{t('f10.review.quant')}</h2>
          <div className="table-scroll">
            <table className="data">
              <thead><tr><th>{t('f10.review.qty')}</th><th>{t('f10.review.yours')}</th><th>{t('f10.review.engine')}</th></tr></thead>
              <tbody>
                <tr><td>{t('f10.review.E')}</td><td>{f(ec.E / 1e9, 1)} ± {f(ec.uE / 1e9, 1)} GPa</td><td>{f(trueE / 1e9, 1)} GPa</td></tr>
                <tr><td>{t('f10.review.Edev')}</td><td>{f(ec.Edev, 1)} %</td><td>—</td></tr>
                <tr><td>{t('f10.review.W1')}</td><td>{f(ec.W1slope, 2)} ± {f(ec.uW1, 2)} N</td><td>{f(trueW1, 2)} N</td></tr>
                <tr><td>{t('f10.review.residual')}</td><td>{f(yourRes, 3)} mm</td><td>{f(trueRes, 3)} mm</td></tr>
              </tbody>
            </table>
          </div>
          <p className="hint">{t('f10.review.note')}</p>
        </section>

        <section className="panel" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          <button className="btn primary" onClick={() => start({ sameSeed: true })}>{t('review.newSame')}</button>
          <button className="btn" onClick={() => { setSettings({ seed: newSeed() }); start({ sameSeed: true }); }}>{t('review.newSeed')}</button>
          <button className="btn" onClick={() => downloadJson(`informe-f10-${attemptId}.json`, { attemptId, settings, evaluation: ev, readings: w.readings, notebook: nb, issues, actions: rt.actions })}>{t('review.export')}</button>
          <button className="btn ghost" onClick={() => window.print()}>{t('p10.nb.print')}</button>
          <button className="btn ghost" onClick={backToIntro}>{t('review.back')}</button>
          <button className="btn ghost" onClick={onBack}>{t('menu.back')}</button>
        </section>
      </div>
    </main>
  );
}
