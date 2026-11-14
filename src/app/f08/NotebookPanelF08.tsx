import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useF08 } from './store';
import {
  CALC_FIELDS_F8, CALC_UNIT_F8, INSTRUMENTS_F8, MCQ_OPTIONS_F8, QUESTIONS_F8, SETUP_FIELDS_F8, SETUP_UNIT_F8, type Entry, type F08Notebook,
} from '../../practices/practice-f08/notebook';
import type { F08World, ReadingF8 } from '../../simulation/f08-world/types';
import { downloadJson } from '../persistence';

type Tab = 'setup' | 'runs' | 'masses' | 'tension' | 'energy' | 'calc' | 'analysis' | 'readings';
const TABS: Tab[] = ['setup', 'runs', 'masses', 'tension', 'energy', 'calc', 'analysis', 'readings'];

const fmt = (v: number | null | undefined, d = 2) => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(d).replace('.', ',') : '—');
const decOf = (r: ReadingF8) => Math.max(0, Math.round(-Math.log10(r.resolution) + 0.01));
const warnOf = (r: ReadingF8) => (r.qualityFlags.length ? ' ⚠' : '');
const readingsOf = (w: F08World) => w.readingOrder.map((id) => w.readings[id]).filter(Boolean);
/** Lo que muestra una lectura en las listas: el ajuste del encoder con su montaje, la tensión, el tacómetro, la fotopuerta. */
const showOf = (r: ReadingF8) => {
  const su = r.setup ?? {};
  const tag = `${su.solid ? ` · ${su.solid}` : ''}${su.hole ? ` · d ${fmt(su.hole * 100, 0)} cm` : ''}${su.slides && su.solid === 'bar01' ? ` · r ${fmt(su.slides[0] * 100, 0)} cm` : ''}${su.massKg ? ` · ${fmt(su.massKg * 1000, 0)} g` : ''}${su.drumR ? ` · r_t ${fmt(su.drumR * 100, 1)} cm` : ''} · ${r.trialId}`;
  if (r.kind === 'encoder' && r.fit) return `α ${fmt(r.value, 3)} · α_c ${fmt(r.fit.cc !== null ? Math.abs(2 * r.fit.cc) : null, 3)} rad/s²${tag}`;
  if (r.kind === 'mass') return `${fmt(r.value, decOf(r))} g · ${r.target ?? '—'}`;
  if (r.kind === 'tension' || r.kind === 'tach' || r.kind === 'gate') return `${fmt(r.value, decOf(r))} ${r.unit}${tag}`;
  return `${fmt(r.value, decOf(r))} ${r.unit}${r.target ? ` · ${r.target}` : ''}`;
};

/**
 * Libreta digital de F08: cada dato bruto (masas de la balanza, diámetros y anchos del calibre, radios de la regla,
 * ajustes del encoder, tensión, tacómetro y fotopuerta) se importa de una lectura con su id; α, α_c, T, I, la
 * predicción de Steiner, el balance de energía y las incertidumbres los escribe el estudiante. La libreta no calcula.
 */
