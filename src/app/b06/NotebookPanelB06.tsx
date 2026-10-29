import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useB06 } from './store';
import type { LabObservation } from '../../simulation/optical-world/types';
import { DIV_SPECIMENS, type DivSpecimen } from '../../simulation/div-world/types';
import { conservedDiv } from '../../simulation/div-world/world';
import { obsSpecimen } from '../../practices/practice-b06/expected-results';
import { comparisonRow, morphoRow, organismRow, prepRowB06, QUESTIONS_B06, type B06Notebook, type ComparisonRow, type Evidence3, type MorphoRow, type OrganismRow, type PrepRowB06, type ProtistRow } from '../../practices/practice-b06/notebook';
import { downloadJson } from '../persistence';
import { b06NameOf } from './describe';
import { CaptureMarkerB06 } from './CaptureMarkerB06';

type Tab = 'pre' | 'prep' | 'org' | 'prot' | 'epi' | 'fixed' | 'marks' | 'morpho' | 'cmp' | 'close' | 'questions' | 'log';
const TABS: Tab[] = ['pre', 'prep', 'org', 'prot', 'epi', 'fixed', 'marks', 'morpho', 'cmp', 'close', 'questions', 'log'];
const SPECIMENS: DivSpecimen[] = [...DIV_SPECIMENS, 'cyano'];
const EV3 = ['visible', 'inferred', 'notVisible'] as const;

const fmt = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d).replace('.', ',') : '—');

/**
 * Libreta digital de B06 (§12): preinforme y fichas del reto, diez cuadros (preparación, organismos, protistas,
 * epidermis, permanentes con bacteria y sangre, morfometría, comparación, observaciones abiertas y cierre importado del
 * mundo), ocho preguntas y registro. Las filas IMPORTAN una captura propia o una medición; el objetivo, la escala y la
 * longitud vienen del registro, lo clasificado e interpretado es del estudiante.
 */
