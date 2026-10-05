import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useP4 } from './store';
import { EquationEditor } from './EquationEditor';
import {
  COLORS, COMBUSTION, DURING, IMMEDIATE, LIMITING, METAL_CHANGE, RESIDUE, RX_TYPES, SUPERNATANT, SURFACE, TEXTURE, THERMAL_TYPES, WATER_RESULT,
  type MagnesiumRow, type NeutralRow, type P4Notebook, type PrecipRow, type RedoxRow,
} from '../../practices/practice-04/notebook';
import { EXPERIMENT_REFS, COMPLEX_EXAMPLE, type ExperimentId } from '../../practices/practice-04/reactions';
import { validateFor } from '../../practices/practice-04/equations';
import { wrongFields } from '../../practices/practice-04/rubric';
import { measuredSummary } from '../../practices/practice-04/expected-results';
import { appearanceWords } from './describe';
import { experimentVessels } from '../../practices/practice-04/evidence';
import { downloadJson } from '../persistence';
import { prettyFormula } from '../../simulation/chemistry/formula';
import type { ChemEquation, EqKind } from '../../simulation/chemistry/equation';

type Tab = 'A' | 'B' | 'C1' | 'Mg' | 'eq' | 'analysis' | 'complexes' | 'log';
type Row = 'A' | 'B1' | 'B2' | 'C1' | 'Mg';

/**
 * Libreta digital de la Práctica 4 (§21): registros propios con historial de correcciones, ecuaciones con el editor
 * (§15), análisis y la sección conceptual de complejos (§25). Puede insertar datos medidos (sonda, cronómetro), pero
 * nunca respuestas. En práctica y guiado se puede «revisar» una fila (no muestra la respuesta).
 */
