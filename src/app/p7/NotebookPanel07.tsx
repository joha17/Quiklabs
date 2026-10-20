import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useP07 } from './store';
import {
  QUESTIONS, ROWS_B, ROWS_C, ROWS_D, ROWS_F, parseNum, type Entry, type P07Notebook, type RowBKey, type RowCKey, type RowDKey, type RowFKey,
} from '../../practices/practice-07/notebook';
import { kappaIn, readingsOf } from '../../practices/practice-07/expected-results';
import type { Reading07 } from '../../simulation/bonding-world/types';
import { downloadJson } from '../persistence';
import { p07NameOf } from './describe';

type Tab = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'analysis' | 'log';

const fmt = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d).replace('.', ',') : '—');
const decOf = (r: Reading07) => (r.resolution > 0 ? Math.max(0, Math.round(-Math.log10(r.resolution) + 0.01)) : 0);
const warnOf = (r: Reading07) => (!r.valid ? ' ✗' : r.qualityFlags.length ? ' ⚠' : '');
const SAMPLES_A = ['jarNaCl', 'jarSucrose', 'spCu', 'spGraphite', 'spAl', 'btEthanol', 'btIsopropanol', 'btAcetic', 'btMineralOil', 'jarParaffin', 'jarCuSO4', 'unkX', 'unkY'];

/**
 * Libreta digital de la Práctica 7 (§12): cuadros originales A–F. Cada observación instrumental se IMPORTA de una
 * lectura propia (con su id, unidad, estabilidad y banderas de calidad) y no se edita a mano; el estudiante puede no
 * usarla y repetir la medición. Las predicciones, cálculos y explicaciones son suyos. El gráfico de κ frente a la
 * concentración se dibuja solo con sus pares medidos y tiene su tabla accesible (§12.4).
 */
