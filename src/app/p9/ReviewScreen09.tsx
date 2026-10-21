import { useTranslation } from 'react-i18next';
import { useP09 } from './store';
import { downloadJson } from '../persistence';
import { newSeed } from '../../simulation/core/rng';
import { notebookIssues09 } from '../../practices/practice-09/rubric';
import { inferable } from '../../practices/practice-09/expected-results';
import { CATIONS } from '../../practices/practice-09/notebook';
import type { SpeciesId } from '../../simulation/cation-analysis-world/types';
import { p09NameOf } from './describe';

const pct = (v: number) => `${Math.round(v * 100)} %`;
const f = (v: number | null | undefined, d = 3) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(d).replace('.', ','));

/**
 * Revisión: componentes y retroalimentación causal (primero lo observado, luego la causa); la identificación del
 * estudiante frente a la composición real de ESTE intento y a lo que sus pruebas permitían inferir (solo después de la
 * entrega), y dónde quedó cada catión (tubos, residuos, extracción, mesada).
 */
export function ReviewScreen09({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const ev = useP09((s) => s.evaluation);
  const rt = useP09((s) => s.runtime);
  const nb = useP09((s) => s.notebook);
  const start = useP09((s) => s.start);
  const setSettings = useP09((s) => s.setSettings);
  const backToIntro = useP09((s) => s.backToIntro);
  const attemptId = useP09((s) => s.attemptId);
  const settings = useP09((s) => s.settings);
  if (!ev || !rt) return null;
  const w = rt.world;
  const feedback = ev.components.flatMap((c) => c.items.filter((i) => i.feedbackKey).map((i) => ({ comp: c.id, key: i.feedbackKey!, params: i.params })));
  const issues = notebookIssues09(w, nb);
  // Verdad del motor (solo tras la entrega): composición real, lo inferible con las pruebas hechas y dónde quedó cada catión.
  const inf = inferable(w);
  const ELEM: Record<(typeof CATIONS)[number], SpeciesId[]> = { 'Sr2+': ['Sr2+', 'SrSO4(s)'], 'Fe3+': ['Fe3+', 'FeOH3(s)'], 'K+': ['K+'] };
  const molOf = (m: Partial<Record<SpeciesId, number>>, ids: SpeciesId[]) => ids.reduce((a, k) => a + (m[k] ?? 0), 0);
  const where = (c: (typeof CATIONS)[number]) => [
    ...Object.values(w.vessels).filter((v) => !v.id.startsWith('ctl')).map((v) => [v.id, molOf(v.liq, ELEM[c]) + molOf(v.solid, ELEM[c])] as [string, number]),
    ...(['exhaust', 'bench', 'hoodTray'] as const).map((k) => [k, molOf(w.outside[k], ELEM[c])] as [string, number]),
  ].filter(([, n]) => n > 1e-9).sort((a, b) => b[1] - a[1]).slice(0, 6);
  return (
    <main className="review">
      <div className="review-card">
        <section className="panel" style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.4rem' }}>{t('p9.review.title')}</h1>
            <span className="hint">{w.unknown.code} · {t(`mode.${settings.mode}`)} · {t('p9.modelBadge')} · semilla {w.seed} · {Math.round(w.timeS / 60)} min</span>
          </div>
          <span style={{ flex: 1 }} />
          <div style={{ textAlign: 'right' }}>
            <div className="label">{t('review.total')}</div>
            <div className="score-big">{pct(ev.total)}</div>
            {ev.needsTeacherReview.length > 0 && <div className="hint">{t('p9.review.provisional')}</div>}
          </div>
        </section>

        <section className="panel">
          <h2>{t('review.components')}</h2>
          {ev.components.map((c) => (
            <div key={c.id} className="comp">
              <strong>{t(`p9.comp.${c.id}`)} <span className="hint">({Math.round(c.weight * 100)} %)</span></strong>
              <span>{pct(c.score)}</span>
              <div className="bar"><span style={{ width: `${Math.round(c.score * 100)}%` }} /></div>
              <details style={{ gridColumn: '1 / -1' }}>
                <summary className="hint">{t('p3.review.detail')}</summary>
                <ul className="fb-list">
                  {c.items.map((i) => (
                    <li key={i.key}>
                      <span className={i.ok === true ? 'ok' : i.ok === null ? 'pending' : 'bad'}>{i.ok === true ? '✓' : i.ok === null ? '◐' : '✗'}</span>{' '}
                      {t(`p9.item.${i.key.replace('p9.', '')}`)} <span className="hint">({i.points.toFixed(1)}/{i.max}){i.ok === null ? ` · ${t('p9.review.pending')}` : ''}</span>
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
          {feedback.length ? <ul className="fb-list">{feedback.map((x, i) => <li key={i}><strong>{t(`p9.comp.${x.comp}`)}:</strong> {t(x.key, x.params)}</li>)}</ul> : <p className="ok">✓</p>}
          {issues.length > 0 && (
            <>
              <h3>{t('p9.review.issues')}</h3>
              <ul className="fb-list">{issues.map((k) => <li key={k}>{t(`p9fb.${k.split(':')[1]}`)}</li>)}</ul>
            </>
          )}
        </section>

        <section className="panel">
          <h2>{t('p9.review.balance')}</h2>
          <div className="table-scroll">
            <table className="data">
              <thead><tr><th>{t('p9.review.cation')}</th><th>{t('p9.review.yours')}</th><th>{t('p9.review.inferable')}</th><th>{t('p9.review.engine')}</th></tr></thead>
              <tbody>
                {CATIONS.map((c) => (
                  <tr key={c}>
                    <td>{t(`p9.cation.${c}`)}</td>
                    <td>{nb.tableF[c].status ? t(`p9.status.${nb.tableF[c].status}`) : '—'}</td>
                    <td>{t(`p9.status.${inf[c]}`)}</td>
                    <td>{t(w.unknown.cations.includes(c) ? 'p9.review.present' : 'p9.review.absent')}</td>
                  </tr>
                ))}
                {w.unknown.cations.includes('Na+') && <tr><td>{t('p9.cation.Na+')}</td><td>—</td><td>—</td><td>{t('p9.review.contaminant')}</td></tr>}
              </tbody>
            </table>
          </div>
          <h3>{t('p9.review.where')}</h3>
          <ul className="fb-list">
            {CATIONS.filter((c) => w.unknown.cations.includes(c)).map((c) => (
              <li key={c}><strong>{t(`p9.cation.${c}`)}:</strong> {where(c).map(([k, n]) => `${k === 'exhaust' || k === 'bench' || k === 'hoodTray' ? t(`p9.where.${k}`) : p09NameOf(w, k)} ${f(n * 1e6, 2)} µmol`).join(' · ') || '—'}</li>
            ))}
          </ul>
          <p className="hint">{t('p9.review.note')}</p>
        </section>

        <section className="panel">
          <h2>{t('p9.review.causes')}</h2>
          <ul className="fb-list">
            {Object.entries(w.evidence).filter(([k, v]) => k.startsWith('err:') && v).map(([k]) => <li key={k}>{t(`p9fb.${k.slice(4)}`)}</li>)}
          </ul>
        </section>

        <section className="panel" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          <button className="btn primary" onClick={() => start({ sameSeed: true })}>{t('review.newSame')}</button>
          <button className="btn" onClick={() => { setSettings({ seed: newSeed() }); start({ sameSeed: true }); }}>{t('review.newSeed')}</button>
          <button className="btn" onClick={() => downloadJson(`informe-p9-${attemptId}.json`, { attemptId, settings, evaluation: ev, readings: w.readings, notebook: nb, issues, actions: rt.actions })}>{t('review.export')}</button>
          <button className="btn ghost" onClick={() => window.print()}>{t('p10.nb.print')}</button>
          <button className="btn ghost" onClick={backToIntro}>{t('review.back')}</button>
          <button className="btn ghost" onClick={onBack}>{t('menu.back')}</button>
        </section>
      </div>
    </main>
  );
}
