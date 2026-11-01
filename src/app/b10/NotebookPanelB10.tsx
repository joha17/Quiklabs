import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useB10 } from './store';
import type { LabObservation } from '../../simulation/optical-world/types';
import { ANATOMY_MODELS } from '../../simulation/animal-world/catalog';
import { QUESTIONS_B10, type B10Notebook, type Evidence3, type InvertRow, type TissueGuess } from '../../practices/practice-b10/notebook';
import { downloadJson } from '../persistence';
import { b10NameOf } from './describe';
import { CaptureMarkerB10 } from './CaptureMarkerB10';

type Tab = 'pre' | 'tissues' | 'muscle' | 'inverts' | 'small' | 'zoo' | 'skulls' | 'marks' | 'atlas' | 'close' | 'questions' | 'log';
const TABS: Tab[] = ['pre', 'tissues', 'muscle', 'inverts', 'small', 'zoo', 'skulls', 'marks', 'atlas', 'close', 'questions', 'log'];
const EV3: readonly Evidence3[] = ['visible', 'absent', 'notResolved'];
const TISSUES: readonly TissueGuess[] = ['epithelial', 'connective', 'nervous', 'skeletal', 'cardiac', 'smooth'];
const ORGANISMS: readonly InvertRow['organism'][] = ['sponge', 'coral', 'medusa', 'planaria', 'fluke', 'nematode', 'cestode', 'earthworm'];
const MODELS: readonly string[] = ANATOMY_MODELS.filter((m) => m.group === 'invertebrate' || m.group === 'vertebrate').map((m) => m.id);
const TRACKS: readonly string[] = ANATOMY_MODELS.filter((m) => m.group === 'track').map((m) => m.id);

const fmt = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d).replace('.', ',') : '—');

/**
 * Libreta digital de B10 (§12): preinforme, tejidos, músculo, invertebrados, organismos pequeños, zoología y aves, cráneos y huellas, marcas,
 * atlas y cierre, ocho preguntas y registro. Las filas IMPORTAN una captura propia; el objetivo y la escala vienen del registro, lo clasificado
 * e interpretado es del estudiante.
 */
