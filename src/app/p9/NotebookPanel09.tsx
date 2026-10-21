import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useP09 } from './store';
import { ATLAS_KEYS, CATIONS, QUESTIONS, type Cation, type EdgeG, type Entry, type P09Notebook, type RowD, type RowE } from '../../practices/practice-09/notebook';
import type { Reading09 } from '../../simulation/cation-analysis-world/types';
import { downloadJson } from '../persistence';
import { colorWords, p09NameOf } from './describe';

type Tab = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'log';
const TABS: Tab[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'log'];

const COLORS = ['none', 'blue', 'violet', 'lilac', 'red', 'crimson', 'orange', 'yellow', 'green', 'white'] as const;
const ACTIONS: EdgeG['action'][] = ['aliquot', 'sulfate', 'hydroxide', 'centrifuge', 'decant', 'flame'];

const fmt = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d).replace('.', ',') : '—');
const decOf = (r: Reading09) => (r.resolution > 0 ? Math.max(0, Math.round(-Math.log10(r.resolution) + 0.01)) : 2);
const warnOf = (r: Reading09) => (!r.valid ? ' ✗' : r.qualityFlags.length ? ' ⚠' : '');

/**
 * Libreta digital de la Práctica 9: Cuadros A (predicción, antes de medir), B (atlas de emisión), C (soportes),
 * D (precipitación), E (separación), F (identificación), G (diagrama de separación propio) y H (ocho preguntas).
 * Cada dato instrumental se IMPORTA de una lectura propia de este intento (id, unidad, incertidumbre y banderas) y no
 * se edita a mano; las predicciones, coeficientes, estados y explicaciones son del estudiante.
 */
