import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useP3 } from './store';
import {
  CONFIDENCE, EMISSION_COLORS, FLAME_COLORS, FLAME_ROWS, FLAME_SHAPES, INTENSITY, LUMINOSITY, SOLUTION_COLORS, SOOT,
  type FlameRow, type P3Notebook, type Row32, type Row33,
} from '../../practices/practice-03/notebook';
import { SOLUTION_ROWS, type SolutionRow } from '../../practices/practice-03/definition';
import { BASIC_UNKNOWN_POOL } from '../../practices/practice-03/unknown-generator';
import { wrong33 } from '../../practices/practice-03/rubric';
import { downloadJson } from '../persistence';

type Tab = 't32' | 't33' | 'questions' | 'unknown' | 'log';

/**
 * Libreta digital (§17): guarda las observaciones propias del estudiante, con historial de cambios.
 * No se autocompleta con respuestas correctas. En modo práctica puede «revisar» una fila (no muestra la respuesta).
 */
export function NotebookPanel3() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('t32');
  const nb = useP3((s) => s.notebook);
  const setNb = useP3((s) => s.setNotebook);
  const toggle = useP3((s) => s.toggleNotebook);
  const savedAt = useP3((s) => s.savedAt);
  useP3((s) => s.version);
  const rt = useP3((s) => s.runtime);
  const mode = useP3((s) => s.settings.mode);
  const attemptId = useP3((s) => s.attemptId);
  const [checks, setChecks] = useState<Record<string, string[]>>({});
  // La demostración puede pedir una pestaña (p. ej. el Cuadro 3.3 al registrar los colores).
  const wanted = useP3((s) => s.notebookTab);
  useEffect(() => {
    if (wanted) setTab(wanted as Tab);
  }, [wanted]);
  if (!rt) return null;
  const w = rt.world;

  const sel = (id: string, value: string, opts: readonly string[], prefix: string, onChange: (v: string) => void, invalid = false) => (
    <select id={id} value={value} aria-invalid={invalid} onChange={(e) => onChange(e.target.value)} style={invalid ? { borderColor: 'var(--alert)' } : undefined}>
      <option value="">{t('nb.choose')}</option>
      {opts.map((o) => <option key={o} value={o}>{t(`${prefix}.${o}`)}</option>)}
    </select>
  );
  const set32 = (row: FlameRow, field: keyof Row32, value: string) => {
    const from = nb.table32[row][field] as string;
    setNb((n) => {
      (n.table32[row][field] as string) = value;
      n.table32[row].updatedAt = Math.round(w.timeS);
    }, `3.2.${row}.${field}`, from, value);
  };
  const set33 = (row: SolutionRow, field: keyof Row33, value: string) => {
    const from = nb.table33[row][field] as string;
    setNb((n) => {
      (n.table33[row][field] as string) = value;
      n.table33[row].updatedAt = Math.round(w.timeS);
    }, `3.3.${row}.${field}`, from, value);
  };
  const setQ = (q: keyof P3Notebook['questions'], value: string) => {
    const from = nb.questions[q];
    setNb((n) => {
      n.questions[q] = value;
    }, `q.${q}`, from.length > 40 ? `${from.slice(0, 40)}…` : from, value.length > 40 ? `${value.slice(0, 40)}…` : value);
  };
  const setUnknown = (field: 'identity' | 'justification' | 'confidence', value: string) => {
    const from = nb.unknown[field];
    setNb((n) => {
      // §11.10-7: se conserva la respuesta inicial y se cuentan las correcciones.
      if (field === 'identity' && value && !n.unknown.initial && n.unknown.identity === '') {
        n.unknown.initial = { identity: value, justification: n.unknown.justification, confidence: n.unknown.confidence, t: Math.round(w.timeS) };
      } else if (field === 'identity' && from && value !== from) n.unknown.corrections++;
      n.unknown[field] = value;
    }, `unknown.${field}`, from, value);
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
          {(['t32', 't33', 'questions', 'unknown', 'log'] as Tab[]).map((k) => (
            <button key={k} role="tab" className="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{t(`p3.nb.${k}`)}</button>
          ))}
        </div>
        {savedAt && <span className="hint">{t('nb.saved', { time: new Date(savedAt).toLocaleTimeString() })}</span>}

        {tab === 't32' && FLAME_ROWS.map((row) => {
          const r = nb.table32[row];
          const capsuleRow = row === 'capsule1' || row === 'capsule2';
          return (
            <div key={row} className="nb-row">
              <h4>{t(`p3.nb.row32.${row}`)}</h4>
              <div className="nb-grid">
                <div className="field"><label htmlFor={`c-${row}`}>{t('p3.nb.color')}</label>{sel(`c-${row}`, r.color, FLAME_COLORS, 'p3.opt.flameColor', (v) => set32(row, 'color', v))}</div>
                <div className="field"><label htmlFor={`s-${row}`}>{t('p3.nb.shape')}</label>{sel(`s-${row}`, r.shape, FLAME_SHAPES, 'p3.opt.shape', (v) => set32(row, 'shape', v))}</div>
                <div className="field"><label htmlFor={`l-${row}`}>{t('p3.nb.luminosity')}</label>{sel(`l-${row}`, r.luminosity, LUMINOSITY, 'p3.opt.lum', (v) => set32(row, 'luminosity', v))}</div>
                {capsuleRow && <div className="field"><label htmlFor={`h-${row}`}>{t('p3.nb.soot')}</label>{sel(`h-${row}`, r.soot, SOOT, 'p3.opt.soot', (v) => set32(row, 'soot', v))}</div>}
              </div>
              <div className="field"><label htmlFor={`i-${row}`}>{t('p3.nb.interpretation')}</label>
                <textarea id={`i-${row}`} value={r.interpretation} onChange={(e) => set32(row, 'interpretation', e.target.value)} />
              </div>
            </div>
          );
        })}

        {tab === 't33' && SOLUTION_ROWS.map((row) => {
          const r = nb.table33[row];
          const label = row === 'sol_unknown' ? t('p3.nb.unknownRow', { n: w.unknown.number }) : w.solutions[row]?.label ?? row;
          const wrong = checks[row] ?? [];
          const obs = w.observations[row];
          return (
            <div key={row} className="nb-row">
              <h4>
                <span>{label}</span>
                <span className="hint">{obs?.noFilter ? '● ' + t('p3.nb.observed') : t('p3.nb.notObserved')}{obs?.filter ? ' · ' + t('p3.nb.observedFilter') : ''}</span>
              </h4>
              <div className="nb-grid">
                <div className="field"><label htmlFor={`sc-${row}`}>{t('p3.nb.solutionColor')}</label>{sel(`sc-${row}`, r.solutionColor, SOLUTION_COLORS, 'p3.opt.solColor', (v) => set33(row, 'solutionColor', v), wrong.includes('solutionColor'))}</div>
                <div className="field"><label htmlFor={`nf-${row}`}>{t('p3.nb.noFilter')}</label>{sel(`nf-${row}`, r.noFilter, EMISSION_COLORS, 'p3.color', (v) => set33(row, 'noFilter', v), wrong.includes('noFilter'))}</div>
                <div className="field"><label htmlFor={`f-${row}`}>{t('p3.nb.filter')}</label>{sel(`f-${row}`, r.filter, EMISSION_COLORS, 'p3.color', (v) => set33(row, 'filter', v), wrong.includes('filter'))}</div>
                <div className="field"><label htmlFor={`in-${row}`}>{t('p3.nb.intensity')}</label>{sel(`in-${row}`, r.intensity, INTENSITY, 'p3.opt.int', (v) => set33(row, 'intensity', v))}</div>
              </div>
              <div className="field"><label htmlFor={`o-${row}`}>{t('p3.nb.observations')}</label>
                <textarea id={`o-${row}`} value={r.observations} onChange={(e) => set33(row, 'observations', e.target.value)} />
              </div>
              {(mode === 'PRACTICE' || mode === 'GUIDED') && (
                <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                  <button className="btn small" onClick={() => setChecks({ ...checks, [row]: wrong33(w, nb, row) })}>{t('p3.nb.check')}</button>
                  {checks[row] && <span className={wrong.length ? 'pending' : 'ok'} role="status">{wrong.length ? t('p3.nb.checkWrong', { n: wrong.length }) : '✓'}</span>}
                </div>
              )}
            </div>
          );
        })}

        {tab === 'questions' && (['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7'] as const).map((q) => (
          <div key={q} className="field">
            <label htmlFor={`p3${q}`}>{t(`p3.nb.${q}`)}</label>
            <textarea id={`p3${q}`} value={nb.questions[q]} onChange={(e) => setQ(q, e.target.value)} />
          </div>
        ))}

        {tab === 'unknown' && (
          <div className="nb-row">
            <h4>{t('p3.nb.unknownRow', { n: w.unknown.number })}</h4>
            <div className="field"><label htmlFor="u-id">{t('p3.nb.identity')}</label>
              <select id="u-id" value={nb.unknown.identity} onChange={(e) => setUnknown('identity', e.target.value)}>
                <option value="">{t('nb.choose')}</option>
                {BASIC_UNKNOWN_POOL.map((c) => <option key={c} value={c}>{t(`p3.cation.${c}`)}</option>)}
              </select>
            </div>
            <div className="field"><label htmlFor="u-c">{t('p3.nb.confidence')}</label>{sel('u-c', nb.unknown.confidence, CONFIDENCE, 'p3.opt.conf', (v) => setUnknown('confidence', v))}</div>
            <div className="field"><label htmlFor="u-j">{t('p3.nb.justification')}</label>
              <textarea id="u-j" value={nb.unknown.justification} onChange={(e) => setUnknown('justification', e.target.value)} />
            </div>
            {nb.unknown.initial && <span className="hint">{t('p3.nb.initial', { id: t(`p3.cation.${nb.unknown.initial.identity}`), n: nb.unknown.corrections })}</span>}
          </div>
        )}

        {tab === 'log' && (
          <>
            <div className="log" aria-label={t('nb.log')}>
              {rt.actions.slice(-200).reverse().map((a) => (
                <div key={a.sequence}>{(a.timestampMs / 1000).toFixed(1)} s · {a.action}{a.toolId ? ` · ${a.toolId}` : ''}{a.sourceId ? ` → ${a.sourceId}` : ''}{a.safetyCode ? ` ⚠ ${a.safetyCode}` : ''}</div>
              ))}
            </div>
            <button className="btn small" onClick={() => downloadJson(`libreta-p3-${attemptId}.json`, { attemptId, notebook: nb, actions: rt.actions })}>{t('nb.export')}</button>
          </>
        )}
      </div>
    </aside>
  );
}
