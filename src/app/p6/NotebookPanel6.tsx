import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useP6 } from './store';
import {
  COLS, IMPORT_ROWS, T61_ROWS, T62_ROWS, T63_ROWS, UNIT, parseNum, type Col, type Entry, type P6Notebook, type T61Row, type T62Row,
} from '../../practices/practice-06/notebook';
import { expectedCol } from '../../practices/practice-06/expected-results';
import { FOODS, METALS, UNKNOWN_BANK, type FoodId } from '../../simulation/calorimetry/materials';
import type { EnergyPerMassUnit, TempSample } from '../../simulation/calorimetry/heat';
import { downloadJson } from '../persistence';

type Tab = 'water' | 'metal' | 'food' | 'graphs' | 'activities' | 'analysis' | 'log';

const fmt = (v: number, d = 2) => v.toFixed(d).replace('.', ',');

/** Gráfica temperatura–tiempo (§23.5) con marcas opcionales. Accesible: tabla resumida debajo. */
export function TempChart({ series, label, marks = [], w = 330, h = 170, decimals = 1 }: { series: TempSample[]; label: string; marks?: Array<{ t: number; text: string }>; w?: number; h?: number; decimals?: number }) {
  const { t } = useTranslation();
  if (series.length < 2) return <p className="hint">{t('p6.nb.chartEmpty')}</p>;
  const P = 34;
  const ts = series.map((s) => s.t);
  const cs = series.map((s) => s.c);
  const t0 = Math.min(...ts);
  const t1 = Math.max(...ts);
  const lo = Math.min(...cs);
  const hi = Math.max(...cs);
  const pad = Math.max(0.1, (hi - lo) * 0.08);
  const X = (x: number) => P + ((w - P - 8) * (x - t0)) / Math.max(1, t1 - t0);
  const Y = (y: number) => h - P + 6 - ((h - P - 4) * (y - lo + pad)) / Math.max(0.01, hi - lo + 2 * pad);
  const step = Math.max(1, Math.floor(series.length / 300));
  const pts = series.filter((_, i) => i % step === 0 || i === series.length - 1);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="p6-chart" role="img" aria-label={label}>
      <line x1={P} y1={h - P + 6} x2={w - 4} y2={h - P + 6} className="axis" />
      <line x1={P} y1={4} x2={P} y2={h - P + 6} className="axis" />
      {[lo, (lo + hi) / 2, hi].map((y) => <text key={y} x={P - 3} y={Y(y) + 3} className="tick" textAnchor="end">{fmt(y, decimals)}</text>)}
      {[t0, (t0 + t1) / 2, t1].map((x) => <text key={x} x={X(x)} y={h - 14} className="tick" textAnchor="middle">{Math.round((x - t0) / 60)}′</text>)}
      <text x={w / 2} y={h - 2} className="lab" textAnchor="middle">{t('p6.nb.chartX')}</text>
      <polyline points={pts.map((s) => `${X(s.t)},${Y(s.c)}`).join(' ')} className="line" />
      {marks.map((m, i) => (
        <g key={i}>
          <line x1={X(m.t)} x2={X(m.t)} y1={4} y2={h - P + 6} className="mark" />
          <text x={X(m.t) + 2} y={12 + i * 10} className="tick">{m.text}</text>
        </g>
      ))}
    </svg>
  );
}

