import { useTranslation } from 'react-i18next';
import { useLab } from '../store';
import { partBResults } from '../../practices/practice-02/results';
import { EXPECTED } from '../../practices/practice-02/expected-results';
import { massBalance } from '../../simulation/scoring/balance';
import { downloadJson } from '../persistence';
import { newSeed } from '../../simulation/core/rng';

const pct = (v: number) => `${Math.round(v * 100)} %`;

export function ReviewScreen() {
  const { t } = useTranslation();
  const ev = useLab((s) => s.evaluation);
  const rt = useLab((s) => s.runtime);
  const nb = useLab((s) => s.notebook);
  const start = useLab((s) => s.start);
  const setSettings = useLab((s) => s.setSettings);
  const backToIntro = useLab((s) => s.backToIntro);
  const attemptId = useLab((s) => s.attemptId);
  const settings = useLab((s) => s.settings);
  if (!ev || !rt) return null;
  const w = rt.world;
  const r = partBResults(w);
  const rows: Array<{ key: keyof typeof t; v: number | null; ref: readonly [number, number] | null; d: number; pct?: boolean }> = [
    { key: 'carbonRecoverableG', v: r.carbonRecoverableG, ref: EXPECTED.carbonDryRecoverableG, d: 3 },
    { key: 'dishKno3G', v: r.dishKno3G, ref: EXPECTED.kno3FromAliquotEvaporationG, d: 3 },
    { key: 'crystalsG', v: r.crystalsG, ref: EXPECTED.kno3CrystallizedFromRestG, d: 3 },
    { key: 'motherLiquorKno3G', v: r.motherLiquorKno3G, ref: null, d: 3 },
    { key: 'dishPurity', v: r.dishPurity, ref: EXPECTED.purityEvaporation, d: 1, pct: true },
    { key: 'crystalPurity', v: r.crystalPurity, ref: EXPECTED.purityCrystallization, d: 1, pct: true },
  ] as never;
  const feedback = ev.components.flatMap((c) => c.items.filter((i) => i.feedbackKey).map((i) => ({ comp: c.id, key: i.feedbackKey!, params: i.params })));
  const balance = massBalance(w, ['KNO3', 'CARBON', 'IMP']);
  return (
    <main className="review">
      <div className="review-card">
        <section className="panel" style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.4rem' }}>{t('review.title')}</h1>
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
              <strong>{t(`comp.${c.id}`)} <span className="hint">({Math.round(c.weight * 100)} %)</span></strong>
              <span>{pct(c.score)}</span>
              <div className="bar"><span style={{ width: pct(c.score) }} /></div>
              <details style={{ gridColumn: '1 / -1' }}>
                <summary className="hint">detalle</summary>
                <ul className="fb-list">
                  {c.items.map((i) => (
                    <li key={i.key}>
                      <span className={i.ok === true ? 'ok' : i.ok === null ? 'pending' : 'bad'}>{i.ok === true ? '✓' : i.ok === null ? '◐' : '✗'}</span>{' '}
                      {t(`item.${i.key}`)} <span className="hint">({i.points.toFixed(1)}/{i.max})</span>
                    </li>
                  ))}
                </ul>
              </details>
            </div>
          ))}
          {ev.needsTeacherReview.length > 0 && <p className="hint">{t('review.teacher', { list: ev.needsTeacherReview.map((k) => t(`nb.${k}`).split('.')[0]).join(', ') })}</p>}
        </section>

        <section className="panel">
          <h2>{t('review.feedback')}</h2>
          {feedback.length ? (
            <ul className="fb-list">{feedback.map((f, i) => <li key={i}><strong>{t(`comp.${f.comp}`)}:</strong> {t(f.key, f.params)}</li>)}</ul>
          ) : <p className="ok">✓</p>}
        </section>

        <section className="panel">
          <h2>{t('review.results')}</h2>
          <div className="table-scroll">
            <table className="data">
              <thead><tr><th>{t('review.measure')}</th><th>{t('review.yours')}</th><th>{t('review.reference')}</th></tr></thead>
              <tbody>
                {rows.map((row) => {
                  const k = row.key as string;
                  const val = row.v;
                  const inR = val !== null && row.ref && val >= row.ref[0] && val <= row.ref[1];
                  const fmtV = (x: number) => (row.pct ? `${(x * 100).toFixed(row.d)} %` : x.toFixed(row.d).replace('.', ','));
                  return (
                    <tr key={k}>
                      <td>{t(`review.rows.${k}`)}</td>
                      <td className={`num ${row.ref ? (inR ? 'ok' : 'pending') : ''}`}>{val === null ? t('review.notMeasured') : fmtV(val)}</td>
                      <td className="num">{row.ref ? `${fmtV(row.ref[0])} – ${fmtV(row.ref[1])}` : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="hint">{t('review.note')}</p>
        </section>

        <section className="panel">
          <h2>{t('review.balanceTitle')}</h2>
          <div className="table-scroll">
            <table className="data">
              <thead><tr><th>Comp.</th><th>Tomado</th><th>Recipientes</th><th>Filtro (líquido)</th><th>Residuo</th><th>Derramado</th><th>Adherido</th><th>Desechado</th><th>Δ</th></tr></thead>
              <tbody>
                {balance.map((b) => (
                  <tr key={b.component}>
                    <td>{t(`sub.${b.component}`)}</td>
                    {[b.initial, b.inVessels, b.inFilter, b.inResidue, b.spilled, b.adhered, b.discarded].map((x, i) => <td key={i} className="num">{x.toFixed(3)}</td>)}
                    <td className="num">{Math.abs(b.residual) < 0.001 ? '< 1 mg' : b.residual.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          <button className="btn primary" onClick={() => start({ sameSeed: true })}>{t('review.newSame')}</button>
          <button className="btn" onClick={() => { setSettings({ seed: newSeed() }); start({ sameSeed: true }); }}>{t('review.newSeed')}</button>
          <button className="btn" onClick={() => downloadJson(`informe-${attemptId}.json`, { attemptId, settings, evaluation: ev, results: r, balance, notebook: nb, actions: rt.actions })}>{t('review.export')}</button>
          <button className="btn ghost" onClick={backToIntro}>{t('review.back')}</button>
        </section>
      </div>
    </main>
  );
}