export function NotebookPanelB10() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('pre');
  const nb = useB10((s) => s.notebook);
  const setNb = useB10((s) => s.setNotebook);
  const toggle = useB10((s) => s.toggleNotebook);
  const savedAt = useB10((s) => s.savedAt);
  const dispatch = useB10((s) => s.dispatch);
  useB10((s) => s.version);
  const rt = useB10((s) => s.runtime);
  const attemptId = useB10((s) => s.attemptId);
  const wanted = useB10((s) => s.notebookTab);
  useEffect(() => {
    if (wanted) setTab(wanted as Tab);
  }, [wanted]);
  if (!rt) return null;
  const w = rt.world;
  const all = w.observationOrder.map((id) => w.observations[id]);
  const compound = all.filter((o) => o.instrument === 'compound');
  const olabel = (o: LabObservation) => `${o.id} · ${b10NameOf(w, o.slideId ?? o.specimenId)}${o.specimenId.startsWith('ctl:') ? ` (${t('b10.nb.control')})` : ''} · ${o.objectiveX ?? '—'}X${o.isObservationValid ? '' : ' ✗'}`;

  const text = (path: string, value: string, set: (n: B10Notebook, v: string) => void, area = true, labelKey?: string) => {
    const idf = `b10-${path.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const on = (v: string) => setNb((n) => set(n, v), path, value, v);
    return (
      <div className="field" key={path}>
        <label htmlFor={idf}>{t(labelKey ?? `b10.nb.f.${path}`)}</label>
        {area ? <textarea id={idf} value={value} onChange={(e) => on(e.target.value)} /> : <input id={idf} type="text" value={value} onChange={(e) => on(e.target.value)} />}
      </div>
    );
  };
  const small = (label: string, value: string, path: string, set: (n: B10Notebook, v: string) => void) => (
    <input aria-label={label} type="text" value={value} onChange={(e) => setNb((n) => set(n, e.target.value), path, value, e.target.value)} />
  );
  const choose = <T extends string>(label: string, value: T, options: readonly T[], path: string, set: (n: B10Notebook, v: T) => void, keyPrefix: string) => (
    <select aria-label={label} value={value} onChange={(e) => setNb((n) => set(n, e.target.value as T), path, value, e.target.value)}>
      <option value="">{t('nb.choose')}</option>
      {options.filter(Boolean).map((o) => <option key={o} value={o}>{t(`${keyPrefix}.${o}`)}</option>)}
    </select>
  );
  const check = (label: string, value: boolean, path: string, set: (n: B10Notebook, v: boolean) => void) => (
    <label className="check"><input type="checkbox" checked={value} onChange={(e) => setNb((n) => set(n, e.target.checked), path, String(value), String(e.target.checked))} /> {label}</label>
  );
  const pickObs = (label: string, value: string | null, opts: LabObservation[], path: string, set: (n: B10Notebook, id: string | null) => void) => (
    <select aria-label={label} value={value ?? ''} onChange={(e) => setNb((n) => set(n, e.target.value || null), path, value ?? '', e.target.value)}>
      <option value="">📥 {t('b10.nb.import')}</option>
      {opts.map((o) => <option key={o.id} value={o.id}>{olabel(o)}</option>)}
    </select>
  );
  const head = (...keys: string[]) => <thead><tr>{keys.map((k) => <th key={k}>{t(`b10.nb.col.${k}`)}</th>)}</tr></thead>;
  const table = (label: string, cols: string[], rows: React.ReactNode) => (
    <div className="table-scroll" tabIndex={0} role="region" aria-label={label}>
      <table className="nb-table">{head(...cols)}<tbody>{rows}</tbody></table>
    </div>
  );

  const L = (k: string, i: number) => `${t(`b10.nb.col.${k}`)} ${i + 1}`;

  return (
    <aside className="drawer" aria-label={t('nb.title')} id="notebook">
      <div className="drawer-head">
        <h2>{t('nb.title')}</h2>
        <span className="grow" style={{ flex: 1 }} />
        {savedAt && <span className="hint">{t('nb.saved')}</span>}
        <button className="btn small ghost" onClick={toggle} aria-label={t('common.close')}>×</button>
      </div>
      <div className="tabs" role="tablist" aria-label={t('nb.title')}>
        {TABS.map((k) => <button key={k} role="tab" aria-selected={tab === k} className="tab" onClick={() => setTab(k)}>{t(`b10.nb.tab.${k}`)}</button>)}
      </div>
      <div className="drawer-body">
        {tab === 'pre' && (
          <section aria-label={t('b10.nb.tab.pre')} style={{ display: 'grid', gap: '0.6rem' }}>
            {text('prereport.hypothesis', nb.prereport.hypothesis, (n, v) => { n.prereport.hypothesis = v; })}
            {text('prereport.instruments', nb.prereport.instruments, (n, v) => { n.prereport.instruments = v; })}
            {text('prereport.precautions', nb.prereport.precautions, (n, v) => { n.prereport.precautions = v; })}
          </section>
        )}

        {tab === 'tissues' && (
          <section aria-label={t('b10.nb.tab.tissues')}>
            <p className="hint">{t('b10.nb.tissuesHelp')}</p>
            {table(t('b10.nb.tab.tissues'), ['capture', 'tissue', 'level', 'structures', 'function', 'basis', 'totalMag'], nb.tissues.map((r, i) => (
              <tr key={i}>
                <td>{pickObs(L('capture', i), r.observationId, compound, `tissues.${i}.o`, (n, v) => { n.tissues[i].observationId = v; })}</td>
                <td>{choose(L('tissue', i), r.tissue, TISSUES, `tissues.${i}.t`, (n, v) => { n.tissues[i].tissue = v; }, 'b10.tissue')}</td>
                <td>{choose(L('level', i), r.level, ['tissue', 'organism'] as const, `tissues.${i}.l`, (n, v) => { n.tissues[i].level = v; }, 'b10.level')}</td>
                <td>{small(L('structures', i), r.structures, `tissues.${i}.s`, (n, v) => { n.tissues[i].structures = v; })}</td>
                <td>{small(L('function', i), r.functionText, `tissues.${i}.f`, (n, v) => { n.tissues[i].functionText = v; })}</td>
                <td>{choose(L('basis', i), r.basis, ['observedFeature', 'memory'] as const, `tissues.${i}.b`, (n, v) => { n.tissues[i].basis = v; }, 'b10.basis')}</td>
                <td>{small(L('totalMag', i), r.totalMag, `tissues.${i}.m`, (n, v) => { n.tissues[i].totalMag = v; })}</td>
              </tr>
            )))}
          </section>
        )}

        {tab === 'muscle' && (
          <section aria-label={t('b10.nb.tab.muscle')} style={{ display: 'grid', gap: '0.4rem' }}>
            <p className="hint">{t('b10.nb.muscleHelp')}</p>
            <div className="row"><span>{t('b10.nb.muscleA')}</span>
              {pickObs(t('b10.nb.muscleA'), nb.muscle.skeletalObservationId, compound, 'muscle.a', (n, v) => { n.muscle.skeletalObservationId = v; })}
              {choose(t('b10.nb.col.tissue'), nb.muscle.skeletalGuess, TISSUES, 'muscle.ag', (n, v) => { n.muscle.skeletalGuess = v; }, 'b10.tissue')}
              {choose(t('b10.nb.nuclei'), nb.muscle.skeletalNuclei, ['multi', 'single', 'notResolved'] as const, 'muscle.an', (n, v) => { n.muscle.skeletalNuclei = v; }, 'b10.nuclei')}
            </div>
            <div className="row"><span>{t('b10.nb.muscleB')}</span>
              {pickObs(t('b10.nb.muscleB'), nb.muscle.cardiacObservationId, compound, 'muscle.b', (n, v) => { n.muscle.cardiacObservationId = v; })}
              {choose(t('b10.nb.col.tissue'), nb.muscle.cardiacGuess, TISSUES, 'muscle.bg', (n, v) => { n.muscle.cardiacGuess = v; }, 'b10.tissue')}
              {choose(t('b10.nb.discs'), nb.muscle.cardiacDiscs, EV3, 'muscle.bd', (n, v) => { n.muscle.cardiacDiscs = v; }, 'b10.ev3')}
              {choose(t('b10.nb.branching'), nb.muscle.cardiacBranching, EV3, 'muscle.bb', (n, v) => { n.muscle.cardiacBranching = v; }, 'b10.ev3')}
            </div>
            <div className="row">{choose(t('b10.nb.prepQuality'), nb.muscle.prepQuality, ['considered', 'ignored'] as const, 'muscle.q', (n, v) => { n.muscle.prepQuality = v; }, 'b10.prepQuality')}</div>
          </section>
        )}

        {tab === 'inverts' && (
          <section aria-label={t('b10.nb.tab.inverts')}>
            <p className="hint">{t('b10.nb.invertsHelp')}</p>
            {table(t('b10.nb.tab.inverts'), ['capture', 'organism', 'organization', 'symmetry', 'form', 'segmented', 'trait'], nb.inverts.map((r, i) => (
              <tr key={i}>
                <td>{pickObs(L('capture', i), r.observationId, compound, `inverts.${i}.o`, (n, v) => { n.inverts[i].observationId = v; })}</td>
                <td>{choose(L('organism', i), r.organism, ORGANISMS, `inverts.${i}.g`, (n, v) => { n.inverts[i].organism = v; }, 'b10.organism')}</td>
                <td>{choose(L('organization', i), r.organization, ['cellular', 'trueTissues'] as const, `inverts.${i}.z`, (n, v) => { n.inverts[i].organization = v; }, 'b10.organization')}</td>
                <td>{choose(L('symmetry', i), r.symmetry, ['radial', 'bilateral', 'none'] as const, `inverts.${i}.y`, (n, v) => { n.inverts[i].symmetry = v; }, 'b10.symmetry')}</td>
                <td>{choose(L('form', i), r.form, ['polyp', 'medusa', 'colony', 'notApplicable'] as const, `inverts.${i}.f`, (n, v) => { n.inverts[i].form = v; }, 'b10.form')}</td>
                <td>{choose(L('segmented', i), r.segmented, ['yes', 'no', 'pseudo'] as const, `inverts.${i}.e`, (n, v) => { n.inverts[i].segmented = v; }, 'b10.segmented')}</td>
                <td>{small(L('trait', i), r.trait, `inverts.${i}.t`, (n, v) => { n.inverts[i].trait = v; })}</td>
              </tr>
            )))}
          </section>
        )}

        {tab === 'small' && (
          <section aria-label={t('b10.nb.tab.small')}>
            <p className="hint">{t('b10.nb.smallHelp')}</p>
            {table(t('b10.nb.tab.small'), ['capture', 'organism', 'instrument', 'stage', 'motion', 'trait'], nb.small.map((r, i) => (
              <tr key={i}>
                <td>{pickObs(L('capture', i), r.observationId, all, `small.${i}.o`, (n, v) => { n.small[i].observationId = v; })}</td>
                <td>{choose(L('organism', i), r.organism, ['daphnia', 'louse'] as const, `small.${i}.g`, (n, v) => { n.small[i].organism = v; }, 'b10.organism')}</td>
                <td>{choose(L('instrument', i), r.instrument, ['microscope', 'stereo'] as const, `small.${i}.i`, (n, v) => { n.small[i].instrument = v; }, 'b10.materialInstrument')}</td>
                <td>{choose(L('stage', i), r.stage, ['adult', 'nit', 'nymph', 'notDetermined'] as const, `small.${i}.s`, (n, v) => { n.small[i].stage = v; }, 'b10.lifeStage')}</td>
                <td>{choose(L('motion', i), r.motion, ['observed', 'notEvaluable'] as const, `small.${i}.m`, (n, v) => { n.small[i].motion = v; }, 'b10.motion')}</td>
                <td>{small(L('trait', i), r.trait, `small.${i}.t`, (n, v) => { n.small[i].trait = v; })}</td>
              </tr>
            )))}
          </section>
        )}

        {tab === 'zoo' && (
          <section aria-label={t('b10.nb.tab.zoo')}>
            <p className="hint">{t('b10.nb.zooHelp')}</p>
            {table(t('b10.nb.tab.zoo'), ['model', 'groupName', 'trait', 'comparedWith', 'difference'], nb.zoo.map((r, i) => (
              <tr key={i}>
                <td>{choose(L('model', i), r.modelId, MODELS, `zoo.${i}.m`, (n, v) => { n.zoo[i].modelId = v; }, 'b10.model')}</td>
                <td>{small(L('groupName', i), r.groupName, `zoo.${i}.g`, (n, v) => { n.zoo[i].groupName = v; })}</td>
                <td>{small(L('trait', i), r.trait, `zoo.${i}.t`, (n, v) => { n.zoo[i].trait = v; })}</td>
                <td>{choose(L('comparedWith', i), r.comparedWith, MODELS, `zoo.${i}.c`, (n, v) => { n.zoo[i].comparedWith = v; }, 'b10.model')}</td>
                <td>{small(L('difference', i), r.difference, `zoo.${i}.d`, (n, v) => { n.zoo[i].difference = v; })}</td>
              </tr>
            )))}
            {text('birdsFunction', nb.birdsFunction, (n, v) => { n.birdsFunction = v; })}
          </section>
        )}

        {tab === 'skulls' && (
          <section aria-label={t('b10.nb.tab.skulls')} style={{ display: 'grid', gap: '0.5rem' }}>
            <p className="hint">{t('b10.nb.skullsHelp')}</p>
            {text('skull.horseTrait', nb.skull.horseTrait, (n, v) => { n.skull.horseTrait = v; })}
            {text('skull.cowTrait', nb.skull.cowTrait, (n, v) => { n.skull.cowTrait = v; })}
            {text('skull.dietInference', nb.skull.dietInference, (n, v) => { n.skull.dietInference = v; })}
            {table(t('b10.nb.tracks'), ['track', 'justification'], nb.trackRows.map((r, i) => (
              <tr key={i}>
                <td>{choose(L('track', i), r.trackId, TRACKS, `tracks.${i}.t`, (n, v) => { n.trackRows[i].trackId = v; }, 'b10.model')}</td>
                <td>{small(L('justification', i), r.justification, `tracks.${i}.j`, (n, v) => { n.trackRows[i].justification = v; })}</td>
              </tr>
            )))}
          </section>
        )}

        {tab === 'marks' && <section aria-label={t('b10.nb.tab.marks')}><CaptureMarkerB10 /></section>}

        {tab === 'atlas' && (
          <section aria-label={t('b10.nb.tab.atlas')} style={{ display: 'grid', gap: '0.5rem' }}>
            {text('atlas.conclusions', nb.atlas.conclusions, (n, v) => { n.atlas.conclusions = v; })}
            {check(t('b10.nb.atlasDelivered'), nb.atlas.delivered, 'atlas.delivered', (n, v) => { n.atlas.delivered = v; })}
            {check(t('b10.nb.claimSame'), nb.claims.allGroupsSameOrganization, 'claims.same', (n, v) => { n.claims.allGroupsSameOrganization = v; })}
            {check(t('b10.nb.claimSponge'), nb.claims.allSpongesTrueTissues, 'claims.sponge', (n, v) => { n.claims.allSpongesTrueTissues = v; })}
          </section>
        )}

        {tab === 'close' && (
          <section aria-label={t('b10.nb.tab.close')} style={{ display: 'grid', gap: '0.5rem' }}>
            {text('closure.notes', nb.closure.notes, (n, v) => { n.closure.notes = v; })}
            <h3>{t('b10.nb.tableClose')}</h3>
            <ul className="fb-list">
              <li>{t('b10.nb.close.broken', { n: w.shards })}</li>
              <li>{t('b10.nb.close.fixed', { ok: w.assignment.fixedSlideIds.every((id) => w.slideCase.slots[w.slideCase.home[id]] === id) ? '✓' : '✗' })}</li>
              <li>{t('b10.nb.close.incidents', { n: w.cell.incidents.length })}</li>
            </ul>
            <div className="row">
              <button className="btn primary" onClick={() => dispatch({ type: 'closeBench' })}>{t('b10.act.closeBench')}</button>
              <span className="hint" aria-live="polite">{w.evidence.benchRestored ? `✓ ${t('b10.nb.benchOk')}` : w.evidence.closeAttempted ? t('b10.nb.benchPending') : ''}</span>
            </div>
          </section>
        )}

        {tab === 'questions' && (
          <section aria-label={t('b10.nb.tab.questions')} style={{ display: 'grid', gap: '0.6rem' }}>
            <h3>{t('b10.nb.questions')}</h3>
            {QUESTIONS_B10.map((q) => text(`analysis.${q}`, nb.analysis[q], (n, v) => { n.analysis[q] = v; }))}
          </section>
        )}

        {tab === 'log' && (
          <section aria-label={t('b10.nb.tab.log')}>
            <h3>{t('b10.nb.captures')}</h3>
            <ul className="fb-list">
              {all.map((o) => (
                <li key={o.id}>
                  <span className={o.isObservationValid ? 'ok' : 'bad'}>{o.isObservationValid ? '✓' : '✗'}</span> {olabel(o)} · {fmt(o.t, 0)} s
                  {o.issues.length > 0 && <span className="hint"> · {o.issues.map((q) => t(`b10.issue.${q}`)).join(', ')}</span>}
                </li>
              ))}
            </ul>
            <h3>{t('p4.nb.history', { n: nb.history.length })}</h3>
            <ul className="fb-list" style={{ maxHeight: '14rem', overflow: 'auto' }}>
              {[...nb.history].reverse().slice(0, 80).map((h, i) => <li key={i}><span className="hint">{fmt(h.t, 0)} s</span> {h.field}: «{h.from.slice(0, 40)}» → «{h.to.slice(0, 40)}»</li>)}
            </ul>
            <div className="row">
              <button className="btn small" onClick={() => downloadJson(`libreta-b10-${attemptId}.json`, { attemptId, notebook: nb, observations: w.observations, marks: w.div.marks, labels: w.animal.labels })}>{t('review.export')}</button>
              <button className="btn small ghost" onClick={() => window.print()}>{t('p10.nb.print')}</button>
            </div>
          </section>
        )}
      </div>
    </aside>
  );
}
