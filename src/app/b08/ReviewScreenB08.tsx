import { useTranslation } from 'react-i18next';
import { useB08 } from './store';
import { downloadJson } from '../persistence';
import { newSeed } from '../../simulation/core/rng';
import { notebookIssuesB08 } from '../../practices/practice-b08/rubric';
import { PIGMENTS } from '../../simulation/photosynthesis/pigment-extraction';
import { bandsOf, conservedPhoto } from '../../simulation/photo-world/world';

const pct = (v: number) => `${Math.round(v * 100)} %`;
const f = (v: number | null | undefined, d = 3) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(d).replace('.', ','));

/**
 * Revisión: componentes y retroalimentación causal (primero lo observado, luego la causa); lo que anotó el estudiante
 * frente a lo que mostraba cada captura propia (solo después de la entrega) y el balance de los frascos de tinción.
 */
export function ReviewScreenB08({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const ev = useB08((s) => s.evaluation);
  const rt = useB08((s) => s.runtime);
  const nb = useB08((s) => s.notebook);
  const start = useB08((s) => s.start);
  const setSettings = useB08((s) => s.setSettings);
  const backToIntro = useB08((s) => s.backToIntro);
  const attemptId = useB08((s) => s.attemptId);
  const settings = useB08((s) => s.settings);
  if (!ev || !rt) return null;
  const w = rt.world;
  const feedback = ev.components.flatMap((c) => c.items.filter((i) => i.feedbackKey).map((i) => ({ comp: c.id, key: i.feedbackKey!, params: i.params })));
  const issues = notebookIssuesB08(w, nb);
  // Verdad del motor (solo tras la entrega): tus lecturas, las bandas reales y el balance de pigmentos.
  const cons = conservedPhoto(w);
  return (
    <main className="review">
      <div className="review-card">
        <section className="panel" style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.4rem' }}>{t('b08.review.title')}</h1>
            <span className="hint">{t(`mode.${settings.mode}`)} · {t('b08.modelBadge')} · semilla {w.seed} · {Math.round(w.timeS / 60)} min</span>
          </div>
          <span style={{ flex: 1 }} />
          <div style={{ textAlign: 'right' }}>
            <div className="label">{t('review.total')}</div>
            <div className="score-big">{pct(ev.total)}</div>
            {ev.needsTeacherReview.length > 0 && <div className="hint">{t('b08.review.provisional')}</div>}
          </div>
        </section>

        <section className="panel">
          <h2>{t('review.components')}</h2>
          {ev.components.map((c) => (
            <div key={c.id} className="comp">
              <strong>{t(`b08.comp.${c.id}`)} <span className="hint">({Math.round(c.weight * 100)} %)</span></strong>
              <span>{pct(c.score)}</span>
              <div className="bar"><span style={{ width: `${Math.round(c.score * 100)}%` }} /></div>
              <details style={{ gridColumn: '1 / -1' }}>
                <summary className="hint">{t('p3.review.detail')}</summary>
                <ul className="fb-list">
                  {c.items.map((i) => (
                    <li key={i.key}>
                      <span className={i.ok === true ? 'ok' : i.ok === null ? 'pending' : 'bad'}>{i.ok === true ? '✓' : i.ok === null ? '◐' : '✗'}</span>{' '}
                      {t(`b08.item.${i.key.replace('b08.', '')}`)} <span className="hint">({i.points.toFixed(1)}/{i.max}){i.ok === null ? ` · ${t('b08.review.pending')}` : ''}</span>
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
          {feedback.length ? <ul className="fb-list">{feedback.map((x, i) => <li key={i}><strong>{t(`b08.comp.${x.comp}`)}:</strong> {t(x.key, x.params)}</li>)}</ul> : <p className="ok">✓</p>}
          {issues.length > 0 && (
            <>
              <h3>{t('b08.review.issues')}</h3>
              <ul className="fb-list">{issues.map((k) => <li key={k}>{t(`b08fb.${k.split(':')[1]}`)}</li>)}</ul>
            </>
          )}
        </section>

        <section className="panel">
          <h2>{t('b08.review.balance')}</h2>
          <ul className="fb-list">
            {w.photo.readings.map((r) => <li key={r.id}>{r.id} · {t(`b08.reading.${r.kind}`)} · {r.target}: {r.kind === 'btb' ? t(`b08.val.${r.color}`) : `${f(r.value, 1)} ${r.unit}`}</li>)}
          </ul>
          <h3>{t('b08.review.truth')}</h3>
          <ul className="fb-list">
            {bandsOf(w).map((b) => <li key={b.id}>{b.id} · Rf {f(b.rf, 3)} · {t(`b08.val.${b.color}`)}{b.composite ? ` · ${t('b08.nb.composite')}` : ''}</li>)}
            <li>{t('b08.review.conservation', { err: f(Math.max(...Object.values(cons).map(Math.abs)), 6) })}</li>
            {PIGMENTS.map((p) => <li key={p}>{t(`b08.pigment.${p}`)}: {f(w.photo.ledger[p].extract + w.photo.ledger[p].paper + w.photo.ledger[p].waste, 1)} µg {t('b08.review.recovered')}</li>)}
          </ul>
          {w.cell.incidents.length > 0 && <p className="hint">ⓘ {t('b08.review.incidents', { list: w.cell.incidents.join(', ') })}</p>}
          <p className="hint">{t('b08.review.note')}</p>
        </section>

        <section className="panel">
          <h2>{t('b08.review.causes')}</h2>
          <ul className="fb-list">
            {Object.entries(w.evidence).filter(([k, v]) => k.startsWith('err:') && v).map(([k]) => <li key={k}>{t(`b08fb.${k.slice(4)}`)}</li>)}
          </ul>
        </section>

        <section className="panel" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          <button className="btn primary" onClick={() => start({ sameSeed: true })}>{t('review.newSame')}</button>
          <button className="btn" onClick={() => { setSettings({ seed: newSeed() }); start({ sameSeed: true }); }}>{t('review.newSeed')}</button>
          <button className="btn" onClick={() => downloadJson(`informe-b08-${attemptId}.json`, { attemptId, settings, evaluation: ev, readings: w.photo.readings, observations: w.observations, notebook: nb, issues, actions: rt.actions })}>{t('review.export')}</button>
          <button className="btn ghost" onClick={() => window.print()}>{t('p10.nb.print')}</button>
          <button className="btn ghost" onClick={backToIntro}>{t('review.back')}</button>
          <button className="btn ghost" onClick={onBack}>{t('menu.back')}</button>
        </section>
      </div>
    </main>
  );
}
