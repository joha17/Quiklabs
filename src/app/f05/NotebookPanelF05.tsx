import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useF05 } from './store';
import {
  CALC_FIELDS_F5, CALC_UNIT_F5, INSTRUMENTS_F5, MATERIAL_OPTIONS_F5, MCQ_OPTIONS_F5, QUESTIONS_F5, SETUP_FIELDS_F5, SETUP_UNIT_F5, type Entry, type F05Notebook,
} from '../../practices/practice-f05/notebook';
import type { F05World, ReadingF5 } from '../../simulation/f05-world/types';
import { downloadJson } from '../persistence';

type Tab = 'setup' | 'static' | 'kinetic' | 'load' | 'angles' | 'slide' | 'calc' | 'analysis' | 'readings';
const TABS: Tab[] = ['setup', 'static', 'kinetic', 'load', 'angles', 'slide', 'calc', 'analysis', 'readings'];

const fmt = (v: number | null | undefined, d = 2) => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(d).replace('.', ',') : '—');
const decOf = (r: ReadingF5) => Math.max(0, Math.round(-Math.log10(r.resolution) + 0.01));
const warnOf = (r: ReadingF5) => (r.qualityFlags.length ? ' ⚠' : '');
const readingsOf = (w: F05World) => w.readingOrder.map((id) => w.readings[id]).filter(Boolean);
/** Lo que muestra una lectura en las listas: el tirón con su pico y su media; la bajada con la aceleración y los Δt. */
const showOf = (r: ReadingF5) => {
  if (r.kind === 'pull' && r.pull) {
    const x = r.pull;
    return `F_pico ${fmt(x.Fpeak, 2)} N · F_media ${fmt(x.Fmean, 2)} N · [${fmt(x.t0, 2)}; ${fmt(x.t1, 2)}] s · ${r.setup?.material ?? ''} · +${r.setup?.loadG ?? 0} g`;
  }
  if (r.kind === 'slide' && r.slide) {
    const x = r.slide;
    return `a ${fmt(x.a, 2)} m/s² · Δt₁ ${fmt(x.dt1, 4)} s · Δt₂ ${fmt(x.dt2, 4)} s · t₁ ${fmt(x.t1g, 3)} · t₂ ${fmt(x.t2g, 3)} s`;
  }
  if (r.kind === 'angle' && r.angle) return `${fmt(r.value, decOf(r))} ° · ${r.angle.material}${r.angle.slipped ? ' · ↘' : ''}`;
  return `${fmt(r.value, decOf(r))} ${r.unit}${r.target ? ` · ${r.target}` : ''}`;
};

/**
 * Libreta digital de F05: cada dato bruto (masas de la balanza, temperatura, posiciones de las compuertas, ángulos del
 * goniómetro, tirones con su pico y su media, la bajada con sus Δt) se importa de una lectura con su id; las normales,
 * los coeficientes, la pendiente del barrido, el ángulo predicho, las velocidades de la bajada, el trabajo del roce y
 * las incertidumbres los escribe el estudiante. La libreta no calcula nada.
 */
