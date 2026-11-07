import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useF101 } from './store';
import {
  CALC_FIELDS, CALC_UNIT, DIMS, INSTRUMENTS_F, QUESTIONS_F, VEC_FIELDS, VEC_UNIT, entry, type Dim, type Entry, type F101Notebook,
} from '../../practices/practice-f101/notebook';
import { readingsOf } from '../../practices/practice-f101/expected-results';
import type { ReadingF } from '../../simulation/f101-world/types';
import { downloadJson } from '../persistence';

type Tab = 'data' | 'calc' | 'vectors' | 'analysis' | 'readings';
const TABS: Tab[] = ['data', 'calc', 'vectors', 'analysis', 'readings'];

const fmt = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d).replace('.', ',') : '—');
const decOf = (r: ReadingF) => Math.max(0, Math.round(-Math.log10(r.resolution) + 0.01));
const warnOf = (r: ReadingF) => (r.qualityFlags.some((q) => !['ZERO', 'TARE'].includes(q)) ? ' ⚠' : '');

/**
 * Libreta digital de F101: cada dato bruto se importa de una lectura producida por el instrumento (con su id, la
 * trazabilidad cuenta en la rúbrica); medias, incertidumbres, densidades, componentes y productos los escribe el
 * estudiante. No calcula nada por él.
 */