export function NotebookPanel09() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('A');
  const nb = useP09((s) => s.notebook);
  const setNb = useP09((s) => s.setNotebook);
  const toggle = useP09((s) => s.toggleNotebook);
  const savedAt = useP09((s) => s.savedAt);
  useP09((s) => s.version);
  const rt = useP09((s) => s.runtime);
  const attemptId = useP09((s) => s.attemptId);
  const wanted = useP09((s) => s.notebookTab);
  useEffect(() => {
    if (wanted) setTab(wanted as Tab);
  }, [wanted]);
  if (!rt) return null;
  const w = rt.world;
  const all = w.readingOrder.map((rid) => w.readings[rid]);
  const of = (...k: Reading09['kind'][]) => all.filter((r) => k.includes(r.kind));
  const name = (id: string) => p09NameOf(w, id);
  const rlabel = (r: Reading09) => {
    const head = `${r.id} · ${name(r.targetId)}`;
    if (r.kind === 'emission') return `${head} · ${colorWords(r.category)} · ${r.snapshot.lightPct ?? '—'} %${r.snapshot.support ? ` · ${t(`p9.support.${r.snapshot.support}`)}` : ''}${warnOf(r)}`;
    if (r.kind === 'observation') return `${head} · ${colorWords(r.category)}${warnOf(r)}`;
    if (r.kind === 'spectrum') return `${head} · ${t('p9.nb.lines', { n: r.lines?.length ?? 0 })} · ×${r.snapshot.gain ?? 1}${warnOf(r)}`;
    return `${head} · ${Number.isFinite(r.value) ? fmt(r.value, decOf(r)) : t('p9.instr.overRange')} ${r.unit}${warnOf(r)}`;
  };
  const tubes = Object.keys(w.vessels).filter((id) => w.vessels[id].shape === 'tube');
  const graphNodes = ['smp1', ...tubes];

  /** Celda importable: valor + incertidumbre + selector de lectura. */
  const cell = (label: string, e: Entry, path: string, set: (n: P09Notebook, patch: Partial<Entry>) => void, opts: Reading09[] = [], withU = true) => (
    <div className="cell">
      <input aria-label={label} type="text" inputMode="decimal" value={e.value} readOnly={!!e.readingId} onChange={(ev) => setNb((n) => set(n, { value: ev.target.value, readingId: null }), path, e.value, ev.target.value)} />
      {withU && <input aria-label={`± ${label}`} className="u" type="text" inputMode="decimal" value={e.uncertainty} placeholder="±" onChange={(ev) => setNb((n) => set(n, { uncertainty: ev.target.value }), `${path}.u`, e.uncertainty, ev.target.value)} />}
      {opts.length > 0 && (
        <select aria-label={`${t('p9.nb.import')} — ${label}`} value={e.readingId ?? ''} onChange={(ev) => {
          const r = opts.find((x) => x.id === ev.target.value);
          if (!r) return setNb((n) => set(n, { readingId: null }), path, e.value, e.value);
          setNb((n) => set(n, { value: fmt(r.value, decOf(r)), uncertainty: fmt(r.standardUncertainty, decOf(r) + 1), readingId: r.id, attemptId }), path, e.value, fmt(r.value, decOf(r)));
        }}>
          <option value="">📥</option>
          {opts.map((r) => <option key={r.id} value={r.id}>{rlabel(r)}</option>)}
        </select>
      )}
    </div>
  );
  const pickReading = (label: string, value: string | null, opts: Reading09[], path: string, set: (n: P09Notebook, id: string | null) => void) => (
    <select aria-label={label} value={value ?? ''} onChange={(ev) => setNb((n) => set(n, ev.target.value || null), path, value ?? '', ev.target.value)}>
      <option value="">📥</option>
      {opts.map((r) => <option key={r.id} value={r.id}>{rlabel(r)}</option>)}
    </select>
  );
  const text = (path: string, value: string, set: (n: P09Notebook, v: string) => void, area = true, labelKey?: string) => {
    const idf = `p9-${path.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const on = (v: string) => setNb((n) => set(n, v), path, value, v);
    return (
      <div className="field" key={path}>
        <label htmlFor={idf}>{t(labelKey ?? `p9.nb.f.${path}`)}</label>
        {area ? <textarea id={idf} value={value} onChange={(e) => on(e.target.value)} /> : <input id={idf} type="text" value={value} onChange={(e) => on(e.target.value)} />}
      </div>
    );
  };
  const small = (label: string, value: string, path: string, set: (n: P09Notebook, v: string) => void) => (
    <input aria-label={label} type="text" value={value} onChange={(e) => setNb((n) => set(n, e.target.value), path, value, e.target.value)} />
  );
  const choose = <T extends string>(label: string, value: T, options: readonly T[], path: string, set: (n: P09Notebook, v: T) => void, keyPrefix: string | null) => (
    <select aria-label={label} value={value} onChange={(e) => setNb((n) => set(n, e.target.value as T), path, value, e.target.value)}>
      <option value="">{t('nb.choose')}</option>
      {options.filter(Boolean).map((o) => <option key={o} value={o}>{keyPrefix ? t(`${keyPrefix}.${o}`) : name(o)}</option>)}
    </select>
  );

  const A = nb.tableA;
  const C = nb.tableC;
  const locked = A.savedAtS !== null;
  const rowD = (k: 'sr' | 'fe') => {
    const r = nb.tableD[k];
    const up = (fn: (x: RowD) => void) => (n: P09Notebook) => fn(n.tableD[k]);
    return (
      <tr key={k}>
        <th scope="row">{t(`p9.nb.rowD.${k}`)}</th>
        <td>{choose(`${t('p9.nb.col.tube')} ${k}`, r.tube, tubes, `D.${k}.tube`, (n, v) => up((x) => { x.tube = v; })(n), null)}</td>
        <td>{choose(`${t('p9.nb.col.reagent')} ${k}`, r.reagent, ['sulfate', 'hydroxide', 'water'] as const, `D.${k}.reagent`, (n, v) => up((x) => { x.reagent = v; })(n), 'p9.reagent')}</td>
        <td>{small(`${t('p9.nb.col.drops')} ${k}`, r.drops, `D.${k}.drops`, (n, v) => up((x) => { x.drops = v; })(n))}</td>
        <td>{cell(`${t('p9.nb.col.volume')} ${k}`, r.volumeAdded, `D.${k}.vol`, (n, patch) => Object.assign(n.tableD[k].volumeAdded, patch))}</td>
        <td>{pickReading(`${t('p9.nb.col.turbidity')} ${k}`, r.turbidityId, of('turbidity'), `D.${k}.turb`, (n, id) => up((x) => { x.turbidityId = id; })(n))}</td>
        <td>{pickReading(`${t('p9.nb.col.observation')} ${k}`, r.observationId, of('observation'), `D.${k}.obs`, (n, id) => up((x) => { x.observationId = id; })(n))}</td>
        <td>{choose(`${t('p9.nb.col.solid')} ${k}`, r.solid, ['white', 'brown', 'none'] as const, `D.${k}.solid`, (n, v) => up((x) => { x.solid = v; })(n), 'p9.color')}</td>
        <td className="eq">
          {small(`ν ${t('p9.nb.col.cation')} ${k}`, r.nuCation, `D.${k}.nuC`, (n, v) => up((x) => { x.nuCation = v; })(n))}
          <span>{k === 'sr' ? ' Sr²⁺ + ' : ' Fe³⁺ + '}</span>
          {small(`ν ${t('p9.nb.col.anion')} ${k}`, r.nuAnion, `D.${k}.nuA`, (n, v) => up((x) => { x.nuAnion = v; })(n))}
          <span>{k === 'sr' ? ' SO₄²⁻ → SrSO₄(s)' : ' OH⁻ → Fe(OH)₃(s)'}</span>
        </td>
      </tr>
    );
  };
  const rowE = (i: 0 | 1) => {
    const r = nb.tableE.rows[i];
    const up = (fn: (x: RowE) => void) => (n: P09Notebook) => fn(n.tableE.rows[i]);
    return (
      <tr key={i}>
        <th scope="row">{i + 1}</th>
        <td>{choose(`${t('p9.nb.col.tube')} ${i + 1}`, r.tube, tubes, `E.${i}.tube`, (n, v) => up((x) => { x.tube = v; })(n), null)}</td>
        <td>{choose(`${t('p9.nb.col.counter')} ${i + 1}`, r.counterTube, tubes, `E.${i}.counter`, (n, v) => up((x) => { x.counterTube = v; })(n), null)}</td>
        <td>{cell(`${t('p9.nb.col.massTube')} ${i + 1}`, r.massTube, `E.${i}.mT`, (n, patch) => Object.assign(n.tableE.rows[i].massTube, patch), of('mass'))}</td>
        <td>{cell(`${t('p9.nb.col.massCounter')} ${i + 1}`, r.massCounter, `E.${i}.mC`, (n, patch) => Object.assign(n.tableE.rows[i].massCounter, patch), of('mass'))}</td>
        <td>{small(`${t('p9.nb.col.spin')} ${i + 1}`, r.spinS, `E.${i}.spin`, (n, v) => up((x) => { x.spinS = v; })(n))}</td>
        <td>{cell(`${t('p9.nb.col.decanted')} ${i + 1}`, r.decantedMl, `E.${i}.dec`, (n, patch) => Object.assign(n.tableE.rows[i].decantedMl, patch), of('volume'))}</td>
        <td>{small(`${t('p9.nb.col.losses')} ${i + 1}`, r.losses, `E.${i}.loss`, (n, v) => up((x) => { x.losses = v; })(n))}</td>
      </tr>
    );
  };
  const evidenceOpts = of('observation', 'turbidity', 'emission', 'spectrum');

  return (
    <aside className="drawer" aria-label={t('nb.title')}>
      <div className="drawer-head">
        <h2>📓 {t('nb.title')}</h2>
        <span className="hint">{w.unknown.code}</span>
        <span style={{ flex: 1 }} />
        {savedAt && <span className="hint">{t('nb.saved', { time: new Date(savedAt).toLocaleTimeString() })}</span>}
        <button className="btn small ghost" onClick={toggle} aria-label={t('common.close')}>×</button>
      </div>
      <div className="drawer-body">
        <div className="tabs" role="tablist">
          {TABS.map((k) => (
            <button key={k} role="tab" className="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{t(`p9.nb.tab.${k}`)}</button>
          ))}
        </div>

        {tab === 'A' && (
          <section aria-label={t('p9.nb.tableA')} style={{ display: 'grid', gap: '0.6rem' }}>
            <h3>{t('p9.nb.tableA')}</h3>
            <p className="hint">{t('p9.nb.tableAHelp')}</p>
            <table className="nb-table">
              <thead><tr><th>{t('p9.nb.col.cation')}</th><th>{t('p9.nb.col.predSolid')}</th><th>{t('p9.nb.col.predColor')}</th><th>{t('p9.nb.col.reason')}</th></tr></thead>
              <tbody>
                {CATIONS.map((c) => (
                  <tr key={c}>
                    <th scope="row">{t(`p9.cation.${c}`)}</th>
                    <td>{locked ? t(`p9.solidKind.${A[c].predictedSolid || 'none'}`) : choose(`${t('p9.nb.col.predSolid')} ${c}`, A[c].predictedSolid, ['sulfate', 'hydroxide', 'none'] as const, `A.${c}.solid`, (n, v) => { n.tableA[c].predictedSolid = v; }, 'p9.solidKind')}</td>
                    <td>{locked ? t(`p9.color.${A[c].predictedColor || 'none'}`) : choose(`${t('p9.nb.col.predColor')} ${c}`, A[c].predictedColor, COLORS, `A.${c}.color`, (n, v) => { n.tableA[c].predictedColor = v; }, 'p9.color')}</td>
                    <td>{locked ? A[c].reason : small(`${t('p9.nb.col.reason')} ${c}`, A[c].reason, `A.${c}.reason`, (n, v) => { n.tableA[c].reason = v; })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="row">
              <button className="btn primary" disabled={locked} onClick={() => setNb((n) => { n.tableA.savedAtS = w.timeS; }, 'A.saved', '', String(w.timeS))}>
                {locked ? t('p9.nb.savedPrediction', { s: fmt(A.savedAtS ?? 0, 0) }) : t('p9.nb.savePrediction')}
              </button>
            </div>
          </section>
        )}

        {tab === 'B' && (
          <section aria-label={t('p9.nb.tableB')} style={{ display: 'grid', gap: '0.6rem' }}>
            <h3>{t('p9.nb.tableB')}</h3>
            <p className="hint">{t('p9.nb.tableBHelp')}</p>
            <table className="nb-table">
              <thead><tr><th>{t('p9.nb.col.control')}</th><th>{t('p9.nb.col.reading')}</th><th>{t('p9.nb.col.color')}</th><th>{t('p9.nb.col.intensity')}</th><th>{t('p9.nb.col.light')}</th><th>{t('p9.nb.col.contamination')}</th></tr></thead>
              <tbody>
                {ATLAS_KEYS.map((k) => {
                  const r = nb.tableB[k];
                  return (
                    <tr key={k}>
                      <th scope="row">{name(k)}</th>
                      <td>{pickReading(`${t('p9.nb.col.reading')} ${name(k)}`, r.readingId, of('emission'), `B.${k}.id`, (n, id) => {
                        n.tableB[k].readingId = id;
                        const rr = id ? w.readings[id] : null;
                        if (rr) n.tableB[k].lightPct = String(rr.snapshot.lightPct ?? '');
                      })}</td>
                      <td>{choose(`${t('p9.nb.col.color')} ${name(k)}`, r.color, COLORS, `B.${k}.color`, (n, v) => { n.tableB[k].color = v; }, 'p9.color')}</td>
                      <td>{choose(`${t('p9.nb.col.intensity')} ${name(k)}`, r.intensity, ['weak', 'medium', 'strong'] as const, `B.${k}.int`, (n, v) => { n.tableB[k].intensity = v; }, 'p9.intensity')}</td>
                      <td>{small(`${t('p9.nb.col.light')} ${name(k)}`, r.lightPct, `B.${k}.light`, (n, v) => { n.tableB[k].lightPct = v; })}</td>
                      <td>{small(`${t('p9.nb.col.contamination')} ${name(k)}`, r.contamination, `B.${k}.cont`, (n, v) => { n.tableB[k].contamination = v; })}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        )}

        {tab === 'C' && (
          <section aria-label={t('p9.nb.tableC')} style={{ display: 'grid', gap: '0.6rem' }}>
            <h3>{t('p9.nb.tableC')}</h3>
            <p className="hint virtual-note" role="note">⚠ {t('p9.nb.tableCHelp')}</p>
            {(['loopId', 'glassId', 'cupId'] as const).map((k) => (
              <div className="field" key={k}>
                <label>{t(`p9.nb.f.${k}`)}</label>
                {pickReading(t(`p9.nb.f.${k}`), C[k], of('emission'), `C.${k}`, (n, id) => { n.tableC[k] = id; })}
              </div>
            ))}
            {text('C.differences', C.differences, (n, v) => { n.tableC.differences = v; }, true, 'p9.nb.f.differences')}
            <div className="field">
              <label>{t('p9.nb.f.glassRating')}</label>
              {choose(t('p9.nb.f.glassRating'), C.glassRating, ['virtualOnly', 'heatResistant', 'unsure'] as const, 'C.rating', (n, v) => { n.tableC.glassRating = v; }, 'p9.glassRating')}
            </div>
          </section>
        )}

        {tab === 'D' && (
          <section aria-label={t('p9.nb.tableD')} style={{ display: 'grid', gap: '0.6rem' }}>
            <h3>{t('p9.nb.tableD')}</h3>
            <p className="hint">{t('p9.nb.tableDHelp')}</p>
            <div className="table-scroll" tabIndex={0} role="region" aria-label={t('p9.nb.tableD')}>
              <table className="nb-table">
                <thead><tr><th /><th>{t('p9.nb.col.tube')}</th><th>{t('p9.nb.col.reagent')}</th><th>{t('p9.nb.col.drops')}</th><th>{t('p9.nb.col.volume')}</th><th>{t('p9.nb.col.turbidity')}</th><th>{t('p9.nb.col.observation')}</th><th>{t('p9.nb.col.solid')}</th><th>{t('p9.nb.col.equation')}</th></tr></thead>
                <tbody>{rowD('sr')}{rowD('fe')}</tbody>
              </table>
            </div>
          </section>
        )}

        {tab === 'E' && (
          <section aria-label={t('p9.nb.tableE')} style={{ display: 'grid', gap: '0.6rem' }}>
            <h3>{t('p9.nb.tableE')}</h3>
            <p className="hint">{t('p9.nb.tableEHelp')}</p>
            <div className="table-scroll" tabIndex={0} role="region" aria-label={t('p9.nb.tableE')}>
              <table className="nb-table">
                <thead><tr><th>#</th><th>{t('p9.nb.col.tube')}</th><th>{t('p9.nb.col.counter')}</th><th>{t('p9.nb.col.massTube')}</th><th>{t('p9.nb.col.massCounter')}</th><th>{t('p9.nb.col.spin')}</th><th>{t('p9.nb.col.decanted')}</th><th>{t('p9.nb.col.losses')}</th></tr></thead>
                <tbody>{rowE(0)}{rowE(1)}</tbody>
              </table>
            </div>
            <div className="field">
              <label>{t('p9.nb.f.reserveTube')}</label>
              {choose(t('p9.nb.f.reserveTube'), nb.tableE.reserveTube, tubes, 'E.reserve', (n, v) => { n.tableE.reserveTube = v; }, null)}
            </div>
          </section>
        )}

        {tab === 'F' && (
          <section aria-label={t('p9.nb.tableF')} style={{ display: 'grid', gap: '0.6rem' }}>
            <h3>{t('p9.nb.tableF')}</h3>
            <p className="hint">{t('p9.nb.tableFHelp')}</p>
            {CATIONS.map((c: Cation) => {
              const r = nb.tableF[c];
              return (
                <fieldset key={c} className="nb-fieldset">
                  <legend>{t(`p9.cation.${c}`)}</legend>
                  <div className="field">
                    <label>{t('p9.nb.f.status')}</label>
                    {choose(`${t('p9.nb.f.status')} ${c}`, r.status, ['detected', 'notDetected', 'indeterminate'] as const, `F.${c}.status`, (n, v) => { n.tableF[c].status = v; }, 'p9.status')}
                  </div>
                  <div className="field">
                    <label>{t('p9.nb.f.evidence')}</label>
                    <div className="chips">
                      {r.evidenceIds.map((id) => (
                        <button key={id} className="btn small ghost" aria-label={t('p9.nb.removeEvidence', { id })} onClick={() => setNb((n) => { n.tableF[c].evidenceIds = n.tableF[c].evidenceIds.filter((x) => x !== id); }, `F.${c}.ev`, id, '')}>{id} ×</button>
                      ))}
                      {pickReading(`${t('p9.nb.addEvidence')} ${c}`, null, evidenceOpts.filter((x) => !r.evidenceIds.includes(x.id)), `F.${c}.ev`, (n, id) => { if (id) n.tableF[c].evidenceIds.push(id); })}
                    </div>
                  </div>
                  {text(`F.${c}.lim`, r.limitation, (n, v) => { n.tableF[c].limitation = v; }, false, 'p9.nb.f.limitation')}
                </fieldset>
              );
            })}
            {text('F.kCharge', nb.tableF.kCharge, (n, v) => { n.tableF.kCharge = v; }, false, 'p9.nb.f.kCharge')}
          </section>
        )}

        {tab === 'G' && (
          <section aria-label={t('p9.nb.tableG')} style={{ display: 'grid', gap: '0.6rem' }}>
            <h3>{t('p9.nb.tableG')}</h3>
            <p className="hint">{t('p9.nb.tableGHelp')}</p>
            <ol className="graph-list">
              {nb.tableG.map((e, i) => (
                <li key={i} className="row">
                  {choose(`${t('p9.nb.col.from')} ${i + 1}`, e.from, graphNodes, `G.${i}.from`, (n, v) => { n.tableG[i].from = v; }, null)}
                  {choose(`${t('p9.nb.col.action')} ${i + 1}`, e.action, ACTIONS, `G.${i}.action`, (n, v) => { n.tableG[i].action = v; }, 'p9.action')}
                  <span aria-hidden="true">→</span>
                  {choose(`${t('p9.nb.col.to')} ${i + 1}`, e.to, graphNodes, `G.${i}.to`, (n, v) => { n.tableG[i].to = v; }, null)}
                  <button className="btn small ghost" aria-label={t('p9.nb.removeEdge', { n: i + 1 })} onClick={() => setNb((n) => { n.tableG.splice(i, 1); }, `G.${i}`, 'edge', '')}>×</button>
                </li>
              ))}
            </ol>
            <div className="row">
              <button className="btn small" onClick={() => setNb((n) => { n.tableG.push({ from: '', action: '', to: '' }); }, 'G.add', '', 'edge')}>+ {t('p9.nb.addEdge')}</button>
            </div>
            {nb.tableG.length > 0 && (
              <p className="hint" aria-live="polite">{nb.tableG.filter((e) => e.from && e.to && e.action).map((e) => `${name(e.from)} —${t(`p9.action.${e.action}`)}→ ${name(e.to)}`).join(' · ')}</p>
            )}
          </section>
        )}

        {tab === 'H' && (
          <section aria-label={t('p9.nb.tab.H')} style={{ display: 'grid', gap: '0.6rem' }}>
            <h3>{t('p9.nb.questions')}</h3>
            {QUESTIONS.map((q) => text(`analysis.${q}`, nb.analysis[q], (n, v) => { n.analysis[q] = v; }))}
            {text('explanation', nb.explanation, (n, v) => { n.explanation = v; })}
            {text('errorReflection', nb.errorReflection, (n, v) => { n.errorReflection = v; })}
          </section>
        )}

        {tab === 'log' && (
          <section aria-label={t('p9.nb.tab.log')}>
            <h3>{t('p9.nb.readings')}</h3>
            <ul className="fb-list">
              {all.map((r) => (
                <li key={r.id}>
                  <span className={r.valid ? 'ok' : 'bad'}>{r.valid ? '✓' : '✗'}</span> {rlabel(r)} · {fmt(r.t, 0)} s
                  {r.qualityFlags.length > 0 && <span className="hint"> · {r.qualityFlags.map((q) => t(`p9.quality.${q}`)).join(', ')}</span>}
                </li>
              ))}
            </ul>
            <h3>{t('p4.nb.history', { n: nb.history.length })}</h3>
            <ul className="fb-list" style={{ maxHeight: '14rem', overflow: 'auto' }}>
              {[...nb.history].reverse().slice(0, 80).map((h, i) => <li key={i}><span className="hint">{fmt(h.t, 0)} s</span> {h.field}: «{h.from.slice(0, 40)}» → «{h.to.slice(0, 40)}»</li>)}
            </ul>
            <div className="row">
              <button className="btn small" onClick={() => downloadJson(`libreta-p9-${attemptId}.json`, { attemptId, notebook: nb, readings: w.readings })}>{t('review.export')}</button>
              <button className="btn small ghost" onClick={() => window.print()}>{t('p10.nb.print')}</button>
            </div>
          </section>
        )}
      </div>
    </aside>
  );
}