export function NotebookPanelF05() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('setup');
  const nb = useF05((s) => s.notebook);
  const setNb = useF05((s) => s.setNotebook);
  const toggle = useF05((s) => s.toggleNotebook);
  const savedAt = useF05((s) => s.savedAt);
  useF05((s) => s.version);
  const rt = useF05((s) => s.runtime);
  const attemptId = useF05((s) => s.attemptId);
  const wanted = useF05((s) => s.notebookTab);
  useEffect(() => {
    if (wanted && (TABS as string[]).includes(wanted)) setTab(wanted as Tab);
  }, [wanted]);
  if (!rt) return null;
  const w = rt.world;
  const all = readingsOf(w);
  const of = (pred: (r: ReadingF5) => boolean) => all.filter(pred);
  const label = (r: ReadingF5) => `${r.id} · ${showOf(r)}${warnOf(r)}`;

  const cell = (lab: string, e: Entry, path: string, set: (n: F05Notebook, patch: Partial<Entry>) => void, opts: ReadingF5[] = [], withU = true) => (
    <div className="cell" key={path}>
      <span className="label">{lab}</span>
      <input aria-label={lab} type="text" inputMode="decimal" value={e.value} onChange={(ev) => setNb((n) => set(n, { value: ev.target.value, readingId: null }), path, e.value, ev.target.value)} />
      {withU && <input aria-label={`± ${lab}`} className="u" type="text" inputMode="decimal" value={e.uncertainty} placeholder="±" onChange={(ev) => setNb((n) => set(n, { uncertainty: ev.target.value }), `${path}.u`, e.uncertainty, ev.target.value)} />}
      {opts.length > 0 && (
        <select aria-label={`${t('f05.nb.import')} — ${lab}`} value={e.readingId ?? ''} onChange={(ev) => {
          const r = opts.find((x) => x.id === ev.target.value);
          if (r) setNb((n) => set(n, { value: fmt(r.value, decOf(r)), readingId: r.id }), path, e.value, fmt(r.value, decOf(r)));
        }}>
          <option value="">📥</option>
          {opts.map((r) => <option key={r.id} value={r.id}>{label(r)}</option>)}
        </select>
      )}
      {e.readingId && <span className="hint" title={t('f05.nb.imported')}>🔗 {e.readingId}</span>}
    </div>
  );
  const text = (path: string, value: string, set: (n: F05Notebook, v: string) => void, area = true) => {
    const idf = `f05-${path}`;
    const on = (v: string) => setNb((n) => set(n, v), path, value, v);
    return (
      <div className="field" key={path}>
        <label htmlFor={idf}>{t(`f05.nb.f.${path}`)}</label>
        {area ? <textarea id={idf} value={value} onChange={(e) => on(e.target.value)} /> : <input id={idf} type="text" value={value} onChange={(e) => on(e.target.value)} />}
      </div>
    );
  };
  const pick = (aria: string, value: string | null, opts: ReadingF5[], path: string, set: (n: F05Notebook, id: string | null) => void, show: (r: ReadingF5) => string = label) => (
    <select aria-label={aria} value={value ?? ''} onChange={(e) => setNb((n) => set(n, e.target.value || null), path, value ?? '', e.target.value)}>
      <option value="">{t('nb.choose')}</option>
      {opts.map((r) => <option key={r.id} value={r.id}>{show(r)}</option>)}
    </select>
  );
  const num = (aria: string, value: string, path: string, set: (n: F05Notebook, v: string) => void) => (
    <input aria-label={aria} inputMode="decimal" value={value} onChange={(e) => setNb((n) => set(n, e.target.value), path, value, e.target.value)} />
  );

  const setupOpts: Record<(typeof SETUP_FIELDS_F5)[number], ReadingF5[]> = {
    blockM: of((r) => r.kind === 'mass' && r.target === 'block01'),
    ballastM: of((r) => r.kind === 'mass' && (r.target === 'w250a' || r.target === 'w250b')),
    temp: of((r) => r.kind === 'temp'),
    g1: of((r) => r.kind === 'length' && r.target === 'gate1'),
    g2: of((r) => r.kind === 'length' && r.target === 'gate2'),
    slideTheta: of((r) => r.kind === 'angle'),
  };
  const pulls = of((r) => r.kind === 'pull');
  const angles = of((r) => r.kind === 'angle');
  const slides = of((r) => r.kind === 'slide');
  const matSel = (aria: string, value: string, path: string, set: (n: F05Notebook, v: string) => void) => (
    <select aria-label={aria} value={value} onChange={(e) => setNb((n) => set(n, e.target.value), path, value, e.target.value)}>
      <option value="">—</option>
      {MATERIAL_OPTIONS_F5.map((m) => <option key={m} value={m}>{t(`f05.material.${m}`)}</option>)}
    </select>
  );

  return (
    <aside className="drawer notebook" aria-label={t('nb.title')}>
      <div className="drawer-head">
        <h2>📓 {t('nb.title')}</h2>
        <span style={{ flex: 1 }} />
        <button className="btn small ghost" aria-label={t('review.export')} onClick={() => downloadJson(`libreta-f05-${attemptId}.json`, { attemptId, notebook: nb, readings: w.readings })}>⬇</button>
        <button className="btn small ghost" onClick={toggle} aria-label={t('common.close')}>×</button>
      </div>
      <div className="drawer-body">
        <div className="tabs" role="tablist">
          {TABS.map((k) => <button key={k} role="tab" className="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{t(`f05.nb.tab.${k}`)}</button>)}
        </div>
        {savedAt && <span className="hint">{t('nb.saved', { time: new Date(savedAt).toLocaleTimeString() })}</span>}
        {tab === 'setup' && (
          <>
            <h3>{t('f05.nb.hypothesis')}</h3>
            {text('hypothesis.question', nb.hypothesis.question, (n, v) => { n.hypothesis.question = v; })}
            {text('hypothesis.prediction', nb.hypothesis.prediction, (n, v) => { n.hypothesis.prediction = v; })}
            <h3>{t('f05.nb.instruments')}</h3>
            <div className="table-scroll">
              <table className="data">
                <thead><tr><th>{t('f05.nb.instrument')}</th><th>{t('f05.nb.resolution')}</th><th>u<sub>B</sub></th><th>{t('f05.nb.status')}</th></tr></thead>
                <tbody>
                  {INSTRUMENTS_F5.map((k) => {
                    const r = nb.instruments[k];
                    const upd = (f: 'resolution' | 'uncertainty' | 'status', v: string) => setNb((n) => { n.instruments[k][f] = v; }, `instruments.${k}.${f}`, r[f], v);
                    return (
                      <tr key={k}>
                        <td>{t(`f05.nb.inst.${k}`)}</td>
                        <td><input aria-label={`${t(`f05.nb.inst.${k}`)} ${t('f05.nb.resolution')}`} value={r.resolution} onChange={(e) => upd('resolution', e.target.value)} /></td>
                        <td><input aria-label={`${t(`f05.nb.inst.${k}`)} uB`} value={r.uncertainty} onChange={(e) => upd('uncertainty', e.target.value)} /></td>
                        <td>
                          <select aria-label={`${t(`f05.nb.inst.${k}`)} ${t('f05.nb.status')}`} value={r.status} onChange={(e) => upd('status', e.target.value)}>
                            <option value="">—</option>
                            {['verified', 'hypothetical', 'pending'].map((s) => <option key={s} value={s}>{t(`f05.nb.st.${s}`)}</option>)}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <h3>{t('f05.nb.setup')}</h3>
            {SETUP_FIELDS_F5.map((k) => cell(`${t(`f05.nb.setupF.${k}`)} (${SETUP_UNIT_F5[k]})`, nb.setup[k], `setup.${k}`, (n, p) => Object.assign(n.setup[k], p), setupOpts[k], false))}
            {text('flagW', nb.flagW, (n, v) => { n.flagW = v; }, false)}
          </>
        )}
        {tab === 'static' && (
          <>
            <p className="hint">{t('f05.nb.staticLead')}</p>
            <div className="field">
              <label>{t('f05.nb.f.material')}</label>
              {matSel(t('f05.nb.f.material'), nb.material, 'material', (n, v) => { n.material = v; })}
            </div>
            <div className="table-scroll">
              <table className="data">
                <thead><tr><th>#</th><th>{t('f05.nb.pull')}</th><th>N (N)</th><th>μ<sub>s</sub></th></tr></thead>
                <tbody>
                  {nb.staticRows.map((row, i) => (
                    <tr key={i}>
                      <td>{i + 1}</td>
                      <td>{pick(`${t('f05.nb.pull')} ${i + 1}`, row.readingId, pulls, `staticRows.${i}.readingId`, (n, id) => { n.staticRows[i].readingId = id; })}</td>
                      <td>{num(`N ${i + 1}`, row.N, `staticRows.${i}.N`, (n, v) => { n.staticRows[i].N = v; })}</td>
                      <td>{num(`μs ${i + 1}`, row.muS, `staticRows.${i}.muS`, (n, v) => { n.staticRows[i].muS = v; })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {tab === 'kinetic' && (
          <>
            <p className="hint">{t('f05.nb.kineticLead')}</p>
            <div className="table-scroll">
              <table className="data">
                <thead><tr><th>#</th><th>{t('f05.nb.pull')}</th><th>N (N)</th><th>μ<sub>k</sub></th></tr></thead>
                <tbody>
                  {nb.kineticRows.map((row, i) => (
                    <tr key={i}>
                      <td>{i + 1}</td>
                      <td>{pick(`${t('f05.nb.pull')} ${i + 1}`, row.readingId, pulls, `kineticRows.${i}.readingId`, (n, id) => { n.kineticRows[i].readingId = id; })}</td>
                      <td>{num(`N ${i + 1}`, row.N, `kineticRows.${i}.N`, (n, v) => { n.kineticRows[i].N = v; })}</td>
                      <td>{num(`μk ${i + 1}`, row.muK, `kineticRows.${i}.muK`, (n, v) => { n.kineticRows[i].muK = v; })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {tab === 'load' && (
          <>
            <p className="hint">{t('f05.nb.loadLead')}</p>
            <div className="table-scroll">
              <table className="data">
                <thead><tr><th>#</th><th>{t('f05.nb.pull')}</th><th>N (N)</th></tr></thead>
                <tbody>
                  {nb.loadRows.map((row, i) => (
                    <tr key={i}>
                      <td>{i + 1}</td>
                      <td>{pick(`${t('f05.nb.loadPull')} ${i + 1}`, row.readingId, pulls, `loadRows.${i}.readingId`, (n, id) => { n.loadRows[i].readingId = id; })}</td>
                      <td>{num(`N carga ${i + 1}`, row.N, `loadRows.${i}.N`, (n, v) => { n.loadRows[i].N = v; })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {tab === 'angles' && (
          <>
            <p className="hint">{t('f05.nb.anglesLead')}</p>
            <div className="table-scroll">
              <table className="data">
                <thead><tr><th>#</th><th>{t('f05.nb.angle')}</th><th>{t('f05.nb.f.material')}</th><th>μ<sub>s</sub> = tan θ</th></tr></thead>
                <tbody>
                  {nb.angleRows.map((row, i) => (
                    <tr key={i}>
                      <td>{i + 1}</td>
                      <td>{pick(`${t('f05.nb.angle')} ${i + 1}`, row.readingId, angles, `angleRows.${i}.readingId`, (n, id) => { n.angleRows[i].readingId = id; })}</td>
                      <td>{matSel(`${t('f05.nb.f.material')} ${i + 1}`, row.material, `angleRows.${i}.material`, (n, v) => { n.angleRows[i].material = v; })}</td>
                      <td>{num(`tan θ ${i + 1}`, row.muS, `angleRows.${i}.muS`, (n, v) => { n.angleRows[i].muS = v; })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {tab === 'slide' && (
          <>
            <p className="hint">{t('f05.nb.slideLead')}</p>
            <div className="field">
              <label>{t('f05.nb.slide')}</label>
              {pick(t('f05.nb.slide'), nb.slide.readingId, slides, 'slide.readingId', (n, id) => { n.slide.readingId = id; })}
            </div>
            <div className="table-scroll">
              <table className="data">
                <thead><tr><th>v₁ (m/s)</th><th>v₂ (m/s)</th><th>a (m/s²)</th><th>μ<sub>k</sub></th></tr></thead>
                <tbody>
                  <tr>
                    {(['v1', 'v2', 'a', 'muK'] as const).map((f) => <td key={f}>{num(`${f} bajada`, nb.slide[f], `slide.${f}`, (n, v) => { n.slide[f] = v; })}</td>)}
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        )}
        {tab === 'calc' && (
          <>
            <p className="hint">{t('f05.nb.calcLead')}</p>
            {CALC_FIELDS_F5.map((k) => cell(`${t(`f05.nb.calc.${k}`)}${CALC_UNIT_F5[k] ? ` (${CALC_UNIT_F5[k]})` : ''}`, nb.calc[k], `calc.${k}`, (n, p) => Object.assign(n.calc[k], p), [], k === 'muS' || k === 'muK' || k === 'slopeMu'))}
            <h3>{t('f05.nb.contrast')}</h3>
            {text('contrastText', nb.contrastText, (n, v) => { n.contrastText = v; })}
          </>
        )}
        {tab === 'analysis' && (
          <>
            <fieldset className="field">
              <legend>{t('f05.nb.mcq')}</legend>
              {MCQ_OPTIONS_F5.map((m) => (
                <label key={m} style={{ display: 'block' }}>
                  <input type="radio" name="f05-mcq" value={m} checked={nb.mcq === m} onChange={() => setNb((n) => { n.mcq = m; }, 'mcq', nb.mcq, m)} /> {t(`f05.nb.mcqOpt.${m}`)}
                </label>
              ))}
            </fieldset>
            {QUESTIONS_F5.map((q) => text(`analysis.${q}`, nb.analysis[q], (n, v) => { n.analysis[q] = v; }))}
            {text('closure', nb.closure, (n, v) => { n.closure = v; })}
          </>
        )}
        {tab === 'readings' && (
          <div className="table-scroll">
            <table className="data">
              <thead><tr><th>id</th><th>{t('f05.nb.instrument')}</th><th>{t('f05.nb.value')}</th><th>{t('f05.nb.flags')}</th></tr></thead>
              <tbody>
                {all.map((r) => (
                  <tr key={r.id}>
                    <td>{r.id}</td>
                    <td>{t(`f05.obj.${r.instrumentId}`)}</td>
                    <td>{showOf(r)}</td>
                    <td>{r.qualityFlags.map((f) => t(`f05.flag.${f}`)).join(', ')}</td>
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
