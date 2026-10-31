import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useB09 } from './store';
import type { LabObservation } from '../../simulation/optical-world/types';
import { conservedPlant } from '../../simulation/plant-world/world';
import { QUESTIONS_B09, type B09Notebook, type Evidence3 } from '../../practices/practice-b09/notebook';
import { downloadJson } from '../persistence';
import { b09NameOf } from './describe';
import { CaptureMarkerB09 } from './CaptureMarkerB09';

type Tab = 'pre' | 'ext' | 'sec' | 'stain' | 'root' | 'stem' | 'leaf' | 'wood' | 'marks' | 'meas' | 'matrix' | 'close' | 'questions' | 'log';
const TABS: Tab[] = ['pre', 'ext', 'sec', 'stain', 'root', 'stem', 'leaf', 'wood', 'marks', 'meas', 'matrix', 'close', 'questions', 'log'];
const EV3: readonly Evidence3[] = ['visible', 'absent', 'notResolved'];

const fmt = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d).replace('.', ',') : '—');

/**
 * Libreta digital de B09 (§12): preinforme y nueve cuadros (órganos, cortes, tinción, atlas de raíz, tallo y hoja, medidas, matriz
 * final y cierre importado del mundo), ocho preguntas y registro. Las filas IMPORTAN una captura propia o una medición; el
 * objetivo, la escala y la longitud vienen del registro, lo clasificado e interpretado es del estudiante.
 */
