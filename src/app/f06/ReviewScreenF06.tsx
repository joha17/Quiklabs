import { useTranslation } from 'react-i18next';
import { useF06 } from './store';
import { downloadJson } from '../persistence';
import { newSeed } from '../../simulation/core/rng';
import { expectedCalcF6, rdF6, setupMassesKg } from '../../practices/practice-f06/expected-results';
import { notebookIssuesF06 } from '../../practices/practice-f06/rubric';
import { kineticEnergy } from '../../simulation/models/f06/equations';
import { SIMULATED_ERRORS_F06, errKeyF6 } from '../../practices/practice-f06/error-scenarios';

const pct = (v: number) => `${Math.round(v * 100)} %`;
const f = (v: number | null | undefined, d = 3) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(d).replace('.', ','));

/** Revisión: puntaje por componente, diagnóstico causal (errores F06-Exx) y comparación con la verdad del motor. */
export function ReviewScreenF06({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const ev = useF06((s) => s.evaluation);
  const rt = useF06((s) => s.runtime);
  const nb = useF06((s) => s.notebook);
  const start = useF06((s) => s.start);
  const setSettings = useF06((s) => s.setSettings);
  const backToIntro = useF06((s) => s.backToIntro);
  const attemptId = useF06((s) => s.attemptId);
  const settings = useF06((s) => s.settings);
  if (!ev || !rt) return null;
  const w = rt.world;
  const feedback = ev.components.flatMap((c) => c.items.filter((i) => i.feedbackKey && i.ok !== true).map((i) => ({ comp: c.id, key: i.feedbackKey!, params: i.params })));
  const issues = notebookIssuesF06(w, nb);
  const ec = expectedCalcF6(w, nb);
  // Verdad del motor: rigidez del resorte calibrado, trabajo verdadero de cada disparo y energía cinética verdadera.
  const calSpring = rdF6(w, nb.springRows.find((r) => r.readingId)?.readingId ?? null)?.setup?.springId ?? 'spring01';
  const kTrue = w.params.springK * (w.springs[calSpring]?.kFactor ?? 1);
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
  const trueW = mean(nb.launchRows.map((r) => rdF6(w, r.readingId)?.launch?.trueW ?? NaN).filter(Number.isFinite));
  const { mc } = setupMassesKg(w, nb);
  const mTrue = Number.isFinite(mc) ? w.params.cartKg : NaN;
  const trueK1 = mean(nb.repRows.map((r) => rdF6(w, r.readingId)?.gates?.trueV1 ?? NaN).filter(Number.isFinite).map((v) => kineticEnergy(mTrue, v)));
  const committed = SIMULATED_ERRORS_F06.filter((x) => (w.evidence[x.evidenceKey] ?? 0) > 0 || issues.includes(`nb:${errKeyF6(x)}`));
  return (
    <main className="review">
      <div className="review-card">
        <section className="panel" style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.4rem' }}>{t('f06.review.title')}</h1>
            <span className="hint">{t(`mode.${settings.mode}`)} · {t(`f06.intro.sci.${w.params.scientificMode}`)} · semilla {w.seed} · {Math.round(w.timeS / 60)} min</span>
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
              <strong>{t(`f06.comp.${c.id}`)} <span className="hint">({Math.round(c.weight * 100)} %)</span></strong>
              <span>{pct(c.score)}</span>
              <div className="bar"><span style={{ width: `${Math.round(c.score * 100)}%` }} /></div>
              <details style={{ gridColumn: '1 / -1' }}>
                <summary className="hint">{t('p3.review.detail')}</summary>
                <ul className="fb-list">
                  {c.items.map((i) => (
                    <li key={i.key}>
                      <span className={i.ok === true ? 'ok' : i.ok === null ? 'pending' : 'bad'}>{i.ok === true ? '✓' : i.ok === null ? '◐' : '✗'}</span>{' '}
                      {t(`f06.item.${i.key.replace('f06.', '')}`)} <span className="hint">({i.points.toFixed(1)}/{i.max})</span>
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
          {feedback.length ? <ul className="fb-list">{feedback.map((x, i) => <li key={i}><strong>{t(`f06.comp.${x.comp}`)}:</strong> {t(x.key, x.params)}</li>)}</ul> : <p className="ok">✓</p>}
        </section>

        <section className="panel">
          <h2>{t('f06.review.causes')}</h2>
          {committed.length ? (
            <ul className="fb-list">{committed.map((x) => <li key={x.id}><strong>{x.id}</strong> · {t(x.feedbackKey)}</li>)}</ul>
          ) : <p className="ok">✓ {t('f06.review.noErrors')}</p>}
        </section>

        <section className="panel">
          <h2>{t('f06.review.quant')}</h2>
          <div className="table-scroll">
            <table className="data">
              <thead><tr><th>{t('f06.review.qty')}</th><th>{t('f06.review.yours')}</th><th>{t('f06.review.engine')}</th></tr></thead>
              <tbody>
                <tr><td>{t('f06.review.k')}</td><td>{f(ec.sp.k, 1)} ± {f(ec.sp.uk, 1)} N/m</td><td>{f(kTrue, 1)} N/m</td></tr>
                <tr><td>{t('f06.review.W')}</td><td>{f(ec.W, 3)} ± {f(ec.uW, 3)} J</td><td>{f(trueW, 3)} J</td></tr>
                <tr><td>{t('f06.review.K1')}</td><td>{f(ec.K1, 3)} ± {f(ec.uK1, 3)} J</td><td>{f(trueK1, 3)} J</td></tr>
                <tr><td>{t('f06.review.eff')}</td><td>{f(ec.eff, 1)} %</td><td>{f((100 * trueK1) / trueW, 1)} %</td></tr>
                <tr><td>{t('f06.review.Wnc')}</td><td>{f(ec.Wnc, 3)} J · W_neto {f(ec.Wnet, 3)} J</td><td>—</td></tr>
                <tr><td>{t('f06.review.Pmax')}</td><td>{f(ec.Pmax, 1)} W · {f(ec.Pavg, 1)} W</td><td>—</td></tr>
                <tr><td>{t('f06.review.pend')}</td><td>{f(ec.pendDisc, 2)} %</td><td>0</td></tr>
              </tbody>
            </table>
          </div>
          <p className="hint">{t('f06.review.note')}</p>
        </section>

        <section className="panel" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          <button className="btn primary" onClick={() => start({ sameSeed: true })}>{t('review.newSame')}</button>
          <button className="btn" onClick={() => { setSettings({ seed: newSeed() }); start({ sameSeed: true }); }}>{t('review.newSeed')}</button>
          <button className="btn" onClick={() => downloadJson(`informe-f06-${attemptId}.json`, { attemptId, settings, evaluation: ev, readings: w.readings, notebook: nb, issues, actions: rt.actions })}>{t('review.export')}</button>
          <button className="btn ghost" onClick={() => window.print()}>{t('p10.nb.print')}</button>
          <button className="btn ghost" onClick={backToIntro}>{t('review.back')}</button>
          <button className="btn ghost" onClick={onBack}>{t('menu.back')}</button>
        </section>
      </div>
    </main>
  );
}
