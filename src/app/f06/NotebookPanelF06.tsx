import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useF06 } from './store';
import {
  CALC_FIELDS_F6, CALC_UNIT_F6, INSTRUMENTS_F6, MCQ_OPTIONS_F6, QUESTIONS_F6, SETUP_FIELDS_F6, SETUP_UNIT_F6, type Entry, type F06Notebook,
} from '../../practices/practice-f06/notebook';
import type { F06World, ReadingF6 } from '../../simulation/f06-world/types';
import { downloadJson } from '../persistence';

type Tab = 'setup' | 'spring' | 'launch' | 'reps' | 'heights' | 'loss' | 'pendulum' | 'calc' | 'analysis' | 'readings';
const TABS: Tab[] = ['setup', 'spring', 'launch', 'reps', 'heights', 'loss', 'pendulum', 'calc', 'analysis', 'readings'];

const fmt = (v: number | null | undefined, d = 2) => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(d).replace('.', ',') : '—');
const decOf = (r: ReadingF6) => Math.max(0, Math.round(-Math.log10(r.resolution) + 0.01));
const warnOf = (r: ReadingF6) => (r.qualityFlags.length ? ' ⚠' : '');
const readingsOf = (w: F06World) => w.readingOrder.map((id) => w.readings[id]).filter(Boolean);
/** Lo que muestra una lectura en las listas: el disparo con su trabajo; las fotopuertas con sus Δt; el péndulo con θ₀ y Δt. */
const showOf = (r: ReadingF6) => {
  const su = r.setup ?? {};
  if (r.kind === 'launch' && r.launch) {
    const x = r.launch;
    return `W ${fmt(x.W, 3)} J · F_máx ${fmt(x.Fmax, 2)} N · x_máx ${fmt((x.xmax ?? NaN) * 100, 1)} cm · P_máx ${fmt(x.Pmax, 1)} W · ${r.trialId}`;
  }
  if (r.kind === 'gates' && r.gates) {
    const x = r.gates;
    const extra = `${su.losses ? ' · ⚙' : ''}${su.compression !== undefined ? ` · x ${fmt(su.compression * 100, 0)} cm` : ''}`;
    return `Δt₁ ${fmt(x.dt1, 5)} s · Δt₂ ${fmt(x.dt2, 5)} s${extra} · ${r.trialId}`;
  }
  if (r.kind === 'pendulum' && r.pend) return `θ₀ ${fmt(r.pend.theta0, 1)}° · Δt ${fmt(r.pend.dt, 5)} s · ${r.trialId}`;
  if (r.kind === 'length' && r.target === 'ruler01') return `${fmt(r.value, decOf(r))} cm · ${su.hanger ? `${su.slots ?? 0} × 100 g` : '—'}`;
  return `${fmt(r.value, decOf(r))} ${r.unit}${r.target ? ` · ${r.target}` : ''}`;
};

/**
 * Libreta digital de F06: cada dato bruto (masas de la balanza, alargamientos de la regla, disparos del registrador,
 * tiempos de las fotopuertas, alturas del medidor, el péndulo) se importa de una lectura con su id; las fuerzas, la
 * rigidez, los trabajos, las energías, las velocidades, la eficiencia, la potencia y las incertidumbres los escribe el
 * estudiante. La libreta no calcula nada.
 */
