import { useTranslation } from 'react-i18next';
import { useB04 } from './store';
import { downloadJson } from '../persistence';
import { newSeed } from '../../simulation/core/rng';
import { notebookIssuesB04 } from '../../practices/practice-b04/rubric';
import { amylaseContrast, catalaseConditions, feulgenCaptures, observation } from '../../practices/practice-b04/expected-results';
import { bioTotals, conservedBio } from '../../simulation/bio-world/world';

const pct = (v: number) => `${Math.round(v * 100)} %`;
const f = (v: number | null | undefined, d = 3) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(d).replace('.', ','));

/**
 * Revisión de B04: componentes y retroalimentación causal (primero lo observado, luego la causa); el balance de masa
 * del intento (glucosilos, proteína, lípido, cobre, yodo, O/H del peróxido, enzimas), los tubos con su lote y lo que
 * contenía cada uno, lo que mostraba cada captura de Feulgen anotada. La verdad del motor solo se muestra tras la entrega.
 */
export function ReviewScreenB04({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const ev = useB04((s) => s.evaluation);
  const rt = useB04((s) => s.runtime);
  const nb = useB04((s) => s.notebook);
  const start = useB04((s) => s.start);
  const setSettings = useB04((s) => s.setSettings);
  const backToIntro = useB04((s) => s.backToIntro);
  const attemptId = useB04((s) => s.attemptId);
  const settings = useB04((s) => s.settings);
  if (!ev || !rt) return null;
  const w = rt.world;
  const feedback = ev.components.flatMap((c) => c.items.filter((i) => i.feedbackKey).map((i) => ({ comp: c.id, key: i.feedbackKey!, params: i.params })));
  const issues = notebookIssuesB04(w, nb);
  const rows = nb.feulgen.rows.filter((r) => r.observationId).map((r) => ({ ...r, o: observation(w, r.observationId!)! })).filter((r) => r.o);
  const tot = bioTotals(w);
  const cons = conservedBio(w);
  const B = w.bio;
  const amy = amylaseContrast(w);
  const cat = catalaseConditions(w);
  const feul = feulgenCaptures(w);
  const tubes = Object.entries(B.tubes).filter(([, x]) => x.label);
  return (
    <main className="review">
      <div className="review-card">
        <section className="panel" style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.4rem' }}>{t('b04.review.title')}</h1>
            <span className="hint">{t(`mode.${settings.mode}`)} · {t('b04.modelBadge')} · semilla {w.seed} · {Math.round(w.timeS / 60)} min</span>
          </div>
          <span style={{ flex: 1 }} />
          <div style={{ textAlign: 'right' }}>
            <div className="label">{t('review.total')}</div>
            <div className="score-big">{pct(ev.total)}</div>
            {ev.needsTeacherReview.length > 0 && <div className="hint">{t('b02.review.provisional')}</div>}
          </div>
        </section>

        <section className="panel">
          <h2>{t('review.components')}</h2>
          {ev.components.map((c) => (
            <div key={c.id} className="comp">
              <strong>{t(`b04.comp.${c.id}`)} <span className="hint">({Math.round(c.weight * 100)} %)</span></strong>
              <span>{pct(c.score)}</span>
              <div className="bar"><span style={{ width: `${Math.round(c.score * 100)}%` }} /></div>
              <details style={{ gridColumn: '1 / -1' }}>
                <summary className="hint">{t('p3.review.detail')}</summary>
                <ul className="fb-list">
                  {c.items.map((i) => (
                    <li key={i.key}>
                      <span className={i.ok === true ? 'ok' : i.ok === null ? 'pending' : 'bad'}>{i.ok === true ? '✓' : i.ok === null ? '◐' : '✗'}</span>{' '}
                      {t(`b04.item.${i.key.replace('b04.', '')}`)} <span className="hint">({i.points.toFixed(1)}/{i.max}){i.ok === null ? ` · ${t('b02.review.pending')}` : ''}</span>
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
          {feedback.length ? <ul className="fb-list">{feedback.map((x, i) => <li key={i}><strong>{t(`b04.comp.${x.comp}`)}:</strong> {t(x.key, x.params)}</li>)}</ul> : <p className="ok">✓</p>}
          {issues.length > 0 && (
            <>
              <h3>{t('b02.review.issues')}</h3>
              <ul className="fb-list">{issues.map((k) => <li key={k}>{t(`b04fb.${k.split(':')[1]}`)}</li>)}</ul>
            </>
          )}
        </section>

        <section className="panel">
          <h2>{t('b04.review.balance')}</h2>
          <ul className="fb-list">
            {Object.keys(tot).map((k) => (
              <li key={k}>{t(`b04.balance.${k}`)}: {t('b04.review.balanceLine', { init: f(B.initial[k], 3), now: f(tot[k], 3), err: (cons[`bio:${k}`] ?? 0).toExponential(1) })}</li>
            ))}
          </ul>
          <p>{t('b04.review.spillLine', { spill: f(B.vessels.spill.volumeMl, 2), cw: f(B.vessels.cw.volumeMl, 2), bw: f(B.vessels.bw.volumeMl, 2), evap: f(B.evaporatedMl, 3) })}</p>
          <p>{t('b04.review.enzymeLine', { cat: cat.join(', ') || '—', lug: amy.lugol ? '✓' : '✗', ben: amy.benedict ? '✓' : '✗', ctrl: amy.control ? '✓' : '✗', feul: feul.length })}</p>
          {tubes.length > 0 && (
            <div className="table-scroll" tabIndex={0} role="region" aria-label={t('b04.review.tubes')}>
              <table className="data">
                <thead><tr><th>{t('b04.nb.col.tube')}</th><th>{t('b04.review.sources')}</th><th>{t('b04.review.reagents')}</th><th>{t('b04.review.read')}</th></tr></thead>
                <tbody>
                  {tubes.map(([id, x]) => (
                    <tr key={id}>
                      <td>{x.label}{x.discarded ? ' 🗑' : ''}</td>
                      <td>{B.vessels[id].tags.join(', ') || '—'}</td>
                      <td>{Object.keys(x.reagents).join(', ') || '—'}</td>
                      <td>{x.readAt !== null ? `${f(x.readAt, 0)} s` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {rows.length > 0 && (
            <div className="table-scroll" tabIndex={0} role="region" aria-label={t('b04.review.captures')}>
              <table className="data">
                <thead><tr><th>{t('b02.review.capture')}</th><th>{t('b04.review.slideShown')}</th><th>{t('b04.nb.dnaClaim')}</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.observationId!}>
                      <td>{r.o.id}{r.o.isObservationValid ? '' : ' ✗'} · {Math.round(r.o.magnification)}X</td>
                      <td>{t(`b04.asset.${r.o.assetId}`, { defaultValue: String(r.o.assetId ?? '—') })}</td>
                      <td>{r.dnaClaim ? '✓' : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {(w.cell.incidents.length > 0 || B.incidents.length > 0) && <p className="hint">ⓘ {t('b04.review.incidents', { list: [...w.cell.incidents, ...B.incidents].join(', ') })}</p>}
          <p className="hint">{t('b04.review.note')}</p>
        </section>

        <section className="panel">
          <h2>{t('b02.review.causes')}</h2>
          <ul className="fb-list">
            {Object.entries(w.evidence).filter(([k, v]) => k.startsWith('err:') && v).map(([k]) => <li key={k}>{t(k === 'err:PPE' ? 'b04fb.ppe' : `b04fb.${k.slice(4)}`)}</li>)}
          </ul>
        </section>

        <section className="panel" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          <button className="btn primary" onClick={() => start({ sameSeed: true })}>{t('review.newSame')}</button>
          <button className="btn" onClick={() => { setSettings({ seed: newSeed() }); start({ sameSeed: true }); }}>{t('review.newSeed')}</button>
          <button className="btn" onClick={() => downloadJson(`informe-b04-${attemptId}.json`, { attemptId, settings, evaluation: ev, readings: B.readings, observations: w.observations, notebook: nb, issues, actions: rt.actions })}>{t('review.export')}</button>
          <button className="btn ghost" onClick={() => window.print()}>{t('p10.nb.print')}</button>
          <button className="btn ghost" onClick={backToIntro}>{t('review.back')}</button>
          <button className="btn ghost" onClick={onBack}>{t('menu.back')}</button>
        </section>
      </div>
    </main>
  );
}
