import { useTranslation } from 'react-i18next';
import { useF04 } from './store';
import { downloadJson } from '../persistence';
import { newSeed } from '../../simulation/core/rng';
import { expectedRanges, expectedTrajectory, expectedVelocity } from '../../practices/practice-f04/expected-results';
import { notebookIssuesF04 } from '../../practices/practice-f04/rubric';
import { dragFraction } from '../../simulation/models/f04/regimes';
import { dragOn } from '../../simulation/f04-world/world';
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
  const ev0 = expectedVelocity(w, nb);
  const er = expectedRanges(w, nb);
  const et = expectedTrajectory(w, nb);
  // Verdad del motor: rapidez real de cada disparo leído (diámetro real / Δt real) y arrastre del modo activo.
  const gates = nb.velocity.map((x) => (x.readingId ? w.readings[x.readingId] : null)).filter((r) => r && r.kind === 'gate' && Number.isFinite(r.trueValue) && r.trueValue > 0);
  const vTrue = gates.length ? gates.reduce((s, r) => s + (w.balls[r!.setup?.ball ?? 'ballA']?.diameterM ?? 0.025) / r!.trueValue, 0) / gates.length : NaN;
  const b = w.balls.ballA;
  const drag = dragOn(w) ? dragFraction(vTrue, b.massKg, w.params.g, w.params.airDensity, w.params.sphereCd, Math.PI * (b.diameterM / 2) ** 2) : 0;
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
                <tr><td>{t('f04.review.v0')}</td><td>{f(ev0.v0Mean, 3)} ± {f(ev0.uV, 3)} m/s</td><td>{f(vTrue, 3)} m/s</td></tr>
                <tr><td>{t('f04.review.range')}</td><td>{f(er.rangeErr, 1)} %</td><td>{t('f04.review.drag', { p: f(drag * 100, 1) })}</td></tr>
                <tr><td>{t('f04.review.fit')}</td><td>{f(et.fit.v0, 3)} m/s · θ {f(et.fit.thetaDeg, 1)}°</td><td>{f(vTrue, 3)} m/s</td></tr>
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
