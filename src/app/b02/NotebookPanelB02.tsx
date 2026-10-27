import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useB02 } from './store';
import type { StructureId } from '../../simulation/specimens/assets';
import type { LabObservation } from '../../simulation/optical-world/types';
import { CELL_KINDS, STAINS, type CellKind } from '../../simulation/specimens/thin-section';
import { obsKind } from '../../practices/practice-b02/expected-results';
import { QUESTIONS_B02, atlasRow, figureRow, type AtlasRow, type B02Notebook, type FigureRow, type HypothesisRow, type PrepRow } from '../../practices/practice-b02/notebook';
import { downloadJson } from '../persistence';
import { b02NameOf } from './describe';

type Tab = 'hyp' | 'prep' | 'atlas' | 'potato' | 'walls' | 'buccal' | 'elodea' | 'extra' | 'close' | 'questions' | 'log';
const TABS: Tab[] = ['hyp', 'prep', 'atlas', 'potato', 'walls', 'buccal', 'elodea', 'extra', 'close', 'questions', 'log'];

/** Glosario general (no revela qué hay en cada recurso): señalar algo que la captura no sustenta es un error del estudiante. */
const GLOSSARY: StructureId[] = ['fruitCells', 'cellWall', 'vacuole', 'cellMembrane', 'nucleus', 'chloroplasts', 'chromoplasts', 'amyloplasts', 'starchGrains', 'sclereids', 'epithelialCells', 'cellBorder', 'cytoplasm', 'leafBlade'];
const STAIN_OPTS = ['water', ...STAINS] as const;

const fmt = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d).replace('.', ',') : '—');

/**
 * Libreta digital de B02 (§12): hipótesis, preparación, atlas de plastidios, papa + Lugol, esclereidas, epitelio
 * bucal, Elodea, rutas opcionales, comparación y bitácora (con figuras y escala), diez preguntas y registro. Las filas
 * de observación IMPORTAN una captura propia; el objetivo y el aumento instrumental vienen del registro, lo señalado
 * y lo interpretado es del estudiante.
 */
