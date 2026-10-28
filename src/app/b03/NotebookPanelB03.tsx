import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useB03 } from './store';
import type { StructureId } from '../../simulation/specimens/assets';
import type { LabObservation } from '../../simulation/optical-world/types';
import type { InstrumentReading } from '../../simulation/perm-world/types';
import { QUESTIONS_B03, type B03Notebook, type Passage } from '../../practices/practice-b03/notebook';
import { downloadJson } from '../persistence';
import { b03NameOf } from './describe';

type Tab = 'membrane' | 'diffusion' | 'dialysis' | 'osmosis' | 'micro' | 'balance' | 'questions' | 'log';
const TABS: Tab[] = ['membrane', 'diffusion', 'dialysis', 'osmosis', 'micro', 'balance', 'questions', 'log'];

/** Glosario general de Elodea (no revela qué muestra cada captura). */
const GLOSSARY: StructureId[] = ['cellWall', 'chloroplasts', 'vacuole', 'cellMembrane', 'protoplast', 'periplasmicSpace', 'nucleus', 'leafBlade'];
const SOLUTES = ['water', 'salt', 'protein', 'tracer'] as const;

const fmt = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d).replace('.', ',') : '—');

/**
 * Libreta digital de B03 (§12): membrana e hipótesis, difusión (lecturas importadas a 0/30/60 s), diálisis (siete
 * tubos con su lectura), ósmosis (volúmenes y temperatura importados; ΔV, flujo y π calculados por el estudiante),
 * microscopía de Elodea (capturas importadas, tratamiento y estado), balance, diez preguntas y registro. Las celdas de
 * medida IMPORTAN una lectura del propio intento; el valor, la unidad y la hora vienen del registro, nunca se tipean.
 */
