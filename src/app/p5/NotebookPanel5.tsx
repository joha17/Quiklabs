import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useP5 } from './store';
import {
  ANALYSIS_KEYS, MEASURED_ROWS, TABLE1_ROWS, TABLE2_ROWS, parseNum, type P5Notebook, type Table1Row, type Table2Row,
} from '../../practices/practice-05/notebook';
import { classify, differences } from '../../practices/practice-05/evidence';
import { expectedResults } from '../../practices/practice-05/expected-results';
import { validateP5Equation, type P5Equation, type P5Term } from '../../practices/practice-05/equation';
import { factorCorrect, validateChain, type Factor, type Quantity } from '../../simulation/stoichiometry/stoich';
import { prettyFormula } from '../../simulation/chemistry/formula';
import { downloadJson } from '../persistence';

type Tab = 'masses' | 'calc' | 'chains' | 'eq' | 'chart' | 'analysis' | 'log';

const fmt = (v: number, d = 2) => v.toFixed(d).replace('.', ',');
const SPECIES: Quantity['species'][] = ['KClO3', 'KCl', 'O2'];
const UNITS: Quantity['unit'][] = ['g', 'mol'];
const STATES: P5Term['state'][] = ['', 's', 'l', 'g', 'aq'];

/** Gráfica de masa del tubo frente al ciclo de calentamiento (lecturas válidas, con barras de incertidumbre). */
function MassChart({ points, u, criterion }: { points: Array<{ cycle: number; g: number; id: string }>; u: number; criterion: number }) {
  const { t } = useTranslation();
  if (points.length < 1) return <p className="hint">{t('p5.nb.chartEmpty')}</p>;
  const W = 320;
  const H = 180;
  const P = 34;
  const ys = points.map((p) => p.g);
  const lo = Math.min(...ys) - 0.3;
  const hi = Math.max(...ys) + 0.3;
  const maxC = Math.max(2, ...points.map((p) => p.cycle));
  const X = (c: number) => P + ((W - P - 10) * c) / maxC;
  const Y = (g: number) => H - P + 6 - ((H - P - 4) * (g - lo)) / Math.max(0.1, hi - lo);
  const last = points[points.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="p5-chart" role="img" aria-label={t('p5.nb.chartLabel', { n: points.length })}>
      <line x1={P} y1={H - P + 6} x2={W - 6} y2={H - P + 6} className="axis" />
      <line x1={P} y1={4} x2={P} y2={H - P + 6} className="axis" />
      {Array.from({ length: maxC + 1 }, (_, c) => <text key={c} x={X(c)} y={H - 12} className="tick" textAnchor="middle">{c}</text>)}
      <text x={W / 2} y={H - 1} className="lab" textAnchor="middle">{t('p5.nb.chartX')}</text>
      {[lo + 0.3, (lo + hi) / 2, hi - 0.3].map((g) => <text key={g} x={P - 3} y={Y(g) + 3} className="tick" textAnchor="end">{fmt(g, 1)}</text>)}
      {/* Banda del criterio de masa constante alrededor de la última lectura. */}
      {points.length > 1 && <rect x={P} width={W - P - 6} y={Y(last.g + criterion)} height={Math.max(1, Y(last.g - criterion) - Y(last.g + criterion))} className="band" />}
      <polyline points={points.map((p) => `${X(p.cycle)},${Y(p.g)}`).join(' ')} className="line" />
      {points.map((p) => (
        <g key={p.id}>
          <line x1={X(p.cycle)} x2={X(p.cycle)} y1={Y(p.g + u)} y2={Y(p.g - u)} className="err" />
          <circle cx={X(p.cycle)} cy={Y(p.g)} r={3.2} className="pt" />
        </g>
      ))}
    </svg>
  );
}