export function NotebookPanelB06() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('pre');
  const nb = useB06((s) => s.notebook);
  const setNb = useB06((s) => s.setNotebook);
  const toggle = useB06((s) => s.toggleNotebook);
  const savedAt = useB06((s) => s.savedAt);
  const dispatch = useB06((s) => s.dispatch);
  useB06((s) => s.version);
  const rt = useB06((s) => s.runtime);
  const attemptId = useB06((s) => s.attemptId);
  const wanted = useB06((s) => s.notebookTab);
  useEffect(() => {
    if (wanted) setTab(wanted as Tab);
  }, [wanted]);
  if (!rt) return null;
  const w = rt.world;
  const all = w.observationOrder.map((id) => w.observations[id]);
  const compound = all.filter((o) => o.instrument === 'compound');
  const olabel = (o: LabObservation) => {
    const k = obsSpecimen(w, o);
    const name = k ? t(`b06.specimen.${k}`) : b06NameOf(w, o.slideId ?? o.specimenId);
    return `${o.id} · ${name}${o.specimenId.startsWith('ctl:') ? ` (${t('b06.nb.control')})` : ''} · ${o.objectiveX ?? '—'}X${o.isObservationValid ? '' : ' ✗'}`;
  };
  const ofKind = (...ks: DivSpecimen[]) => compound.filter((o) => ks.includes(obsSpecimen(w, o) as DivSpecimen));

  const text = (path: string, value: string, set: (n: B06Notebook, v: string) => void, area = true, labelKey?: string) => {
    const idf = `b06-${path.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const on = (v: string) => setNb((n) => set(n, v), path, value, v);
    return (
      <div className="field" key={path}>
        <label htmlFor={idf}>{t(labelKey ?? `b06.nb.f.${path}`)}</label>
        {area ? <textarea id={idf} value={value} onChange={(e) => on(e.target.value)} /> : <input id={idf} type="text" value={value} onChange={(e) => on(e.target.value)} />}
      </div>
    );
  };
  const small = (label: string, value: string, path: string, set: (n: B06Notebook, v: string) => void) => (
    <input aria-label={label} type="text" value={value} onChange={(e) => setNb((n) => set(n, e.target.value), path, value, e.target.value)} />
  );
  const choose = <T extends string>(label: string, value: T, options: readonly T[], path: string, set: (n: B06Notebook, v: T) => void, keyPrefix: string) => (
    <select aria-label={label} value={value} onChange={(e) => setNb((n) => set(n, e.target.value as T), path, value, e.target.value)}>
      <option value="">{t('nb.choose')}</option>
      {options.filter(Boolean).map((o) => <option key={o} value={o}>{t(`${keyPrefix}.${o}`)}</option>)}
    </select>
  );
  const check = (label: string, value: boolean, path: string, set: (n: B06Notebook, v: boolean) => void) => (
    <label className="check"><input type="checkbox" checked={value} onChange={(e) => setNb((n) => set(n, e.target.checked), path, String(value), String(e.target.checked))} /> {label}</label>
  );
  const pickObs = (label: string, value: string | null, opts: LabObservation[], path: string, set: (n: B06Notebook, id: string | null) => void) => (
    <select aria-label={label} value={value ?? ''} onChange={(e) => setNb((n) => set(n, e.target.value || null), path, value ?? '', e.target.value)}>
      <option value="">📥 {t('b06.nb.import')}</option>
      {opts.map((o) => <option key={o.id} value={o.id}>{olabel(o)}</option>)}
    </select>
  );
  const usedAt = (id: string | null) => {
    const o = id ? w.observations[id] : null;
    return o ? <p className="hint">{t('b06.nb.capturedAt', { obj: o.objectiveX ?? '—', mag: Math.round(o.magnification) })}</p> : null;
  };
  const head = (...keys: string[]) => <thead><tr>{keys.map((k) => <th key={k}>{t(`b06.nb.col.${k}`)}</th>)}</tr></thead>;
  const table = (label: string, cols: string[], rows: React.ReactNode) => (
    <div className="table-scroll" tabIndex={0} role="region" aria-label={label}>
      <table className="nb-table">{head(...cols)}<tbody>{rows}</tbody></table>
    </div>
  );

  const prepTr = (r: PrepRowB06, i: number) => {
    const up = (fn: (x: PrepRowB06) => void) => (n: B06Notebook) => fn(n.prep[i]);
    const L = (k: string) => `${t(`b06.nb.col.${k}`)} ${i + 1}`;
    return (
      <tr key={i}>
        <td>{pickObs(L('capture'), r.observationId, compound, `prep.${i}.obs`, (n, id) => up((x) => { x.observationId = id; })(n))}</td>
        <td>{choose(L('specimen'), r.specimen, SPECIMENS, `prep.${i}.sp`, (n, v) => up((x) => { x.specimen = v; })(n), 'b06.specimen')}</td>
        <td>{choose(L('material'), r.material, ['fresh', 'fixed'] as const, `prep.${i}.mat`, (n, v) => up((x) => { x.material = v; })(n), 'b06.material')}</td>
        <td>{small(L('stain'), r.stain, `prep.${i}.st`, (n, v) => up((x) => { x.stain = v; })(n))}</td>
        <td>{small(L('volumeMl'), r.volumeMl, `prep.${i}.v`, (n, v) => up((x) => { x.volumeMl = v; })(n))}</td>
        <td>{small(L('timeS'), r.timeS, `prep.${i}.t`, (n, v) => up((x) => { x.timeS = v; })(n))}</td>
        <td>{small(L('quality'), r.quality, `prep.${i}.q`, (n, v) => up((x) => { x.quality = v; })(n))}</td>
      </tr>
    );
  };
  const orgTr = (r: OrganismRow, i: number) => {
    const up = (fn: (x: OrganismRow) => void) => (n: B06Notebook) => fn(n.organisms[i]);
    const L = (k: string) => `${t(`b06.nb.col.${k}`)} ${i + 1}`;
    return (
      <tr key={i}>
        <td>{pickObs(L('capture'), r.observationId, compound, `org.${i}.obs`, (n, id) => up((x) => { x.observationId = id; })(n))}</td>
        <td>{choose(L('specimen'), r.specimen, SPECIMENS, `org.${i}.sp`, (n, v) => up((x) => { x.specimen = v; })(n), 'b06.specimen')}</td>
        <td>{choose(L('cellType'), r.cellType, ['prokaryote', 'eukaryote'] as const, `org.${i}.ct`, (n, v) => up((x) => { x.cellType = v; })(n), 'b06.domain')}</td>
        <td>{choose(L('group'), r.group, ['bacteria', 'protist', 'plant', 'animal'] as const, `org.${i}.g`, (n, v) => up((x) => { x.group = v; })(n), 'b06.group')}</td>
        <td>{choose(L('motility'), r.motility, ['moving', 'immobile', 'notEvaluable'] as const, `org.${i}.m`, (n, v) => up((x) => { x.motility = v; })(n), 'b06.motility')}</td>
        <td>{choose(L('cells'), r.cells, ['uni', 'multi'] as const, `org.${i}.c`, (n, v) => up((x) => { x.cells = v; })(n), 'b06.cells')}</td>
        <td>{choose(L('wall'), r.wall, EV3, `org.${i}.w`, (n, v) => up((x) => { x.wall = v as Evidence3; })(n), 'b06.ev3')}</td>
        <td>{choose(L('nucleus'), r.nucleus, EV3, `org.${i}.n`, (n, v) => up((x) => { x.nucleus = v as Evidence3; })(n), 'b06.ev3')}</td>
      </tr>
    );
  };
  const protistFs = (kind: 'euglena' | 'paramecium') => {
    const r = nb.protists[kind];
    const up = (fn: (x: ProtistRow) => void) => (n: B06Notebook) => fn(n.protists[kind]);
    const L = (k: string) => `${t(`b06.nb.col.${k}`)} · ${t(`b06.specimen.${kind}`)}`;
    const slide = Object.keys(w.div.live).find((s) => w.div.live[s].kind === kind && w.objects[s]?.support === 'stage');
    return (
      <fieldset key={kind} className="nb-fieldset">
        <legend>{t(`b06.specimen.${kind}`)}</legend>
        <div className="field"><label>{t('b06.nb.col.capture')}</label>{pickObs(L('capture'), r.observationId, ofKind(kind), `prot.${kind}.obs`, (n, id) => up((x) => { x.observationId = id; })(n))}</div>
        {usedAt(r.observationId)}
        {text(`prot.${kind}.features`, r.features, (n, v) => up((x) => { x.features = v; })(n), true, 'b06.nb.f.features')}
        <div className="field"><label>{t('b06.nb.col.motilityEvidence')}</label>{choose(L('motilityEvidence'), r.motilityEvidence, ['model', 'video', 'none'] as const, `prot.${kind}.me`, (n, v) => up((x) => { x.motilityEvidence = v; })(n), 'b06.motilityEvidence')}</div>
        <div className="field"><label>{t('b06.nb.col.treatment')}</label>{choose(L('treatment'), r.treatment, ['plain', 'methylcellulose', 'lugol', 'nigrosin'] as const, `prot.${kind}.tr`, (n, v) => up((x) => { x.treatment = v; })(n), 'b06.treatment')}</div>
        {text(`prot.${kind}.speed`, r.speedUmS, (n, v) => up((x) => { x.speedUmS = v; })(n), false, 'b06.nb.f.speedUmS')}
        <div className="field"><label>{t('b06.nb.col.reserve')}</label>{choose(L('reserve'), r.reserve, ['paramylon', 'glycogen', 'starch', 'unknown'] as const, `prot.${kind}.rs`, (n, v) => up((x) => { x.reserve = v; })(n), 'b06.reserve')}</div>
        <div className="field"><label>{t('b06.nb.col.reserveMethod')}</label>{choose(L('reserveMethod'), r.reserveMethod, ['lugol', 'literature', 'none'] as const, `prot.${kind}.rm`, (n, v) => up((x) => { x.reserveMethod = v; })(n), 'b06.reserveMethod')}</div>
        {check(t('b06.nb.f.photosynthesisProven'), r.photosynthesisProven, `prot.${kind}.ps`, (n, v) => up((x) => { x.photosynthesisProven = v; })(n))}
        <div className="row">
          <button className="btn small" disabled={!slide} onClick={() => slide && dispatch({ type: 'recordMotility', slideId: slide })}>{t('b06.act.recordMotility')}</button>
          <button className="btn small ghost" disabled={!slide} onClick={() => slide && dispatch({ type: 'estimateSpeed', slideId: slide })}>{t('b06.act.estimateSpeed')}</button>
          <button className="btn small ghost" onClick={() => dispatch({ type: 'requestProtistVideo', kind })}>{t('b06.act.requestVideo')}</button>
          {w.evidence[`motility:${kind}:mc`] !== undefined || w.evidence[`motility:${kind}:plain`] !== undefined ? <span className="hint">✓ {t('b06.nb.motilityRecorded')}</span> : null}
        </div>
      </fieldset>
    );
  };
  const morphoTr = (r: MorphoRow, i: number) => {
    const up = (fn: (x: MorphoRow) => void) => (n: B06Notebook) => fn(n.morpho[i]);
    const L = (k: string) => `${t(`b06.nb.col.${k}`)} ${i + 1}`;
    return (
      <tr key={i}>
        <td>
          <select aria-label={L('measurement')} value={r.measurementId ?? ''} onChange={(e) => {
            const id = e.target.value || null;
            const m = id ? w.div.measurements.find((x) => x.id === id) : null;
            // Importa los datos instrumentales de la medición; la longitud y su incertidumbre las copia el estudiante.
            setNb((n) => up((x) => {
              x.measurementId = id;
              x.observationId = m?.observationId ?? null;
              x.pixels = m ? String(m.rawPixelDistance) : '';
              x.umPerPx = m ? String(m.umPerPx) : '';
            })(n), `morpho.${i}.m`, r.measurementId ?? '', id ?? '');
          }}>
            <option value="">📥 {t('b06.nb.importMeasure')}</option>
            {w.div.measurements.map((m) => <option key={m.id} value={m.id}>{m.id} · {m.observationId} · {fmt(m.rawPixelDistance, 0)} px</option>)}
          </select>
        </td>
        <td>{r.pixels || '—'}</td>
        <td>{r.umPerPx || '—'}</td>
        <td>{small(L('lengthUm'), r.lengthUm, `morpho.${i}.l`, (n, v) => up((x) => { x.lengthUm = v; })(n))}</td>
        <td>{small(L('uncertaintyUm'), r.uncertaintyUm, `morpho.${i}.u`, (n, v) => up((x) => { x.uncertaintyUm = v; })(n))}</td>
        <td>{choose(L('unit'), r.unit, ['um', 'mm'] as const, `morpho.${i}.unit`, (n, v) => up((x) => { x.unit = v; })(n), 'b06.unit')}</td>
        <td>{small(L('lengthMm'), r.lengthMm, `morpho.${i}.mm`, (n, v) => up((x) => { x.lengthMm = v; })(n))}</td>
      </tr>
    );
  };
  const cmpTr = (r: ComparisonRow, i: number) => {
    const up = (fn: (x: ComparisonRow) => void) => (n: B06Notebook) => fn(n.comparison[i]);
    const L = (k: string) => `${t(`b06.nb.col.${k}`)} ${i + 1}`;
    return (
      <tr key={i}>
        <td>{choose(L('specimen'), r.specimen, SPECIMENS, `cmp.${i}.sp`, (n, v) => up((x) => { x.specimen = v; })(n), 'b06.specimen')}</td>
        <td>{choose(L('domain'), r.domain, ['prokaryote', 'eukaryote'] as const, `cmp.${i}.d`, (n, v) => up((x) => { x.domain = v; })(n), 'b06.domain')}</td>
        <td>{choose(L('cells'), r.organization, ['uni', 'multi'] as const, `cmp.${i}.o`, (n, v) => up((x) => { x.organization = v; })(n), 'b06.cells')}</td>
        <td>{choose(L('evidence'), r.evidence, ['observed', 'inferred', 'notDistinguishable'] as const, `cmp.${i}.e`, (n, v) => up((x) => { x.evidence = v; })(n), 'b06.evidence')}</td>
      </tr>
    );
  };
  const bal = conservedDiv(w);

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
          {TABS.map((k) => <button key={k} role="tab" className="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{t(`b06.nb.tab.${k}`)}</button>)}
        </div>

        {tab === 'pre' && (
          <section aria-label={t('b06.nb.tab.pre')} style={{ display: 'grid', gap: '0.6rem' }}>
            <h3>{t('b06.nb.prereport')}</h3>
            {text('pre.hypothesis', nb.prereport.hypothesis, (n, v) => { n.prereport.hypothesis = v; }, true, 'b06.nb.f.hypothesis')}
            {text('pre.expected', nb.prereport.expected, (n, v) => { n.prereport.expected = v; }, true, 'b06.nb.f.expected')}
            {text('pre.precautions', nb.prereport.precautions, (n, v) => { n.prereport.precautions = v; }, true, 'b06.nb.f.precautions')}
            <h3>{t('b06.nb.cards')}</h3>
            <p className="hint">{t('b06.nb.cardsHelp')}</p>
            <table className="nb-table">
              {head('specimen', 'material')}
              <tbody>
                {DIV_SPECIMENS.map((s) => (
                  <tr key={s}>
                    <td>{t(`b06.specimen.${s}`)}</td>
                    <td>
                      <select aria-label={`${t('b06.nb.col.material')} · ${t(`b06.specimen.${s}`)}`} value={w.div.classification[s] ?? ''} onChange={(e) => e.target.value && dispatch({ type: 'classifySample', specimen: s, choice: e.target.value as 'fresh' | 'fixed' })}>
                        <option value="">{t('nb.choose')}</option>
                        <option value="fresh">{t('b06.material.fresh')}</option>
                        <option value="fixed">{t('b06.material.fixed')}</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {tab === 'prep' && (
          <section aria-label={t('b06.nb.tablePrep')} style={{ display: 'grid', gap: '0.6rem' }}>
            <h3>{t('b06.nb.tablePrep')}</h3>
            {table(t('b06.nb.tablePrep'), ['capture', 'specimen', 'material', 'stain', 'volumeMl', 'timeS', 'quality'], nb.prep.map(prepTr))}
            <button className="btn small" onClick={() => setNb((n) => { n.prep.push(prepRowB06()); }, 'prep.add', '', 'row')}>+ {t('b06.nb.addRow')}</button>
          </section>
        )}

        {tab === 'org' && (
          <section aria-label={t('b06.nb.tableOrg')} style={{ display: 'grid', gap: '0.6rem' }}>
            <h3>{t('b06.nb.tableOrg')}</h3>
            <p className="hint">{t('b06.nb.tableOrgHelp')}</p>
            {table(t('b06.nb.tableOrg'), ['capture', 'specimen', 'cellType', 'group', 'motility', 'cells', 'wall', 'nucleus'], nb.organisms.map(orgTr))}
            <button className="btn small" onClick={() => setNb((n) => { n.organisms.push(organismRow()); }, 'org.add', '', 'row')}>+ {t('b06.nb.addRow')}</button>
          </section>
        )}

        {tab === 'prot' && (
          <section aria-label={t('b06.nb.tableProt')} style={{ display: 'grid', gap: '0.6rem' }}>
            <h3>{t('b06.nb.tableProt')}</h3>
            <p className="hint">{t('b06.nb.tableProtHelp')}</p>
            {protistFs('paramecium')}
            {protistFs('euglena')}
            {text('prot.comparison', nb.protists.comparison, (n, v) => { n.protists.comparison = v; }, true, 'b06.nb.f.protComparison')}
          </section>
        )}

        {tab === 'epi' && (
          <section aria-label={t('b06.nb.tableEpi')} style={{ display: 'grid', gap: '0.6rem' }}>
            <h3>{t('b06.nb.tableEpi')}</h3>
            <div className="field"><label>{t('b06.nb.col.capture')}</label>{pickObs(t('b06.nb.tableEpi'), nb.epidermis.observationId, ofKind('tradescantia', 'elodea'), 'epi.obs', (n, id) => { n.epidermis.observationId = id; })}</div>
            {usedAt(nb.epidermis.observationId)}
            <div className="field"><label>{t('b06.nb.col.specimen')}</label>{choose(t('b06.nb.col.specimen'), nb.epidermis.specimen, ['tradescantia', 'elodea'] as const, 'epi.sp', (n, v) => { n.epidermis.specimen = v; }, 'b06.specimen')}</div>
            {text('epi.mag', nb.epidermis.totalMag, (n, v) => { n.epidermis.totalMag = v; }, false, 'b06.nb.col.totalMag')}
            <p className="hint">{t('b06.nb.totalMagHelp', { oc: w.params.microscope.ocularX })}</p>
            <div className="field"><label>{t('b06.nb.f.stoma')}</label>{choose(t('b06.nb.f.stoma'), nb.epidermis.stoma, EV3, 'epi.stoma', (n, v) => { n.epidermis.stoma = v as Evidence3; }, 'b06.ev3')}</div>
            <div className="field"><label>{t('b06.nb.f.chloroplasts')}</label>{choose(t('b06.nb.f.chloroplasts'), nb.epidermis.chloroplasts, EV3, 'epi.chl', (n, v) => { n.epidermis.chloroplasts = v as Evidence3; }, 'b06.ev3')}</div>
            {text('epi.limits', nb.epidermis.limits, (n, v) => { n.epidermis.limits = v; }, true, 'b06.nb.f.limits')}
          </section>
        )}

        {tab === 'fixed' && (
          <section aria-label={t('b06.nb.tableFixed')} style={{ display: 'grid', gap: '0.6rem' }}>
            <h3>{t('b06.nb.tableFixed')}</h3>
            {nb.fixed.map((r, i) => (
              <fieldset key={i} className="nb-fieldset">
                <legend>{t('b06.nb.fixedRow', { n: i + 1 })}</legend>
                <div className="field"><label>{t('b06.nb.col.capture')}</label>{pickObs(`${t('b06.nb.col.capture')} ${i + 1}`, r.observationId, compound.filter((o) => w.slides[o.slideId ?? '']?.kind === 'fixed'), `fixed.${i}.obs`, (n, id) => {
                  n.fixed[i].observationId = id;
                  const o = id ? w.observations[id] : null;
                  if (o?.slideId) n.fixed[i].label = w.slides[o.slideId].label ?? '';
                })}</div>
                {text(`fixed.${i}.label`, r.label, (n, v) => { n.fixed[i].label = v; }, false, 'b06.nb.f.label')}
                {text(`fixed.${i}.technique`, r.technique, (n, v) => { n.fixed[i].technique = v; }, false, 'b06.nb.f.technique')}
                {text(`fixed.${i}.objective`, r.objective, (n, v) => { n.fixed[i].objective = v; }, false, 'b06.nb.col.objective')}
                {text(`fixed.${i}.region`, r.region, (n, v) => { n.fixed[i].region = v; }, false, 'b06.nb.f.region')}
                {check(t('b06.nb.f.oil'), r.oil, `fixed.${i}.oil`, (n, v) => { n.fixed[i].oil = v; })}
                {check(t('b06.nb.f.returned'), r.returned, `fixed.${i}.ret`, (n, v) => { n.fixed[i].returned = v; })}
              </fieldset>
            ))}
            <h3>{t('b06.nb.tableBact')}</h3>
            <div className="field"><label>{t('b06.nb.col.capture')}</label>{pickObs(t('b06.nb.tableBact'), nb.bacteria.observationId, ofKind('bacillus', 'cyano'), 'bact.obs', (n, id) => { n.bacteria.observationId = id; })}</div>
            {text('bact.shape', nb.bacteria.shape, (n, v) => { n.bacteria.shape = v; }, false, 'b06.nb.f.shape')}
            <div className="field"><label>{t('b06.nb.f.nucleolus')}</label>{choose(t('b06.nb.f.nucleolus'), nb.bacteria.nucleolus, ['present', 'absent'] as const, 'bact.nucleolus', (n, v) => { n.bacteria.nucleolus = v; }, 'b06.presence')}</div>
            <h3>{t('b06.nb.tableBlood')}</h3>
            <div className="field"><label>{t('b06.nb.col.capture')}</label>{pickObs(t('b06.nb.tableBlood'), nb.blood.observationId, ofKind('blood'), 'blood.obs', (n, id) => { n.blood.observationId = id; })}</div>
            <fieldset className="chips" aria-label={t('b06.nb.f.cells')}>
              {(['erythrocyte', 'leukocyte', 'platelet'] as const).map((c) => (
                <label key={c} className="check small">
                  <input type="checkbox" checked={nb.blood.cells.includes(c)} onChange={(e) => {
                    const next = e.target.checked ? [...nb.blood.cells, c] : nb.blood.cells.filter((x) => x !== c);
                    setNb((n) => { n.blood.cells = next; }, 'blood.cells', nb.blood.cells.join(','), next.join(','));
                  }} /> {t(`b06.structure.${c}`)}
                </label>
              ))}
            </fieldset>
            {text('blood.nuclear', nb.blood.nuclear, (n, v) => { n.blood.nuclear = v; }, false, 'b06.nb.f.nuclear')}
            {text('blood.contrast', nb.blood.contrast, (n, v) => { n.blood.contrast = v; }, false, 'b06.nb.f.contrast')}
            {text('blood.subtype', nb.blood.subtype, (n, v) => { n.blood.subtype = v; }, false, 'b06.nb.f.subtype')}
          </section>
        )}

        {tab === 'marks' && <CaptureMarkerB06 />}

        {tab === 'morpho' && (
          <section aria-label={t('b06.nb.tableMorpho')} style={{ display: 'grid', gap: '0.6rem' }}>
            <h3>{t('b06.nb.tableMorpho')}</h3>
            <p className="hint">{w.div.scale.available ? t('b06.nb.morphoHelp') : t('b06.nb.noScale')}</p>
            {table(t('b06.nb.tableMorpho'), ['measurement', 'pixels', 'umPerPx', 'lengthUm', 'uncertaintyUm', 'unit', 'lengthMm'], nb.morpho.map(morphoTr))}
            <button className="btn small" onClick={() => setNb((n) => { n.morpho.push(morphoRow()); }, 'morpho.add', '', 'row')}>+ {t('b06.nb.addRow')}</button>
            <ul className="fb-list">
              {w.div.measurements.map((m) => <li key={m.id}>{m.id} · {m.observationId} · {fmt(m.rawPixelDistance, 0)} px × {fmt(m.umPerPx, 3)} µm/px</li>)}
            </ul>
          </section>
        )}

        {tab === 'cmp' && (
          <section aria-label={t('b06.nb.tableCmp')} style={{ display: 'grid', gap: '0.6rem' }}>
            <h3>{t('b06.nb.tableCmp')}</h3>
            {table(t('b06.nb.tableCmp'), ['specimen', 'domain', 'cells', 'evidence'], nb.comparison.map(cmpTr))}
            <button className="btn small" onClick={() => setNb((n) => { n.comparison.push(comparisonRow()); }, 'cmp.add', '', 'row')}>+ {t('b06.nb.addRow')}</button>
          </section>
        )}

        {tab === 'close' && (
          <section aria-label={t('b06.nb.tableOpen')} style={{ display: 'grid', gap: '0.6rem' }}>
            <h3>{t('b06.nb.tableOpen')}</h3>
            {text('open.notes', nb.open.notes, (n, v) => { n.open.notes = v; }, true, 'b06.nb.f.notes')}
            {text('open.limitations', nb.open.limitations, (n, v) => { n.open.limitations = v; }, true, 'b06.nb.f.limitations')}
            {text('open.errors', nb.open.errors, (n, v) => { n.open.errors = v; }, true, 'b06.nb.f.errors')}
            <h3>{t('b06.nb.tableClose')}</h3>
            <ul className="fb-list">
              <li>{t('b06.nb.close.oil', { ml: fmt(bal.oil ?? 0, 4) })}</li>
              <li>{t('b06.nb.close.broken', { n: w.shards })}</li>
              <li>{t('b06.nb.close.lensOil', { n: Object.keys(w.div.lensOil).length })}</li>
              <li>{t('b06.nb.close.fixed', { ok: w.assignment.fixedSlideIds.every((id) => w.slideCase.slots[w.slideCase.home[id]] === id) ? '✓' : '✗' })}</li>
            </ul>
            <div className="row">
              <button className="btn primary" onClick={() => dispatch({ type: 'closeBench' })}>{t('b06.act.closeBench')}</button>
              <span className="hint" aria-live="polite">{w.evidence.benchRestored ? `✓ ${t('b06.nb.benchOk')}` : w.evidence.closeAttempted ? t('b06.nb.benchPending') : ''}</span>
            </div>
          </section>
        )}

        {tab === 'questions' && (
          <section aria-label={t('b06.nb.tab.questions')} style={{ display: 'grid', gap: '0.6rem' }}>
            <h3>{t('b06.nb.questions')}</h3>
            {QUESTIONS_B06.map((q) => text(`analysis.${q}`, nb.analysis[q], (n, v) => { n.analysis[q] = v; }))}
          </section>
        )}

        {tab === 'log' && (
          <section aria-label={t('b06.nb.tab.log')}>
            <h3>{t('b06.nb.captures')}</h3>
            <ul className="fb-list">
              {all.map((o) => (
                <li key={o.id}>
                  <span className={o.isObservationValid ? 'ok' : 'bad'}>{o.isObservationValid ? '✓' : '✗'}</span> {olabel(o)} · {fmt(o.t, 0)} s
                  {o.issues.length > 0 && <span className="hint"> · {o.issues.map((q) => t(`b06.issue.${q}`)).join(', ')}</span>}
                </li>
              ))}
            </ul>
            <h3>{t('p4.nb.history', { n: nb.history.length })}</h3>
            <ul className="fb-list" style={{ maxHeight: '14rem', overflow: 'auto' }}>
              {[...nb.history].reverse().slice(0, 80).map((h, i) => <li key={i}><span className="hint">{fmt(h.t, 0)} s</span> {h.field}: «{h.from.slice(0, 40)}» → «{h.to.slice(0, 40)}»</li>)}
            </ul>
            <div className="row">
              <button className="btn small" onClick={() => downloadJson(`libreta-b06-${attemptId}.json`, { attemptId, notebook: nb, observations: w.observations, marks: w.div.marks, measurements: w.div.measurements })}>{t('review.export')}</button>
              <button className="btn small ghost" onClick={() => window.print()}>{t('p10.nb.print')}</button>
            </div>
          </section>
        )}
      </div>
    </aside>
  );
}
