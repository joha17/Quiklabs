import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useF09 } from './store';
import {
  CALC_FIELDS_F9, CALC_UNIT_F9, INSTRUMENTS_F9, MCQ_OPTIONS_F9, QUESTIONS_F9, SETUP_FIELDS_F9, SETUP_UNIT_F9, type Entry, type F09Notebook,
} from '../../practices/practice-f09/notebook';
import type { F09World, ReadingF9 } from '../../simulation/f09-world/types';
import { downloadJson } from '../persistence';

type Tab = 'setup' | 'circ' | 'torque' | 'momentum' | 'calc' | 'analysis' | 'readings';
const TABS: Tab[] = ['setup', 'circ', 'torque', 'momentum', 'calc', 'analysis', 'readings'];

const fmt = (v: number | null | undefined, d = 2) => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(d).replace('.', ',') : '—');
const decOf = (r: ReadingF9) => Math.max(0, Math.round(-Math.log10(r.resolution) + 0.01));
const warnOf = (r: ReadingF9) => (r.qualityFlags.length ? ' ⚠' : '');
const readingsOf = (w: F09World) => w.readingOrder.map((id) => w.readings[id]).filter(Boolean);
/** Lo que muestra una lectura en las listas: el valor con su montaje (radio de la masa, brazo, radios de las masas radiales). */
const showOf = (r: ReadingF9) => {
  const su = r.setup ?? {};
  let tag = ` · ${r.trialId}`;
  if (r.kind === 'force' && su.orbitR) tag = ` · r ${fmt(su.orbitR * 100, 0)} cm${tag}`;
  if ((r.kind === 'dyn' || r.kind === 'encoder') && su.armR) tag = ` · brazo ${fmt(su.armR * 100, 0)} cm${tag}`;
  if (r.kind === 'omega' && su.slides) tag = ` · masas ${fmt(su.slides[0] * 100, 0)} cm${tag}`;
  if (r.kind === 'encoder' && r.fit) return `α ${fmt(r.fit.alpha, 3)} · α_c ${fmt(r.fit.alphaC, 3)} rad/s²${tag}`;
  if (r.kind === 'period') return `${fmt(r.value, decOf(r))} s · ${fmt(r.turns, 1)} v${tag}`;
  if (r.kind === 'mass' || r.kind === 'radius') return `${fmt(r.value, decOf(r))} ${r.unit} · ${r.target ?? '—'}`;
  return `${fmt(r.value, decOf(r))} ${r.unit}${tag}`;
};

/**
 * Libreta digital de F09: cada dato bruto (masas de la balanza, radios de la regla, fuerza del sensor, tiempos de la
 * fotopuerta, lecturas del dinamómetro, ajustes y ω del encoder) se importa de una lectura con su id; T, ω, v, F
 * prevista, τ, α, I, L, K y las incertidumbres los escribe el estudiante. La libreta no calcula.
 */