/** Intervalos c ± u de los candidatos frente al valor experimental (§23.5-5). */
function CandidatesChart({ c, u }: { c: number | null; u: number | null }) {
  const { t } = useTranslation();
  const ids = ['Fe', ...UNKNOWN_BANK] as const;
  const W = 330;
  const rowH = 16;
  const H = ids.length * rowH + 30;
  const lo = 0.1;
  const hi = 0.95;
  const X = (v: number) => 70 + ((W - 80) * (v - lo)) / (hi - lo);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="p6-chart" role="img" aria-label={t('p6.nb.candLabel')}>
      {ids.map((id, i) => {
        const m = METALS[id];
        const y = 14 + i * rowH;
        return (
          <g key={id}>
            <text x={4} y={y + 4} className="tick">{t(`p6.metal.${id}`)}</text>
            <line x1={X(m.cpRange[0] - m.uCp)} x2={X(m.cpRange[1] + m.uCp)} y1={y} y2={y} className="cand" />
            <circle cx={X(m.cp)} cy={y} r={2.5} className="candPt" />
          </g>
        );
      })}
      {c !== null && Number.isFinite(c) && (
        <g>
          <rect x={X(c - (u ?? 0))} y={4} width={Math.max(1, X(c + (u ?? 0)) - X(c - (u ?? 0)))} height={H - 26} className="band" />
          <line x1={X(c)} x2={X(c)} y1={4} y2={H - 22} className="mark" />
        </g>
      )}
      {[0.2, 0.4, 0.6, 0.8].map((v) => <text key={v} x={X(v)} y={H - 6} className="tick" textAnchor="middle">{fmt(v, 1)}</text>)}
    </svg>
  );
}

/**
 * Libreta digital de la Práctica 6 (§23): Cuadros 6.1–6.3, identificación, gráficas, actividades, análisis e historial.
 * Las lecturas se importan solo de instrumentos observados; los campos derivados los escribe el estudiante. En práctica
 * y guiado, «revisar» dice cuántos datos no coinciden con SUS mediciones (sin dar la respuesta).
 */
