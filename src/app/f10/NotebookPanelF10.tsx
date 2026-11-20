import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useF10 } from './store';
import {
  CALC_FIELDS_F10, CALC_UNIT_F10, INSTRUMENTS_F10, MCQ_OPTIONS_F10, QUESTIONS_F10, SETUP_FIELDS_F10, SETUP_UNIT_F10, type Entry, type F10Notebook,
} from '../../practices/practice-f10/notebook';
import type { F10World, ReadingF10 } from '../../simulation/f10-world/types';
import { downloadJson } from '../persistence';

type Tab = 'setup' | 'eq' | 'el' | 'plastic' | 'calc' | 'analysis' | 'readings';
const TABS: Tab[] = ['setup', 'eq', 'el', 'plastic', 'calc', 'analysis', 'readings'];

const fmt = (v: number | null | undefined, d = 2) => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(d).replace('.', ',') : '—');
const decOf = (r: ReadingF10) => Math.max(0, Math.round(-Math.log10(r.resolution) + 0.01));
const warnOf = (r: ReadingF10) => (r.qualityFlags.length ? ' ⚠' : '');
const readingsOf = (w: F10World) => w.readingOrder.map((id) => w.readings[id]).filter(Boolean);
/** Lo que muestra una lectura en las listas: el valor con su montaje (posición de la carga, apoyos, escalón). */
const showOf = (r: ReadingF10) => {
  const su = r.setup ?? {};
  let tag = ` · ${r.trialId}`;
  if (r.kind === 'reaction' && su.loadOn && typeof su.load === 'number') tag = ` · carga ${fmt(su.load, 1)} cm${tag}`;
  if (r.kind === 'reaction' && !su.loadOn) tag = ` · sin carga${tag}`;
  if (r.kind === 'curve' && r.fit) return `k ${fmt(r.fit.k, 0)} N/mm · F_máx ${fmt(r.fit.Fmax, 0)} N · res ${fmt(r.fit.res, 3)} mm${tag}`;
  if (r.kind === 'weight' || r.kind === 'position' || r.kind === 'diameter') return `${fmt(r.value, decOf(r))} ${r.unit} · ${r.target ?? '—'}`;
  return `${fmt(r.value, decOf(r))} ${r.unit}${tag}`;
};

/**
 * Libreta digital de F10: cada dato bruto (pesos del dinamómetro, posiciones de la cinta, reacciones de los apoyos,
 * diámetro del calibre, fuerza de la celda, alargamiento del comparador y curvas del registrador) se importa de una
 * lectura con su id; R previstas, ΣF, Στ, σ, ε, E y las incertidumbres los escribe el estudiante. La libreta no calcula.
 */
