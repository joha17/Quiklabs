import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLab } from '../store';
import {
  CLASSIFICATIONS, COLORS, MIXTURE_TYPES, ODORS, SOLUBILITY, STATES, SUBSTANCE_ROWS, type RowKey, type NotebookState,
} from '../../practices/practice-02/notebook';
import { wrongFields } from '../../practices/practice-02/rubric';
import { describeVessel, nameOf } from '../describe';
import { downloadJson } from '../persistence';
import { massBalance } from '../../simulation/scoring/balance';

type Tab = 't21' | 't22' | 'activities' | 'log';

const ROW_LABEL: Record<RowKey, string[]> = {
  Zn: ['Zn'], C: ['C'], S: ['S'], NaCl: ['NaCl'], sacarosa: ['sacarosa'], aceite: ['aceite vegetal', 'aceite mineral'],
};

const HINTS: Record<string, string> = {
  formula: 'Usa el símbolo del elemento o la fórmula del compuesto; para una mezcla, indica que no tiene fórmula única.',
  classification: 'Elemento: un solo tipo de átomo. Compuesto: elementos combinados en proporción fija. Mezcla: varias sustancias sin proporción fija.',
  state: 'Observa la muestra en el frasco o en el tubo a temperatura ambiente.',
  color: 'Inspecciona (lupa) la muestra antes de añadir agua.',
  odor: 'Abanica los vapores del tubo hacia la nariz; no lo acerques directamente.',
  solubility: 'Agita y deja reposar: ¿desaparece el sólido, se deposita o se separan dos capas líquidas?',
};

