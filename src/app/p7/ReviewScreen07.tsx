import { useTranslation } from 'react-i18next';
import { useP07 } from './store';
import { downloadJson } from '../persistence';
import { newSeed } from '../../simulation/core/rng';
import { notebookIssues } from '../../practices/practice-07/rubric';
import { expectedClass, kappaClass, kappaReadings, reportableConc, unknownTests } from '../../practices/practice-07/expected-results';
import { ROWS_D } from '../../practices/practice-07/notebook';
import { p07NameOf } from './describe';

const pct = (v: number) => `${Math.round(v * 100)} %`;
const f = (v: number | null | undefined, d = 3) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(d).replace('.', ','));

/**
 * Revisión (§5.F, §13): componentes y retroalimentación causal; lo que corresponde a las lecturas del estudiante frente
 * a la verdad del motor (después de la entrega, nunca antes) y la identidad de las incógnitas con sus pruebas.
 */
export function ReviewScreen07({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const ev = useP07((s) => s.evaluation);
  const rt = useP07((s) => s.runtime);
  const nb = useP07((s) => s.notebook);
  const start = useP07((s) => s.start);
  const setSettings = useP07((s) => s.setSettings);
  const backToIntro = useP07((s) => s.backToIntro);
  const attemptId = useP07((s) => s.attemptId);
  const settings = useP07((s) => s.settings);
  if (!ev || !rt) return null;
  const w = rt.world;
  const feedback = ev.components.flatMap((c) => c.items.filter((i) => i.feedbackKey).map((i) => ({ comp: c.id, key: i.feedbackKey!, params: i.params })));
  const issues = notebookIssues(w, nb);
  const kappas = kappaReadings(w);
  return (
    <main className="review">
      <div className="review-card">
        <section className="panel" style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.4rem' }}>{t('p7.review.title')}</h1>
            <span className="hint">{t(`mode.${settings.mode}`)} · {t('p7.modelBadge')} · semilla {w.seed} · {Math.round(w.timeS / 60)} min</span>
          </div>
          <span style={{ flex: 1 }} />
          <div style={{ textAlign: 'right' }}>
            <div className="label">{t('review.total')}</div>
            <div className="score-big">{pct(ev.total)}</div>
            {ev.needsTeacherReview.length > 0 && <div className="hint">{t('p7.review.provisional')}</div>}
          </div>
        </section>

        <section className="panel">
          <h2>{t('review.components')}</h2>
          {ev.components.map((c) => (
            <div key={c.id} className="comp">
              <strong>{t(`p7.comp.${c.id}`)} <span className="hint">({Math.round(c.weight * 100)} %)</span></strong>
              <span>{pct(c.score)}</span>
              <div className="bar"><span style={{ width: `${Math.round(c.score * 100)}%` }} /></div>
              <details style={{ gridColumn: '1 / -1' }}>
                <summary className="hint">{t('p3.review.detail')}</summary>
                <ul className="fb-list">
                  {c.items.map((i) => (
                    <li key={i.key}>
                      <span className={i.ok === true ? 'ok' : i.ok === null ? 'pending' : 'bad'}>{i.ok === true ? '✓' : i.ok === null ? '◐' : '✗'}</span>{' '}
                      {t(`p7.item.${i.key.replace('p7.', '')}`)} <span className="hint">({i.points.toFixed(1)}/{i.max}){i.ok === null ? ` · ${t('p7.review.pending')}` : ''}</span>
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
          {feedback.length ? <ul className="fb-list">{feedback.map((x, i) => <li key={i}><strong>{t(`p7.comp.${x.comp}`)}:</strong> {t(x.key, x.params)}</li>)}</ul> : <p className="ok">✓</p>}
          {issues.length > 0 && (
            <>
              <h3>{t('p7.review.issues')}</h3>
              <ul className="fb-list">{issues.map((k) => <li key={k}>{t(`p7fb.${k.split(':')[1]}`)}</li>)}</ul>
            </>
          )}
        </section>

        <section className="panel">
          <h2>{t('p7.review.kappa')}</h2>
          <div className="table-scroll">
            <table className="data">
              <thead><tr><th>{t('p7.review.reading')}</th><th>{t('p7.review.content')}</th><th>{t('p7.review.yours')}</th><th>{t('p7.review.engine')}</th></tr></thead>
              <tbody>
                {kappas.map((r) => (
                  <tr key={r.id}>
                    <td>{r.id} · {p07NameOf(w, r.targetId)}</td>
                    <td>{t(`p7.kclass.${kappaClass(r)}`)}{r.snapshot.trueConcM ? ` · ${f(r.snapshot.trueConcM, 5)} mol/L` : ''}</td>
                    <td>{f(r.value, r.unit === 'mS/cm' ? 2 : 1)} {r.unit}</td>
                    <td>{f(r.trueValue, r.unit === 'mS/cm' ? 2 : 1)} {r.unit}</td>
                  </tr>
                ))}
                {ROWS_D.filter((k) => nb.tableD[k].conc.value).map((k) => (
                  <tr key={k}><td>{t(`p7.nb.rowD.${k}`)}</td><td>{t('p7.review.concYours')}</td><td>{nb.tableD[k].conc.value} mol/L</td><td>{f(reportableConc(w, nb.tableD[k]), 5)} mol/L</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="hint">{t('p7.review.note')}</p>
        </section>

        <section className="panel">
          <h2>{t('p7.review.unknowns')}</h2>
          <ul className="fb-list">
            {(['X', 'Y'] as const).map((k) => {
              const u = w.unknowns[k];
              if (!u) return null;
              const tests = [...unknownTests(w, k)];
              return (
                <li key={k}>
                  <strong>{u.code}</strong>: {t(`p7.matName.${u.material}`)} ({t(`p7.class.${expectedClass(u.material)}`)}) · {t('p7.review.yourClass')}: {nb.tableE[k].classification ? t(`p7.class.${nb.tableE[k].classification}`) : '—'} · {t('p7.review.tests')}: {tests.map((x) => t(`p7.group.${x}`)).join(', ') || '—'}
                </li>
              );
            })}
          </ul>
        </section>

        <section className="panel">
          <h2>{t('p7.review.causes')}</h2>
          <ul className="fb-list">
            {Object.entries(w.evidence).filter(([k, v]) => k.startsWith('err:') && v).map(([k]) => <li key={k}>{t(`p7fb.${k.slice(4)}`)}</li>)}
          </ul>
        </section>

        <section className="panel" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          <button className="btn primary" onClick={() => start({ sameSeed: true })}>{t('review.newSame')}</button>
          <button className="btn" onClick={() => { setSettings({ seed: newSeed() }); start({ sameSeed: true }); }}>{t('review.newSeed')}</button>
          <button className="btn" onClick={() => downloadJson(`informe-p7-${attemptId}.json`, { attemptId, settings, evaluation: ev, readings: w.readings, notebook: nb, issues, actions: rt.actions })}>{t('review.export')}</button>
          <button className="btn ghost" onClick={() => window.print()}>{t('p10.nb.print')}</button>
          <button className="btn ghost" onClick={backToIntro}>{t('review.back')}</button>
          <button className="btn ghost" onClick={onBack}>{t('menu.back')}</button>
        </section>
      </div>
    </main>
  );
}
