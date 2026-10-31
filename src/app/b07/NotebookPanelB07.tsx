import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useB07 } from './store';
import type { LabObservation } from '../../simulation/optical-world/types';
import { QUESTIONS_B07, colonyRow, gramRow, opticsRow, techniqueRow, type B07Notebook, type ColonyRow, type GramRow, type MediaRow, type OpticsRow, type TechniqueRow } from '../../practices/practice-b07/notebook';
import { downloadJson } from '../persistence';
import { b07NameOf } from './describe';
import { coloniesOf } from '../../simulation/micro-world/world';
import { conservedMicro } from '../../simulation/micro-world/world';

type Tab = 'pre' | 'media' | 'colony' | 'tech' | 'gram' | 'optics' | 'integ' | 'close' | 'questions' | 'log';
const TABS: Tab[] = ['pre', 'media', 'colony', 'tech', 'gram', 'optics', 'integ', 'close', 'questions', 'log'];
const fmt = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d).replace('.', ',') : '—');

/**
 * Libreta digital de B07 (§12): tablas A–G y diez preguntas. Las filas IMPORTAN lecturas, medidas, trazados y capturas
 * propias; lo clasificado e interpretado es del estudiante, y «indeterminada» o «evidencia insuficiente» son respuestas
 * válidas cuando el recurso lo justifica.
 */