export function NotebookPanelF06() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('setup');
  const nb = useF06((s) => s.notebook);
  const setNb = useF06((s) => s.setNotebook);
  const toggle = useF06((s) => s.toggleNotebook);
  const savedAt = useF06((s) => s.savedAt);
  useF06((s) => s.version);
  const rt = useF06((s) => s.runtime);
  const attemptId = useF06((s) => s.attemptId);
  const wanted = useF06((s) => s.notebookTab);
  useEffect(() => {
    if (wanted && (TABS as string[]).includes(wanted)) setTab(wanted as Tab);
  }, [wanted]);
  if (!rt) return null;
  const w = rt.world;
  const all = readingsOf(w);
  const of = (pred: (r: ReadingF6) => boolean) => all.filter(pred);
  const label = (r: ReadingF6) => `${r.id} · ${showOf(r)}${warnOf(r)}`;

  const cell = (lab: string, e: Entry, path: string, set: (n: F06Notebook, patch: Partial<Entry>) => void, opts: ReadingF6[] = [], withU = true) => (
    <div className="cell" key={path}>
      <span className="label">{lab}</span>
      <input aria-label={lab} type="text" inputMode="decimal" value={e.value} onChange={(ev) => setNb((n) => set(n, { value: ev.target.value, readingId: null }), path, e.value, ev.target.value)} />
      {withU && <input aria-label={`± ${lab}`} className="u" type="text" inputMode="decimal" value={e.uncertainty} placeholder="±" onChange={(ev) => setNb((n) => set(n, { uncertainty: ev.target.value }), `${path}.u`, e.uncertainty, ev.target.value)} />}
      {opts.length > 0 && (
        <select aria-label={`${t('f06.nb.import')} — ${lab}`} value={e.readingId ?? ''} onChange={(ev) => {
          const r = opts.find((x) => x.id === ev.target.value);
          if (r) setNb((n) => set(n, { value: fmt(r.value, decOf(r)), readingId: r.id }), path, e.value, fmt(r.value, decOf(r)));
        }}>
          <option value="">📥</option>
          {opts.map((r) => <option key={r.id} value={r.id}>{label(r)}</option>)}
        </select>
      )}
      {e.readingId && <span className="hint" title={t('f06.nb.imported')}>🔗 {e.readingId}</span>}
    </div>
  );
  const text = (path: string, value: string, set: (n: F06Notebook, v: string) => void, area = true) => {
    const idf = `f06-${path}`;
    const on = (v: string) => setNb((n) => set(n, v), path, value, v);
    return (
      <div className="field" key={path}>
        <label htmlFor={idf}>{t(`f06.nb.f.${path}`)}</label>
        {area ? <textarea id={idf} value={value} onChange={(e) => on(e.target.value)} /> : <input id={idf} type="text" value={value} onChange={(e) => on(e.target.value)} />}
      </div>
    );
  };
  const pick = (aria: string, value: string | null, opts: ReadingF6[], path: string, set: (n: F06Notebook, id: string | null) => void, show: (r: ReadingF6) => string = label) => (
    <select aria-label={aria} value={value ?? ''} onChange={(e) => setNb((n) => set(n, e.target.value || null), path, value ?? '', e.target.value)}>
      <option value="">{t('nb.choose')}</option>
      {opts.map((r) => <option key={r.id} value={r.id}>{show(r)}</option>)}
    </select>
  );
  const num = (aria: string, value: string, path: string, set: (n: F06Notebook, v: string) => void) => (
    <input aria-label={aria} inputMode="decimal" value={value} onChange={(e) => setNb((n) => set(n, e.target.value), path, value, e.target.value)} />
  );

  const setupOpts: Record<(typeof SETUP_FIELDS_F6)[number], ReadingF6[]> = {
    cartM: of((r) => r.kind === 'mass' && r.target === 'cart01'),
    hangerM: of((r) => r.kind === 'mass' && r.target === 'hanger01'),
    slotM: of((r) => r.kind === 'mass' && /^m100/.test(r.target ?? '')),
    pendL: of((r) => r.kind === 'length' && r.target === 'pendulum'),
  };
  const rulers = of((r) => r.kind === 'length' && r.target === 'ruler01');
  const launches = of((r) => r.kind === 'launch');
  const gates = of((r) => r.kind === 'gates');
  const heights = of((r) => r.kind === 'height');
  const pends = of((r) => r.kind === 'pendulum');
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
        <button className="btn small ghost" aria-label={t('review.export')} onClick={() => downloadJson(`libreta-f06-${attemptId}.json`, { attemptId, notebook: nb, readings: w.readings })}>⬇</button>
        <button className="btn small ghost" onClick={toggle} aria-label={t('common.close')}>×</button>
      </div>
      <div className="drawer-body">
        <div className="tabs" role="tablist">
          {TABS.map((k) => <button key={k} role="tab" className="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{t(`f06.nb.tab.${k}`)}</button>)}
        </div>
        {savedAt && <span className="hint">{t('nb.saved', { time: new Date(savedAt).toLocaleTimeString() })}</span>}
        {tab === 'setup' && (
          <>
            <h3>{t('f06.nb.hypothesis')}</h3>
            {text('hypothesis.question', nb.hypothesis.question, (n, v) => { n.hypothesis.question = v; })}
            {text('hypothesis.prediction', nb.hypothesis.prediction, (n, v) => { n.hypothesis.prediction = v; })}
            <h3>{t('f06.nb.instruments')}</h3>
            <div className="table-scroll">
              <table className="data">
                <thead><tr><th>{t('f06.nb.instrument')}</th><th>{t('f06.nb.resolution')}</th><th>u<sub>B</sub></th><th>{t('f06.nb.status')}</th></tr></thead>
                <tbody>
                  {INSTRUMENTS_F6.map((k) => {
                    const r = nb.instruments[k];
                    const upd = (f: 'resolution' | 'uncertainty' | 'status', v: string) => setNb((n) => { n.instruments[k][f] = v; }, `instruments.${k}.${f}`, r[f], v);
                    return (
                      <tr key={k}>
                        <td>{t(`f06.nb.inst.${k}`)}</td>
                        <td><input aria-label={`${t(`f06.nb.inst.${k}`)} ${t('f06.nb.resolution')}`} value={r.resolution} onChange={(e) => upd('resolution', e.target.value)} /></td>
                        <td><input aria-label={`${t(`f06.nb.inst.${k}`)} uB`} value={r.uncertainty} onChange={(e) => upd('uncertainty', e.target.value)} /></td>
                        <td>
                          <select aria-label={`${t(`f06.nb.inst.${k}`)} ${t('f06.nb.status')}`} value={r.status} onChange={(e) => upd('status', e.target.value)}>
                            <option value="">—</option>
                            {['verified', 'hypothetical', 'pending'].map((s) => <option key={s} value={s}>{t(`f06.nb.st.${s}`)}</option>)}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <h3>{t('f06.nb.setup')}</h3>
            {SETUP_FIELDS_F6.map((k) => cell(`${t(`f06.nb.setupF.${k}`)} (${SETUP_UNIT_F6[k]})`, nb.setup[k], `setup.${k}`, (n, p) => Object.assign(n.setup[k], p), setupOpts[k], false))}
            {text('flagW', nb.flagW, (n, v) => { n.flagW = v; }, false)}
          </>
        )}
        {tab === 'spring' && (
          <>
            <p className="hint">{t('f06.nb.springLead')}</p>
            {table(['#', t('f06.nb.rulerReading'), 'F (N)'], nb.springRows.map((row, i) => [
              i + 1,
              pick(`${t('f06.nb.rulerReading')} ${i + 1}`, row.readingId, rulers, `springRows.${i}.readingId`, (n, id) => { n.springRows[i].readingId = id; }),
              num(`F ${i + 1}`, row.F, `springRows.${i}.F`, (n, v) => { n.springRows[i].F = v; }),
            ]))}
          </>
        )}
        {tab === 'launch' && (
          <>
            <p className="hint">{t('f06.nb.launchLead')}</p>
            {table(['#', t('f06.nb.launch'), 'W (J)', 'U_el (J)'], nb.launchRows.map((row, i) => [
              i + 1,
              pick(`${t('f06.nb.launch')} ${i + 1}`, row.readingId, launches, `launchRows.${i}.readingId`, (n, id) => { n.launchRows[i].readingId = id; }),
              num(`W ${i + 1}`, row.W, `launchRows.${i}.W`, (n, v) => { n.launchRows[i].W = v; }),
              num(`Uel ${i + 1}`, row.Uel, `launchRows.${i}.Uel`, (n, v) => { n.launchRows[i].Uel = v; }),
            ]))}
          </>
        )}
        {tab === 'reps' && (
          <>
            <p className="hint">{t('f06.nb.repsLead')}</p>
            {table(['#', t('f06.nb.gates'), 'v₁ (m/s)', 'K₁ (J)'], nb.repRows.map((row, i) => [
              i + 1,
              pick(`${t('f06.nb.gates')} ${i + 1}`, row.readingId, gates, `repRows.${i}.readingId`, (n, id) => { n.repRows[i].readingId = id; }),
              num(`v1 ${i + 1}`, row.v1, `repRows.${i}.v1`, (n, v) => { n.repRows[i].v1 = v; }),
              num(`K1 ${i + 1}`, row.K1, `repRows.${i}.K1`, (n, v) => { n.repRows[i].K1 = v; }),
            ]))}
          </>
        )}
        {tab === 'heights' && (
          <>
            <p className="hint">{t('f06.nb.heightsLead')}</p>
            {table(['#', t('f06.nb.height'), t('f06.nb.gates'), 'v₂ (m/s)', 'U_g (J)', 'K₂ (J)'], nb.heightRows.map((row, i) => [
              i + 1,
              pick(`${t('f06.nb.height')} ${i + 1}`, row.heightId, heights, `heightRows.${i}.heightId`, (n, id) => { n.heightRows[i].heightId = id; }),
              pick(`${t('f06.nb.gates')} ${t('f06.nb.height')} ${i + 1}`, row.readingId, gates, `heightRows.${i}.readingId`, (n, id) => { n.heightRows[i].readingId = id; }),
              num(`v2 ${i + 1}`, row.v2, `heightRows.${i}.v2`, (n, v) => { n.heightRows[i].v2 = v; }),
              num(`Ug ${i + 1}`, row.Ug, `heightRows.${i}.Ug`, (n, v) => { n.heightRows[i].Ug = v; }),
              num(`K2 ${i + 1}`, row.K2, `heightRows.${i}.K2`, (n, v) => { n.heightRows[i].K2 = v; }),
            ]))}
          </>
        )}
        {tab === 'loss' && (
          <>
            <p className="hint">{t('f06.nb.lossLead')}</p>
            {table([t('f06.nb.height'), t('f06.nb.gates'), 'v₁ (m/s)', 'v₂ (m/s)', 'W_nc (J)'], [[
              pick(`${t('f06.nb.height')} ${t('f06.nb.tab.loss')}`, nb.loss.heightId, heights, 'loss.heightId', (n, id) => { n.loss.heightId = id; }),
              pick(`${t('f06.nb.gates')} ${t('f06.nb.tab.loss')}`, nb.loss.readingId, gates, 'loss.readingId', (n, id) => { n.loss.readingId = id; }),
              ...(['v1', 'v2', 'Wnc'] as const).map((f) => num(`${f} ${t('f06.nb.tab.loss')}`, nb.loss[f], `loss.${f}`, (n, v) => { n.loss[f] = v; })),
            ]])}
          </>
        )}
        {tab === 'pendulum' && (
          <>
            <p className="hint">{t('f06.nb.pendLead')}</p>
            {text('bobD', nb.bobD, (n, v) => { n.bobD = v; }, false)}
            {table(['#', t('f06.nb.pendulum'), 'v (m/s)', 'h (m)'], nb.pendRows.map((row, i) => [
              i + 1,
              pick(`${t('f06.nb.pendulum')} ${i + 1}`, row.readingId, pends, `pendRows.${i}.readingId`, (n, id) => { n.pendRows[i].readingId = id; }),
              num(`v ${t('f06.nb.pendulum')} ${i + 1}`, row.v, `pendRows.${i}.v`, (n, v) => { n.pendRows[i].v = v; }),
              num(`h ${t('f06.nb.pendulum')} ${i + 1}`, row.h, `pendRows.${i}.h`, (n, v) => { n.pendRows[i].h = v; }),
            ]))}
          </>
        )}
        {tab === 'calc' && (
          <>
            <p className="hint">{t('f06.nb.calcLead')}</p>
            {CALC_FIELDS_F6.map((k) => cell(`${t(`f06.nb.calc.${k}`)}${CALC_UNIT_F6[k] ? ` (${CALC_UNIT_F6[k]})` : ''}`, nb.calc[k], `calc.${k}`, (n, p) => Object.assign(n.calc[k], p), [], k === 'k' || k === 'W' || k === 'K1'))}
            <h3>{t('f06.nb.contrast')}</h3>
            {text('contrastText', nb.contrastText, (n, v) => { n.contrastText = v; })}
          </>
        )}
        {tab === 'analysis' && (
          <>
            <fieldset className="field">
              <legend>{t('f06.nb.mcq')}</legend>
              {MCQ_OPTIONS_F6.map((m) => (
                <label key={m} style={{ display: 'block' }}>
                  <input type="radio" name="f06-mcq" value={m} checked={nb.mcq === m} onChange={() => setNb((n) => { n.mcq = m; }, 'mcq', nb.mcq, m)} /> {t(`f06.nb.mcqOpt.${m}`)}
                </label>
              ))}
            </fieldset>
            {QUESTIONS_F6.map((q) => text(`analysis.${q}`, nb.analysis[q], (n, v) => { n.analysis[q] = v; }))}
            {text('closure', nb.closure, (n, v) => { n.closure = v; })}
          </>
        )}
        {tab === 'readings' && (
          <div className="table-scroll">
            <table className="data">
              <thead><tr><th>id</th><th>{t('f06.nb.instrument')}</th><th>{t('f06.nb.value')}</th><th>{t('f06.nb.flags')}</th></tr></thead>
              <tbody>
                {all.map((r) => (
                  <tr key={r.id}>
                    <td>{r.id}</td>
                    <td>{t(`f06.obj.${r.instrumentId}`)}</td>
                    <td>{showOf(r)}</td>
                    <td>{r.qualityFlags.map((f) => t(`f06.flag.${f}`)).join(', ')}</td>
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
