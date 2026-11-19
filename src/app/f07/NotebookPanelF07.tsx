import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useF07 } from './store';
import {
  CALC_FIELDS_F7, CALC_UNIT_F7, INSTRUMENTS_F7, MCQ_OPTIONS_F7, QUESTIONS_F7, SETUP_FIELDS_F7, SETUP_UNIT_F7, type Entry, type F07Notebook,
} from '../../practices/practice-f07/notebook';
import type { F07World, ReadingF7 } from '../../simulation/f07-world/types';
import { downloadJson } from '../persistence';

type Tab = 'setup' | 'elastic' | 'stick' | 'impulse' | 'cm' | 'calc' | 'analysis' | 'readings';
const TABS: Tab[] = ['setup', 'elastic', 'stick', 'impulse', 'cm', 'calc', 'analysis', 'readings'];

const fmt = (v: number | null | undefined, d = 2) => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(d).replace('.', ',') : '—');
const decOf = (r: ReadingF7) => Math.max(0, Math.round(-Math.log10(r.resolution) + 0.01));
const warnOf = (r: ReadingF7) => (r.qualityFlags.length ? ' ⚠' : '');
const readingsOf = (w: F07World) => w.readingOrder.map((id) => w.readings[id]).filter(Boolean);
/** Lo que muestra una lectura en las listas: los cruces de las fotopuertas, el impulso del sensor, la cámara. */
const showOf = (r: ReadingF7) => {
  const su = r.setup ?? {};
  const tag = `${su.bumper ? ` · ${su.bumper}` : ''}${su.mA !== undefined ? ` · ${fmt((su.mA ?? 0) * 1000, 0)}/${fmt((su.mB ?? 0) * 1000, 0)} g` : ''} · ${r.trialId}`;
  if (r.kind === 'gates' && r.gates) {
    const tc = r.gates.tc;
    const cr = r.gates.crossings.map((c) => `${c.cart === 'cartA' ? 'A' : 'B'}${c.dir > 0 ? '→' : '←'}${tc !== null && c.t < tc ? 'ᵢ' : 'f'} ${fmt(c.dt, 5)} s`).join(' · ');
    return `${cr || '—'}${r.gates.stuck ? ' · ⧉' : ''}${tag}`;
  }
  if (r.kind === 'force' && r.force) return `J_B ${fmt(r.force.J, 4)} N·s · F_máx ${fmt(r.force.Fmax, 2)} N · Δt ${fmt(r.force.tContact, 4)} s${tag}`;
  if (r.kind === 'motion' && r.motion) return `v_A ${fmt(r.motion.vA1, 3)}→${fmt(r.motion.vA2, 3)} · v_B ${fmt(r.motion.vB1, 3)}→${fmt(r.motion.vB2, 3)} m/s${tag}`;
  if (r.kind === 'mass') return `${fmt(r.value, decOf(r))} g · ${r.target}${su.load ? ` + ${su.load} g` : ''}`;
  return `${fmt(r.value, decOf(r))} ${r.unit}${r.target ? ` · ${r.target}` : ''}`;
};

/**
 * Libreta digital de F07: cada dato bruto (masas de la balanza, anchos de bandera del calibre, inclinación del nivel,
 * cruces de las fotopuertas, impulso del sensor de fuerza, velocidades de la cámara) se importa de una lectura con su
 * id; las velocidades con signo, los momentos, Δp, e, el impulso, la energía perdida, v_CM y las incertidumbres los
 * escribe el estudiante. La libreta no calcula nada.
 */
