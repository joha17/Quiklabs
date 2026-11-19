import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useF103 } from './store';
import {
  CALC_FIELDS_F3, CALC_UNIT_F3, INSTRUMENTS_F3, QUESTIONS_F3, SETUP_FIELDS_F3, SETUP_UNIT_F3, type Entry, type F103Notebook,
} from '../../practices/practice-f103/notebook';
import { readingsOfF3 } from '../../practices/practice-f103/expected-results';
import type { ReadingF3 } from '../../simulation/f103-world/types';
import { downloadJson } from '../persistence';

type Tab = 'setup' | 'velocity' | 'angles' | 'trajectory' | 'calc' | 'analysis' | 'readings';
const TABS: Tab[] = ['setup', 'velocity', 'angles', 'trajectory', 'calc', 'analysis', 'readings'];

const fmt = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d).replace('.', ',') : '—');
const decOf = (r: ReadingF3) => Math.max(0, Math.round(-Math.log10(r.resolution) + 0.01));
const warnOf = (r: ReadingF3) => (r.qualityFlags.length ? ' ⚠' : '');
/** Lo que muestra una lectura en las listas: valor y, para la plataforma, x e y del contacto y el tiempo de vuelo. */
const showOf = (r: ReadingF3) => {
  if (r.kind === 'impact' && r.impact) {
    const i = r.impact;
    return `x ${fmt(i.xCm, 1)} cm · y ${fmt(i.yCm, 1)} cm · t ${i.tFlight >= 0 ? fmt(i.tFlight, 4) : '—'} s`;
  }
  return `${fmt(r.value, decOf(r))} ${r.unit}`;
};

/**
 * Libreta digital de F103: cada dato bruto (inclinación, altura de la boca, cero de la cinta, Δt de la fotopuerta,
 * ángulos, posiciones de la plataforma y de la pantalla, impactos y marcas) se importa de una lectura con su id; v₀,
 * alcances, predicciones, el ajuste de la trayectoria, las componentes y las incertidumbres las escribe el estudiante.
 * La libreta no calcula nada por él.
 */