export function NotebookPanel07() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('A');
  const nb = useP07((s) => s.notebook);
  const setNb = useP07((s) => s.setNotebook);
  const toggle = useP07((s) => s.toggleNotebook);
  const savedAt = useP07((s) => s.savedAt);
  useP07((s) => s.version);
  const rt = useP07((s) => s.runtime);
  const attemptId = useP07((s) => s.attemptId);
  const wanted = useP07((s) => s.notebookTab);
  useEffect(() => {
    if (wanted) setTab(wanted as Tab);
  }, [wanted]);
  if (!rt) return null;
  const w = rt.world;
  const all = readingsOf(w);
  const of = (k: Reading07['kind']) => all.filter((r) => r.kind === k);
  const name = (id: string) => p07NameOf(w, id);
  const rlabel = (r: Reading07) => `${r.id} · ${name(r.targetId === 'det01pad' ? 'det01' : r.targetId)} · ${r.kind === 'observation' ? t('p7.nb.phases', { n: r.value }) : `${Number.isFinite(r.value) ? fmt(r.value, decOf(r)) : t('p7.instr.overRange')} ${r.unit}`}${warnOf(r)}`;

  /** Celda importable: valor + incertidumbre + selector de lectura (§12). */
  const cell = (label: string, e: Entry, path: string, set: (n: P07Notebook, patch: Partial<Entry>) => void, opts: Reading07[] = [], withU = true) => (
    <div className="cell">
      <input aria-label={label} type="text" inputMode="decimal" value={e.value} readOnly={!!e.readingId} onChange={(ev) => setNb((n) => set(n, { value: ev.target.value, readingId: null }), path, e.value, ev.target.value)} />
      {withU && <input aria-label={`± ${label}`} className="u" type="text" inputMode="decimal" value={e.uncertainty} placeholder="±" onChange={(ev) => setNb((n) => set(n, { uncertainty: ev.target.value }), `${path}.u`, e.uncertainty, ev.target.value)} />}
      {opts.length > 0 && (
        <select aria-label={`${t('p7.nb.import')} — ${label}`} value={e.readingId ?? ''} onChange={(ev) => {
          const r = opts.find((x) => x.id === ev.target.value);
          if (!r) return setNb((n) => set(n, { readingId: null }), path, e.value, e.value);
          setNb((n) => set(n, { value: fmt(r.value, decOf(r)), uncertainty: fmt(r.standardUncertainty, decOf(r) + 1), readingId: r.id }), path, e.value, fmt(r.value, decOf(r)));
        }}>
          <option value="">📥</option>
          {opts.map((r) => <option key={r.id} value={r.id}>{rlabel(r)}</option>)}
        </select>
      )}
    </div>
  );
  const pickReading = (label: string, value: string | null, opts: Reading07[], path: string, set: (n: P07Notebook, id: string | null) => void) => (
    <select aria-label={label} value={value ?? ''} onChange={(ev) => setNb((n) => set(n, ev.target.value || null), path, value ?? '', ev.target.value)}>
      <option value="">📥</option>
      {opts.map((r) => <option key={r.id} value={r.id}>{rlabel(r)}</option>)}
    </select>
  );
  const text = (path: string, value: string, set: (n: P07Notebook, v: string) => void, area = true, labelKey?: string) => {
    const idf = `p7-${path}`;
    const on = (v: string) => setNb((n) => set(n, v), path, value, v);
    return (
      <div className="field" key={path}>
        <label htmlFor={idf}>{t(labelKey ?? `p7.nb.f.${path}`)}</label>
        {area ? <textarea id={idf} value={value} onChange={(e) => on(e.target.value)} /> : <input id={idf} type="text" value={value} onChange={(e) => on(e.target.value)} />}
      </div>
    );
  };
  const choose = <T extends string>(label: string, value: T, options: readonly T[], path: string, set: (n: P07Notebook, v: T) => void, keyPrefix: string) => (
    <select aria-label={label} value={value} onChange={(e) => setNb((n) => set(n, e.target.value as T), path, value, e.target.value)}>
      <option value="">{t('nb.choose')}</option>
      {options.filter(Boolean).map((o) => <option key={o} value={o}>{t(`${keyPrefix}.${o}`)}</option>)}
    </select>
  );

  // Gráfico κ–C: solo pares con lectura importada y concentración escrita, del mismo soluto (§12.4).
  const plotRows = (['strongA', 'strongB'] as const)
    .map((k) => ({ k, row: nb.tableD[k], r: nb.tableD[k].kappa.readingId ? w.readings[nb.tableD[k].kappa.readingId!] : null }))
    .filter((x) => x.r && x.r.valid && Number.isFinite(parseNum(x.row.conc.value)))
    .map((x) => ({ k: x.k, c: parseNum(x.row.conc.value), us: kappaIn(x.r!, 'µS/cm') }));
  const cMax = Math.max(1e-6, ...plotRows.map((p) => p.c));
  const kMax = Math.max(1e-6, ...plotRows.map((p) => p.us));

  return (
    <aside className="drawer" aria-label={t('nb.title')}>
      <div className="drawer-head">
        <h2>📓 {t('nb.title')}</h2>
        <span style={{ flex: 1 }} />
        <button className="btn small ghost" onClick={toggle} aria-label={t('common.close')}>×</button>
      </div>
      <div className="drawer-body">
        <div className="tabs" role="tablist">
          {(['A', 'B', 'C', 'D', 'E', 'F', 'analysis', 'log'] as Tab[]).map((k) => (
            <button key={k} role="tab" className="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{t(`p7.nb.tab.${k}`)}</button>
          ))}
        </div>
        {savedAt && <span className="hint">{t('nb.saved', { time: new Date(savedAt).toLocaleTimeString() })}</span>}

        {tab === 'A' && (
          <section aria-label={t('p7.nb.tableA')} style={{ display: 'grid', gap: '0.6rem' }}>
            <h3>{t('p7.nb.tableA')}</h3>
            <p className="hint">{t('p7.nb.tableAHelp')}</p>
            {nb.tableA.map((row, i) => {
              // La hipótesis queda «fechada» al completarse (tiempo de simulación), antes o después de los ensayos.
              const upd = (patch: Partial<typeof row>) => setNb((n) => {
                Object.assign(n.tableA[i], patch);
                const r = n.tableA[i];
                if (r.savedAtS === null && r.sample && r.conducts && r.water) r.savedAtS = w.timeS;
              }, `A.${i}`, '', JSON.stringify(patch));
              return (
                <fieldset key={i} className="field">
                  <legend>{t('p7.nb.hypothesis', { n: i + 1 })}{row.savedAtS !== null && <span className="hint"> · {t('p7.nb.savedAt', { s: fmt(row.savedAtS, 0) })}</span>}</legend>
                  <select aria-label={t('p7.nb.col.sample')} value={row.sample} onChange={(e) => upd({ sample: e.target.value })}>
                    <option value="">{t('nb.choose')}</option>
                    {SAMPLES_A.filter((x) => w.objects[x]).map((x) => <option key={x} value={x}>{name(x)}</option>)}
                  </select>
                  <input aria-label={t('p7.nb.col.appearance')} placeholder={t('p7.nb.col.appearance')} value={row.appearance} onChange={(e) => upd({ appearance: e.target.value })} />
                  <select aria-label={t('p7.nb.col.conducts')} value={row.conducts} onChange={(e) => upd({ conducts: e.target.value as typeof row.conducts })}>
                    <option value="">{t('p7.nb.col.conducts')}</option>
                    {(['yes', 'no', 'unsure'] as const).map((x) => <option key={x} value={x}>{t(`p7.tri.${x}`)}</option>)}
                  </select>
                  <input aria-label={t('p7.nb.col.why')} placeholder={t('p7.nb.col.why')} value={row.conductsWhy} onChange={(e) => upd({ conductsWhy: e.target.value })} />
                  <select aria-label={t('p7.nb.col.water')} value={row.water} onChange={(e) => upd({ water: e.target.value as typeof row.water })}>
                    <option value="">{t('p7.nb.col.water')}</option>
                    {(['homogeneous', 'twoPhases', 'unsure'] as const).map((x) => <option key={x} value={x}>{t(`p7.waterPred.${x}`)}</option>)}
                  </select>
                  <input aria-label={t('p7.nb.col.evidence')} placeholder={t('p7.nb.col.evidence')} value={row.evidence} onChange={(e) => upd({ evidence: e.target.value })} />
                </fieldset>
              );
            })}
          </section>
        )}

        {tab === 'B' && (
          <section aria-label={t('p7.nb.tableB')} style={{ display: 'grid', gap: '0.6rem' }}>
            <h3>{t('p7.nb.tableB')}</h3>
            <p className="hint">{t('p7.nb.tableBHelp')}</p>
            {ROWS_B.map((k: RowBKey) => {
              const row = nb.tableB[k];
              const obs = row.observationId ? w.readings[row.observationId] : null;
              return (
                <fieldset key={k} className="field">
                  <legend>{k}</legend>
                  {pickReading(`${k} — ${t('p7.nb.col.observation')}`, row.observationId, of('observation'), `B.${k}.obs`, (n, id) => {
                    n.tableB[k].observationId = id;
                    const r = id ? w.readings[id] : null;
                    if (r) {
                      n.tableB[k].tubeId = r.targetId;
                      n.tableB[k].solvent = r.snapshot.solvents?.length === 1 ? (r.snapshot.solvents[0] as 'water' | 'heptane') : n.tableB[k].solvent;
                    }
                  })}
                  {obs && <span className="hint">{t('p7.nb.obsSummary', { phases: obs.snapshot.phases ?? 0, s: fmt(obs.snapshot.sinceAddS ?? 0, 0), solid: (obs.snapshot.undissolvedG ?? 0) > 0.002 ? t('p7.nb.solidYes') : t('p7.nb.solidNo') })}{obs.qualityFlags.length ? ` · ${obs.qualityFlags.map((q) => t(`p7.quality.${q}`)).join(', ')}` : ''}</span>}
                  {choose(`${k} — ${t('p7.nb.col.solvent')}`, row.solvent, ['water', 'heptane'] as const, `B.${k}.solvent`, (n, v) => { n.tableB[k].solvent = v; }, 'p7.solvent')}
                  {cell(`${k} — ${t('p7.nb.col.volume')}`, row.volume, `B.${k}.volume`, (n, p) => Object.assign(n.tableB[k].volume, p), of('volume'))}
                  {cell(`${k} — ${t('p7.nb.col.amount')}`, row.amount, `B.${k}.amount`, (n, p) => Object.assign(n.tableB[k].amount, p), of('mass'))}
                  <input aria-label={`${k} — ${t('p7.nb.col.observationText')}`} placeholder={t('p7.nb.col.observationText')} value={row.observationText} onChange={(e) => setNb((n) => { n.tableB[k].observationText = e.target.value; }, `B.${k}.text`, row.observationText, e.target.value)} />
                  {choose(`${k} — ${t('p7.nb.col.interpretation')}`, row.interpretation, ['soluble', 'partial', 'insoluble', 'miscible', 'immiscible'] as const, `B.${k}.interp`, (n, v) => { n.tableB[k].interpretation = v; }, 'p7.interp')}
                </fieldset>
              );
            })}
          </section>
        )}

        {tab === 'C' && (
          <section aria-label={t('p7.nb.tableC')} style={{ display: 'grid', gap: '0.6rem' }}>
            <h3>{t('p7.nb.tableC')}</h3>
            <p className="hint">{t('p7.nb.tableCHelp')}</p>
            {ROWS_C.map((k: RowCKey) => {
              const row = nb.tableC[k];
              const r = row.readingId ? w.readings[row.readingId] : null;
              return (
                <fieldset key={k} className="field">
                  <legend>{t(`p7.nb.rowC.${k}`)}</legend>
                  {pickReading(`${t(`p7.nb.rowC.${k}`)} — ${t('p7.nb.col.reading')}`, row.readingId, of('current'), `C.${k}.r`, (n, id) => {
                    n.tableC[k].readingId = id;
                    const rr = id ? w.readings[id] : null;
                    if (rr) n.tableC[k].specimen = rr.targetId;
                  })}
                  {r && <span className={r.valid ? 'ok' : 'bad'}>{r.valid ? t('p7.nb.valid') : t('p7.nb.invalid')}{r.snapshot.path && r.snapshot.path !== 'iso' ? ` · ${t(`p7.path.${r.snapshot.path}`)}` : ''}</span>}
                  {choose(`${t(`p7.nb.rowC.${k}`)} — ${t('p7.nb.col.surface')}`, row.surface, ['dry', 'wet'] as const, `C.${k}.surface`, (n, v) => { n.tableC[k].surface = v; }, 'p7.surface')}
                  {choose(`${t(`p7.nb.rowC.${k}`)} — ${t('p7.nb.col.conducts')}`, row.conducts, ['yes', 'no', 'unsure'] as const, `C.${k}.conducts`, (n, v) => { n.tableC[k].conducts = v; }, 'p7.tri')}
                  <input aria-label={`${t(`p7.nb.rowC.${k}`)} — ${t('p7.nb.col.explanation')}`} placeholder={t('p7.nb.col.explanation')} value={row.explanation} onChange={(e) => setNb((n) => { n.tableC[k].explanation = e.target.value; }, `C.${k}.exp`, row.explanation, e.target.value)} />
                </fieldset>
              );
            })}
          </section>
        )}

        {tab === 'D' && (
          <section aria-label={t('p7.nb.tableD')} style={{ display: 'grid', gap: '0.6rem' }}>
            <h3>{t('p7.nb.tableD')}</h3>
            <p className="hint">{t('p7.nb.tableDHelp')}</p>
            {ROWS_D.map((k: RowDKey) => {
              const row = nb.tableD[k];
              const kr = row.kappa.readingId ? w.readings[row.kappa.readingId] : null;
              return (
                <fieldset key={k} className="field">
                  <legend>{t(`p7.nb.rowD.${k}`)}</legend>
                  {k !== 'blank' && cell(`${t(`p7.nb.rowD.${k}`)} — ${t('p7.nb.col.mass')}`, row.mass, `D.${k}.mass`, (n, p) => Object.assign(n.tableD[k].mass, p), of('mass'))}
                  {k !== 'blank' && cell(`${t(`p7.nb.rowD.${k}`)} — ${t('p7.nb.col.finalVolume')}`, row.volume, `D.${k}.vol`, (n, p) => Object.assign(n.tableD[k].volume, p), of('volume'))}
                  {k !== 'blank' && cell(`${t(`p7.nb.rowD.${k}`)} — ${t('p7.nb.col.conc')}`, row.conc, `D.${k}.conc`, (n, p) => Object.assign(n.tableD[k].conc, p))}
                  {cell(`${t(`p7.nb.rowD.${k}`)} — κ`, row.kappa, `D.${k}.kappa`, (n, p) => Object.assign(n.tableD[k].kappa, p), of('conductivity'))}
                  {choose(`${t(`p7.nb.rowD.${k}`)} — ${t('p7.nb.col.unit')}`, row.kappaUnit, ['µS/cm', 'mS/cm', 'S/m'] as const, `D.${k}.unit`, (n, v) => { n.tableD[k].kappaUnit = v; }, 'p7.unit')}
                  <span className="cell">
                    <input aria-label={`${t(`p7.nb.rowD.${k}`)} — ${t('p7.nb.col.temp')}`} placeholder="°C" value={row.temp} onChange={(e) => setNb((n) => { n.tableD[k].temp = e.target.value; }, `D.${k}.temp`, row.temp, e.target.value)} />
                    {kr?.snapshot.tempC !== undefined && <button className="btn small ghost" onClick={() => setNb((n) => { n.tableD[k].temp = fmt(kr.snapshot.tempC!, 1); }, `D.${k}.temp`, row.temp, fmt(kr.snapshot.tempC!, 1))}>📥 °C</button>}
                  </span>
                </fieldset>
              );
            })}
            <h4>{t('p7.nb.plot')}</h4>
            {plotRows.length >= 2 ? (
              <>
                <svg viewBox="0 0 220 140" width="100%" role="img" aria-label={t('p7.nb.plotAria')}>
                  <line x1="30" y1="120" x2="210" y2="120" stroke="#555" />
                  <line x1="30" y1="10" x2="30" y2="120" stroke="#555" />
                  <text x="120" y="136" fontSize="9" textAnchor="middle">C (mol/L)</text>
                  <text x="8" y="65" fontSize="9" transform="rotate(-90 8 65)" textAnchor="middle">κ (µS/cm)</text>
                  {plotRows.map((p) => <circle key={p.k} cx={30 + (p.c / cMax) * 170} cy={120 - (p.us / kMax) * 100} r="3.5" fill="#1565c0" />)}
                </svg>
                <table className="data">
                  <caption className="sr-only">{t('p7.nb.plotAria')}</caption>
                  <thead><tr><th>{t('p7.nb.col.row')}</th><th>C (mol/L)</th><th>κ (µS/cm)</th></tr></thead>
                  <tbody>{plotRows.map((p) => <tr key={p.k}><td>{t(`p7.nb.rowD.${p.k}`)}</td><td>{fmt(p.c, 4)}</td><td>{fmt(p.us, 0)}</td></tr>)}</tbody>
                </table>
              </>
            ) : <p className="hint">{t('p7.nb.plotNeeds')}</p>}
          </section>
        )}

        {tab === 'E' && (
          <section aria-label={t('p7.nb.tableE')} style={{ display: 'grid', gap: '0.6rem' }}>
            <h3>{t('p7.nb.tableE')}</h3>
            <p className="hint">{t('p7.nb.tableEHelp')}</p>
            {(['X', 'Y'] as const).map((k) => {
              const row = nb.tableE[k];
              const code = w.unknowns[k]?.code ?? k;
              const tests = ['solidContact', 'mixWater', 'mixApolar', 'solutionKappa', 'pureKappa', 'appearance'] as const;
              return (
                <fieldset key={k} className="field">
                  <legend>{t('p7.nb.unknown', { code })}</legend>
                  {choose(`${code} — ${t('p7.nb.col.test1')}`, row.test1, tests, `E.${k}.t1`, (n, v) => { n.tableE[k].test1 = v; }, 'p7.test')}
                  <input aria-label={`${code} — ${t('p7.nb.col.reason')} 1`} placeholder={t('p7.nb.col.reason')} value={row.reason1} onChange={(e) => setNb((n) => { n.tableE[k].reason1 = e.target.value; }, `E.${k}.r1`, row.reason1, e.target.value)} />
                  {pickReading(`${code} — ${t('p7.nb.col.result')} 1`, row.result1, all, `E.${k}.res1`, (n, id) => { n.tableE[k].result1 = id; })}
                  {choose(`${code} — ${t('p7.nb.col.test2')}`, row.test2, tests, `E.${k}.t2`, (n, v) => { n.tableE[k].test2 = v; }, 'p7.test')}
                  <input aria-label={`${code} — ${t('p7.nb.col.reason')} 2`} placeholder={t('p7.nb.col.reason')} value={row.reason2} onChange={(e) => setNb((n) => { n.tableE[k].reason2 = e.target.value; }, `E.${k}.r2`, row.reason2, e.target.value)} />
                  {pickReading(`${code} — ${t('p7.nb.col.result')} 2`, row.result2, all, `E.${k}.res2`, (n, id) => { n.tableE[k].result2 = id; })}
                  {choose(`${code} — ${t('p7.nb.col.classification')}`, row.classification, ['ionic', 'molecular', 'metallic', 'covalentNetwork', 'undetermined'] as const, `E.${k}.cls`, (n, v) => { n.tableE[k].classification = v; }, 'p7.class')}
                  {text(`E.${k}.limitation`, row.limitation, (n, v) => { n.tableE[k].limitation = v; }, true, 'p7.nb.col.limitation')}
                </fieldset>
              );
            })}
          </section>
        )}

        {tab === 'F' && (
          <section aria-label={t('p7.nb.tableF')} style={{ display: 'grid', gap: '0.6rem' }}>
            <h3>{t('p7.nb.tableF')}</h3>
            {ROWS_F.map((k: RowFKey) => {
              const row = nb.tableF[k];
              return (
                <fieldset key={k} className="field">
                  <legend>{t(`p7.nb.rowF.${k}`)}</legend>
                  {text(`F.${k}.explanation`, row.explanation, (n, v) => { n.tableF[k].explanation = v; }, true, 'p7.nb.col.microExplanation')}
                  {choose(`${t(`p7.nb.rowF.${k}`)} — ${t('p7.nb.col.exception')}`, row.exception, ['yes', 'no', 'unsure'] as const, `F.${k}.exc`, (n, v) => { n.tableF[k].exception = v; }, 'p7.tri')}
                  {choose(`${t(`p7.nb.rowF.${k}`)} — ${t('p7.nb.col.confidence')}`, row.confidence, ['high', 'medium', 'low'] as const, `F.${k}.conf`, (n, v) => { n.tableF[k].confidence = v; }, 'p7.conf')}
                  <input aria-label={`${t(`p7.nb.rowF.${k}`)} — ${t('p7.nb.col.why')}`} placeholder={t('p7.nb.col.why')} value={row.why} onChange={(e) => setNb((n) => { n.tableF[k].why = e.target.value; }, `F.${k}.why`, row.why, e.target.value)} />
                </fieldset>
              );
            })}
          </section>
        )}

        {tab === 'analysis' && (
          <section aria-label={t('p7.nb.tab.analysis')} style={{ display: 'grid', gap: '0.6rem' }}>
            <h3>{t('p7.nb.questions')}</h3>
            {QUESTIONS.map((q) => text(`analysis.${q}`, nb.analysis[q], (n, v) => { n.analysis[q] = v; }))}
            {text('conclusion', nb.conclusion, (n, v) => { n.conclusion = v; })}
          </section>
        )}

        {tab === 'log' && (
          <section aria-label={t('p7.nb.tab.log')}>
            <h3>{t('p7.nb.readings')}</h3>
            <ul className="fb-list">
              {all.map((r) => (
                <li key={r.id}>
                  <span className={r.valid ? 'ok' : 'bad'}>{r.valid ? '✓' : '✗'}</span> {rlabel(r)} · {fmt(r.t, 0)} s
                  {r.qualityFlags.length > 0 && <span className="hint"> · {r.qualityFlags.map((q) => t(`p7.quality.${q}`)).join(', ')}</span>}
                </li>
              ))}
            </ul>
            <h3>{t('p4.nb.history', { n: nb.history.length })}</h3>
            <ul className="fb-list" style={{ maxHeight: '14rem', overflow: 'auto' }}>
              {[...nb.history].reverse().slice(0, 80).map((h, i) => <li key={i}><span className="hint">{fmt(h.t, 0)} s</span> {h.field}: «{h.from.slice(0, 40)}» → «{h.to.slice(0, 40)}»</li>)}
            </ul>
            <div className="row">
              <button className="btn small" onClick={() => downloadJson(`libreta-p7-${attemptId}.json`, { attemptId, notebook: nb, readings: w.readings })}>{t('review.export')}</button>
              <button className="btn small ghost" onClick={() => window.print()}>{t('p10.nb.print')}</button>
            </div>
          </section>
        )}
      </div>
    </aside>
  );
}
