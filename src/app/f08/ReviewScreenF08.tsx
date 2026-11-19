import { useTranslation } from 'react-i18next';
import { useF08 } from './store';
import { downloadJson } from '../persistence';
import { newSeed } from '../../simulation/core/rng';
import { expectedCalcF8, rdF8 } from '../../practices/practice-f08/expected-results';
import { notebookIssuesF08 } from '../../practices/practice-f08/rubric';
import { SIMULATED_ERRORS_F08, errKeyF8 } from '../../practices/practice-f08/error-scenarios';

const pct = (v: number) => `${Math.round(v * 100)} %`;
const f = (v: number | null | undefined, d = 3) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(d).replace('.', ','));

/** Revisión: puntaje por componente, diagnóstico causal (errores F08-Exx) y comparación con la verdad del motor. */
export function ReviewScreenF08({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const ev = useF08((s) => s.evaluation);
  const rt = useF08((s) => s.runtime);
  const nb = useF08((s) => s.notebook);
  const start = useF08((s) => s.start);
  const setSettings = useF08((s) => s.setSettings);
  const backToIntro = useF08((s) => s.backToIntro);
  const attemptId = useF08((s) => s.attemptId);
  const settings = useF08((s) => s.settings);
  if (!ev || !rt) return null;
  const w = rt.world;
  const feedback = ev.components.flatMap((c) => c.items.filter((i) => i.feedbackKey && i.ok !== true).map((i) => ({ comp: c.id, key: i.feedbackKey!, params: i.params })));
  const issues = notebookIssuesF08(w, nb);
  const ec = expectedCalcF8(w, nb);
  // Verdad del motor: I verdaderos (del montaje al soltar) del eje, del disco y del aro, y del disco desplazado.
  const trueI = (id: string | null) => rdF8(w, id)?.fit?.trueI ?? NaN;
  const trueI0 = trueI(nb.axle.readingId);
  const trueDisk = trueI(nb.diskRows[0]?.readingId ?? null) - trueI0;
  const trueRing = trueI(nb.ring.readingId) - trueI0;
  const truePar = trueI(nb.parallel.readingId) - trueI0;
  const mr = nb.massRows.map((r) => ({ I: trueI(r.readingId), r: (rdF8(w, r.rId)?.trueValue ?? NaN) / 100 }));
  const trueSlope = mr.length >= 2 ? (mr[1].I - mr[0].I) / (mr[1].r ** 2 - mr[0].r ** 2) : NaN;
  const committed = SIMULATED_ERRORS_F08.filter((x) => (w.evidence[x.evidenceKey] ?? 0) > 0 || issues.includes(`nb:${errKeyF8(x)}`));
  return (
    <main className="review">
      <div className="review-card">
        <section className="panel" style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.4rem' }}>{t('f08.review.title')}</h1>
            <span className="hint">{t(`mode.${settings.mode}`)} · {t(`f08.intro.sci.${w.params.scientificMode}`)} · semilla {w.seed} · {Math.round(w.timeS / 60)} min</span>
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
              <strong>{t(`f08.comp.${c.id}`)} <span className="hint">({Math.round(c.weight * 100)} %)</span></strong>
              <span>{pct(c.score)}</span>
              <div className="bar"><span style={{ width: `${Math.round(c.score * 100)}%` }} /></div>
              <details style={{ gridColumn: '1 / -1' }}>
                <summary className="hint">{t('p3.review.detail')}</summary>
                <ul className="fb-list">
                  {c.items.map((i) => (
                    <li key={i.key}>
                      <span className={i.ok === true ? 'ok' : i.ok === null ? 'pending' : 'bad'}>{i.ok === true ? '✓' : i.ok === null ? '◐' : '✗'}</span>{' '}
                      {t(`f08.item.${i.key.replace('f08.', '')}`)} <span className="hint">({i.points.toFixed(1)}/{i.max})</span>
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
          {feedback.length ? <ul className="fb-list">{feedback.map((x, i) => <li key={i}><strong>{t(`f08.comp.${x.comp}`)}:</strong> {t(x.key, x.params)}</li>)}</ul> : <p className="ok">✓</p>}
        </section>

        <section className="panel">
          <h2>{t('f08.review.causes')}</h2>
          {committed.length ? (
            <ul className="fb-list">{committed.map((x) => <li key={x.id}><strong>{x.id}</strong> · {t(x.feedbackKey)}</li>)}</ul>
          ) : <p className="ok">✓ {t('f08.review.noErrors')}</p>}
        </section>

        <section className="panel">
          <h2>{t('f08.review.quant')}</h2>
          <div className="table-scroll">
            <table className="data">
              <thead><tr><th>{t('f08.review.qty')}</th><th>{t('f08.review.yours')}</th><th>{t('f08.review.engine')}</th></tr></thead>
              <tbody>
                <tr><td>{t('f08.review.Ipred')}</td><td>{f(ec.Ipred * 1e4, 3)} × 10⁻⁴ kg·m²</td><td>—</td></tr>
                <tr><td>{t('f08.review.Idisk')}</td><td>{f(ec.Idisk * 1e4, 3)} ± {f(ec.uIdisk * 1e4, 3)} × 10⁻⁴ kg·m²</td><td>{f(trueDisk * 1e4, 3)} × 10⁻⁴ kg·m²</td></tr>
                <tr><td>{t('f08.review.Iring')}</td><td>{f(ec.Iring * 1e4, 3)} ± {f(ec.uIring * 1e4, 3)} × 10⁻⁴ kg·m²</td><td>{f(trueRing * 1e4, 3)} × 10⁻⁴ kg·m²</td></tr>
                <tr><td>{t('f08.review.Ipar')}</td><td>{f(ec.IparMeas * 1e4, 3)} × 10⁻⁴ kg·m²</td><td>{f(truePar * 1e4, 3)} × 10⁻⁴ kg·m²</td></tr>
                <tr><td>{t('f08.review.slope')}</td><td>{f(ec.slope, 4)} kg</td><td>{f(trueSlope, 4)} kg</td></tr>
                <tr><td>{t('f08.review.Ebal')}</td><td>{f(ec.Ebal, 1)} %</td><td>—</td></tr>
              </tbody>
            </table>
          </div>
          <p className="hint">{t('f08.review.note')}</p>
        </section>

        <section className="panel" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          <button className="btn primary" onClick={() => start({ sameSeed: true })}>{t('review.newSame')}</button>
          <button className="btn" onClick={() => { setSettings({ seed: newSeed() }); start({ sameSeed: true }); }}>{t('review.newSeed')}</button>
          <button className="btn" onClick={() => downloadJson(`informe-f08-${attemptId}.json`, { attemptId, settings, evaluation: ev, readings: w.readings, notebook: nb, issues, actions: rt.actions })}>{t('review.export')}</button>
          <button className="btn ghost" onClick={() => window.print()}>{t('p10.nb.print')}</button>
          <button className="btn ghost" onClick={backToIntro}>{t('review.back')}</button>
          <button className="btn ghost" onClick={onBack}>{t('menu.back')}</button>
        </section>
      </div>
    </main>
  );
}
