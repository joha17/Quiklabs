import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useF04 } from './store';
import {
  CALC_FIELDS_F4, CALC_UNIT_F4, INSTRUMENTS_F4, MCQ_OPTIONS_F4, QUESTIONS_F4, SETUP_FIELDS_F4, SETUP_UNIT_F4, type Entry, type F04Notebook,
} from '../../practices/practice-f04/notebook';
import type { F04World, ReadingF4 } from '../../simulation/f04-world/types';
import { downloadJson } from '../persistence';

type Tab = 'setup' | 'runs' | 'masses' | 'pairs' | 'calc' | 'analysis' | 'readings';
const TABS: Tab[] = ['setup', 'runs', 'masses', 'pairs', 'calc', 'analysis', 'readings'];

const fmt = (v: number | null | undefined, d = 2) => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(d).replace('.', ',') : '—');
const decOf = (r: ReadingF4) => Math.max(0, Math.round(-Math.log10(r.resolution) + 0.01));
const warnOf = (r: ReadingF4) => (r.qualityFlags.length ? ' ⚠' : '');
const readingsOf = (w: F04World) => w.readingOrder.map((id) => w.readings[id]).filter(Boolean);
/** Lo que muestra una lectura en las listas: el ensayo con sus medias y tiempos; la pareja con las dos fuerzas. */
const showOf = (r: ReadingF4) => {
  if (r.kind === 'run' && r.run) {
    const x = r.run;
    return `a ${fmt(x.a, 3)} m/s² · T ${fmt(x.T, 3)} N · Δt₁ ${fmt(x.dt1, 5)} s · Δt₂ ${fmt(x.dt2, 5)} s · t₁ ${fmt(x.t1g, 4)} · t₂ ${fmt(x.t2g, 4)} s`;
  }
  if (r.kind === 'pair' && r.pair) return `F_A ${fmt(r.pair.FA, 2)} N · F_B ${fmt(r.pair.FB, 2)} N`;
  return `${fmt(r.value, decOf(r))} ${r.unit}${r.target && r.kind !== 'accelRest' ? ` · ${r.target}` : ''}`;
};

/**
 * Libreta digital de F04: cada dato bruto (masas de la balanza, posiciones de las compuertas en la escala, aceleración en
 * reposo, ensayos del registrador con sus Δt, pares de fuerzas de la pareja) se importa de una lectura con su id; las
 * velocidades en las compuertas, la aceleración cinemática, las predicciones del modelo, la masa efectiva, la pendiente
 * del barrido, las sumas de la tercera ley y las incertidumbres las escribe el estudiante. La libreta no calcula nada.
 */
