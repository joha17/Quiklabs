import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useP08 } from './store';
import { QUESTIONS, ROWS_B, type Entry, type P08Notebook, type RowBKey } from '../../practices/practice-08/notebook';
import { rowMoles } from '../../practices/practice-08/expected-results';
import type { Reading08, SpeciesId } from '../../simulation/organic-world/types';
import { SPECIES } from '../../simulation/organic-chemistry/species';
import { downloadJson } from '../persistence';
import { p08NameOf } from './describe';

type Tab = 'A' | 'B' | 'C' | 'analysis' | 'log';

const fmt = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d).replace('.', ',') : '—');
const decOf = (r: Reading08) => (r.resolution > 0 ? Math.max(0, Math.round(-Math.log10(r.resolution) + 0.01)) : 0);
const warnOf = (r: Reading08) => (!r.valid ? ' ✗' : r.qualityFlags.length ? ' ⚠' : '');

/**
 * Libreta digital de la Práctica 8 (§12): Cuadro A (predicción, antes de mezclar), Cuadro B (operaciones y lecturas),
 * Cuadro C (calidad y rendimiento) y diez actividades. Cada dato instrumental se IMPORTA de una lectura propia de este
 * intento (id, unidad, incertidumbre y banderas de calidad) y no se edita a mano; los cálculos y explicaciones son del
 * estudiante. No hay valores internos del mundo: la pureza solo existe si se midió (§12.3).
 */