/** Editor de la ecuación de la Práctica 5: coeficientes, fórmulas, estados y condiciones sobre la flecha. */
function EquationEditor5({ value, onChange, showCheck }: { value: P5Equation; onChange(next: P5Equation, field: string): void; showCheck: boolean }) {
  const { t } = useTranslation();
  const v = validateP5Equation(value);
  const set = (side: 'reactants' | 'products', i: number, patch: Partial<P5Term>) => {
    const next = structuredClone(value);
    next[side][i] = { ...next[side][i], ...patch };
    onChange(next, `${side}[${i}]`);
  };
  const add = (side: 'reactants' | 'products') => {
    const next = structuredClone(value);
    next[side].push({ coef: 1, formula: '', state: '' });
    onChange(next, `${side}+`);
  };
  const remove = (side: 'reactants' | 'products', i: number) => {
    const next = structuredClone(value);
    next[side].splice(i, 1);
    onChange(next, `${side}-`);
  };
  const side = (s: 'reactants' | 'products') => (
    <fieldset className="eq-side">
      <legend>{t(`p5.nb.eq.${s}`)}</legend>
      {value[s].map((tm, i) => (
        <div key={i} className="eq-term">
          <input aria-label={t('p5.nb.eq.coef')} type="number" min={1} max={20} value={tm.coef} onChange={(e) => set(s, i, { coef: Math.max(1, Math.round(Number(e.target.value) || 1)) })} style={{ width: '3.4rem' }} />
          <input aria-label={t('p5.nb.eq.formula')} type="text" value={tm.formula} placeholder="KClO3" onChange={(e) => set(s, i, { formula: e.target.value.replace(/\s/g, '') })} style={{ width: '6.5rem' }} />
          <select aria-label={t('p5.nb.eq.state')} value={tm.state} onChange={(e) => set(s, i, { state: e.target.value as P5Term['state'] })}>
            {STATES.map((x) => <option key={x} value={x}>{x ? `(${x === 'aq' ? 'ac' : x})` : '—'}</option>)}
          </select>
          <button className="btn small ghost" aria-label={t('p5.nb.eq.remove')} onClick={() => remove(s, i)}>×</button>
        </div>
      ))}
      <button className="btn small" onClick={() => add(s)}>+ {t('p5.nb.eq.add')}</button>
    </fieldset>
  );
  const text = (terms: P5Term[]) => terms.filter((x) => x.formula).map((x) => `${x.coef > 1 ? `${x.coef} ` : ''}${prettyFormula(x.formula)}${x.state ? `(${x.state === 'aq' ? 'ac' : x.state})` : ''}`).join(' + ');
  const over = [value.heat ? 'Δ' : '', value.catalyst ? prettyFormula(value.catalyst) : ''].filter(Boolean).join(', ');
  return (
    <div style={{ display: 'grid', gap: '0.6rem' }}>
      {side('reactants')}
      <div className="p5-eq-arrow">
        <label className="check"><input type="checkbox" checked={value.heat} onChange={(e) => onChange({ ...value, heat: e.target.checked }, 'heat')} /> {t('p5.nb.eq.heat')}</label>
        <div className="field">
          <label htmlFor="p5cat">{t('p5.nb.eq.catalyst')}</label>
          <input id="p5cat" type="text" value={value.catalyst} placeholder="—" onChange={(e) => onChange({ ...value, catalyst: e.target.value.replace(/\s/g, '') }, 'catalyst')} />
        </div>
      </div>
      {side('products')}
      <p className="eq-preview" aria-live="polite">{text(value.reactants) || '…'} <span className="arrow">{over ? <sup>{over}</sup> : null}→</span> {text(value.products) || '…'}</p>
      {showCheck && (
        <ul className="fb-list" aria-live="polite">
          <li className={v.atomsBalanced ? 'ok' : 'bad'}>{v.atomsBalanced ? '✓' : '✗'} {t('p5.nb.eq.v.atoms')}</li>
          <li className={v.lowestWholeNumberRatio ? 'ok' : 'bad'}>{v.lowestWholeNumberRatio ? '✓' : '✗'} {t('p5.nb.eq.v.ratio')}</li>
          <li className={v.speciesCorrect ? 'ok' : 'bad'}>{v.speciesCorrect ? '✓' : '✗'} {t('p5.nb.eq.v.species')}</li>
          <li className={v.statesCorrect ? 'ok' : 'bad'}>{v.statesCorrect ? '✓' : '✗'} {t('p5.nb.eq.v.states')}</li>
          <li className={v.catalystPlacedAsCondition && !v.catalystIncorrectlyConsumed ? 'ok' : 'bad'}>{v.catalystPlacedAsCondition && !v.catalystIncorrectlyConsumed ? '✓' : '✗'} {t('p5.nb.eq.v.catalyst')}</li>
          <li className={v.heatMarked ? 'ok' : 'bad'}>{v.heatMarked ? '✓' : '✗'} {t('p5.nb.eq.v.heat')}</li>
          {v.unknownFormulas.length > 0 && <li className="bad">✗ {t('p5.nb.eq.v.unknown', { f: v.unknownFormulas.join(', ') })}</li>}
        </ul>
      )}
    </div>
  );
}

