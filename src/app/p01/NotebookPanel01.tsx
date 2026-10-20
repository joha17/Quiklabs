import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useP01 } from './store';
import {
  IMPORT_C, IMPORT_D, INSTRUMENTS_A, QUESTIONS, ROWS_C, ROWS_D, SERIES, UNIT_C, UNIT_D, parseNum, type Entry, type P01Notebook, type RowC, type RowD, type Series,
} from '../../practices/practice-01/notebook';
import { expectedDisplacement, expectedGeometry, expectedWater, readingsOf } from '../../practices/practice-01/expected-results';
import type { Reading01 } from '../../simulation/density-world/types';
import { downloadJson } from '../persistence';

type Tab = 'A' | 'B' | 'C' | 'D' | 'analysis' | 'log';

const fmt = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d).replace('.', ',') : '—');
const decOf = (r: Reading01) => Math.max(0, Math.round(-Math.log10(r.resolution) + 0.01));
const warnOf = (r: Reading01) => (r.qualityFlags.some((q) => !['TARE', 'AIR'].includes(q)) ? ' ⚠' : '');

/**
 * Libreta digital de la Práctica 1 (§12): cada celda de observación se importa de una lectura producida y observada
 * (con su id); los cálculos los escribe el estudiante. «Revisar» (práctica y guiado) dice cuántos datos no coinciden
 * con lo que corresponde a SUS lecturas, sin dar la respuesta.
 */