export function NotebookPanelB03() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('membrane');
  const nb = useB03((s) => s.notebook);
  const setNb = useB03((s) => s.setNotebook);
  const toggle = useB03((s) => s.toggleNotebook);
  const savedAt = useB03((s) => s.savedAt);
  const dispatch = useB03((s) => s.dispatch);
  useB03((s) => s.version);
  const rt = useB03((s) => s.runtime);
  const attemptId = useB03((s) => s.attemptId);
  const wanted = useB03((s) => s.notebookTab);
  useEffect(() => {
    if (wanted) setTab(wanted as Tab);
  }, [wanted]);
  if (!rt) return null;
  const w = rt.world;
  const P = w.perm;
  const readings = P.readingOrder.map((id) => P.readings[id]);
  const compound = w.observationOrder.map((id) => w.observations[id]).filter((o) => o.instrument === 'compound');
  const target = (id: string) => {
    const [obj, side] = id.split(':');
    const tube = P.tubes[obj];
    return `${tube?.label ? `${b03NameOf(w, obj)} «${t(`b03.tubeLabel.${tube.label}`)}»` : b03NameOf(w, obj)}${side ? ` ${side}` : ''}`;
  };
  const rlabel = (r: InstrumentReading) => `${r.id} · ${t(`b03.instrument.${r.instrument}`)} · ${target(r.targetId)} · ${fmt(r.value, r.unit === 'A' ? 3 : r.unit === 'mL' ? 1 : 0)} ${r.unit}${r.quality && !r.quality.startsWith('tracer') ? ` (${t(`b03.quality.${r.quality.replace(':', '_')}`)})` : ''} · ${fmt(r.t, 0)} s`;
  const olabel = (o: LabObservation) => `${o.id} · ${b03NameOf(w, o.slideId ?? o.specimenId)} · ${o.objectiveX ?? '—'}X${o.isObservationValid ? '' : ' ✗'}`;

  const text = (path: string, value: string, set: (n: B03Notebook, v: string) => void, area = true, labelKey?: string) => {
    const idf = `b03-${path.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const on = (v: string) => setNb((n) => set(n, v), path, value, v);
    return (
      <div className="field" key={path}>
        <label htmlFor={idf}>{t(labelKey ?? `b03.nb.f.${path}`)}</label>
        {area ? <textarea id={idf} value={value} onChange={(e) => on(e.target.value)} /> : <input id={idf} type="text" value={value} onChange={(e) => on(e.target.value)} />}
      </div>
    );
  };
  const small = (label: string, value: string, path: string, set: (n: B03Notebook, v: string) => void) => (
    <input aria-label={label} type="text" inputMode="decimal" value={value} onChange={(e) => setNb((n) => set(n, e.target.value), path, value, e.target.value)} />
  );
  const choose = <T extends string>(label: string, value: T, options: readonly T[], path: string, set: (n: B03Notebook, v: T) => void, keyPrefix: string) => (
    <select aria-label={label} value={value} onChange={(e) => setNb((n) => set(n, e.target.value as T), path, value, e.target.value)}>
      <option value="">{t('nb.choose')}</option>
      {options.filter(Boolean).map((o) => <option key={o} value={o}>{t(`${keyPrefix}.${o}`)}</option>)}
    </select>
  );
  const pickReading = (label: string, value: string | null, opts: InstrumentReading[], path: string, set: (n: B03Notebook, id: string | null) => void) => (
    <select aria-label={label} value={value ?? ''} onChange={(e) => setNb((n) => set(n, e.target.value || null), path, value ?? '', e.target.value)}>
      <option value="">📥 {t('b03.nb.import')}</option>
      {opts.map((r) => <option key={r.id} value={r.id}>{rlabel(r)}</option>)}
    </select>
  );
  const pickObs = (label: string, value: string | null, path: string, set: (n: B03Notebook, id: string | null) => void) => (
    <select aria-label={label} value={value ?? ''} onChange={(e) => setNb((n) => set(n, e.target.value || null), path, value ?? '', e.target.value)}>
      <option value="">📥 {t('b03.nb.importCapture')}</option>
      {compound.map((o) => <option key={o.id} value={o.id}>{olabel(o)}</option>)}
    </select>
  );
  const structures = (label: string, value: StructureId[], path: string, set: (n: B03Notebook, v: StructureId[]) => void) => (
    <fieldset className="chips" aria-label={label}>
      {GLOSSARY.map((s) => (
        <label key={s} className="check small">
          <input type="checkbox" checked={value.includes(s)} onChange={(e) => {
            const next = e.target.checked ? [...value, s] : value.filter((x) => x !== s);
            setNb((n) => set(n, next), path, value.join(','), next.join(','));
          }} /> {t(`b02.structure.${s}`, { defaultValue: t(`b03.structure.${s}`) })}
        </label>
      ))}
    </fieldset>
  );
  const shown = (id: string | null) => {
    const r = id ? P.readings[id] : null;
    return r ? `${fmt(r.value, r.unit === 'mL' ? 1 : r.unit === 'A' ? 3 : 1)} ${r.unit}` : '—';
  };
  const ofTarget = (pred: (r: InstrumentReading) => boolean) => readings.filter(pred);
  const scaleOf = (side: 'A' | 'B') => ofTarget((r) => r.instrument === 'scale' && r.targetId === `c3:${side}`);

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
          {TABS.map((k) => <button key={k} role="tab" className="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{t(`b03.nb.tab.${k}`)}</button>)}
        </div>

        {tab === 'membrane' && (
          <section aria-label={t('b03.nb.tableMembrane')} style={{ display: 'grid', gap: '0.6rem' }}>
            <h3>{t('b03.nb.tableMembrane')}</h3>
            <div className="field"><label>{t('b03.nb.f.material')}</label>{choose(t('b03.nb.f.material'), nb.membrane.material, ['dialysis', 'dialysisWide', 'cellophane', 'film'] as const, 'mem.material', (n, v) => { n.membrane.material = v; }, 'b03.material')}</div>
            {text('mem.code', nb.membrane.code, (n, v) => { n.membrane.code = v; }, false, 'b03.nb.f.code')}
            {text('mem.area', nb.membrane.areaCm2, (n, v) => { n.membrane.areaCm2 = v; }, false, 'b03.nb.f.area')}
            <div className="field"><label>{t('b03.nb.f.integrity')}</label>{choose(t('b03.nb.f.integrity'), nb.membrane.integrity, ['intact', 'torn', 'unknown'] as const, 'mem.integrity', (n, v) => { n.membrane.integrity = v; }, 'b03.integrity')}</div>
            <div className="field"><label>{t('b03.nb.f.control')}</label>{choose(t('b03.nb.f.control'), nb.membrane.control, ['sealed', 'leak'] as const, 'mem.control', (n, v) => { n.membrane.control = v; }, 'b03.control')}</div>
            <div className="field"><label>{t('b03.nb.f.permeability')}</label>{choose(t('b03.nb.f.permeability'), nb.membrane.permeability, ['known', 'unknown'] as const, 'mem.perm', (n, v) => { n.membrane.permeability = v; }, 'b03.permeability')}</div>
            <h3>{t('b03.nb.hypothesis')}</h3>
            <table className="nb-table">
              <thead><tr><th>{t('b03.nb.col.substance')}</th><th>{t('b03.nb.col.expected')}</th></tr></thead>
              <tbody>
                {SOLUTES.map((s) => (
                  <tr key={s}>
                    <td>{t(`b03.solute.${s}`)}</td>
                    <td>{choose(`${t('b03.nb.col.expected')} ${t(`b03.solute.${s}`)}`, nb.membrane.hypothesis[s], ['pass', 'retain', 'unknown'] as Passage[], `hyp.${s}`, (n, v) => { n.membrane.hypothesis[s] = v; }, 'b03.passage')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {tab === 'diffusion' && (
          <section aria-label={t('b03.nb.tableDiffusion')} style={{ display: 'grid', gap: '0.6rem' }}>
            <h3>{t('b03.nb.tableDiffusion')}</h3>
            <p className="hint">{t('b03.nb.diffusionHelp')}</p>
            <div className="table-scroll" tabIndex={0} role="region" aria-label={t('b03.nb.tableDiffusion')}>
              <table className="nb-table">
                <thead><tr><th>{t('b03.nb.col.reading')}</th><th>{t('b03.nb.col.value')}</th><th>{t('b03.nb.col.concentration')}</th><th>{t('b03.nb.col.note')}</th></tr></thead>
                <tbody>
                  {nb.diffusion.rows.map((r, i) => (
                    <tr key={i}>
                      <td>{pickReading(`${t('b03.nb.col.reading')} ${i + 1}`, r.readingId, ofTarget((x) => x.targetId.startsWith('c1')), `diff.${i}.r`, (n, id) => { n.diffusion.rows[i].readingId = id; })}</td>
                      <td>{shown(r.readingId)}</td>
                      <td>{small(`${t('b03.nb.col.concentration')} ${i + 1}`, r.concentration, `diff.${i}.c`, (n, v) => { n.diffusion.rows[i].concentration = v; })}</td>
                      <td>{small(`${t('b03.nb.col.note')} ${i + 1}`, r.note, `diff.${i}.n`, (n, v) => { n.diffusion.rows[i].note = v; })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="field"><label>{t('b03.nb.f.attribution')}</label>{choose(t('b03.nb.f.attribution'), nb.diffusion.attribution, ['diffusion', 'leak', 'none'] as const, 'diff.attr', (n, v) => { n.diffusion.attribution = v; }, 'b03.attribution')}</div>
            {text('diff.conclusion', nb.diffusion.conclusion, (n, v) => { n.diffusion.conclusion = v; }, true, 'b03.nb.f.conclusion')}
          </section>
        )}

        {tab === 'dialysis' && (
          <section aria-label={t('b03.nb.tableDialysis')} style={{ display: 'grid', gap: '0.6rem' }}>
            <h3>{t('b03.nb.tableDialysis')}</h3>
            <p className="hint">{t('b03.nb.dialysisHelp')}</p>
            <div className="table-scroll" tabIndex={0} role="region" aria-label={t('b03.nb.tableDialysis')}>
              <table className="nb-table">
                <thead><tr><th>{t('b03.nb.col.tube')}</th><th>{t('b03.nb.col.reading')}</th><th>{t('b03.nb.col.interpretation')}</th></tr></thead>
                <tbody>
                  {nb.dialysis.rows.map((r, i) => (
                    <tr key={r.label}>
                      <td>{t(`b03.tubeLabel.${r.label}`)}</td>
                      <td>{pickReading(`${t('b03.nb.col.reading')} ${t(`b03.tubeLabel.${r.label}`)}`, r.readingId, ofTarget((x) => !!P.tubes[x.targetId]), `dial.${i}.r`, (n, id) => { n.dialysis.rows[i].readingId = id; })}</td>
                      <td>{choose(`${t('b03.nb.col.interpretation')} ${i + 1}`, r.interpretation, ['positive', 'negative', 'ambiguous'] as const, `dial.${i}.i`, (n, v) => { n.dialysis.rows[i].interpretation = v; }, 'b03.interpretation')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="field"><label>{t('b03.nb.f.silverShows')}</label>{choose(t('b03.nb.f.silverShows'), nb.dialysis.silverShows, ['chloride', 'allMinerals'] as const, 'dial.silver', (n, v) => { n.dialysis.silverShows = v; }, 'b03.silverShows')}</div>
            {text('dial.conclusion', nb.dialysis.conclusion, (n, v) => { n.dialysis.conclusion = v; }, true, 'b03.nb.f.conclusion')}
          </section>
        )}

        {tab === 'osmosis' && (
          <section aria-label={t('b03.nb.tableOsmosis')} style={{ display: 'grid', gap: '0.6rem' }}>
            <h3>{t('b03.nb.tableOsmosis')}</h3>
            <p className="hint">{t('b03.nb.osmosisHelp')}</p>
            <table className="nb-table">
              <thead><tr><th /><th>{t('b03.nb.col.initial')}</th><th>{t('b03.nb.col.final')}</th></tr></thead>
              <tbody>
                {(['A', 'B'] as const).map((s) => (
                  <tr key={s}>
                    <td>{t('b03.nb.side', { s })}</td>
                    <td>{pickReading(`${t('b03.nb.col.initial')} ${s}`, s === 'A' ? nb.osmosis.vA0 : nb.osmosis.vB0, scaleOf(s), `osm.${s}0`, (n, id) => { if (s === 'A') n.osmosis.vA0 = id; else n.osmosis.vB0 = id; })}</td>
                    <td>{pickReading(`${t('b03.nb.col.final')} ${s}`, s === 'A' ? nb.osmosis.vAf : nb.osmosis.vBf, scaleOf(s), `osm.${s}f`, (n, id) => { if (s === 'A') n.osmosis.vAf = id; else n.osmosis.vBf = id; })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="field"><label>{t('b03.nb.f.temp')}</label>{pickReading(t('b03.nb.f.temp'), nb.osmosis.tempReadingId, ofTarget((r) => r.instrument === 'thermo'), 'osm.temp', (n, id) => { n.osmosis.tempReadingId = id; })}</div>
            <div className="nb-grid">
              {(['durationMin', 'dVA', 'dVB', 'fluxMlMin', 'fluxMlS', 'uncertaintyMl', 'deltaOsm', 'piKPa'] as const).map((k) => (
                <div className="field" key={k}>
                  <label htmlFor={`b03-osm-${k}`}>{t(`b03.nb.f.${k}`)}</label>
                  <input id={`b03-osm-${k}`} type="text" inputMode="decimal" value={nb.osmosis[k]} onChange={(e) => setNb((n) => { n.osmosis[k] = e.target.value; }, `osm.${k}`, nb.osmosis[k], e.target.value)} />
                </div>
              ))}
            </div>
            <p className="hint">{t('b03.nb.piHelp')}</p>
            {text('osm.explanation', nb.osmosis.explanation, (n, v) => { n.osmosis.explanation = v; }, true, 'b03.nb.f.explanation')}
          </section>
        )}

        {tab === 'micro' && (
          <section aria-label={t('b03.nb.tableMicro')} style={{ display: 'grid', gap: '0.6rem' }}>
            <h3>{t('b03.nb.tableMicro')}</h3>
            <p className="hint">{t('b03.nb.microHelp', { oc: w.params.microscope.ocularX })}</p>
            {nb.micro.rows.map((r, i) => {
              const o = r.observationId ? w.observations[r.observationId] : null;
              return (
                <fieldset key={i} className="nb-fieldset">
                  <legend>{t('b03.nb.mount', { n: i + 1 })}</legend>
                  <div className="field"><label>{t('b03.nb.col.capture')}</label>{pickObs(`${t('b03.nb.col.capture')} ${i + 1}`, r.observationId, `micro.${i}.obs`, (n, id) => { n.micro.rows[i].observationId = id; })}</div>
                  {o && <p className="hint">{t('b02.nb.capturedAt', { obj: o.objectiveX ?? '—', mag: Math.round(o.magnification) })}</p>}
                  <div className="field"><label>{t('b03.nb.treatment')}</label>{choose(`${t('b03.nb.treatment')} ${i + 1}`, r.treatment, ['water', 'nacl-0.9', 'nacl-5'] as const, `micro.${i}.tr`, (n, v) => { n.micro.rows[i].treatment = v; }, 'b03.medium')}</div>
                  <div className="field"><label>{t('b03.nb.col.totalMag')}</label>{small(`${t('b03.nb.col.totalMag')} ${i + 1}`, r.totalMag, `micro.${i}.mag`, (n, v) => { n.micro.rows[i].totalMag = v; })}</div>
                  <div className="field"><label>{t('b03.nb.condition')}</label>{choose(`${t('b03.nb.condition')} ${i + 1}`, r.condition, ['turgid', 'plasmolyzed', 'inconclusive'] as const, `micro.${i}.cond`, (n, v) => { n.micro.rows[i].condition = v; }, 'b03.condition')}</div>
                  <div className="field"><label>{t('b03.nb.col.structures')}</label>{structures(`${t('b03.nb.col.structures')} ${i + 1}`, r.structures, `micro.${i}.st`, (n, v) => { n.micro.rows[i].structures = v; })}</div>
                </fieldset>
              );
            })}
            <div className="field"><label>{t('b03.nb.f.iso09')}</label>{choose(t('b03.nb.f.iso09'), nb.micro.iso09, ['isotonic', 'depends'] as const, 'micro.iso09', (n, v) => { n.micro.iso09 = v; }, 'b03.iso09')}</div>
          </section>
        )}

        {tab === 'balance' && (
          <section aria-label={t('b03.nb.tableBalance')} style={{ display: 'grid', gap: '0.6rem' }}>
            <h3>{t('b03.nb.tableBalance')}</h3>
            {text('bal.water', nb.balance.water, (n, v) => { n.balance.water = v; }, true, 'b03.nb.f.balWater')}
            {text('bal.solutes', nb.balance.solutes, (n, v) => { n.balance.solutes = v; }, true, 'b03.nb.f.balSolutes')}
            {text('bal.notSelective', nb.balance.notSelective, (n, v) => { n.balance.notSelective = v; }, true, 'b03.nb.f.balNotSelective')}
            <div className="row">
              <button className="btn primary" onClick={() => dispatch({ type: 'closeBench' })}>{t('b02.act.closeBench')}</button>
              <span className="hint" aria-live="polite">{w.evidence.benchRestored ? `✓ ${t('b02.nb.benchOk')}` : w.evidence.closeAttempted ? t('b03.nb.benchPending') : ''}</span>
            </div>
          </section>
        )}

        {tab === 'questions' && (
          <section aria-label={t('b03.nb.tab.questions')} style={{ display: 'grid', gap: '0.6rem' }}>
            <h3>{t('b03.nb.questions')}</h3>
            {QUESTIONS_B03.map((q) => text(`analysis.${q}`, nb.analysis[q], (n, v) => { n.analysis[q] = v; }, true, `b03.nb.q.${q}`))}
          </section>
        )}

        {tab === 'log' && (
          <section aria-label={t('b03.nb.tab.log')}>
            <h3>{t('b03.nb.readings', { n: readings.length })}</h3>
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
              <button className="btn small" onClick={() => downloadJson(`libreta-b03-${attemptId}.json`, { attemptId, notebook: nb, readings: P.readings, observations: w.observations })}>{t('review.export')}</button>
              <button className="btn small ghost" onClick={() => window.print()}>{t('p10.nb.print')}</button>
            </div>
          </section>
        )}
      </div>
    </aside>
  );
}