export function NotebookPanel08() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('A');
  const nb = useP08((s) => s.notebook);
  const setNb = useP08((s) => s.setNotebook);
  const toggle = useP08((s) => s.toggleNotebook);
  const savedAt = useP08((s) => s.savedAt);
  useP08((s) => s.version);
  const rt = useP08((s) => s.runtime);
  const attemptId = useP08((s) => s.attemptId);
  const wanted = useP08((s) => s.notebookTab);
  useEffect(() => {
    if (wanted) setTab(wanted as Tab);
  }, [wanted]);
  if (!rt) return null;
  const w = rt.world;
  const all = w.readingOrder.map((rid) => w.readings[rid]);
  const of = (k: Reading08['kind']) => all.filter((r) => r.kind === k);
  const name = (id: string) => p08NameOf(w, id);
  const rlabel = (r: Reading08) => `${r.id} · ${name(r.targetId)} · ${Number.isFinite(r.value) ? fmt(r.value, decOf(r)) : t('p8.instr.overRange')}${r.value2 !== undefined ? `–${fmt(r.value2, decOf(r))}` : ''} ${r.unit}${warnOf(r)}`;

  /** Celda importable: valor + incertidumbre + selector de lectura (§12). */
  const cell = (label: string, e: Entry, path: string, set: (n: P08Notebook, patch: Partial<Entry>) => void, opts: Reading08[] = [], withU = true) => (
    <div className="cell">
      <input aria-label={label} type="text" inputMode="decimal" value={e.value} readOnly={!!e.readingId} onChange={(ev) => setNb((n) => set(n, { value: ev.target.value, readingId: null }), path, e.value, ev.target.value)} />
      {withU && <input aria-label={`± ${label}`} className="u" type="text" inputMode="decimal" value={e.uncertainty} placeholder="±" onChange={(ev) => setNb((n) => set(n, { uncertainty: ev.target.value }), `${path}.u`, e.uncertainty, ev.target.value)} />}
      {opts.length > 0 && (
        <select aria-label={`${t('p8.nb.import')} — ${label}`} value={e.readingId ?? ''} onChange={(ev) => {
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
  const pickReading = (label: string, value: string | null, opts: Reading08[], path: string, set: (n: P08Notebook, id: string | null) => void) => (
    <select aria-label={label} value={value ?? ''} onChange={(ev) => setNb((n) => set(n, ev.target.value || null), path, value ?? '', ev.target.value)}>
      <option value="">📥</option>
      {opts.map((r) => <option key={r.id} value={r.id}>{rlabel(r)}</option>)}
    </select>
  );
  const text = (path: string, value: string, set: (n: P08Notebook, v: string) => void, area = true, labelKey?: string) => {
    const idf = `p8-${path}`;
    const on = (v: string) => setNb((n) => set(n, v), path, value, v);
    return (
      <div className="field" key={path}>
        <label htmlFor={idf}>{t(labelKey ?? `p8.nb.f.${path}`)}</label>
        {area ? <textarea id={idf} value={value} onChange={(e) => on(e.target.value)} /> : <input id={idf} type="text" value={value} onChange={(e) => on(e.target.value)} />}
      </div>
    );
  };
  const choose = <T extends string>(label: string, value: T, options: readonly T[], path: string, set: (n: P08Notebook, v: T) => void, keyPrefix: string) => (
    <select aria-label={label} value={value} onChange={(e) => setNb((n) => set(n, e.target.value as T), path, value, e.target.value)}>
      <option value="">{t('nb.choose')}</option>
      {options.filter(Boolean).map((o) => <option key={o} value={o}>{t(`${keyPrefix}.${o}`)}</option>)}
    </select>
  );

  const R = nb.route;
  const A = nb.tableA;
  const C = nb.tableC;
  const product = R === 'ISO' ? 'IAAc' : R === 'ASA' ? 'ASA' : 'MeSal';

  return (
    <aside className="drawer" aria-label={t('nb.title')}>
      <div className="drawer-head">
        <h2>📓 {t('nb.title')}</h2>
        <span className="hint">{t(`p8.route.${R}.name`)}</span>
        <span style={{ flex: 1 }} />
        <button className="btn small ghost" onClick={toggle} aria-label={t('common.close')}>×</button>
      </div>
      <div className="drawer-body">
        <div className="tabs" role="tablist">
          {(['A', 'B', 'C', 'analysis', 'log'] as Tab[]).map((k) => (
            <button key={k} role="tab" className="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{t(`p8.nb.tab.${k}`)}</button>
          ))}
        </div>
        {savedAt && <span className="hint">{t('nb.saved', { time: new Date(savedAt).toLocaleTimeString() })}</span>}
        <p className="hint" style={{ margin: 0 }}>{t('p8.nb.header', { id: attemptId, route: R, mode: t(`mode.${useP08.getState().settings.mode}`) })}</p>

        {tab === 'A' && (
          <section aria-label={t('p8.nb.tableA')} style={{ display: 'grid', gap: '0.6rem' }}>
            <h3>{t('p8.nb.tableA')}</h3>
            <p className="hint">{t('p8.nb.tableAHelp')}</p>
            {text('A.equation', A.equation, (n, v) => { n.tableA.equation = v; }, false, 'p8.nb.f.equation')}
            <div className="field">
              <label>{t('p8.nb.f.reactionType')}</label>
              {choose(t('p8.nb.f.reactionType'), A.reactionType, ['fischer', 'acetylation'] as const, 'A.type', (n, v) => { n.tableA.reactionType = v; }, 'p8.reaction')}
            </div>
            <div className="field">
              <label>{t('p8.nb.f.group')}</label>
              {choose(t('p8.nb.f.group'), A.functionalGroup, ['carboxyl', 'phenolHydroxyl', 'alcoholHydroxyl'] as const, 'A.group', (n, v) => { n.tableA.functionalGroup = v; }, 'p8.group')}
            </div>
            <table className="nb-table">
              <thead><tr><th>{t('p8.nb.col.reagent')}</th><th>{t('p8.nb.col.amount')}</th><th>{t('p8.nb.col.unit')}</th><th>{t('p8.nb.col.purity')}</th><th>{t('p8.nb.col.moles')}</th><th>ν</th></tr></thead>
              <tbody>
                {A.reagents.map((row, i) => {
                  const sp = row.species as SpeciesId;
                  const upd = (k: 'amount' | 'purity' | 'moles' | 'coefficient', v: string) => setNb((n) => { n.tableA.reagents[i][k] = v; }, `A.r${i}.${k}`, row[k], v);
                  return (
                    <tr key={i}>
                      <th scope="row">{sp ? `${t(`p8.species.${sp}`)} (${SPECIES[sp].formula})` : '—'}</th>
                      <td><input aria-label={`${t('p8.nb.col.amount')} ${sp}`} size={7} inputMode="decimal" value={row.amount} onChange={(e) => upd('amount', e.target.value)} /></td>
                      <td>{choose(`${t('p8.nb.col.unit')} ${sp}`, row.unit, ['g', 'mL'] as const, `A.r${i}.unit`, (n, v) => { n.tableA.reagents[i].unit = v; }, 'p8.unit')}</td>
                      <td><input aria-label={`${t('p8.nb.col.purity')} ${sp}`} size={6} inputMode="decimal" value={row.purity} onChange={(e) => upd('purity', e.target.value)} /></td>
                      <td><input aria-label={`${t('p8.nb.col.moles')} ${sp}`} size={9} inputMode="decimal" value={row.moles} onChange={(e) => upd('moles', e.target.value)} />{Number.isFinite(rowMoles(row)) && useP08.getState().settings.mode === 'GUIDED' && <span className="hint"> ≈ {fmt(rowMoles(row), 5)}</span>}</td>
                      <td><input aria-label={`ν ${sp}`} size={3} value={row.coefficient} onChange={(e) => upd('coefficient', e.target.value)} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="field">
              <label>{t('p8.nb.f.limiting')}</label>
              {choose(t('p8.nb.f.limiting'), A.limiting, A.reagents.map((r) => r.species).filter((x) => x && SPECIES[x as SpeciesId].phase !== undefined) as SpeciesId[], 'A.limiting', (n, v) => { n.tableA.limiting = v; }, 'p8.species')}
            </div>
            {text('A.theoretical', A.theoreticalG, (n, v) => { n.tableA.theoreticalG = v; }, false, 'p8.nb.f.theoretical')}
            {text('A.prediction', A.prediction, (n, v) => { n.tableA.prediction = v; }, true, 'p8.nb.f.prediction')}
            <div className="row">
              <button className="btn primary" disabled={A.savedAtS !== null} onClick={() => setNb((n) => { n.tableA.savedAtS = w.timeS; }, 'A.saved', '', String(w.timeS))}>
                {A.savedAtS === null ? t('p8.nb.savePrediction') : t('p8.nb.savedAt', { s: fmt(A.savedAtS, 0) })}
              </button>
            </div>
          </section>
        )}

        {tab === 'B' && (
          <section aria-label={t('p8.nb.tableB')} style={{ display: 'grid', gap: '0.6rem' }}>
            <h3>{t('p8.nb.tableB')}</h3>
            <p className="hint">{t('p8.nb.tableBHelp')}</p>
            {ROWS_B.map((k: RowBKey) => {
              const kind: Reading08['kind'] = k.startsWith('mass') ? 'mass' : k.startsWith('vol') ? 'volume' : 'temperature';
              return (
                <div className="field" key={k}>
                  <label>{t(`p8.nb.rowB.${k}`)}</label>
                  {cell(t(`p8.nb.rowB.${k}`), nb.tableB.rows[k], `B.${k}`, (n, patch) => Object.assign(n.tableB.rows[k], patch), of(kind))}
                </div>
              );
            })}
            {text('B.heating', nb.tableB.heatingS, (n, v) => { n.tableB.heatingS = v; }, false, 'p8.nb.f.heatingS')}
            {text('B.phases', nb.tableB.phases, (n, v) => { n.tableB.phases = v; }, true, 'p8.nb.f.phases')}
            {text('B.waste', nb.tableB.waste, (n, v) => { n.tableB.waste = v; }, true, 'p8.nb.f.waste')}
          </section>
        )}

        {tab === 'C' && (
          <section aria-label={t('p8.nb.tableC')} style={{ display: 'grid', gap: '0.6rem' }}>
            <h3>{t('p8.nb.tableC')}</h3>
            <p className="hint">{t('p8.nb.tableCHelp', { product: t(`p8.species.${product}`) })}</p>
            <div className="field"><label>{t('p8.nb.f.grossMass')}</label>{cell(t('p8.nb.f.grossMass'), C.grossMass, 'C.gross', (n, patch) => Object.assign(n.tableC.grossMass, patch), of('mass'))}</div>
            <div className="field"><label>{t('p8.nb.f.supportMass')}</label>{cell(t('p8.nb.f.supportMass'), C.supportMass, 'C.support', (n, patch) => Object.assign(n.tableC.supportMass, patch), of('mass'))}</div>
            <div className="field"><label>{t('p8.nb.f.isolatedMass')}</label>{cell(t('p8.nb.f.isolatedMass'), C.isolatedMass, 'C.isolated', (n, patch) => Object.assign(n.tableC.isolatedMass, patch))}</div>
            <div className="field">
              <label>{t('p8.nb.f.technique')}</label>
              {choose(t('p8.nb.f.technique'), C.technique, (R === 'ASA' ? ['mp', 'purity'] : ['density', 'purity']) as Array<'mp' | 'purity' | 'density'>, 'C.tech', (n, v) => { n.tableC.technique = v; }, 'p8.method')}
            </div>
            <div className="field"><label>{t('p8.nb.f.analysisReading')}</label>{cell(t('p8.nb.f.analysisReading'), C.analysis, 'C.analysis', (n, patch) => Object.assign(n.tableC.analysis, patch), [...of('mp'), ...of('density')], false)}</div>
            {R !== 'ASA' && (
              <>
                <div className="field"><label>{t('p8.nb.f.density')}</label>{cell(t('p8.nb.f.density'), C.density, 'C.density', (n, patch) => Object.assign(n.tableC.density, patch), of('density'))}</div>
                {text('C.densityT', C.densityTempC, (n, v) => { n.tableC.densityTempC = v; }, false, 'p8.nb.f.densityTempC')}
              </>
            )}
            <div className="field">
              <label>{t('p8.nb.f.purity')}</label>
              <div className="cell">
                <input aria-label={t('p8.nb.f.purity')} type="text" inputMode="decimal" value={C.purity.value} onChange={(ev) => setNb((n) => { n.tableC.purity.value = ev.target.value; }, 'C.purity', C.purity.value, ev.target.value)} />
                <input aria-label={`± ${t('p8.nb.f.purity')}`} className="u" type="text" value={C.purity.uncertainty} placeholder="±" onChange={(ev) => setNb((n) => { n.tableC.purity.uncertainty = ev.target.value; }, 'C.purity.u', C.purity.uncertainty, ev.target.value)} />
                {pickReading(`${t('p8.nb.import')} — ${t('p8.nb.f.purity')}`, C.purity.readingId, of('purity'), 'C.purity.id', (n, rid) => {
                  n.tableC.purity.readingId = rid;
                  n.tableC.purity.attemptId = rid ? attemptId : undefined;
                  const r = rid ? w.readings[rid] : null;
                  if (r) n.tableC.purity.value = fmt(r.value / 100, 3);
                })}
              </div>
              <span className="hint">{t('p8.nb.purityHelp')}</span>
            </div>
            {text('C.theoretical', C.theoreticalG, (n, v) => { n.tableC.theoreticalG = v; }, false, 'p8.nb.f.theoretical')}
            {text('C.apparent', C.apparentYield, (n, v) => { n.tableC.apparentYield = v; }, false, 'p8.nb.f.apparentYield')}
            {text('C.corrected', C.correctedYield, (n, v) => { n.tableC.correctedYield = v; }, false, 'p8.nb.f.correctedYield')}
            {text('C.balance', C.balance, (n, v) => { n.tableC.balance = v; }, true, 'p8.nb.f.balance')}
            {[0, 1, 2].map((i) => text(`C.loss${i}`, C.losses[i], (n, v) => { n.tableC.losses[i] = v; }, true, `p8.nb.f.loss${i}`))}
          </section>
        )}

        {tab === 'analysis' && (
          <section aria-label={t('p8.nb.tab.analysis')} style={{ display: 'grid', gap: '0.6rem' }}>
            <h3>{t('p8.nb.questions')}</h3>
            {QUESTIONS.map((q) => text(`analysis.${q}`, nb.analysis[q], (n, v) => { n.analysis[q] = v; }))}
            {text('conclusion', nb.conclusion, (n, v) => { n.conclusion = v; })}
          </section>
        )}

        {tab === 'log' && (
          <section aria-label={t('p8.nb.tab.log')}>
            <h3>{t('p8.nb.readings')}</h3>
            <ul className="fb-list">
              {all.map((r) => (
                <li key={r.id}>
                  <span className={r.valid ? 'ok' : 'bad'}>{r.valid ? '✓' : '✗'}</span> {rlabel(r)} · {fmt(r.t, 0)} s
                  {r.qualityFlags.length > 0 && <span className="hint"> · {r.qualityFlags.map((q) => t(`p8.quality.${q}`)).join(', ')}</span>}
                </li>
              ))}
            </ul>
            <h3>{t('p4.nb.history', { n: nb.history.length })}</h3>
            <ul className="fb-list" style={{ maxHeight: '14rem', overflow: 'auto' }}>
              {[...nb.history].reverse().slice(0, 80).map((h, i) => <li key={i}><span className="hint">{fmt(h.t, 0)} s</span> {h.field}: «{h.from.slice(0, 40)}» → «{h.to.slice(0, 40)}»</li>)}
            </ul>
            <div className="row">
              <button className="btn small" onClick={() => downloadJson(`libreta-p8-${attemptId}.json`, { attemptId, notebook: nb, readings: w.readings })}>{t('review.export')}</button>
              <button className="btn small ghost" onClick={() => window.print()}>{t('p10.nb.print')}</button>
            </div>
          </section>
        )}
      </div>
    </aside>
  );
}