export function NotebookPanel4() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('A');
  const [exp, setExp] = useState<ExperimentId>('A');
  const nb = useP4((s) => s.notebook);
  const setNb = useP4((s) => s.setNotebook);
  const toggle = useP4((s) => s.toggleNotebook);
  const savedAt = useP4((s) => s.savedAt);
  useP4((s) => s.version);
  const rt = useP4((s) => s.runtime);
  const mode = useP4((s) => s.settings.mode);
  const colorAid = useP4((s) => s.settings.colorAid);
  const attemptId = useP4((s) => s.attemptId);
  const [checks, setChecks] = useState<Record<string, string[]>>({});
  const wanted = useP4((s) => s.notebookTab);
  useEffect(() => {
    if (wanted) setTab(wanted as Tab);
  }, [wanted]);
  if (!rt) return null;
  const w = rt.world;
  const ms = measuredSummary(w);
  const evv = experimentVessels(w);
  const practice = mode === 'PRACTICE' || mode === 'GUIDED';

  const setField = <K extends Row>(row: K, field: string, value: string) => {
    const from = (nb[row] as unknown as Record<string, string>)[field] ?? '';
    setNb((n) => {
      (n[row] as unknown as Record<string, string>)[field] = value;
    }, `${row}.${field}`, from, value);
  };
  const sel = (row: Row, field: string, opts: readonly string[], prefix: string) => {
    const value = (nb[row] as unknown as Record<string, string>)[field] ?? '';
    const invalid = (checks[row] ?? []).includes(field);
    const id = `p4-${row}-${field}`;
    return (
      <div className="field" key={id}>
        <label htmlFor={id}>{t(`p4.nb.f.${field}`)}</label>
        <select id={id} value={value} aria-invalid={invalid} style={invalid ? { borderColor: 'var(--alert)' } : undefined} onChange={(e) => setField(row, field, e.target.value)}>
          <option value="">{t('nb.choose')}</option>
          {opts.map((o) => <option key={o} value={o}>{t(`${prefix}.${o}`)}</option>)}
        </select>
      </div>
    );
  };
  const txt = (row: Row, field: string, insert?: { label: string; value: string }) => {
    const value = (nb[row] as unknown as Record<string, string>)[field] ?? '';
    const id = `p4-${row}-${field}`;
    return (
      <div className="field" key={id}>
        <label htmlFor={id}>{t(`p4.nb.f.${field}`)}</label>
        <div style={{ display: 'flex', gap: '0.3rem' }}>
          <input id={id} type="text" value={value} style={{ flex: 1 }} onChange={(e) => setField(row, field, e.target.value)} />
          {insert && <button className="btn small ghost" title={insert.label} aria-label={insert.label} onClick={() => setField(row, field, insert.value)}>📥</button>}
        </div>
      </div>
    );
  };
  const notes = (row: Row) => (
    <div className="field">
      <label htmlFor={`p4-${row}-notes`}>{t('p4.nb.f.notes')}</label>
      <textarea id={`p4-${row}-notes`} value={(nb[row] as unknown as Record<string, string>).notes ?? ''} onChange={(e) => setField(row, 'notes', e.target.value)} />
    </div>
  );
  const check = (row: Row) =>
    practice && (
      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
        <button className="btn small" onClick={() => setChecks({ ...checks, [row]: wrongFields(w, nb, row) })}>{t('p3.nb.check')}</button>
        {checks[row] && <span className={checks[row].length ? 'pending' : 'ok'} role="status">{checks[row].length ? t('p3.nb.checkWrong', { n: checks[row].length }) : '✓'}</span>}
      </div>
    );
  const probe = { label: t('p4.nb.insertProbe'), value: `${ms.probeC.toFixed(1).replace('.', ',')} °C` };
  const aid = (vesselId: string | null) => colorAid && vesselId && <p className="hint">{t('p4.nb.colorAid', { d: appearanceWords(w, vesselId) })}</p>;
  const setEq = (id: ExperimentId, kind: EqKind) => (next: ChemEquation, field: string, from: string, to: string) => {
    setNb((n) => {
      n.eq[id][kind] = next;
    }, `eq.${id}.${kind}.${field}`, from, to);
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
          {(['A', 'B', 'C1', 'Mg', 'eq', 'analysis', 'complexes', 'log'] as Tab[]).map((k) => (
            <button key={k} role="tab" className="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{t(`p4.nb.tab.${k}`)}</button>
          ))}
        </div>
        {savedAt && <span className="hint">{t('nb.saved', { time: new Date(savedAt).toLocaleTimeString() })}</span>}

        {tab === 'A' && (
          <div className="nb-row">
            <h4>{t('p4.nb.titleA')}</h4>
            <div className="nb-grid">
              {txt('A', 'hclVolMl')}{txt('A', 'hclConc')}{txt('A', 'naohVolMl')}{txt('A', 'naohConc')}
              {sel('A', 'colorInitial', COLORS, 'p4.color')}{sel('A', 'during', DURING, 'p4.opt.during')}{sel('A', 'colorFinal', COLORS, 'p4.color')}
              {txt('A', 'tInitial', probe)}{txt('A', 'tFinal', probe)}{sel('A', 'thermal', THERMAL_TYPES, 'p4.opt.thermal')}{txt('A', 'pH')}
              {sel('A', 'type', RX_TYPES, 'p4.opt.type')}
            </div>
            {aid(evv.A)}
            {notes('A')}
            {check('A')}
          </div>
        )}

        {tab === 'B' && (['B1', 'B2'] as const).map((row) => (
          <div key={row} className="nb-row">
            <h4>{t(`p4.nb.title${row}`)}</h4>
            <div className="nb-grid">
              {txt(row, 'reagents')}{sel(row, 'immediate', IMMEDIATE, 'p4.opt.immediate')}{sel(row, 'pptColor', COLORS, 'p4.color')}{sel(row, 'texture', TEXTURE, 'p4.opt.texture')}
              {sel(row, 'supernatant', SUPERNATANT, 'p4.opt.supernatant')}{txt(row, 'temperature', probe)}{sel(row, 'thermal', THERMAL_TYPES, 'p4.opt.thermal')}
              {sel(row, 'limiting', LIMITING, 'p4.opt.limiting')}{sel(row, 'excess', LIMITING, 'p4.opt.limiting')}{sel(row, 'type', RX_TYPES, 'p4.opt.type')}
            </div>
            {aid(row === 'B1' ? evv.B1 : evv.B2)}
            {notes(row)}
            {check(row)}
          </div>
        ))}

        {tab === 'C1' && (
          <div className="nb-row">
            <h4>{t('p4.nb.titleC1')}</h4>
            <div className="nb-grid">
              {sel('C1', 'metal', ['Fe', 'Al'], 'p4.opt.metal')}{sel('C1', 'surface', SURFACE, 'p4.opt.surface')}{sel('C1', 'colorInitial', COLORS, 'p4.color')}{sel('C1', 'colorFinal', COLORS, 'p4.color')}
              {sel('C1', 'metalChange', METAL_CHANGE, 'p4.opt.metalChange')}
              {txt('C1', 'timeMin', { label: t('p4.nb.insertStopwatch'), value: (ms.stopwatchS / 60).toFixed(1).replace('.', ',') })}
              {sel('C1', 'oxidized', LIMITING, 'p4.opt.limiting')}{sel('C1', 'reduced', LIMITING, 'p4.opt.limiting')}{sel('C1', 'type', RX_TYPES, 'p4.opt.type')}
            </div>
            {aid(evv.C1)}
            {notes('C1')}
            {check('C1')}
          </div>
        )}

        {tab === 'Mg' && (
          <div className="nb-row">
            <h4>{t('p4.nb.titleMg')}</h4>
            <p className="hint">{t('p4.nb.mgHint')}</p>
            <div className="nb-grid">
              {txt('Mg', 'lengthCm')}{txt('Mg', 'massG')}{sel('Mg', 'combustion', COMBUSTION, 'p4.opt.combustion')}{sel('Mg', 'residue', RESIDUE, 'p4.opt.residue')}
              {sel('Mg', 'waterResult', WATER_RESULT, 'p4.opt.water')}{sel('Mg', 'phenolColor', COLORS, 'p4.color')}{sel('Mg', 'typeCombustion', RX_TYPES, 'p4.opt.type')}{sel('Mg', 'typeWater', RX_TYPES, 'p4.opt.type')}
            </div>
            {aid('capsule')}
            {notes('Mg')}
            {check('Mg')}
          </div>
        )}

        {tab === 'eq' && (
          <div className="nb-row">
            <div className="tabs" role="tablist" aria-label={t('p4.nb.experiment')}>
              {(Object.keys(EXPERIMENT_REFS) as ExperimentId[]).map((k) => (
                <button key={k} role="tab" className="tab" aria-selected={exp === k} onClick={() => setExp(k)}>{t(`p4.exp.${k}`)}</button>
              ))}
            </div>
            {EXPERIMENT_REFS[exp].kinds.map((kind) => {
              const val = nb.eq[exp][kind]!;
              return (
                <div key={kind} className="eq-block">
                  <h4>{t(`p4.eqkind.${kind}`)}</h4>
                  <EquationEditor idBase={`eq-${exp}-${kind}`} kind={kind} value={val} palette={EXPERIMENT_REFS[exp].palette} validation={validateFor(w, exp, kind, val)} showValidation={practice} onChange={setEq(exp, kind)} />
                </div>
              );
            })}
          </div>
        )}

        {tab === 'analysis' && (['q1', 'q2', 'q3', 'q4', 'q5', 'q6'] as const).map((q) => (
          <div key={q} className="field">
            <label htmlFor={`p4${q}`}>{t(`p4.nb.${q}`)}</label>
            <textarea id={`p4${q}`} value={nb.analysis[q]} onChange={(e) => {
              const from = nb.analysis[q];
              const to = e.target.value;
              setNb((n) => {
                n.analysis[q] = to;
              }, `analysis.${q}`, from.length > 40 ? `${from.slice(0, 40)}…` : from, to.length > 40 ? `${to.slice(0, 40)}…` : to);
            }} />
          </div>
        ))}

        {tab === 'complexes' && (
          <div className="nb-row">
            <h4>{t('p4.cx.title')}</h4>
            <p>{t('p4.cx.p1')}</p>
            <p><strong>{t('p4.cx.example')}</strong> {COMPLEX_EXAMPLE.reactants.map((r) => `${r.coef > 1 ? r.coef + ' ' : ''}${prettyFormula(r.formula)}`).join(' + ')} ⇌ {COMPLEX_EXAMPLE.products.map((r) => prettyFormula(r.formula)).join(' + ')}</p>
            <p className="toast warn" style={{ display: 'block' }}>⚠ {t('p4.cx.notRun')}</p>
            <label className="check"><input type="checkbox" checked={nb.complexes.read} onChange={(e) => setNb((n: P4Notebook) => { n.complexes.read = e.target.checked; }, 'complexes.read', String(nb.complexes.read), String(e.target.checked))} /> {t('p4.cx.read')}</label>
            <div className="field">
              <label htmlFor="p4cx">{t('p4.cx.note')}</label>
              <textarea id="p4cx" value={nb.complexes.note} onChange={(e) => setNb((n) => { n.complexes.note = e.target.value; })} />
            </div>
          </div>
        )}

        {tab === 'log' && (
          <>
            <div className="log" aria-label={t('nb.log')}>
              {rt.actions.slice(-200).reverse().map((a) => (
                <div key={a.sequence}>{(a.timestampMs / 1000).toFixed(1)} s · {a.action}{a.sourceId ? ` · ${a.sourceId}` : ''}{a.targetId ? ` → ${a.targetId}` : ''}{a.transferredVolumeMl ? ` (${a.transferredVolumeMl} mL)` : ''}{a.safetyCode ? ` ⚠ ${a.safetyCode}` : ''}</div>
              ))}
            </div>
            <details>
              <summary className="hint">{t('p4.nb.history', { n: nb.history.length })}</summary>
              <div className="log">{nb.history.slice(-100).reverse().map((h, i) => <div key={i}>{h.t} s · {h.field}: «{h.from}» → «{h.to}»</div>)}</div>
            </details>
            <button className="btn small" onClick={() => downloadJson(`libreta-p4-${attemptId}.json`, { attemptId, notebook: nb, actions: rt.actions })}>{t('nb.export')}</button>
          </>
        )}
      </div>
    </aside>
  );
}

export type { NeutralRow, PrecipRow, RedoxRow, MagnesiumRow };
