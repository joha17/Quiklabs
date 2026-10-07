import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useP10 } from './store';
import {
  PREP_ROWS, REPS, T102_ROWS, T103_IMPORT, T103_ROWS, T103_UNIT, parseNum, type BoyleRow, type Entry, type P10Notebook, type Rep, type T103Row,
} from '../../practices/practice-10/notebook';
import { expectedRep, readingsForRun, runOf } from '../../practices/practice-10/expected-results';
import { inverseFit, powerFitFixed, powerFitFree, pvProducts, residualPattern, type PvPoint } from '../../simulation/gas-laws/boyle';
import { atomImbalance } from '../../simulation/gas-laws/stoich';
import { SENSOR_PROFILES } from '../../simulation/instruments/pressure-sensor';
import { downloadJson } from '../persistence';

type Tab = 'mass' | 'r' | 'boyle' | 'fit' | 'activities' | 'analysis' | 'log';

const fmt = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d).replace('.', ',') : '—');

interface Pt {
  x: number;
  y: number;
}

/** Gráfica de dispersión con curvas opcionales (accesible: tabla de datos debajo). */
function Scatter({ pts, curves = [], label, xLabel, yLabel, zero = false }: { pts: Pt[]; curves?: Array<{ f: (x: number) => number; cls: string }>; label: string; xLabel: string; yLabel: string; zero?: boolean }) {
  const { t } = useTranslation();
  if (pts.length < 2) return <p className="hint">{t('p10.nb.chartEmpty')}</p>;
  const W = 330;
  const H = 180;
  const P = 38;
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x0 = zero ? 0 : Math.min(...xs);
  const x1 = Math.max(...xs);
  let y0 = Math.min(...ys, ...(zero ? [0] : []));
  let y1 = Math.max(...ys, ...(zero ? [0] : []));
  const pad = Math.max(1e-9, (y1 - y0) * 0.08);
  y0 -= pad;
  y1 += pad;
  const X = (x: number) => P + ((W - P - 8) * (x - x0)) / Math.max(1e-12, x1 - x0);
  const Y = (y: number) => H - P + 6 - ((H - P - 4) * (y - y0)) / Math.max(1e-12, y1 - y0);
  const dec = (v: number) => (Math.abs(v) < 0.1 ? 3 : Math.abs(v) < 10 ? 2 : 1);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="p6-chart" role="img" aria-label={label}>
      <line x1={P} y1={H - P + 6} x2={W - 4} y2={H - P + 6} className="axis" />
      <line x1={P} y1={4} x2={P} y2={H - P + 6} className="axis" />
      {y0 < 0 && y1 > 0 && <line x1={P} x2={W - 4} y1={Y(0)} y2={Y(0)} className="mark" />}
      {[y0 + pad, (y0 + y1) / 2, y1 - pad].map((y) => <text key={y} x={P - 3} y={Y(y) + 3} className="tick" textAnchor="end">{fmt(y, dec(y))}</text>)}
      {[x0, (x0 + x1) / 2, x1].map((x) => <text key={x} x={X(x)} y={H - 16} className="tick" textAnchor="middle">{fmt(x, dec(x))}</text>)}
      <text x={W / 2} y={H - 3} className="lab" textAnchor="middle">{xLabel}</text>
      <text x={8} y={10} className="lab">{yLabel}</text>
      {curves.map((c, i) => {
        const n = 40;
        const ptsC = Array.from({ length: n + 1 }, (_, k) => x0 + ((x1 - x0) * k) / n).map((x) => `${X(x)},${Y(c.f(x))}`).join(' ');
        return <polyline key={i} points={ptsC} className={c.cls} />;
      })}
      {pts.map((p, i) => <circle key={i} cx={X(p.x)} cy={Y(p.y)} r={3} className="candPt" />)}
    </svg>
  );
}

function toCsv(rows: Array<Array<string | number>>): string {
  return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
}