export function NotebookPanel01() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('A');
  const nb = useP01((s) => s.notebook);
  const setNb = useP01((s) => s.setNotebook);
  const toggle = useP01((s) => s.toggleNotebook);
  const savedAt = useP01((s) => s.savedAt);
  useP01((s) => s.version);
  const rt = useP01((s) => s.runtime);
  const mode = useP01((s) => s.settings.mode);
  const attemptId = useP01((s) => s.attemptId);
  const wanted = useP01((s) => s.notebookTab);
  const [checked, setChecked] = useState<Record<string, number>>({});
  useEffect(() => {
    if (wanted) setTab(wanted as Tab);
  }, [wanted]);
  if (!rt) return null;
  const w = rt.world;
  const practice = mode === 'PRACTICE' || mode === 'GUIDED';
  const all = readingsOf(w);
  const byKind = (k: Reading01['kind'], pred: (r: Reading01) => boolean = () => true) => all.filter((r) => r.kind === k && !r.qualityFlags.includes('TARE') && pred(r));

  /** Celda con valor, incertidumbre y selector para importar una lectura. */
  const cell = (label: string, e: Entry, path: string, set: (n: P01Notebook, patch: Partial<Entry>) => void, opts: Reading01[] = [], withU = true) => (
    <div className="cell">
      <input aria-label={label} type="text" inputMode="decimal" value={e.value} onChange={(ev) => setNb((n) => set(n, { value: ev.target.value, readingId: null }), path, e.value, ev.target.value)} />
      {withU && <input aria-label={`± ${label}`} className="u" type="text" inputMode="decimal" value={e.uncertainty} placeholder="±" onChange={(ev) => setNb((n) => set(n, { uncertainty: ev.target.value }), `${path}.u`, e.uncertainty, ev.target.value)} />}
      {opts.length > 0 && (
        <select aria-label={`${t('p01.nb.import')} — ${label}`} value={e.readingId ?? ''} onChange={(ev) => {
          const r = opts.find((x) => x.id === ev.target.value);
          if (r) setNb((n) => set(n, { value: fmt(r.value, decOf(r)), uncertainty: fmt(r.uncertainty, decOf(r) + (r.kind === 'volume' && r.resolution >= 0.5 ? 1 : 0)), readingId: r.id }), path, e.value, fmt(r.value, decOf(r)));
        }}>
          <option value="">📥</option>
          {opts.map((r) => <option key={r.id} value={r.id}>{r.id} · {fmt(r.value, decOf(r))} {r.unit}{warnOf(r)}</option>)}
        </select>
      )}
    </div>
  );
  const text = (path: string, value: string, set: (n: P01Notebook, v: string) => void, area = true) => {
    const idf = `p01-${path}`;
    const on = (v: string) => setNb((n) => set(n, v), path, value, v);
    return (
      <div className="field" key={path}>
        <label htmlFor={idf}>{t(`p01.nb.f.${path}`)}</label>
        {area ? <textarea id={idf} value={value} onChange={(e) => on(e.target.value)} /> : <input id={idf} type="text" value={value} onChange={(e) => on(e.target.value)} />}
      </div>
    );
  };
  const checkBtn = (key: string, fn: () => number) =>
    practice && (
      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
        <button className="btn small" onClick={() => setChecked({ ...checked, [key]: fn() })}>{t('p5.nb.check')}</button>
        {checked[key] !== undefined && <span className={checked[key] ? 'pending' : 'ok'} role="status">{checked[key] ? t('p01.nb.checkWrong', { n: checked[key] }) : '✓'}</span>}
      </div>
    );
  const wrong = (pairs: Array<[string, number, number]>) => pairs.filter(([s, v, rel]) => s.trim() && Number.isFinite(v) && !(Math.abs(parseNum(s) - v) <= Math.max(1e-9, Math.abs(v) * rel))).length;

  // Lecturas que se ofrecen en cada celda (solo de instrumentos observados).
  const masses = byKind('mass');
  const temps = byKind('temp');
  const cylVol = byKind('volume', (r) => r.instrumentId === 'cylinder50');
  const lengths = byKind('length', (r) => r.target !== 'empty');

  return (
    <aside className="drawer" aria-label={t('nb.title')}>
      <div className="drawer-head">
        <h2>📓 {t('nb.title')}</h2>
        <span style={{ flex: 1 }} />
        <button className="btn small ghost" onClick={toggle} aria-label={t('common.close')}>×</button>
      </div>
      <div className="drawer-body">
        <div className="tabs" role="tablist">
          {(['A', 'B', 'C', 'D', 'analysis', 'log'] as Tab[]).map((k) => (
            <button key={k} role="tab" className="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{t(`p01.nb.tab.${k}`)}</button>
          ))}
        </div>
        {savedAt && <span className="hint">{t('nb.saved', { time: new Date(savedAt).toLocaleTimeString() })}</span>}

        {tab === 'A' && (
          <section aria-label={t('p01.nb.tableA')} style={{ display: 'grid', gap: '0.6rem' }}>
            <h3>{t('p01.nb.tableA')}</h3>
            <div className="table-scroll">
              <table className="data">
                <thead><tr><th>{t('p01.nb.col.instrument')}</th><th>{t('p01.nb.col.capacity')}</th><th>{t('p01.nb.col.division')}</th><th>{t('p01.nb.col.uncertainty')}</th><th>{t('p01.nb.col.use')}</th></tr></thead>
                <tbody>
                  {INSTRUMENTS_A.map((k) => (
                    <tr key={k}>
                      <th scope="row">{t(`p01.nb.inst.${k}`)}</th>
                      {(['capacity', 'division', 'uncertainty', 'use'] as const).map((c) => (
                        <td key={c}><input aria-label={`${t(`p01.nb.inst.${k}`)} — ${t(`p01.nb.col.${c}`)}`} type="text" value={nb.tableA[k][c]} onChange={(e) => { const v = e.target.value; setNb((n) => { n.tableA[k][c] = v; }, `A.${k}.${c}`, nb.tableA[k][c], v); }} /></td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h4>{t('p01.nb.trials')}</h4>
            <div className="table-scroll">
              <table className="data">
                <tbody>
                  <tr><th scope="row">{t('p01.nb.trialProbe')}</th><td>{cell(t('p01.nb.trialProbe'), nb.trialProbe, 'trialProbe', (n, p) => Object.assign(n.trialProbe, p), cylVol)}</td><td>mL</td></tr>
                  <tr><th scope="row">{t('p01.nb.trialPipette')}</th><td>{cell(t('p01.nb.trialPipette'), nb.trialPipette, 'trialPipette', (n, p) => Object.assign(n.trialPipette, p), byKind('volume', (r) => r.instrumentId === 'pipette25'))}</td><td>mL</td></tr>
                </tbody>
              </table>
            </div>
            {text('compareText', nb.compareText, (n, v) => { n.compareText = v; })}
            <div className="field">
              <label htmlFor="p01conv">{t('p01.nb.convention')}</label>
              <select id="p01conv" value={nb.convention} onChange={(e) => { const v = e.target.value as P01Notebook['convention']; setNb((n) => { n.convention = v; }, 'convention', nb.convention, v); }}>
                <option value="">{t('nb.choose')}</option>
                <option value="RECTANGULAR">{t('p01.conventionBadge.RECTANGULAR')}</option>
                <option value="DIRECT">{t('p01.conventionBadge.DIRECT')}</option>
              </select>
            </div>
            <p className="hint">{t('p01.nb.conventionHelp')}</p>
          </section>
        )}

        {tab === 'B' && (
          <section aria-label={t('p01.nb.tableB')} style={{ display: 'grid', gap: '0.6rem' }}>
            <h3>{t('p01.nb.tableB')}</h3>
            <p className="hint">{t('p01.nb.tableBHelp')}</p>
            <div className="table-scroll">
              <table className="data p6-t">
                <thead><tr><th>{t('p01.nb.col.field')}</th>{SERIES.map((s) => <th key={s}>{t(`p01.series.${s}`)}</th>)}<th>{t('p01.nb.col.unit')}</th></tr></thead>
                <tbody>
                  {(['mass', 'volume', 'temp', 'density'] as const).map((row) => (
                    <tr key={row}>
                      <th scope="row">{t(`p01.nb.rowB.${row}`)}</th>
                      {SERIES.map((s: Series) => (
                        <td key={s}>{cell(`${t(`p01.nb.rowB.${row}`)} — ${t(`p01.series.${s}`)}`, nb.tableB[s][row], `B.${s}.${row}`, (n, p) => Object.assign(n.tableB[s][row], p), row === 'mass' ? masses.filter((r) => r.value > 15 && r.value < 40) : row === 'temp' ? temps : [])}</td>
                      ))}
                      <td>{row === 'mass' ? 'g' : row === 'volume' ? 'mL' : row === 'temp' ? '°C' : 'g/mL'}</td>
                    </tr>
                  ))}
                  <tr>
                    <th scope="row">{t('p01.nb.rowB.notes')}</th>
                    {SERIES.map((s) => <td key={s}><textarea aria-label={`${t('p01.nb.rowB.notes')} — ${t(`p01.series.${s}`)}`} value={nb.tableB[s].notes} onChange={(e) => { const v = e.target.value; setNb((n) => { n.tableB[s].notes = v; }, `B.${s}.notes`, nb.tableB[s].notes, v); }} /></td>)}
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
            {checkBtn('B', () => wrong(SERIES.flatMap((s) => {
              const e = expectedWater(w, nb, s);
              return [[nb.tableB[s].density.value, e.rho, 0.0008], [nb.tableB[s].density.uncertainty, e.urho, 0.3]] as Array<[string, number, number]>;
            })))}
          </section>
        )}

        {tab === 'C' && (
          <section aria-label={t('p01.nb.tableC')} style={{ display: 'grid', gap: '0.6rem' }}>
            <h3>{t('p01.nb.tableC')}</h3>
            <div className="table-scroll">
              <table className="data p6-t">
                <thead><tr><th>{t('p01.nb.col.field')}</th><th>{t('p01.nb.col.value')}</th><th>{t('p01.nb.col.unit')}</th></tr></thead>
                <tbody>
                  {ROWS_C.map((row: RowC) => (
                    <tr key={row}>
                      <th scope="row">{t(`p01.nb.rowC.${row}`)}</th>
                      <td>{cell(t(`p01.nb.rowC.${row}`), nb.tableC[row], `C.${row}`, (n, p) => Object.assign(n.tableC[row], p), IMPORT_C.includes(row) ? (row === 'temp' ? temps : row.startsWith('v') ? cylVol : masses) : [])}</td>
                      <td>{UNIT_C[row]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {text('referenceC', nb.referenceC, (n, v) => { n.referenceC = v; }, false)}
            {text('errorC', nb.errorC, (n, v) => { n.errorC = v; }, false)}
            {checkBtn('C', () => {
              const e = expectedDisplacement(w, nb);
              return wrong([[nb.tableC.netMass.value, e.mNet, 0.0005], [nb.tableC.dV.value, e.dV, 0.02], [nb.tableC.density.value, e.rho, 0.01], [nb.tableC.density.uncertainty, e.urho, 0.3]]);
            })}
          </section>
        )}

        {tab === 'D' && (
          <section aria-label={t('p01.nb.tableD')} style={{ display: 'grid', gap: '0.6rem' }}>
            <h3>{t('p01.nb.tableD')}</h3>
            <div className="table-scroll">
              <table className="data p6-t">
                <thead><tr><th>{t('p01.nb.col.field')}</th><th>{t('p01.nb.col.value')}</th><th>{t('p01.nb.col.unit')}</th></tr></thead>
                <tbody>
                  {ROWS_D.map((row: RowD) => (
                    <tr key={row}>
                      <th scope="row">{t(`p01.nb.rowD.${row}`)}</th>
                      <td>{cell(t(`p01.nb.rowD.${row}`), nb.tableD[row], `D.${row}`, (n, p) => Object.assign(n.tableD[row], p), IMPORT_D.includes(row) ? (row.endsWith('Mass') ? masses : lengths.filter((r) => (row.startsWith('d') ? r.target === 'diameter' : r.target === 'height'))) : [])}</td>
                      <td>{UNIT_D[row]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {text('referenceD', nb.referenceD, (n, v) => { n.referenceD = v; }, false)}
            {text('errorD', nb.errorD, (n, v) => { n.errorD = v; }, false)}
            {checkBtn('D', () => {
              const e = expectedGeometry(w, nb);
              return wrong([[nb.tableD.netMass.value, e.mNet, 0.0005], [nb.tableD.volume.value, e.V, 0.004], [nb.tableD.density.value, e.rho, 0.004], [nb.tableD.density.uncertainty, e.urho, 0.3]]);
            })}
          </section>
        )}

        {tab === 'analysis' && (
          <section aria-label={t('p01.nb.tab.analysis')} style={{ display: 'grid', gap: '0.6rem' }}>
            <h3>{t('p01.nb.procedure')}</h3>
            {(['mass', 'volume', 'density'] as const).map((k) => text(`procedure.${k}`, nb.procedure[k], (n, v) => { n.procedure[k] = v; }))}
            <h3>{t('p01.nb.sources')}</h3>
            {(['water', 'displacement', 'geometry'] as const).map((k) => text(`sources.${k}`, nb.sources[k], (n, v) => { n.sources[k] = v; }, false))}
            <h3>{t('p01.nb.questions')}</h3>
            {QUESTIONS.map((q) => text(`analysis.${q}`, nb.analysis[q], (n, v) => { n.analysis[q] = v; }))}
          </section>
        )}

        {tab === 'log' && (
          <section aria-label={t('p01.nb.tab.log')}>
            <h3>{t('p01.nb.readings')}</h3>
            <ul className="fb-list">
              {all.map((r) => (
                <li key={r.id}>
                  <span className={r.qualityFlags.some((q) => !['TARE', 'AIR'].includes(q)) ? 'bad' : 'ok'}>{r.qualityFlags.some((q) => !['TARE', 'AIR'].includes(q)) ? '✗' : '✓'}</span>{' '}
                  {r.id} · {t(`p01.instrument.${r.instrumentId}`)} · {fmt(r.value, decOf(r))} {r.unit}
                  {r.qualityFlags.length > 0 && <span className="hint"> · {r.qualityFlags.map((q) => t(`p01.quality.${q}`)).join(', ')}</span>}
                </li>
              ))}
            </ul>
            <h3>{t('p4.nb.history', { n: nb.history.length })}</h3>
            <ul className="fb-list" style={{ maxHeight: '14rem', overflow: 'auto' }}>
              {[...nb.history].reverse().slice(0, 80).map((h, i) => <li key={i}><span className="hint">{fmt(h.t, 0)} s</span> {h.field}: «{h.from.slice(0, 40)}» → «{h.to.slice(0, 40)}»</li>)}
            </ul>
            <div className="row">
              <button className="btn small" onClick={() => downloadJson(`libreta-p01-${attemptId}.json`, { attemptId, notebook: nb, readings: w.readings, samples: w.samples })}>{t('review.export')}</button>
              <button className="btn small ghost" onClick={() => window.print()}>{t('p10.nb.print')}</button>
            </div>
          </section>
        )}
      </div>
    </aside>
  );
}
