import { useTranslation } from 'react-i18next';
import { useP5 } from './store';
import { downloadJson } from '../persistence';
import { newSeed } from '../../simulation/core/rng';
import { conversion, expelledG } from '../../simulation/stoich-world/world';
import { expectedResults } from '../../practices/practice-05/expected-results';
import { differences } from '../../practices/practice-05/evidence';
import { validateP5Equation } from '../../practices/practice-05/equation';

const pct = (v: number) => `${Math.round(v * 100)} %`;
const f = (v: number | null | undefined, d = 2) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(d).replace('.', ','));

/** Revisión (§24): comparación con lo que corresponde a las masas REALMENTE medidas y causas del rendimiento. */
export function ReviewScreen5({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const ev = useP5((s) => s.evaluation);
  const rt = useP5((s) => s.runtime);
  const nb = useP5((s) => s.notebook);
  const start = useP5((s) => s.start);
  const setSettings = useP5((s) => s.setSettings);
  const backToIntro = useP5((s) => s.backToIntro);
  const attemptId = useP5((s) => s.attemptId);
  const settings = useP5((s) => s.settings);
  if (!ev || !rt) return null;
  const w = rt.world;
  const feedback = ev.components.flatMap((c) => c.items.filter((i) => i.feedbackKey).map((i) => ({ comp: c.id, key: i.feedbackKey!, params: i.params })));
  const e = expectedResults(w);
  const d = differences(w);
  const eqOk = validateP5Equation(nb.equation).ok;
  const rows: Array<[string, string, string]> = [
    ['mno2', nb.table1.mno2Diff.value || '—', f(e.mno2G, 1)],
    ['kclo3', nb.table1.kclo3Diff.value || '—', f(e.kclo3G, 1)],
    ['nKClO3', nb.table2.nKClO3 || '—', f(e.nKClO3, 4)],
    ['mKClTheo', nb.table2.mKClTheo || '—', f(e.mKClTheo, 3)],
    ['mO2Theo', nb.table2.mO2Theo || '—', f(e.mO2Theo, 3)],
    ['mKClExp', nb.table2.mKClExp || '—', f(e.mKClExp, 1)],
    ['yieldPct', nb.table2.yieldPct || '—', f(e.yieldPct, 1)],
  ];
  return (
    <main className="review">
      <div className="review-card">
        <section className="panel" style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.4rem' }}>{t('p5.review.title')}</h1>
            <span className="hint">{t(`mode.${settings.mode}`)} · semilla {w.seed} · {Math.round(w.timeS / 60)} min</span>
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
              <strong>{t(`p5.comp.${c.id}`)} <span className="hint">({Math.round(c.weight * 100)} %)</span></strong>
              <span>{pct(c.score)}</span>
              <div className="bar"><span style={{ width: `${Math.round(c.score * 100)}%` }} /></div>
              <details style={{ gridColumn: '1 / -1' }}>
                <summary className="hint">{t('p3.review.detail')}</summary>
                <ul className="fb-list">
                  {c.items.map((i) => (
                    <li key={i.key}>
                      <span className={i.ok === true ? 'ok' : i.ok === null ? 'pending' : 'bad'}>{i.ok === true ? '✓' : i.ok === null ? '◐' : '✗'}</span>{' '}
                      {t(`p5.item.${i.key.replace('p5.', '')}`)} <span className="hint">({i.points.toFixed(1)}/{i.max})</span>
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
            <ul className="fb-list">{feedback.map((x, i) => <li key={i}><strong>{t(`p5.comp.${x.comp}`)}:</strong> {t(x.key, x.params)}</li>)}</ul>
          ) : <p className="ok">✓</p>}
        </section>

        <section className="panel">
          <h2>{t('p5.review.quant')}</h2>
          <p className="hint">{t('p5.review.basis', { a: f(d.readings.tubeEmpty?.displayedMassG, 1), b: f(d.readings.tubeMnO2?.displayedMassG, 1), c: f(d.readings.tubeInitial?.displayedMassG, 1), z: f(d.final?.displayedMassG, 1) })}</p>
          <div className="table-scroll">
            <table className="data">
              <thead><tr><th>{t('p5.review.qty')}</th><th>{t('p5.review.yours')}</th><th>{t('p5.review.expected')}</th></tr></thead>
              <tbody>
                {rows.map(([k, mine, exp]) => <tr key={k}><td>{t(`p5.review.row.${k}`)}</td><td>{mine}</td><td>{exp}</td></tr>)}
              </tbody>
            </table>
          </div>
          <p>{t('p5.review.eq', { s: eqOk ? '✓' : '✗' })}</p>
        </section>

        <section className="panel">
          <h2>{t('p5.review.causes')}</h2>
          <ul className="fb-list">
            <li>{t('p5.review.conversion', { p: f(conversion(w) * 100, 1) })}</li>
            <li>{t('p5.review.expelled', { g: f(expelledG(w), 3) })}</li>
            <li>{t('p5.review.cycles', { n: w.tube.cycles.length, list: w.tube.cycles.map((c) => `${Math.round(c.heatedS / 60)} min`).join(', ') || '—' })}</li>
            {e.causes.map((c) => <li key={c}>{t(`p5.cause.${c}`)}</li>)}
            {!e.causes.length && <li className="ok">{t('p5.cause.none')}</li>}
          </ul>
        </section>

        <section className="panel" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          <button className="btn primary" onClick={() => start({ sameSeed: true })}>{t('review.newSame')}</button>
          <button className="btn" onClick={() => { setSettings({ seed: newSeed() }); start({ sameSeed: true }); }}>{t('review.newSeed')}</button>
          <button className="btn" onClick={() => downloadJson(`informe-p5-${attemptId}.json`, { attemptId, settings, evaluation: ev, measurements: w.measurements, cycles: w.tube.cycles, notebook: nb, actions: rt.actions })}>{t('review.export')}</button>
          <button className="btn ghost" onClick={backToIntro}>{t('review.back')}</button>
          <button className="btn ghost" onClick={onBack}>{t('menu.back')}</button>
        </section>
      </div>
    </main>
  );
}
