import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useF11 } from './store';
import {
  CALC_FIELDS_F11, CALC_UNIT_F11, INSTRUMENTS_F11, MCQ_OPTIONS_F11, QUESTIONS_F11, SETUP_FIELDS_F11, SETUP_SOURCE_F11, SETUP_UNIT_F11, type Entry, type F11Notebook,
} from '../../practices/practice-f11/notebook';
import type { F11World, ReadingF11 } from '../../simulation/f11-world/types';
import { downloadJson } from '../persistence';

type Tab = 'setup' | 'pA' | 'pB' | 'buoy' | 'float' | 'calc' | 'analysis' | 'readings';
const TABS: Tab[] = ['setup', 'pA', 'pB', 'buoy', 'float', 'calc', 'analysis', 'readings'];

const fmt = (v: number | null | undefined, d = 2) => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(d).replace('.', ',') : '—');
const decOf = (r: ReadingF11) => Math.max(0, Math.round(-Math.log10(r.resolution) + 0.01));
const warnOf = (r: ReadingF11) => (r.qualityFlags.length ? ' ⚠' : '');
const readingsOf = (w: F11World) => w.readingOrder.map((id) => w.readings[id]).filter(Boolean);
/** Lo que muestra una lectura en las listas: el valor con su montaje (líquido, serie, objeto, lastre). */
const showOf = (r: ReadingF11) => {
  const parts: string[] = [`${fmt(r.value, decOf(r))} ${r.unit}`];
  if (r.target) parts.push(r.target);
  if (r.fluid) parts.push(r.fluid === 'mix' ? 'mezcla' : r.fluid === 'B' ? 'salmuera' : 'agua');
  if (typeof r.series === 'number') parts.push(`serie ${r.series}`);
  if (typeof r.ballastG === 'number') parts.push(`lastre ${r.ballastG} g`);
  return parts.join(' · ');
};

/**
 * Libreta digital de F11: cada dato bruto (niveles, presiones de la sonda, cotas de la regla, masas de la balanza,
 * volumen de la probeta, pesos del dinamómetro, inmersiones del soporte y calados) se importa de una lectura con su
 * id; h, p, ρ, el empuje, las fracciones sumergidas y las incertidumbres los escribe el estudiante. La libreta no calcula.
 */