export function NotebookPanelF101() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('data');
  const nb = useF101((s) => s.notebook);
  const setNb = useF101((s) => s.setNotebook);
  const toggle = useF101((s) => s.toggleNotebook);
  const savedAt = useF101((s) => s.savedAt);
  useF101((s) => s.version);
  const rt = useF101((s) => s.runtime);
  const attemptId = useF101((s) => s.attemptId);
  const wanted = useF101((s) => s.notebookTab);
  useEffect(() => {
    if (wanted) setTab(wanted as Tab);
  }, [wanted]);
  if (!rt) return null;
  const w = rt.world;
  const all = readingsOf(w);
  const of = (pred: (r: ReadingF) => boolean) => all.filter(pred);

  const cell = (label: string, e: Entry, path: string, set: (n: F101Notebook, patch: Partial<Entry>) => void, opts: ReadingF[] = [], withU = true) => (
    <div className="cell" key={path}>
      <span className="label">{label}</span>
      <input aria-label={label} type="text" inputMode="decimal" value={e.value} onChange={(ev) => setNb((n) => set(n, { value: ev.target.value, readingId: null }), path, e.value, ev.target.value)} />
      {withU && <input aria-label={`± ${label}`} className="u" type="text" inputMode="decimal" value={e.uncertainty} placeholder="±" onChange={(ev) => setNb((n) => set(n, { uncertainty: ev.target.value }), `${path}.u`, e.uncertainty, ev.target.value)} />}
      {opts.length > 0 && (
        <select aria-label={`${t('f101.nb.import')} — ${label}`} value={e.readingId ?? ''} onChange={(ev) => {
          const r = opts.find((x) => x.id === ev.target.value);
          if (r) setNb((n) => set(n, { value: fmt(r.value, decOf(r)), readingId: r.id }), path, e.value, fmt(r.value, decOf(r)));
        }}>
          <option value="">📥</option>
          {opts.map((r) => <option key={r.id} value={r.id}>{r.id} · {fmt(r.value, decOf(r))} {r.unit}{warnOf(r)}</option>)}
        </select>
      )}
      {e.readingId && <span className="hint" title={t('f101.nb.imported')}>🔗 {e.readingId}</span>}
    </div>
  );
  const text = (path: string, value: string, set: (n: F101Notebook, v: string) => void, area = true) => {
    const idf = `f101-${path}`;
    const on = (v: string) => setNb((n) => set(n, v), path, value, v);
    return (
      <div className="field" key={path}>
        <label htmlFor={idf}>{t(`f101.nb.f.${path}`)}</label>
        {area ? <textarea id={idf} value={value} onChange={(e) => on(e.target.value)} /> : <input id={idf} type="text" value={value} onChange={(e) => on(e.target.value)} />}
      </div>
    );
  };

  const lengths = (inst: string) => of((r) => r.kind === 'length' && r.instrumentId === inst);
  const dimOpts: Record<Dim, ReadingF[]> = { cylD: lengths('caliper01'), cylH: lengths('caliper01'), ballD: lengths('micrometer01') };
  const masses = of((r) => r.kind === 'mass');
  const volumes = of((r) => r.kind === 'volume');
  const eqs = of((r) => r.kind === 'equilibrium');
  const contrasts = of((r) => r.kind === 'vector' || r.kind === 'force');

  const importEquilibrium = (id: string) => {
    const q = w.readings[id];
    setNb((n) => {
      n.equilibriumId = q ? q.id : null;
      n.vectors.forEach((row, i) => {
        const f = q?.forces?.[i];
        row.mass = f ? { value: f.massG !== undefined ? String(f.massG) : `${fmt(f.readN ?? 0, 2)} N`, uncertainty: '', readingId: q!.id } : entry();
        row.angle = f ? { value: String(f.angleRead), uncertainty: '', readingId: q!.id } : entry();
      });
    }, 'equilibriumId', nb.equilibriumId ?? '', id);
  };

  return (
    <aside className="drawer notebook" aria-label={t('nb.title')}>
      <div className="drawer-head">
        <h2>📓 {t('nb.title')}</h2>
        <span style={{ flex: 1 }} />
        <button className="btn small ghost" aria-label={t('review.export')} onClick={() => downloadJson(`libreta-f101-${attemptId}.json`, { attemptId, notebook: nb, readings: w.readings })}>⬇</button>
        <button className="btn small ghost" onClick={toggle} aria-label={t('common.close')}>×</button>
      </div>
      <div className="drawer-body">
        <div className="tabs" role="tablist">
          {TABS.map((k) => <button key={k} role="tab" className="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{t(`f101.nb.tab.${k}`)}</button>)}
        </div>
        {savedAt && <span className="hint">{t('nb.saved', { time: new Date(savedAt).toLocaleTimeString() })}</span>}
        {tab === 'data' && (
          <>
            <h3>{t('f101.nb.hypothesis')}</h3>
            {text('hypothesis.question', nb.hypothesis.question, (n, v) => { n.hypothesis.question = v; })}
            {text('hypothesis.prediction', nb.hypothesis.prediction, (n, v) => { n.hypothesis.prediction = v; })}
            <h3>{t('f101.nb.instruments')}</h3>
            <div className="table-scroll">
              <table className="data">
                <thead><tr><th>{t('f101.nb.instrument')}</th><th>{t('f101.nb.resolution')}</th><th>u<sub>B</sub></th><th>{t('f101.nb.status')}</th></tr></thead>
                <tbody>
                  {INSTRUMENTS_F.map((k) => {
                    const r = nb.instruments[k];
                    const upd = (f: 'resolution' | 'uncertainty' | 'status', v: string) => setNb((n) => { n.instruments[k][f] = v; }, `instruments.${k}.${f}`, r[f], v);
                    return (
                      <tr key={k}>
                        <td>{t(`f101.nb.inst.${k}`)}</td>
                        <td><input aria-label={`${t(`f101.nb.inst.${k}`)} ${t('f101.nb.resolution')}`} value={r.resolution} onChange={(e) => upd('resolution', e.target.value)} /></td>
                        <td><input aria-label={`${t(`f101.nb.inst.${k}`)} uB`} value={r.uncertainty} onChange={(e) => upd('uncertainty', e.target.value)} /></td>
                        <td>
                          <select aria-label={`${t(`f101.nb.inst.${k}`)} ${t('f101.nb.status')}`} value={r.status} onChange={(e) => upd('status', e.target.value)}>
                            <option value="">—</option>
                            {['certified', 'hypothetical', 'pending'].map((s) => <option key={s} value={s}>{t(`f101.nb.st.${s}`)}</option>)}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <h3>{t('f101.nb.zeros')}</h3>
            {cell(t('f101.nb.zeroCaliper'), nb.zeros.caliper, 'zeros.caliper', (n, p) => Object.assign(n.zeros.caliper, p), lengths('caliper01').filter((r) => r.dimension === 'empty'), false)}
            {cell(t('f101.nb.zeroMicrometer'), nb.zeros.micrometer, 'zeros.micrometer', (n, p) => Object.assign(n.zeros.micrometer, p), lengths('micrometer01').filter((r) => r.dimension === 'empty'), false)}
            {cell(t('f101.nb.standard'), nb.zeros.standard, 'zeros.standard', (n, p) => Object.assign(n.zeros.standard, p), of((r) => r.target === 'gaugeBlock01'), false)}
            <h3>{t('f101.nb.dims')}</h3>
            {DIMS.map((d) => (
              <div key={d} className="nb-group">
                <strong>{t(`f101.nb.dim.${d}`)} (mm)</strong>
                {nb.dims[d].map((e, i) => cell(`${t(`f101.nb.dim.${d}`)} ${i + 1}`, e, `dims.${d}.${i}`, (n, p) => Object.assign(n.dims[d][i], p), dimOpts[d], false))}
                {cell(t('f101.nb.mean'), nb.means[d], `means.${d}`, (n, p) => Object.assign(n.means[d], p))}
              </div>
            ))}
            <h3>{t('f101.nb.massVol')}</h3>
            {cell(t('f101.nb.mCyl'), nb.masses.cyl, 'masses.cyl', (n, p) => Object.assign(n.masses.cyl, p), masses, false)}
            {cell(t('f101.nb.mBall'), nb.masses.ball, 'masses.ball', (n, p) => Object.assign(n.masses.ball, p), masses, false)}
            {cell(t('f101.nb.v0'), nb.volumes.initial, 'volumes.initial', (n, p) => Object.assign(n.volumes.initial, p), volumes, false)}
            {cell(t('f101.nb.v1'), nb.volumes.final, 'volumes.final', (n, p) => Object.assign(n.volumes.final, p), volumes, false)}
          </>
        )}
        {tab === 'calc' && (
          <>
            <p className="hint">{t('f101.nb.calcLead')}</p>
            {CALC_FIELDS.map((k) => cell(`${t(`f101.nb.calc.${k}`)} (${CALC_UNIT[k]})`, nb.calc[k], `calc.${k}`, (n, p) => Object.assign(n.calc[k], p), [], k !== 'relErr'))}
          </>
        )}
        {tab === 'vectors' && (
          <>
            <div className="field">
              <label htmlFor="f101-eq">{t('f101.nb.equilibrium')}</label>
              <select id="f101-eq" value={nb.equilibriumId ?? ''} onChange={(e) => importEquilibrium(e.target.value)}>
                <option value="">{t('nb.choose')}</option>
                {eqs.map((r) => <option key={r.id} value={r.id}>{r.id} · {t('f101.nb.forcesN', { n: r.forces?.length ?? 0 })}{warnOf(r)}</option>)}
              </select>
            </div>
            <div className="table-scroll">
              <table className="data">
                <thead><tr><th>#</th><th>{t('f101.nb.massOrN')}</th><th>θ (°)</th><th>F (N)</th><th>F<sub>x</sub> (N)</th><th>F<sub>y</sub> (N)</th></tr></thead>
                <tbody>
                  {nb.vectors.map((row, i) => {
                    const upd = (f: 'F' | 'Fx' | 'Fy', v: string) => setNb((n) => { n.vectors[i][f] = v; }, `vectors.${i}.${f}`, row[f], v);
                    return (
                      <tr key={i}>
                        <td>F{i + 1}</td>
                        <td>{row.mass.value || '—'}</td>
                        <td>{row.angle.value || '—'}</td>
                        {(['F', 'Fx', 'Fy'] as const).map((f) => <td key={f}><input aria-label={`F${i + 1} ${f}`} inputMode="decimal" value={row[f]} onChange={(e) => upd(f, e.target.value)} /></td>)}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {VEC_FIELDS.map((k) => (
              <div className="cell" key={k}>
                <span className="label">{t(`f101.nb.vec.${k}`)} {VEC_UNIT[k] ? `(${VEC_UNIT[k]})` : ''}</span>
                <input aria-label={t(`f101.nb.vec.${k}`)} inputMode="decimal" value={nb.vec[k]} onChange={(e) => setNb((n) => { n.vec[k] = e.target.value; }, `vec.${k}`, nb.vec[k], e.target.value)} />
              </div>
            ))}
            <h3>{t('f101.nb.contrast')}</h3>
            <div className="field">
              <label htmlFor="f101-ct">{t('f101.nb.contrastReading')}</label>
              <select id="f101-ct" value={nb.contrastId ?? ''} onChange={(e) => setNb((n) => { n.contrastId = e.target.value || null; }, 'contrastId', nb.contrastId ?? '', e.target.value)}>
                <option value="">{t('nb.choose')}</option>
                {contrasts.map((r) => <option key={r.id} value={r.id}>{r.id} · {fmt(r.value, decOf(r))} {r.unit}{warnOf(r)}</option>)}
              </select>
            </div>
            {text('contrastText', nb.contrastText, (n, v) => { n.contrastText = v; })}
          </>
        )}
        {tab === 'analysis' && (
          <>
            {QUESTIONS_F.map((q) => text(`analysis.${q}`, nb.analysis[q], (n, v) => { n.analysis[q] = v; }))}
            {text('closure', nb.closure, (n, v) => { n.closure = v; })}
          </>
        )}
        {tab === 'readings' && (
          <div className="table-scroll">
            <table className="data">
              <thead><tr><th>id</th><th>{t('f101.nb.instrument')}</th><th>{t('f101.nb.value')}</th><th>{t('f101.nb.flags')}</th></tr></thead>
              <tbody>
                {all.map((r) => (
                  <tr key={r.id}>
                    <td>{r.id}</td>
                    <td>{t(`f101.obj.${r.instrumentId}`)}</td>
                    <td>{fmt(r.value, decOf(r))} {r.unit}</td>
                    <td>{r.qualityFlags.filter((f) => !['ZERO', 'TARE'].includes(f)).map((f) => t(`f101.flag.${f}`)).join(', ')}</td>
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
