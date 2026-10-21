import { useTranslation } from 'react-i18next';
import { useP08 } from './store';
import { downloadJson } from '../persistence';
import { newSeed } from '../../simulation/core/rng';
import { notebookIssues08 } from '../../practices/practice-08/rubric';
import { productHolder, trueLimiting } from '../../practices/practice-08/expected-results';
import { PRODUCT } from '../../simulation/organic-chemistry/stoichiometry';
import { SPECIES, massG } from '../../simulation/organic-chemistry/species';
import { p08NameOf } from './describe';

const pct = (v: number) => `${Math.round(v * 100)} %`;
const f = (v: number | null | undefined, d = 3) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(d).replace('.', ','));

/**
 * Revisión (§13): componentes y retroalimentación causal (primero lo observado, luego la causa); las cifras del
 * estudiante frente a la verdad del motor (solo después de la entrega) y dónde quedó el producto no recuperado.
 */
export function ReviewScreen08({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const ev = useP08((s) => s.evaluation);
  const rt = useP08((s) => s.runtime);
  const nb = useP08((s) => s.notebook);
  const start = useP08((s) => s.start);
  const setSettings = useP08((s) => s.setSettings);
  const backToIntro = useP08((s) => s.backToIntro);
  const attemptId = useP08((s) => s.attemptId);
  const settings = useP08((s) => s.settings);
  if (!ev || !rt) return null;
  const w = rt.world;
  const feedback = ev.components.flatMap((c) => c.items.filter((i) => i.feedbackKey).map((i) => ({ comp: c.id, key: i.feedbackKey!, params: i.params })));
  const issues = notebookIssues08(w, nb);
  // Verdad del motor (solo tras la entrega): limitante real, producto en el recipiente aislado y dónde quedó el resto.
  const truth = trueLimiting(w);
  const p = PRODUCT[w.route];
  const hv = w.vessels[productHolder(w.route)];
  const prodG = hv ? ((hv.liq[p] ?? 0) + (hv.solid[p] ?? 0)) * SPECIES[p].molarMass : 0;
  const holderG = hv ? massG(hv.liq) + massG(hv.solid) : 0;
  const where = ([...Object.values(w.vessels).map((v) => [v.id, ((v.liq[p] ?? 0) + (v.solid[p] ?? 0)) * SPECIES[p].molarMass] as [string, number]),
    ...(['exhaust', 'bench', 'analyzerWaste'] as const).map((k) => [k, (w.outside[k][p] ?? 0) * SPECIES[p].molarMass] as [string, number])])
    .filter(([, g]) => g > 0.001).sort((a, b) => b[1] - a[1]);
  return (
    <main className="review">
      <div className="review-card">
        <section className="panel" style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.4rem' }}>{t('p8.review.title')}</h1>
            <span className="hint">{t(`p8.route.${w.route}.name`)} · {t(`mode.${settings.mode}`)} · {t('p8.modelBadge')} · semilla {w.seed} · {Math.round(w.timeS / 60)} min</span>
          </div>
          <span style={{ flex: 1 }} />
          <div style={{ textAlign: 'right' }}>
            <div className="label">{t('review.total')}</div>
            <div className="score-big">{pct(ev.total)}</div>
            {ev.needsTeacherReview.length > 0 && <div className="hint">{t('p8.review.provisional')}</div>}
          </div>
        </section>

        <section className="panel">
          <h2>{t('review.components')}</h2>
          {ev.components.map((c) => (
            <div key={c.id} className="comp">
              <strong>{t(`p8.comp.${c.id}`)} <span className="hint">({Math.round(c.weight * 100)} %)</span></strong>
              <span>{pct(c.score)}</span>
              <div className="bar"><span style={{ width: `${Math.round(c.score * 100)}%` }} /></div>
              <details style={{ gridColumn: '1 / -1' }}>
                <summary className="hint">{t('p3.review.detail')}</summary>
                <ul className="fb-list">
                  {c.items.map((i) => (
                    <li key={i.key}>
                      <span className={i.ok === true ? 'ok' : i.ok === null ? 'pending' : 'bad'}>{i.ok === true ? '✓' : i.ok === null ? '◐' : '✗'}</span>{' '}
                      {t(`p8.item.${i.key.replace('p8.', '')}`)} <span className="hint">({i.points.toFixed(1)}/{i.max}){i.ok === null ? ` · ${t('p8.review.pending')}` : ''}</span>
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
          {feedback.length ? <ul className="fb-list">{feedback.map((x, i) => <li key={i}><strong>{t(`p8.comp.${x.comp}`)}:</strong> {t(x.key, x.params)}</li>)}</ul> : <p className="ok">✓</p>}
          {issues.length > 0 && (
            <>
              <h3>{t('p8.review.issues')}</h3>
              <ul className="fb-list">{issues.map((k) => <li key={k}>{t(`p8fb.${k.split(':')[1]}`)}</li>)}</ul>
            </>
          )}
        </section>

        <section className="panel">
          <h2>{t('p8.review.balance')}</h2>
          <div className="table-scroll">
            <table className="data">
              <thead><tr><th>{t('p8.review.quantity')}</th><th>{t('p8.review.yours')}</th><th>{t('p8.review.engine')}</th></tr></thead>
              <tbody>
                <tr><td>{t('p8.review.limiting')}</td><td>{nb.tableA.limiting ? t(`p8.species.${nb.tableA.limiting}`) : '—'}</td><td>{truth.limiting ? t(`p8.species.${truth.limiting}`) : '—'}</td></tr>
                <tr><td>{t('p8.review.theoretical')}</td><td>{nb.tableC.theoreticalG || nb.tableA.theoreticalG || '—'} g</td><td>{f(truth.theoreticalG)} g</td></tr>
                <tr><td>{t('p8.review.conversion')}</td><td>—</td><td>{pct(truth.conversion)}</td></tr>
                <tr><td>{t('p8.review.isolated')}</td><td>{nb.tableC.isolatedMass.value || '—'} g</td><td>{f(prodG)} g {t('p8.review.ofProduct')} · {f(holderG)} g {t('p8.review.total')}</td></tr>
                <tr><td>{t('p8.review.purity')}</td><td>{nb.tableC.purity.value || '—'}</td><td>{holderG > 0 ? pct(prodG / holderG) : '—'}</td></tr>
                <tr><td>{t('p8.review.apparent')}</td><td>{nb.tableC.apparentYield || '—'} %</td><td>{truth.theoreticalG > 0 ? `${f((100 * holderG) / truth.theoreticalG, 1)} %` : '—'}</td></tr>
              </tbody>
            </table>
          </div>
          <h3>{t('p8.review.where')}</h3>
          <ul className="fb-list">
            {where.map(([k, g]) => <li key={k}>{k === 'exhaust' || k === 'bench' || k === 'analyzerWaste' ? t(`p8.where.${k}`) : p08NameOf(w, k)}: {f(g)} g</li>)}
          </ul>
          <p className="hint">{t('p8.review.note')}</p>
        </section>

        <section className="panel">
          <h2>{t('p8.review.causes')}</h2>
          <ul className="fb-list">
            {Object.entries(w.evidence).filter(([k, v]) => k.startsWith('err:') && v).map(([k]) => <li key={k}>{t(`p8fb.${k.slice(4)}`)}</li>)}
          </ul>
        </section>

        <section className="panel" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          <button className="btn primary" onClick={() => start({ sameSeed: true })}>{t('review.newSame')}</button>
          <button className="btn" onClick={() => { setSettings({ seed: newSeed() }); start({ sameSeed: true }); }}>{t('review.newSeed')}</button>
          <button className="btn" onClick={() => downloadJson(`informe-p8-${attemptId}.json`, { attemptId, settings, evaluation: ev, readings: w.readings, notebook: nb, issues, actions: rt.actions })}>{t('review.export')}</button>
          <button className="btn ghost" onClick={() => window.print()}>{t('p10.nb.print')}</button>
          <button className="btn ghost" onClick={backToIntro}>{t('review.back')}</button>
          <button className="btn ghost" onClick={onBack}>{t('menu.back')}</button>
        </section>
      </div>
    </main>
  );
}