export function NotebookPanelF10() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('setup');
  const nb = useF10((s) => s.notebook);
  const setNb = useF10((s) => s.setNotebook);
  const toggle = useF10((s) => s.toggleNotebook);
  const savedAt = useF10((s) => s.savedAt);
  useF10((s) => s.version);
  const rt = useF10((s) => s.runtime);
  const attemptId = useF10((s) => s.attemptId);
  const wanted = useF10((s) => s.notebookTab);
  useEffect(() => {
    if (wanted && (TABS as string[]).includes(wanted)) setTab(wanted as Tab);
  }, [wanted]);
  if (!rt) return null;
  const w = rt.world;
  const all = readingsOf(w);
  const of = (pred: (r: ReadingF10) => boolean) => all.filter(pred);
  const label = (r: ReadingF10) => `${r.id} · ${showOf(r)}${warnOf(r)}`;

  const cell = (lab: string, e: Entry, path: string, set: (n: F10Notebook, patch: Partial<Entry>) => void, opts: ReadingF10[] = [], withU = true) => (
    <div className="cell" key={path}>
      <span className="label">{lab}</span>
      <input aria-label={lab} type="text" inputMode="decimal" value={e.value} onChange={(ev) => setNb((n) => set(n, { value: ev.target.value, readingId: null }), path, e.value, ev.target.value)} />
      {withU && <input aria-label={`± ${lab}`} className="u" type="text" inputMode="decimal" value={e.uncertainty} placeholder="±" onChange={(ev) => setNb((n) => set(n, { uncertainty: ev.target.value }), `${path}.u`, e.uncertainty, ev.target.value)} />}
      {opts.length > 0 && (
        <select aria-label={`${t('f10.nb.import')} — ${lab}`} value={e.readingId ?? ''} onChange={(ev) => {
          const r = opts.find((x) => x.id === ev.target.value);
          if (r) setNb((n) => set(n, { value: fmt(r.value, decOf(r)), readingId: r.id }), path, e.value, fmt(r.value, decOf(r)));
        }}>
          <option value="">📥</option>
          {opts.map((r) => <option key={r.id} value={r.id}>{label(r)}</option>)}
        </select>
      )}
      {e.readingId && <span className="hint" title={t('f10.nb.imported')}>🔗 {e.readingId}</span>}
    </div>
  );
  const text = (path: string, value: string, set: (n: F10Notebook, v: string) => void, area = true) => {
    const idf = `f10-${path}`;
    const on = (v: string) => setNb((n) => set(n, v), path, value, v);
    return (
      <div className="field" key={path}>
        <label htmlFor={idf}>{t(`f10.nb.f.${path}`)}</label>
        {area ? <textarea id={idf} value={value} onChange={(e) => on(e.target.value)} /> : <input id={idf} type="text" value={value} onChange={(e) => on(e.target.value)} />}
      </div>
    );
  };
  const pick = (aria: string, value: string | null, opts: ReadingF10[], path: string, set: (n: F10Notebook, id: string | null) => void, show: (r: ReadingF10) => string = label) => (
    <select aria-label={aria} value={value ?? ''} onChange={(e) => setNb((n) => set(n, e.target.value || null), path, value ?? '', e.target.value)}>
      <option value="">{t('nb.choose')}</option>
      {opts.map((r) => <option key={r.id} value={r.id}>{show(r)}</option>)}
    </select>
  );
  const num = (aria: string, value: string, path: string, set: (n: F10Notebook, v: string) => void) => (
    <input aria-label={aria} inputMode="decimal" value={value} onChange={(e) => setNb((n) => set(n, e.target.value), path, value, e.target.value)} />
  );

  const src = (kind: string, pred: (t: string) => boolean) => of((r) => r.kind === kind && !!r.target && pred(r.target));
  const setupOpts: Record<(typeof SETUP_FIELDS_F10)[number], ReadingF10[]> = {
    Wb: src('weight', (x) => x === 'beam'),
    W1: src('weight', (x) => x === 'load1'),
    xCG: src('position', (x) => x === 'cg'),
    xA: src('position', (x) => x === 'supA'),
    xB: src('position', (x) => x === 'supB'),
    d: of((r) => r.kind === 'diameter'),
    L0: src('position', (x) => x === 'L0'),
  };
  const reacts = (id: string) => of((r) => r.kind === 'reaction' && r.instrumentId === id);
  const loadX = src('position', (x) => x === 'load1');
  const forces = of((r) => r.kind === 'force');
  const elongs = of((r) => r.kind === 'elong');
  const curves = of((r) => r.kind === 'curve' && !!r.fit);
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
        <button className="btn small ghost" aria-label={t('review.export')} onClick={() => downloadJson(`libreta-f10-${attemptId}.json`, { attemptId, notebook: nb, readings: w.readings })}>⬇</button>
        <button className="btn small ghost" onClick={toggle} aria-label={t('common.close')}>×</button>
      </div>
      <div className="drawer-body">
        <div className="tabs" role="tablist">
          {TABS.map((k) => <button key={k} role="tab" className="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{t(`f10.nb.tab.${k}`)}</button>)}
        </div>
        {savedAt && <span className="hint">{t('nb.saved', { time: new Date(savedAt).toLocaleTimeString() })}</span>}
        {tab === 'setup' && (
          <>
            <h3>{t('f10.nb.hypothesis')}</h3>
            {text('hypothesis.question', nb.hypothesis.question, (n, v) => { n.hypothesis.question = v; })}
            {text('hypothesis.prediction', nb.hypothesis.prediction, (n, v) => { n.hypothesis.prediction = v; })}
            <h3>{t('f10.nb.instruments')}</h3>
            <div className="table-scroll">
              <table className="data">
                <thead><tr><th>{t('f10.nb.instrument')}</th><th>{t('f10.nb.resolution')}</th><th>u<sub>B</sub></th><th>{t('f10.nb.status')}</th></tr></thead>
                <tbody>
                  {INSTRUMENTS_F10.map((k) => {
                    const r = nb.instruments[k];
                    const upd = (f: 'resolution' | 'uncertainty' | 'status', v: string) => setNb((n) => { n.instruments[k][f] = v; }, `instruments.${k}.${f}`, r[f], v);
                    return (
                      <tr key={k}>
                        <td>{t(`f10.nb.inst.${k}`)}</td>
                        <td><input aria-label={`${t(`f10.nb.inst.${k}`)} ${t('f10.nb.resolution')}`} value={r.resolution} onChange={(e) => upd('resolution', e.target.value)} /></td>
                        <td><input aria-label={`${t(`f10.nb.inst.${k}`)} uB`} value={r.uncertainty} onChange={(e) => upd('uncertainty', e.target.value)} /></td>
                        <td>
                          <select aria-label={`${t(`f10.nb.inst.${k}`)} ${t('f10.nb.status')}`} value={r.status} onChange={(e) => upd('status', e.target.value)}>
                            <option value="">—</option>
                            {['verified', 'hypothetical', 'pending'].map((s) => <option key={s} value={s}>{t(`f10.nb.st.${s}`)}</option>)}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <h3>{t('f10.nb.setup')}</h3>
            {SETUP_FIELDS_F10.map((k) => cell(`${t(`f10.nb.setupF.${k}`)} (${SETUP_UNIT_F10[k]})`, nb.setup[k], `setup.${k}`, (n, p) => Object.assign(n.setup[k], p), setupOpts[k], false))}
          </>
        )}
        {tab === 'eq' && (
          <>
            <p className="hint">{t('f10.nb.eqLead')}</p>
            {table(['#', 'R_A', 'R_B', t('f10.nb.loadX'), 'R_B prev. (N)', 'R_A prev. (N)', 'ΣF (N)', 'Στ_A (N·m)'], nb.eqRows.map((row, i) => [
              i + 1,
              pick(`R_A ${i + 1}`, row.raId, reacts('supportA'), `eqRows.${i}.raId`, (n, id) => { n.eqRows[i].raId = id; }),
              pick(`R_B ${i + 1}`, row.rbId, reacts('supportB'), `eqRows.${i}.rbId`, (n, id) => { n.eqRows[i].rbId = id; }),
              pick(`${t('f10.nb.loadX')} ${i + 1}`, row.xId, loadX, `eqRows.${i}.xId`, (n, id) => { n.eqRows[i].xId = id; }),
              ...(['RbPred', 'RaPred', 'sumF', 'tauA'] as const).map((f) => num(`${f} ${i + 1}`, row[f], `eqRows.${i}.${f}`, (n, v) => { n.eqRows[i][f] = v; })),
            ]))}
          </>
        )}
        {tab === 'el' && (
          <>
            <p className="hint">{t('f10.nb.elLead')}</p>
            {table(['#', t('f10.nb.force'), t('f10.nb.elong'), 'σ (Pa)', 'ε'], nb.elRows.map((row, i) => [
              i + 1,
              pick(`${t('f10.nb.force')} ${i + 1}`, row.fId, forces, `elRows.${i}.fId`, (n, id) => { n.elRows[i].fId = id; }),
              pick(`${t('f10.nb.elong')} ${i + 1}`, row.eId, elongs, `elRows.${i}.eId`, (n, id) => { n.elRows[i].eId = id; }),
              ...(['sigma', 'eps'] as const).map((f) => num(`${f} ${i + 1}`, row[f], `elRows.${i}.${f}`, (n, v) => { n.elRows[i][f] = v; })),
            ]))}
          </>
        )}
        {tab === 'plastic' && (
          <>
            <p className="hint">{t('f10.nb.plasticLead')}</p>
            {table([t('f10.nb.rev'), t('f10.nb.curve'), t('f10.nb.res')], [[
              pick(t('f10.nb.rev'), nb.plastic.revId, elongs, 'plastic.revId', (n, id) => { n.plastic.revId = id; }),
              pick(t('f10.nb.curve'), nb.plastic.curveId, curves, 'plastic.curveId', (n, id) => { n.plastic.curveId = id; }),
              pick(t('f10.nb.res'), nb.plastic.resId, elongs, 'plastic.resId', (n, id) => { n.plastic.resId = id; }),
            ]])}
            {table(['ε reversible', 'σ máx (Pa)', 'ε residual'], [
              (['epsRev', 'sigmaMax', 'epsRes'] as const).map((f) => num(f, nb.plastic[f], `plastic.${f}`, (n, v) => { n.plastic[f] = v; })),
            ])}
          </>
        )}
        {tab === 'calc' && (
          <>
            <p className="hint">{t('f10.nb.calcLead')}</p>
            {CALC_FIELDS_F10.map((k) => cell(`${t(`f10.nb.calc.${k}`)}${CALC_UNIT_F10[k] ? ` (${CALC_UNIT_F10[k]})` : ''}`, nb.calc[k], `calc.${k}`, (n, p) => Object.assign(n.calc[k], p), [], k !== 'Edev'))}
            <h3>{t('f10.nb.contrast')}</h3>
            {text('contrastText', nb.contrastText, (n, v) => { n.contrastText = v; })}
          </>
        )}
        {tab === 'analysis' && (
          <>
            <fieldset className="field">
              <legend>{t('f10.nb.mcq')}</legend>
              {MCQ_OPTIONS_F10.map((m) => (
                <label key={m} style={{ display: 'block' }}>
                  <input type="radio" name="f10-mcq" value={m} checked={nb.mcq === m} onChange={() => setNb((n) => { n.mcq = m; }, 'mcq', nb.mcq, m)} /> {t(`f10.nb.mcqOpt.${m}`)}
                </label>
              ))}
            </fieldset>
            {QUESTIONS_F10.map((q) => text(`analysis.${q}`, nb.analysis[q], (n, v) => { n.analysis[q] = v; }))}
            {text('closure', nb.closure, (n, v) => { n.closure = v; })}
          </>
        )}
        {tab === 'readings' && (
          <div className="table-scroll">
            <table className="data">
              <thead><tr><th>id</th><th>{t('f10.nb.instrument')}</th><th>{t('f10.nb.value')}</th><th>{t('f10.nb.flags')}</th></tr></thead>
              <tbody>
                {all.map((r) => (
                  <tr key={r.id}>
                    <td>{r.id}</td>
                    <td>{t(`f10.obj.${r.instrumentId}`)}</td>
                    <td>{showOf(r)}</td>
                    <td>{r.qualityFlags.map((f) => t(`f10.flag.${f}`)).join(', ')}</td>
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