export function NotebookPanelF103() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('setup');
  const nb = useF103((s) => s.notebook);
  const setNb = useF103((s) => s.setNotebook);
  const toggle = useF103((s) => s.toggleNotebook);
  const savedAt = useF103((s) => s.savedAt);
  useF103((s) => s.version);
  const rt = useF103((s) => s.runtime);
  const attemptId = useF103((s) => s.attemptId);
  const wanted = useF103((s) => s.notebookTab);
  useEffect(() => {
    if (wanted && (TABS as string[]).includes(wanted)) setTab(wanted as Tab);
  }, [wanted]);
  if (!rt) return null;
  const w = rt.world;
  const all = readingsOfF3(w);
  const of = (pred: (r: ReadingF3) => boolean) => all.filter(pred);
  const label = (r: ReadingF3) => `${r.id} · ${showOf(r)}${warnOf(r)}`;

  const cell = (lab: string, e: Entry, path: string, set: (n: F103Notebook, patch: Partial<Entry>) => void, opts: ReadingF3[] = [], withU = true) => (
    <div className="cell" key={path}>
      <span className="label">{lab}</span>
      <input aria-label={lab} type="text" inputMode="decimal" value={e.value} onChange={(ev) => setNb((n) => set(n, { value: ev.target.value, readingId: null }), path, e.value, ev.target.value)} />
      {withU && <input aria-label={`± ${lab}`} className="u" type="text" inputMode="decimal" value={e.uncertainty} placeholder="±" onChange={(ev) => setNb((n) => set(n, { uncertainty: ev.target.value }), `${path}.u`, e.uncertainty, ev.target.value)} />}
      {opts.length > 0 && (
        <select aria-label={`${t('f103.nb.import')} — ${lab}`} value={e.readingId ?? ''} onChange={(ev) => {
          const r = opts.find((x) => x.id === ev.target.value);
          if (r) setNb((n) => set(n, { value: fmt(r.value, decOf(r)), readingId: r.id }), path, e.value, fmt(r.value, decOf(r)));
        }}>
          <option value="">📥</option>
          {opts.map((r) => <option key={r.id} value={r.id}>{label(r)}</option>)}
        </select>
      )}
      {e.readingId && <span className="hint" title={t('f103.nb.imported')}>🔗 {e.readingId}</span>}
    </div>
  );
  const text = (path: string, value: string, set: (n: F103Notebook, v: string) => void, area = true) => {
    const idf = `f103-${path}`;
    const on = (v: string) => setNb((n) => set(n, v), path, value, v);
    return (
      <div className="field" key={path}>
        <label htmlFor={idf}>{t(`f103.nb.f.${path}`)}</label>
        {area ? <textarea id={idf} value={value} onChange={(e) => on(e.target.value)} /> : <input id={idf} type="text" value={value} onChange={(e) => on(e.target.value)} />}
      </div>
    );
  };
  const pick = (aria: string, value: string | null, opts: ReadingF3[], path: string, set: (n: F103Notebook, id: string | null) => void, show: (r: ReadingF3) => string = label) => (
    <select aria-label={aria} value={value ?? ''} onChange={(e) => setNb((n) => set(n, e.target.value || null), path, value ?? '', e.target.value)}>
      <option value="">{t('nb.choose')}</option>
      {opts.map((r) => <option key={r.id} value={r.id}>{show(r)}</option>)}
    </select>
  );
  const num = (aria: string, value: string, path: string, set: (n: F103Notebook, v: string) => void) => (
    <input aria-label={aria} inputMode="decimal" value={value} onChange={(e) => setNb((n) => set(n, e.target.value), path, value, e.target.value)} />
  );

  const setupOpts: Record<(typeof SETUP_FIELDS_F3)[number], ReadingF3[]> = {
    tilt: of((r) => r.kind === 'level'),
    muzzleH: of((r) => r.kind === 'height'),
    tapeZero: of((r) => r.kind === 'length' && r.target === 'plumb'),
    trajAngle: of((r) => r.kind === 'angle'),
  };
  const gates = of((r) => r.kind === 'gate');
  const impacts = of((r) => r.kind === 'impact');
  const angles = of((r) => r.kind === 'angle');
  const heights = of((r) => r.kind === 'height');
  const platTape = of((r) => r.kind === 'length' && r.target === 'platform');
  const screenTape = of((r) => r.kind === 'length' && r.target === 'screen');
  const marks = of((r) => r.kind === 'mark');

  return (
    <aside className="drawer notebook" aria-label={t('nb.title')}>
      <div className="drawer-head">
        <h2>📓 {t('nb.title')}</h2>
        <span style={{ flex: 1 }} />
        <button className="btn small ghost" aria-label={t('review.export')} onClick={() => downloadJson(`libreta-f103-${attemptId}.json`, { attemptId, notebook: nb, readings: w.readings })}>⬇</button>
        <button className="btn small ghost" onClick={toggle} aria-label={t('common.close')}>×</button>
      </div>
      <div className="drawer-body">
        <div className="tabs" role="tablist">
          {TABS.map((k) => <button key={k} role="tab" className="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{t(`f103.nb.tab.${k}`)}</button>)}
        </div>
        {savedAt && <span className="hint">{t('nb.saved', { time: new Date(savedAt).toLocaleTimeString() })}</span>}
        {tab === 'setup' && (
          <>
            <h3>{t('f103.nb.hypothesis')}</h3>
            {text('hypothesis.question', nb.hypothesis.question, (n, v) => { n.hypothesis.question = v; })}
            {text('hypothesis.prediction', nb.hypothesis.prediction, (n, v) => { n.hypothesis.prediction = v; })}
            <h3>{t('f103.nb.instruments')}</h3>
            <div className="table-scroll">
              <table className="data">
                <thead><tr><th>{t('f103.nb.instrument')}</th><th>{t('f103.nb.resolution')}</th><th>u<sub>B</sub></th><th>{t('f103.nb.status')}</th></tr></thead>
                <tbody>
                  {INSTRUMENTS_F3.map((k) => {
                    const r = nb.instruments[k];
                    const upd = (f: 'resolution' | 'uncertainty' | 'status', v: string) => setNb((n) => { n.instruments[k][f] = v; }, `instruments.${k}.${f}`, r[f], v);
                    return (
                      <tr key={k}>
                        <td>{t(`f103.nb.inst.${k}`)}</td>
                        <td><input aria-label={`${t(`f103.nb.inst.${k}`)} ${t('f103.nb.resolution')}`} value={r.resolution} onChange={(e) => upd('resolution', e.target.value)} /></td>
                        <td><input aria-label={`${t(`f103.nb.inst.${k}`)} uB`} value={r.uncertainty} onChange={(e) => upd('uncertainty', e.target.value)} /></td>
                        <td>
                          <select aria-label={`${t(`f103.nb.inst.${k}`)} ${t('f103.nb.status')}`} value={r.status} onChange={(e) => upd('status', e.target.value)}>
                            <option value="">—</option>
                            {['verified', 'hypothetical', 'pending'].map((s) => <option key={s} value={s}>{t(`f103.nb.st.${s}`)}</option>)}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <h3>{t('f103.nb.setup')}</h3>
            {SETUP_FIELDS_F3.map((k) => cell(`${t(`f103.nb.setupF.${k}`)} (${SETUP_UNIT_F3[k]})`, nb.setup[k], `setup.${k}`, (n, p) => Object.assign(n.setup[k], p), setupOpts[k], false))}
            {text('ballD', nb.ballD, (n, v) => { n.ballD = v; }, false)}
          </>
        )}
        {tab === 'velocity' && (
          <>
            <p className="hint">{t('f103.nb.velocityLead')}</p>
            <div className="table-scroll">
              <table className="data">
                <thead><tr><th>#</th><th>{t('f103.nb.shot')}</th><th>v₀ (m/s)</th></tr></thead>
                <tbody>
                  {nb.velocity.map((row, i) => (
                    <tr key={i}>
                      <td>{i + 1}</td>
                      <td>{pick(`${t('f103.nb.shot')} ${i + 1}`, row.readingId, gates, `velocity.${i}.readingId`, (n, id) => { n.velocity[i].readingId = id; })}</td>
                      <td>{num(`v0 ${i + 1}`, row.v0, `velocity.${i}.v0`, (n, v) => { n.velocity[i].v0 = v; })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {tab === 'angles' && (
          <>
            <p className="hint">{t('f103.nb.anglesLead')}</p>
            {nb.angles.map((row, i) => (
              <div key={i} className="nb-group">
                <strong>{t('f103.nb.angleRow', { n: i + 1 })}</strong>
                <div className="cell">
                  <span className="label">{t('f103.nb.impact')}</span>
                  {pick(`${t('f103.nb.angleRow', { n: i + 1 })} ${t('f103.nb.impact')}`, row.readingId, impacts, `angles.${i}.readingId`, (n, id) => { n.angles[i].readingId = id; })}
                </div>
                {cell(`θ (°) ${i + 1}`, row.angle, `angles.${i}.angle`, (n, p) => Object.assign(n.angles[i].angle, p), angles, false)}
                {cell(`${t('f103.nb.xPlat')} (cm) ${i + 1}`, row.xPlat, `angles.${i}.xPlat`, (n, p) => Object.assign(n.angles[i].xPlat, p), platTape, false)}
                {(['R', 'Rpred', 'Tpred'] as const).map((f) => (
                  <div className="cell" key={f}>
                    <span className="label">{t(`f103.nb.col.${f}`)}</span>
                    {num(`${f} ${i + 1}`, row[f], `angles.${i}.${f}`, (n, v) => { n.angles[i][f] = v; })}
                  </div>
                ))}
              </div>
            ))}
            <h3>{t('f103.nb.conditions')}</h3>
            {nb.conditions.map((row, i) => (
              <div key={i} className="nb-group">
                <strong>{t('f103.nb.condRow', { n: i + 1 })}</strong>
                <div className="cell">
                  <span className="label">{t('f103.nb.impact')}</span>
                  {pick(`${t('f103.nb.condRow', { n: i + 1 })} ${t('f103.nb.impact')}`, row.readingId, impacts, `conditions.${i}.readingId`, (n, id) => { n.conditions[i].readingId = id; })}
                </div>
                {cell(`y₀ (cm) ${i + 1}`, row.h, `conditions.${i}.h`, (n, p) => Object.assign(n.conditions[i].h, p), heights, false)}
                {cell(`${t('f103.nb.xPlat')} (cm) ${i + 1}`, row.xPlat, `conditions.${i}.xPlat`, (n, p) => Object.assign(n.conditions[i].xPlat, p), platTape, false)}
                {(['R', 'Rpred'] as const).map((f) => (
                  <div className="cell" key={f}>
                    <span className="label">{t(`f103.nb.col.${f}`)}</span>
                    {num(`${f} c${i + 1}`, row[f], `conditions.${i}.${f}`, (n, v) => { n.conditions[i][f] = v; })}
                  </div>
                ))}
              </div>
            ))}
          </>
        )}
        {tab === 'trajectory' && (
          <>
            <p className="hint">{t('f103.nb.trajectoryLead')}</p>
            {nb.trajectory.map((row, i) => (
              <div key={i} className="nb-group">
                <strong>{t('f103.nb.point', { n: i + 1 })}</strong>
                <div className="cell">
                  <span className="label">{t('f103.nb.mark')}</span>
                  {pick(`${t('f103.nb.point', { n: i + 1 })} ${t('f103.nb.mark')}`, row.readingId, marks, `trajectory.${i}.readingId`, (n, id) => { n.trajectory[i].readingId = id; })}
                </div>
                {cell(`x (cm) ${i + 1}`, row.x, `trajectory.${i}.x`, (n, p) => Object.assign(n.trajectory[i].x, p), screenTape, false)}
              </div>
            ))}
          </>
        )}
        {tab === 'calc' && (
          <>
            <p className="hint">{t('f103.nb.calcLead')}</p>
            {CALC_FIELDS_F3.map((k) => cell(`${t(`f103.nb.calc.${k}`)}${CALC_UNIT_F3[k] ? ` (${CALC_UNIT_F3[k]})` : ''}`, nb.calc[k], `calc.${k}`, (n, p) => Object.assign(n.calc[k], p), [], k === 'v0Mean'))}
            <h3>{t('f103.nb.contrast')}</h3>
            {text('contrastText', nb.contrastText, (n, v) => { n.contrastText = v; })}
          </>
        )}
        {tab === 'analysis' && (
          <>
            {QUESTIONS_F3.map((q) => text(`analysis.${q}`, nb.analysis[q], (n, v) => { n.analysis[q] = v; }))}
            {text('closure', nb.closure, (n, v) => { n.closure = v; })}
          </>
        )}
        {tab === 'readings' && (
          <div className="table-scroll">
            <table className="data">
              <thead><tr><th>id</th><th>{t('f103.nb.instrument')}</th><th>{t('f103.nb.value')}</th><th>{t('f103.nb.flags')}</th></tr></thead>
              <tbody>
                {all.map((r) => (
                  <tr key={r.id}>
                    <td>{r.id}</td>
                    <td>{t(`f103.obj.${r.instrumentId}`)}</td>
                    <td>{showOf(r)}</td>
                    <td>{r.qualityFlags.map((f) => t(`f103.flag.${f}`)).join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </aside>
  );
}