export function NotebookPanelB02() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('hyp');
  const nb = useB02((s) => s.notebook);
  const setNb = useB02((s) => s.setNotebook);
  const toggle = useB02((s) => s.toggleNotebook);
  const savedAt = useB02((s) => s.savedAt);
  const dispatch = useB02((s) => s.dispatch);
  useB02((s) => s.version);
  const rt = useB02((s) => s.runtime);
  const attemptId = useB02((s) => s.attemptId);
  const wanted = useB02((s) => s.notebookTab);
  useEffect(() => {
    if (wanted) setTab(wanted as Tab);
  }, [wanted]);
  if (!rt) return null;
  const w = rt.world;
  const all = w.observationOrder.map((id) => w.observations[id]);
  const compound = all.filter((o) => o.instrument === 'compound');
  const olabel = (o: LabObservation) => {
    const k = obsKind(w, o);
    const name = k && k !== 'fixed' && k !== 'leaf' && k !== 'insect' ? t(`b02.specimen.${k}`) : b02NameOf(w, o.slideId ?? o.specimenId);
    return `${o.id} · ${name}${o.specimenId.startsWith('ctl:') ? ` (${t('b02.nb.control')})` : ''} · ${o.objectiveX ? `${o.objectiveX}X` : `zoom ${fmt(o.zoomX ?? 1, 1)}X`}${o.isObservationValid ? '' : ' ✗'}`;
  };
  const ofKind = (...ks: string[]) => compound.filter((o) => ks.includes(obsKind(w, o) ?? ''));

  const text = (path: string, value: string, set: (n: B02Notebook, v: string) => void, area = true, labelKey?: string) => {
    const idf = `b02-${path.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const on = (v: string) => setNb((n) => set(n, v), path, value, v);
    return (
      <div className="field" key={path}>
        <label htmlFor={idf}>{t(labelKey ?? `b02.nb.f.${path}`)}</label>
        {area ? <textarea id={idf} value={value} onChange={(e) => on(e.target.value)} /> : <input id={idf} type="text" value={value} onChange={(e) => on(e.target.value)} />}
      </div>
    );
  };
  const small = (label: string, value: string, path: string, set: (n: B02Notebook, v: string) => void) => (
    <input aria-label={label} type="text" value={value} onChange={(e) => setNb((n) => set(n, e.target.value), path, value, e.target.value)} />
  );
  const choose = <T extends string>(label: string, value: T, options: readonly T[], path: string, set: (n: B02Notebook, v: T) => void, keyPrefix: string) => (
    <select aria-label={label} value={value} onChange={(e) => setNb((n) => set(n, e.target.value as T), path, value, e.target.value)}>
      <option value="">{t('nb.choose')}</option>
      {options.filter(Boolean).map((o) => <option key={o} value={o}>{t(`${keyPrefix}.${o}`)}</option>)}
    </select>
  );
  const pickObs = (label: string, value: string | null, opts: LabObservation[], path: string, set: (n: B02Notebook, id: string | null) => void) => (
    <select aria-label={label} value={value ?? ''} onChange={(e) => setNb((n) => set(n, e.target.value || null), path, value ?? '', e.target.value)}>
      <option value="">📥 {t('b02.nb.import')}</option>
      {opts.map((o) => <option key={o.id} value={o.id}>{olabel(o)}</option>)}
    </select>
  );
  const structures = (label: string, value: StructureId[], path: string, set: (n: B02Notebook, v: StructureId[]) => void) => (
    <fieldset className="chips" aria-label={label}>
      {GLOSSARY.map((s) => (
        <label key={s} className="check small">
          <input type="checkbox" checked={value.includes(s)} onChange={(e) => {
            const next = e.target.checked ? [...value, s] : value.filter((x) => x !== s);
            setNb((n) => set(n, next), path, value.join(','), next.join(','));
          }} /> {t(`b02.structure.${s}`)}
        </label>
      ))}
    </fieldset>
  );
  const usedAt = (id: string | null) => {
    const o = id ? w.observations[id] : null;
    return o ? <p className="hint">{t('b02.nb.capturedAt', { obj: o.objectiveX ?? '—', mag: Math.round(o.magnification) })}</p> : null;
  };
  const hypTr = (r: HypothesisRow, i: number) => (
    <tr key={i}>
      <td>{choose(`${t('b02.nb.col.material')} ${i + 1}`, r.material, CELL_KINDS, `hyp.${i}.m`, (n, v) => { n.hypotheses[i].material = v; }, 'b02.specimen')}</td>
      <td>{choose(`${t('b02.nb.col.expected')} ${i + 1}`, r.expected, ['chloroplast', 'chromoplast', 'amyloplast', 'sclereids', 'nucleus', 'none'] as const, `hyp.${i}.e`, (n, v) => { n.hypotheses[i].expected = v; }, 'b02.expected')}</td>
      <td>{small(`${t('b02.nb.col.reason')} ${i + 1}`, r.reason, `hyp.${i}.r`, (n, v) => { n.hypotheses[i].reason = v; })}</td>
    </tr>
  );
  const prepTr = (r: PrepRow, i: number) => (
    <tr key={i}>
      <td>{choose(`${t('b02.nb.col.specimen')} ${i + 1}`, r.specimen, CELL_KINDS, `prep.${i}.sp`, (n, v) => { n.prep[i].specimen = v; }, 'b02.specimen')}</td>
      <td>{choose(`${t('b02.nb.col.technique')} ${i + 1}`, r.technique, ['leaf', 'cut', 'scrape', 'smear'] as const, `prep.${i}.tq`, (n, v) => { n.prep[i].technique = v; }, 'b02.technique')}</td>
      <td>{choose(`${t('b02.nb.col.reagent')} ${i + 1}`, r.reagent, STAIN_OPTS, `prep.${i}.rg`, (n, v) => { n.prep[i].reagent = v; }, 'b02.reagent')}</td>
      <td>{choose(`${t('b02.nb.col.cover')} ${i + 1}`, r.cover, ['clean', 'bubbles', 'none'] as const, `prep.${i}.cv`, (n, v) => { n.prep[i].cover = v; }, 'b02.coverState')}</td>
      <td>{small(`${t('b02.nb.col.state')} ${i + 1}`, r.state, `prep.${i}.st`, (n, v) => { n.prep[i].state = v; })}</td>
    </tr>
  );
  const atlasTr = (r: AtlasRow, i: number) => {
    const o = r.observationId ? w.observations[r.observationId] : null;
    const up = (fn: (x: AtlasRow) => void) => (n: B02Notebook) => fn(n.atlas[i]);
    return (
      <tr key={i}>
        <td>{pickObs(`${t('b02.nb.col.capture')} ${i + 1}`, r.observationId, compound, `atlas.${i}.obs`, (n, id) => up((x) => { x.observationId = id; })(n))}</td>
        <td>{choose(`${t('b02.nb.col.specimen')} ${i + 1}`, r.specimen, CELL_KINDS, `atlas.${i}.sp`, (n, v) => up((x) => { x.specimen = v; })(n), 'b02.specimen')}</td>
        <td>{o?.objectiveX ? `${o.objectiveX}X` : '—'}</td>
        <td>{small(`${t('b02.nb.col.totalMag')} ${i + 1}`, r.totalMag, `atlas.${i}.mag`, (n, v) => up((x) => { x.totalMag = v; })(n))}</td>
        <td>{choose(`${t('b02.nb.col.plastid')} ${i + 1}`, r.plastid, ['chloroplast', 'chromoplast', 'amyloplast', 'none'] as const, `atlas.${i}.pl`, (n, v) => up((x) => { x.plastid = v; })(n), 'b02.plastid')}</td>
        <td>{small(`${t('b02.nb.col.color')} ${i + 1}`, r.color, `atlas.${i}.col`, (n, v) => up((x) => { x.color = v; })(n))}</td>
        <td>{structures(`${t('b02.nb.col.structures')} ${i + 1}`, r.structures, `atlas.${i}.st`, (n, v) => up((x) => { x.structures = v; })(n))}</td>
      </tr>
    );
  };
  const figureFs = (r: FigureRow, i: number) => (
    <fieldset key={i} className="nb-fieldset">
      <legend>{t('b02.nb.figure', { n: i + 1 })}</legend>
      <div className="field"><label>{t('b02.nb.col.capture')}</label>{pickObs(`${t('b02.nb.figure', { n: i + 1 })}`, r.observationId, all, `fig.${i}.obs`, (n, id) => { n.figures[i].observationId = id; })}</div>
      <div className="field"><label>{t('b02.nb.col.specimen')}</label>{choose(`${t('b02.nb.col.specimen')} ${t('b02.nb.figure', { n: i + 1 })}`, r.specimen, [...CELL_KINDS, 'fixed', 'leaf', 'insect'] as Array<CellKind | 'fixed' | 'leaf' | 'insect'>, `fig.${i}.sp`, (n, v) => { n.figures[i].specimen = v; }, 'b02.specimen')}</div>
      {text(`fig.${i}.cap`, r.caption, (n, v) => { n.figures[i].caption = v; }, false, 'b02.nb.f.caption')}
    </fieldset>
  );

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
          {TABS.map((k) => <button key={k} role="tab" className="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{t(`b02.nb.tab.${k}`)}</button>)}
        </div>

        {tab === 'hyp' && (
          <section aria-label={t('b02.nb.tableHyp')} style={{ display: 'grid', gap: '0.6rem' }}>
            <h3>{t('b02.nb.tableHyp')}</h3>
            <p className="hint">{t('b02.nb.tableHypHelp')}</p>
            <table className="nb-table">
              <thead><tr><th>{t('b02.nb.col.material')}</th><th>{t('b02.nb.col.expected')}</th><th>{t('b02.nb.col.reason')}</th></tr></thead>
              <tbody>{nb.hypotheses.map(hypTr)}</tbody>
            </table>
          </section>
        )}

        {tab === 'prep' && (
          <section aria-label={t('b02.nb.tablePrep')} style={{ display: 'grid', gap: '0.6rem' }}>
            <h3>{t('b02.nb.tablePrep')}</h3>
            <div className="table-scroll" tabIndex={0} role="region" aria-label={t('b02.nb.tablePrep')}>
              <table className="nb-table">
                <thead><tr><th>{t('b02.nb.col.specimen')}</th><th>{t('b02.nb.col.technique')}</th><th>{t('b02.nb.col.reagent')}</th><th>{t('b02.nb.col.cover')}</th><th>{t('b02.nb.col.state')}</th></tr></thead>
                <tbody>{nb.prep.map(prepTr)}</tbody>
              </table>
            </div>
          </section>
        )}

        {tab === 'atlas' && (
          <section aria-label={t('b02.nb.tableAtlas')} style={{ display: 'grid', gap: '0.6rem' }}>
            <h3>{t('b02.nb.tableAtlas')}</h3>
            <p className="hint">{t('b02.nb.tableAtlasHelp', { oc: w.params.microscope.ocularX })}</p>
            <div className="table-scroll" tabIndex={0} role="region" aria-label={t('b02.nb.tableAtlas')}>
              <table className="nb-table">
                <thead><tr><th>{t('b02.nb.col.capture')}</th><th>{t('b02.nb.col.specimen')}</th><th>{t('b02.nb.col.objective')}</th><th>{t('b02.nb.col.totalMag')}</th><th>{t('b02.nb.col.plastid')}</th><th>{t('b02.nb.col.color')}</th><th>{t('b02.nb.col.structures')}</th></tr></thead>
                <tbody>{nb.atlas.map(atlasTr)}</tbody>
              </table>
            </div>
            <button className="btn small" onClick={() => setNb((n) => { n.atlas.push(atlasRow()); }, 'atlas.add', '', 'row')}>+ {t('b02.nb.addRow')}</button>
          </section>
        )}

        {tab === 'potato' && (
          <section aria-label={t('b02.nb.tablePotato')} style={{ display: 'grid', gap: '0.6rem' }}>
            <h3>{t('b02.nb.tablePotato')}</h3>
            <div className="field"><label>{t('b02.nb.col.capture')}</label>{pickObs(t('b02.nb.tablePotato'), nb.potato.observationId, ofKind('potato'), 'potato.obs', (n, id) => { n.potato.observationId = id; })}</div>
            {usedAt(nb.potato.observationId)}
            <div className="field"><label>{t('b02.nb.f.stained')}</label>{choose(t('b02.nb.f.stained'), nb.potato.stained, ['yes', 'no'] as const, 'potato.stained', (n, v) => { n.potato.stained = v; }, 'b02.yesno')}</div>
            <div className="field"><label>{t('b02.nb.f.grains')}</label>{choose(t('b02.nb.f.grains'), nb.potato.grains, ['visible', 'notVisible'] as const, 'potato.grains', (n, v) => { n.potato.grains = v; }, 'b02.grains')}</div>
            {text('potato.interp', nb.potato.interpretation, (n, v) => { n.potato.interpretation = v; }, true, 'b02.nb.f.interpretation')}
          </section>
        )}

        {tab === 'walls' && (
          <section aria-label={t('b02.nb.tableWalls')} style={{ display: 'grid', gap: '0.6rem' }}>
            <h3>{t('b02.nb.tableWalls')}</h3>
            <div className="field"><label>{t('b02.nb.col.capture')}</label>{pickObs(t('b02.nb.tableWalls'), nb.sclereids.observationId, ofKind('pear', 'guava', 'apple'), 'scl.obs', (n, id) => { n.sclereids.observationId = id; })}</div>
            {usedAt(nb.sclereids.observationId)}
            <div className="field"><label>{t('b02.nb.f.fruit')}</label>{choose(t('b02.nb.f.fruit'), nb.sclereids.fruit, ['pear', 'guava', 'apple'] as CellKind[], 'scl.fruit', (n, v) => { n.sclereids.fruit = v; }, 'b02.specimen')}</div>
            {text('scl.region', nb.sclereids.region, (n, v) => { n.sclereids.region = v; }, false, 'b02.nb.f.region')}
            <div className="field"><label>{t('b02.nb.f.walls')}</label>{choose(t('b02.nb.f.walls'), nb.sclereids.walls, ['thick', 'thin'] as const, 'scl.walls', (n, v) => { n.sclereids.walls = v; }, 'b02.walls')}</div>
            <div className="field"><label>{t('b02.nb.f.eosinShows')}</label>{choose(t('b02.nb.f.eosinShows'), nb.sclereids.eosinShows, ['contrast', 'lignin', 'notUsed'] as const, 'scl.eosin', (n, v) => { n.sclereids.eosinShows = v; }, 'b02.eosinShows')}</div>
            <div className="field"><label>{t('b02.nb.f.wallCause')}</label>{choose(t('b02.nb.f.wallCause'), nb.sclereids.wallCause, ['secondaryWall', 'eosinLignin', 'unknown'] as const, 'scl.cause', (n, v) => { n.sclereids.wallCause = v; }, 'b02.wallCause')}</div>
          </section>
        )}

        {tab === 'buccal' && (
          <section aria-label={t('b02.nb.tableBuccal')} style={{ display: 'grid', gap: '0.6rem' }}>
            <h3>{t('b02.nb.tableBuccal')}</h3>
            <p className="hint">{t('b02.nb.tableBuccalHelp')}</p>
            <div className="field"><label>{t('b02.nb.col.capture')}</label>{pickObs(t('b02.nb.tableBuccal'), nb.buccal.observationId, ofKind('buccal'), 'buccal.obs', (n, id) => { n.buccal.observationId = id; })}</div>
            {usedAt(nb.buccal.observationId)}
            <div className="field"><label>{t('b02.nb.col.reagent')}</label>{choose(t('b02.nb.col.reagent'), nb.buccal.stain, STAIN_OPTS, 'buccal.stain', (n, v) => { n.buccal.stain = v; }, 'b02.reagent')}</div>
            {text('buccal.smear', nb.buccal.smear, (n, v) => { n.buccal.smear = v; }, false, 'b02.nb.f.smear')}
            <div className="field"><label>{t('b02.nb.col.structures')}</label>{structures(t('b02.nb.col.structures'), nb.buccal.structures, 'buccal.st', (n, v) => { n.buccal.structures = v; })}</div>
          </section>
        )}

        {tab === 'elodea' && (
          <section aria-label={t('b02.nb.tableElodea')} style={{ display: 'grid', gap: '0.6rem' }}>
            <h3>{t('b02.nb.tableElodea')}</h3>
            <div className="field"><label>{t('b02.nb.col.capture')}</label>{pickObs(t('b02.nb.tableElodea'), nb.elodea.observationId, ofKind('elodea'), 'elodea.obs', (n, id) => { n.elodea.observationId = id; })}</div>
            {usedAt(nb.elodea.observationId)}
            {text('elodea.mag', nb.elodea.totalMag, (n, v) => { n.elodea.totalMag = v; }, false, 'b02.nb.col.totalMag')}
            <div className="field"><label>{t('b02.nb.col.structures')}</label>{structures(t('b02.nb.col.structures'), nb.elodea.structures, 'elodea.st', (n, v) => { n.elodea.structures = v; })}</div>
            <div className="field"><label>{t('b02.nb.f.motion')}</label>{choose(t('b02.nb.f.motion'), nb.elodea.motion, ['notShown', 'observed', 'needsVideo'] as const, 'elodea.motion', (n, v) => { n.elodea.motion = v; }, 'b02.motion')}</div>
            {w.cell.routes.video && <button className="btn small" onClick={() => dispatch({ type: 'requestVideo' })}>{t('b02.act.requestVideo')}</button>}
          </section>
        )}

        {tab === 'extra' && (
          <section aria-label={t('b02.nb.tab.extra')} style={{ display: 'grid', gap: '0.6rem' }}>
            {!w.cell.routes.fixed && !w.cell.routes.stereo && <p className="hint">{t('b02.nb.noRoutes')}</p>}
            {w.cell.routes.fixed && (
              <fieldset className="nb-fieldset">
                <legend>{t('b02.nb.tableFixed')}</legend>
                <div className="field"><label>{t('b02.nb.col.capture')}</label>{pickObs(t('b02.nb.tableFixed'), nb.fixed.observationId, compound.filter((o) => w.slides[o.slideId ?? '']?.kind === 'fixed'), 'fixed.obs', (n, id) => {
                  n.fixed.observationId = id;
                  const o = id ? w.observations[id] : null;
                  if (o?.slideId) {
                    n.fixed.label = w.slides[o.slideId].label ?? '';
                    n.fixed.slot = w.slideCase.home[o.slideId] ?? '';
                  }
                })}</div>
                {text('fixed.label', nb.fixed.label, (n, v) => { n.fixed.label = v; }, false, 'b02.nb.f.label')}
                {text('fixed.slot', nb.fixed.slot, (n, v) => { n.fixed.slot = v; }, false, 'b02.nb.f.slot')}
                <div className="field"><label>{t('b02.nb.col.structures')}</label>{structures(t('b02.nb.tableFixed'), nb.fixed.structures, 'fixed.st', (n, v) => { n.fixed.structures = v; })}</div>
                <label className="check"><input type="checkbox" checked={nb.fixed.returned} onChange={(e) => setNb((n) => { n.fixed.returned = e.target.checked; }, 'fixed.ret', String(nb.fixed.returned), String(e.target.checked))} /> {t('b02.nb.f.returned')}</label>
              </fieldset>
            )}
            {w.cell.routes.stereo && (
              <fieldset className="nb-fieldset">
                <legend>{t('b02.nb.tableStereo')}</legend>
                <div className="field"><label>{t('b02.nb.col.capture')}</label>{pickObs(t('b02.nb.tableStereo'), nb.stereo.observationId, all.filter((o) => o.instrument === 'stereo'), 'stereo.obs', (n, id) => { n.stereo.observationId = id; })}</div>
                <div className="field"><label>{t('b02.nb.col.light')}</label>{choose(t('b02.nb.col.light'), nb.stereo.light, ['incident', 'transmitted', 'both'] as const, 'stereo.light', (n, v) => { n.stereo.light = v; }, 'b02.light')}</div>
                {text('stereo.features', nb.stereo.features, (n, v) => { n.stereo.features = v; }, true, 'b02.nb.f.features')}
              </fieldset>
            )}
          </section>
        )}

        {tab === 'close' && (
          <section aria-label={t('b02.nb.tableCompare')} style={{ display: 'grid', gap: '0.6rem' }}>
            <h3>{t('b02.nb.tableCompare')}</h3>
            {text('cmp.plantAnimal', nb.comparison.plantAnimal, (n, v) => { n.comparison.plantAnimal = v; }, true, 'b02.nb.f.plantAnimal')}
            {text('cmp.plastids', nb.comparison.plastids, (n, v) => { n.comparison.plastids = v; }, true, 'b02.nb.f.plastids')}
            {text('cmp.limits', nb.comparison.limits, (n, v) => { n.comparison.limits = v; }, true, 'b02.nb.f.limits')}
            <h3>{t('b02.nb.tableLog')}</h3>
            {text('log.action', nb.log.action, (n, v) => { n.log.action = v; }, false, 'b02.nb.f.action')}
            {text('log.failure', nb.log.failure, (n, v) => { n.log.failure = v; }, true, 'b02.nb.f.failure')}
            {text('log.correction', nb.log.correction, (n, v) => { n.log.correction = v; }, true, 'b02.nb.f.correction')}
            {text('log.consequence', nb.log.consequence, (n, v) => { n.log.consequence = v; }, true, 'b02.nb.f.consequence')}
            <h3>{t('b02.nb.tableFigures')}</h3>
            {nb.figures.map(figureFs)}
            <button className="btn small" onClick={() => setNb((n) => { n.figures.push(figureRow()); }, 'fig.add', '', 'row')}>+ {t('b02.nb.addFigure')}</button>
            {text('scale', nb.scaleUm, (n, v) => { n.scaleUm = v; }, false, 'b02.nb.f.scaleUm')}
            <p className="hint">{t('b02.nb.scaleHelp')}</p>
            <div className="row">
              <button className="btn primary" onClick={() => dispatch({ type: 'closeBench' })}>{t('b02.act.closeBench')}</button>
              <span className="hint" aria-live="polite">{w.evidence.benchRestored ? `✓ ${t('b02.nb.benchOk')}` : w.evidence.closeAttempted ? t('b02.nb.benchPending') : ''}</span>
            </div>
          </section>
        )}

        {tab === 'questions' && (
          <section aria-label={t('b02.nb.tab.questions')} style={{ display: 'grid', gap: '0.6rem' }}>
            <h3>{t('b02.nb.questions')}</h3>
            {QUESTIONS_B02.map((q) => text(`analysis.${q}`, nb.analysis[q], (n, v) => { n.analysis[q] = v; }))}
          </section>
        )}

        {tab === 'log' && (
          <section aria-label={t('b02.nb.tab.log')}>
            <h3>{t('b02.nb.captures')}</h3>
            <ul className="fb-list">
              {all.map((o) => (
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
              <button className="btn small" onClick={() => downloadJson(`libreta-b02-${attemptId}.json`, { attemptId, notebook: nb, observations: w.observations })}>{t('review.export')}</button>
              <button className="btn small ghost" onClick={() => window.print()}>{t('p10.nb.print')}</button>
            </div>
          </section>
        )}
      </div>
    </aside>
  );
}