export function NotebookPanelF08() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('setup');
  const nb = useF08((s) => s.notebook);
  const setNb = useF08((s) => s.setNotebook);
  const toggle = useF08((s) => s.toggleNotebook);
  const savedAt = useF08((s) => s.savedAt);
  useF08((s) => s.version);
  const rt = useF08((s) => s.runtime);
  const attemptId = useF08((s) => s.attemptId);
  const wanted = useF08((s) => s.notebookTab);
  useEffect(() => {
    if (wanted && (TABS as string[]).includes(wanted)) setTab(wanted as Tab);
  }, [wanted]);
  if (!rt) return null;
  const w = rt.world;
  const all = readingsOf(w);
  const of = (pred: (r: ReadingF8) => boolean) => all.filter(pred);
  const label = (r: ReadingF8) => `${r.id} · ${showOf(r)}${warnOf(r)}`;

  const cell = (lab: string, e: Entry, path: string, set: (n: F08Notebook, patch: Partial<Entry>) => void, opts: ReadingF8[] = [], withU = true) => (
    <div className="cell" key={path}>
      <span className="label">{lab}</span>
      <input aria-label={lab} type="text" inputMode="decimal" value={e.value} onChange={(ev) => setNb((n) => set(n, { value: ev.target.value, readingId: null }), path, e.value, ev.target.value)} />
      {withU && <input aria-label={`± ${lab}`} className="u" type="text" inputMode="decimal" value={e.uncertainty} placeholder="±" onChange={(ev) => setNb((n) => set(n, { uncertainty: ev.target.value }), `${path}.u`, e.uncertainty, ev.target.value)} />}
      {opts.length > 0 && (
        <select aria-label={`${t('f08.nb.import')} — ${lab}`} value={e.readingId ?? ''} onChange={(ev) => {
          const r = opts.find((x) => x.id === ev.target.value);
          if (r) setNb((n) => set(n, { value: fmt(r.value, decOf(r)), readingId: r.id }), path, e.value, fmt(r.value, decOf(r)));
        }}>
          <option value="">📥</option>
          {opts.map((r) => <option key={r.id} value={r.id}>{label(r)}</option>)}
        </select>
      )}
      {e.readingId && <span className="hint" title={t('f08.nb.imported')}>🔗 {e.readingId}</span>}
    </div>
  );
  const text = (path: string, value: string, set: (n: F08Notebook, v: string) => void, area = true) => {
    const idf = `f08-${path}`;
    const on = (v: string) => setNb((n) => set(n, v), path, value, v);
    return (
      <div className="field" key={path}>
        <label htmlFor={idf}>{t(`f08.nb.f.${path}`)}</label>
        {area ? <textarea id={idf} value={value} onChange={(e) => on(e.target.value)} /> : <input id={idf} type="text" value={value} onChange={(e) => on(e.target.value)} />}
      </div>
    );
  };
  const pick = (aria: string, value: string | null, opts: ReadingF8[], path: string, set: (n: F08Notebook, id: string | null) => void, show: (r: ReadingF8) => string = label) => (
    <select aria-label={aria} value={value ?? ''} onChange={(e) => setNb((n) => set(n, e.target.value || null), path, value ?? '', e.target.value)}>
      <option value="">{t('nb.choose')}</option>
      {opts.map((r) => <option key={r.id} value={r.id}>{show(r)}</option>)}
    </select>
  );
  const num = (aria: string, value: string, path: string, set: (n: F08Notebook, v: string) => void) => (
    <input aria-label={aria} inputMode="decimal" value={value} onChange={(e) => setNb((n) => set(n, e.target.value), path, value, e.target.value)} />
  );

  const mass = (pred: (t: string) => boolean) => of((r) => r.kind === 'mass' && !!r.target && pred(r.target));
  const len = (target: string) => of((r) => r.kind === 'length' && r.target === target);
  const setupOpts: Record<(typeof SETUP_FIELDS_F8)[number], ReadingF8[]> = {
    mDisc: mass((x) => x === 'disc01'),
    dDisc: len('disc01'),
    mRing: mass((x) => x === 'ring01'),
    dRing: len('ring01'),
    mDrop: mass((x) => x.startsWith('drop')),
    dDrum: len('drum'),
    wFlag: len('flag'),
    dHole: len('hole'),
    mSlide: mass((x) => x.startsWith('slide')),
  };
  const encs = of((r) => r.kind === 'encoder' && !!r.fit);
  const radii = of((r) => r.kind === 'radius');
  const tensions = of((r) => r.kind === 'tension');
  const tachs = of((r) => r.kind === 'tach');
  const gatesR = of((r) => r.kind === 'gate');
  const RUN_F = ['alpha', 'alphaC', 'T', 'I'] as const;
  const RUN_H = ['α (rad/s²)', 'α_c (rad/s²)', 'T (N)', 'I (kg·m²)'];
  type RowRef = { label: string; path: string; get: (n: F08Notebook) => F08Notebook['axle'] };
  const runRows = (rows: RowRef[]) => table(['', t('f08.nb.encoder'), ...RUN_H], rows.map((rr) => {
    const row = rr.get(nb);
    return [
      rr.label,
      pick(`${t('f08.nb.encoder')} ${rr.label}`, row.readingId, encs, `${rr.path}.readingId`, (n, id) => { rr.get(n).readingId = id; }),
      ...RUN_F.map((f) => num(`${f} ${rr.label}`, row[f], `${rr.path}.${f}`, (n, v) => { rr.get(n)[f] = v; })),
    ];
  }));
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
        <button className="btn small ghost" aria-label={t('review.export')} onClick={() => downloadJson(`libreta-f08-${attemptId}.json`, { attemptId, notebook: nb, readings: w.readings })}>⬇</button>
        <button className="btn small ghost" onClick={toggle} aria-label={t('common.close')}>×</button>
      </div>
      <div className="drawer-body">
        <div className="tabs" role="tablist">
          {TABS.map((k) => <button key={k} role="tab" className="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{t(`f08.nb.tab.${k}`)}</button>)}
        </div>
        {savedAt && <span className="hint">{t('nb.saved', { time: new Date(savedAt).toLocaleTimeString() })}</span>}
        {tab === 'setup' && (
          <>
            <h3>{t('f08.nb.hypothesis')}</h3>
            {text('hypothesis.question', nb.hypothesis.question, (n, v) => { n.hypothesis.question = v; })}
            {text('hypothesis.prediction', nb.hypothesis.prediction, (n, v) => { n.hypothesis.prediction = v; })}
            <h3>{t('f08.nb.instruments')}</h3>
            <div className="table-scroll">
              <table className="data">
                <thead><tr><th>{t('f08.nb.instrument')}</th><th>{t('f08.nb.resolution')}</th><th>u<sub>B</sub></th><th>{t('f08.nb.status')}</th></tr></thead>
                <tbody>
                  {INSTRUMENTS_F8.map((k) => {
                    const r = nb.instruments[k];
                    const upd = (f: 'resolution' | 'uncertainty' | 'status', v: string) => setNb((n) => { n.instruments[k][f] = v; }, `instruments.${k}.${f}`, r[f], v);
                    return (
                      <tr key={k}>
                        <td>{t(`f08.nb.inst.${k}`)}</td>
                        <td><input aria-label={`${t(`f08.nb.inst.${k}`)} ${t('f08.nb.resolution')}`} value={r.resolution} onChange={(e) => upd('resolution', e.target.value)} /></td>
                        <td><input aria-label={`${t(`f08.nb.inst.${k}`)} uB`} value={r.uncertainty} onChange={(e) => upd('uncertainty', e.target.value)} /></td>
                        <td>
                          <select aria-label={`${t(`f08.nb.inst.${k}`)} ${t('f08.nb.status')}`} value={r.status} onChange={(e) => upd('status', e.target.value)}>
                            <option value="">—</option>
                            {['verified', 'hypothetical', 'pending'].map((s) => <option key={s} value={s}>{t(`f08.nb.st.${s}`)}</option>)}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <h3>{t('f08.nb.setup')}</h3>
            {SETUP_FIELDS_F8.map((k) => cell(`${t(`f08.nb.setupF.${k}`)} (${SETUP_UNIT_F8[k]})`, nb.setup[k], `setup.${k}`, (n, p) => Object.assign(n.setup[k], p), setupOpts[k], false))}
          </>
        )}
        {tab === 'runs' && (
          <>
            <p className="hint">{t('f08.nb.runsLead')}</p>
            {runRows([
              { label: t('f08.nb.axle'), path: 'axle', get: (n) => n.axle },
              ...nb.diskRows.map((_, i) => ({ label: `${t('f08.nb.disk')} ${i + 1}`, path: `diskRows.${i}`, get: (n: F08Notebook) => n.diskRows[i] })),
              { label: t('f08.nb.ring'), path: 'ring', get: (n) => n.ring },
            ])}
          </>
        )}
        {tab === 'masses' && (
          <>
            <p className="hint">{t('f08.nb.massesLead')}</p>
            {table(['#', t('f08.nb.radius'), t('f08.nb.encoder'), ...RUN_H], nb.massRows.map((row, i) => [
              i + 1,
              pick(`${t('f08.nb.radius')} ${i + 1}`, row.rId, radii, `massRows.${i}.rId`, (n, id) => { n.massRows[i].rId = id; }),
              pick(`${t('f08.nb.encoder')} ${t('f08.nb.mass')} ${i + 1}`, row.readingId, encs, `massRows.${i}.readingId`, (n, id) => { n.massRows[i].readingId = id; }),
              ...RUN_F.map((f) => num(`${f} ${t('f08.nb.mass')} ${i + 1}`, row[f], `massRows.${i}.${f}`, (n, v) => { n.massRows[i][f] = v; })),
            ]))}
            <h3>{t('f08.nb.parallel')}</h3>
            <p className="hint">{t('f08.nb.parallelLead')}</p>
            {table([t('f08.nb.encoder'), ...RUN_H, 'I_d (kg·m²)', 'I_Steiner (kg·m²)'], [[
              pick(`${t('f08.nb.encoder')} ${t('f08.nb.parallel')}`, nb.parallel.readingId, encs, 'parallel.readingId', (n, id) => { n.parallel.readingId = id; }),
              ...([...RUN_F, 'Ipar', 'Ipred'] as const).map((f) => num(`${f} ${t('f08.nb.parallel')}`, nb.parallel[f], `parallel.${f}`, (n, v) => { n.parallel[f] = v; })),
            ]])}
          </>
        )}
        {tab === 'tension' && (
          <>
            <p className="hint">{t('f08.nb.tensionLead')}</p>
            {table([t('f08.nb.tensionR'), t('f08.nb.encoder'), 'T (N)', 'm(g − αr) (N)', `${t('f08.nb.diff')} (%)`], [[
              pick(t('f08.nb.tensionR'), nb.tension.readingId, tensions, 'tension.readingId', (n, id) => { n.tension.readingId = id; }),
              pick(`${t('f08.nb.encoder')} ${t('f08.nb.tab.tension')}`, nb.tension.encId, encs, 'tension.encId', (n, id) => { n.tension.encId = id; }),
              ...(['T', 'Tmodel', 'diff'] as const).map((f) => num(`${f} ${t('f08.nb.tab.tension')}`, nb.tension[f], `tension.${f}`, (n, v) => { n.tension[f] = v; })),
            ]])}
          </>
        )}
        {tab === 'energy' && (
          <>
            <p className="hint">{t('f08.nb.energyLead')}</p>
            {table([t('f08.nb.gate'), t('f08.nb.tach'), 'h (cm)', 'v (m/s)', 'ω (rad/s)', 'K (J)', 'U (J)', `${t('f08.nb.bal')} (%)`], [[
              pick(t('f08.nb.gate'), nb.energy.readingId, gatesR, 'energy.readingId', (n, id) => { n.energy.readingId = id; }),
              pick(t('f08.nb.tach'), nb.energy.tachId, tachs, 'energy.tachId', (n, id) => { n.energy.tachId = id; }),
              ...(['h', 'v', 'omega', 'K', 'U', 'bal'] as const).map((f) => num(`${f} ${t('f08.nb.tab.energy')}`, nb.energy[f], `energy.${f}`, (n, v) => { n.energy[f] = v; })),
            ]])}
          </>
        )}
        {tab === 'calc' && (
          <>
            <p className="hint">{t('f08.nb.calcLead')}</p>
            {CALC_FIELDS_F8.map((k) => cell(`${t(`f08.nb.calc.${k}`)}${CALC_UNIT_F8[k] ? ` (${CALC_UNIT_F8[k]})` : ''}`, nb.calc[k], `calc.${k}`, (n, p) => Object.assign(n.calc[k], p), [], k === 'Idisk' || k === 'Iring' || k === 'Ipred'))}
            <h3>{t('f08.nb.contrast')}</h3>
            {text('contrastText', nb.contrastText, (n, v) => { n.contrastText = v; })}
          </>
        )}
        {tab === 'analysis' && (
          <>
            <fieldset className="field">
              <legend>{t('f08.nb.mcq')}</legend>
              {MCQ_OPTIONS_F8.map((m) => (
                <label key={m} style={{ display: 'block' }}>
                  <input type="radio" name="f08-mcq" value={m} checked={nb.mcq === m} onChange={() => setNb((n) => { n.mcq = m; }, 'mcq', nb.mcq, m)} /> {t(`f08.nb.mcqOpt.${m}`)}
                </label>
              ))}
            </fieldset>
            {QUESTIONS_F8.map((q) => text(`analysis.${q}`, nb.analysis[q], (n, v) => { n.analysis[q] = v; }))}
            {text('closure', nb.closure, (n, v) => { n.closure = v; })}
          </>
        )}
        {tab === 'readings' && (
          <div className="table-scroll">
            <table className="data">
              <thead><tr><th>id</th><th>{t('f08.nb.instrument')}</th><th>{t('f08.nb.value')}</th><th>{t('f08.nb.flags')}</th></tr></thead>
              <tbody>
                {all.map((r) => (
                  <tr key={r.id}>
                    <td>{r.id}</td>
                    <td>{t(`f08.obj.${r.instrumentId}`)}</td>
                    <td>{showOf(r)}</td>
                    <td>{r.qualityFlags.map((f) => t(`f08.flag.${f}`)).join(', ')}</td>
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