export function NotebookPanelB09() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('pre');
  const nb = useB09((s) => s.notebook);
  const setNb = useB09((s) => s.setNotebook);
  const toggle = useB09((s) => s.toggleNotebook);
  const savedAt = useB09((s) => s.savedAt);
  const dispatch = useB09((s) => s.dispatch);
  useB09((s) => s.version);
  const rt = useB09((s) => s.runtime);
  const attemptId = useB09((s) => s.attemptId);
  const wanted = useB09((s) => s.notebookTab);
  useEffect(() => {
    if (wanted) setTab(wanted as Tab);
  }, [wanted]);
  if (!rt) return null;
  const w = rt.world;
  const all = w.observationOrder.map((id) => w.observations[id]);
  const compound = all.filter((o) => o.instrument === 'compound');
  const stereo = all.filter((o) => o.instrument === 'stereo');
  const olabel = (o: LabObservation) => `${o.id} · ${b09NameOf(w, o.slideId ?? o.specimenId)}${o.specimenId.startsWith('ctl:') ? ` (${t('b09.nb.control')})` : ''} · ${o.objectiveX ?? '—'}X${o.isObservationValid ? '' : ' ✗'}`;

  const text = (path: string, value: string, set: (n: B09Notebook, v: string) => void, area = true, labelKey?: string) => {
    const idf = `b09-${path.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const on = (v: string) => setNb((n) => set(n, v), path, value, v);
    return (
      <div className="field" key={path}>
        <label htmlFor={idf}>{t(labelKey ?? `b09.nb.f.${path}`)}</label>
        {area ? <textarea id={idf} value={value} onChange={(e) => on(e.target.value)} /> : <input id={idf} type="text" value={value} onChange={(e) => on(e.target.value)} />}
      </div>
    );
  };
  const small = (label: string, value: string, path: string, set: (n: B09Notebook, v: string) => void) => (
    <input aria-label={label} type="text" value={value} onChange={(e) => setNb((n) => set(n, e.target.value), path, value, e.target.value)} />
  );
  const choose = <T extends string>(label: string, value: T, options: readonly T[], path: string, set: (n: B09Notebook, v: T) => void, keyPrefix: string) => (
    <select aria-label={label} value={value} onChange={(e) => setNb((n) => set(n, e.target.value as T), path, value, e.target.value)}>
      <option value="">{t('nb.choose')}</option>
      {options.filter(Boolean).map((o) => <option key={o} value={o}>{t(`${keyPrefix}.${o}`)}</option>)}
    </select>
  );
  const check = (label: string, value: boolean, path: string, set: (n: B09Notebook, v: boolean) => void) => (
    <label className="check"><input type="checkbox" checked={value} onChange={(e) => setNb((n) => set(n, e.target.checked), path, String(value), String(e.target.checked))} /> {label}</label>
  );
  const pickObs = (label: string, value: string | null, opts: LabObservation[], path: string, set: (n: B09Notebook, id: string | null) => void) => (
    <select aria-label={label} value={value ?? ''} onChange={(e) => setNb((n) => set(n, e.target.value || null), path, value ?? '', e.target.value)}>
      <option value="">📥 {t('b09.nb.import')}</option>
      {opts.map((o) => <option key={o.id} value={o.id}>{olabel(o)}</option>)}
    </select>
  );
  const head = (...keys: string[]) => <thead><tr>{keys.map((k) => <th key={k}>{t(`b09.nb.col.${k}`)}</th>)}</tr></thead>;
  const table = (label: string, cols: string[], rows: React.ReactNode) => (
    <div className="table-scroll" tabIndex={0} role="region" aria-label={label}>
      <table className="nb-table">{head(...cols)}<tbody>{rows}</tbody></table>
    </div>
  );

  const L = (k: string, i: number) => `${t(`b09.nb.col.${k}`)} ${i + 1}`;
  const ev3 = (label: string, value: Evidence3, path: string, set: (n: B09Notebook, v: Evidence3) => void) => choose(label, value, EV3, path, set, 'b09.ev3');
  const group = <T extends { group: '' | 'eudicot' | 'monocot' }>(i: number, r: T, path: string, get: (n: B09Notebook) => T) =>
    choose(L('group', i), r.group, ['eudicot', 'monocot'] as const, `${path}.${i}.g`, (n, v) => { get(n).group = v; }, 'b09.group');
  const basis = <T extends { basis: '' | 'observedFeature' | 'labelOnly' }>(i: number, r: T, path: string, get: (n: B09Notebook) => T) =>
    choose(L('basis', i), r.basis, ['observedFeature', 'labelOnly'] as const, `${path}.${i}.b`, (n, v) => { get(n).basis = v; }, 'b09.basis');
  const bal = conservedPlant(w);

  return (
    <aside className="drawer" aria-label={t('nb.title')} id="notebook">
      <div className="drawer-head">
        <h2>{t('nb.title')}</h2>
        <span className="grow" style={{ flex: 1 }} />
        {savedAt && <span className="hint">{t('nb.saved')}</span>}
        <button className="btn small ghost" onClick={toggle} aria-label={t('common.close')}>×</button>
      </div>
      <div className="tabs" role="tablist" aria-label={t('nb.title')}>
        {TABS.map((k) => <button key={k} role="tab" aria-selected={tab === k} className="tab" onClick={() => setTab(k)}>{t(`b09.nb.tab.${k}`)}</button>)}
      </div>
      <div className="drawer-body">
        {tab === 'pre' && (
          <section aria-label={t('b09.nb.tab.pre')} style={{ display: 'grid', gap: '0.6rem' }}>
            {text('prereport.hypothesis', nb.prereport.hypothesis, (n, v) => { n.prereport.hypothesis = v; })}
            {text('prereport.instruments', nb.prereport.instruments, (n, v) => { n.prereport.instruments = v; })}
            {text('prereport.precautions', nb.prereport.precautions, (n, v) => { n.prereport.precautions = v; })}
          </section>
        )}

        {tab === 'ext' && (
          <section aria-label={t('b09.nb.tab.ext')}>
            <p className="hint">{t('b09.nb.extHelp')}</p>
            {table(t('b09.nb.tab.ext'), ['specimen', 'taxon', 'rootPattern', 'venation', 'petiole', 'capture'], nb.external.map((r, i) => (
              <tr key={i}>
                <td>{choose(L('specimen', i), r.specimen, ['bean', 'maize'] as const, `ext.${i}.s`, (n, v) => { n.external[i].specimen = v; }, 'b09.plant')}</td>
                <td>{small(L('taxon', i), r.taxon, `ext.${i}.t`, (n, v) => { n.external[i].taxon = v; })}</td>
                <td>{choose(L('rootPattern', i), r.rootPattern, ['taproot', 'fibrous'] as const, `ext.${i}.r`, (n, v) => { n.external[i].rootPattern = v; }, 'b09.rootPattern')}</td>
                <td>{choose(L('venation', i), r.venation, ['reticulate', 'parallel'] as const, `ext.${i}.v`, (n, v) => { n.external[i].venation = v; }, 'b09.venation')}</td>
                <td>{choose(L('petiole', i), r.petiole, ['present', 'absent'] as const, `ext.${i}.p`, (n, v) => { n.external[i].petiole = v; }, 'b09.presence')}</td>
                <td>{pickObs(L('capture', i), r.stereoObservationId, stereo, `ext.${i}.o`, (n, id) => { n.external[i].stereoObservationId = id; })}</td>
              </tr>
            )))}
            <ul className="fb-list">
              {w.plant.labels.map((l) => <li key={`${l.specimen}${l.regionId}`}>{t(`b09.plant.${l.specimen}`)} · {l.regionId.toUpperCase()} · {t(`b09.organ.${l.part}`)}</li>)}
            </ul>
            {check(t('b09.nb.claimMonocot'), nb.claims.allMonocotsNoPetiole, 'claims.mono', (n, v) => { n.claims.allMonocotsNoPetiole = v; })}
            {check(t('b09.nb.claimStarch'), nb.claims.allParenchymaStarch, 'claims.starch', (n, v) => { n.claims.allParenchymaStarch = v; })}
          </section>
        )}

        {tab === 'sec' && (
          <section aria-label={t('b09.nb.tab.sec')}>
            {table(t('b09.nb.tab.sec'), ['capture', 'organ', 'plane', 'thicknessUm', 'treatment', 'cover', 'result'], nb.sections.map((r, i) => (
              <tr key={i}>
                <td>{pickObs(L('capture', i), r.observationId, compound, `sec.${i}.o`, (n, id) => { n.sections[i].observationId = id; })}</td>
                <td>{choose(L('organ', i), r.organ, ['celery', 'pear', 'leaf'] as const, `sec.${i}.g`, (n, v) => { n.sections[i].organ = v; }, 'b09.sourceOrgan')}</td>
                <td>{choose(L('plane', i), r.plane, ['transverse', 'longitudinal', 'epidermal'] as const, `sec.${i}.p`, (n, v) => { n.sections[i].plane = v; }, 'b09.plane')}</td>
                <td>{small(L('thicknessUm', i), r.thicknessUm, `sec.${i}.t`, (n, v) => { n.sections[i].thicknessUm = v; })}</td>
                <td>{choose(L('treatment', i), r.treatment, ['water', 'wiesner'] as const, `sec.${i}.m`, (n, v) => { n.sections[i].treatment = v; }, 'b09.treatment')}</td>
                <td>{small(L('cover', i), r.cover, `sec.${i}.c`, (n, v) => { n.sections[i].cover = v; })}</td>
                <td>{small(L('result', i), r.result, `sec.${i}.r`, (n, v) => { n.sections[i].result = v; })}</td>
              </tr>
            )))}
            <ul className="fb-list">
              {w.plant.sections.map((s) => <li key={s.id}>{s.id} · {b09NameOf(w, s.sourceId)} · {fmt(s.thicknessUm, 0)} µm · {t(`b09.plane.${s.actualPlane}`)} · {t('b09.nb.integrity', { pct: Math.round(s.integrity01 * 100) })}</li>)}
            </ul>
          </section>
        )}

        {tab === 'stain' && (
          <section aria-label={t('b09.nb.tab.stain')} style={{ display: 'grid', gap: '0.5rem' }}>
            <div className="field"><span>{t('b09.nb.stainedCapture')}</span>{pickObs(t('b09.nb.stainedCapture'), nb.stain.observationId, compound, 'stain.o', (n, id) => { n.stain.observationId = id; })}</div>
            <div className="field"><span>{t('b09.nb.controlCapture')}</span>{pickObs(t('b09.nb.controlCapture'), nb.stain.controlObservationId, compound, 'stain.c', (n, id) => { n.stain.controlObservationId = id; })}</div>
            <div className="field"><span>{t('b09.nb.col.treatment')}</span>{choose(t('b09.nb.col.treatment'), nb.stain.treatmentOfCapture, ['water', 'wiesner'] as const, 'stain.t', (n, v) => { n.stain.treatmentOfCapture = v; }, 'b09.treatment')}</div>
            <div className="field"><span>{t('b09.nb.redMeans')}</span>{choose(t('b09.nb.redMeans'), nb.stain.redMeans, ['lignifiedWall', 'xylemOnly', 'ligninPercent'] as const, 'stain.r', (n, v) => { n.stain.redMeans = v; }, 'b09.redMeans')}</div>
            <div className="field"><span>{t('b09.nb.collenchymaLignified')}</span>{choose(t('b09.nb.collenchymaLignified'), nb.stain.collenchymaLignified, ['yes', 'no', 'notDiagnosed'] as const, 'stain.q', (n, v) => { n.stain.collenchymaLignified = v; }, 'b09.collenchyma')}</div>
            {text('stain.limits', nb.stain.limits, (n, v) => { n.stain.limits = v; })}
          </section>
        )}

        {tab === 'root' && (
          <section aria-label={t('b09.nb.tab.root')}>
            {table(t('b09.nb.tab.root'), ['capture', 'group', 'plane', 'xylemPattern', 'pith', 'endodermis', 'cambium', 'casparian', 'basis'], nb.roots.map((r, i) => (
              <tr key={i}>
                <td>{pickObs(L('capture', i), r.observationId, compound, `root.${i}.o`, (n, id) => { n.roots[i].observationId = id; })}</td>
                <td>{group(i, r, 'root', (n) => n.roots[i])}</td>
                <td>{choose(L('plane', i), r.plane, ['transverse', 'longitudinal'] as const, `root.${i}.p`, (n, v) => { n.roots[i].plane = v; }, 'b09.plane')}</td>
                <td>{choose(L('xylemPattern', i), r.xylemPattern, ['star', 'ring', 'notResolved'] as const, `root.${i}.x`, (n, v) => { n.roots[i].xylemPattern = v; }, 'b09.xylemPattern')}</td>
                <td>{ev3(L('pith', i), r.pith, `root.${i}.h`, (n, v) => { n.roots[i].pith = v; })}</td>
                <td>{ev3(L('endodermis', i), r.endodermis, `root.${i}.e`, (n, v) => { n.roots[i].endodermis = v; })}</td>
                <td>{ev3(L('cambium', i), r.cambium, `root.${i}.c`, (n, v) => { n.roots[i].cambium = v; })}</td>
                <td>{ev3(L('casparian', i), r.casparian, `root.${i}.k`, (n, v) => { n.roots[i].casparian = v; })}</td>
                <td>{basis(i, r, 'root', (n) => n.roots[i])}</td>
              </tr>
            )))}
          </section>
        )}

        {tab === 'stem' && (
          <section aria-label={t('b09.nb.tab.stem')}>
            {table(t('b09.nb.tab.stem'), ['capture', 'group', 'bundles', 'pith', 'cambium', 'collenchyma', 'xylemSide', 'basis'], nb.stems.map((r, i) => (
              <tr key={i}>
                <td>{pickObs(L('capture', i), r.observationId, compound, `stem.${i}.o`, (n, id) => { n.stems[i].observationId = id; })}</td>
                <td>{group(i, r, 'stem', (n) => n.stems[i])}</td>
                <td>{choose(L('bundles', i), r.bundles, ['ring', 'scattered'] as const, `stem.${i}.d`, (n, v) => { n.stems[i].bundles = v; }, 'b09.bundles')}</td>
                <td>{ev3(L('pith', i), r.pith, `stem.${i}.h`, (n, v) => { n.stems[i].pith = v; })}</td>
                <td>{ev3(L('cambium', i), r.cambium, `stem.${i}.c`, (n, v) => { n.stems[i].cambium = v; })}</td>
                <td>{ev3(L('collenchyma', i), r.collenchyma, `stem.${i}.k`, (n, v) => { n.stems[i].collenchyma = v; })}</td>
                <td>{choose(L('xylemSide', i), r.xylemSide, ['inner', 'outer'] as const, `stem.${i}.x`, (n, v) => { n.stems[i].xylemSide = v; }, 'b09.xylemSide')}</td>
                <td>{basis(i, r, 'stem', (n) => n.stems[i])}</td>
              </tr>
            )))}
          </section>
        )}

        {tab === 'leaf' && (
          <section aria-label={t('b09.nb.tab.leaf')}>
            {table(t('b09.nb.tab.leaf'), ['capture', 'group', 'mesophyll', 'stoma', 'orientation', 'xylemFace'], nb.leaves.map((r, i) => (
              <tr key={i}>
                <td>{pickObs(L('capture', i), r.observationId, compound, `leaf.${i}.o`, (n, id) => { n.leaves[i].observationId = id; })}</td>
                <td>{group(i, r, 'leaf', (n) => n.leaves[i])}</td>
                <td>{choose(L('mesophyll', i), r.mesophyll, ['dorsiventral', 'undifferentiated'] as const, `leaf.${i}.m`, (n, v) => { n.leaves[i].mesophyll = v; }, 'b09.mesophyll')}</td>
                <td>{ev3(L('stoma', i), r.stoma, `leaf.${i}.s`, (n, v) => { n.leaves[i].stoma = v; })}</td>
                <td>{check(L('orientation', i), r.orientationChecked, `leaf.${i}.c`, (n, v) => { n.leaves[i].orientationChecked = v; })}</td>
                <td>{choose(L('xylemFace', i), r.xylemFace, ['adaxial', 'abaxial'] as const, `leaf.${i}.x`, (n, v) => { n.leaves[i].xylemFace = v; }, 'b09.xylemFace')}</td>
              </tr>
            )))}
          </section>
        )}

        {tab === 'wood' && (
          <section aria-label={t('b09.nb.tab.wood')} style={{ display: 'grid', gap: '0.5rem' }}>
            <div className="field"><span>{t('b09.nb.col.capture')}</span>{pickObs(t('b09.nb.col.capture'), nb.wood.observationId, compound, 'wood.o', (n, id) => { n.wood.observationId = id; })}</div>
            {text('wood.ringCount', nb.wood.ringCount, (n, v) => { n.wood.ringCount = v; }, false)}
            {text('wood.ageYears', nb.wood.ageYears, (n, v) => { n.wood.ageYears = v; }, false)}
            {text('wood.limit', nb.wood.limit, (n, v) => { n.wood.limit = v; })}
          </section>
        )}

        {tab === 'marks' && <section aria-label={t('b09.nb.tab.marks')}><CaptureMarkerB09 /></section>}

        {tab === 'meas' && (
          <section aria-label={t('b09.nb.tab.meas')}>
            <p className="hint">{w.div.scale.available ? t('b09.nb.measHelp') : t('b09.nb.noScale')}</p>
            {table(t('b09.nb.tab.meas'), ['measurement', 'structure', 'pixels', 'umPerPx', 'lengthUm', 'uncertaintyUm', 'unit', 'totalMag', 'fieldAsCell'], nb.measures.map((r, i) => (
              <tr key={i}>
                <td>
                  <select aria-label={L('measurement', i)} value={r.measurementId ?? ''} onChange={(e) => {
                    const m = w.div.measurements.find((x) => x.id === e.target.value);
                    setNb((n) => { n.measures[i].measurementId = m?.id ?? null; n.measures[i].observationId = m?.observationId ?? null; }, `meas.${i}.m`, r.measurementId ?? '', e.target.value);
                  }}>
                    <option value="">📥 {t('b09.nb.import')}</option>
                    {w.div.measurements.map((m) => <option key={m.id} value={m.id}>{m.id} · {m.observationId} · {fmt(m.rawPixelDistance, 0)} px</option>)}
                  </select>
                </td>
                <td>{small(L('structure', i), r.structure, `meas.${i}.s`, (n, v) => { n.measures[i].structure = v; })}</td>
                <td>{small(L('pixels', i), r.pixels, `meas.${i}.p`, (n, v) => { n.measures[i].pixels = v; })}</td>
                <td>{small(L('umPerPx', i), r.umPerPx, `meas.${i}.k`, (n, v) => { n.measures[i].umPerPx = v; })}</td>
                <td>{small(L('lengthUm', i), r.lengthUm, `meas.${i}.l`, (n, v) => { n.measures[i].lengthUm = v; })}</td>
                <td>{small(L('uncertaintyUm', i), r.uncertaintyUm, `meas.${i}.u`, (n, v) => { n.measures[i].uncertaintyUm = v; })}</td>
                <td>{choose(L('unit', i), r.unit, ['um', 'px'] as const, `meas.${i}.n`, (n, v) => { n.measures[i].unit = v; }, 'b09.unit')}</td>
                <td>{small(L('totalMag', i), r.totalMag, `meas.${i}.t`, (n, v) => { n.measures[i].totalMag = v; })}</td>
                <td>{check(L('fieldAsCell', i), r.usedFieldAsCell, `meas.${i}.f`, (n, v) => { n.measures[i].usedFieldAsCell = v; })}</td>
              </tr>
            )))}
            <ul className="fb-list">
              {w.plant.areas.map((a) => <li key={a.id}>{a.id} · {a.observationId} · {fmt(a.fraction * 100, 1)} %</li>)}
            </ul>
          </section>
        )}

        {tab === 'matrix' && (
          <section aria-label={t('b09.nb.tab.matrix')}>
            {table(t('b09.nb.tab.matrix'), ['organ', 'system', 'capture', 'observation', 'inference'], nb.matrix.map((r, i) => (
              <tr key={i}>
                <td>{choose(L('organ', i), r.organ, ['root', 'stem', 'leaf'] as const, `mx.${i}.o`, (n, v) => { n.matrix[i].organ = v; }, 'b09.organType')}</td>
                <td>{choose(L('system', i), r.system, ['dermal', 'ground', 'vascular', 'meristem'] as const, `mx.${i}.s`, (n, v) => { n.matrix[i].system = v; }, 'b09.system')}</td>
                <td>{pickObs(L('capture', i), r.evidenceObservationId, compound, `mx.${i}.e`, (n, id) => { n.matrix[i].evidenceObservationId = id; })}</td>
                <td>{small(L('observation', i), r.observation, `mx.${i}.b`, (n, v) => { n.matrix[i].observation = v; })}</td>
                <td>{small(L('inference', i), r.inference, `mx.${i}.i`, (n, v) => { n.matrix[i].inference = v; })}</td>
              </tr>
            )))}
          </section>
        )}

        {tab === 'close' && (
          <section aria-label={t('b09.nb.tab.close')} style={{ display: 'grid', gap: '0.5rem' }}>
            {text('closure.notes', nb.closure.notes, (n, v) => { n.closure.notes = v; })}
            <h3>{t('b09.nb.tableClose')}</h3>
            <ul className="fb-list">
              <li>{t('b09.nb.close.balance', { ml: fmt(bal.water ?? 0, 4) })}</li>
              <li>{t('b09.nb.close.broken', { n: w.shards })}</li>
              <li>{t('b09.nb.close.fixed', { ok: w.assignment.fixedSlideIds.every((id) => w.slideCase.slots[w.slideCase.home[id]] === id) ? '✓' : '✗' })}</li>
              <li>{t('b09.nb.close.incidents', { n: w.cell.incidents.length })}</li>
            </ul>
            <div className="row">
              <button className="btn primary" onClick={() => dispatch({ type: 'closeBench' })}>{t('b09.act.closeBench')}</button>
              <span className="hint" aria-live="polite">{w.evidence.benchRestored ? `✓ ${t('b09.nb.benchOk')}` : w.evidence.closeAttempted ? t('b09.nb.benchPending') : ''}</span>
            </div>
          </section>
        )}

        {tab === 'questions' && (
          <section aria-label={t('b09.nb.tab.questions')} style={{ display: 'grid', gap: '0.6rem' }}>
            <h3>{t('b09.nb.questions')}</h3>
            {QUESTIONS_B09.map((q) => text(`analysis.${q}`, nb.analysis[q], (n, v) => { n.analysis[q] = v; }))}
          </section>
        )}

        {tab === 'log' && (
          <section aria-label={t('b09.nb.tab.log')}>
            <h3>{t('b09.nb.captures')}</h3>
            <ul className="fb-list">
              {all.map((o) => (
                <li key={o.id}>
                  <span className={o.isObservationValid ? 'ok' : 'bad'}>{o.isObservationValid ? '✓' : '✗'}</span> {olabel(o)} · {fmt(o.t, 0)} s
                  {o.issues.length > 0 && <span className="hint"> · {o.issues.map((q) => t(`b09.issue.${q}`)).join(', ')}</span>}
                </li>
              ))}
            </ul>
            <h3>{t('p4.nb.history', { n: nb.history.length })}</h3>
            <ul className="fb-list" style={{ maxHeight: '14rem', overflow: 'auto' }}>
              {[...nb.history].reverse().slice(0, 80).map((h, i) => <li key={i}><span className="hint">{fmt(h.t, 0)} s</span> {h.field}: «{h.from.slice(0, 40)}» → «{h.to.slice(0, 40)}»</li>)}
            </ul>
            <div className="row">
              <button className="btn small" onClick={() => downloadJson(`libreta-b09-${attemptId}.json`, { attemptId, notebook: nb, observations: w.observations, marks: w.div.marks, measurements: w.div.measurements })}>{t('review.export')}</button>
              <button className="btn small ghost" onClick={() => window.print()}>{t('p10.nb.print')}</button>
            </div>
          </section>
        )}
      </div>
    </aside>
  );
}