export function NotebookPanelF04() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('setup');
  const nb = useF04((s) => s.notebook);
  const setNb = useF04((s) => s.setNotebook);
  const toggle = useF04((s) => s.toggleNotebook);
  const savedAt = useF04((s) => s.savedAt);
  useF04((s) => s.version);
  const rt = useF04((s) => s.runtime);
  const attemptId = useF04((s) => s.attemptId);
  const wanted = useF04((s) => s.notebookTab);
  useEffect(() => {
    if (wanted && (TABS as string[]).includes(wanted)) setTab(wanted as Tab);
  }, [wanted]);
  if (!rt) return null;
  const w = rt.world;
  const all = readingsOf(w);
  const of = (pred: (r: ReadingF4) => boolean) => all.filter(pred);
  const label = (r: ReadingF4) => `${r.id} · ${showOf(r)}${warnOf(r)}`;

  const cell = (lab: string, e: Entry, path: string, set: (n: F04Notebook, patch: Partial<Entry>) => void, opts: ReadingF4[] = [], withU = true) => (
    <div className="cell" key={path}>
      <span className="label">{lab}</span>
      <input aria-label={lab} type="text" inputMode="decimal" value={e.value} onChange={(ev) => setNb((n) => set(n, { value: ev.target.value, readingId: null }), path, e.value, ev.target.value)} />
      {withU && <input aria-label={`± ${lab}`} className="u" type="text" inputMode="decimal" value={e.uncertainty} placeholder="±" onChange={(ev) => setNb((n) => set(n, { uncertainty: ev.target.value }), `${path}.u`, e.uncertainty, ev.target.value)} />}
      {opts.length > 0 && (
        <select aria-label={`${t('f04.nb.import')} — ${lab}`} value={e.readingId ?? ''} onChange={(ev) => {
          const r = opts.find((x) => x.id === ev.target.value);
          if (r) setNb((n) => set(n, { value: fmt(r.value, decOf(r)), readingId: r.id }), path, e.value, fmt(r.value, decOf(r)));
        }}>
          <option value="">📥</option>
          {opts.map((r) => <option key={r.id} value={r.id}>{label(r)}</option>)}
        </select>
      )}
      {e.readingId && <span className="hint" title={t('f04.nb.imported')}>🔗 {e.readingId}</span>}
    </div>
  );
  const text = (path: string, value: string, set: (n: F04Notebook, v: string) => void, area = true) => {
    const idf = `f04-${path}`;
    const on = (v: string) => setNb((n) => set(n, v), path, value, v);
    return (
      <div className="field" key={path}>
        <label htmlFor={idf}>{t(`f04.nb.f.${path}`)}</label>
        {area ? <textarea id={idf} value={value} onChange={(e) => on(e.target.value)} /> : <input id={idf} type="text" value={value} onChange={(e) => on(e.target.value)} />}
      </div>
    );
  };
  const pick = (aria: string, value: string | null, opts: ReadingF4[], path: string, set: (n: F04Notebook, id: string | null) => void, show: (r: ReadingF4) => string = label) => (
    <select aria-label={aria} value={value ?? ''} onChange={(e) => setNb((n) => set(n, e.target.value || null), path, value ?? '', e.target.value)}>
      <option value="">{t('nb.choose')}</option>
      {opts.map((r) => <option key={r.id} value={r.id}>{show(r)}</option>)}
    </select>
  );
  const num = (aria: string, value: string, path: string, set: (n: F04Notebook, v: string) => void) => (
    <input aria-label={aria} inputMode="decimal" value={value} onChange={(e) => setNb((n) => set(n, e.target.value), path, value, e.target.value)} />
  );

  const setupOpts: Record<(typeof SETUP_FIELDS_F4)[number], ReadingF4[]> = {
    cartM: of((r) => r.kind === 'mass' && r.target === 'cart01'),
    hangerM: of((r) => r.kind === 'mass' && r.target === 'hanger01'),
    g1: of((r) => r.kind === 'length' && r.target === 'gate1'),
    g2: of((r) => r.kind === 'length' && r.target === 'gate2'),
    aRest: of((r) => r.kind === 'accelRest'),
  };
  const runs = of((r) => r.kind === 'run');
  const pairs = of((r) => r.kind === 'pair');

  return (
    <aside className="drawer notebook" aria-label={t('nb.title')}>
      <div className="drawer-head">
        <h2>📓 {t('nb.title')}</h2>
        <span style={{ flex: 1 }} />
        <button className="btn small ghost" aria-label={t('review.export')} onClick={() => downloadJson(`libreta-f04-${attemptId}.json`, { attemptId, notebook: nb, readings: w.readings })}>⬇</button>
        <button className="btn small ghost" onClick={toggle} aria-label={t('common.close')}>×</button>
      </div>
      <div className="drawer-body">
        <div className="tabs" role="tablist">
          {TABS.map((k) => <button key={k} role="tab" className="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{t(`f04.nb.tab.${k}`)}</button>)}
        </div>
        {savedAt && <span className="hint">{t('nb.saved', { time: new Date(savedAt).toLocaleTimeString() })}</span>}
        {tab === 'setup' && (
          <>
            <h3>{t('f04.nb.hypothesis')}</h3>
            {text('hypothesis.question', nb.hypothesis.question, (n, v) => { n.hypothesis.question = v; })}
            {text('hypothesis.prediction', nb.hypothesis.prediction, (n, v) => { n.hypothesis.prediction = v; })}
            <h3>{t('f04.nb.instruments')}</h3>
            <div className="table-scroll">
              <table className="data">
                <thead><tr><th>{t('f04.nb.instrument')}</th><th>{t('f04.nb.resolution')}</th><th>u<sub>B</sub></th><th>{t('f04.nb.status')}</th></tr></thead>
                <tbody>
                  {INSTRUMENTS_F4.map((k) => {
                    const r = nb.instruments[k];
                    const upd = (f: 'resolution' | 'uncertainty' | 'status', v: string) => setNb((n) => { n.instruments[k][f] = v; }, `instruments.${k}.${f}`, r[f], v);
                    return (
                      <tr key={k}>
                        <td>{t(`f04.nb.inst.${k}`)}</td>
                        <td><input aria-label={`${t(`f04.nb.inst.${k}`)} ${t('f04.nb.resolution')}`} value={r.resolution} onChange={(e) => upd('resolution', e.target.value)} /></td>
                        <td><input aria-label={`${t(`f04.nb.inst.${k}`)} uB`} value={r.uncertainty} onChange={(e) => upd('uncertainty', e.target.value)} /></td>
                        <td>
                          <select aria-label={`${t(`f04.nb.inst.${k}`)} ${t('f04.nb.status')}`} value={r.status} onChange={(e) => upd('status', e.target.value)}>
                            <option value="">—</option>
                            {['verified', 'hypothetical', 'pending'].map((s) => <option key={s} value={s}>{t(`f04.nb.st.${s}`)}</option>)}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <h3>{t('f04.nb.setup')}</h3>
            {SETUP_FIELDS_F4.map((k) => cell(`${t(`f04.nb.setupF.${k}`)} (${SETUP_UNIT_F4[k]})`, nb.setup[k], `setup.${k}`, (n, p) => Object.assign(n.setup[k], p), setupOpts[k], false))}
            {text('flagW', nb.flagW, (n, v) => { n.flagW = v; }, false)}
          </>
        )}
        {tab === 'runs' && (
          <>
            <p className="hint">{t('f04.nb.runsLead')}</p>
            <div className="table-scroll">
              <table className="data">
                <thead><tr><th>#</th><th>{t('f04.nb.run')}</th><th>v₁ (m/s)</th><th>v₂ (m/s)</th><th>a (m/s²)</th></tr></thead>
                <tbody>
                  {nb.runs.map((row, i) => (
                    <tr key={i}>
                      <td>{i + 1}</td>
                      <td>{pick(`${t('f04.nb.run')} ${i + 1}`, row.readingId, runs, `runs.${i}.readingId`, (n, id) => { n.runs[i].readingId = id; })}</td>
                      {(['v1', 'v2', 'aGates'] as const).map((f) => <td key={f}>{num(`${f} ${i + 1}`, row[f], `runs.${i}.${f}`, (n, v) => { n.runs[i][f] = v; })}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {tab === 'masses' && (
          <>
            <p className="hint">{t('f04.nb.massesLead')}</p>
            <div className="table-scroll">
              <table className="data">
                <thead><tr><th>#</th><th>{t('f04.nb.run')}</th><th>m<sub>h</sub> (kg)</th><th>a<sub>pred</sub> (m/s²)</th></tr></thead>
                <tbody>
                  {nb.massRuns.map((row, i) => (
                    <tr key={i}>
                      <td>{i + 1}</td>
                      <td>{pick(`${t('f04.nb.massRun')} ${i + 1}`, row.readingId, runs, `massRuns.${i}.readingId`, (n, id) => { n.massRuns[i].readingId = id; })}</td>
                      <td>{num(`mh ${i + 1}`, row.mh, `massRuns.${i}.mh`, (n, v) => { n.massRuns[i].mh = v; })}</td>
                      <td>{num(`aPred ${i + 1}`, row.aPred, `massRuns.${i}.aPred`, (n, v) => { n.massRuns[i].aPred = v; })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {tab === 'pairs' && (
          <>
            <p className="hint">{t('f04.nb.pairsLead')}</p>
            <div className="table-scroll">
              <table className="data">
                <thead><tr><th>#</th><th>{t('f04.nb.pair')}</th><th>F<sub>PQ</sub> + F<sub>QP</sub> (N)</th></tr></thead>
                <tbody>
                  {nb.pairs.map((row, i) => (
                    <tr key={i}>
                      <td>{i + 1}</td>
                      <td>{pick(`${t('f04.nb.pair')} ${i + 1}`, row.readingId, pairs, `pairs.${i}.readingId`, (n, id) => { n.pairs[i].readingId = id; })}</td>
                      <td>{num(`sum ${i + 1}`, row.sum, `pairs.${i}.sum`, (n, v) => { n.pairs[i].sum = v; })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {tab === 'calc' && (
          <>
            <p className="hint">{t('f04.nb.calcLead')}</p>
            {CALC_FIELDS_F4.map((k) => cell(`${t(`f04.nb.calc.${k}`)}${CALC_UNIT_F4[k] ? ` (${CALC_UNIT_F4[k]})` : ''}`, nb.calc[k], `calc.${k}`, (n, p) => Object.assign(n.calc[k], p), [], k === 'aMean' || k === 'TMean'))}
            <h3>{t('f04.nb.contrast')}</h3>
            {text('contrastText', nb.contrastText, (n, v) => { n.contrastText = v; })}
          </>
        )}
        {tab === 'analysis' && (
          <>
            <fieldset className="field">
              <legend>{t('f04.nb.mcq')}</legend>
              {MCQ_OPTIONS_F4.map((m) => (
                <label key={m} style={{ display: 'block' }}>
                  <input type="radio" name="f04-mcq" value={m} checked={nb.mcq === m} onChange={() => setNb((n) => { n.mcq = m; }, 'mcq', nb.mcq, m)} /> {t(`f04.nb.mcqOpt.${m}`)}
                </label>
              ))}
            </fieldset>
            {QUESTIONS_F4.map((q) => text(`analysis.${q}`, nb.analysis[q], (n, v) => { n.analysis[q] = v; }))}
            {text('closure', nb.closure, (n, v) => { n.closure = v; })}
          </>
        )}
        {tab === 'readings' && (
          <div className="table-scroll">
            <table className="data">
              <thead><tr><th>id</th><th>{t('f04.nb.instrument')}</th><th>{t('f04.nb.value')}</th><th>{t('f04.nb.flags')}</th></tr></thead>
              <tbody>
                {all.map((r) => (
                  <tr key={r.id}>
                    <td>{r.id}</td>
                    <td>{t(`f04.obj.${r.instrumentId}`)}</td>
                    <td>{showOf(r)}</td>
                    <td>{r.qualityFlags.map((f) => t(`f04.flag.${f}`)).join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </aside>
  );
}
