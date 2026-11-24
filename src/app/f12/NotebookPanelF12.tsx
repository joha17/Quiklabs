import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useF12 } from './store';
import {
  CALC_FIELDS_F12, CALC_UNIT_F12, INSTRUMENTS_F12, MCQ_OPTIONS_F12, QUESTIONS_F12, SETUP_FIELDS_F12, SETUP_SOURCE_F12, SETUP_UNIT_F12, type Entry, type F12Notebook,
} from '../../practices/practice-f12/notebook';
import type { F12World, ReadingF12 } from '../../simulation/f12-world/types';
import { downloadJson } from '../persistence';

type Tab = 'setup' | 'flow' | 'loss' | 'calc' | 'analysis' | 'readings';
const TABS: Tab[] = ['setup', 'flow', 'loss', 'calc', 'analysis', 'readings'];

const fmt = (v: number | null | undefined, d = 2) => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(d).replace('.', ',') : '—');
const decOf = (r: ReadingF12) => Math.max(0, Math.round(-Math.log10(r.resolution) + 0.01));
const warnOf = (r: ReadingF12) => (r.qualityFlags.length ? ' ⚠' : '');
const readingsOf = (w: F12World) => w.readingOrder.map((id) => w.readings[id]).filter(Boolean);
/** Lo que muestra una lectura en las listas: el valor con su montaje (canal, ensayo, serie, tramo, cara). */
const showOf = (r: ReadingF12) => {
  const parts: string[] = [`${fmt(r.value, decOf(r))} ${r.unit}`];
  if (r.target) parts.push(r.target);
  if (r.face === 'outer') parts.push('exterior');
  if (r.kind === 'pressure' || r.kind === 'flow') parts.push(r.trialId);
  if (typeof r.series === 'number') parts.push(`serie ${r.series}`);
  if (r.spool) parts.push(r.spool === 'rough' ? 'rugoso' : 'liso');
  if (r.flowing === false && r.kind === 'pressure') parts.push('sin caudal');
  return parts.join(' · ');
};

/**
 * Libreta digital de F12: cada dato bruto (diámetros del calibre, cotas de las tomas, presiones de los tres canales,
 * caudales del caudalímetro, volumen del vaso y tiempo del cronómetro) se importa de una lectura con su id; v1, v2,
 * Δp, Δp de Bernoulli, K, la potencia, ρ del ajuste y las incertidumbres los escribe el estudiante. La libreta no calcula.
 */
