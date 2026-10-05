/**
 * Editor de ecuaciones químicas (§15): fichas de fórmulas que se arrastran (o se pulsan) a reactivos o productos,
 * coeficientes enteros separados de los subíndices, estado (s)/(l)/(g)/(ac), tachado de iones espectadores y
 * validación por átomos, carga, relación mínima, fases y disociación — nunca por coincidencia de texto.
 * La lectura de la ecuación es accesible (texto equivalente para tecnologías de asistencia, §26).
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { equationText, type ChemEquation, type EqKind, type EqTerm, type EquationValidation, type StateTag } from '../../simulation/chemistry/equation';
import { parseFormula, prettyFormula } from '../../simulation/chemistry/formula';

const STATES: StateTag[] = ['', 's', 'l', 'g', 'ac'];

interface Props {
  idBase: string;
  kind: EqKind;
  value: ChemEquation;
  palette: string[];
  validation: EquationValidation | null;
  showValidation: boolean;
  onChange(next: ChemEquation, field: string, from: string, to: string): void;
}

function termText(tm: EqTerm) {
  return `${tm.coef > 1 ? `${tm.coef} ` : ''}${prettyFormula(tm.formula)}${tm.state ? `(${tm.state})` : ''}`;
}

export function EquationEditor({ idBase, kind, value, palette, validation, showValidation, onChange }: Props) {
  const { t } = useTranslation();
  const [side, setSide] = useState<'reactants' | 'products'>('reactants');
  const before = equationText(value, prettyFormula);
  const commit = (next: ChemEquation, field: string) => onChange(next, field, before, equationText(next, prettyFormula));
  const update = (s: 'reactants' | 'products', i: number, patch: Partial<EqTerm>) => {
    const next = structuredClone(value);
    next[s][i] = { ...next[s][i], ...patch };
    commit(next, `${s}[${i}]`);
  };
  const add = (s: 'reactants' | 'products', formula = '') => {
    const next = structuredClone(value);
    next[s].push({ coef: 1, formula, state: '' });
    commit(next, `${s}+`);
  };
  const remove = (s: 'reactants' | 'products', i: number) => {
    const next = structuredClone(value);
    next[s].splice(i, 1);
    commit(next, `${s}-`);
  };
  const ok = (b: boolean | undefined) => (b ? '✓' : '✗');
  const sideBox = (s: 'reactants' | 'products') => (
    <div
      className={`eq-side${side === s ? ' active' : ''}`}
      role="group"
      aria-label={t(`p4.eq.${s}`)}
      onClick={() => setSide(s)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const f = e.dataTransfer.getData('text/plain');
        if (f) add(s, f);
      }}
    >
      <div className="eq-side-head">{t(`p4.eq.${s}`)}</div>
      {value[s].map((tm, i) => {
        const bad = !!tm.formula && !parseFormula(tm.formula);
        return (
          <div key={i} className={`eq-term${tm.struck ? ' struck' : ''}`}>
            <label className="sr-only" htmlFor={`${idBase}-${s}-c${i}`}>{t('p4.eq.coef')}</label>
            <input id={`${idBase}-${s}-c${i}`} className="eq-coef" type="number" min={1} step={1} value={tm.coef} onChange={(e) => update(s, i, { coef: Math.max(1, Math.round(Number(e.target.value) || 1)) })} />
            <label className="sr-only" htmlFor={`${idBase}-${s}-f${i}`}>{t('p4.eq.formula')}</label>
            <input id={`${idBase}-${s}-f${i}`} className="eq-formula" value={tm.formula} aria-invalid={bad} placeholder="Fe(OH)3, SO4^2-" onChange={(e) => update(s, i, { formula: e.target.value })} />
            <span className="eq-pretty" aria-hidden="true">{tm.formula && !bad ? prettyFormula(tm.formula) : ''}</span>
            <label className="sr-only" htmlFor={`${idBase}-${s}-s${i}`}>{t('p4.eq.state')}</label>
            <select id={`${idBase}-${s}-s${i}`} value={tm.state} onChange={(e) => update(s, i, { state: e.target.value as StateTag })}>
              {STATES.map((st) => <option key={st} value={st}>{st ? `(${st})` : t('p4.eq.noState')}</option>)}
            </select>
            {kind === 'COMPLETE_IONIC' && (
              <button className="btn small ghost" aria-pressed={!!tm.struck} title={t('p4.eq.strike')} onClick={() => update(s, i, { struck: !tm.struck })}>⊘</button>
            )}
            <button className="btn small ghost" aria-label={t('p4.eq.remove')} onClick={() => remove(s, i)}>×</button>
          </div>
        );
      })}
      <button className="btn small" onClick={() => add(s)}>+ {t('p4.eq.term')}</button>
    </div>
  );
  return (
    <div className="eq-editor">
      <div className="eq-palette" role="list" aria-label={t('p4.eq.palette')}>
        {palette.map((f) => (
          <button key={f} role="listitem" className="chip" draggable onDragStart={(e) => e.dataTransfer.setData('text/plain', f)} onClick={() => add(side, f)} title={t('p4.eq.chipHelp')}>
            {prettyFormula(f)}
          </button>
        ))}
      </div>
      <div className="eq-row">
        {sideBox('reactants')}
        <span className="eq-arrow" aria-hidden="true">→</span>
        {sideBox('products')}
      </div>
      <div className="eq-preview" aria-live="polite">
        {value.reactants.map((tm, i) => <span key={`r${i}`} className={tm.struck ? 'struck' : ''}>{i > 0 ? ' + ' : ''}{termText(tm)}</span>)}
        <span> → </span>
        {value.products.map((tm, i) => <span key={`p${i}`} className={tm.struck ? 'struck' : ''}>{i > 0 ? ' + ' : ''}{termText(tm)}</span>)}
      </div>
      {showValidation && validation && validation.complete && (
        <div className="eq-check" role="status">
          <span className={validation.atomsBalanced ? 'ok' : 'bad'}>{ok(validation.atomsBalanced)} {t('p4.eq.atoms')}</span>
          <span className={validation.chargeBalanced ? 'ok' : 'bad'}>{ok(validation.chargeBalanced)} {t('p4.eq.charge')}</span>
          <span className={validation.coefficientsLowestWholeNumbers ? 'ok' : 'bad'}>{ok(validation.coefficientsLowestWholeNumbers)} {t('p4.eq.lowest')}</span>
          <span className={validation.phasesCorrect ? 'ok' : 'bad'}>{ok(validation.phasesCorrect)} {t('p4.eq.phases')}</span>
          {validation.spectatorsCorrect !== undefined && <span className={validation.spectatorsCorrect ? 'ok' : 'bad'}>{ok(validation.spectatorsCorrect)} {t('p4.eq.spectators')}</span>}
          <ul>{validation.errors.map((e, i) => <li key={i}>{t(`p4.eqerr.${e.code}`, e.params)}</li>)}</ul>
        </div>
      )}
      {showValidation && validation && !validation.complete && validation.errors.length > 0 && (
        <div className="eq-check" role="status"><ul>{validation.errors.map((e, i) => <li key={i}>{t(`p4.eqerr.${e.code}`, e.params)}</li>)}</ul></div>
      )}
    </div>
  );
}
