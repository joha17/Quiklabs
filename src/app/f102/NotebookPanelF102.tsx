import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useF102 } from './store';
import {
  CALC_FIELDS_F2, CALC_UNIT_F2, INSTRUMENTS_F2, QUESTIONS_F2, SETUP_FIELDS, SETUP_UNIT, type Entry, type F102Notebook,
} from '../../practices/practice-f102/notebook';
import { readingsOfF2 } from '../../practices/practice-f102/expected-results';
import type { ReadingF2 } from '../../simulation/f102-world/types';
import { downloadJson } from '../persistence';

type Tab = 'setup' | 'uniform' | 'accel' | 'fall' | 'calc' | 'analysis' | 'readings';
const TABS: Tab[] = ['setup', 'uniform', 'accel', 'fall', 'calc', 'analysis', 'readings'];

const fmt = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d).replace('.', ',') : '—');
const decOf = (r: ReadingF2) => Math.max(0, Math.round(-Math.log10(r.resolution) + 0.01));
const warnOf = (r: ReadingF2) => (r.qualityFlags.length ? ' ⚠' : '');
const gateTimes = (r: ReadingF2) => {
  const g = r.gates;
  if (!g) return '—';
  const d = (a: number | null, b: number | null) => (a !== null && b !== null ? fmt((b - a) * 1000, 1) : '—');
  return `Δt₁ ${d(g.t1In, g.t1Out)} ms · Δt₂ ${d(g.t2In, g.t2Out)} ms · t₁₂ ${d(g.t1In, g.t2In)} ms`;
};

/**
 * Libreta digital de F102: cada dato bruto (ángulo, ancho de bandera, posiciones, tiempos de compuertas, cintas,
 * alturas, tiempos de caída, capturas del sensor) se importa de una lectura con su id; velocidades, aceleraciones del
 * ajuste, g, velocidades límite e incertidumbres las escribe el estudiante. La libreta no calcula nada por él.
 */