export function NotebookPanelF11() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('setup');
  const nb = useF11((s) => s.notebook);
  const setNb = useF11((s) => s.setNotebook);
  const toggle = useF11((s) => s.toggleNotebook);
  const savedAt = useF11((s) => s.savedAt);
  useF11((s) => s.version);
  const rt = useF11((s) => s.runtime);
  const attemptId = useF11((s) => s.attemptId);
  const wanted = useF11((s) => s.notebookTab);
  useEffect(() => {
    if (wanted && (TABS as string[]).includes(wanted)) setTab(wanted as Tab);
  }, [wanted]);
  if (!rt) return null;
  const w = rt.world;
  const all = readingsOf(w);
  const of = (pred: (r: ReadingF11) => boolean) => all.filter(pred);
  const label = (r: ReadingF11) => `${r.id} · ${showOf(r)}${warnOf(r)}`;

  const cell = (lab: string, e: Entry, path: string, set: (n: F11Notebook, patch: Partial<Entry>) => void, opts: ReadingF11[] = [], withU = true) => (
    <div className="cell" key={path}>
      <span className="label">{lab}</span>
      <input aria-label={lab} type="text" inputMode="decimal" value={e.value} onChange={(ev) => setNb((n) => set(n, { value: ev.target.value, readingId: null }), path, e.value, ev.target.value)} />
      {withU && <input aria-label={`± ${lab}`} className="u" type="text" inputMode="decimal" value={e.uncertainty} placeholder="±" onChange={(ev) => setNb((n) => set(n, { uncertainty: ev.target.value }), `${path}.u`, e.uncertainty, ev.target.value)} />}
      {opts.length > 0 && (
        <select aria-label={`${t('f11.nb.import')} — ${lab}`} value={e.readingId ?? ''} onChange={(ev) => {
          const r = opts.find((x) => x.id === ev.target.value);
          if (r) setNb((n) => set(n, { value: fmt(r.value, decOf(r)), readingId: r.id }), path, e.value, fmt(r.value, decOf(r)));
        }}>
          <option value="">📥</option>
          {opts.map((r) => <option key={r.id} value={r.id}>{label(r)}</option>)}
        </select>
      )}
      {e.readingId && <span className="hint" title={t('f11.nb.imported')}>🔗 {e.readingId}</span>}
    </div>
  );
  const text = (path: string, value: string, set: (n: F11Notebook, v: string) => void, area = true) => {
    const idf = `f11-${path}`;
    const on = (v: string) => setNb((n) => set(n, v), path, value, v);
    return (
      <div className="field" key={path}>
        <label htmlFor={idf}>{t(`f11.nb.f.${path}`)}</label>
        {area ? <textarea id={idf} value={value} onChange={(e) => on(e.target.value)} /> : <input id={idf} type="text" value={value} onChange={(e) => on(e.target.value)} />}
      </div>
    );
  };
  const pick = (aria: string, value: string | null, opts: ReadingF11[], path: string, set: (n: F11Notebook, id: string | null) => void, show: (r: ReadingF11) => string = label) => (
    <select aria-label={aria} value={value ?? ''} onChange={(e) => setNb((n) => set(n, e.target.value || null), path, value ?? '', e.target.value)}>
      <option value="">{t('nb.choose')}</option>
      {opts.map((r) => <option key={r.id} value={r.id}>{show(r)}</option>)}
    </select>
  );
  const num = (aria: string, value: string, path: string, set: (n: F11Notebook, v: string) => void) => (
    <input aria-label={aria} inputMode="decimal" value={value} onChange={(e) => setNb((n) => set(n, e.target.value), path, value, e.target.value)} />
  );

  const src = (kind: string, pred: (t: string) => boolean) => of((r) => r.kind === kind && !!r.target && pred(r.target));
  const setupOpts = Object.fromEntries(SETUP_FIELDS_F11.map((k) => [k, src(SETUP_SOURCE_F11[k].kind, (x) => x === SETUP_SOURCE_F11[k].target)])) as Record<(typeof SETUP_FIELDS_F11)[number], ReadingF11[]>;
  const pressures = of((r) => r.kind === 'pressure' && r.target === 'tank');
  const rulers = of((r) => r.kind === 'ruler');
  const wetW = src('weight', (x) => x === 'water');
  const immersions = of((r) => r.kind === 'immersion');
  const objMasses = src('mass', (x) => x === 'float1' || x === 'bottle1' || x === 'alu1');
  const drafts = of((r) => r.kind === 'draft');
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
        <button className="btn small ghost" aria-label={t('review.export')} onClick={() => downloadJson(`libreta-f11-${attemptId}.json`, { attemptId, notebook: nb, readings: w.readings })}>⬇</button>
        <button className="btn small ghost" onClick={toggle} aria-label={t('common.close')}>×</button>
      </div>
      <div className="drawer-body">
        <div className="tabs" role="tablist">
          {TABS.map((k) => <button key={k} role="tab" className="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{t(`f11.nb.tab.${k}`)}</button>)}
        </div>
        {savedAt && <span className="hint">{t('nb.saved', { time: new Date(savedAt).toLocaleTimeString() })}</span>}
        {tab === 'setup' && (
          <>
            <h3>{t('f11.nb.hypothesis')}</h3>
            {text('hypothesis.question', nb.hypothesis.question, (n, v) => { n.hypothesis.question = v; })}
            {text('hypothesis.prediction', nb.hypothesis.prediction, (n, v) => { n.hypothesis.prediction = v; })}
            <h3>{t('f11.nb.instruments')}</h3>
            <div className="table-scroll">
              <table className="data">
                <thead><tr><th>{t('f11.nb.instrument')}</th><th>{t('f11.nb.resolution')}</th><th>u<sub>B</sub></th><th>{t('f11.nb.status')}</th></tr></thead>
                <tbody>
                  {INSTRUMENTS_F11.map((k) => {
                    const r = nb.instruments[k];
                    const upd = (f: 'resolution' | 'uncertainty' | 'status', v: string) => setNb((n) => { n.instruments[k][f] = v; }, `instruments.${k}.${f}`, r[f], v);
                    return (
                      <tr key={k}>
                        <td>{t(`f11.nb.inst.${k}`)}</td>
                        <td><input aria-label={`${t(`f11.nb.inst.${k}`)} ${t('f11.nb.resolution')}`} value={r.resolution} onChange={(e) => upd('resolution', e.target.value)} /></td>
                        <td><input aria-label={`${t(`f11.nb.inst.${k}`)} uB`} value={r.uncertainty} onChange={(e) => upd('uncertainty', e.target.value)} /></td>
                        <td>
                          <select aria-label={`${t(`f11.nb.inst.${k}`)} ${t('f11.nb.status')}`} value={r.status} onChange={(e) => upd('status', e.target.value)}>
                            <option value="">—</option>
                            {['verified', 'hypothetical', 'pending'].map((s) => <option key={s} value={s}>{t(`f11.nb.st.${s}`)}</option>)}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <h3>{t('f11.nb.setup')}</h3>
            {SETUP_FIELDS_F11.map((k) => cell(`${t(`f11.nb.setupF.${k}`)} (${SETUP_UNIT_F11[k]})`, nb.setup[k], `setup.${k}`, (n, p) => Object.assign(n.setup[k], p), setupOpts[k], false))}
          </>
        )}
        {tab === 'pA' && (
          <>
            <p className="hint">{t('f11.nb.pLead', { liq: t('f11.nb.liq.pA') })}</p>
            {table(['#', t('f11.nb.pressure'), t('f11.nb.ruler'), 'h (m)', 'p (Pa)'], nb.pARows.map((row, i) => [
              i + 1,
              pick(`${t('f11.nb.pressure')} ${i + 1}`, row.pId, pressures, `pARows.${i}.pId`, (n, id) => { n.pARows[i].pId = id; }),
              pick(`${t('f11.nb.ruler')} ${i + 1}`, row.zId, rulers, `pARows.${i}.zId`, (n, id) => { n.pARows[i].zId = id; }),
              ...(['h', 'p'] as const).map((f) => num(`${f} ${i + 1}`, row[f], `pARows.${i}.${f}`, (n, v) => { n.pARows[i][f] = v; })),
            ]))}
          </>
        )}
        {tab === 'pB' && (
          <>
            <p className="hint">{t('f11.nb.pLead', { liq: t('f11.nb.liq.pB') })}</p>
            {table(['#', t('f11.nb.pressure'), t('f11.nb.ruler'), 'h (m)', 'p (Pa)'], nb.pBRows.map((row, i) => [
              i + 1,
              pick(`${t('f11.nb.pressure')} ${i + 1}`, row.pId, pressures, `pBRows.${i}.pId`, (n, id) => { n.pBRows[i].pId = id; }),
              pick(`${t('f11.nb.ruler')} ${i + 1}`, row.zId, rulers, `pBRows.${i}.zId`, (n, id) => { n.pBRows[i].zId = id; }),
              ...(['h', 'p'] as const).map((f) => num(`${f} ${i + 1}`, row[f], `pBRows.${i}.${f}`, (n, v) => { n.pBRows[i][f] = v; })),
            ]))}
          </>
        )}
        {tab === 'buoy' && (
          <>
            <p className="hint">{t('f11.nb.buoyLead')}</p>
            {table(['#', t('f11.nb.wetWeight'), t('f11.nb.immersion'), 'V_sum (cm³)', 'E (N)', 'E prev. (N)'], nb.buoyRows.map((row, i) => [
              i + 1,
              pick(`${t('f11.nb.wetWeight')} ${i + 1}`, row.fId, wetW, `buoyRows.${i}.fId`, (n, id) => { n.buoyRows[i].fId = id; }),
              pick(`${t('f11.nb.immersion')} ${i + 1}`, row.iId, immersions, `buoyRows.${i}.iId`, (n, id) => { n.buoyRows[i].iId = id; }),
              ...(['Vsub', 'Fb', 'FbPred'] as const).map((f) => num(`${f} ${i + 1}`, row[f], `buoyRows.${i}.${f}`, (n, v) => { n.buoyRows[i][f] = v; })),
            ]))}
          </>
        )}
        {tab === 'float' && (
          <>
            <p className="hint">{t('f11.nb.floatLead')}</p>
            {table(['#', t('f11.nb.mass'), t('f11.nb.draft'), 'ρ (kg/m³)', t('f11.nb.fPred'), t('f11.nb.fMeas')], nb.floatRows.map((row, i) => [
              i + 1,
              pick(`${t('f11.nb.mass')} ${i + 1}`, row.mId, objMasses, `floatRows.${i}.mId`, (n, id) => { n.floatRows[i].mId = id; }),
              pick(`${t('f11.nb.draft')} ${i + 1}`, row.dId, drafts, `floatRows.${i}.dId`, (n, id) => { n.floatRows[i].dId = id; }),
              ...(['rho', 'fPred', 'fMeas'] as const).map((f) => num(`${f} ${i + 1}`, row[f], `floatRows.${i}.${f}`, (n, v) => { n.floatRows[i][f] = v; })),
            ]))}
          </>
        )}
        {tab === 'calc' && (
          <>
            <p className="hint">{t('f11.nb.calcLead')}</p>
            {CALC_FIELDS_F11.map((k) => cell(`${t(`f11.nb.calc.${k}`)}${CALC_UNIT_F11[k] ? ` (${CALC_UNIT_F11[k]})` : ''}`, nb.calc[k], `calc.${k}`, (n, p) => Object.assign(n.calc[k], p), [], k !== 'FbDev'))}
            <h3>{t('f11.nb.contrast')}</h3>
            {text('contrastText', nb.contrastText, (n, v) => { n.contrastText = v; })}
          </>
        )}
        {tab === 'analysis' && (
          <>
            <fieldset className="field">
              <legend>{t('f11.nb.mcq')}</legend>
              {MCQ_OPTIONS_F11.map((m) => (
                <label key={m} style={{ display: 'block' }}>
                  <input type="radio" name="f11-mcq" value={m} checked={nb.mcq === m} onChange={() => setNb((n) => { n.mcq = m; }, 'mcq', nb.mcq, m)} /> {t(`f11.nb.mcqOpt.${m}`)}
                </label>
              ))}
            </fieldset>
            {QUESTIONS_F11.map((q) => text(`analysis.${q}`, nb.analysis[q], (n, v) => { n.analysis[q] = v; }))}
            {text('closure', nb.closure, (n, v) => { n.closure = v; })}
          </>
        )}
        {tab === 'readings' && (
          <div className="table-scroll">
            <table className="data">
              <thead><tr><th>id</th><th>{t('f11.nb.instrument')}</th><th>{t('f11.nb.value')}</th><th>{t('f11.nb.flags')}</th></tr></thead>
              <tbody>
                {all.map((r) => (
                  <tr key={r.id}>
                    <td>{r.id}</td>
                    <td>{t(`f11.obj.${r.instrumentId}`)}</td>
                    <td>{showOf(r)}</td>
                    <td>{r.qualityFlags.map((f) => t(`f11.flag.${f}`)).join(', ')}</td>
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