export function NotebookPanel() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('t21');
  // La demostración puede pedir una pestaña (p. ej. el Cuadro 2.2 al registrar los resultados).
  const requested = useLab((s) => s.notebookTab);
  useEffect(() => {
    if (requested) setTab(requested);
  }, [requested]);
  const nb = useLab((s) => s.notebook);
  const setNb = useLab((s) => s.setNotebook);
  const toggle = useLab((s) => s.toggleNotebook);
  const savedAt = useLab((s) => s.savedAt);
  useLab((s) => s.version);
  const rt = useLab((s) => s.runtime);
  const mode = useLab((s) => s.settings.mode);
  const attemptId = useLab((s) => s.attemptId);
  const [checks, setChecks] = useState<Record<string, { n: number; wrong: string[] }>>({});
  if (!rt) return null;
  const w = rt.world;

  const tubeFor = (row: RowKey) => Object.values(w.vessels).find((v) => v.type === 'TEST_TUBE' && v.label && ROW_LABEL[row].includes(v.label));

  const set21 = (row: RowKey, field: keyof NotebookState['table21'][RowKey], value: string) => {
    const from = nb.table21[row][field] as string;
    setNb((n) => {
      (n.table21[row][field] as string) = value;
      n.table21[row].updatedAt = Math.round(w.timeS);
    }, `2.1.${row}.${field}`, from, value);
  };

  const sel = (id: string, value: string, opts: readonly string[], prefix: string, onChange: (v: string) => void, disabled = false, invalid = false) => (
    <select id={id} value={value} disabled={disabled} aria-invalid={invalid} onChange={(e) => onChange(e.target.value)} style={invalid ? { borderColor: 'var(--alert)' } : undefined}>
      <option value="">{t('nb.choose')}</option>
      {opts.map((o) => <option key={o} value={o}>{t(`${prefix}.${o}`)}</option>)}
    </select>
  );

  return (
    <aside className="drawer" aria-label={t('nb.title')}>
      <div className="drawer-head">
        <h2>📓 {t('nb.title')}</h2>
        <span style={{ flex: 1 }} />
        <button className="btn small ghost" onClick={toggle} aria-label={t('common.close')}>×</button>
      </div>
      <div className="drawer-body">
        <div className="tabs" role="tablist">
          {(['t21', 't22', 'activities', 'log'] as Tab[]).map((k) => (
            <button key={k} role="tab" className="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{t(`nb.${k}`)}</button>
          ))}
        </div>
        {savedAt && <span className="hint">{t('nb.saved', { time: new Date(savedAt).toLocaleTimeString() })}</span>}

        {tab === 't21' && SUBSTANCE_ROWS.map((row) => {
          const r = nb.table21[row];
          const tube = tubeFor(row);
          const fanned = !!tube?.fanned;
          const wrong = checks[row]?.wrong ?? [];
          return (
            <div key={row} className="nb-row">
              <h4>
                <span>{t(`nb.rows.${row}`)}{row === 'aceite' ? ` (${t(`oil.${w.params.oilProfile}`).replace(' (predeterminado)', '')})` : ''}</span>
                {mode !== 'EVALUATION' && (
                  <button className="btn small ghost" onClick={() => setChecks({ ...checks, [row]: { n: (checks[row]?.n ?? 0) + 1, wrong: wrongFields(w, row, nb) } })}>Revisar</button>
                )}
              </h4>
              <div className="nb-grid">
                <div className="field">
                  <label htmlFor={`${row}-f`}>{t('nb.formula')}</label>
                  <input id={`${row}-f`} type="text" value={r.formula} aria-invalid={wrong.includes('formula')} onChange={(e) => set21(row, 'formula', e.target.value)} style={wrong.includes('formula') ? { borderColor: 'var(--alert)' } : undefined} />
                </div>
                <div className="field"><label htmlFor={`${row}-c`}>{t('nb.classification')}</label>{sel(`${row}-c`, r.classification, CLASSIFICATIONS, 'opt.class', (v) => set21(row, 'classification', v), false, wrong.includes('classification'))}</div>
                <div className="field"><label htmlFor={`${row}-s`}>{t('nb.state')}</label>{sel(`${row}-s`, r.state, STATES, 'opt.state', (v) => set21(row, 'state', v), false, wrong.includes('state'))}</div>
                <div className="field"><label htmlFor={`${row}-co`}>{t('nb.color')}</label>{sel(`${row}-co`, r.color, COLORS, 'opt.color', (v) => set21(row, 'color', v), false, wrong.includes('color'))}</div>
                <div className="field">
                  <label htmlFor={`${row}-o`}>{t('nb.odor')}</label>
                  {sel(`${row}-o`, r.odor, ODORS, 'opt.odor', (v) => set21(row, 'odor', v), !fanned, wrong.includes('odor'))}
                  {!fanned && <span className="hint">{t('nb.odorLocked')}</span>}
                </div>
                <div className="field"><label htmlFor={`${row}-so`}>{t('nb.solubility')}</label>{sel(`${row}-so`, r.solubility, SOLUBILITY, 'opt.sol', (v) => set21(row, 'solubility', v), false, wrong.includes('solubility'))}</div>
              </div>
              <div className="field">
                <label htmlFor={`${row}-e`}>{t('nb.evidence')}</label>
                <div style={{ display: 'flex', gap: '0.3rem' }}>
                  <input id={`${row}-e`} type="text" value={r.evidence} readOnly style={{ flex: 1 }} />
                  <button className="btn small" disabled={!tube} onClick={() => tube && set21(row, 'evidence', `${Math.round(w.timeS)} s · ${describeVessel(w, tube)}`)}>{t('act.useObservation')}</button>
                </div>
              </div>
              {checks[row] && mode !== 'EVALUATION' && (
                <span className={wrong.length ? 'pending' : 'ok'} role="status">
                  {wrong.length ? `Revisa: ${wrong.map((x) => t(`nb.${x}`)).join(', ')}` : '✓'}
                  {mode === 'GUIDED' && checks[row].n >= 2 && wrong.length > 0 && <span className="hint" style={{ display: 'block' }}>💡 {HINTS[wrong[0]]}</span>}
                </span>
              )}
            </div>
          );
        })}

        {tab === 't22' && (['EVAPORATION', 'CRYSTALLIZATION'] as const).map((k) => {
          const r = nb.table22[k];
          const upd = (field: 'observations' | 'massG' | 'appearance', value: string) => {
            const from = r[field];
            setNb((n) => { n.table22[k][field] = value; n.table22[k].updatedAt = Math.round(w.timeS); }, `2.2.${k}.${field}`, from, value);
          };
          return (
            <div key={k} className="nb-row">
              <h4>{t(`nb.${k}`)}</h4>
              <div className="field"><label htmlFor={`${k}-obs`}>{t('nb.observations')}</label><textarea id={`${k}-obs`} value={r.observations} onChange={(e) => upd('observations', e.target.value)} /></div>
              <div className="nb-grid">
                <div className="field"><label htmlFor={`${k}-m`}>{t('nb.mass')}</label><input id={`${k}-m`} type="text" inputMode="decimal" value={r.massG} onChange={(e) => upd('massG', e.target.value)} /></div>
                <div className="field"><label htmlFor={`${k}-a`}>{t('nb.appearance')}</label><input id={`${k}-a`} type="text" value={r.appearance} onChange={(e) => upd('appearance', e.target.value)} /></div>
              </div>
            </div>
          );
        })}

        {tab === 'activities' && (
          <>
            <div className="nb-row">
              <h4>{t('nb.a1')}</h4>
              {(['arenaSal', 'aguaArena', 'salAgua'] as const).map((k) => (
                <div key={k} className="field">
                  <label htmlFor={`a1-${k}`}>{t(`nb.a1_${k}`)}</label>
                  {sel(`a1-${k}`, nb.activities.a1[k], MIXTURE_TYPES, 'opt.class', (v) => setNb((n) => { n.activities.a1[k] = v; }, `a1.${k}`, nb.activities.a1[k], v))}
                </div>
              ))}
            </div>
            <div className="nb-row">
              <h4>{t('nb.a2')}</h4>
              {(['destilacion', 'decantacion', 'filtracion', 'cristalizacion', 'evaporacion'] as const).map((k) => (
                <div key={k} className="field">
                  <label htmlFor={`a2-${k}`}>{t(`nb.a2_${k}`)}</label>
                  <textarea id={`a2-${k}`} value={nb.activities.a2[k]} onChange={(e) => { const v = e.target.value; setNb((n) => { n.activities.a2[k] = v; }); }} />
                </div>
              ))}
            </div>
            {(['a3', 'a4', 'a5'] as const).map((k) => (
              <div key={k} className="nb-row">
                <label className="label" htmlFor={k}>{t(`nb.${k}`)}</label>
                <textarea id={k} value={nb.activities[k]} onChange={(e) => { const v = e.target.value; setNb((n) => { n.activities[k] = v; }); }} />
              </div>
            ))}
          </>
        )}

        {tab === 'log' && (
          <>
            <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
              <button className="btn small" onClick={() => downloadJson(`registro-${attemptId}.json`, { attemptId, seed: w.seed, actions: rt.actions, events: w.events })}>{t('nb.export')}</button>
              <button className="btn small" onClick={() => downloadJson(`libreta-${attemptId}.json`, nb)}>{t('nb.exportNotebook')}</button>
            </div>
            <h4 style={{ margin: 0 }}>{t('nb.logActions')} ({rt.actions.length})</h4>
            <div className="log">
              {rt.actions.slice(-200).reverse().map((a) => (
                <div key={a.sequence}>#{a.sequence} {(a.timestampMs / 1000).toFixed(1)} s · {a.action} {a.sourceId ? nameOf(w, a.sourceId) : ''}{a.targetId ? ` → ${a.targetId}` : ''}{a.safetyCode ? ` ⚠ ${a.safetyCode}` : ''}</div>
              ))}
            </div>
            <h4 style={{ margin: 0 }}>{t('nb.history')}</h4>
            <div className="log">
              {nb.history.slice(-100).reverse().map((h, i) => <div key={i}>{h.t} s · {h.field}: «{h.from}» → «{h.to}»</div>)}
            </div>
            {mode === 'DEBUG' && (
              <>
                <h4 style={{ margin: 0 }}>{t('nb.balance')}</h4>
                <div className="table-scroll">
                  <table className="data">
                    <thead><tr><th>comp.</th><th>inicial</th><th>recip.</th><th>filtro</th><th>residuo</th><th>derram.</th><th>Δ</th></tr></thead>
                    <tbody>{massBalance(w, ['KNO3', 'CARBON']).map((r) => <tr key={r.component}><td>{r.component}</td><td className="num">{r.initial.toFixed(3)}</td><td className="num">{r.inVessels.toFixed(3)}</td><td className="num">{r.inFilter.toFixed(3)}</td><td className="num">{r.inResidue.toFixed(3)}</td><td className="num">{r.spilled.toFixed(3)}</td><td className="num">{r.residual.toExponential(1)}</td></tr>)}</tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