export function NotebookPanelF102() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('setup');
  const nb = useF102((s) => s.notebook);
  const setNb = useF102((s) => s.setNotebook);
  const toggle = useF102((s) => s.toggleNotebook);
  const savedAt = useF102((s) => s.savedAt);
  useF102((s) => s.version);
  const rt = useF102((s) => s.runtime);
  const attemptId = useF102((s) => s.attemptId);
  const wanted = useF102((s) => s.notebookTab);
  useEffect(() => {
    if (wanted && (TABS as string[]).includes(wanted)) setTab(wanted as Tab);
  }, [wanted]);
  if (!rt) return null;
  const w = rt.world;
  const all = readingsOfF2(w);
  const of = (pred: (r: ReadingF2) => boolean) => all.filter(pred);
  const label = (r: ReadingF2) => `${r.id} · ${fmt(r.value, decOf(r))} ${r.unit}${warnOf(r)}`;

  const cell = (lab: string, e: Entry, path: string, set: (n: F102Notebook, patch: Partial<Entry>) => void, opts: ReadingF2[] = [], withU = true) => (
    <div className="cell" key={path}>
      <span className="label">{lab}</span>
      <input aria-label={lab} type="text" inputMode="decimal" value={e.value} onChange={(ev) => setNb((n) => set(n, { value: ev.target.value, readingId: null }), path, e.value, ev.target.value)} />
      {withU && <input aria-label={`± ${lab}`} className="u" type="text" inputMode="decimal" value={e.uncertainty} placeholder="±" onChange={(ev) => setNb((n) => set(n, { uncertainty: ev.target.value }), `${path}.u`, e.uncertainty, ev.target.value)} />}
      {opts.length > 0 && (
        <select aria-label={`${t('f102.nb.import')} — ${lab}`} value={e.readingId ?? ''} onChange={(ev) => {
          const r = opts.find((x) => x.id === ev.target.value);
          if (r) setNb((n) => set(n, { value: fmt(r.value, decOf(r)), readingId: r.id }), path, e.value, fmt(r.value, decOf(r)));
        }}>
          <option value="">📥</option>
          {opts.map((r) => <option key={r.id} value={r.id}>{label(r)}</option>)}
        </select>
      )}
      {e.readingId && <span className="hint" title={t('f102.nb.imported')}>🔗 {e.readingId}</span>}
    </div>
  );
  const text = (path: string, value: string, set: (n: F102Notebook, v: string) => void, area = true) => {
    const idf = `f102-${path}`;
    const on = (v: string) => setNb((n) => set(n, v), path, value, v);
    return (
      <div className="field" key={path}>
        <label htmlFor={idf}>{t(`f102.nb.f.${path}`)}</label>
        {area ? <textarea id={idf} value={value} onChange={(e) => on(e.target.value)} /> : <input id={idf} type="text" value={value} onChange={(e) => on(e.target.value)} />}
      </div>
    );
  };
  const pick = (aria: string, value: string | null, opts: ReadingF2[], path: string, set: (n: F102Notebook, id: string | null) => void, show: (r: ReadingF2) => string = label) => (
    <select aria-label={aria} value={value ?? ''} onChange={(e) => setNb((n) => set(n, e.target.value || null), path, value ?? '', e.target.value)}>
      <option value="">{t('nb.choose')}</option>
      {opts.map((r) => <option key={r.id} value={r.id}>{show(r)}</option>)}
    </select>
  );
  const num = (aria: string, value: string, path: string, set: (n: F102Notebook, v: string) => void) => (
    <input aria-label={aria} inputMode="decimal" value={value} onChange={(e) => setNb((n) => set(n, e.target.value), path, value, e.target.value)} />
  );

  const setupOpts: Record<(typeof SETUP_FIELDS)[number], ReadingF2[]> = {
    angle: of((r) => r.kind === 'angle'),
    flag: of((r) => r.kind === 'length' && r.target === 'flag'),
    gate1: of((r) => r.kind === 'length' && r.target === 'gate1'),
    gate2: of((r) => r.kind === 'length' && r.target === 'gate2'),
  };
  const gates = of((r) => r.kind === 'gates');
  const tapes = of((r) => r.kind === 'tape');
  const falls = of((r) => r.kind === 'fall');
  const heights = of((r) => r.kind === 'length' && r.instrumentId === 'tower01');
  const motions = of((r) => r.kind === 'motion');

  return (
    <aside className="drawer notebook" aria-label={t('nb.title')}>
      <div className="drawer-head">
        <h2>📓 {t('nb.title')}</h2>
        <span style={{ flex: 1 }} />
        <button className="btn small ghost" aria-label={t('review.export')} onClick={() => downloadJson(`libreta-f102-${attemptId}.json`, { attemptId, notebook: nb, readings: w.readings })}>⬇</button>
        <button className="btn small ghost" onClick={toggle} aria-label={t('common.close')}>×</button>
      </div>
      <div className="drawer-body">
        <div className="tabs" role="tablist">
          {TABS.map((k) => <button key={k} role="tab" className="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{t(`f102.nb.tab.${k}`)}</button>)}
        </div>
        {savedAt && <span className="hint">{t('nb.saved', { time: new Date(savedAt).toLocaleTimeString() })}</span>}
        {tab === 'setup' && (
          <>
            <h3>{t('f102.nb.hypothesis')}</h3>
            {text('hypothesis.question', nb.hypothesis.question, (n, v) => { n.hypothesis.question = v; })}
            {text('hypothesis.prediction', nb.hypothesis.prediction, (n, v) => { n.hypothesis.prediction = v; })}
            <h3>{t('f102.nb.instruments')}</h3>
            <div className="table-scroll">
              <table className="data">
                <thead><tr><th>{t('f102.nb.instrument')}</th><th>{t('f102.nb.resolution')}</th><th>u<sub>B</sub></th><th>{t('f102.nb.status')}</th></tr></thead>
                <tbody>
                  {INSTRUMENTS_F2.map((k) => {
                    const r = nb.instruments[k];
                    const upd = (f: 'resolution' | 'uncertainty' | 'status', v: string) => setNb((n) => { n.instruments[k][f] = v; }, `instruments.${k}.${f}`, r[f], v);
                    return (
                      <tr key={k}>
                        <td>{t(`f102.nb.inst.${k}`)}</td>
                        <td><input aria-label={`${t(`f102.nb.inst.${k}`)} ${t('f102.nb.resolution')}`} value={r.resolution} onChange={(e) => upd('resolution', e.target.value)} /></td>
                        <td><input aria-label={`${t(`f102.nb.inst.${k}`)} uB`} value={r.uncertainty} onChange={(e) => upd('uncertainty', e.target.value)} /></td>
                        <td>
                          <select aria-label={`${t(`f102.nb.inst.${k}`)} ${t('f102.nb.status')}`} value={r.status} onChange={(e) => upd('status', e.target.value)}>
                            <option value="">—</option>
                            {['verified', 'hypothetical', 'pending'].map((s) => <option key={s} value={s}>{t(`f102.nb.st.${s}`)}</option>)}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <h3>{t('f102.nb.setup')}</h3>
            {SETUP_FIELDS.map((k) => cell(`${t(`f102.nb.setupF.${k}`)} (${SETUP_UNIT[k]})`, nb.setup[k], `setup.${k}`, (n, p) => Object.assign(n.setup[k], p), setupOpts[k], false))}
          </>
        )}
        {tab === 'uniform' && (
          <>
            <p className="hint">{t('f102.nb.uniformLead')}</p>
            <div className="table-scroll">
              <table className="data">
                <thead><tr><th>#</th><th>{t('f102.nb.run')}</th><th>v₁ (m/s)</th><th>v₂ (m/s)</th><th>v̄ (m/s)</th></tr></thead>
                <tbody>
                  {nb.uniform.map((row, i) => (
                    <tr key={i}>
                      <td>{i + 1}</td>
                      <td>{pick(`${t('f102.nb.run')} ${i + 1}`, row.readingId, gates, `uniform.${i}.readingId`, (n, id) => { n.uniform[i].readingId = id; }, (r) => `${r.id} · ${gateTimes(r)}${warnOf(r)}`)}</td>
                      {(['v1', 'v2', 'vAvg'] as const).map((f) => <td key={f}>{num(`${f} ${i + 1}`, row[f], `uniform.${i}.${f}`, (n, v) => { n.uniform[i][f] = v; })}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {nb.uniform.map((row) => row.readingId && w.readings[row.readingId] ? <p key={row.readingId} className="hint">🔗 {row.readingId}: {gateTimes(w.readings[row.readingId])}{w.readings[row.readingId].setup?.gateSepCm !== undefined ? ` · d ${fmt(w.readings[row.readingId].setup!.gateSepCm!, 1)} cm` : ''}</p> : null)}
          </>
        )}
        {tab === 'accel' && (
          <>
            <p className="hint">{t('f102.nb.accelLead')}</p>
            <div className="table-scroll">
              <table className="data">
                <thead><tr><th>#</th><th>{t('f102.nb.tape')}</th><th>m (g)</th><th>M (g)</th><th>a (m/s²)</th><th>u(a)</th><th>v₀ (m/s)</th></tr></thead>
                <tbody>
                  {nb.accel.map((row, i) => (
                    <tr key={i}>
                      <td>{i + 1}</td>
                      <td>{pick(`${t('f102.nb.tape')} ${i + 1}`, row.readingId, tapes, `accel.${i}.readingId`, (n, id) => { n.accel[i].readingId = id; }, (r) => `${r.id} · ${t('f102.nb.dots', { n: r.samples?.length ?? 0 })}${warnOf(r)}`)}</td>
                      {(['mHang', 'mCart', 'a', 'ua', 'v0'] as const).map((f) => <td key={f}>{num(`${f} ${i + 1}`, row[f], `accel.${i}.${f}`, (n, v) => { n.accel[i][f] = v; })}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h3>{t('f102.nb.drag')}</h3>
            <div className="table-scroll">
              <table className="data">
                <thead><tr><th>#</th><th>{t('f102.nb.capture')}</th><th>n</th><th>v<sub>t</sub> (m/s)</th></tr></thead>
                <tbody>
                  {nb.drag.map((row, i) => (
                    <tr key={i}>
                      <td>{i + 1}</td>
                      <td>{pick(`${t('f102.nb.capture')} ${i + 1}`, row.readingId, motions, `drag.${i}.readingId`, (n, id) => { n.drag[i].readingId = id; }, (r) => `${r.id} · ${t('f102.nb.samples', { n: r.samples?.length ?? 0 })}${warnOf(r)}`)}</td>
                      {(['n', 'vt'] as const).map((f) => <td key={f}>{num(`${f} ${i + 1}`, row[f], `drag.${i}.${f}`, (n, v) => { n.drag[i][f] = v; })}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {tab === 'fall' && (
          <>
            <p className="hint">{t('f102.nb.fallLead')}</p>
            {nb.fall.map((row, i) => (
              <div key={i} className="nb-group">
                <strong>{t('f102.nb.drop', { n: i + 1 })}</strong>
                <div className="cell">
                  <span className="label">t (s)</span>
                  {pick(`${t('f102.nb.drop', { n: i + 1 })} t`, row.readingId, falls, `fall.${i}.readingId`, (n, id) => { n.fall[i].readingId = id; })}
                </div>
                {cell(`h (cm) ${i + 1}`, row.h, `fall.${i}.h`, (n, p) => Object.assign(n.fall[i].h, p), heights, false)}
                <div className="cell">
                  <span className="label">g (m/s²)</span>
                  {num(`g ${i + 1}`, row.g, `fall.${i}.g`, (n, v) => { n.fall[i].g = v; })}
                </div>
              </div>
            ))}
          </>
        )}
        {tab === 'calc' && (
          <>
            <p className="hint">{t('f102.nb.calcLead')}</p>
            {CALC_FIELDS_F2.map((k) => cell(`${t(`f102.nb.calc.${k}`)}${CALC_UNIT_F2[k] ? ` (${CALC_UNIT_F2[k]})` : ''}`, nb.calc[k], `calc.${k}`, (n, p) => Object.assign(n.calc[k], p), [], k !== 'relErrG' && k !== 'vtRatio'))}
            <h3>{t('f102.nb.contrast')}</h3>
            {text('contrastText', nb.contrastText, (n, v) => { n.contrastText = v; })}
          </>
        )}
        {tab === 'analysis' && (
          <>
            {QUESTIONS_F2.map((q) => text(`analysis.${q}`, nb.analysis[q], (n, v) => { n.analysis[q] = v; }))}
            {text('closure', nb.closure, (n, v) => { n.closure = v; })}
          </>
        )}
        {tab === 'readings' && (
          <div className="table-scroll">
            <table className="data">
              <thead><tr><th>id</th><th>{t('f102.nb.instrument')}</th><th>{t('f102.nb.value')}</th><th>{t('f102.nb.flags')}</th></tr></thead>
              <tbody>
                {all.map((r) => (
                  <tr key={r.id}>
                    <td>{r.id}</td>
                    <td>{t(`f102.obj.${r.instrumentId}`)}</td>
                    <td>{r.kind === 'gates' ? gateTimes(r) : `${fmt(r.value, decOf(r))} ${r.unit}`}</td>
                    <td>{r.qualityFlags.map((f) => t(`f102.flag.${f}`)).join(', ')}</td>
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
