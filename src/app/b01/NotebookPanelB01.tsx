import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useB01 } from './store';
import { MICROSCOPE_PARTS } from '../../simulation/instruments/optical/microscope-types';
import { STEREO_PARTS } from '../../simulation/instruments/optical/stereo-types';
import type { StructureId } from '../../simulation/specimens/assets';
import type { LabObservation } from '../../simulation/optical-world/types';
import { QUESTIONS_B01, fixedRow, microRow, type B01Notebook, type MicroRow, type StereoRow } from '../../practices/practice-b01/notebook';
import { downloadJson } from '../persistence';
import { b01NameOf } from './describe';

type Tab = 'parts' | 'prep' | 'micro' | 'fixed' | 'stereo' | 'compare' | 'close' | 'questions' | 'log';
const TABS: Tab[] = ['parts', 'prep', 'micro', 'fixed', 'stereo', 'compare', 'close', 'questions', 'log'];

/** Glosario general de estructuras (no revela cuáles están en cada activo). */
const MICRO_GLOSSARY: StructureId[] = ['leafBlade', 'midrib', 'leafMargin', 'cellWall', 'chloroplasts', 'epidermalCells', 'nucleus', 'vascularBundle', 'xylem', 'phloem', 'epidermis', 'cortex'];
const STEREO_GLOSSARY: StructureId[] = ['venation', 'leafMargin', 'trichomes', 'head', 'compoundEye', 'antenna', 'thorax', 'abdomen', 'wing', 'leg'];

const fmt = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d).replace('.', ',') : '—');

/**
 * Libreta digital de B01 (§12): partes de los instrumentos, preparación fresca, microscopía, láminas fijas,
 * estereoscopía, comparación, incidentes y cierre (con los cálculos de aumento y campo) y siete preguntas. Las filas de
 * observación IMPORTAN una captura propia; el objetivo, el ocular, el zoom y el aumento instrumental vienen del registro.
 */
