import { useTranslation } from 'react-i18next';
import { useP6 } from './store';
import { downloadJson } from '../persistence';
import { newSeed } from '../../simulation/core/rng';
import { expectedBomb, expectedCol, expectedIdentification, runFor } from '../../practices/practice-06/expected-results';
import { convertEnergyPerMass } from '../../simulation/calorimetry/heat';
import { FOODS, METALS } from '../../simulation/calorimetry/materials';
import { parseNum, type Col } from '../../practices/practice-06/notebook';

const pct = (v: number) => `${Math.round(v * 100)} %`;
const f = (v: number | null | undefined, d = 2) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(d).replace('.', ','));

/** Revisión (§25.3, §26): lo que corresponde a las mediciones del estudiante, causas del sesgo y la verdad del motor. */
export function ReviewScreen6({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const ev = useP6((s) => s.evaluation);
  const rt = useP6((s) => s.runtime);
  const nb = useP6((s) => s.notebook);
  const start = useP6((s) => s.start);
  const setSettings = useP6((s) => s.setSettings);
  const backToIntro = useP6((s) => s.backToIntro);
  const attemptId = useP6((s) => s.attemptId);
  const settings = useP6((s) => s.settings);
  if (!ev || !rt) return null;
  const w = rt.world;
  const feedback = ev.components.flatMap((c) => c.items.filter((i) => i.feedbackKey).map((i) => ({ comp: c.id, key: i.feedbackKey!, params: i.params })));
  const id = expectedIdentification(w);
  const eb = expectedBomb(w);
  const hcStudent = Number.isFinite(parseNum(nb.t63.hc)) ? convertEnergyPerMass(parseNum(nb.t63.hc), nb.hcUnit, 'kJ/g') : NaN;
  return (
    <main className="review">
      <div className="review-card">
        <section className="panel" style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.4rem' }}>{t('p6.review.title')}</h1>
            <span className="hint">{t(`mode.${settings.mode}`)} · {t(`p6.model.${w.params.model}`)} · semilla {w.seed} · {Math.round(w.timeS / 60)} min</span>
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
              <strong>{t(`p6.comp.${c.id}`)} <span className="hint">({c.weight ? `${Math.round(c.weight * 100)} %` : t('p6.review.separate')})</span></strong>
              <span>{pct(c.score)}</span>
              <div className="bar"><span style={{ width: `${Math.round(c.score * 100)}%` }} /></div>
              <details style={{ gridColumn: '1 / -1' }}>
                <summary className="hint">{t('p3.review.detail')}</summary>
                <ul className="fb-list">
                  {c.items.map((i) => (
                    <li key={i.key}>
                      <span className={i.ok === true ? 'ok' : i.ok === null ? 'pending' : 'bad'}>{i.ok === true ? '✓' : i.ok === null ? '◐' : '✗'}</span>{' '}
                      {t(`p6.item.${i.key.replace('p6.', '')}`)} <span className="hint">({i.points.toFixed(1)}/{i.max})</span>
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
          {feedback.length ? <ul className="fb-list">{feedback.map((x, i) => <li key={i}><strong>{t(`p6.comp.${x.comp}`)}:</strong> {t(x.key, x.params)}</li>)}</ul> : <p className="ok">✓</p>}
        </section>

        <section className="panel">
          <h2>{t('p6.review.quant')}</h2>
          <div className="table-scroll">
            <table className="data">
              <thead><tr><th>{t('p6.review.qty')}</th><th>Fe</th><th>{w.params.unknownCode}</th></tr></thead>
              <tbody>
                {(['waterMass', 'metalMass', 'tiWater', 'tiMetal', 'tf', 'qWater', 'cIdeal', 'cCorr', 'uC'] as const).map((k) => (
                  <tr key={k}>
                    <td>{t(`p6.review.row.${k}`)}</td>
                    {(['fe', 'x'] as Col[]).map((col) => {
                      const e = expectedCol(w, col);
                      return <td key={col}>{f(e[k], k === 'qWater' ? 0 : k.startsWith('c') || k === 'uC' ? 3 : 2)}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="hint">{t('p6.review.ref', { fe: f(METALS.Fe.cp, 3) })}</p>
          {id && <p>{t('p6.review.identify', { list: id.rows.filter((r) => r.cls !== 'UNLIKELY').map((r) => `${t(`p6.metal.${r.id}`)} (z = ${f(r.z, 1)})`).join(', '), truth: t(`p6.metal.${w.params.unknownMetal}`) })}</p>}
        </section>

        <section className="panel">
          <h2>{t('p6.review.causes')}</h2>
          {(['fe', 'x'] as Col[]).map((col) => {
            const run = runFor(w, col);
            const e = expectedCol(w, col);
            return (
              <div key={col}>
                <strong>{col === 'fe' ? 'Fe' : w.params.unknownCode}</strong>
                {run ? (
                  <ul className="fb-list">
                    <li>{t('p6.review.truth', { tm: f(run.metalCAtEntry, 1), tb: f(run.bathCAtLift, 1), tr: f(run.transferS, 0), lost: run.piecesLost })}</li>
                    {e.causes.map((c) => <li key={c}>{t(`p6.cause.${c}`)}</li>)}
                  </ul>
                ) : <p className="hint">{t('p6.review.noRun')}</p>}
              </div>
            );
          })}
        </section>

        {w.params.bombEnabled && !nb.bombSkipped && (
          <section className="panel">
            <h2>{t('p6.review.bomb')}</h2>
            {eb ? (
              <ul className="fb-list">
                <li>{t('p6.review.bombDT', { dt: f(eb.dT, 3), q: f(eb.qObs, 0), wire: f(eb.wireJ, 1), aux: f(eb.auxJ, 0) })}</li>
                <li>{t('p6.review.bombHc', { exp: f(eb.hcJPerG / 1000, 2), mine: f(hcStudent, 2), kcal: f(convertEnergyPerMass(eb.hcJPerG, 'J/g', 'kcal/g'), 2) })}</li>
                {Math.abs(eb.bucketBias) > 1 && <li>{t('p6.review.bucketBias', { c: f(eb.bucketBias, 0) })}</li>}
                {w.bomb.food && FOODS[w.bomb.food].labelEnergyKJPerG && <li>{t('p6.review.label', { lab: f(FOODS[w.bomb.food].labelEnergyKJPerG, 1) })}</li>}
              </ul>
            ) : <p className="hint">{t('p6.review.noBomb')}</p>}
          </section>
        )}

        <section className="panel" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          <button className="btn primary" onClick={() => start({ sameSeed: true })}>{t('review.newSame')}</button>
          <button className="btn" onClick={() => { setSettings({ seed: newSeed() }); start({ sameSeed: true }); }}>{t('review.newSeed')}</button>
          <button className="btn" onClick={() => downloadJson(`informe-p6-${attemptId}.json`, { attemptId, settings, model: w.params.model, evaluation: ev, runs: w.runs, massReadings: w.massReadings, tempReadings: w.tempReadings, notebook: nb, actions: rt.actions })}>{t('review.export')}</button>
          <button className="btn ghost" onClick={backToIntro}>{t('review.back')}</button>
          <button className="btn ghost" onClick={onBack}>{t('menu.back')}</button>
        </section>
      </div>
    </main>
  );
}