export function NotebookPanelF12() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('setup');
  const nb = useF12((s) => s.notebook);
  const setNb = useF12((s) => s.setNotebook);
  const toggle = useF12((s) => s.toggleNotebook);
  const savedAt = useF12((s) => s.savedAt);
  useF12((s) => s.version);
  const rt = useF12((s) => s.runtime);
  const attemptId = useF12((s) => s.attemptId);
  const wanted = useF12((s) => s.notebookTab);
  useEffect(() => {
    if (wanted && (TABS as string[]).includes(wanted)) setTab(wanted as Tab);
  }, [wanted]);
  if (!rt) return null;
  const w = rt.world;
  const all = readingsOf(w);
  const of = (pred: (r: ReadingF12) => boolean) => all.filter(pred);
  const label = (r: ReadingF12) => `${r.id} · ${showOf(r)}${warnOf(r)}`;

  const cell = (lab: string, e: Entry, path: string, set: (n: F12Notebook, patch: Partial<Entry>) => void, opts: ReadingF12[] = [], withU = true) => (
    <div className="cell" key={path}>
      <span className="label">{lab}</span>
      <input aria-label={lab} type="text" inputMode="decimal" value={e.value} onChange={(ev) => setNb((n) => set(n, { value: ev.target.value, readingId: null }), path, e.value, ev.target.value)} />
      {withU && <input aria-label={`± ${lab}`} className="u" type="text" inputMode="decimal" value={e.uncertainty} placeholder="±" onChange={(ev) => setNb((n) => set(n, { uncertainty: ev.target.value }), `${path}.u`, e.uncertainty, ev.target.value)} />}
      {opts.length > 0 && (
        <select aria-label={`${t('f12.nb.import')} — ${lab}`} value={e.readingId ?? ''} onChange={(ev) => {
          const r = opts.find((x) => x.id === ev.target.value);
          if (r) setNb((n) => set(n, { value: fmt(r.value, decOf(r)), readingId: r.id }), path, e.value, fmt(r.value, decOf(r)));
        }}>
          <option value="">📥</option>
          {opts.map((r) => <option key={r.id} value={r.id}>{label(r)}</option>)}
        </select>
      )}
      {e.readingId && <span className="hint" title={t('f12.nb.imported')}>🔗 {e.readingId}</span>}
    </div>
  );
  const text = (path: string, value: string, set: (n: F12Notebook, v: string) => void, area = true) => {
    const idf = `f12-${path}`;
    const on = (v: string) => setNb((n) => set(n, v), path, value, v);
    return (
      <div className="field" key={path}>
        <label htmlFor={idf}>{t(`f12.nb.f.${path}`)}</label>
        {area ? <textarea id={idf} value={value} onChange={(e) => on(e.target.value)} /> : <input id={idf} type="text" value={value} onChange={(e) => on(e.target.value)} />}
      </div>
    );
  };
  const pick = (aria: string, value: string | null, opts: ReadingF12[], path: string, set: (n: F12Notebook, id: string | null) => void, show: (r: ReadingF12) => string = label) => (
    <select aria-label={aria} value={value ?? ''} onChange={(e) => setNb((n) => set(n, e.target.value || null), path, value ?? '', e.target.value)}>
      <option value="">{t('nb.choose')}</option>
      {opts.map((r) => <option key={r.id} value={r.id}>{show(r)}</option>)}
    </select>
  );
  const num = (aria: string, value: string, path: string, set: (n: F12Notebook, v: string) => void) => (
    <input aria-label={aria} inputMode="decimal" value={value} onChange={(e) => setNb((n) => set(n, e.target.value), path, value, e.target.value)} />
  );

  const src = (kind: string, pred: (t: string) => boolean) => of((r) => r.kind === kind && !!r.target && pred(r.target));
  const setupOpts = Object.fromEntries(SETUP_FIELDS_F12.map((k) => [k, src(SETUP_SOURCE_F12[k].kind, (x) => x === SETUP_SOURCE_F12[k].target)])) as Record<(typeof SETUP_FIELDS_F12)[number], ReadingF12[]>;
  const ch = (k: number) => of((r) => r.kind === 'pressure' && r.target === `ch${k}`);
  const flows = of((r) => r.kind === 'flow');
  const table = (head: React.ReactNode[], rows: React.ReactNode[][]) => (
    <div className="table-scroll">
      <table className="data">
        <thead><tr>{head.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );

  return (
    <aside className="drawer notebook" aria-label={t('nb.title')}>
      <div className="drawer-head">
        <h2>📓 {t('nb.title')}</h2>
        <span style={{ flex: 1 }} />
        <button className="btn small ghost" aria-label={t('review.export')} onClick={() => downloadJson(`libreta-f12-${attemptId}.json`, { attemptId, notebook: nb, readings: w.readings })}>⬇</button>
        <button className="btn small ghost" onClick={toggle} aria-label={t('common.close')}>×</button>
      </div>
      <div className="drawer-body">
        <div className="tabs" role="tablist">
          {TABS.map((k) => <button key={k} role="tab" className="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{t(`f12.nb.tab.${k}`)}</button>)}
        </div>
        {savedAt && <span className="hint">{t('nb.saved', { time: new Date(savedAt).toLocaleTimeString() })}</span>}
        {tab === 'setup' && (
          <>
            <h3>{t('f12.nb.hypothesis')}</h3>
            {text('hypothesis.question', nb.hypothesis.question, (n, v) => { n.hypothesis.question = v; })}
            {text('hypothesis.prediction', nb.hypothesis.prediction, (n, v) => { n.hypothesis.prediction = v; })}
            <h3>{t('f12.nb.instruments')}</h3>
            <div className="table-scroll">
              <table className="data">
                <thead><tr><th>{t('f12.nb.instrument')}</th><th>{t('f12.nb.resolution')}</th><th>u<sub>B</sub></th><th>{t('f12.nb.status')}</th></tr></thead>
                <tbody>
                  {INSTRUMENTS_F12.map((k) => {
                    const r = nb.instruments[k];
                    const upd = (f: 'resolution' | 'uncertainty' | 'status', v: string) => setNb((n) => { n.instruments[k][f] = v; }, `instruments.${k}.${f}`, r[f], v);
                    return (
                      <tr key={k}>
                        <td>{t(`f12.nb.inst.${k}`)}</td>
                        <td><input aria-label={`${t(`f12.nb.inst.${k}`)} ${t('f12.nb.resolution')}`} value={r.resolution} onChange={(e) => upd('resolution', e.target.value)} /></td>
                        <td><input aria-label={`${t(`f12.nb.inst.${k}`)} uB`} value={r.uncertainty} onChange={(e) => upd('uncertainty', e.target.value)} /></td>
                        <td>
                          <select aria-label={`${t(`f12.nb.inst.${k}`)} ${t('f12.nb.status')}`} value={r.status} onChange={(e) => upd('status', e.target.value)}>
                            <option value="">—</option>
                            {['verified', 'hypothetical', 'pending'].map((s) => <option key={s} value={s}>{t(`f12.nb.st.${s}`)}</option>)}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <h3>{t('f12.nb.setup')}</h3>
            {SETUP_FIELDS_F12.map((k) => cell(`${t(`f12.nb.setupF.${k}`)} (${SETUP_UNIT_F12[k]})`, nb.setup[k], `setup.${k}`, (n, p) => Object.assign(n.setup[k], p), setupOpts[k], false))}
          </>
        )}
        {tab === 'flow' && (
          <>
            <p className="hint">{t('f12.nb.flowLead')}</p>
            {table(['#', 'Q', 'p₁', 'p₂', 'p₃', 'v₁ (m/s)', 'v₂ (m/s)', 'Δp₁₂ (Pa)', t('f12.nb.dpPred')], nb.flowRows.map((row, i) => [
              i + 1,
              pick(`Q ${i + 1}`, row.qId, flows, `flowRows.${i}.qId`, (n, id) => { n.flowRows[i].qId = id; }),
              pick(`p1 ${i + 1}`, row.p1Id, ch(1), `flowRows.${i}.p1Id`, (n, id) => { n.flowRows[i].p1Id = id; }),
              pick(`p2 ${i + 1}`, row.p2Id, ch(2), `flowRows.${i}.p2Id`, (n, id) => { n.flowRows[i].p2Id = id; }),
              pick(`p3 ${i + 1}`, row.p3Id, ch(3), `flowRows.${i}.p3Id`, (n, id) => { n.flowRows[i].p3Id = id; }),
              ...(['v1', 'v2', 'dp12', 'dp12Pred'] as const).map((f) => num(`${f} ${i + 1}`, row[f], `flowRows.${i}.${f}`, (n, v) => { n.flowRows[i][f] = v; })),
            ]))}
          </>
        )}
        {tab === 'loss' && (
          <>
            <p className="hint">{t('f12.nb.lossLead')}</p>
            {table(['#', 'Q', 'p₁', 'p₃', 'v₁ (m/s)', 'Δp₁₃ (Pa)', 'K', 'P (W)'], nb.lossRows.map((row, i) => [
              i + 1,
              pick(`Q ${i + 1}`, row.qId, flows, `lossRows.${i}.qId`, (n, id) => { n.lossRows[i].qId = id; }),
              pick(`p1 ${i + 1}`, row.p1Id, ch(1), `lossRows.${i}.p1Id`, (n, id) => { n.lossRows[i].p1Id = id; }),
              pick(`p3 ${i + 1}`, row.p3Id, ch(3), `lossRows.${i}.p3Id`, (n, id) => { n.lossRows[i].p3Id = id; }),
              ...(['v1', 'dp13', 'K', 'P'] as const).map((f) => num(`${f} ${i + 1}`, row[f], `lossRows.${i}.${f}`, (n, v) => { n.lossRows[i][f] = v; })),
            ]))}
          </>
        )}
        {tab === 'calc' && (
          <>
            <p className="hint">{t('f12.nb.calcLead')}</p>
            {CALC_FIELDS_F12.map((k) => cell(`${t(`f12.nb.calc.${k}`)}${CALC_UNIT_F12[k] ? ` (${CALC_UNIT_F12[k]})` : ''}`, nb.calc[k], `calc.${k}`, (n, p) => Object.assign(n.calc[k], p), [], k !== 'QDev'))}
            <h3>{t('f12.nb.contrast')}</h3>
            {text('contrastText', nb.contrastText, (n, v) => { n.contrastText = v; })}
          </>
        )}
        {tab === 'analysis' && (
          <>
            <fieldset className="field">
              <legend>{t('f12.nb.mcq')}</legend>
              {MCQ_OPTIONS_F12.map((m) => (
                <label key={m} style={{ display: 'block' }}>
                  <input type="radio" name="f12-mcq" value={m} checked={nb.mcq === m} onChange={() => setNb((n) => { n.mcq = m; }, 'mcq', nb.mcq, m)} /> {t(`f12.nb.mcqOpt.${m}`)}
                </label>
              ))}
            </fieldset>
            {QUESTIONS_F12.map((q) => text(`analysis.${q}`, nb.analysis[q], (n, v) => { n.analysis[q] = v; }))}
            {text('closure', nb.closure, (n, v) => { n.closure = v; })}
          </>
        )}
        {tab === 'readings' && (
          <div className="table-scroll">
            <table className="data">
              <thead><tr><th>id</th><th>{t('f12.nb.instrument')}</th><th>{t('f12.nb.value')}</th><th>{t('f12.nb.flags')}</th></tr></thead>
              <tbody>
                {all.map((r) => (
                  <tr key={r.id}>
                    <td>{r.id}</td>
                    <td>{t(`f12.obj.${r.instrumentId}`)}</td>
                    <td>{showOf(r)}</td>
                    <td>{r.qualityFlags.map((f) => t(`f12.flag.${f}`)).join(', ')}</td>
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