export function NotebookPanelB01() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('parts');
  const nb = useB01((s) => s.notebook);
  const setNb = useB01((s) => s.setNotebook);
  const toggle = useB01((s) => s.toggleNotebook);
  const savedAt = useB01((s) => s.savedAt);
  const dispatch = useB01((s) => s.dispatch);
  useB01((s) => s.version);
  const rt = useB01((s) => s.runtime);
  const attemptId = useB01((s) => s.attemptId);
  const wanted = useB01((s) => s.notebookTab);
  useEffect(() => {
    if (wanted) setTab(wanted as Tab);
  }, [wanted]);
  if (!rt) return null;
  const w = rt.world;
  const all = w.observationOrder.map((id) => w.observations[id]);
  const obs = (inst: LabObservation['instrument']) => all.filter((o) => o.instrument === inst);
  const olabel = (o: LabObservation) => `${o.id} · ${b01NameOf(w, o.slideId ?? o.specimenId)} · ${o.objectiveX ? `${o.objectiveX}X` : `zoom ${fmt(o.zoomX ?? 1, 1)}X`}${o.isObservationValid ? '' : ' ✗'}`;

  const text = (path: string, value: string, set: (n: B01Notebook, v: string) => void, area = true, labelKey?: string) => {
    const idf = `b01-${path.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const on = (v: string) => setNb((n) => set(n, v), path, value, v);
    return (
      <div className="field" key={path}>
        <label htmlFor={idf}>{t(labelKey ?? `b01.nb.f.${path}`)}</label>
        {area ? <textarea id={idf} value={value} onChange={(e) => on(e.target.value)} /> : <input id={idf} type="text" value={value} onChange={(e) => on(e.target.value)} />}
      </div>
    );
  };
  const small = (label: string, value: string, path: string, set: (n: B01Notebook, v: string) => void) => (
    <input aria-label={label} type="text" value={value} onChange={(e) => setNb((n) => set(n, e.target.value), path, value, e.target.value)} />
  );
  const choose = <T extends string>(label: string, value: T, options: readonly T[], path: string, set: (n: B01Notebook, v: T) => void, keyPrefix: string) => (
    <select aria-label={label} value={value} onChange={(e) => setNb((n) => set(n, e.target.value as T), path, value, e.target.value)}>
      <option value="">{t('nb.choose')}</option>
      {options.filter(Boolean).map((o) => <option key={o} value={o}>{t(`${keyPrefix}.${o}`)}</option>)}
    </select>
  );
  const pickObs = (label: string, value: string | null, opts: LabObservation[], path: string, set: (n: B01Notebook, id: string | null) => void) => (
    <select aria-label={label} value={value ?? ''} onChange={(e) => setNb((n) => set(n, e.target.value || null), path, value ?? '', e.target.value)}>
      <option value="">📥 {t('b01.nb.import')}</option>
      {opts.map((o) => <option key={o.id} value={o.id}>{olabel(o)}</option>)}
    </select>
  );
  const structures = (label: string, value: StructureId[], glossary: StructureId[], path: string, set: (n: B01Notebook, v: StructureId[]) => void) => (
    <fieldset className="chips" aria-label={label}>
      {glossary.map((s) => (
        <label key={s} className="check small">
          <input type="checkbox" checked={value.includes(s)} onChange={(e) => {
            const next = e.target.checked ? [...value, s] : value.filter((x) => x !== s);
            setNb((n) => set(n, next), path, value.join(','), next.join(','));
          }} /> {t(`b01.structure.${s}`)}
        </label>
      ))}
    </fieldset>
  );
  const microTr = (r: MicroRow, i: number) => {
    const o = r.observationId ? w.observations[r.observationId] : null;
    const up = (fn: (x: MicroRow) => void) => (n: B01Notebook) => fn(n.micro[i]);
    return (
      <tr key={i}>
        <td>{pickObs(`${t('b01.nb.col.capture')} ${i + 1}`, r.observationId, obs('compound'), `micro.${i}.obs`, (n, id) => up((x) => { x.observationId = id; })(n))}</td>
        <td>{choose(`${t('b01.nb.col.specimen')} ${i + 1}`, r.specimen, ['elodea', 'fixed'] as const, `micro.${i}.sp`, (n, v) => up((x) => { x.specimen = v; })(n), 'b01.specimen')}</td>
        <td>{o?.objectiveX ? `${o.objectiveX}X` : '—'}</td>
        <td>{o ? `${o.ocularX}X` : '—'}</td>
        <td>{small(`${t('b01.nb.col.totalMag')} ${i + 1}`, r.totalMag, `micro.${i}.mag`, (n, v) => up((x) => { x.totalMag = v; })(n))}</td>
        <td>{small(`${t('b01.nb.col.region')} ${i + 1}`, r.region, `micro.${i}.reg`, (n, v) => up((x) => { x.region = v; })(n))}</td>
        <td>{structures(`${t('b01.nb.col.structures')} ${i + 1}`, r.structures, MICRO_GLOSSARY, `micro.${i}.st`, (n, v) => up((x) => { x.structures = v; })(n))}</td>
      </tr>
    );
  };
  const stereoRow = (key: 'leaf' | 'insect') => {
    const r = nb.stereo[key];
    const o = r.observationId ? w.observations[r.observationId] : null;
    const up = (fn: (x: StereoRow) => void) => (n: B01Notebook) => fn(n.stereo[key]);
    return (
      <fieldset key={key} className="nb-fieldset">
        <legend>{t(`b01.specimen.${key}`)}</legend>
        <div className="field"><label>{t('b01.nb.col.capture')}</label>{pickObs(`${t('b01.nb.col.capture')} ${key}`, r.observationId, obs('stereo'), `stereo.${key}.obs`, (n, id) => up((x) => { x.observationId = id; })(n))}</div>
        <p className="hint">{o ? t('b01.nb.zoomUsed', { z: fmt(o.zoomX ?? 1, 1), mag: Math.round(o.magnification) }) : ''}</p>
        <div className="field"><label>{t('b01.nb.col.light')}</label>{choose(`${t('b01.nb.col.light')} ${key}`, r.light, ['incident', 'transmitted', 'both'] as const, `stereo.${key}.light`, (n, v) => up((x) => { x.light = v; })(n), 'b01.light')}</div>
        <div className="field"><label>{t('b01.nb.col.traits')}</label>{structures(`${t('b01.nb.col.traits')} ${key}`, r.structures, STEREO_GLOSSARY, `stereo.${key}.st`, (n, v) => up((x) => { x.structures = v; })(n))}</div>
      </fieldset>
    );
  };

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
          {TABS.map((k) => <button key={k} role="tab" className="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{t(`b01.nb.tab.${k}`)}</button>)}
        </div>

        {tab === 'parts' && (
          <section aria-label={t('b01.nb.tab.parts')} style={{ display: 'grid', gap: '0.6rem' }}>
            <h3>{t('b01.nb.tableParts')}</h3>
            <p className="hint">{t('b01.nb.tablePartsHelp')}</p>
            <table className="nb-table">
              <thead><tr><th>{t('b01.nb.col.part')}</th><th>{t('b01.nb.col.action')}</th><th>{t('b01.nb.col.function')}</th></tr></thead>
              <tbody>
                {MICROSCOPE_PARTS.map((p) => (
                  <tr key={p}>
                    <th scope="row">{t(`b01.part.mic_${p}`)}{w.evidence[`used:mic:${p}`] ? ' ✓' : ''}</th>
                    <td>{small(`${t('b01.nb.col.action')} ${t(`b01.part.mic_${p}`)}`, nb.parts[p].action, `parts.${p}.a`, (n, v) => { n.parts[p].action = v; })}</td>
                    <td>{small(`${t('b01.nb.col.function')} ${t(`b01.part.mic_${p}`)}`, nb.parts[p].function, `parts.${p}.f`, (n, v) => { n.parts[p].function = v; })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <h3>{t('b01.nb.tableStereoParts')}</h3>
            <table className="nb-table">
              <thead><tr><th>{t('b01.nb.col.part')}</th><th>{t('b01.nb.col.function')}</th><th>{t('b01.nb.col.use')}</th></tr></thead>
              <tbody>
                {STEREO_PARTS.map((p) => (
                  <tr key={p}>
                    <th scope="row">{t(`b01.part.ste_${p}`)}{w.evidence[`used:ste:${p}`] ? ' ✓' : ''}</th>
                    <td>{small(`${t('b01.nb.col.function')} ${t(`b01.part.ste_${p}`)}`, nb.stereoParts[p].function, `sparts.${p}.f`, (n, v) => { n.stereoParts[p].function = v; })}</td>
                    <td>{small(`${t('b01.nb.col.use')} ${t(`b01.part.ste_${p}`)}`, nb.stereoParts[p].action, `sparts.${p}.a`, (n, v) => { n.stereoParts[p].action = v; })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {tab === 'prep' && (
          <section aria-label={t('b01.nb.tablePrep')} style={{ display: 'grid', gap: '0.6rem' }}>
            <h3>{t('b01.nb.tablePrep')}</h3>
            <div className="field"><label>{t('b01.nb.col.specimen')}</label>{choose(t('b01.nb.col.specimen'), nb.prep.specimen, ['elodea'] as const, 'prep.sp', (n, v) => { n.prep.specimen = v; }, 'b01.specimen')}</div>
            <div className="field"><label>{t('b01.nb.f.cutType')}</label>{choose(t('b01.nb.f.cutType'), nb.prep.cutType, ['none', 'fragment'] as const, 'prep.cut', (n, v) => { n.prep.cutType = v; }, 'b01.cut')}</div>
            {text('prep.water', nb.prep.waterMl, (n, v) => { n.prep.waterMl = v; }, false, 'b01.nb.f.waterMl')}
            <div className="field"><label>{t('b01.nb.f.cover')}</label>{choose(t('b01.nb.f.cover'), nb.prep.cover, ['angled', 'flat', 'none'] as const, 'prep.cover', (n, v) => { n.prep.cover = v; }, 'b01.coverWay')}</div>
            {text('prep.incidents', nb.prep.incidents, (n, v) => { n.prep.incidents = v; }, true, 'b01.nb.f.prepIncidents')}
          </section>
        )}

        {tab === 'micro' && (
          <section aria-label={t('b01.nb.tableMicro')} style={{ display: 'grid', gap: '0.6rem' }}>
            <h3>{t('b01.nb.tableMicro')}</h3>
            <p className="hint">{t('b01.nb.tableMicroHelp')}</p>
            <div className="table-scroll" tabIndex={0} role="region" aria-label={t('b01.nb.tableMicro')}>
              <table className="nb-table">
                <thead><tr><th>{t('b01.nb.col.capture')}</th><th>{t('b01.nb.col.specimen')}</th><th>{t('b01.nb.col.objective')}</th><th>{t('b01.nb.col.ocular')}</th><th>{t('b01.nb.col.totalMag')}</th><th>{t('b01.nb.col.region')}</th><th>{t('b01.nb.col.structures')}</th></tr></thead>
                <tbody>{nb.micro.map(microTr)}</tbody>
              </table>
            </div>
            <button className="btn small" onClick={() => setNb((n) => { n.micro.push(microRow()); }, 'micro.add', '', 'row')}>+ {t('b01.nb.addRow')}</button>
          </section>
        )}

        {tab === 'fixed' && (
          <section aria-label={t('b01.nb.tableFixed')} style={{ display: 'grid', gap: '0.6rem' }}>
            <h3>{t('b01.nb.tableFixed')}</h3>
            {nb.fixed.map((r, i) => (
              <fieldset key={i} className="nb-fieldset">
                <legend>{t('b01.nb.fixedRow', { n: i + 1 })}</legend>
                <div className="field"><label>{t('b01.nb.col.capture')}</label>{pickObs(`${t('b01.nb.col.capture')} ${i + 1}`, r.observationId, obs('compound').filter((o) => w.slides[o.slideId ?? '']?.kind === 'fixed'), `fixed.${i}.obs`, (n, id) => {
                  n.fixed[i].observationId = id;
                  const o = id ? w.observations[id] : null;
                  if (o?.slideId) {
                    n.fixed[i].label = w.slides[o.slideId].label ?? '';
                    n.fixed[i].slot = w.slideCase.home[o.slideId] ?? '';
                  }
                })}</div>
                {text(`fixed.${i}.label`, r.label, (n, v) => { n.fixed[i].label = v; }, false, 'b01.nb.f.label')}
                {text(`fixed.${i}.slot`, r.slot, (n, v) => { n.fixed[i].slot = v; }, false, 'b01.nb.f.slot')}
                {text(`fixed.${i}.desc`, r.description, (n, v) => { n.fixed[i].description = v; }, true, 'b01.nb.f.description')}
                <label className="check"><input type="checkbox" checked={r.returned} onChange={(e) => setNb((n) => { n.fixed[i].returned = e.target.checked; }, `fixed.${i}.ret`, String(r.returned), String(e.target.checked))} /> {t('b01.nb.f.returned')}</label>
              </fieldset>
            ))}
            <button className="btn small" onClick={() => setNb((n) => { n.fixed.push(fixedRow()); }, 'fixed.add', '', 'row')}>+ {t('b01.nb.addRow')}</button>
          </section>
        )}

        {tab === 'stereo' && (
          <section aria-label={t('b01.nb.tableStereo')} style={{ display: 'grid', gap: '0.6rem' }}>
            <h3>{t('b01.nb.tableStereo')}</h3>
            <p className="hint">{t('b01.nb.tableStereoHelp')}</p>
            {stereoRow('leaf')}
            {stereoRow('insect')}
          </section>
        )}

        {tab === 'compare' && (
          <section aria-label={t('b01.nb.tableCompare')} style={{ display: 'grid', gap: '0.6rem' }}>
            <h3>{t('b01.nb.tableCompare')}</h3>
            {text('cmp.fov', nb.comparison.fov, (n, v) => { n.comparison.fov = v; }, true, 'b01.nb.f.fov')}
            {text('cmp.depth', nb.comparison.depth, (n, v) => { n.comparison.depth = v; }, true, 'b01.nb.f.depth')}
            {text('cmp.purpose', nb.comparison.purpose, (n, v) => { n.comparison.purpose = v; }, true, 'b01.nb.f.purpose')}
          </section>
        )}

        {tab === 'close' && (
          <section aria-label={t('b01.nb.tableClose')} style={{ display: 'grid', gap: '0.6rem' }}>
            <h3>{t('b01.nb.tableCalc')}</h3>
            <p className="hint">{t('b01.nb.tableCalcHelp', { fn: w.params.microscope.fieldNumberMm, oc: w.params.microscope.ocularX })}</p>
            <table className="nb-table">
              <thead><tr><th>{t('b01.nb.col.objective')}</th><th>{t('b01.nb.col.totalMag')}</th><th>{t('b01.nb.col.fov')}</th></tr></thead>
              <tbody>
                {([4, 10, 40] as const).map((x) => (
                  <tr key={x}>
                    <th scope="row">{x}X</th>
                    <td>{small(`${t('b01.nb.col.totalMag')} ${x}X`, nb.calc[`mag${x}`], `calc.mag${x}`, (n, v) => { n.calc[`mag${x}`] = v; })}</td>
                    <td>{small(`${t('b01.nb.col.fov')} ${x}X`, nb.calc[`fov${x}`], `calc.fov${x}`, (n, v) => { n.calc[`fov${x}`] = v; })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <h3>{t('b01.nb.tableClose')}</h3>
            {text('inc.error', nb.incidents.error, (n, v) => { n.incidents.error = v; }, true, 'b01.nb.f.error')}
            {text('inc.consequence', nb.incidents.consequence, (n, v) => { n.incidents.consequence = v; }, true, 'b01.nb.f.consequence')}
            {text('inc.recovery', nb.incidents.recovery, (n, v) => { n.incidents.recovery = v; }, true, 'b01.nb.f.recovery')}
            {text('inc.inventory', nb.incidents.inventory, (n, v) => { n.incidents.inventory = v; }, false, 'b01.nb.f.inventory')}
            <div className="row">
              <button className="btn primary" onClick={() => dispatch({ type: 'closeBench' })}>{t('b01.act.closeBench')}</button>
              <span className="hint" aria-live="polite">{w.evidence.benchRestored ? `✓ ${t('b01.nb.benchOk')}` : w.evidence.closeAttempted ? t('b01.nb.benchPending') : ''}</span>
            </div>
          </section>
        )}

        {tab === 'questions' && (
          <section aria-label={t('b01.nb.tab.questions')} style={{ display: 'grid', gap: '0.6rem' }}>
            <h3>{t('b01.nb.questions')}</h3>
            {QUESTIONS_B01.map((q) => text(`analysis.${q}`, nb.analysis[q], (n, v) => { n.analysis[q] = v; }))}
          </section>
        )}

        {tab === 'log' && (
          <section aria-label={t('b01.nb.tab.log')}>
            <h3>{t('b01.nb.captures')}</h3>
            <ul className="fb-list">
              {all.map((o) => (
                <li key={o.id}>
                  <span className={o.isObservationValid ? 'ok' : 'bad'}>{o.isObservationValid ? '✓' : '✗'}</span> {olabel(o)} · {fmt(o.t, 0)} s
                  {o.issues.length > 0 && <span className="hint"> · {o.issues.map((q) => t(`b01.issue.${q}`)).join(', ')}</span>}
                </li>
              ))}
            </ul>
            <h3>{t('p4.nb.history', { n: nb.history.length })}</h3>
            <ul className="fb-list" style={{ maxHeight: '14rem', overflow: 'auto' }}>
              {[...nb.history].reverse().slice(0, 80).map((h, i) => <li key={i}><span className="hint">{fmt(h.t, 0)} s</span> {h.field}: «{h.from.slice(0, 40)}» → «{h.to.slice(0, 40)}»</li>)}
            </ul>
            <div className="row">
              <button className="btn small" onClick={() => downloadJson(`libreta-b01-${attemptId}.json`, { attemptId, notebook: nb, observations: w.observations })}>{t('review.export')}</button>
              <button className="btn small ghost" onClick={() => window.print()}>{t('p10.nb.print')}</button>
            </div>
          </section>
        )}
      </div>
    </aside>
  );
}