function downloadText(name: string, text: string, type = 'text/csv') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Libreta digital de la Práctica 10 (§28): Cuadro 10.2, preparación y reactivo limitante, Cuadro 10.3 (dos réplicas),
 * tabla de Boyle con los puntos guardados, ajustes y residuos, actividades, análisis e historial. Las lecturas se
 * importan solo de instrumentos observados; los cálculos los escribe el estudiante. «Revisar» (práctica y guiado)
 * dice cuántos datos no coinciden con SUS lecturas, sin dar la respuesta.
 */
export function NotebookPanel10() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('mass');
  const nb = useP10((s) => s.notebook);
  const setNb = useP10((s) => s.setNotebook);
  const toggle = useP10((s) => s.toggleNotebook);
  const savedAt = useP10((s) => s.savedAt);
  useP10((s) => s.version);
  const rt = useP10((s) => s.runtime);
  const mode = useP10((s) => s.settings.mode);
  const attemptId = useP10((s) => s.attemptId);
  const wanted = useP10((s) => s.notebookTab);
  const [checked, setChecked] = useState<Record<string, number>>({});
  useEffect(() => {
    if (wanted) setTab(wanted as Tab);
  }, [wanted]);
  if (!rt) return null;
  const w = rt.world;
  const practice = mode === 'PRACTICE' || mode === 'GUIDED';
  const dec = w.params.balance.resolutionG < 0.001 ? 4 : 3;

  const setT102 = (row: string, patch: Partial<Entry>) => {
    const cur = nb.t102[row as keyof P10Notebook['t102']];
    setNb((n) => Object.assign(n.t102[row as keyof P10Notebook['t102']], patch), `t102.${row}`, cur.value, patch.value ?? cur.value);
  };
  const setT103 = (row: T103Row, rep: Rep, patch: Partial<Entry>) => {
    const cur = nb.t103[row][rep];
    setNb((n) => Object.assign(n.t103[row][rep], patch), `t103.${row}.${rep}`, cur.value, patch.value ?? cur.value);
  };
  const field = (path: string, value: string, set: (n: P10Notebook, v: string) => void, area = false) => {
    const idf = `p10-${path}`;
    const on = (v: string) => setNb((n) => set(n, v), path, value, v);
    return (
      <div className="field" key={path}>
        <label htmlFor={idf}>{t(`p10.nb.f.${path}`)}</label>
        {area ? <textarea id={idf} value={value} onChange={(e) => on(e.target.value)} /> : <input id={idf} type="text" inputMode={area ? undefined : 'decimal'} value={value} onChange={(e) => on(e.target.value)} />}
      </div>
    );
  };
  const checkBtn = (key: string, fn: () => number) =>
    practice && (
      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
        <button className="btn small" onClick={() => setChecked({ ...checked, [key]: fn() })}>{t('p5.nb.check')}</button>
        {checked[key] !== undefined && <span className={checked[key] ? 'pending' : 'ok'} role="status">{checked[key] ? t('p10.nb.checkWrong', { n: checked[key] }) : '✓'}</span>}
      </div>
    );
  const wrongCount = (pairs: Array<[string, number | null, number, number]>) =>
    pairs.filter(([s, v, rel, abs]) => v !== null && s.trim() && !(Math.abs(parseNum(s) - v) <= Math.max(abs, Math.abs(v) * rel))).length;

  // ── Importación de lecturas ──
  const masses = w.massReadings.filter((m) => m.valid && !m.tare && m.objectId === 'watch_glass');
  const importT103 = (row: T103Row, rep: Rep) => {
    const run = runOf(w, rep);
    const after = (x: { t: number }) => !run || x.t > run.acidAddedAt;
    if (row === 'readingInitial' || row === 'readingFinal') {
      return w.volumeReadings.filter((v) => v.instrument === 'burette').map((v) => ({ id: v.id, text: `${v.id} · ${fmt(v.valueMl, 2)} mL${v.atEyeLevel && !v.invalid ? '' : ' ⚠'}`, value: fmt(v.valueMl, 2), u: '0,05' }));
    }
    if (row === 'tC') return w.tempReadings.filter(after).map((r) => ({ id: r.id, text: `${r.id} · ${fmt(r.valueC, 1)} °C · ${t(`p10.where.${r.where}`)}${r.changing ? ' ⚠' : ''}`, value: fmt(r.valueC, 1), u: '0,2' }));
    if (row === 'baroMmHg') return w.baroReadings.map((r) => ({ id: r.id, text: `${r.id} · ${fmt(r.mmHg, 1)} mmHg${r.source === 'LOCAL' ? '' : ' ☁'}`, value: fmt(r.mmHg, 1), u: '0,5' }));
    return w.heightReadings.filter(after).map((h) => ({ id: h.id, text: `${h.id} · ${fmt(h.valueMm, 0)} mm${h.rulerAligned ? '' : ' ⚠'}`, value: fmt(h.valueMm, 0), u: '1' }));
  };

  // ── Boyle ──
  const studentPts: PvPoint[] = nb.boyle.map((r) => ({ vMl: parseNum(r.totalMl), pKPa: parseNum(r.pKPa) })).filter((q) => Number.isFinite(q.vMl) && Number.isFinite(q.pKPa));
  const free = powerFitFree(studentPts);
  const m1 = powerFitFixed(studentPts, -1);
  const p1 = powerFitFixed(studentPts, 1);
  const inv = inverseFit(studentPts);
  const pv = pvProducts(studentPts);
  const pattern = residualPattern(studentPts);
  const gauge = SENSOR_PROFILES[w.sensor.model].kind === 'GAUGE';
  const importPoints = () => {
    const have = new Set(nb.boyle.map((r) => r.pointIndex));
    const add = w.points.filter((p) => !have.has(p.index));
    if (!add.length) return;
    setNb((n) => {
      for (const p of add) {
        n.boyle.push({ pointIndex: p.index, markMl: fmt(p.markMl, 1), deadMl: '', totalMl: fmt(p.enteredTotalMl, 1), pKPa: fmt(p.displayedKPa, 2), tK: '' });
      }
    }, 'boyle.import', String(nb.boyle.length), String(nb.boyle.length + add.length));
  };
  const setBoyle = (i: number, k: keyof BoyleRow, v: string) => {
    const from = String(nb.boyle[i][k] ?? '');
    setNb((n) => {
      (n.boyle[i] as unknown as Record<string, string>)[k] = v;
    }, `boyle.${i}.${k}`, from, v);
  };
  const eq = nb.equation;
  const coef = (s: string) => (s.trim() === '' ? 0 : parseNum(s));
  const imb = atomImbalance({ CH3COOH: coef(eq.acid), NaHCO3: coef(eq.bicarb) }, { CH3COONa: coef(eq.acetate), CO2: coef(eq.co2), H2O: coef(eq.water) });
  const eqFilled = Object.values(eq).some((x) => x.trim());

  const exportCsv = () => {
    const rows: Array<Array<string | number>> = [[t('p10.nb.t103'), 'r1', 'r2', t('p10.nb.col.unit')]];
    for (const r of T103_ROWS) rows.push([t(`p10.nb.row.${r}`), nb.t103[r].r1.value, nb.t103[r].r2.value, T103_UNIT[r]]);
    rows.push([]);
    rows.push([t('p10.nb.boyleMark'), t('p10.nb.boyleDead'), t('p10.nb.boyleTotal'), 'P (kPa)', 'T (K)', 'PV']);
    for (const r of nb.boyle) rows.push([r.markMl, r.deadMl, r.totalMl, r.pKPa, r.tK, fmt(parseNum(r.totalMl) * parseNum(r.pKPa), 1)]);
    downloadText(`p10-${attemptId}.csv`, toCsv(rows));
  };

  return (
    <aside className="drawer" aria-label={t('nb.title')}>
      <div className="drawer-head">
        <h2>📓 {t('nb.title')}</h2>
        <span style={{ flex: 1 }} />
        <button className="btn small ghost" onClick={toggle} aria-label={t('common.close')}>×</button>
      </div>
      <div className="drawer-body">
        <div className="tabs" role="tablist">
          {(['mass', 'r', 'boyle', 'fit', 'activities', 'analysis', 'log'] as Tab[]).map((k) => (
            <button key={k} role="tab" className="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{t(`p10.nb.tab.${k}`)}</button>
          ))}
        </div>
        {savedAt && <span className="hint">{t('nb.saved', { time: new Date(savedAt).toLocaleTimeString() })}</span>}

        {tab === 'mass' && (
          <section aria-label={t('p10.nb.t102')} style={{ display: 'grid', gap: '0.6rem' }}>
            <h3>{t('p10.nb.t102')}</h3>
            <div className="table-scroll">
              <table className="data p6-t">
                <thead><tr><th>{t('p10.nb.col.field')}</th><th>{t('p10.nb.col.value')}</th><th>{t('p10.nb.col.unit')}</th></tr></thead>
                <tbody>
                  {T102_ROWS.map((row) => {
                    const e = nb.t102[row];
                    const opts = row === 'glassEmpty' || row === 'glassSample' ? masses : [];
                    return (
                      <tr key={row}>
                        <th scope="row">{t(`p10.nb.row.${row}`)}</th>
                        <td>
                          <div className="cell">
                            <input aria-label={t(`p10.nb.row.${row}`)} type="text" inputMode="decimal" value={e.value} onChange={(ev) => setT102(row, { value: ev.target.value, readingId: null })} />
                            <input aria-label={`± ${t(`p10.nb.row.${row}`)}`} className="u" type="text" inputMode="decimal" value={e.uncertainty} placeholder="±" onChange={(ev) => setT102(row, { uncertainty: ev.target.value })} />
                            {opts.length > 0 && (
                              <select aria-label={t('p10.nb.import')} value={e.readingId ?? ''} onChange={(ev) => { const m = opts.find((x) => x.id === ev.target.value); if (m) setT102(row, { value: fmt(m.displayedG, dec), uncertainty: fmt(w.params.balance.uncertaintyG, dec), readingId: m.id }); }}>
                                <option value="">📥</option>
                                {opts.map((m) => <option key={m.id} value={m.id}>{m.id} · {fmt(m.displayedG, dec)} g</option>)}
                              </select>
                            )}
                          </div>
                        </td>
                        <td>g</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <h3>{t('p10.nb.prep')}</h3>
            <div className="table-scroll">
              <table className="data">
                <tbody>
                  {PREP_ROWS.map((r) => (
                    <tr key={r}>
                      <th scope="row"><label htmlFor={`p10prep-${r}`}>{t(`p10.nb.prepRow.${r}`)}</label></th>
                      <td><input id={`p10prep-${r}`} type="text" inputMode="decimal" value={nb.prep[r]} onChange={(e) => { const v = e.target.value; setNb((n) => { n.prep[r] = v; }, `prep.${r}`, nb.prep[r], v); }} /></td>
                      <td>{t(`p10.nb.prepUnit.${r}`)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="row">
              <div className="field">
                <label htmlFor="p10basis">{t('p10.nb.basis')}</label>
                <select id="p10basis" value={nb.vinegarBasis} onChange={(e) => { const v = e.target.value as P10Notebook['vinegarBasis']; setNb((n) => { n.vinegarBasis = v; }, 'vinegarBasis', nb.vinegarBasis, v); }}>
                  <option value="">{t('nb.choose')}</option>
                  {(['m/m', 'm/v', 'v/v'] as const).map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="p10lim">{t('p10.nb.limiting')}</label>
                <select id="p10lim" value={nb.limiting} onChange={(e) => { const v = e.target.value as P10Notebook['limiting']; setNb((n) => { n.limiting = v; }, 'limiting', nb.limiting, v); }}>
                  <option value="">{t('nb.choose')}</option>
                  <option value="NaHCO3">NaHCO₃</option>
                  <option value="CH3COOH">CH₃COOH</option>
                </select>
              </div>
            </div>
            <p className="hint">{t('p10.nb.vinegarLabel', { p: fmt(w.params.vinegar.percent, 1), b: w.params.vinegar.basis, d: fmt(w.params.vinegar.densityGmL, 3) })}</p>
            <h4>{t('p10.nb.equation')}</h4>
            <div className="eq-row" role="group" aria-label={t('p10.nb.equation')}>
              {(['acid', 'bicarb'] as const).map((k, i) => (
                <span key={k}>{i > 0 && ' + '}<input aria-label={t(`p10.nb.eq.${k}`)} className="coef" type="text" inputMode="numeric" value={eq[k]} onChange={(e) => { const v = e.target.value; setNb((n) => { n.equation[k] = v; }, `equation.${k}`, eq[k], v); }} /> {t(`p10.nb.eq.${k}`)}</span>
              ))}
              <span> → </span>
              {(['acetate', 'co2', 'water'] as const).map((k, i) => (
                <span key={k}>{i > 0 && ' + '}<input aria-label={t(`p10.nb.eq.${k}`)} className="coef" type="text" inputMode="numeric" value={eq[k]} onChange={(e) => { const v = e.target.value; setNb((n) => { n.equation[k] = v; }, `equation.${k}`, eq[k], v); }} /> {t(`p10.nb.eq.${k}`)}</span>
              ))}
            </div>
            {eqFilled && practice && <p className={Object.keys(imb).length ? 'pending' : 'ok'} role="status">{Object.keys(imb).length ? t('p10.nb.eqUnbalanced', { el: Object.keys(imb).join(', ') }) : '✓ ' + t('p10.nb.eqBalanced')}</p>}
            {checkBtn('mass', () => {
              const e1 = expectedRep(w, 'r1');
              return wrongCount([[nb.t102.bicarbMass.value, e1.massG, 0, 0.00015], [nb.prep.nAliquot, e1.nAliquot, 0.01, 0], [nb.prep.nAcid, e1.nAcid, 0.05, 0]]);
            })}
          </section>
        )}

        {tab === 'r' && (
          <section aria-label={t('p10.nb.t103')} style={{ display: 'grid', gap: '0.6rem' }}>
            <h3>{t('p10.nb.t103')}</h3>
            <p className="hint">{t('p10.nb.t103Help')}</p>
            <div className="table-scroll">
              <table className="data p6-t">
                <thead><tr><th>{t('p10.nb.col.field')}</th><th>{t('p10.nb.col.r1')}</th><th>{t('p10.nb.col.r2')}</th><th>{t('p10.nb.col.unit')}</th></tr></thead>
                <tbody>
                  {T103_ROWS.map((row) => (
                    <tr key={row}>
                      <th scope="row">{t(`p10.nb.row.${row}`)}</th>
                      {REPS.map((rep) => {
                        const e = nb.t103[row][rep];
                        const opts = T103_IMPORT.includes(row) ? importT103(row, rep) : [];
                        return (
                          <td key={rep}>
                            <div className="cell">
                              <input aria-label={`${t(`p10.nb.row.${row}`)} — ${t(`p10.nb.col.${rep}`)}`} type="text" inputMode="decimal" value={e.value} onChange={(ev) => setT103(row, rep, { value: ev.target.value, readingId: null })} />
                              {(row === 'r' || T103_IMPORT.includes(row)) && <input aria-label={`± ${t(`p10.nb.row.${row}`)}`} className="u" type="text" inputMode="decimal" value={e.uncertainty} placeholder="±" onChange={(ev) => setT103(row, rep, { uncertainty: ev.target.value })} />}
                              {opts.length > 0 && (
                                <select aria-label={t('p10.nb.import')} value={e.readingId ?? ''} onChange={(ev) => { const o = opts.find((x) => x.id === ev.target.value); if (o) setT103(row, rep, { value: o.value, uncertainty: o.u, readingId: o.id }); }}>
                                  <option value="">📥</option>
                                  {opts.map((o) => <option key={o.id} value={o.id}>{o.text}</option>)}
                                </select>
                              )}
                            </div>
                          </td>
                        );
                      })}
                      <td>{row === 'r' || row === 'uR' ? (
                        <select aria-label={t('p10.nb.rUnit')} value={nb.rUnit} onChange={(e) => { const v = e.target.value as P10Notebook['rUnit']; setNb((n) => { n.rUnit = v; }, 'rUnit', nb.rUnit, v); }}>
                          <option value="">{t('nb.choose')}</option>
                          {(['L·atm/(mol·K)', 'J/(mol·K)', 'kPa·L/(mol·K)'] as const).map((u) => <option key={u} value={u}>{u}</option>)}
                        </select>
                      ) : T103_UNIT[row]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="hint">{t('p10.nb.vaporTable')}</p>
            {checkBtn('r', () => {
              let n = 0;
              for (const rep of REPS) {
                const e = expectedRep(w, rep);
                const r = nb.t103;
                n += wrongCount([[r.tK[rep].value, e.tK, 0, 0.06], [r.vL[rep].value, e.vL, 0.01, 0], [r.pv[rep].value, e.pv, 0.03, 0], [r.dP[rep].value, e.dP, 0.06, 0.0002], [r.pCo2[rep].value, e.pCo2, 0, 0.0012], [r.r[rep].value, e.r, 0.01, 0]]);
              }
              return n;
            })}
            {REPS.map((rep) => {
              const run = runOf(w, rep);
              if (!run) return null;
              const rr = readingsForRun(w, run);
              return <p key={rep} className="hint">{t('p10.nb.runInfo', { n: run.index, seal: fmt(w.evidence[`sealDelay:${run.index}`] ?? NaN, 1), done: rr.final ? '✓' : '—' })}</p>;
            })}
          </section>
        )}

        {tab === 'boyle' && (
          <section aria-label={t('p10.nb.boyle')} style={{ display: 'grid', gap: '0.6rem' }}>
            <h3>{t('p10.nb.boyle')}</h3>
            <p className="hint">{t('p10.nb.boyleHelp')}</p>
            <div className="row">
              <button className="btn small" disabled={!w.points.length} onClick={importPoints}>📥 {t('p10.nb.importPoints', { n: w.points.length })}</button>
              <button className="btn small ghost" onClick={() => setNb((n) => { n.boyle.push({ pointIndex: null, markMl: '', deadMl: '', totalMl: '', pKPa: '', tK: '' }); }, 'boyle.add', String(nb.boyle.length), String(nb.boyle.length + 1))}>＋ {t('p10.nb.addRow')}</button>
            </div>
            <div className="table-scroll">
              <table className="data p6-t">
                <thead><tr><th>{t('p10.nb.boyleMark')}</th><th>{t('p10.nb.boyleDead')}</th><th>{t('p10.nb.boyleTotal')}</th><th>P (kPa)</th><th>T (K)</th><th>PV</th><th /></tr></thead>
                <tbody>
                  {nb.boyle.map((r, i) => (
                    <tr key={i}>
                      {(['markMl', 'deadMl', 'totalMl', 'pKPa', 'tK'] as const).map((k) => (
                        <td key={k}><input aria-label={`${t(`p10.nb.boyleCol.${k}`)} ${i + 1}`} type="text" inputMode="decimal" value={r[k]} style={{ width: '4.6rem' }} onChange={(e) => setBoyle(i, k, e.target.value)} /></td>
                      ))}
                      <td>{fmt(parseNum(r.totalMl) * parseNum(r.pKPa), 1)}</td>
                      <td><button className="btn small ghost" aria-label={t('p10.nb.removeRow')} onClick={() => setNb((n) => { n.boyle.splice(i, 1); }, 'boyle.remove', String(nb.boyle.length), String(nb.boyle.length - 1))}>×</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="field">
              <label htmlFor="p10pk">{t('p10.nb.pressureKind')}</label>
              <select id="p10pk" value={nb.pressureKind} onChange={(e) => { const v = e.target.value as P10Notebook['pressureKind']; setNb((n) => { n.pressureKind = v; }, 'pressureKind', nb.pressureKind, v); }}>
                <option value="">{t('nb.choose')}</option>
                <option value="ABSOLUTE">{t('p10.nb.absolute')}</option>
                <option value="GAUGE">{t('p10.nb.gauge')}</option>
              </select>
            </div>
            <p className="hint">{t('p10.nb.sensorNote', { note: SENSOR_PROFILES[w.sensor.model].note })}{gauge ? ` ${t('p10.nb.gaugeNote')}` : ''}</p>
          </section>
        )}

        {tab === 'fit' && (
          <section aria-label={t('p10.nb.tab.fit')} style={{ display: 'grid', gap: '0.6rem' }}>
            <h4>{t('p10.nb.pvChart')}</h4>
            <Scatter pts={studentPts.map((q) => ({ x: q.vMl, y: q.pKPa }))} label={t('p10.nb.pvChart')} xLabel="V (mL)" yLabel="P (kPa)"
              curves={[...(m1 ? [{ f: (x: number) => m1.A / x, cls: 'line' }] : []), ...(p1 ? [{ f: (x: number) => p1.A * x, cls: 'mark' }] : [])]} />
            <h4>{t('p10.nb.invChart')}</h4>
            <Scatter pts={studentPts.map((q) => ({ x: 1 / q.vMl, y: q.pKPa }))} label={t('p10.nb.invChart')} xLabel="1/V (mL⁻¹)" yLabel="P (kPa)" zero
              curves={inv ? [{ f: (x: number) => inv.a * x + inv.b, cls: 'line' }] : []} />
            <h4>{t('p10.nb.resChart')}</h4>
            <Scatter pts={m1 ? studentPts.map((q, i) => ({ x: q.vMl, y: m1.residuals[i] })) : []} label={t('p10.nb.resChart')} xLabel="V (mL)" yLabel="P − P̂ (kPa)" />
            <div className="table-scroll">
              <table className="data">
                <thead><tr><th>{t('p10.nb.fitModel')}</th><th>A</th><th>n</th><th>R²</th><th>RMSE (kPa)</th></tr></thead>
                <tbody>
                  <tr><th scope="row">{t('p10.nb.fitFree')}</th><td>{fmt(free?.A ?? NaN, 1)}</td><td>{fmt(free?.n ?? NaN, 4)}</td><td>{fmt(free?.r2 ?? NaN, 5)}</td><td>{fmt(free?.rmse ?? NaN, 3)}</td></tr>
                  <tr><th scope="row">n = −1</th><td>{fmt(m1?.A ?? NaN, 1)}</td><td>−1</td><td>{fmt(m1?.r2 ?? NaN, 5)}</td><td>{fmt(m1?.rmse ?? NaN, 3)}</td></tr>
                  <tr><th scope="row">n = +1</th><td>{fmt(p1?.A ?? NaN, 4)}</td><td>+1</td><td>{fmt(p1?.r2 ?? NaN, 5)}</td><td>{fmt(p1?.rmse ?? NaN, 3)}</td></tr>
                  <tr><th scope="row">P = a/V + b</th><td>a {fmt(inv?.a ?? NaN, 1)}</td><td>b {fmt(inv?.b ?? NaN, 2)}</td><td>{fmt(inv?.r2 ?? NaN, 5)}</td><td>{fmt(inv?.rmse ?? NaN, 3)}</td></tr>
                </tbody>
              </table>
            </div>
            <p className="hint">{t('p10.nb.pv', { m: fmt(pv.mean, 1), s: fmt(pv.sd, 1), cv: fmt(pv.cvPct, 2) })} · {t(`p10.nb.pattern.${pattern}`)}</p>
            {field('fit.nFree', nb.fit.nFree, (n, v) => { n.fit.nFree = v; })}
            <div className="field">
              <label htmlFor="p10better">{t('p10.nb.better')}</label>
              <select id="p10better" value={nb.fit.better} onChange={(e) => { const v = e.target.value as P10Notebook['fit']['better']; setNb((n) => { n.fit.better = v; }, 'fit.better', nb.fit.better, v); }}>
                <option value="">{t('nb.choose')}</option>
                <option value="MINUS_ONE">n = −1</option>
                <option value="PLUS_ONE">n = +1</option>
              </select>
            </div>
            {field('fit.conclusion', nb.fit.conclusion, (n, v) => { n.fit.conclusion = v; }, true)}
          </section>
        )}

        {tab === 'activities' && (
          <section aria-label={t('p10.nb.tab.activities')} style={{ display: 'grid', gap: '0.6rem' }}>
            <p>{t('p10.nb.actCharles')}</p>
            {field('activities.charles', nb.activities.charles, (n, v) => { n.activities.charles = v; })}
            <p>{t('p10.nb.actBoyle')}</p>
            {field('activities.boyle', nb.activities.boyle, (n, v) => { n.activities.boyle = v; })}
            <p>{t('p10.nb.actIdeal')}</p>
            {field('activities.idealN', nb.activities.idealN, (n, v) => { n.activities.idealN = v; })}
          </section>
        )}

        {tab === 'analysis' && (
          <section aria-label={t('p10.nb.tab.analysis')} style={{ display: 'grid', gap: '0.6rem' }}>
            {(['q1', 'q2', 'q3', 'q4'] as const).map((k) => field(`analysis.${k}`, nb.analysis[k], (n, v) => { n.analysis[k] = v; }, true))}
          </section>
        )}

        {tab === 'log' && (
          <section aria-label={t('p10.nb.tab.log')}>
            <h3>{t('p10.nb.readings')}</h3>
            <ul className="fb-list">
              {w.massReadings.filter((m) => !m.tare).map((m) => <li key={m.id}><span className={m.valid ? 'ok' : 'bad'}>{m.valid ? '✓' : '✗'}</span> {m.id} · {fmt(m.displayedG, dec)} g · {m.objectId ?? t('p10.nb.empty')}{!m.valid && m.invalidReason ? <span className="hint"> · {t(`p10.invalid.${m.invalidReason}`)}</span> : null}</li>)}
              {w.volumeReadings.map((v) => <li key={v.id}><span className={v.atEyeLevel && !v.invalid ? 'ok' : 'bad'}>{v.atEyeLevel && !v.invalid ? '✓' : '✗'}</span> {v.id} · {t(`p10.obj.${v.instrument}`)} · {fmt(v.valueMl, 2)} mL{!v.atEyeLevel ? <span className="hint"> · {t('p10.nb.parallax')}</span> : null}{v.invalid ? <span className="hint"> · {t(`p10.invalid.${v.invalid}`)}</span> : null}</li>)}
              {w.tempReadings.map((r) => <li key={r.id}>🌡 {r.id} · {fmt(r.valueC, 1)} °C · {t(`p10.where.${r.where}`)}{r.changing ? <span className="hint"> · {t('p10.nb.changing')}</span> : null}</li>)}
              {w.baroReadings.map((r) => <li key={r.id}>⏲ {r.id} · {fmt(r.mmHg, 1)} mmHg{r.source === 'LOCAL' ? '' : ` · ${t('p10.nb.weather')}`}</li>)}
              {w.heightReadings.map((h) => <li key={h.id}>📏 {h.id} · {fmt(h.valueMm, 0)} mm{h.rulerAligned ? '' : <span className="hint"> · {t('p10.nb.perspective')}</span>}</li>)}
              {w.points.map((p) => <li key={`pt${p.index}`}>📈 #{p.index} · {fmt(p.markMl, 1)} mL → {fmt(p.enteredTotalMl, 1)} mL · {fmt(p.displayedKPa, 2)} kPa</li>)}
            </ul>
            <h3>{t('p4.nb.history', { n: nb.history.length })}</h3>
            <ul className="fb-list" style={{ maxHeight: '14rem', overflow: 'auto' }}>
              {[...nb.history].reverse().slice(0, 80).map((h, i) => <li key={i}><span className="hint">{fmt(h.t, 0)} s</span> {h.field}: «{h.from.slice(0, 40)}» → «{h.to.slice(0, 40)}»</li>)}
            </ul>
            <div className="row">
              <button className="btn small" onClick={exportCsv}>{t('p10.nb.exportCsv')}</button>
              <button className="btn small" onClick={() => downloadJson(`libreta-p10-${attemptId}.json`, { attemptId, model: w.params.model, notebook: nb, massReadings: w.massReadings, volumeReadings: w.volumeReadings, tempReadings: w.tempReadings, baroReadings: w.baroReadings, heightReadings: w.heightReadings, points: w.points, series: w.series.sensor, units: T103_UNIT })}>{t('review.export')}</button>
              <button className="btn small ghost" onClick={() => window.print()}>{t('p10.nb.print')}</button>
            </div>
          </section>
        )}
      </div>
    </aside>
  );
}
