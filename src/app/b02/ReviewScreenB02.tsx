import { useTranslation } from 'react-i18next';
import { useB02 } from './store';
import { downloadJson } from '../persistence';
import { newSeed } from '../../simulation/core/rng';
import { notebookIssuesB02 } from '../../practices/practice-b02/rubric';
import { observation } from '../../practices/practice-b02/expected-results';
import { mountedMl } from '../../simulation/optical-world/world';
import { conservedCell } from '../../simulation/cell-world/world';
import { STAINS } from '../../simulation/specimens/thin-section';

const pct = (v: number) => `${Math.round(v * 100)} %`;
const f = (v: number | null | undefined, d = 3) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(d).replace('.', ','));

/**
 * Revisión: componentes y retroalimentación causal (primero lo observado, luego la causa); lo que anotó el estudiante
 * frente a lo que mostraba cada captura propia (solo después de la entrega) y el balance del líquido de montaje.
 */
export function ReviewScreenB02({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const ev = useB02((s) => s.evaluation);
  const rt = useB02((s) => s.runtime);
  const nb = useB02((s) => s.notebook);
  const start = useB02((s) => s.start);
  const setSettings = useB02((s) => s.setSettings);
  const backToIntro = useB02((s) => s.backToIntro);
  const attemptId = useB02((s) => s.attemptId);
  const settings = useB02((s) => s.settings);
  if (!ev || !rt) return null;
  const w = rt.world;
  const feedback = ev.components.flatMap((c) => c.items.filter((i) => i.feedbackKey).map((i) => ({ comp: c.id, key: i.feedbackKey!, params: i.params })));
  const issues = notebookIssuesB02(w, nb);
  // Verdad del motor (solo tras la entrega): qué mostraba cada captura anotada y el balance del líquido de montaje.
  const rows = [
    ...nb.atlas.map((r) => ({ id: r.observationId, mag: r.totalMag, st: r.structures })),
    { id: nb.buccal.observationId, mag: '', st: nb.buccal.structures },
    { id: nb.elodea.observationId, mag: nb.elodea.totalMag, st: nb.elodea.structures },
    { id: nb.fixed.observationId, mag: '', st: nb.fixed.structures },
    { id: nb.potato.observationId, mag: '', st: [] },
    { id: nb.sclereids.observationId, mag: '', st: [] },
  ]
    .filter((r) => r.id).map((r) => ({ ...r, o: observation(w, r.id)! })).filter((r) => r.o);
  const water = w.fluids;
  const cons = conservedCell(w);
  const balance = cons.water;
  return (
    <main className="review">
      <div className="review-card">
        <section className="panel" style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.4rem' }}>{t('b02.review.title')}</h1>
            <span className="hint">{t(`mode.${settings.mode}`)} · {t('b02.modelBadge')} · semilla {w.seed} · {Math.round(w.timeS / 60)} min</span>
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
              <strong>{t(`b02.comp.${c.id}`)} <span className="hint">({Math.round(c.weight * 100)} %)</span></strong>
              <span>{pct(c.score)}</span>
              <div className="bar"><span style={{ width: `${Math.round(c.score * 100)}%` }} /></div>
              <details style={{ gridColumn: '1 / -1' }}>
                <summary className="hint">{t('p3.review.detail')}</summary>
                <ul className="fb-list">
                  {c.items.map((i) => (
                    <li key={i.key}>
                      <span className={i.ok === true ? 'ok' : i.ok === null ? 'pending' : 'bad'}>{i.ok === true ? '✓' : i.ok === null ? '◐' : '✗'}</span>{' '}
                      {t(`b02.item.${i.key.replace('b02.', '')}`)} <span className="hint">({i.points.toFixed(1)}/{i.max}){i.ok === null ? ` · ${t('b02.review.pending')}` : ''}</span>
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
          {feedback.length ? <ul className="fb-list">{feedback.map((x, i) => <li key={i}><strong>{t(`b02.comp.${x.comp}`)}:</strong> {t(x.key, x.params)}</li>)}</ul> : <p className="ok">✓</p>}
          {issues.length > 0 && (
            <>
              <h3>{t('b02.review.issues')}</h3>
              <ul className="fb-list">{issues.map((k) => <li key={k}>{t(`b02fb.${k.split(':')[1]}`)}</li>)}</ul>
            </>
          )}
        </section>

        <section className="panel">
          <h2>{t('b02.review.balance')}</h2>
          <div className="table-scroll" tabIndex={0} role="region" aria-label={t('b02.review.balance')}>
            <table className="data">
              <thead><tr><th>{t('b02.review.capture')}</th><th>{t('b02.review.yourMag')}</th><th>{t('b02.review.instrumentMag')}</th><th>{t('b02.review.yourStructures')}</th><th>{t('b02.review.visible')}</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.o.id}{r.o.isObservationValid ? '' : ' ✗'}</td>
                    <td>{r.mag || '—'}</td>
                    <td>{Math.round(r.o.magnification)}X</td>
                    <td>{r.st.map((x) => t(`b02.structure.${x}`)).join(', ') || '—'}</td>
                    <td>{r.o.visibleRegionIds.map((x) => t(`b02.structure.${x}`)).join(', ') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3>{t('b02.review.water')}</h3>
          <p>{t('b02.review.waterLine', { init: f(water.initialMl), mount: f(mountedMl(w)), waste: f(water.wasteMl), spill: f(water.spilledMl), evap: f(water.evaporatedMl, 4), err: balance.toExponential(1) })}</p>
          <h3>{t('b02.review.stains')}</h3>
          <ul className="fb-list">
            {STAINS.map((st) => {
              const l = w.cell.stainLedger[st];
              return <li key={st}>{t(`b02.reagent.${st}`)}: {t('b02.review.stainLine', { init: f(l.initialMl), waste: f(l.wasteMl), spill: f(l.spilledMl), err: (cons[`stain:${st}`] ?? 0).toExponential(1) })}</li>;
            })}
            <li>{t('b02.review.biomassLine', { init: f(w.cell.biomass.initialMg, 1), waste: f(w.cell.biomass.wasteMg, 2), err: cons.biomass.toExponential(1) })}</li>
          </ul>
          {w.cell.incidents.length > 0 && <p className="hint">ⓘ {t('b02.review.incidents', { list: w.cell.incidents.join(', ') })}</p>}
          <p className="hint">{t('b02.review.note')}</p>
        </section>

        <section className="panel">
          <h2>{t('b02.review.causes')}</h2>
          <ul className="fb-list">
            {Object.entries(w.evidence).filter(([k, v]) => k.startsWith('err:') && v).map(([k]) => <li key={k}>{t(`b02fb.${k.slice(4)}`)}</li>)}
          </ul>
        </section>

        <section className="panel" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          <button className="btn primary" onClick={() => start({ sameSeed: true })}>{t('review.newSame')}</button>
          <button className="btn" onClick={() => { setSettings({ seed: newSeed() }); start({ sameSeed: true }); }}>{t('review.newSeed')}</button>
          <button className="btn" onClick={() => downloadJson(`informe-b02-${attemptId}.json`, { attemptId, settings, evaluation: ev, observations: w.observations, notebook: nb, issues, actions: rt.actions })}>{t('review.export')}</button>
          <button className="btn ghost" onClick={() => window.print()}>{t('p10.nb.print')}</button>
          <button className="btn ghost" onClick={backToIntro}>{t('review.back')}</button>
          <button className="btn ghost" onClick={onBack}>{t('menu.back')}</button>
        </section>
      </div>
    </main>
  );
}