/** Editor de una cadena de análisis dimensional (§21.3): factores numerador/denominador con unidades y especies. */
function ChainEditor({ which, nb, kclo3, onChange, showCheck }: { which: 'kcl' | 'o2'; nb: P5Notebook; kclo3: number | null; onChange(next: Factor[], field: string): void; showCheck: boolean }) {
  const { t } = useTranslation();
  const chain = nb.chains[which];
  const target = { unit: 'g' as const, species: which === 'kcl' ? ('KCl' as const) : ('O2' as const) };
  const v = validateChain({ value: kclo3 ?? 0, unit: 'g', species: 'KClO3' }, chain, target);
  const blank = (): Factor => ({ num: { value: 1, unit: 'mol', species: 'KClO3' }, den: { value: 1, unit: 'g', species: 'KClO3' } });
  const setQ = (i: number, part: 'num' | 'den', patch: Partial<Quantity>) => {
    const next = structuredClone(chain);
    next[i][part] = { ...next[i][part], ...patch };
    onChange(next, `${which}[${i}].${part}`);
  };
  const qEdit = (i: number, part: 'num' | 'den', q: Quantity) => (
    <span className="q-edit">
      <input aria-label={t(`p5.nb.chain.${part}Value`)} type="text" inputMode="decimal" defaultValue={String(q.value).replace('.', ',')} key={`${i}-${part}-${q.value}`} style={{ width: '5.2rem' }}
        onBlur={(e) => { const n = parseNum(e.target.value); if (Number.isFinite(n) && n > 0) setQ(i, part, { value: n }); }} />
      <select aria-label={t('p5.nb.chain.unit')} value={q.unit} onChange={(e) => setQ(i, part, { unit: e.target.value as Quantity['unit'] })}>
        {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
      </select>
      <select aria-label={t('p5.nb.chain.species')} value={q.species} onChange={(e) => setQ(i, part, { species: e.target.value as Quantity['species'] })}>
        {SPECIES.map((s) => <option key={s} value={s}>{prettyFormula(s)}</option>)}
      </select>
    </span>
  );
  return (
    <div className="chain">
      <h4>{t(`p5.nb.chain.${which}`)}</h4>
      <div className="chain-row">
        <span className="chain-start">{kclo3 !== null ? `${fmt(kclo3, 2)} g KClO₃` : t('p5.nb.chain.noMass')}</span>
        {chain.map((f, i) => (
          <span key={i} className="factor" aria-label={t('p5.nb.chain.factor', { n: i + 1 })}>
            <span className="times">×</span>
            <span className="frac">
              {qEdit(i, 'num', f.num)}
              <span className="bar" aria-hidden="true" />
              {qEdit(i, 'den', f.den)}
            </span>
            {showCheck && <span className={v.unitsCancel[i] && factorCorrect(f) ? 'ok' : 'bad'} title={!v.unitsCancel[i] ? t('p5.nb.chain.noCancel') : !factorCorrect(f) ? t('p5.nb.chain.badFactor') : ''}>{v.unitsCancel[i] && factorCorrect(f) ? '✓' : '✗'}</span>}
            <button className="btn small ghost" aria-label={t('p5.nb.chain.remove')} onClick={() => { const next = chain.filter((_, k) => k !== i); onChange(next, `${which}-`); }}>×</button>
          </span>
        ))}
        <button className="btn small" onClick={() => onChange([...chain, blank()], `${which}+`)}>+ {t('p5.nb.chain.add')}</button>
      </div>
      {chain.length > 0 && (
        <p className="hint" aria-live="polite">
          = {Number.isFinite(v.result) ? fmt(v.result, 3) : '—'} {v.targetReached ? `g ${prettyFormula(target.species)}` : t('p5.nb.chain.unitPending')}
          {showCheck && v.gramsAsMoles && <span className="bad"> · {t('p5.nb.chain.gramsAsMoles')}</span>}
          {showCheck && v.ok && <span className="ok"> · ✓</span>}
        </p>
      )}
    </div>
  );
}

/**
 * Libreta digital de la Práctica 5 (§20): Cuadro 5.1 (masas con incertidumbre, importadas de lecturas válidas),
 * Cuadro 5.2 (cálculos del estudiante), cadenas de análisis dimensional, ecuación, gráfica de masa por ciclo, análisis
 * e historial de correcciones. Nunca completa los cálculos: «revisar» solo dice cuántos campos no coinciden.
 */
export function NotebookPanel5() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('masses');
  const nb = useP5((s) => s.notebook);
  const setNb = useP5((s) => s.setNotebook);
  const toggle = useP5((s) => s.toggleNotebook);
  const savedAt = useP5((s) => s.savedAt);
  useP5((s) => s.version);
  const rt = useP5((s) => s.runtime);
  const mode = useP5((s) => s.settings.mode);
  const attemptId = useP5((s) => s.attemptId);
  const wanted = useP5((s) => s.notebookTab);
  const [checked, setChecked] = useState<{ calc?: number; eq?: boolean; chains?: boolean }>({});
  useEffect(() => {
    if (wanted) setTab(wanted as Tab);
  }, [wanted]);
  if (!rt) return null;
  const w = rt.world;
  const practice = mode === 'PRACTICE' || mode === 'GUIDED';
  const d = differences(w);
  const valid = w.measurements.filter((m) => m.valid && !m.zeroCheck);
  const u = w.balance.uncertaintyG;

  const setRow = (row: Table1Row, field: 'value' | 'uncertainty' | 'observations', value: string, mid?: string | null) => {
    const from = nb.table1[row][field];
    setNb((n) => {
      n.table1[row][field] = value;
      if (mid !== undefined) n.table1[row].measurementId = mid;
    }, `t1.${row}.${field}`, from, value);
  };
  const importReading = (row: Table1Row, mid: string) => {
    const m = w.measurements.find((x) => x.id === mid);
    if (!m) return;
    const from = nb.table1[row].value;
    const value = fmt(m.displayedMassG, 1);
    setNb((n) => {
      n.table1[row] = { ...n.table1[row], value, uncertainty: fmt(m.uncertaintyG, 2), measurementId: mid, observations: n.table1[row].observations || t('p5.nb.tempAt', { c: fmt(m.loadTemperatureC, 0) }) };
    }, `t1.${row}.import`, from, value);
  };
  const setT2 = (row: Table2Row, value: string) => {
    const from = nb.table2[row];
    setNb((n) => {
      n.table2[row] = value;
    }, `t2.${row}`, from, value);
  };
  const checkCalc = () => {
    const e = expectedResults(w);
    const want: Record<Table2Row, number | null> = { nKClO3: e.nKClO3, nKClTheo: e.nKClTheo, mKClTheo: e.mKClTheo, nO2Theo: e.nO2Theo, mO2Theo: e.mO2Theo, mKClExp: e.mKClExp, yieldPct: e.yieldPct };
    let wrong = 0;
    for (const r of TABLE2_ROWS) {
      const x = parseNum(nb.table2[r]);
      const v = want[r];
      if (v === null || !Number.isFinite(x) || Math.abs(x - v) > Math.max(r === 'yieldPct' ? 1.5 : 0.011, Math.abs(v) * 0.03)) wrong++;
    }
    setChecked({ ...checked, calc: wrong });
  };
  const points = [
    ...(d.readings.tubeInitial ? [{ cycle: 0, g: d.readings.tubeInitial.displayedMassG, id: d.readings.tubeInitial.id }] : []),
    ...d.readings.afterHeat.map((m) => ({ cycle: m.cycle, g: m.displayedMassG, id: m.id })),
  ];

  return (
    <aside className="drawer" aria-label={t('nb.title')}>
      <div className="drawer-head">
        <h2>📓 {t('nb.title')}</h2>
        <span style={{ flex: 1 }} />
        <button className="btn small ghost" onClick={toggle} aria-label={t('common.close')}>×</button>
      </div>
      <div className="drawer-body">
        <div className="tabs" role="tablist">
          {(['masses', 'calc', 'chains', 'eq', 'chart', 'analysis', 'log'] as Tab[]).map((k) => (
            <button key={k} role="tab" className="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{t(`p5.nb.tab.${k}`)}</button>
          ))}
        </div>
        {savedAt && <span className="hint">{t('nb.saved', { time: new Date(savedAt).toLocaleTimeString() })}</span>}

        {tab === 'masses' && (
          <section aria-label={t('p5.nb.t1')}>
            <h3>{t('p5.nb.t1')}</h3>
            <p className="hint">{t('p5.nb.t1Help')}</p>
            <div className="table-scroll">
              <table className="data p5-t1">
                <thead><tr><th>{t('p5.nb.col.item')}</th><th>{t('p5.nb.col.value')}</th><th>±</th><th>{t('p5.nb.col.obs')}</th></tr></thead>
                <tbody>
                  {TABLE1_ROWS.map((r) => {
                    const e = nb.table1[r];
                    const measured = MEASURED_ROWS.includes(r);
                    return (
                      <tr key={r}>
                        <th scope="row">{t(`p5.nb.row.${r}`)}</th>
                        <td>
                          <div style={{ display: 'flex', gap: '0.25rem' }}>
                            <input aria-label={`${t(`p5.nb.row.${r}`)} — ${t('p5.nb.col.value')}`} type="text" inputMode="decimal" value={e.value} style={{ width: '5.5rem' }} onChange={(ev) => setRow(r, 'value', ev.target.value, measured ? null : undefined)} />
                            {measured && valid.length > 0 && (
                              <select aria-label={t('p5.nb.import')} value={e.measurementId ?? ''} onChange={(ev) => ev.target.value && importReading(r, ev.target.value)} style={{ maxWidth: '7rem' }}>
                                <option value="">📥</option>
                                {valid.map((m) => <option key={m.id} value={m.id}>{m.id} · {fmt(m.displayedMassG, 1)} g · {t(`p5.mkind.${classify(m)}`)}</option>)}
                              </select>
                            )}
                          </div>
                        </td>
                        <td><input aria-label={`${t(`p5.nb.row.${r}`)} — ±`} type="text" inputMode="decimal" value={e.uncertainty} style={{ width: '3.6rem' }} onChange={(ev) => setRow(r, 'uncertainty', ev.target.value)} /></td>
                        <td><input aria-label={`${t(`p5.nb.row.${r}`)} — ${t('p5.nb.col.obs')}`} type="text" value={e.observations} onChange={(ev) => setRow(r, 'observations', ev.target.value)} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="hint">{t('p5.nb.uHelp', { u: fmt(u, 2) })}</p>
          </section>
        )}

        {tab === 'calc' && (
          <section aria-label={t('p5.nb.t2')}>
            <h3>{t('p5.nb.t2')}</h3>
            <p className="hint">{t('p5.nb.t2Help')}</p>
            <div className="table-scroll">
              <table className="data">
                <tbody>
                  {TABLE2_ROWS.map((r) => (
                    <tr key={r}>
                      <th scope="row"><label htmlFor={`p5t2-${r}`}>{t(`p5.nb.calc.${r}`)}</label></th>
                      <td><input id={`p5t2-${r}`} type="text" inputMode="decimal" value={nb.table2[r]} onChange={(e) => setT2(r, e.target.value)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="hint">{t('p5.nb.molar')}</p>
            {practice && (
              <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                <button className="btn small" onClick={checkCalc}>{t('p5.nb.check')}</button>
                {checked.calc !== undefined && <span className={checked.calc ? 'pending' : 'ok'} role="status">{checked.calc ? t('p5.nb.checkWrong', { n: checked.calc }) : '✓'}</span>}
              </div>
            )}
          </section>
        )}

        {tab === 'chains' && (
          <section aria-label={t('p5.nb.tab.chains')} style={{ display: 'grid', gap: '0.8rem' }}>
            <p className="hint">{t('p5.nb.chainHelp')}</p>
            {(['kcl', 'o2'] as const).map((k) => (
              <ChainEditor key={k} which={k} nb={nb} kclo3={d.kclo3} showCheck={practice && !!checked.chains}
                onChange={(next, field) => setNb((n) => { n.chains[k] = next; }, `chain.${field}`, String(nb.chains[k].length), String(next.length))} />
            ))}
            {practice && <button className="btn small" onClick={() => setChecked({ ...checked, chains: true })}>{t('p5.nb.check')}</button>}
          </section>
        )}

        {tab === 'eq' && (
          <section aria-label={t('p5.nb.tab.eq')}>
            <p className="hint">{t('p5.nb.eqHelp')}</p>
            <EquationEditor5 value={nb.equation} showCheck={practice && !!checked.eq}
              onChange={(next, field) => setNb((n) => { n.equation = next; }, `eq.${field}`, JSON.stringify(nb.equation), JSON.stringify(next))} />
            {practice && <button className="btn small" style={{ marginTop: '0.5rem' }} onClick={() => setChecked({ ...checked, eq: true })}>{t('p5.nb.check')}</button>}
          </section>
        )}

        {tab === 'chart' && (
          <section aria-label={t('p5.nb.tab.chart')}>
            <h3>{t('p5.nb.chartTitle')}</h3>
            <MassChart points={points} u={u} criterion={w.params.constantMassCriterionG} />
            <p className="hint">{t('p5.nb.chartHelp', { c: fmt(w.params.constantMassCriterionG, 1) })}</p>
            <ul className="fb-list">
              {points.map((p) => <li key={p.id}>{t('p5.nb.chartPoint', { c: p.cycle, g: fmt(p.g, 1) })}</li>)}
            </ul>
          </section>
        )}

        {tab === 'analysis' && (
          <section aria-label={t('p5.nb.tab.analysis')} style={{ display: 'grid', gap: '0.6rem' }}>
            {ANALYSIS_KEYS.map((k) => (
              <div className="field" key={k}>
                <label htmlFor={`p5-${k}`}>{t(`p5.nb.q.${k}`)}</label>
                <textarea id={`p5-${k}`} value={nb.analysis[k]} onChange={(e) => { const from = nb.analysis[k]; const v = e.target.value; setNb((n) => { n.analysis[k] = v; }, `analysis.${k}`, from, v); }} />
              </div>
            ))}
          </section>
        )}

        {tab === 'log' && (
          <section aria-label={t('p5.nb.tab.log')}>
            <h3>{t('p5.nb.readings')}</h3>
            <ul className="fb-list">
              {w.measurements.map((m) => (
                <li key={m.id}>
                  <span className={m.valid ? 'ok' : 'bad'}>{m.valid ? '✓' : '✗'}</span> {m.id} · {fmt(m.displayedMassG, 1)} g · {fmt(m.loadTemperatureC, 0)} °C · {t(`p5.mkind.${classify(m)}`)}
                  {!m.valid && m.invalidReason && <span className="hint"> · {t(`p5.invalid.${m.invalidReason}`)}</span>}
                </li>
              ))}
            </ul>
            <h3>{t('p4.nb.history', { n: nb.history.length })}</h3>
            <ul className="fb-list" style={{ maxHeight: '14rem', overflow: 'auto' }}>
              {[...nb.history].reverse().slice(0, 80).map((h, i) => <li key={i}><span className="hint">{fmt(h.t, 0)} s</span> {h.field}: «{h.from.slice(0, 40)}» → «{h.to.slice(0, 40)}»</li>)}
            </ul>
            <button className="btn small" onClick={() => downloadJson(`libreta-p5-${attemptId}.json`, { attemptId, notebook: nb, measurements: w.measurements })}>{t('review.export')}</button>
          </section>
        )}
      </div>
    </aside>
  );
}