export function NotebookPanelF09() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('setup');
  const nb = useF09((s) => s.notebook);
  const setNb = useF09((s) => s.setNotebook);
  const toggle = useF09((s) => s.toggleNotebook);
  const savedAt = useF09((s) => s.savedAt);
  useF09((s) => s.version);
  const rt = useF09((s) => s.runtime);
  const attemptId = useF09((s) => s.attemptId);
  const wanted = useF09((s) => s.notebookTab);
  useEffect(() => {
    if (wanted && (TABS as string[]).includes(wanted)) setTab(wanted as Tab);
  }, [wanted]);
  if (!rt) return null;
  const w = rt.world;
  const all = readingsOf(w);
  const of = (pred: (r: ReadingF9) => boolean) => all.filter(pred);
  const label = (r: ReadingF9) => `${r.id} · ${showOf(r)}${warnOf(r)}`;

  const cell = (lab: string, e: Entry, path: string, set: (n: F09Notebook, patch: Partial<Entry>) => void, opts: ReadingF9[] = [], withU = true) => (
    <div className="cell" key={path}>
      <span className="label">{lab}</span>
      <input aria-label={lab} type="text" inputMode="decimal" value={e.value} onChange={(ev) => setNb((n) => set(n, { value: ev.target.value, readingId: null }), path, e.value, ev.target.value)} />
      {withU && <input aria-label={`± ${lab}`} className="u" type="text" inputMode="decimal" value={e.uncertainty} placeholder="±" onChange={(ev) => setNb((n) => set(n, { uncertainty: ev.target.value }), `${path}.u`, e.uncertainty, ev.target.value)} />}
      {opts.length > 0 && (
        <select aria-label={`${t('f09.nb.import')} — ${lab}`} value={e.readingId ?? ''} onChange={(ev) => {
          const r = opts.find((x) => x.id === ev.target.value);
          if (r) setNb((n) => set(n, { value: fmt(r.value, decOf(r)), readingId: r.id }), path, e.value, fmt(r.value, decOf(r)));
        }}>
          <option value="">📥</option>
          {opts.map((r) => <option key={r.id} value={r.id}>{label(r)}</option>)}
        </select>
      )}
      {e.readingId && <span className="hint" title={t('f09.nb.imported')}>🔗 {e.readingId}</span>}
    </div>
  );
  const text = (path: string, value: string, set: (n: F09Notebook, v: string) => void, area = true) => {
    const idf = `f09-${path}`;
    const on = (v: string) => setNb((n) => set(n, v), path, value, v);
    return (
      <div className="field" key={path}>
        <label htmlFor={idf}>{t(`f09.nb.f.${path}`)}</label>
        {area ? <textarea id={idf} value={value} onChange={(e) => on(e.target.value)} /> : <input id={idf} type="text" value={value} onChange={(e) => on(e.target.value)} />}
      </div>
    );
  };
  const pick = (aria: string, value: string | null, opts: ReadingF9[], path: string, set: (n: F09Notebook, id: string | null) => void, show: (r: ReadingF9) => string = label) => (
    <select aria-label={aria} value={value ?? ''} onChange={(e) => setNb((n) => set(n, e.target.value || null), path, value ?? '', e.target.value)}>
      <option value="">{t('nb.choose')}</option>
      {opts.map((r) => <option key={r.id} value={r.id}>{show(r)}</option>)}
    </select>
  );
  const num = (aria: string, value: string, path: string, set: (n: F09Notebook, v: string) => void) => (
    <input aria-label={aria} inputMode="decimal" value={value} onChange={(e) => setNb((n) => set(n, e.target.value), path, value, e.target.value)} />
  );

  const mass = (pred: (t: string) => boolean) => of((r) => r.kind === 'mass' && !!r.target && pred(r.target));
  const rad = (pred: (t: string) => boolean) => of((r) => r.kind === 'radius' && !!r.target && pred(r.target));
  const setupOpts: Record<(typeof SETUP_FIELDS_F9)[number], ReadingF9[]> = {
    mOrb: mass((x) => x === 'orbit01'),
    mSlide: mass((x) => x.startsWith('slide')),
    rOrb: rad((x) => x === 'orbit01'),
    rArm1: rad((x) => x === 'arm'),
    rArm2: rad((x) => x === 'arm'),
    rSlideC: rad((x) => x.startsWith('slide')),
  };
  const forces = of((r) => r.kind === 'force');
  const periods = of((r) => r.kind === 'period');
  const dyns = of((r) => r.kind === 'dyn');
  const encs = of((r) => r.kind === 'encoder' && !!r.fit);
  const omegas = of((r) => r.kind === 'omega');
  const slideR = rad((x) => x.startsWith('slide'));
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
        <button className="btn small ghost" aria-label={t('review.export')} onClick={() => downloadJson(`libreta-f09-${attemptId}.json`, { attemptId, notebook: nb, readings: w.readings })}>⬇</button>
        <button className="btn small ghost" onClick={toggle} aria-label={t('common.close')}>×</button>
      </div>
      <div className="drawer-body">
        <div className="tabs" role="tablist">
          {TABS.map((k) => <button key={k} role="tab" className="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{t(`f09.nb.tab.${k}`)}</button>)}
        </div>
        {savedAt && <span className="hint">{t('nb.saved', { time: new Date(savedAt).toLocaleTimeString() })}</span>}
        {tab === 'setup' && (
          <>
            <h3>{t('f09.nb.hypothesis')}</h3>
            {text('hypothesis.question', nb.hypothesis.question, (n, v) => { n.hypothesis.question = v; })}
            {text('hypothesis.prediction', nb.hypothesis.prediction, (n, v) => { n.hypothesis.prediction = v; })}
            <h3>{t('f09.nb.instruments')}</h3>
            <div className="table-scroll">
              <table className="data">
                <thead><tr><th>{t('f09.nb.instrument')}</th><th>{t('f09.nb.resolution')}</th><th>u<sub>B</sub></th><th>{t('f09.nb.status')}</th></tr></thead>
                <tbody>
                  {INSTRUMENTS_F9.map((k) => {
                    const r = nb.instruments[k];
                    const upd = (f: 'resolution' | 'uncertainty' | 'status', v: string) => setNb((n) => { n.instruments[k][f] = v; }, `instruments.${k}.${f}`, r[f], v);
                    return (
                      <tr key={k}>
                        <td>{t(`f09.nb.inst.${k}`)}</td>
                        <td><input aria-label={`${t(`f09.nb.inst.${k}`)} ${t('f09.nb.resolution')}`} value={r.resolution} onChange={(e) => upd('resolution', e.target.value)} /></td>
                        <td><input aria-label={`${t(`f09.nb.inst.${k}`)} uB`} value={r.uncertainty} onChange={(e) => upd('uncertainty', e.target.value)} /></td>
                        <td>
                          <select aria-label={`${t(`f09.nb.inst.${k}`)} ${t('f09.nb.status')}`} value={r.status} onChange={(e) => upd('status', e.target.value)}>
                            <option value="">—</option>
                            {['verified', 'hypothetical', 'pending'].map((s) => <option key={s} value={s}>{t(`f09.nb.st.${s}`)}</option>)}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <h3>{t('f09.nb.setup')}</h3>
            {SETUP_FIELDS_F9.map((k) => cell(`${t(`f09.nb.setupF.${k}`)} (${SETUP_UNIT_F9[k]})`, nb.setup[k], `setup.${k}`, (n, p) => Object.assign(n.setup[k], p), setupOpts[k], false))}
          </>
        )}
        {tab === 'circ' && (
          <>
            <p className="hint">{t('f09.nb.circLead')}</p>
            {table(['#', t('f09.nb.force'), t('f09.nb.period'), 'T (s)', 'ω (rad/s)', 'v (m/s)', 'F = mω²r (N)', `${t('f09.nb.diff')} (%)`], nb.circRows.map((row, i) => [
              i + 1,
              pick(`${t('f09.nb.force')} ${i + 1}`, row.forceId, forces, `circRows.${i}.forceId`, (n, id) => { n.circRows[i].forceId = id; }),
              pick(`${t('f09.nb.period')} ${i + 1}`, row.periodId, periods, `circRows.${i}.periodId`, (n, id) => { n.circRows[i].periodId = id; }),
              ...(['T', 'omega', 'v', 'Fpred', 'diff'] as const).map((f) => num(`${f} ${i + 1}`, row[f], `circRows.${i}.${f}`, (n, v) => { n.circRows[i][f] = v; })),
            ]))}
          </>
        )}
        {tab === 'torque' && (
          <>
            <p className="hint">{t('f09.nb.torqueLead')}</p>
            {table(['#', t('f09.nb.dyn'), t('f09.nb.encoder'), 'τ = rF (N·m)', 'α (rad/s²)', '|α_c| (rad/s²)', 'I (kg·m²)'], nb.torqueRows.map((row, i) => [
              i + 1,
              pick(`${t('f09.nb.dyn')} ${i + 1}`, row.dynId, dyns, `torqueRows.${i}.dynId`, (n, id) => { n.torqueRows[i].dynId = id; }),
              pick(`${t('f09.nb.encoder')} ${i + 1}`, row.encId, encs, `torqueRows.${i}.encId`, (n, id) => { n.torqueRows[i].encId = id; }),
              ...(['tau', 'alpha', 'alphaC', 'I'] as const).map((f) => num(`${f} ${i + 1}`, row[f], `torqueRows.${i}.${f}`, (n, v) => { n.torqueRows[i][f] = v; })),
            ]))}
          </>
        )}
        {tab === 'momentum' && (
          <>
            <p className="hint">{t('f09.nb.momentumLead')}</p>
            {table([t('f09.nb.w1'), t('f09.nb.w2'), t('f09.nb.r1'), t('f09.nb.r2')], [[
              pick(t('f09.nb.w1'), nb.momentum.w1Id, omegas, 'momentum.w1Id', (n, id) => { n.momentum.w1Id = id; }),
              pick(t('f09.nb.w2'), nb.momentum.w2Id, omegas, 'momentum.w2Id', (n, id) => { n.momentum.w2Id = id; }),
              pick(t('f09.nb.r1'), nb.momentum.r1Id, slideR, 'momentum.r1Id', (n, id) => { n.momentum.r1Id = id; }),
              pick(t('f09.nb.r2'), nb.momentum.r2Id, slideR, 'momentum.r2Id', (n, id) => { n.momentum.r2Id = id; }),
            ]])}
            {table(['I₁ (kg·m²)', 'I₂ (kg·m²)', 'L₁ (kg·m²/s)', 'L₂ (kg·m²/s)', 'ΔL/L₁ (%)', 'K₁ (J)', 'K₂ (J)'], [
              (['I1', 'I2', 'L1', 'L2', 'dL', 'K1', 'K2'] as const).map((f) => num(f, nb.momentum[f], `momentum.${f}`, (n, v) => { n.momentum[f] = v; })),
            ])}
          </>
        )}
        {tab === 'calc' && (
          <>
            <p className="hint">{t('f09.nb.calcLead')}</p>
            {CALC_FIELDS_F9.map((k) => cell(`${t(`f09.nb.calc.${k}`)}${CALC_UNIT_F9[k] ? ` (${CALC_UNIT_F9[k]})` : ''}`, nb.calc[k], `calc.${k}`, (n, p) => Object.assign(n.calc[k], p), [], k === 'mr' || k === 'Itorque'))}
            <h3>{t('f09.nb.contrast')}</h3>
            {text('contrastText', nb.contrastText, (n, v) => { n.contrastText = v; })}
          </>
        )}
        {tab === 'analysis' && (
          <>
            <fieldset className="field">
              <legend>{t('f09.nb.mcq')}</legend>
              {MCQ_OPTIONS_F9.map((m) => (
                <label key={m} style={{ display: 'block' }}>
                  <input type="radio" name="f09-mcq" value={m} checked={nb.mcq === m} onChange={() => setNb((n) => { n.mcq = m; }, 'mcq', nb.mcq, m)} /> {t(`f09.nb.mcqOpt.${m}`)}
                </label>
              ))}
            </fieldset>
            {QUESTIONS_F9.map((q) => text(`analysis.${q}`, nb.analysis[q], (n, v) => { n.analysis[q] = v; }))}
            {text('closure', nb.closure, (n, v) => { n.closure = v; })}
          </>
        )}
        {tab === 'readings' && (
          <div className="table-scroll">
            <table className="data">
              <thead><tr><th>id</th><th>{t('f09.nb.instrument')}</th><th>{t('f09.nb.value')}</th><th>{t('f09.nb.flags')}</th></tr></thead>
              <tbody>
                {all.map((r) => (
                  <tr key={r.id}>
                    <td>{r.id}</td>
                    <td>{t(`f09.obj.${r.instrumentId}`)}</td>
                    <td>{showOf(r)}</td>
                    <td>{r.qualityFlags.map((f) => t(`f09.flag.${f}`)).join(', ')}</td>
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
