import { useTranslation } from 'react-i18next';
import { useF09 } from './store';
import { downloadJson } from '../persistence';
import { newSeed } from '../../simulation/core/rng';
import { expectedCalcF9, rdF9 } from '../../practices/practice-f09/expected-results';
import { notebookIssuesF09 } from '../../practices/practice-f09/rubric';
import { SIMULATED_ERRORS_F09, errKeyF9 } from '../../practices/practice-f09/error-scenarios';

const pct = (v: number) => `${Math.round(v * 100)} %`;
const f = (v: number | null | undefined, d = 3) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(d).replace('.', ','));

/** Revisión: puntaje por componente, diagnóstico causal (errores F09-Exx) y comparación con la verdad del motor. */
export function ReviewScreenF09({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const ev = useF09((s) => s.evaluation);
  const rt = useF09((s) => s.runtime);
  const nb = useF09((s) => s.notebook);
  const start = useF09((s) => s.start);
  const setSettings = useF09((s) => s.setSettings);
  const backToIntro = useF09((s) => s.backToIntro);
  const attemptId = useF09((s) => s.attemptId);
  const settings = useF09((s) => s.settings);
  if (!ev || !rt) return null;
  const w = rt.world;
  const feedback = ev.components.flatMap((c) => c.items.filter((i) => i.feedbackKey && i.ok !== true).map((i) => ({ comp: c.id, key: i.feedbackKey!, params: i.params })));
  const issues = notebookIssuesF09(w, nb);
  const ec = expectedCalcF9(w, nb);
  // Verdad del motor: m r verdadero del montaje de las lecturas de fuerza, I verdadero de los tirones y L, K verdaderos
  // en ω₁ y ω₂ (con el I de la mesa en cada instante).
  const force = nb.circRows.map((r) => rdF9(w, r.forceId)).find((r) => r?.setup?.orbitR);
  const trueMr = force?.setup?.orbitR ? w.params.orbitKg * force.setup.orbitR : NaN;
  const encs = nb.torqueRows.map((r) => rdF9(w, r.encId)?.fit?.trueI ?? NaN).filter(Number.isFinite);
  const trueItorque = encs.length ? encs.reduce((x, y) => x + y, 0) / encs.length : NaN;
  const r1 = rdF9(w, nb.momentum.w1Id);
  const r2 = rdF9(w, nb.momentum.w2Id);
  const L = (r: typeof r1) => (r?.setup?.trueI ?? NaN) * (r?.trueValue ?? NaN);
  const K = (r: typeof r1) => 0.5 * (r?.setup?.trueI ?? NaN) * (r?.trueValue ?? NaN) ** 2;
  const trueLratio = L(r2) / L(r1);
  const trueKratio = K(r2) / K(r1);
  const committed = SIMULATED_ERRORS_F09.filter((x) => (w.evidence[x.evidenceKey] ?? 0) > 0 || issues.includes(`nb:${errKeyF9(x)}`));
  return (
    <main className="review">
      <div className="review-card">
        <section className="panel" style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.4rem' }}>{t('f09.review.title')}</h1>
            <span className="hint">{t(`mode.${settings.mode}`)} · {t(`f09.intro.sci.${w.params.scientificMode}`)} · semilla {w.seed} · {Math.round(w.timeS / 60)} min</span>
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
              <strong>{t(`f09.comp.${c.id}`)} <span className="hint">({Math.round(c.weight * 100)} %)</span></strong>
              <span>{pct(c.score)}</span>
              <div className="bar"><span style={{ width: `${Math.round(c.score * 100)}%` }} /></div>
              <details style={{ gridColumn: '1 / -1' }}>
                <summary className="hint">{t('p3.review.detail')}</summary>
                <ul className="fb-list">
                  {c.items.map((i) => (
                    <li key={i.key}>
                      <span className={i.ok === true ? 'ok' : i.ok === null ? 'pending' : 'bad'}>{i.ok === true ? '✓' : i.ok === null ? '◐' : '✗'}</span>{' '}
                      {t(`f09.item.${i.key.replace('f09.', '')}`)} <span className="hint">({i.points.toFixed(1)}/{i.max})</span>
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
          {feedback.length ? <ul className="fb-list">{feedback.map((x, i) => <li key={i}><strong>{t(`f09.comp.${x.comp}`)}:</strong> {t(x.key, x.params)}</li>)}</ul> : <p className="ok">✓</p>}
        </section>

        <section className="panel">
          <h2>{t('f09.review.causes')}</h2>
          {committed.length ? (
            <ul className="fb-list">{committed.map((x) => <li key={x.id}><strong>{x.id}</strong> · {t(x.feedbackKey)}</li>)}</ul>
          ) : <p className="ok">✓ {t('f09.review.noErrors')}</p>}
        </section>

        <section className="panel">
          <h2>{t('f09.review.quant')}</h2>
          <div className="table-scroll">
            <table className="data">
              <thead><tr><th>{t('f09.review.qty')}</th><th>{t('f09.review.yours')}</th><th>{t('f09.review.engine')}</th></tr></thead>
              <tbody>
                <tr><td>{t('f09.review.mr')}</td><td>{f(ec.mr, 4)} ± {f(ec.uMr, 4)} kg·m</td><td>{f(trueMr, 4)} kg·m</td></tr>
                <tr><td>{t('f09.review.mrPred')}</td><td>{f(ec.mrPred, 4)} kg·m</td><td>—</td></tr>
                <tr><td>{t('f09.review.Itorque')}</td><td>{f(ec.Itorque * 1e3, 2)} ± {f(ec.uI * 1e3, 2)} × 10⁻³ kg·m²</td><td>{f(trueItorque * 1e3, 2)} × 10⁻³ kg·m²</td></tr>
                <tr><td>{t('f09.review.Lratio')}</td><td>{f(ec.Lratio, 3)}</td><td>{f(trueLratio, 3)}</td></tr>
                <tr><td>{t('f09.review.Kratio')}</td><td>{f(ec.Kratio, 3)}</td><td>{f(trueKratio, 3)}</td></tr>
              </tbody>
            </table>
          </div>
          <p className="hint">{t('f09.review.note')}</p>
        </section>

        <section className="panel" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          <button className="btn primary" onClick={() => start({ sameSeed: true })}>{t('review.newSame')}</button>
          <button className="btn" onClick={() => { setSettings({ seed: newSeed() }); start({ sameSeed: true }); }}>{t('review.newSeed')}</button>
          <button className="btn" onClick={() => downloadJson(`informe-f09-${attemptId}.json`, { attemptId, settings, evaluation: ev, readings: w.readings, notebook: nb, issues, actions: rt.actions })}>{t('review.export')}</button>
          <button className="btn ghost" onClick={() => window.print()}>{t('p10.nb.print')}</button>
          <button className="btn ghost" onClick={backToIntro}>{t('review.back')}</button>
          <button className="btn ghost" onClick={onBack}>{t('menu.back')}</button>
        </section>
      </div>
    </main>
  );
}
