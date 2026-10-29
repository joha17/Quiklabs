import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useB05 } from './store';
import type { LabObservation } from '../../simulation/optical-world/types';
import type { EnzReading } from '../../simulation/enz-world/types';
import { QUESTIONS_B05, TUBE_LABELS_B05, type B05Notebook } from '../../practices/practice-b05/notebook';
import { downloadJson } from '../persistence';
import { b05NameOf } from './describe';

type Tab = 'prep' | 'conditions' | 'catalase' | 'rate' | 'factors' | 'amylase' | 'adh' | 'micro' | 'questions' | 'log';

const fmt = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d).replace('.', ',') : '—');

/**
 * Libreta digital de B05 (§12): preparaciones P1–P3 (masa, volumen y temperatura importados), condiciones de cada
 * tubo, controles, series de gas del colector, tasa inicial con moles de O₂ y balance, tratamientos, alícuotas de
 * amilasa (Lugol y Benedict con su tiempo), glucosilos, ADH (si está asignada), gránulos de almidón al microscopio,
 * diez preguntas y registro. Las celdas de medida IMPORTAN una lectura del propio intento; valor, unidad y hora
 * vienen del registro, nunca se tipean.
 */
export function NotebookPanelB05() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('prep');
  const nb = useB05((s) => s.notebook);
  const setNb = useB05((s) => s.setNotebook);
  const toggle = useB05((s) => s.toggleNotebook);
  const savedAt = useB05((s) => s.savedAt);
  const dispatch = useB05((s) => s.dispatch);
  useB05((s) => s.version);
  const rt = useB05((s) => s.runtime);
  const attemptId = useB05((s) => s.attemptId);
  const wanted = useB05((s) => s.notebookTab);
  useEffect(() => {
    if (wanted) setTab(wanted as Tab);
  }, [wanted]);
  if (!rt) return null;
  const w = rt.world;
  const E = w.enz;
  const tabs: Tab[] = ['prep', 'conditions', 'catalase', 'rate', 'factors', 'amylase', ...(E.adhEnabled ? (['adh'] as Tab[]) : []), 'micro', 'questions', 'log'];
  const readings = E.readingOrder.map((id) => E.readings[id]);
  const compound = w.observationOrder.map((id) => w.observations[id]).filter((o) => o.instrument === 'compound');
  const target = (id: string) => {
    const [obj, sub] = id.split(':');
    const tid = sub ?? obj;
    const tube = E.tubes[tid];
    const base = sub ? `${b05NameOf(w, obj)} — ${b05NameOf(w, sub)}` : b05NameOf(w, obj);
    return tube?.label ? `${base} «${tube.label}»` : base;
  };
  const digits = (r: EnzReading) => (r.unit === 'A' ? 3 : r.unit === 'g' ? 2 : r.unit === 'mL' ? 1 : r.unit === 's' ? 0 : 1);
  const rlabel = (r: EnzReading) =>
    `${r.id} · ${t(`b05.instrument.${r.instrument}`)} · ${target(r.targetId)} · ${r.unit ? `${fmt(r.value, digits(r))} ${r.unit}` : ''}${r.quality ? ` (${r.quality.split('|').map((q) => q.split(':').map((x) => t(`b05.quality.${x}`, { defaultValue: x })).join(' ')).join(', ')})` : ''} · ${r.clockS !== undefined && r.clockS !== null ? `⏱ ${fmt(r.clockS, 0)} s` : `${fmt(r.t, 0)} s`}`;
  const olabel = (o: LabObservation) => `${o.id} · ${b05NameOf(w, o.slideId ?? o.specimenId)} · ${o.objectiveX ?? '—'}X${o.isObservationValid ? '' : ' ✗'}`;

  const text = (path: string, value: string, set: (n: B05Notebook, v: string) => void, area = true, labelKey?: string) => {
    const idf = `b05-${path.replace(/[^a-zA-Z0-9]/g, '_')}`;
    return (
      <div className="field" key={path}>
        <label htmlFor={idf}>{t(labelKey ?? `b05.nb.f.${path}`)}</label>
        {area ? <textarea id={idf} value={value} onChange={(e) => setNb((n) => set(n, e.target.value), path, value, e.target.value)} /> : <input id={idf} type="text" inputMode="decimal" value={value} onChange={(e) => setNb((n) => set(n, e.target.value), path, value, e.target.value)} />}
      </div>
    );
  };
  const small = (label: string, value: string, path: string, set: (n: B05Notebook, v: string) => void) => (
    <input aria-label={label} type="text" inputMode="decimal" value={value} onChange={(e) => setNb((n) => set(n, e.target.value), path, value, e.target.value)} />
  );
  const choose = <T extends string>(label: string, value: T, options: readonly T[], path: string, set: (n: B05Notebook, v: T) => void, keyPrefix: string | null) => (
    <select aria-label={label} value={value} onChange={(e) => setNb((n) => set(n, e.target.value as T), path, value, e.target.value)}>
      <option value="">{t('nb.choose')}</option>
      {options.filter(Boolean).map((o) => <option key={o} value={o}>{keyPrefix ? t(`${keyPrefix}.${o}`) : o}</option>)}
    </select>
  );
  const field = (labelKey: string, node: React.ReactNode) => <div className="field" key={labelKey}><label>{t(labelKey)}</label>{node}</div>;
  const pickReading = (label: string, value: string | null, opts: EnzReading[], path: string, set: (n: B05Notebook, id: string | null) => void) => (
    <select aria-label={label} value={value ?? ''} onChange={(e) => setNb((n) => set(n, e.target.value || null), path, value ?? '', e.target.value)}>
      <option value="">📥 {t('b05.nb.import')}</option>
      {opts.map((r) => <option key={r.id} value={r.id}>{rlabel(r)}</option>)}
    </select>
  );
  const shown = (id: string | null) => {
    const r = id ? E.readings[id] : null;
    return r ? `${r.unit ? `${fmt(r.value, digits(r))} ${r.unit}` : ''}${r.quality ? ` ${r.quality}` : ''}` : '—';
  };
  const of = (...inst: EnzReading['instrument'][]) => readings.filter((r) => inst.includes(r.instrument));
  const labels = [...TUBE_LABELS_B05];

  return (
    <aside className="drawer" aria-label={t('nb.title')}>
      <div className="drawer-head">
        <h2>📓 {t('nb.title')}</h2>
        <span style={{ flex: 1 }} />
        {savedAt && <span className="hint">{t('nb.saved', { time: new Date(savedAt).toLocaleTimeString() })}</span>}
        <button className="btn small ghost" onClick={toggle} aria-label={t('common.close')}>×</button>
      </div>
      <div className="drawer-body">
        <div className="tabs" role="tablist">
          {tabs.map((k) => <button key={k} role="tab" className="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{t(`b05.nb.tab.${k}`)}</button>)}
        </div>

        {tab === 'prep' && (
          <section aria-label={t('b05.nb.tablePrep')} style={{ display: 'grid', gap: '0.6rem' }}>
            <h3>{t('b05.nb.hypothesis')}</h3>
            {text('hyp.catalase', nb.hypothesis.catalase, (n, v) => { n.hypothesis.catalase = v; })}
            {text('hyp.amylase', nb.hypothesis.amylase, (n, v) => { n.hypothesis.amylase = v; })}
            {field('b05.nb.f.hyp.heat', choose(t('b05.nb.f.hyp.heat'), nb.hypothesis.heat, ['lowers', 'raises', 'none'] as const, 'hyp.heat', (n, v) => { n.hypothesis.heat = v; }, 'b05.heat'))}
            <h3>{t('b05.nb.tablePrep')}</h3>
            <p className="hint">{t('b05.nb.prepHelp')}</p>
            <table className="nb-table">
              <tbody>
                {([
                  ['p1Mass', 'balance'], ['p1Water', 'scale'], ['p1Temp', 'thermo'], ['p2Water', 'scale'], ['p2Temp', 'thermo'], ['p3Mass', 'balance'], ['p3Water', 'scale'],
                ] as const).map(([k, inst]) => (
                  <tr key={k}>
                    <td>{t(`b05.nb.f.prep.${k}`)}</td>
                    <td>{pickReading(t(`b05.nb.f.prep.${k}`), nb.prep[k], of(inst), `prep.${k}`, (n, id) => { n.prep[k] = id; })}</td>
                    <td>{shown(nb.prep[k])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {tab === 'conditions' && (
          <section aria-label={t('b05.nb.tableConditions')} style={{ display: 'grid', gap: '0.6rem' }}>
            <h3>{t('b05.nb.tableConditions')}</h3>
            <div className="table-scroll" tabIndex={0} role="region" aria-label={t('b05.nb.tableConditions')}>
              <table className="nb-table">
                <thead><tr><th>{t('b05.nb.col.tube')}</th><th>{t('b05.nb.col.mass')}</th><th>{t('b05.nb.col.temp')}</th><th>{t('b05.nb.col.ph')}</th><th>{t('b05.nb.col.clock')}</th></tr></thead>
                <tbody>
                  {nb.conditions.map((r, i) => (
                    <tr key={i}>
                      <td>{choose(`${t('b05.nb.col.tube')} ${i + 1}`, r.label, labels, `cond.${i}.l`, (n, v) => { n.conditions[i].label = v; }, null)}</td>
                      <td>{pickReading(`${t('b05.nb.col.mass')} ${i + 1}`, r.massReadingId, of('balance'), `cond.${i}.m`, (n, id) => { n.conditions[i].massReadingId = id; })}</td>
                      <td>{pickReading(`${t('b05.nb.col.temp')} ${i + 1}`, r.tempReadingId, of('thermo'), `cond.${i}.t`, (n, id) => { n.conditions[i].tempReadingId = id; })}</td>
                      <td>{pickReading(`${t('b05.nb.col.ph')} ${i + 1}`, r.phReadingId, of('ph'), `cond.${i}.p`, (n, id) => { n.conditions[i].phReadingId = id; })}</td>
                      <td>{pickReading(`${t('b05.nb.col.clock')} ${i + 1}`, r.clockReadingId, of('clock'), `cond.${i}.h`, (n, id) => { n.conditions[i].clockReadingId = id; })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h3>{t('b05.nb.tableControls')}</h3>
            {(['blank', 'active', 'noEnzyme'] as const).map((k) => field(`b05.nb.f.ctrl.${k}`, choose(t(`b05.nb.f.ctrl.${k}`), nb.controls[k], labels, `ctrl.${k}`, (n, v) => { n.controls[k] = v; }, null)))}
          </section>
        )}

        {tab === 'catalase' && (
          <section aria-label={t('b05.nb.tableGas')} style={{ display: 'grid', gap: '0.6rem' }}>
            <h3>{t('b05.nb.tableGas')}</h3>
            <p className="hint">{t('b05.nb.gasHelp')}</p>
            <div className="table-scroll" tabIndex={0} role="region" aria-label={t('b05.nb.tableGas')}>
              <table className="nb-table">
                <thead><tr><th>{t('b05.nb.col.tube')}</th>{[0, 1, 2, 3].map((j) => <th key={j}>{t('b05.nb.col.point', { n: j + 1 })}</th>)}</tr></thead>
                <tbody>
                  {nb.gas.map((g, i) => (
                    <tr key={i}>
                      <td>{choose(`${t('b05.nb.col.tube')} ${i + 1}`, g.label, labels, `gas.${i}.l`, (n, v) => { n.gas[i].label = v; }, null)}</td>
                      {g.readingIds.map((rid, j) => (
                        <td key={j}>
                          {pickReading(`${g.label} ${j + 1}`, rid, of('collector'), `gas.${i}.${j}`, (n, id) => { n.gas[i].readingIds[j] = id; })}
                          <div className="hint">{shown(rid)}</div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {tab === 'rate' && (
          <section aria-label={t('b05.nb.tableRate')} style={{ display: 'grid', gap: '0.6rem' }}>
            <h3>{t('b05.nb.tableRate')}</h3>
            <p className="hint">{t('b05.nb.rateHelp', { t: w.params.enz!.ambientK - 273.15, p: w.params.enz!.pressureKPa })}</p>
            {field('b05.nb.f.rate.label', choose(t('b05.nb.f.rate.label'), nb.rate.label, labels, 'rate.label', (n, v) => { n.rate.label = v; }, null))}
            <div className="nb-grid">
              {(['fromS', 'toS', 'rateMlS', 'rateMlMin', 'nO2Mmol', 'predictedO2Mmol', 'ratePerG', 'uncertaintyMl'] as const).map((k) => (
                <div className="field" key={k}>
                  <label htmlFor={`b05-rate-${k}`}>{t(`b05.nb.f.rate.${k}`)}</label>
                  {small(t(`b05.nb.f.rate.${k}`), nb.rate[k], `rate.${k}`, (n, v) => { n.rate[k] = v; })}
                </div>
              ))}
            </div>
            {field('b05.nb.f.rate.normUnit', choose(t('b05.nb.f.rate.normUnit'), nb.rate.normUnit, ['gTissue', 'mgEnzyme'] as const, 'rate.normUnit', (n, v) => { n.rate.normUnit = v; }, 'b05.normUnit'))}
            {field('b05.nb.f.rate.ventedIncluded', choose(t('b05.nb.f.rate.ventedIncluded'), nb.rate.ventedIncluded, ['yes', 'no'] as const, 'rate.vented', (n, v) => { n.rate.ventedIncluded = v; }, 'b05.yesno'))}
            {field('b05.nb.f.rate.attribution', choose(t('b05.nb.f.rate.attribution'), nb.rate.attribution, ['catalysis', 'capture'] as const, 'rate.attr', (n, v) => { n.rate.attribution = v; }, 'b05.attribution'))}
          </section>
        )}

        {tab === 'factors' && (
          <section aria-label={t('b05.nb.tableFactors')} style={{ display: 'grid', gap: '0.6rem' }}>
            <h3>{t('b05.nb.tableFactors')}</h3>
            {text('fac.heatApparent', nb.factors.heatApparent, (n, v) => { n.factors.heatApparent = v; })}
            {field('b05.nb.f.fac.recovered', choose(t('b05.nb.f.fac.recovered'), nb.factors.recovered, ['yes', 'no'] as const, 'fac.rec', (n, v) => { n.factors.recovered = v; }, 'b05.yesno'))}
            {field('b05.nb.f.fac.attribution', choose(t('b05.nb.f.fac.attribution'), nb.factors.attribution, ['ph', 'temperature', 'both'] as const, 'fac.attr', (n, v) => { n.factors.attribution = v; }, 'b05.factor'))}
          </section>
        )}

        {tab === 'amylase' && (
          <section aria-label={t('b05.nb.tableAmylase')} style={{ display: 'grid', gap: '0.6rem' }}>
            <h3>{t('b05.nb.tableAmylase')}</h3>
            <p className="hint">{t('b05.nb.amylaseHelp')}</p>
            <div className="table-scroll" tabIndex={0} role="region" aria-label={t('b05.nb.tableAmylase')}>
              <table className="nb-table">
                <thead><tr><th>{t('b05.nb.col.tube')}</th><th>{t('b05.nb.col.reading')}</th><th>{t('b05.nb.col.timeS')}</th></tr></thead>
                <tbody>
                  {nb.amylase.rows.map((r, i) => (
                    <tr key={r.label}>
                      <td>{r.label}</td>
                      <td>{pickReading(`${t('b05.nb.col.reading')} ${r.label}`, r.readingId, of('eye'), `amy.${i}.r`, (n, id) => { n.amylase.rows[i].readingId = id; })}<div className="hint">{shown(r.readingId)}</div></td>
                      <td>{small(`${t('b05.nb.col.timeS')} ${r.label}`, r.timeS, `amy.${i}.t`, (n, v) => { n.amylase.rows[i].timeS = v; })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {field('b05.nb.f.amy.benedictMeans', choose(t('b05.nb.f.amy.benedictMeans'), nb.amylase.benedictMeans, ['reducing', 'glucose'] as const, 'amy.bm', (n, v) => { n.amylase.benedictMeans = v; }, 'b05.benedictMeans'))}
            {field('b05.nb.f.amy.lugolNegative', choose(t('b05.nb.f.amy.lugolNegative'), nb.amylase.lugolNegative, ['complete', 'notComplete'] as const, 'amy.ln', (n, v) => { n.amylase.lugolNegative = v; }, 'b05.lugolNegative'))}
            <h3>{t('b05.nb.tableGlucosyl')}</h3>
            <p className="hint">{t('b05.nb.glucosylHelp')}</p>
            {text('gly.initialMmol', nb.glucosyl.initialMmol, (n, v) => { n.glucosyl.initialMmol = v; }, false)}
            {text('gly.note', nb.glucosyl.note, (n, v) => { n.glucosyl.note = v; })}
          </section>
        )}

        {tab === 'adh' && E.adhEnabled && (
          <section aria-label={t('b05.nb.tableAdh')} style={{ display: 'grid', gap: '0.6rem' }}>
            <h3>{t('b05.nb.tableAdh')}</h3>
            <p className="hint">{t('b05.nb.adhHelp', { eps: w.params.enz!.uv.epsilon })}</p>
            {field('b05.nb.f.adh.blank', pickReading(t('b05.nb.f.adh.blank'), nb.adh.blankReadingId, of('uv'), 'adh.blank', (n, id) => { n.adh.blankReadingId = id; }))}
            {nb.adh.rows.map((r, i) => field(`b05.nb.f.adh.row${i}`, pickReading(t(`b05.nb.f.adh.row${i}`), r.readingId, of('uv'), `adh.${i}`, (n, id) => { n.adh.rows[i].readingId = id; })))}
            <div className="nb-grid">
              {(['slope', 'nadhUM', 'pathCm'] as const).map((k) => (
                <div className="field" key={k}>
                  <label>{t(`b05.nb.f.adh.${k}`)}</label>
                  {small(t(`b05.nb.f.adh.${k}`), nb.adh[k], `adh.${k}`, (n, v) => { n.adh[k] = v; })}
                </div>
              ))}
            </div>
            {field('b05.nb.f.adh.inhibitionType', choose(t('b05.nb.f.adh.inhibitionType'), nb.adh.inhibitionType, ['competitive', 'noncompetitive', 'undetermined'] as const, 'adh.type', (n, v) => { n.adh.inhibitionType = v; }, 'b05.inhibition'))}
            {field('b05.nb.f.adh.totalInhibition', choose(t('b05.nb.f.adh.totalInhibition'), nb.adh.totalInhibition, ['yes', 'no'] as const, 'adh.total', (n, v) => { n.adh.totalInhibition = v; }, 'b05.yesno'))}
            {field('b05.nb.f.adh.fehling', choose(t('b05.nb.f.adh.fehling'), nb.adh.fehling, ['specific', 'nonspecific'] as const, 'adh.fehling', (n, v) => { n.adh.fehling = v; }, 'b05.fehling'))}
            {field('b05.nb.f.adh.fehlingBlank', choose(t('b05.nb.f.adh.fehlingBlank'), nb.adh.fehlingBlank, ['needed', 'notNeeded'] as const, 'adh.fblank', (n, v) => { n.adh.fehlingBlank = v; }, 'b05.fehlingBlank'))}
            {field('b05.nb.f.adh.iodoform', choose(t('b05.nb.f.adh.iodoform'), nb.adh.iodoform, ['exact', 'qualitative'] as const, 'adh.iodo', (n, v) => { n.adh.iodoform = v; }, 'b05.iodoform'))}
          </section>
        )}

        {tab === 'micro' && (
          <section aria-label={t('b05.nb.tableMicro')} style={{ display: 'grid', gap: '0.6rem' }}>
            <h3>{t('b05.nb.tableMicro')}</h3>
            <p className="hint">{t('b05.nb.microHelp', { oc: w.params.microscope.ocularX })}</p>
            {field('b05.nb.col.capture', (
              <select aria-label={t('b05.nb.col.capture')} value={nb.micro.observationId ?? ''} onChange={(e) => setNb((n) => { n.micro.observationId = e.target.value || null; }, 'micro.obs', nb.micro.observationId ?? '', e.target.value)}>
                <option value="">📥 {t('b05.nb.importCapture')}</option>
                {compound.map((o) => <option key={o.id} value={o.id}>{olabel(o)}</option>)}
              </select>
            ))}
            {field('b05.nb.f.micro.structure', choose(t('b05.nb.f.micro.structure'), nb.micro.structure, ['starchGranules', 'nuclei', 'chloroplasts'] as const, 'micro.st', (n, v) => { n.micro.structure = v; }, 'b05.structure'))}
          </section>
        )}

        {tab === 'questions' && (
          <section aria-label={t('b05.nb.tab.questions')} style={{ display: 'grid', gap: '0.6rem' }}>
            <h3>{t('b05.nb.questions')}</h3>
            {QUESTIONS_B05.map((q) => text(`analysis.${q}`, nb.analysis[q], (n, v) => { n.analysis[q] = v; }, true, `b05.nb.q.${q}`))}
            {text('errors', nb.errors, (n, v) => { n.errors = v; }, true, 'b05.nb.f.errors')}
            <div className="row">
              <button className="btn primary" onClick={() => dispatch({ type: 'closeBench' })}>{t('b02.act.closeBench')}</button>
              <span className="hint" aria-live="polite">{w.evidence.benchRestored ? `✓ ${t('b02.nb.benchOk')}` : w.evidence.closeAttempted ? t('b05.nb.benchPending') : ''}</span>
            </div>
          </section>
        )}

        {tab === 'log' && (
          <section aria-label={t('b05.nb.tab.log')}>
            <h3>{t('b05.nb.readings', { n: readings.length })}</h3>
            <ul className="fb-list" style={{ maxHeight: '14rem', overflow: 'auto' }}>
              {readings.map((r) => <li key={r.id}>{rlabel(r)}{r.biased ? ' ⚠' : ''}</li>)}
            </ul>
            <h3>{t('b02.nb.captures')}</h3>
            <ul className="fb-list">
              {w.observationOrder.map((id) => w.observations[id]).map((o) => (
                <li key={o.id}>
                  <span className={o.isObservationValid ? 'ok' : 'bad'}>{o.isObservationValid ? '✓' : '✗'}</span> {olabel(o)} · {fmt(o.t, 0)} s
                  {o.issues.length > 0 && <span className="hint"> · {o.issues.map((q) => t(`b02.issue.${q}`)).join(', ')}</span>}
                </li>
              ))}
            </ul>
            <h3>{t('p4.nb.history', { n: nb.history.length })}</h3>
            <ul className="fb-list" style={{ maxHeight: '14rem', overflow: 'auto' }}>
              {[...nb.history].reverse().slice(0, 80).map((h, i) => <li key={i}><span className="hint">{fmt(h.t, 0)} s</span> {h.field}: «{h.from.slice(0, 40)}» → «{h.to.slice(0, 40)}»</li>)}
            </ul>
            <div className="row">
              <button className="btn small" onClick={() => downloadJson(`libreta-b05-${attemptId}.json`, { attemptId, notebook: nb, readings: E.readings, observations: w.observations })}>{t('review.export')}</button>
              <button className="btn small ghost" onClick={() => window.print()}>{t('p10.nb.print')}</button>
            </div>
          </section>
        )}
      </div>
    </aside>
  );
}