export function NotebookPanelB07() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('pre');
  const nb = useB07((s) => s.notebook);
  const setNb = useB07((s) => s.setNotebook);
  const toggle = useB07((s) => s.toggleNotebook);
  const savedAt = useB07((s) => s.savedAt);
  const dispatch = useB07((s) => s.dispatch);
  useB07((s) => s.version);
  const rt = useB07((s) => s.runtime);
  const attemptId = useB07((s) => s.attemptId);
  const wanted = useB07((s) => s.notebookTab);
  useEffect(() => {
    if (wanted) setTab(wanted as Tab);
  }, [wanted]);
  if (!rt) return null;
  const w = rt.world;
  const all = w.observationOrder.map((id) => w.observations[id]);
  const olabel = (o: LabObservation) => `${o.id} · ${b07NameOf(w, o.slideId ?? o.specimenId)} · ${o.objectiveX ?? '—'}X${o.isObservationValid ? '' : ' ✗'}`;

  const text = (path: string, value: string, set: (n: B07Notebook, v: string) => void) => {
    const idf = `b07-${path.replace(/[^a-zA-Z0-9]/g, '_')}`;
    return (
      <div className="field" key={path}>
        <label htmlFor={idf}>{t(`b07.nb.f.${path}`)}</label>
        <textarea id={idf} value={value} onChange={(e) => setNb((n) => set(n, e.target.value), path, value, e.target.value)} />
      </div>
    );
  };
  const small = (label: string, value: string, path: string, set: (n: B07Notebook, v: string) => void) => (
    <input aria-label={label} type="text" value={value} onChange={(e) => setNb((n) => set(n, e.target.value), path, value, e.target.value)} />
  );
  const choose = <T extends string>(label: string, value: T, options: readonly T[], path: string, set: (n: B07Notebook, v: T) => void, prefix = 'b07.val') => (
    <select aria-label={label} value={value} onChange={(e) => setNb((n) => set(n, e.target.value as T), path, value, e.target.value)}>
      <option value="">{t('nb.choose')}</option>
      {options.filter(Boolean).map((o) => <option key={o} value={o}>{t(`${prefix}.${o}`)}</option>)}
    </select>
  );
  const check = (label: string, value: boolean, path: string, set: (n: B07Notebook, v: boolean) => void) => (
    <label className="check"><input type="checkbox" checked={value} onChange={(e) => setNb((n) => set(n, e.target.checked), path, String(value), String(e.target.checked))} /> {label}</label>
  );
  const pick = (label: string, value: string | null, opts: Array<[string, string]>, path: string, set: (n: B07Notebook, id: string | null) => void) => (
    <select aria-label={label} value={value ?? ''} onChange={(e) => setNb((n) => set(n, e.target.value || null), path, value ?? '', e.target.value)}>
      <option value="">📥 {t('b07.nb.import')}</option>
      {opts.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
    </select>
  );
  const obsOpts: Array<[string, string]> = all.map((o) => [o.id, olabel(o)]);
  const table = (label: string, cols: string[], rows: React.ReactNode) => (
    <div className="table-scroll" tabIndex={0} role="region" aria-label={label}>
      <table className="nb-table"><thead><tr>{cols.map((k) => <th key={k}>{t(`b07.nb.col.${k}`)}</th>)}</tr></thead><tbody>{rows}</tbody></table>
    </div>
  );
  const L = (k: string, i: number) => `${t(`b07.nb.col.${k}`)} ${i + 1}`;

  const mediaTr = (r: MediaRow, i: number) => {
    const up = (fn: (x: MediaRow) => void) => (n: B07Notebook) => fn(n.media[i]);
    return (
      <tr key={r.mediaId}>
        <td>{t(`b07.obj.${r.mediaId}`)}</td>
        <td>{choose(L('consistency', i), r.consistency, ['solid', 'liquid'] as const, `m.${i}.c`, (n, v) => up((x) => { x.consistency = v; })(n))}</td>
        <td>{choose(L('formulation', i), r.formulation, ['complex', 'defined'] as const, `m.${i}.fm`, (n, v) => up((x) => { x.formulation = v; })(n))}</td>
        <td>{choose(L('func', i), r.func, ['general', 'selective', 'differential', 'selectiveDifferential'] as const, `m.${i}.fn`, (n, v) => up((x) => { x.func = v; })(n))}</td>
        <td>{choose(L('source', i), r.compositionSource, ['card', 'inferred', 'invented'] as const, `m.${i}.s`, (n, v) => up((x) => { x.compositionSource = v; })(n))}</td>
        <td>{small(L('appearance', i), r.appearance, `m.${i}.a`, (n, v) => up((x) => { x.appearance = v; })(n))}</td>
        <td>{small(L('justification', i), r.justification, `m.${i}.j`, (n, v) => up((x) => { x.justification = v; })(n))}</td>
        <td>
          {r.mediaId === 'mEMB' && <>
            {choose(t('b07.nb.col.selMeans'), r.selectiveMeans, ['inhibits', 'distinguishes'] as const, `m.${i}.sm`, (n, v) => up((x) => { x.selectiveMeans = v; })(n))}
            {choose(t('b07.nb.col.difMeans'), r.differentialMeans, ['inhibits', 'distinguishes'] as const, `m.${i}.dm`, (n, v) => up((x) => { x.differentialMeans = v; })(n))}
          </>}
          {check(t('b07.nb.sterile'), r.sterileClaim, `m.${i}.st`, (n, v) => up((x) => { x.sterileClaim = v; })(n))}
          {check(t('b07.nb.coloniesExpected'), r.coloniesExpected, `m.${i}.ce`, (n, v) => up((x) => { x.coloniesExpected = v; })(n))}
        </td>
      </tr>
    );
  };
  const colonyTr = (r: ColonyRow, i: number) => {
    const up = (fn: (x: ColonyRow) => void) => (n: B07Notebook) => fn(n.colonies[i]);
    return (
      <tr key={i}>
        <td>{pick(L('reading', i), r.readingId, w.micro.readings.map((x) => [x.id, `${x.id} · ${w.micro.plates[x.plateId].label} · ${coloniesOf(w, x.plateId).findIndex((c) => c.id === x.colonyId) + 1}`]), `c.${i}.r`, (n, id) => up((x) => {
          x.readingId = id;
          const rd = w.micro.readings.find((q) => q.id === id);
          x.plateId = rd?.plateId ?? '';
          x.colonyId = rd?.colonyId ?? '';
        })(n))}</td>
        <td>{choose(L('form', i), r.form, ['circular', 'irregular'], `c.${i}.fo`, (n, v) => up((x) => { x.form = v; })(n))}</td>
        <td>{choose(L('margin', i), r.margin, ['entire', 'undulate'], `c.${i}.ma`, (n, v) => up((x) => { x.margin = v; })(n))}</td>
        <td>{choose(L('elevation', i), r.elevation, ['convex', 'flat', 'raised'], `c.${i}.el`, (n, v) => up((x) => { x.elevation = v; })(n))}</td>
        <td>{choose(L('surface', i), r.surface, ['smooth', 'rough', 'entire'], `c.${i}.su`, (n, v) => up((x) => { x.surface = v; })(n))}</td>
        <td>{choose(L('pigment', i), r.pigment, ['cream', 'yellow', 'dark', 'none'], `c.${i}.pi`, (n, v) => up((x) => { x.pigment = v; })(n))}</td>
        <td>{pick(L('measure', i), r.measureId, w.micro.measures.map((x) => [x.id, `${x.id}${x.valid ? '' : ' ✗'}`]), `c.${i}.me`, (n, id) => up((x) => { x.measureId = id; })(n))}</td>
        <td>{small(L('diameter', i), r.diameter, `c.${i}.d`, (n, v) => up((x) => { x.diameter = v; })(n))}</td>
        <td>{small(L('uncertainty', i), r.uncertainty, `c.${i}.u`, (n, v) => up((x) => { x.uncertainty = v; })(n))}</td>
        <td>{choose(L('unit', i), r.unit, ['mm', 'px'] as const, `c.${i}.un`, (n, v) => up((x) => { x.unit = v; })(n), 'b07.unit')}</td>
        <td>{check(t('b07.nb.border'), r.borderDeclared, `c.${i}.b`, (n, v) => up((x) => { x.borderDeclared = v; })(n))}</td>
        <td>{small(L('count', i), r.count, `c.${i}.n`, (n, v) => up((x) => { x.count = v; })(n))}{choose(L('countUnit', i), r.countUnit, ['visibleColonies', 'bacteria'] as const, `c.${i}.cu`, (n, v) => up((x) => { x.countUnit = v; })(n))}</td>
        <td>{choose(L('identity', i), r.identity, ['preliminary', 'species'] as const, `c.${i}.id`, (n, v) => up((x) => { x.identity = v; })(n))}</td>
      </tr>
    );
  };
  const techTr = (r: TechniqueRow, i: number) => {
    const up = (fn: (x: TechniqueRow) => void) => (n: B07Notebook) => fn(n.techniques[i]);
    return (
      <tr key={i}>
        <td>{pick(L('trial', i), r.trialId, w.micro.trials.map((x) => [x.id, `${x.id} · ${t(`b07.technique.${x.technique}`)}`]), `t.${i}.tr`, (n, id) => up((x) => {
          x.trialId = id;
          const tr = w.micro.trials.find((q) => q.id === id);
          x.technique = tr?.technique ?? '';
          x.overlap = tr ? fmt(tr.overlap01) : '';
          x.separation = tr ? fmt(tr.separation01) : '';
        })(n))}</td>
        <td>{r.overlap || '—'}</td>
        <td>{r.separation || '—'}</td>
        <td>{small(L('limits', i), r.limits, `t.${i}.l`, (n, v) => up((x) => { x.limits = v; })(n))}</td>
        <td>{check(t('b07.nb.replicates'), r.replicates, `t.${i}.rp`, (n, v) => up((x) => { x.replicates = v; })(n))}</td>
      </tr>
    );
  };
  const gramTr = (r: GramRow, i: number) => {
    const up = (fn: (x: GramRow) => void) => (n: B07Notebook) => fn(n.gram[i]);
    const ctl = (id: string): Array<[string, string]> => all.filter((o) => o.slideId === id).map((o) => [o.id, olabel(o)]);
    return (
      <tr key={i}>
        <td>{pick(L('capture', i), r.observationId, obsOpts, `g.${i}.o`, (n, id) => up((x) => { x.observationId = id; })(n))}</td>
        <td>{small(L('sample', i), r.sampleCode, `g.${i}.s`, (n, v) => up((x) => { x.sampleCode = v; })(n))}</td>
        <td>{pick(L('ctlPos', i), r.controlPosObs, ctl('fxP'), `g.${i}.cp`, (n, id) => up((x) => { x.controlPosObs = id; })(n))}</td>
        <td>{pick(L('ctlNeg', i), r.controlNegObs, ctl('fxN'), `g.${i}.cn`, (n, id) => up((x) => { x.controlNegObs = id; })(n))}</td>
        <td>{small(L('quality', i), r.quality, `g.${i}.q`, (n, v) => up((x) => { x.quality = v; })(n))}</td>
        <td>{choose(L('color', i), r.color, ['violet', 'pink', 'mixed', 'none'] as const, `g.${i}.co`, (n, v) => up((x) => { x.color = v; })(n))}</td>
        <td>{choose(L('shape', i), r.shape, ['cocci', 'rods', 'both', 'notResolved'] as const, `g.${i}.sh`, (n, v) => up((x) => { x.shape = v; })(n))}</td>
        <td>{choose(L('interpretation', i), r.interpretation, ['gram-positive', 'gram-negative', 'mixed', 'indeterminate'] as const, `g.${i}.in`, (n, v) => up((x) => { x.interpretation = v; })(n))}</td>
        <td>{small(L('species', i), r.species, `g.${i}.sp`, (n, v) => up((x) => { x.species = v; })(n))}</td>
        <td>{small(L('limits', i), r.limits, `g.${i}.l`, (n, v) => up((x) => { x.limits = v; })(n))}</td>
        <td>
          {check(t('b07.nb.membrane'), r.membraneVisible, `g.${i}.me`, (n, v) => up((x) => { x.membraneVisible = v; })(n))}
          {check(t('b07.nb.negStain'), r.negativeStainSame, `g.${i}.ns`, (n, v) => up((x) => { x.negativeStainSame = v; })(n))}
        </td>
      </tr>
    );
  };
  const opticsTr = (r: OpticsRow, i: number) => {
    const up = (fn: (x: OpticsRow) => void) => (n: B07Notebook) => fn(n.optics[i]);
    const o = r.observationId ? w.observations[r.observationId] : null;
    return (
      <tr key={i}>
        <td>{pick(L('capture', i), r.observationId, obsOpts, `o.${i}.o`, (n, id) => up((x) => {
          x.observationId = id;
          const ob = id ? w.observations[id] : null;
          x.objective = ob ? String(ob.objectiveX ?? '') : '';
          x.ocular = ob ? String(w.params.microscope.ocularX) : '';
        })(n))}</td>
        <td>{o ? `${r.objective}X` : '—'}</td>
        <td>{o ? `${r.ocular}X` : '—'}</td>
        <td>{small(L('totalMag', i), r.totalMag, `o.${i}.t`, (n, v) => up((x) => { x.totalMag = v; })(n))}</td>
        <td>{check(t('b07.nb.oil'), r.oil, `o.${i}.oi`, (n, v) => up((x) => { x.oil = v; })(n))}</td>
        <td>{small(L('focus', i), r.focus, `o.${i}.f`, (n, v) => up((x) => { x.focus = v; })(n))}</td>
        <td>{small(L('zone', i), r.zone, `o.${i}.z`, (n, v) => up((x) => { x.zone = v; })(n))}</td>
      </tr>
    );
  };
  const sec = (key: string, node: React.ReactNode) => <section aria-label={t(key)} style={{ display: 'grid', gap: '0.6rem' }}><h3>{t(key)}</h3>{node}</section>;
  const addRow = (path: string, fn: (n: B07Notebook) => void) => <button className="btn small" onClick={() => setNb(fn, path, '', 'row')}>+ {t('b07.nb.addRow')}</button>;
  const bal = conservedMicro(w);

  return (
    <aside className="notebook" aria-label={t('b07.nb.title')}>
      <div className="nb-head">
        <h2>{t('b07.nb.title')}</h2>
        <span className="hint" aria-live="polite">{savedAt ? t('nb.saved') : ''}</span>
        <button className="btn small ghost" aria-label={t('nb.close')} onClick={toggle}>✕</button>
      </div>
      <div className="tabs" role="tablist">
        {TABS.map((k) => <button key={k} role="tab" aria-selected={tab === k} className={`tab${tab === k ? ' on' : ''}`} onClick={() => setTab(k)}>{t(`b07.nb.tab.${k}`)}</button>)}
      </div>
      <div className="nb-body">
        {tab === 'pre' && sec('b07.nb.tab.pre', <>
          {text('prereport.hypothesis', nb.prereport.hypothesis, (n, v) => { n.prereport.hypothesis = v; })}
          {text('prereport.expected', nb.prereport.expected, (n, v) => { n.prereport.expected = v; })}
          {text('prereport.precautions', nb.prereport.precautions, (n, v) => { n.prereport.precautions = v; })}
        </>)}
        {tab === 'media' && sec('b07.nb.tableA', table(t('b07.nb.tableA'), ['medium', 'consistency', 'formulation', 'func', 'source', 'appearance', 'justification', 'claims'], nb.media.map(mediaTr)))}
        {tab === 'colony' && sec('b07.nb.tableB', <>{table(t('b07.nb.tableB'), ['reading', 'form', 'margin', 'elevation', 'surface', 'pigment', 'measure', 'diameter', 'uncertainty', 'unit', 'border', 'count', 'identity'], nb.colonies.map(colonyTr))}{addRow('colonies.add', (n) => { n.colonies.push(colonyRow()); })}</>)}
        {tab === 'tech' && sec('b07.nb.tableC', <>{table(t('b07.nb.tableC'), ['trial', 'overlap', 'separation', 'limits', 'replicates'], nb.techniques.map(techTr))}{addRow('techniques.add', (n) => { n.techniques.push(techniqueRow()); })}</>)}
        {tab === 'gram' && sec('b07.nb.tableD', <>{table(t('b07.nb.tableD'), ['capture', 'sample', 'ctlPos', 'ctlNeg', 'quality', 'color', 'shape', 'interpretation', 'species', 'limits', 'claims'], nb.gram.map(gramTr))}{addRow('gram.add', (n) => { n.gram.push(gramRow()); })}</>)}
        {tab === 'optics' && sec('b07.nb.tableE', <>{table(t('b07.nb.tableE'), ['capture', 'objective', 'ocular', 'totalMag', 'oil', 'focus', 'zone'], nb.optics.map(opticsTr))}{addRow('optics.add', (n) => { n.optics.push(opticsRow()); })}</>)}
        {tab === 'integ' && sec('b07.nb.tableF', <>
          {(['hypothesis', 'medium', 'colony', 'gram', 'contradictions', 'confidence'] as const).map((k) => text(`integrative.${k}`, nb.integrative[k], (n, v) => { n.integrative[k] = v; }))}
          <div className="field">
            <label>{t('b07.nb.claim')}</label>
            {choose(t('b07.nb.claim'), nb.integrative.claim, ['preliminary', 'insufficient', 'species'] as const, 'integrative.claim', (n, v) => { n.integrative.claim = v; }, 'b07.claim')}
          </div>
          {text('integrative.conclusion', nb.integrative.conclusion, (n, v) => { n.integrative.conclusion = v; })}
          {text('integrative.nextTest', nb.integrative.nextTest, (n, v) => { n.integrative.nextTest = v; })}
        </>)}
        {tab === 'close' && sec('b07.nb.tableG', <>
          {text('open.notes', nb.open.notes, (n, v) => { n.open.notes = v; })}
          {text('open.limitations', nb.open.limitations, (n, v) => { n.open.limitations = v; })}
          {text('open.errors', nb.open.errors, (n, v) => { n.open.errors = v; })}
          <ul className="fb-list">
            <li>{t('b07.nb.close.stain', { err: fmt(Math.max(...Object.values(bal).map(Math.abs)), 6) })}</li>
            <li>{t('b07.nb.close.broken', { n: w.shards })}</li>
            <li>{t('b07.nb.close.lens', { ok: w.micro.immersionDirty ? '✗' : '✓' })}</li>
            <li>{t('b07.nb.close.incidents', { n: w.cell.incidents.length })}</li>
          </ul>
          <div className="row">
            <button className="btn primary" onClick={() => dispatch({ type: 'closeBench' })}>{t('b07.act.closeBench')}</button>
            <span className="hint" aria-live="polite">{w.evidence.benchRestored ? `✓ ${t('b07.nb.benchOk')}` : w.evidence.closeAttempted ? t('b07.nb.benchPending') : ''}</span>
          </div>
        </>)}
        {tab === 'questions' && sec('b07.nb.questions', QUESTIONS_B07.map((q) => text(`analysis.${q}`, nb.analysis[q], (n, v) => { n.analysis[q] = v; })))}
        {tab === 'log' && (
          <section aria-label={t('b07.nb.tab.log')}>
            <h3>{t('b07.nb.captures')}</h3>
            <ul className="fb-list">
              {all.map((o) => <li key={o.id}><span className={o.isObservationValid ? 'ok' : 'bad'}>{o.isObservationValid ? '✓' : '✗'}</span> {olabel(o)} · {fmt(o.t, 0)} s{o.issues.length > 0 && <span className="hint"> · {o.issues.map((q) => t(`b07.issue.${q}`)).join(', ')}</span>}</li>)}
            </ul>
            <h3>{t('p4.nb.history', { n: nb.history.length })}</h3>
            <ul className="fb-list" style={{ maxHeight: '14rem', overflow: 'auto' }}>
              {[...nb.history].reverse().slice(0, 80).map((h, i) => <li key={i}><span className="hint">{fmt(h.t, 0)} s</span> {h.field}: «{h.from.slice(0, 40)}» → «{h.to.slice(0, 40)}»</li>)}
            </ul>
            <div className="row">
              <button className="btn small" onClick={() => downloadJson(`libreta-b07-${attemptId}.json`, { attemptId, notebook: nb, observations: w.observations, measures: w.micro.measures, trials: w.micro.trials })}>{t('review.export')}</button>
              <button className="btn small ghost" onClick={() => window.print()}>{t('p10.nb.print')}</button>
            </div>
          </section>
        )}
      </div>
    </aside>
  );
}
