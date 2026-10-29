import { useTranslation } from 'react-i18next';
import { useB05 } from './store';
import { downloadJson } from '../persistence';
import { newSeed } from '../../simulation/core/rng';
import { notebookIssuesB05 } from '../../practices/practice-b05/rubric';
import { glucosylExpected, rateExpected } from '../../practices/practice-b05/expected-results';
import { conservedEnz, enzTotals } from '../../simulation/enz-world/world';

const pct = (v: number) => `${Math.round(v * 100)} %`;
const f = (v: number | null | undefined, d = 3) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(d).replace('.', ','));

/**
 * Revisión de B05: componentes y retroalimentación causal (primero lo observado, luego la causa); el balance del
 * intento por ledger (volumen, oxígeno con lo captado, venteado y atrapado; glucosilos; cobre; enzimas), la tasa
 * inicial y los moles de O₂ que corresponden a las lecturas importadas, y los glucosilos de la incubación. La verdad
 * del motor solo se muestra tras la entrega.
 */
export function ReviewScreenB05({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const ev = useB05((s) => s.evaluation);
  const rt = useB05((s) => s.runtime);
  const nb = useB05((s) => s.notebook);
  const start = useB05((s) => s.start);
  const setSettings = useB05((s) => s.setSettings);
  const backToIntro = useB05((s) => s.backToIntro);
  const attemptId = useB05((s) => s.attemptId);
  const settings = useB05((s) => s.settings);
  if (!ev || !rt) return null;
  const w = rt.world;
  const E = w.enz;
  const feedback = ev.components.flatMap((c) => c.items.filter((i) => i.feedbackKey).map((i) => ({ comp: c.id, key: i.feedbackKey!, params: i.params })));
  const issues = notebookIssuesB05(w, nb);
  const tot = enzTotals(w);
  const cons = conservedEnz(w);
  const rate = rateExpected(w, nb);
  const gly = glucosylExpected(w);
  return (
    <main className="review">
      <div className="review-card">
        <section className="panel" style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.4rem' }}>{t('b05.review.title')}</h1>
            <span className="hint">{t(`mode.${settings.mode}`)} · {t('b05.modelBadge')} · semilla {w.seed} · {Math.round(w.timeS / 60)} min</span>
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
              <strong>{t(`b05.comp.${c.id}`)} <span className="hint">({Math.round(c.weight * 100)} %)</span></strong>
              <span>{pct(c.score)}</span>
              <div className="bar"><span style={{ width: `${Math.round(c.score * 100)}%` }} /></div>
              <details style={{ gridColumn: '1 / -1' }}>
                <summary className="hint">{t('p3.review.detail')}</summary>
                <ul className="fb-list">
                  {c.items.map((i) => (
                    <li key={i.key}>
                      <span className={i.ok === true ? 'ok' : i.ok === null ? 'pending' : 'bad'}>{i.ok === true ? '✓' : i.ok === null ? '◐' : '✗'}</span>{' '}
                      {t(`b05.item.${i.key.replace('b05.', '')}`)} <span className="hint">({i.points.toFixed(1)}/{i.max}){i.ok === null ? ` · ${t('b02.review.pending')}` : ''}</span>
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
          {feedback.length ? <ul className="fb-list">{feedback.map((x, i) => <li key={i}><strong>{t(`b05.comp.${x.comp}`)}:</strong> {t(x.key, x.params)}</li>)}</ul> : <p className="ok">✓</p>}
          {issues.length > 0 && (
            <>
              <h3>{t('b02.review.issues')}</h3>
              <ul className="fb-list">{issues.map((k) => <li key={k}>{t(`b05fb.${k.split(':')[1] ?? k}`)}</li>)}</ul>
            </>
          )}
        </section>

        <section className="panel">
          <h2>{t('b05.review.balance')}</h2>
          <p>{t('b05.review.volumeLine', { init: f(E.initial.volume, 1), now: f(tot.volume, 1), spill: f(E.vessels.spill.volumeMl, 2), evap: f(E.evaporatedMl, 3), err: (cons['enz:volume'] ?? 0).toExponential(1) })}</p>
          <p>{t('b05.review.oxygenLine', { cap: f(E.collector.gasMmol, 4), vent: f(E.o2.vented, 4), trapped: f(Object.values(E.o2.trapped).reduce((a, x) => a + x, 0), 4), err: (cons['enz:oxygen'] ?? 0).toExponential(1) })}</p>
          <ul className="fb-list">
            {(['glucosyl', 'copper', 'catalase', 'amylase', 'iodine'] as const).map((k) => (
              <li key={k}>{t(`b05.review.qty.${k}`)}: {t('b05.review.qtyLine', { init: f(E.initial[k], 3), err: (cons[`enz:${k}`] ?? 0).toExponential(1) })}</li>
            ))}
          </ul>
          {rate && <p>{t('b05.review.rateLine', { rate: f(rate.rateMlMin, 2), n: f(rate.nO2Mmol, 3), pred: f(rate.predictedO2Mmol, 2) })}</p>}
          {gly !== null && <p>{t('b05.review.glucosylLine', { g: f(gly, 3) })}</p>}
          {(w.cell.incidents.length > 0 || E.incidents.length > 0) && <p className="hint">ⓘ {t('b05.review.incidents', { list: [...w.cell.incidents, ...E.incidents].join(', ') })}</p>}
          <p className="hint">{t('b05.review.note')}</p>
        </section>

        <section className="panel">
          <h2>{t('b02.review.causes')}</h2>
          <ul className="fb-list">
            {Object.entries(w.evidence).filter(([k, v]) => k.startsWith('err:') && v).map(([k]) => <li key={k}>{t(k === 'err:PPE' ? 'b05fb.ppe' : `b05fb.${k.slice(4)}`)}</li>)}
          </ul>
        </section>

        <section className="panel" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          <button className="btn primary" onClick={() => start({ sameSeed: true })}>{t('review.newSame')}</button>
          <button className="btn" onClick={() => { setSettings({ seed: newSeed() }); start({ sameSeed: true }); }}>{t('review.newSeed')}</button>
          <button className="btn" onClick={() => downloadJson(`informe-b05-${attemptId}.json`, { attemptId, settings, evaluation: ev, readings: E.readings, observations: w.observations, notebook: nb, issues, actions: rt.actions })}>{t('review.export')}</button>
          <button className="btn ghost" onClick={() => window.print()}>{t('p10.nb.print')}</button>
          <button className="btn ghost" onClick={backToIntro}>{t('review.back')}</button>
          <button className="btn ghost" onClick={onBack}>{t('menu.back')}</button>
        </section>
      </div>
    </main>
  );
}
