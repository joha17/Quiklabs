import { useTranslation } from 'react-i18next';
import { useP3 } from './store';
import { downloadJson } from '../persistence';
import { newSeed } from '../../simulation/core/rng';
import { SOLUTION_ROWS, UNKNOWN_ID } from '../../practices/practice-03/definition';
import { expectedFor, regionToNotebook } from '../../practices/practice-03/rubric';
import { capsuleTests } from '../../practices/practice-03/evidence';

const pct = (v: number) => `${Math.round(v * 100)} %`;

export function ReviewScreen3({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const ev = useP3((s) => s.evaluation);
  const rt = useP3((s) => s.runtime);
  const nb = useP3((s) => s.notebook);
  const start = useP3((s) => s.start);
  const setSettings = useP3((s) => s.setSettings);
  const backToIntro = useP3((s) => s.backToIntro);
  const attemptId = useP3((s) => s.attemptId);
  const settings = useP3((s) => s.settings);
  if (!ev || !rt) return null;
  const w = rt.world;
  const feedback = ev.components.flatMap((c) => c.items.filter((i) => i.feedbackKey).map((i) => ({ comp: c.id, key: i.feedbackKey!, params: i.params })));
  const caps = capsuleTests(w);
  const cname = (r: string | undefined) => (r ? t(`p3.color.${regionToNotebook(r)}`) : t('review.notMeasured'));
  return (
    <main className="review">
      <div className="review-card">
        <section className="panel" style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.4rem' }}>{t('p3.review.title')}</h1>
            <span className="hint">{t(`mode.${settings.mode}`)} · semilla {w.seed} · {Math.round(w.timeS / 60)} min · {t(`p3.fuel.${w.burner.fuel}`)}</span>
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
              <strong>{t(`p3.comp.${c.id}`)} <span className="hint">({Math.round(c.weight * 100)} %)</span></strong>
              <span>{pct(c.score)}</span>
              <div className="bar"><span style={{ width: `${Math.round(c.score * 100)}%` }} /></div>
              <details style={{ gridColumn: '1 / -1' }}>
                <summary className="hint">{t('p3.review.detail')}</summary>
                <ul className="fb-list">
                  {c.items.map((i) => (
                    <li key={i.key}>
                      <span className={i.ok === true ? 'ok' : i.ok === null ? 'pending' : 'bad'}>{i.ok === true ? '✓' : i.ok === null ? '◐' : '✗'}</span>{' '}
                      {t(`p3.item.${i.key.replace('p3.', '')}`)} <span className="hint">({i.points.toFixed(1)}/{i.max})</span>
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
          {feedback.length ? (
            <ul className="fb-list">{feedback.map((f, i) => <li key={i}><strong>{t(`p3.comp.${f.comp}`)}:</strong> {t(f.key, f.params)}</li>)}</ul>
          ) : <p className="ok">✓</p>}
        </section>

        <section className="panel">
          <h2>{t('p3.review.capsules')}</h2>
          <div className="table-scroll">
            <table className="data">
              <thead><tr><th>{t('p3.review.test')}</th><th>{t('p3.review.duration')}</th><th>{t('p3.review.sootGain')}</th><th>{t('p3.review.maxT')}</th><th>{t('p3.review.expected')}</th></tr></thead>
              <tbody>
                {[['capsule1', caps.yellow], ['capsule2', caps.blue]].map(([k, e]) => {
                  const ex = e as typeof caps.yellow;
                  return (
                    <tr key={k as string}>
                      <td>{t(`p3.nb.row32.${k as string}`)}</td>
                      <td className="num">{ex ? `${ex.durationS.toFixed(0)} s` : t('review.notMeasured')}</td>
                      <td className="num">{ex ? `${(ex.sootAfterMg - ex.sootBeforeMg).toFixed(2)} mg` : '—'}</td>
                      <td className="num">{ex ? `${ex.maxTempC.toFixed(0)} °C` : '—'}</td>
                      <td>{t(`p3.review.exp_${k as string}`)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel">
          <h2>{t('p3.review.cations')}</h2>
          <div className="table-scroll">
            <table className="data">
              <thead><tr><th>{t('p3.nb.solution')}</th><th>{t('p3.review.seenNoFilter')}</th><th>{t('p3.review.recorded')}</th><th>{t('p3.review.seenFilter')}</th><th>{t('p3.review.reference')}</th></tr></thead>
              <tbody>
                {SOLUTION_ROWS.map((r) => {
                  const o = w.observations[r];
                  const exp = expectedFor(w, r);
                  const rec = nb.table33[r];
                  const okRec = exp.noFilter.includes(rec.noFilter);
                  return (
                    <tr key={r}>
                      <td>{r === UNKNOWN_ID ? `${w.solutions[r].label} (${t(`p3.cation.${w.unknown.cation}`)})` : w.solutions[r].label}</td>
                      <td>{cname(o?.noFilter?.region)}</td>
                      <td className={rec.noFilter ? (okRec ? 'ok' : 'pending') : ''}>{rec.noFilter ? t(`p3.color.${rec.noFilter}`) : '—'} / {rec.filter ? t(`p3.color.${rec.filter}`) : '—'}</td>
                      <td>{cname(o?.filter?.region)}</td>
                      <td>{exp.noFilter.map((c) => t(`p3.color.${c}`)).join(', ')} / {exp.filter.map((c) => t(`p3.color.${c}`)).join(', ')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p>
            <strong>{t('p3.review.unknown')}</strong>{' '}
            {nb.unknown.identity ? t(`p3.cation.${nb.unknown.identity}`) : t('review.notMeasured')} →{' '}
            <span className={nb.unknown.identity === w.unknown.cation ? 'ok' : 'bad'}>{t(`p3.cation.${w.unknown.cation}`)}</span>
            {nb.unknown.initial && <span className="hint"> · {t('p3.nb.initial', { id: t(`p3.cation.${nb.unknown.initial.identity}`), n: nb.unknown.corrections })}</span>}
          </p>
          <p className="hint">{t('p3.review.note')}</p>
        </section>

        <section className="panel" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          <button className="btn primary" onClick={() => start({ sameSeed: true })}>{t('review.newSame')}</button>
          <button className="btn" onClick={() => { setSettings({ seed: newSeed() }); start({ sameSeed: true }); }}>{t('review.newSeed')}</button>
          <button className="btn" onClick={() => downloadJson(`informe-p3-${attemptId}.json`, { attemptId, settings, evaluation: ev, observations: w.observations, capsule: w.capsule, unknown: w.unknown, notebook: nb, actions: rt.actions })}>{t('review.export')}</button>
          <button className="btn ghost" onClick={backToIntro}>{t('review.back')}</button>
          <button className="btn ghost" onClick={onBack}>{t('menu.back')}</button>
        </section>
      </div>
    </main>
  );
}
