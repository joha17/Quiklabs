import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useB04 } from './store';
import type { StructureId } from '../../simulation/specimens/assets';
import type { LabObservation } from '../../simulation/optical-world/types';
import type { BioReading } from '../../simulation/bio-world/types';
import { QUESTIONS_B04, assayRow, catalaseRow, type AssayResult, type B04Notebook, type Molecule } from '../../practices/practice-b04/notebook';
import { downloadJson } from '../persistence';
import { b04NameOf } from './describe';

type Tab = 'inventory' | 'assays' | 'feulgen' | 'catalase' | 'amylase' | 'adh' | 'synthesis' | 'questions' | 'log';
const TABS: Tab[] = ['inventory', 'assays', 'feulgen', 'catalase', 'amylase', 'adh', 'synthesis', 'questions', 'log'];

/** Glosario general de núcleos y células (no revela qué muestra cada captura). */
const GLOSSARY: StructureId[] = ['epithelialCells', 'epidermalCells', 'cellBorder', 'cellWall', 'nucleus', 'dnaStain'];
const RESULTS: AssayResult[] = ['positive', 'negative', 'ambiguous'];
const MOLECULES: Molecule[] = ['starch', 'protein', 'lipid', 'reducingSugar', 'reducingAgent', 'none'];

const fmt = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d).replace('.', ',') : '—');

/**
 * Libreta digital de B04 (§11): A inventario y controles, B ensayos de biomoléculas (fila por tubo con su lectura
 * importada e interpretación propia), C Feulgen (capturas del ocular), D catalasa (gas por condición, normalización),
 * E amilasa (Lugol y Benedict por separado y control), F ADH (si está habilitado), G síntesis, H errores y
 * recuperación, ocho preguntas y registro. Las celdas medibles IMPORTAN una lectura del propio intento.
 */