export function NotebookPanelF07() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('setup');
  const nb = useF07((s) => s.notebook);
  const setNb = useF07((s) => s.setNotebook);
  const toggle = useF07((s) => s.toggleNotebook);
  const savedAt = useF07((s) => s.savedAt);
  useF07((s) => s.version);
  const rt = useF07((s) => s.runtime);
  const attemptId = useF07((s) => s.attemptId);
  const wanted = useF07((s) => s.notebookTab);
  useEffect(() => {
    if (wanted && (TABS as string[]).includes(wanted)) setTab(wanted as Tab);
  }, [wanted]);
  if (!rt) return null;
  const w = rt.world;
  const all = readingsOf(w);
  const of = (pred: (r: ReadingF7) => boolean) => all.filter(pred);
  const label = (r: ReadingF7) => `${r.id} · ${showOf(r)}${warnOf(r)}`;

  const cell = (lab: string, e: Entry, path: string, set: (n: F07Notebook, patch: Partial<Entry>) => void, opts: ReadingF7[] = [], withU = true) => (
    <div className="cell" key={path}>
      <span className="label">{lab}</span>
      <input aria-label={lab} type="text" inputMode="decimal" value={e.value} onChange={(ev) => setNb((n) => set(n, { value: ev.target.value, readingId: null }), path, e.value, ev.target.value)} />
      {withU && <input aria-label={`± ${lab}`} className="u" type="text" inputMode="decimal" value={e.uncertainty} placeholder="±" onChange={(ev) => setNb((n) => set(n, { uncertainty: ev.target.value }), `${path}.u`, e.uncertainty, ev.target.value)} />}
      {opts.length > 0 && (
        <select aria-label={`${t('f07.nb.import')} — ${lab}`} value={e.readingId ?? ''} onChange={(ev) => {
          const r = opts.find((x) => x.id === ev.target.value);
          if (r) setNb((n) => set(n, { value: fmt(r.value, decOf(r)), readingId: r.id }), path, e.value, fmt(r.value, decOf(r)));
        }}>
          <option value="">📥</option>
          {opts.map((r) => <option key={r.id} value={r.id}>{label(r)}</option>)}
        </select>
      )}
      {e.readingId && <span className="hint" title={t('f07.nb.imported')}>🔗 {e.readingId}</span>}
    </div>
  );
  const text = (path: string, value: string, set: (n: F07Notebook, v: string) => void, area = true) => {
    const idf = `f07-${path}`;
    const on = (v: string) => setNb((n) => set(n, v), path, value, v);
    return (
      <div className="field" key={path}>
        <label htmlFor={idf}>{t(`f07.nb.f.${path}`)}</label>
        {area ? <textarea id={idf} value={value} onChange={(e) => on(e.target.value)} /> : <input id={idf} type="text" value={value} onChange={(e) => on(e.target.value)} />}
      </div>
    );
  };
  const pick = (aria: string, value: string | null, opts: ReadingF7[], path: string, set: (n: F07Notebook, id: string | null) => void, show: (r: ReadingF7) => string = label) => (
    <select aria-label={aria} value={value ?? ''} onChange={(e) => setNb((n) => set(n, e.target.value || null), path, value ?? '', e.target.value)}>
      <option value="">{t('nb.choose')}</option>
      {opts.map((r) => <option key={r.id} value={r.id}>{show(r)}</option>)}
    </select>
  );
  const num = (aria: string, value: string, path: string, set: (n: F07Notebook, v: string) => void) => (
    <input aria-label={aria} inputMode="decimal" value={value} onChange={(e) => setNb((n) => set(n, e.target.value), path, value, e.target.value)} />
  );

  const setupOpts: Record<(typeof SETUP_FIELDS_F7)[number], ReadingF7[]> = {
    mA: of((r) => r.kind === 'mass' && r.target === 'cartA'),
    mB: of((r) => r.kind === 'mass' && r.target === 'cartB'),
    flagA: of((r) => r.kind === 'length' && r.target === 'cartA'),
    flagB: of((r) => r.kind === 'length' && r.target === 'cartB'),
    tilt: of((r) => r.kind === 'level'),
  };
  const gates = of((r) => r.kind === 'gates');
  const forces = of((r) => r.kind === 'force');
  const motions = of((r) => r.kind === 'motion');
  const massesA = of((r) => r.kind === 'mass' && r.target === 'cartA');
  const massesB = of((r) => r.kind === 'mass' && r.target === 'cartB');
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
        <button className="btn small ghost" aria-label={t('review.export')} onClick={() => downloadJson(`libreta-f07-${attemptId}.json`, { attemptId, notebook: nb, readings: w.readings })}>⬇</button>
        <button className="btn small ghost" onClick={toggle} aria-label={t('common.close')}>×</button>
      </div>
      <div className="drawer-body">
        <div className="tabs" role="tablist">
          {TABS.map((k) => <button key={k} role="tab" className="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{t(`f07.nb.tab.${k}`)}</button>)}
        </div>
        {savedAt && <span className="hint">{t('nb.saved', { time: new Date(savedAt).toLocaleTimeString() })}</span>}
        {tab === 'setup' && (
          <>
            <h3>{t('f07.nb.hypothesis')}</h3>
            {text('hypothesis.question', nb.hypothesis.question, (n, v) => { n.hypothesis.question = v; })}
            {text('hypothesis.prediction', nb.hypothesis.prediction, (n, v) => { n.hypothesis.prediction = v; })}
            <h3>{t('f07.nb.instruments')}</h3>
            <div className="table-scroll">
              <table className="data">
                <thead><tr><th>{t('f07.nb.instrument')}</th><th>{t('f07.nb.resolution')}</th><th>u<sub>B</sub></th><th>{t('f07.nb.status')}</th></tr></thead>
                <tbody>
                  {INSTRUMENTS_F7.map((k) => {
                    const r = nb.instruments[k];
                    const upd = (f: 'resolution' | 'uncertainty' | 'status', v: string) => setNb((n) => { n.instruments[k][f] = v; }, `instruments.${k}.${f}`, r[f], v);
                    return (
                      <tr key={k}>
                        <td>{t(`f07.nb.inst.${k}`)}</td>
                        <td><input aria-label={`${t(`f07.nb.inst.${k}`)} ${t('f07.nb.resolution')}`} value={r.resolution} onChange={(e) => upd('resolution', e.target.value)} /></td>
                        <td><input aria-label={`${t(`f07.nb.inst.${k}`)} uB`} value={r.uncertainty} onChange={(e) => upd('uncertainty', e.target.value)} /></td>
                        <td>
                          <select aria-label={`${t(`f07.nb.inst.${k}`)} ${t('f07.nb.status')}`} value={r.status} onChange={(e) => upd('status', e.target.value)}>
                            <option value="">—</option>
                            {['verified', 'hypothetical', 'pending'].map((s) => <option key={s} value={s}>{t(`f07.nb.st.${s}`)}</option>)}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <h3>{t('f07.nb.setup')}</h3>
            {SETUP_FIELDS_F7.map((k) => cell(`${t(`f07.nb.setupF.${k}`)} (${SETUP_UNIT_F7[k]})`, nb.setup[k], `setup.${k}`, (n, p) => Object.assign(n.setup[k], p), setupOpts[k], false))}
          </>
        )}
        {tab === 'elastic' && (
          <>
            <p className="hint">{t('f07.nb.elasticLead')}</p>
            {table(['#', t('f07.nb.gates'), 'v₁ᵢ', 'v₁f', 'v₂ᵢ', 'v₂f', 'Δp (kg·m/s)', 'e'], nb.elasticRows.map((row, i) => [
              i + 1,
              pick(`${t('f07.nb.gates')} ${i + 1}`, row.readingId, gates, `elasticRows.${i}.readingId`, (n, id) => { n.elasticRows[i].readingId = id; }),
              ...(['v1i', 'v1f', 'v2i', 'v2f', 'dp', 'e'] as const).map((f) => num(`${f} ${i + 1}`, row[f], `elasticRows.${i}.${f}`, (n, v) => { n.elasticRows[i][f] = v; })),
            ]))}
          </>
        )}
        {tab === 'stick' && (
          <>
            <p className="hint">{t('f07.nb.stickLead')}</p>
            {table([t('f07.nb.gates'), 'v₁ᵢ (m/s)', 'v_f (m/s)', `${t('f07.nb.klost')} (%)`], [[
              pick(`${t('f07.nb.gates')} ${t('f07.nb.tab.stick')}`, nb.stick.readingId, gates, 'stick.readingId', (n, id) => { n.stick.readingId = id; }),
              ...(['v1i', 'vf', 'Klost'] as const).map((f) => num(`${f} ${t('f07.nb.tab.stick')}`, nb.stick[f], `stick.${f}`, (n, v) => { n.stick[f] = v; })),
            ]])}
          </>
        )}
        {tab === 'impulse' && (
          <>
            <p className="hint">{t('f07.nb.impulseLead')}</p>
            {table([t('f07.nb.force'), t('f07.nb.gates'), 'J₁ (N·s)', 'Δp₁ (kg·m/s)', 'F_máx (N)'], [[
              pick(t('f07.nb.force'), nb.impulse.forceId, forces, 'impulse.forceId', (n, id) => { n.impulse.forceId = id; }),
              pick(`${t('f07.nb.gates')} ${t('f07.nb.tab.impulse')}`, nb.impulse.readingId, gates, 'impulse.readingId', (n, id) => { n.impulse.readingId = id; }),
              ...(['J1', 'dp1', 'Fmax'] as const).map((f) => num(`${f} ${t('f07.nb.tab.impulse')}`, nb.impulse[f], `impulse.${f}`, (n, v) => { n.impulse[f] = v; })),
            ]])}
          </>
        )}
        {tab === 'cm' && (
          <>
            <p className="hint">{t('f07.nb.cmLead')}</p>
            {cell(`${t('f07.nb.cmMassA')} (g)`, nb.cm.mA, 'cm.mA', (n, p) => Object.assign(n.cm.mA, p), massesA, false)}
            {cell(`${t('f07.nb.cmMassB')} (g)`, nb.cm.mB, 'cm.mB', (n, p) => Object.assign(n.cm.mB, p), massesB, false)}
            {table([t('f07.nb.camera'), `v_CM ${t('f07.nb.before')} (m/s)`, `v_CM ${t('f07.nb.after')} (m/s)`], [[
              pick(t('f07.nb.camera'), nb.cm.readingId, motions, 'cm.readingId', (n, id) => { n.cm.readingId = id; }),
              num(`vcm ${t('f07.nb.before')}`, nb.cm.vBefore, 'cm.vBefore', (n, v) => { n.cm.vBefore = v; }),
              num(`vcm ${t('f07.nb.after')}`, nb.cm.vAfter, 'cm.vAfter', (n, v) => { n.cm.vAfter = v; }),
            ]])}
          </>
        )}
        {tab === 'calc' && (
          <>
            <p className="hint">{t('f07.nb.calcLead')}</p>
            {CALC_FIELDS_F7.map((k) => cell(`${t(`f07.nb.calc.${k}`)}${CALC_UNIT_F7[k] ? ` (${CALC_UNIT_F7[k]})` : ''}`, nb.calc[k], `calc.${k}`, (n, p) => Object.assign(n.calc[k], p), [], k === 'dp' || k === 'e' || k === 'J'))}
            <h3>{t('f07.nb.contrast')}</h3>
            {text('contrastText', nb.contrastText, (n, v) => { n.contrastText = v; })}
          </>
        )}
        {tab === 'analysis' && (
          <>
            <fieldset className="field">
              <legend>{t('f07.nb.mcq')}</legend>
              {MCQ_OPTIONS_F7.map((m) => (
                <label key={m} style={{ display: 'block' }}>
                  <input type="radio" name="f07-mcq" value={m} checked={nb.mcq === m} onChange={() => setNb((n) => { n.mcq = m; }, 'mcq', nb.mcq, m)} /> {t(`f07.nb.mcqOpt.${m}`)}
                </label>
              ))}
            </fieldset>
            {QUESTIONS_F7.map((q) => text(`analysis.${q}`, nb.analysis[q], (n, v) => { n.analysis[q] = v; }))}
            {text('closure', nb.closure, (n, v) => { n.closure = v; })}
          </>
        )}
        {tab === 'readings' && (
          <div className="table-scroll">
            <table className="data">
              <thead><tr><th>id</th><th>{t('f07.nb.instrument')}</th><th>{t('f07.nb.value')}</th><th>{t('f07.nb.flags')}</th></tr></thead>
              <tbody>
                {all.map((r) => (
                  <tr key={r.id}>
                    <td>{r.id}</td>
                    <td>{t(`f07.obj.${r.instrumentId}`)}</td>
                    <td>{showOf(r)}</td>
                    <td>{r.qualityFlags.map((f) => t(`f07.flag.${f}`)).join(', ')}</td>
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
