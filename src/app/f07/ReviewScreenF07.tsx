import { useTranslation } from 'react-i18next';
import { useF07 } from './store';
import { downloadJson } from '../persistence';
import { newSeed } from '../../simulation/core/rng';
import { expectedCalcF7, rdF7 } from '../../practices/practice-f07/expected-results';
import { notebookIssuesF07 } from '../../practices/practice-f07/rubric';
import { SIMULATED_ERRORS_F07, errKeyF7 } from '../../practices/practice-f07/error-scenarios';

const pct = (v: number) => `${Math.round(v * 100)} %`;
const f = (v: number | null | undefined, d = 3) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(d).replace('.', ','));

/** Revisión: puntaje por componente, diagnóstico causal (errores F07-Exx) y comparación con la verdad del motor. */
export function ReviewScreenF07({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const ev = useF07((s) => s.evaluation);
  const rt = useF07((s) => s.runtime);
  const nb = useF07((s) => s.notebook);
  const start = useF07((s) => s.start);
  const setSettings = useF07((s) => s.setSettings);
  const backToIntro = useF07((s) => s.backToIntro);
  const attemptId = useF07((s) => s.attemptId);
  const settings = useF07((s) => s.settings);
  if (!ev || !rt) return null;
  const w = rt.world;
  const feedback = ev.components.flatMap((c) => c.items.filter((i) => i.feedbackKey && i.ok !== true).map((i) => ({ comp: c.id, key: i.feedbackKey!, params: i.params })));
  const issues = notebookIssuesF07(w, nb);
  const ec = expectedCalcF7(w, nb);
  // Verdad del motor: Δp y e verdaderos de los choques elásticos, impulso verdadero, energía perdida con velcro y v_CM.
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
  const elRuns = nb.elasticRows.map((r) => rdF7(w, r.readingId)).filter((r) => r?.gates);
  const trueDp = mean(elRuns.map((r) => {
    const v = r!.gates!.trueV;
    const su = r!.setup!;
    return v.A1 !== null && v.A2 !== null && v.B1 !== null && v.B2 !== null ? (su.mA ?? 0) * (v.A2 - v.A1) + (su.mB ?? 0) * (v.B2 - v.B1) : NaN;
  }).filter(Number.isFinite));
  const trueE = mean(elRuns.map((r) => {
    const v = r!.gates!.trueV;
    return v.A1 !== null && v.A2 !== null && v.B1 !== null && v.B2 !== null ? -(v.B2 - v.A2) / (v.B1 - v.A1) : NaN;
  }).filter(Number.isFinite));
  const trueJ = -(rdF7(w, nb.impulse.forceId)?.force?.trueJ ?? NaN);
  const sr = rdF7(w, nb.stick.readingId);
  const sv = sr?.gates?.trueV;
  const trueKlost = sv && sv.A1 !== null && sv.B1 !== null && sv.A2 !== null && sr?.setup?.mA && sr.setup.mB
    ? (100 * (0.5 * sr.setup.mA * sv.A1 ** 2 + 0.5 * sr.setup.mB * sv.B1 ** 2 - 0.5 * (sr.setup.mA + sr.setup.mB) * sv.A2 ** 2)) / (0.5 * sr.setup.mA * sv.A1 ** 2 + 0.5 * sr.setup.mB * sv.B1 ** 2)
    : NaN;
  const trueVcm = rdF7(w, nb.cm.readingId)?.motion?.trueVcm ?? NaN;
  const committed = SIMULATED_ERRORS_F07.filter((x) => (w.evidence[x.evidenceKey] ?? 0) > 0 || issues.includes(`nb:${errKeyF7(x)}`));
  return (
    <main className="review">
      <div className="review-card">
        <section className="panel" style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.4rem' }}>{t('f07.review.title')}</h1>
            <span className="hint">{t(`mode.${settings.mode}`)} · {t(`f07.intro.sci.${w.params.scientificMode}`)} · semilla {w.seed} · {Math.round(w.timeS / 60)} min</span>
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
              <strong>{t(`f07.comp.${c.id}`)} <span className="hint">({Math.round(c.weight * 100)} %)</span></strong>
              <span>{pct(c.score)}</span>
              <div className="bar"><span style={{ width: `${Math.round(c.score * 100)}%` }} /></div>
              <details style={{ gridColumn: '1 / -1' }}>
                <summary className="hint">{t('p3.review.detail')}</summary>
                <ul className="fb-list">
                  {c.items.map((i) => (
                    <li key={i.key}>
                      <span className={i.ok === true ? 'ok' : i.ok === null ? 'pending' : 'bad'}>{i.ok === true ? '✓' : i.ok === null ? '◐' : '✗'}</span>{' '}
                      {t(`f07.item.${i.key.replace('f07.', '')}`)} <span className="hint">({i.points.toFixed(1)}/{i.max})</span>
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
          {feedback.length ? <ul className="fb-list">{feedback.map((x, i) => <li key={i}><strong>{t(`f07.comp.${x.comp}`)}:</strong> {t(x.key, x.params)}</li>)}</ul> : <p className="ok">✓</p>}
        </section>

        <section className="panel">
          <h2>{t('f07.review.causes')}</h2>
          {committed.length ? (
            <ul className="fb-list">{committed.map((x) => <li key={x.id}><strong>{x.id}</strong> · {t(x.feedbackKey)}</li>)}</ul>
          ) : <p className="ok">✓ {t('f07.review.noErrors')}</p>}
        </section>

        <section className="panel">
          <h2>{t('f07.review.quant')}</h2>
          <div className="table-scroll">
            <table className="data">
              <thead><tr><th>{t('f07.review.qty')}</th><th>{t('f07.review.yours')}</th><th>{t('f07.review.engine')}</th></tr></thead>
              <tbody>
                <tr><td>{t('f07.review.dp')}</td><td>{f(ec.dp, 4)} ± {f(ec.udp, 4)} kg·m/s</td><td>{f(trueDp, 4)} kg·m/s</td></tr>
                <tr><td>{t('f07.review.e')}</td><td>{f(ec.e, 3)} ± {f(ec.ue, 3)}</td><td>{f(trueE, 3)}</td></tr>
                <tr><td>{t('f07.review.J')}</td><td>{f(ec.J, 4)} ± {f(ec.uJ, 4)} N·s</td><td>{f(trueJ, 4)} N·s</td></tr>
                <tr><td>{t('f07.review.Klost')}</td><td>{f(ec.Klost, 1)} %</td><td>{f(trueKlost, 1)} %</td></tr>
                <tr><td>{t('f07.review.vcm')}</td><td>{f(ec.vcm, 3)} m/s</td><td>{f(trueVcm, 3)} m/s</td></tr>
                <tr><td>{t('f07.review.impDisc')}</td><td>{f(ec.impDisc, 2)} %</td><td>—</td></tr>
              </tbody>
            </table>
          </div>
          <p className="hint">{t('f07.review.note')}</p>
        </section>

        <section className="panel" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          <button className="btn primary" onClick={() => start({ sameSeed: true })}>{t('review.newSame')}</button>
          <button className="btn" onClick={() => { setSettings({ seed: newSeed() }); start({ sameSeed: true }); }}>{t('review.newSeed')}</button>
          <button className="btn" onClick={() => downloadJson(`informe-f07-${attemptId}.json`, { attemptId, settings, evaluation: ev, readings: w.readings, notebook: nb, issues, actions: rt.actions })}>{t('review.export')}</button>
          <button className="btn ghost" onClick={() => window.print()}>{t('p10.nb.print')}</button>
          <button className="btn ghost" onClick={backToIntro}>{t('review.back')}</button>
          <button className="btn ghost" onClick={onBack}>{t('menu.back')}</button>
        </section>
      </div>
    </main>
  );
}
