import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useB08 } from './store';
import { QUESTIONS_B08, bandRow, type B08Notebook } from '../../practices/practice-b08/notebook';
import { downloadJson } from '../persistence';
import { conservedPhoto } from '../../simulation/photo-world/world';

type Tab = 'pre' | 'prep' | 'gas' | 'btb' | 'pig' | 'synth' | 'close' | 'questions' | 'log';
const TABS: Tab[] = ['pre', 'prep', 'gas', 'btb', 'pig', 'synth', 'close', 'questions', 'log'];
const fmt = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d).replace('.', ',') : '—');

/**
 * Libreta digital de B08 (§12): tablas A–E y diez preguntas. Las filas IMPORTAN lecturas propias; lo calculado e interpretado
 * lo escribe el estudiante («sin calibración» y «banda compuesta» son respuestas válidas). La rúbrica lo contrasta después.
 */
export function NotebookPanelB08() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('pre');
  const nb = useB08((s) => s.notebook);
  const setNb = useB08((s) => s.setNotebook);
  const toggle = useB08((s) => s.toggleNotebook);
  const savedAt = useB08((s) => s.savedAt);
  const dispatch = useB08((s) => s.dispatch);
  useB08((s) => s.version);
  const rt = useB08((s) => s.runtime);
  const attemptId = useB08((s) => s.attemptId);
  const wanted = useB08((s) => s.notebookTab);
  useEffect(() => {
    if (wanted) setTab(wanted as Tab);
  }, [wanted]);
  if (!rt) return null;
  const w = rt.world;
  const m = w.photo;
  const readings = (kinds: string[], target?: string) => m.readings.filter((r) => kinds.includes(r.kind) && (!target || r.target === target));
  const rlabel = (id: string) => {
    const r = m.readings.find((x) => x.id === id)!;
    return `${r.id} · ${r.target} · ${r.kind === 'btb' ? t(`b08.val.${r.color}`) : `${r.value} ${r.unit}`}${r.elapsedS !== null ? ` · ${Math.round(r.elapsedS)} s` : ''}`;
  };
  const text = (path: string, value: string, set: (n: B08Notebook, v: string) => void) => {
    const idf = `b08-${path.replace(/[^a-zA-Z0-9]/g, '_')}`;
    return (
      <div className="field" key={path}>
        <label htmlFor={idf}>{t(`b08.nb.f.${path}`)}</label>
        <textarea id={idf} value={value} onChange={(e) => setNb((n) => set(n, e.target.value), path, value, e.target.value)} />
      </div>
    );
  };
  const inp = (label: string, value: string, path: string, set: (n: B08Notebook, v: string) => void) => (
    <input aria-label={label} type="text" value={value} onChange={(e) => setNb((n) => set(n, e.target.value), path, value, e.target.value)} />
  );
  const sel = (label: string, value: string | null, ids: string[], display: (x: string) => string, path: string, set: (n: B08Notebook, v: string | null) => void) => (
    <select aria-label={label} value={value ?? ''} onChange={(e) => setNb((n) => set(n, e.target.value || null), path, value ?? '', e.target.value)}>
      <option value="">{t('nb.choose')}</option>
      {ids.map((x) => <option key={x} value={x}>{display(x)}</option>)}
    </select>
  );
  const chk = (key: string, value: boolean, path: string, set: (n: B08Notebook, v: boolean) => void) => (
    <label className="check small"><input type="checkbox" checked={value} onChange={(e) => setNb((n) => set(n, e.target.checked), path, String(value), String(e.target.checked))} /> {t(key)}</label>
  );
  const head = (cols: string[]) => (
    <thead><tr>{cols.map((c) => <th key={c}>{t(`b08.nb.col.${c}`)}</th>)}</tr></thead>
  );
  const COLORS = ['yellow', 'green', 'blue'];
  const BAND_COLORS = ['orange', 'yellow', 'paleYellow', 'blueGreen', 'yellowGreen', 'oliveGreen'];
  const val = (x: string) => t(`b08.val.${x}`);
  const bal = conservedPhoto(w);
  return (
    <aside className="drawer notebook" aria-label={t('b08.nb.title')}>
      <div className="drawer-head">
        <h2>{t('b08.nb.title')}</h2>
        <span className="hint" aria-live="polite">{savedAt ? t('nb.saved') : ''}</span>
        <button className="btn small ghost" aria-label={t('nb.close')} onClick={toggle}>✕</button>
      </div>
      <div className="tabs" role="tablist">
        {TABS.map((k) => <button key={k} role="tab" aria-selected={tab === k} className={`tab${tab === k ? ' on' : ''}`} onClick={() => setTab(k)}>{t(`b08.nb.tab.${k}`)}</button>)}
      </div>
      <div className="nb-body">
        {tab === 'pre' && (
          <section>
            <h3>{t('b08.nb.tab.pre')}</h3>
            {text('prereport.hypothesis', nb.prereport.hypothesis, (n, v) => { n.prereport.hypothesis = v; })}
            {text('prereport.variable', nb.prereport.variable, (n, v) => { n.prereport.variable = v; })}
            {text('prereport.precautions', nb.prereport.precautions, (n, v) => { n.prereport.precautions = v; })}
            <div className="row">
              <button className="btn primary" disabled={!nb.prereport.hypothesis.trim() || !nb.prereport.variable.trim()} onClick={() => dispatch({ type: 'recordHypothesis', variable: nb.prereport.variable })}>{t('b08.nb.recordHypothesis')}</button>
              <span className="hint" aria-live="polite">{m.hypothesis.recorded ? `✓ ${t('b08.nb.recorded')}` : ''}</span>
            </div>
          </section>
        )}
        {tab === 'prep' && (
          <section>
            <h3>{t('b08.nb.tableA')}</h3>
            <div className="table-scroll"><table className="nb-table">
              {head(['tube', 'treatment', 'biomass', 'volume', 'dic', 'light', 'temp', 'sealed'])}
              <tbody>{nb.prep.map((r, i) => (
                <tr key={r.tubeId}>
                  <td>{r.tubeId}</td>
                  <td>{sel(t('b08.nb.col.treatment'), r.treatment, ['light', 'dark'], val, `prep.${i}.treatment`, (n, v) => { n.prep[i].treatment = (v ?? '') as '' | 'light' | 'dark'; })}</td>
                  <td>{inp(t('b08.nb.col.biomass'), r.biomass, `prep.${i}.biomass`, (n, v) => { n.prep[i].biomass = v; })}</td>
                  <td>{inp(t('b08.nb.col.volume'), r.volume, `prep.${i}.volume`, (n, v) => { n.prep[i].volume = v; })}</td>
                  <td>{inp(t('b08.nb.col.dic'), r.dic, `prep.${i}.dic`, (n, v) => { n.prep[i].dic = v; })}</td>
                  <td>{inp(t('b08.nb.col.light'), r.light, `prep.${i}.light`, (n, v) => { n.prep[i].light = v; })}</td>
                  <td>{inp(t('b08.nb.col.temp'), r.tempC, `prep.${i}.tempC`, (n, v) => { n.prep[i].tempC = v; })}</td>
                  <td>{chk('b08.nb.yes', r.sealed, `prep.${i}.sealed`, (n, v) => { n.prep[i].sealed = v; })}</td>
                </tr>
              ))}</tbody>
            </table></div>
          </section>
        )}
        {tab === 'gas' && (
          <section>
            <h3>{t('b08.nb.tableB')}</h3>
            <div className="table-scroll"><table className="nb-table">
              {head(['tube', 'initial', 'final', 'dh', 'minutes', 'hours', 'slope', 'unit', 'radius', 'noCal', 'dv', 'umol'])}
              <tbody>{nb.gas.map((r, i) => {
                const ids = readings(['baseline', 'meniscus']).map((x) => x.id);
                const pickReading = (id: string | null, key: 'initial' | 'final', n: B08Notebook) => {
                  const x = m.readings.find((q) => q.id === id);
                  n.gas[i][key === 'initial' ? 'baselineId' : 'finalId'] = id;
                  n.gas[i][key] = x ? String(x.value) : '';
                };
                return (
                  <tr key={r.tubeId}>
                    <td>{r.tubeId}</td>
                    <td>{sel(t('b08.nb.col.initial'), r.baselineId, ids, rlabel, `gas.${i}.baselineId`, (n, v) => pickReading(v, 'initial', n))}</td>
                    <td>{sel(t('b08.nb.col.final'), r.finalId, ids, rlabel, `gas.${i}.finalId`, (n, v) => pickReading(v, 'final', n))}</td>
                    <td>{inp(t('b08.nb.col.dh'), r.dh, `gas.${i}.dh`, (n, v) => { n.gas[i].dh = v; })}</td>
                    <td>{inp(t('b08.nb.col.minutes'), r.minutes, `gas.${i}.minutes`, (n, v) => { n.gas[i].minutes = v; })}</td>
                    <td>{inp(t('b08.nb.col.hours'), r.hours, `gas.${i}.hours`, (n, v) => { n.gas[i].hours = v; })}</td>
                    <td>{inp(t('b08.nb.col.slope'), r.slope, `gas.${i}.slope`, (n, v) => { n.gas[i].slope = v; })}</td>
                    <td>{sel(t('b08.nb.col.unit'), r.slopeUnit, ['mm/h', 'umol/min'], (x) => t(`b08.unit.${x}`), `gas.${i}.slopeUnit`, (n, v) => { n.gas[i].slopeUnit = (v ?? '') as '' | 'mm/h' | 'umol/min'; })}</td>
                    <td>{inp(t('b08.nb.col.radius'), r.radiusMm, `gas.${i}.radiusMm`, (n, v) => { n.gas[i].radiusMm = v; })}</td>
                    <td>{chk('b08.nb.yes', r.noCalibration, `gas.${i}.noCalibration`, (n, v) => { n.gas[i].noCalibration = v; })}</td>
                    <td>{inp(t('b08.nb.col.dv'), r.dvMl, `gas.${i}.dvMl`, (n, v) => { n.gas[i].dvMl = v; })}</td>
                    <td>{inp(t('b08.nb.col.umol'), r.umol, `gas.${i}.umol`, (n, v) => { n.gas[i].umol = v; })}</td>
                  </tr>
                );
              })}</tbody>
            </table></div>
            <fieldset className="nb-fieldset">
              <legend>{t('b08.nb.gross')}</legend>
              <div className="row">
                {(['net', 'dark', 'gross', 'unit'] as const).map((k) => <label key={k} className="field">{t(`b08.nb.grossF.${k}`)}{inp(t(`b08.nb.grossF.${k}`), nb.gross[k], `gross.${k}`, (n, v) => { n.gross[k] = v; })}</label>)}
              </div>
              {chk('b08.nb.assumption', nb.gross.assumptionStated, 'gross.assumptionStated', (n, v) => { n.gross.assumptionStated = v; })}
              {chk('b08.nb.humidity', nb.gross.humidityCorrected, 'gross.humidityCorrected', (n, v) => { n.gross.humidityCorrected = v; })}
            </fieldset>
          </section>
        )}
        {tab === 'btb' && (
          <section>
            <h3>{t('b08.nb.tableC')}</h3>
            <div className="table-scroll"><table className="nb-table">
              {head(['tube', 'plant', 'lightOn', 'dic', 'btb', 'ph', 'read0', 'color0', 'colorMid', 'readEnd', 'colorEnd', 'interpretation'])}
              <tbody>{nb.btb.map((r, i) => {
                const ids = readings(['btb'], r.tubeId).map((x) => x.id);
                return (
                  <tr key={r.tubeId}>
                    <td>{r.tubeId}</td>
                    <td>{chk('b08.nb.yes', r.plant, `btb.${i}.plant`, (n, v) => { n.btb[i].plant = v; })}</td>
                    <td>{chk('b08.nb.yes', r.light, `btb.${i}.light`, (n, v) => { n.btb[i].light = v; })}</td>
                    <td>{inp(t('b08.nb.col.dic'), r.dic, `btb.${i}.dic`, (n, v) => { n.btb[i].dic = v; })}</td>
                    <td>{inp(t('b08.nb.col.btb'), r.btb, `btb.${i}.btb`, (n, v) => { n.btb[i].btb = v; })}</td>
                    <td>{m.btb && w.params.photo!.btbCalibrated ? inp(t('b08.nb.col.ph'), r.ph, `btb.${i}.ph`, (n, v) => { n.btb[i].ph = v; }) : <span className="hint">{t('b08.nb.qualitative')}</span>}</td>
                    <td>{sel(t('b08.nb.col.read0'), r.readingId0, ids, rlabel, `btb.${i}.readingId0`, (n, v) => { n.btb[i].readingId0 = v; })}</td>
                    <td>{sel(t('b08.nb.col.color0'), r.color0, COLORS, val, `btb.${i}.color0`, (n, v) => { n.btb[i].color0 = v ?? ''; })}</td>
                    <td>{sel(t('b08.nb.col.colorMid'), r.colorMid, COLORS, val, `btb.${i}.colorMid`, (n, v) => { n.btb[i].colorMid = v ?? ''; })}</td>
                    <td>{sel(t('b08.nb.col.readEnd'), r.readingIdEnd, ids, rlabel, `btb.${i}.readingIdEnd`, (n, v) => { n.btb[i].readingIdEnd = v; })}</td>
                    <td>{sel(t('b08.nb.col.colorEnd'), r.colorEnd, COLORS, val, `btb.${i}.colorEnd`, (n, v) => { n.btb[i].colorEnd = v ?? ''; })}</td>
                    <td>{inp(t('b08.nb.col.interpretation'), r.interpretation, `btb.${i}.interpretation`, (n, v) => { n.btb[i].interpretation = v; })}</td>
                  </tr>
                );
              })}</tbody>
            </table></div>
          </section>
        )}
        {tab === 'pig' && (
          <section>
            <h3>{t('b08.nb.tableD')}</h3>
            <div className="row">
              {(['mass', 'volumes', 'grind', 'phase', 'aspect', 'lightNote'] as const).map((k) => <label key={k} className="field">{t(`b08.nb.extF.${k}`)}{inp(t(`b08.nb.extF.${k}`), nb.extraction[k], `extraction.${k}`, (n, v) => { n.extraction[k] = v; })}</label>)}
            </div>
            <div className="table-scroll"><table className="nb-table">
              {head(['band', 'frontReading', 'color', 'origin', 'center', 'front', 'dBand', 'dFront', 'rf', 'u', 'identity', 'composite', 'anomaly'])}
              <tbody>{nb.bands.map((r, i) => {
                const ids = readings(['band']).map((x) => x.id);
                const fronts = readings(['band', 'front']).map((x) => x.id);
                return (
                  <tr key={i}>
                    <td>{sel(t('b08.nb.col.band'), r.readingId, ids, rlabel, `bands.${i}.readingId`, (n, v) => { const x = m.readings.find((q) => q.id === v); n.bands[i].readingId = v; n.bands[i].bandId = x?.target ?? ''; n.bands[i].center = x ? String(x.value) : ''; })}</td>
                    <td>{sel(t('b08.nb.col.frontReading'), r.frontReadingId, fronts, rlabel, `bands.${i}.frontReadingId`, (n, v) => { const x = m.readings.find((q) => q.id === v); n.bands[i].frontReadingId = v; n.bands[i].front = x ? String(x.value) : ''; })}</td>
                    <td>{sel(t('b08.nb.col.color'), r.color, BAND_COLORS, val, `bands.${i}.color`, (n, v) => { n.bands[i].color = v ?? ''; })}</td>
                    {(['origin', 'center', 'front', 'dBand', 'dFront', 'rf', 'u', 'identity'] as const).map((k) => <td key={k}>{inp(t(`b08.nb.col.${k}`), r[k], `bands.${i}.${k}`, (n, v) => { n.bands[i][k] = v; })}</td>)}
                    <td>{chk('b08.nb.yes', r.composite, `bands.${i}.composite`, (n, v) => { n.bands[i].composite = v; })}</td>
                    <td>{chk('b08.nb.yes', r.anomaly, `bands.${i}.anomaly`, (n, v) => { n.bands[i].anomaly = v; })}</td>
                  </tr>
                );
              })}</tbody>
            </table></div>
            <button className="btn small" onClick={() => setNb((n) => { n.bands.push(bandRow()); })}>{t('b08.nb.addBand')}</button>
          </section>
        )}
        {tab === 'synth' && (
          <section>
            <h3>{t('b08.nb.tableE')}</h3>
            {text('synthesis.hypothesisResult', nb.synthesis.hypothesisResult, (n, v) => { n.synthesis.hypothesisResult = v; })}
            {text('synthesis.conclusion', nb.synthesis.conclusion, (n, v) => { n.synthesis.conclusion = v; })}
            {text('synthesis.limits', nb.synthesis.limits, (n, v) => { n.synthesis.limits = v; })}
            <fieldset className="nb-fieldset">
              <legend>{t('b08.nb.claims')}</legend>
              {(Object.keys(nb.claims) as Array<keyof B08Notebook['claims']>).map((k) => <span key={k}>{chk(`b08.nb.claim.${k}`, nb.claims[k], `claims.${k}`, (n, v) => { n.claims[k] = v; })}</span>)}
            </fieldset>
          </section>
        )}
        {tab === 'close' && (
          <section>
            <h3>{t('b08.nb.tab.close')}</h3>
            {text('open.notes', nb.open.notes, (n, v) => { n.open.notes = v; })}
            {text('open.limitations', nb.open.limitations, (n, v) => { n.open.limitations = v; })}
            {text('open.errors', nb.open.errors, (n, v) => { n.open.errors = v; })}
            <ul className="fb-list">
              <li>{t('b08.nb.close.balance', { err: fmt(Math.max(...Object.values(bal).map(Math.abs)), 6) })}</li>
              <li>{t('b08.nb.close.lamps', { n: Object.values(m.lamps).filter((l) => l.on).length })}</li>
              <li>{t('b08.nb.close.incidents', { n: w.cell.incidents.length })}</li>
            </ul>
            <div className="row">
              <button className="btn primary" onClick={() => dispatch({ type: 'closeBench' })}>{t('b08.act.closeBench')}</button>
              <span className="hint" aria-live="polite">{w.evidence.benchRestored ? `✓ ${t('b08.nb.benchOk')}` : w.evidence.closeAttempted ? t('b08.nb.benchPending') : ''}</span>
            </div>
          </section>
        )}
        {tab === 'questions' && (
          <section>
            <h3>{t('b08.nb.questions')}</h3>
            {QUESTIONS_B08.map((q) => text(`analysis.${q}`, nb.analysis[q], (n, v) => { n.analysis[q] = v; }))}
          </section>
        )}
        {tab === 'log' && (
          <section aria-label={t('b08.nb.tab.log')}>
            <h3>{t('b08.nb.readings')}</h3>
            <ul className="fb-list">{m.readings.map((r) => <li key={r.id}>{rlabel(r.id)}</li>)}</ul>
            <h3>{t('p4.nb.history', { n: nb.history.length })}</h3>
            <ul className="fb-list" style={{ maxHeight: '14rem', overflow: 'auto' }}>
              {[...nb.history].reverse().slice(0, 80).map((h, i) => <li key={i}><span className="hint">{fmt(h.t, 0)} s</span> {h.field}: «{h.from.slice(0, 40)}» → «{h.to.slice(0, 40)}»</li>)}
            </ul>
            <div className="row">
              <button className="btn small" onClick={() => downloadJson(`libreta-b08-${attemptId}.json`, { attemptId, notebook: nb, readings: m.readings })}>{t('nb.export')}</button>
              <button className="btn small ghost" onClick={() => window.print()}>{t('p10.nb.print')}</button>
            </div>
          </section>
        )}
      </div>
    </aside>
  );
}