export function NotebookPanelB04() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('inventory');
  const nb = useB04((s) => s.notebook);
  const setNb = useB04((s) => s.setNotebook);
  const toggle = useB04((s) => s.toggleNotebook);
  const savedAt = useB04((s) => s.savedAt);
  const dispatch = useB04((s) => s.dispatch);
  useB04((s) => s.version);
  const rt = useB04((s) => s.runtime);
  const attemptId = useB04((s) => s.attemptId);
  const wanted = useB04((s) => s.notebookTab);
  useEffect(() => {
    if (wanted) setTab(wanted as Tab);
  }, [wanted]);
  if (!rt) return null;
  const w = rt.world;
  const B = w.bio;
  const readings = B.readingOrder.map((id) => B.readings[id]);
  const compound = w.observationOrder.map((id) => w.observations[id]).filter((o) => o.instrument === 'compound');
  const target = (id: string) => (B.tubes[id]?.label ? `${b04NameOf(w, id)} «${B.tubes[id].label}»` : b04NameOf(w, id));
  const qual = (q?: string) => (q ? t(`b04.look.${q.replace(/:/g, '_')}`, { defaultValue: q }) : '');
  const rlabel = (r: BioReading) => `${r.id} · ${t(`b04.instrument.${r.instrument}`)} · ${target(r.targetId)} · ${r.instrument === 'eye' ? qual(r.quality) : `${fmt(r.value, r.unit === 'A340' ? 3 : r.unit === 'g' ? 2 : 1)} ${r.unit}`} · ${fmt(r.t, 0)} s`;
  const olabel = (o: LabObservation) => `${o.id} · ${b04NameOf(w, o.slideId ?? o.specimenId)} · ${o.objectiveX ?? '—'}X${o.isObservationValid ? '' : ' ✗'}`;
  const of = (...ins: BioReading['instrument'][]) => readings.filter((r) => ins.includes(r.instrument));

  const text = (path: string, value: string, set: (n: B04Notebook, v: string) => void, area = true, labelKey?: string) => {
    const idf = `b04-${path.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const on = (v: string) => setNb((n) => set(n, v), path, value, v);
    return (
      <div className="field" key={path}>
        <label htmlFor={idf}>{t(labelKey ?? `b04.nb.f.${path}`)}</label>
        {area ? <textarea id={idf} value={value} onChange={(e) => on(e.target.value)} /> : <input id={idf} type="text" value={value} onChange={(e) => on(e.target.value)} />}
      </div>
    );
  };
  const small = (label: string, value: string, path: string, set: (n: B04Notebook, v: string) => void) => (
    <input aria-label={label} type="text" inputMode="decimal" value={value} onChange={(e) => setNb((n) => set(n, e.target.value), path, value, e.target.value)} />
  );
  const choose = <T extends string>(label: string, value: T, options: readonly T[], path: string, set: (n: B04Notebook, v: T) => void, keyPrefix: string) => (
    <select aria-label={label} value={value} onChange={(e) => setNb((n) => set(n, e.target.value as T), path, value, e.target.value)}>
      <option value="">{t('nb.choose')}</option>
      {options.filter(Boolean).map((o) => <option key={o} value={o}>{t(`${keyPrefix}.${o}`)}</option>)}
    </select>
  );
  const pickReading = (label: string, value: string | null, opts: BioReading[], path: string, set: (n: B04Notebook, id: string | null) => void) => (
    <select aria-label={label} value={value ?? ''} onChange={(e) => setNb((n) => set(n, e.target.value || null), path, value ?? '', e.target.value)}>
      <option value="">📥 {t('b04.nb.import')}</option>
      {opts.map((r) => <option key={r.id} value={r.id}>{rlabel(r)}</option>)}
    </select>
  );
  const pickObs = (label: string, value: string | null, path: string, set: (n: B04Notebook, id: string | null) => void) => (
    <select aria-label={label} value={value ?? ''} onChange={(e) => setNb((n) => set(n, e.target.value || null), path, value ?? '', e.target.value)}>
      <option value="">📥 {t('b04.nb.importCapture')}</option>
      {compound.map((o) => <option key={o.id} value={o.id}>{olabel(o)}</option>)}
    </select>
  );
  const structures = (label: string, value: StructureId[], path: string, set: (n: B04Notebook, v: StructureId[]) => void) => (
    <fieldset className="chips" aria-label={label}>
      {GLOSSARY.map((s) => (
        <label key={s} className="check small">
          <input type="checkbox" checked={value.includes(s)} onChange={(e) => {
            const next = e.target.checked ? [...value, s] : value.filter((x) => x !== s);
            setNb((n) => set(n, next), path, value.join(','), next.join(','));
          }} /> {t(`b04.structure.${s}`, { defaultValue: t(`b02.structure.${s}`) })}
        </label>
      ))}
    </fieldset>
  );
  const eyeReadings = of('eye');
  const tubeLabels = [...new Set(Object.values(B.tubes).map((x) => x.label).filter(Boolean) as string[])];

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
          {TABS.map((k) => <button key={k} role="tab" className="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{t(`b04.nb.tab.${k}`)}</button>)}
        </div>

        {tab === 'inventory' && (
          <section aria-label={t('b04.nb.tableA')} style={{ display: 'grid', gap: '0.6rem' }}>
            <h3>{t('b04.nb.tableA')}</h3>
            <div className="table-scroll" tabIndex={0} role="region" aria-label={t('b04.nb.tableA')}>
              <table className="nb-table">
                <thead><tr><th>{t('b04.nb.col.lot')}</th><th>{t('b04.nb.col.initial')}</th><th>{t('b04.nb.col.role')}</th></tr></thead>
                <tbody>
                  {nb.inventory.rows.map((r, i) => (
                    <tr key={i}>
                      <td>{small(`${t('b04.nb.col.lot')} ${i + 1}`, r.lot, `inv.${i}.lot`, (n, v) => { n.inventory.rows[i].lot = v; })}</td>
                      <td>{pickReading(`${t('b04.nb.col.initial')} ${i + 1}`, r.initialReadingId, eyeReadings, `inv.${i}.read`, (n, v) => { n.inventory.rows[i].initialReadingId = v; })}</td>
                      <td>{choose(`${t('b04.nb.col.role')} ${i + 1}`, r.role, ['sample', 'negative', 'positive', 'unknown'] as const, `inv.${i}.role`, (n, v) => { n.inventory.rows[i].role = v; }, 'b04.role')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button className="btn small ghost" onClick={() => setNb((n) => { n.inventory.rows.push({ lot: '', initialReadingId: null, role: '' }); }, 'inv.add', '', '+')}>＋ {t('b04.nb.addRow')}</button>
            <div className="field"><label>{t('b04.nb.f.liverMass')}</label>{pickReading(t('b04.nb.f.liverMass'), nb.inventory.massReadingId, of('balance'), 'inv.mass', (n, v) => { n.inventory.massReadingId = v; })}</div>
            {text('inv.uncertainty', nb.inventory.uncertainty, (n, v) => { n.inventory.uncertainty = v; }, false, 'b04.nb.f.uncertainty')}
          </section>
        )}

        {tab === 'assays' && (
          <section aria-label={t('b04.nb.tableB')} style={{ display: 'grid', gap: '0.6rem' }}>
            <h3>{t('b04.nb.tableB')}</h3>
            <p className="hint">{t('b04.nb.assaysHelp')}</p>
            <datalist id="b04-tube-labels">{tubeLabels.map((l) => <option key={l} value={l} />)}</datalist>
            <div className="table-scroll" tabIndex={0} role="region" aria-label={t('b04.nb.tableB')}>
              <table className="nb-table">
                <thead><tr><th>{t('b04.nb.col.tube')}</th><th>{t('b04.nb.col.reading')}</th><th>{t('b04.nb.col.result')}</th><th>{t('b04.nb.col.molecule')}</th></tr></thead>
                <tbody>
                  {nb.assays.rows.map((r, i) => (
                    <tr key={i}>
                      <td><input aria-label={`${t('b04.nb.col.tube')} ${i + 1}`} list="b04-tube-labels" value={r.label} onChange={(e) => setNb((n) => { n.assays.rows[i].label = e.target.value; }, `assay.${i}.label`, r.label, e.target.value)} /></td>
                      <td>{pickReading(`${t('b04.nb.col.reading')} ${i + 1}`, r.readingId, eyeReadings.filter((x) => !r.label || B.tubes[x.targetId]?.label === r.label), `assay.${i}.read`, (n, v) => { n.assays.rows[i].readingId = v; })}</td>
                      <td>{choose(`${t('b04.nb.col.result')} ${i + 1}`, r.result, RESULTS, `assay.${i}.result`, (n, v) => { n.assays.rows[i].result = v; }, 'b04.result')}</td>
                      <td>{choose(`${t('b04.nb.col.molecule')} ${i + 1}`, r.molecule, MOLECULES, `assay.${i}.mol`, (n, v) => { n.assays.rows[i].molecule = v; }, 'b04.molecule')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button className="btn small ghost" onClick={() => setNb((n) => { n.assays.rows.push(assayRow()); }, 'assay.add', '', '+')}>＋ {t('b04.nb.addRow')}</button>
          </section>
        )}

        {tab === 'feulgen' && (
          <section aria-label={t('b04.nb.tableC')} style={{ display: 'grid', gap: '0.6rem' }}>
            <h3>{t('b04.nb.tableC')}</h3>
            {B.incidents.includes('feulgen') && <p className="hint">⚠ {t('b04.nb.feulgenMissing')}</p>}
            {nb.feulgen.rows.map((r, i) => (
              <fieldset key={i} className="nb-card">
                <legend>{t('b04.nb.capture', { n: i + 1 })}</legend>
                <div className="field"><label>{t('b04.nb.col.capture')}</label>{pickObs(`${t('b04.nb.col.capture')} ${i + 1}`, r.observationId, `feul.${i}.obs`, (n, v) => { n.feulgen.rows[i].observationId = v; })}</div>
                <div className="field"><label>{t('b04.nb.col.structures')}</label>{structures(`${t('b04.nb.col.structures')} ${i + 1}`, r.structures, `feul.${i}.st`, (n, v) => { n.feulgen.rows[i].structures = v; })}</div>
                <label className="check"><input type="checkbox" checked={r.dnaClaim} onChange={(e) => setNb((n) => { n.feulgen.rows[i].dnaClaim = e.target.checked; }, `feul.${i}.dna`, String(r.dnaClaim), String(e.target.checked))} /> {t('b04.nb.dnaClaim')}</label>
                {text(`feul.${i}.comment`, r.comment, (n, v) => { n.feulgen.rows[i].comment = v; }, true, 'b04.nb.f.critical')}
              </fieldset>
            ))}
          </section>
        )}

        {tab === 'catalase' && (
          <section aria-label={t('b04.nb.tableD')} style={{ display: 'grid', gap: '0.6rem' }}>
            <h3>{t('b04.nb.tableD')}</h3>
            <div className="table-scroll" tabIndex={0} role="region" aria-label={t('b04.nb.tableD')}>
              <table className="nb-table">
                <thead><tr><th>{t('b04.nb.col.gas')}</th><th>{t('b04.nb.col.condition')}</th><th>{t('b04.nb.col.normalized')}</th></tr></thead>
                <tbody>
                  {nb.catalase.rows.map((r, i) => (
                    <tr key={i}>
                      <td>{pickReading(`${t('b04.nb.col.gas')} ${i + 1}`, r.readingId, of('gas'), `cat.${i}.read`, (n, v) => { n.catalase.rows[i].readingId = v; })}</td>
                      <td>{small(`${t('b04.nb.col.condition')} ${i + 1}`, r.condition, `cat.${i}.cond`, (n, v) => { n.catalase.rows[i].condition = v; })}</td>
                      <td>{small(`${t('b04.nb.col.normalized')} ${i + 1}`, r.normalized, `cat.${i}.norm`, (n, v) => { n.catalase.rows[i].normalized = v; })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button className="btn small ghost" onClick={() => setNb((n) => { n.catalase.rows.push(catalaseRow()); }, 'cat.add', '', '+')}>＋ {t('b04.nb.addRow')}</button>
            <div className="field"><label>{t('b04.nb.f.liverMass')}</label>{pickReading(t('b04.nb.f.liverMass'), nb.catalase.liverMassReadingId, of('balance'), 'cat.mass', (n, v) => { n.catalase.liverMassReadingId = v; })}</div>
            <div className="field"><label>{t('b04.nb.f.normalizedBy')}</label>{choose(t('b04.nb.f.normalizedBy'), nb.catalase.normalizedBy, ['mass', 'activity', 'none'] as const, 'cat.normBy', (n, v) => { n.catalase.normalizedBy = v; }, 'b04.normBy')}</div>
            <div className="field"><label>{t('b04.nb.f.catClaim')}</label>{choose(t('b04.nb.f.catClaim'), nb.catalase.claim, ['sourceDiffers', 'heatInactivates', 'noDifference'] as const, 'cat.claim', (n, v) => { n.catalase.claim = v; }, 'b04.catClaim')}</div>
            {text('cat.conclusion', nb.catalase.conclusion, (n, v) => { n.catalase.conclusion = v; }, true, 'b04.nb.f.conclusion')}
          </section>
        )}

        {tab === 'amylase' && (
          <section aria-label={t('b04.nb.tableE')} style={{ display: 'grid', gap: '0.6rem' }}>
            <h3>{t('b04.nb.tableE')}</h3>
            <div className="field"><label>{t('b04.nb.f.amyLugol')}</label>{pickReading(t('b04.nb.f.amyLugol'), nb.amylase.lugolReadingId, eyeReadings, 'amy.lugol', (n, v) => { n.amylase.lugolReadingId = v; })}</div>
            <div className="field"><label>{t('b04.nb.f.amyBenedict')}</label>{pickReading(t('b04.nb.f.amyBenedict'), nb.amylase.benedictReadingId, eyeReadings, 'amy.ben', (n, v) => { n.amylase.benedictReadingId = v; })}</div>
            <div className="field"><label>{t('b04.nb.f.amyControl')}</label>{pickReading(t('b04.nb.f.amyControl'), nb.amylase.controlReadingId, eyeReadings, 'amy.ctrl', (n, v) => { n.amylase.controlReadingId = v; })}</div>
            <div className="field"><label>{t('b04.nb.f.amyPh')}</label>{pickReading(t('b04.nb.f.amyPh'), nb.amylase.phReadingId, of('ph'), 'amy.ph', (n, v) => { n.amylase.phReadingId = v; })}</div>
            <div className="field"><label>{t('b04.nb.f.amyClaim')}</label>{choose(t('b04.nb.f.amyClaim'), nb.amylase.claim, ['noHydrolysis', 'partial', 'complete'] as const, 'amy.claim', (n, v) => { n.amylase.claim = v; }, 'b04.amyClaim')}</div>
            <div className="field"><label>{t('b04.nb.f.amyBasis')}</label>{choose(t('b04.nb.f.amyBasis'), nb.amylase.basis, ['benedict', 'lugol', 'both'] as const, 'amy.basis', (n, v) => { n.amylase.basis = v; }, 'b04.amyBasis')}</div>
            {text('amy.conclusion', nb.amylase.conclusion, (n, v) => { n.amylase.conclusion = v; }, true, 'b04.nb.f.conclusion')}
          </section>
        )}

        {tab === 'adh' && (
          <section aria-label={t('b04.nb.tableF')} style={{ display: 'grid', gap: '0.6rem' }}>
            <h3>{t('b04.nb.tableF')}</h3>
            {!B.adhEnabled ? <p className="hint">{t('b04.nb.adhDisabled')}</p> : (
              <>
                <ul className="fb-list">{of('photometer').map((r) => (
                  <li key={r.id}><label className="check small"><input type="checkbox" checked={nb.adh.readingIds.includes(r.id)} onChange={(e) => {
                    const next = e.target.checked ? [...nb.adh.readingIds, r.id] : nb.adh.readingIds.filter((x) => x !== r.id);
                    setNb((n) => { n.adh.readingIds = next; }, 'adh.reads', nb.adh.readingIds.join(','), next.join(','));
                  }} /> {rlabel(r)} · {t(`b04.cuvette.${r.quality}`, { defaultValue: r.quality })}{r.biased ? ' ⚠' : ''}</label></li>
                ))}</ul>
                <div className="field"><label>{t('b04.nb.f.methanol')}</label>{choose(t('b04.nb.f.methanol'), nb.adh.methanolClaim, ['total', 'competitive', 'none'] as const, 'adh.meoh', (n, v) => { n.adh.methanolClaim = v; }, 'b04.methanol')}</div>
                <div className="field"><label>{t('b04.nb.f.fehling')}</label>{choose(t('b04.nb.f.fehling'), nb.adh.fehlingClaim, ['acetaldehydeOnly', 'nonspecific'] as const, 'adh.fehling', (n, v) => { n.adh.fehlingClaim = v; }, 'b04.fehling')}</div>
                <div className="field"><label>{t('b04.nb.f.iodoform')}</label>{choose(t('b04.nb.f.iodoform'), nb.adh.iodoformClaim, ['ethanolOnly', 'nonspecific'] as const, 'adh.iodo', (n, v) => { n.adh.iodoformClaim = v; }, 'b04.iodoform')}</div>
                {text('adh.conclusion', nb.adh.conclusion, (n, v) => { n.adh.conclusion = v; }, true, 'b04.nb.f.conclusion')}
              </>
            )}
          </section>
        )}

        {tab === 'synthesis' && (
          <section aria-label={t('b04.nb.tableG')} style={{ display: 'grid', gap: '0.6rem' }}>
            <h3>{t('b04.nb.tableG')}</h3>
            {text('cmp.energy', nb.comparison.energy, (n, v) => { n.comparison.energy = v; }, true, 'b04.nb.f.energy')}
            {text('cmp.structure', nb.comparison.structure, (n, v) => { n.comparison.structure = v; }, true, 'b04.nb.f.structure')}
            {text('cmp.information', nb.comparison.information, (n, v) => { n.comparison.information = v; }, true, 'b04.nb.f.information')}
            <h3>{t('b04.nb.tableH')}</h3>
            {nb.errors.map((e, i) => (
              <fieldset key={i} className="nb-card">
                <legend>{t('b04.nb.errorRow', { n: i + 1 })}</legend>
                {text(`err.${i}.observed`, e.observed, (n, v) => { n.errors[i].observed = v; }, false, 'b04.nb.f.observed')}
                {text(`err.${i}.cause`, e.cause, (n, v) => { n.errors[i].cause = v; }, false, 'b04.nb.f.cause')}
                {text(`err.${i}.action`, e.action, (n, v) => { n.errors[i].action = v; }, false, 'b04.nb.f.action')}
              </fieldset>
            ))}
            <button className="btn small ghost" onClick={() => setNb((n) => { n.errors.push({ observed: '', cause: '', action: '' }); }, 'err.add', '', '+')}>＋ {t('b04.nb.addRow')}</button>
            <div className="row">
              <button className="btn primary" onClick={() => dispatch({ type: 'closeBench' })}>{t('b02.act.closeBench')}</button>
              <span className="hint" aria-live="polite">{w.evidence.benchRestored ? `✓ ${t('b02.nb.benchOk')}` : w.evidence.closeAttempted ? t('b04.nb.benchPending') : ''}</span>
            </div>
          </section>
        )}

        {tab === 'questions' && (
          <section aria-label={t('b04.nb.tab.questions')} style={{ display: 'grid', gap: '0.6rem' }}>
            <h3>{t('b04.nb.questions')}</h3>
            {QUESTIONS_B04.map((q) => text(`analysis.${q}`, nb.analysis[q], (n, v) => { n.analysis[q] = v; }, true, `b04.nb.q.${q}`))}
          </section>
        )}

        {tab === 'log' && (
          <section aria-label={t('b04.nb.tab.log')}>
            <h3>{t('b04.nb.readings', { n: readings.length })}</h3>
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
              <button className="btn small" onClick={() => downloadJson(`libreta-b04-${attemptId}.json`, { attemptId, notebook: nb, readings: B.readings, observations: w.observations })}>{t('review.export')}</button>
              <button className="btn small ghost" onClick={() => window.print()}>{t('p10.nb.print')}</button>
            </div>
          </section>
        )}
      </div>
    </aside>
  );
}