export function NotebookPanel6() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('water');
  const nb = useP6((s) => s.notebook);
  const setNb = useP6((s) => s.setNotebook);
  const toggle = useP6((s) => s.toggleNotebook);
  const savedAt = useP6((s) => s.savedAt);
  useP6((s) => s.version);
  const rt = useP6((s) => s.runtime);
  const mode = useP6((s) => s.settings.mode);
  const attemptId = useP6((s) => s.attemptId);
  const wanted = useP6((s) => s.notebookTab);
  const [checked, setChecked] = useState<Record<string, number>>({});
  useEffect(() => {
    if (wanted) setTab(wanted as Tab);
  }, [wanted]);
  if (!rt) return null;
  const w = rt.world;
  const practice = mode === 'PRACTICE' || mode === 'GUIDED';
  const masses = w.massReadings.filter((m) => m.valid && !m.zeroCheck);
  const temps = w.tempReadings;

  const setEntry = (tbl: 't61' | 't62', row: string, col: Col, patch: Partial<Entry>) => {
    const cur = (nb[tbl] as Record<string, Record<Col, Entry>>)[row][col];
    const from = cur.value;
    setNb((n) => {
      const e = (n[tbl] as Record<string, Record<Col, Entry>>)[row][col];
      Object.assign(e, patch);
    }, `${tbl}.${row}.${col}`, from, patch.value ?? from);
  };
  const importOptions = (row: T61Row | T62Row) => {
    if (row === 'tiWater' || row === 'tf' || row === 'tiMetal' || row === 'tfMetal') {
      const where = row === 'tiMetal' ? 'bath' : 'cup';
      return temps.filter((x) => x.where === where && (row === 'tf' || row === 'tfMetal' ? x.peak : !x.peak)).map((x) => ({ id: x.id, text: `${x.id} · ${fmt(x.valueC, 1)} °C${x.peak ? ' ⬆' : ''}`, value: fmt(x.valueC, 1), u: '0,1' }));
    }
    const obj = row.startsWith('cyl') ? 'cylinder' : null;
    return masses.filter((m) => (obj ? m.objectId === obj : m.objectId === 'tube_fe' || m.objectId === 'tube_x')).map((m) => ({ id: m.id, text: `${m.id} · ${fmt(m.displayedMassG, 2)} g · ${m.objectId}`, value: fmt(m.displayedMassG, w.params.balance.resolutionG < 0.1 ? 2 : 1), u: fmt(m.uncertaintyG, 2) }));
  };
  const table = (tbl: 't61' | 't62', rows: readonly (T61Row | T62Row)[]) => (
    <div className="table-scroll">
      <table className="data p6-t">
        <thead><tr><th>{t('p6.nb.col.field')}</th><th>{t('p6.nb.col.fe')}</th><th>{t('p6.nb.col.x', { code: w.params.unknownCode })}</th><th>{t('p6.nb.col.unit')}</th></tr></thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row}>
              <th scope="row">{t(`p6.nb.row.${row}`)}</th>
              {COLS.map((col) => {
                const e = (nb[tbl] as Record<string, Record<Col, Entry>>)[row][col];
                const opts = IMPORT_ROWS.includes(row) ? importOptions(row) : [];
                return (
                  <td key={col}>
                    <div className="cell">
                      <input aria-label={`${t(`p6.nb.row.${row}`)} — ${t(`p6.nb.col.${col}`, { code: w.params.unknownCode })}`} type="text" inputMode="decimal" value={e.value} onChange={(ev) => setEntry(tbl, row, col, { value: ev.target.value, readingId: null })} />
                      <input aria-label={`± ${t(`p6.nb.row.${row}`)}`} className="u" type="text" inputMode="decimal" value={e.uncertainty} placeholder="±" onChange={(ev) => setEntry(tbl, row, col, { uncertainty: ev.target.value })} />
                      {opts.length > 0 && (
                        <select aria-label={t('p6.nb.import')} value={e.readingId ?? ''} onChange={(ev) => { const o = opts.find((x) => x.id === ev.target.value); if (o) setEntry(tbl, row, col, { value: o.value, uncertainty: o.u, readingId: o.id }); }}>
                          <option value="">📥</option>
                          {opts.map((o) => <option key={o.id} value={o.id}>{o.text}</option>)}
                        </select>
                      )}
                    </div>
                  </td>
                );
              })}
              <td>{UNIT[row]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  const checkCol = (key: string, rows: Array<[T61Row | T62Row, 't61' | 't62', 'waterMass' | 'metalMass' | 'qWater' | 'cIdeal' | 'cCorr' | 'errorPct']>) => {
    let wrong = 0;
    for (const col of COLS) {
      const e = expectedCol(w, col);
      for (const [row, tbl, k] of rows) {
        const v = e[k];
        const s = (nb[tbl] as Record<string, Record<Col, Entry>>)[row][col].value;
        if (v === null || !s.trim()) continue;
        const x = parseNum(s);
        if (!Number.isFinite(x) || Math.abs(x - v) > Math.max(Math.abs(v) * 0.03, k === 'qWater' ? 2 : 0.006)) wrong++;
      }
    }
    setChecked({ ...checked, [key]: wrong });
  };
  const checkBtn = (key: string, fn: () => void) =>
    practice && (
      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
        <button className="btn small" onClick={fn}>{t('p5.nb.check')}</button>
        {checked[key] !== undefined && <span className={checked[key] ? 'pending' : 'ok'} role="status">{checked[key] ? t('p6.nb.checkWrong', { n: checked[key] }) : '✓'}</span>}
      </div>
    );
  const text = (path: string, value: string, set: (n: P6Notebook, v: string) => void, area = false) => {
    const idf = `p6-${path}`;
    const on = (v: string) => setNb((n) => set(n, v), path, value, v);
    return (
      <div className="field">
        <label htmlFor={idf}>{t(`p6.nb.f.${path}`)}</label>
        {area ? <textarea id={idf} value={value} onChange={(e) => on(e.target.value)} /> : <input id={idf} type="text" value={value} onChange={(e) => on(e.target.value)} />}
      </div>
    );
  };
  const eFe = expectedCol(w, 'fe');
  const eX = expectedCol(w, 'x');
  const cX = parseNum(nb.t62.cExp.x.value);
  const uX = parseNum(nb.t62.cExp.x.uncertainty);

  return (
    <aside className="drawer" aria-label={t('nb.title')}>
      <div className="drawer-head">
        <h2>📓 {t('nb.title')}</h2>
        <span style={{ flex: 1 }} />
        <button className="btn small ghost" onClick={toggle} aria-label={t('common.close')}>×</button>
      </div>
      <div className="drawer-body">
        <div className="tabs" role="tablist">
          {(['water', 'metal', 'food', 'graphs', 'activities', 'analysis', 'log'] as Tab[]).filter((k) => k !== 'food' || w.params.bombEnabled).map((k) => (
            <button key={k} role="tab" className="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{t(`p6.nb.tab.${k}`)}</button>
          ))}
        </div>
        {savedAt && <span className="hint">{t('nb.saved', { time: new Date(savedAt).toLocaleTimeString() })}</span>}
        {w.params.model === 'IDEAL' && <p className="hint">⚠ {t('p6.idealBadge')}</p>}

        {tab === 'water' && (
          <section aria-label={t('p6.nb.t61')}>
            <h3>{t('p6.nb.t61')}</h3>
            <p className="hint">{t('p6.nb.t61Help')}</p>
            {table('t61', T61_ROWS)}
            <div className="row">
              {COLS.map((col) => (
                <div className="field" key={col}>
                  <label htmlFor={`p6vol-${col}`}>{t('p6.nb.volume', { col: t(`p6.nb.col.${col}`, { code: w.params.unknownCode }) })}</label>
                  <div style={{ display: 'flex', gap: '0.3rem' }}>
                    <input id={`p6vol-${col}`} type="text" value={nb.volume[col]} onChange={(e) => { const v = e.target.value; setNb((n) => { n.volume[col] = v; }, `volume.${col}`, nb.volume[col], v); }} />
                    {w.volumeReadings.length > 0 && (
                      <select aria-label={t('p6.nb.import')} value="" onChange={(e) => { const r = w.volumeReadings.find((x) => x.id === e.target.value); if (r) setNb((n) => { n.volume[col] = fmt(r.valueMl, 1); }, `volume.${col}`, nb.volume[col], fmt(r.valueMl, 1)); }}>
                        <option value="">📥</option>
                        {w.volumeReadings.map((r) => <option key={r.id} value={r.id}>{r.id} · {fmt(r.valueMl, 1)} mL{r.atEyeLevel ? '' : ' ⚠'}</option>)}
                      </select>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <p className="hint">{t('p6.nb.waterHelp')}</p>
            {checkBtn('water', () => checkCol('water', [['waterMass', 't61', 'waterMass'], ['qWater', 't61', 'qWater']]))}
          </section>
        )}

        {tab === 'metal' && (
          <section aria-label={t('p6.nb.t62')}>
            <h3>{t('p6.nb.t62')}</h3>
            <p className="hint">{t('p6.nb.t62Help', { c: w.params.model === 'REALISTIC' ? fmt(w.params.cupHeatCapJPerC, 0) : '0' })}</p>
            {table('t62', T62_ROWS)}
            {checkBtn('metal', () => checkCol('metal', [['metalMass', 't62', 'metalMass'], ['cExp', 't62', 'cIdeal'], ['cCorr', 't62', 'cCorr'], ['errorPct', 't62', 'errorPct']]))}
            <h4>{t('p6.nb.identification')}</h4>
            <CandidatesChart c={Number.isFinite(cX) ? cX : null} u={Number.isFinite(uX) ? uX : null} />
            <div className="field">
              <label htmlFor="p6id">{t('p6.nb.idMetal')}</label>
              <select id="p6id" value={nb.identification.metal} onChange={(e) => { const v = e.target.value as P6Notebook['identification']['metal']; setNb((n) => { n.identification.metal = v; }, 'identification.metal', nb.identification.metal, v); }}>
                <option value="">{t('nb.choose')}</option>
                {UNKNOWN_BANK.map((m) => <option key={m} value={m}>{t(`p6.metal.${m}`)}</option>)}
                <option value="AMBIGUOUS">{t('p6.nb.ambiguous')}</option>
              </select>
            </div>
            {text('idReason', nb.identification.reason, (n, v) => { n.identification.reason = v; }, true)}
            <p className="hint">{t('p6.nb.secondary', { d: fmt(METALS[w.params.unknownMetal].density, 1) })}</p>
          </section>
        )}

        {tab === 'food' && (
          <section aria-label={t('p6.nb.t63')}>
            <h3>{t('p6.nb.t63')}</h3>
            <label className="check"><input type="checkbox" checked={nb.bombSkipped} onChange={(e) => { const v = e.target.checked; setNb((n) => { n.bombSkipped = v; }, 'bombSkipped', String(nb.bombSkipped), String(v)); }} /> {t('p6.nb.bombSkip')}</label>
            <div className="field">
              <label htmlFor="p6food">{t('p6.nb.foodName')}</label>
              <select id="p6food" value={nb.food} onChange={(e) => { const v = e.target.value as FoodId | ''; setNb((n) => { n.food = v; }, 'food', nb.food, v); }}>
                <option value="">—</option>
                {Object.keys(FOODS).map((f) => <option key={f} value={f}>{t(`p6.food.${f}`)}</option>)}
              </select>
            </div>
            <div className="table-scroll">
              <table className="data">
                <tbody>
                  {T63_ROWS.map((r) => (
                    <tr key={r}>
                      <th scope="row"><label htmlFor={`p6t63-${r}`}>{t(`p6.nb.food.${r}`)}</label></th>
                      <td><input id={`p6t63-${r}`} type="text" inputMode="decimal" value={nb.t63[r]} onChange={(e) => { const v = e.target.value; setNb((n) => { n.t63[r] = v; }, `t63.${r}`, nb.t63[r], v); }} /></td>
                      <td>
                        {r === 'hc' ? (
                          <select aria-label={t('p6.nb.unit')} value={nb.hcUnit} onChange={(e) => { const v = e.target.value as EnergyPerMassUnit; setNb((n) => { n.hcUnit = v; }, 'hcUnit', nb.hcUnit, v); }}>
                            {(['J/g', 'kJ/g', 'cal/g', 'kcal/g'] as const).map((u) => <option key={u} value={u}>{u}</option>)}
                          </select>
                        ) : t(`p6.nb.foodUnit.${r}`)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="hint">{t('p6.nb.calNote')}</p>
            <div className="field">
              <label htmlFor="p6conv">{t('p6.nb.convention')}</label>
              <select id="p6conv" value={nb.convention} onChange={(e) => { const v = e.target.value as P6Notebook['convention']; setNb((n) => { n.convention = v; }, 'convention', nb.convention, v); }}>
                <option value="">{t('nb.choose')}</option>
                <option value="GROSS_POSITIVE">{t('p6.nb.convGross')}</option>
                <option value="ENTHALPY_NEGATIVE">{t('p6.nb.convEnthalpy')}</option>
              </select>
            </div>
            {text('convReason', nb.conventionReason, (n, v) => { n.conventionReason = v; }, true)}
            {w.bomb.series.length > 1 && <TempChart series={w.bomb.series} decimals={3} label={t('p6.nb.bombChart')} marks={w.bomb.ignitedAt !== null ? [{ t: w.bomb.ignitedAt, text: t('p6.nb.ignition') }] : []} />}
            {w.bomb.series.length > 1 && (
              <details>
                <summary className="hint">{t('p6.nb.bombTable')}</summary>
                <div className="table-scroll" style={{ maxHeight: '12rem' }}>
                  <table className="data"><tbody>{w.bomb.series.filter((_, i) => i % 15 === 0).map((s) => <tr key={s.t}><td>{s.t} s</td><td>{s.c.toFixed(3).replace('.', ',')} °C</td></tr>)}</tbody></table>
                </div>
              </details>
            )}
            <p className="hint">{t('p6.nb.dTHelp')}</p>
          </section>
        )}

        {tab === 'graphs' && (
          <section aria-label={t('p6.nb.tab.graphs')} style={{ display: 'grid', gap: '0.6rem' }}>
            <h4>{t('p6.nb.calChart')}</h4>
            <TempChart series={w.series.cal.slice(-900)} label={t('p6.nb.calChart')} marks={w.runs.map((r) => ({ t: r.startS, text: t(`p6.metal.${r.metal}`) }))} />
            <h4>{t('p6.nb.bathChart')}</h4>
            <TempChart series={w.series.bath} label={t('p6.nb.bathChart')} />
            {mode === 'DEBUG' && (
              <>
                <h4>{t('p6.nb.trueChart')}</h4>
                <TempChart series={w.series.waterTrue.slice(-900)} label={t('p6.nb.trueChart')} decimals={2} />
              </>
            )}
            <p className="hint">{t('p6.nb.graphsHelp')}</p>
          </section>
        )}

        {tab === 'activities' && (
          <section aria-label={t('p6.nb.tab.activities')} style={{ display: 'grid', gap: '0.6rem' }}>
            {text('a1', nb.activities.a1, (n, v) => { n.activities.a1 = v; }, true)}
            <p>{t('p6.nb.a2')}</p>
            {text('a2Ambient', nb.activities.a2Ambient, (n, v) => { n.activities.a2Ambient = v; })}
            {text('a2q', nb.activities.a2q, (n, v) => { n.activities.a2q = v; })}
            <p>{t('p6.nb.a3')}</p>
            {text('a3Ti', nb.activities.a3Ti, (n, v) => { n.activities.a3Ti = v; })}
            {text('a3Interp', nb.activities.a3Interp, (n, v) => { n.activities.a3Interp = v; }, true)}
          </section>
        )}

        {tab === 'analysis' && (
          <section aria-label={t('p6.nb.tab.analysis')} style={{ display: 'grid', gap: '0.6rem' }}>
            {(['q1', 'q2', 'q3', 'q4'] as const).map((k) => text(k, nb.analysis[k], (n, v) => { n.analysis[k] = v; }, true))}
          </section>
        )}

        {tab === 'log' && (
          <section aria-label={t('p6.nb.tab.log')}>
            <h3>{t('p6.nb.readings')}</h3>
            <ul className="fb-list">
              {w.massReadings.map((m) => <li key={m.id}><span className={m.valid ? 'ok' : 'bad'}>{m.valid ? '✓' : '✗'}</span> {m.id} · {fmt(m.displayedMassG, 2)} g · {m.objectId ?? t('p6.nb.empty')}{!m.valid && m.invalidReason ? <span className="hint"> · {t(`p6.invalid.${m.invalidReason}`)}</span> : null}</li>)}
              {w.volumeReadings.map((v) => <li key={v.id}><span className={v.atEyeLevel ? 'ok' : 'bad'}>{v.atEyeLevel ? '✓' : '✗'}</span> {v.id} · {fmt(v.valueMl, 1)} mL{v.atEyeLevel ? '' : <span className="hint"> · {t('p6.nb.parallax')}</span>}</li>)}
              {w.tempReadings.map((r) => <li key={r.id}>{r.peak ? '⬆' : '🌡'} {r.id} · {fmt(r.valueC, 1)} °C · {t(`p6.where.${r.where}`)}{r.judgement ? ` · ${t(`p6.judgement.${r.judgement}`)}` : ''}{r.changing && !r.peak ? <span className="hint"> · {t('p6.nb.changing')}</span> : null}</li>)}
            </ul>
            <h3>{t('p4.nb.history', { n: nb.history.length })}</h3>
            <ul className="fb-list" style={{ maxHeight: '14rem', overflow: 'auto' }}>
              {[...nb.history].reverse().slice(0, 80).map((h, i) => <li key={i}><span className="hint">{fmt(h.t, 0)} s</span> {h.field}: «{h.from.slice(0, 40)}» → «{h.to.slice(0, 40)}»</li>)}
            </ul>
            <button className="btn small" onClick={() => downloadJson(`libreta-p6-${attemptId}.json`, { attemptId, model: w.params.model, notebook: nb, massReadings: w.massReadings, volumeReadings: w.volumeReadings, tempReadings: w.tempReadings, series: { cal: w.series.cal, bath: w.series.bath }, units: UNIT })}>{t('review.export')}</button>
          </section>
        )}
        {mode === 'DEBUG' && <p className="hint">{t('p6.nb.debugExpected', { fe: eFe.cIdeal?.toFixed(3) ?? '—', x: eX.cIdeal?.toFixed(3) ?? '—' })}</p>}
      </div>
    </aside>
  );
}
