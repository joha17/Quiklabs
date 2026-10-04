import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useP3 } from './store';
import { BURNER_PARTS } from '../../practices/practice-03/notebook';

/**
 * Identificación de partes (§6.1) sobre la geometría real: se elige una etiqueta y se señala la pieza en el modelo
 * 3D. Alternativa accesible por teclado: elegir la pieza por su descripción geométrica (no por su nombre).
 */
export function PartsPanel3() {
  const { t } = useTranslation();
  useP3((s) => s.version);
  const rt = useP3((s) => s.runtime);
  const stage = useP3((s) => s.stage);
  const label = useP3((s) => s.partLabel);
  const setLabel = useP3((s) => s.setPartLabel);
  const toggle = useP3((s) => s.togglePartsPanel);
  const dispatch = useP3((s) => s.dispatch);
  const [kbPart, setKbPart] = useState('');
  if (!rt) return null;
  const answers = rt.world.parts.answers;
  const done = BURNER_PARTS.filter((p) => answers[p] === p).length;
  return (
    <aside className="guide parts-panel" aria-label={t('p3.parts.title')}>
      <h3 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.4rem' }}>
        <span>🔎 {t('p3.parts.title')} <span className="hint">({done}/{BURNER_PARTS.length})</span></span>
        <button className="btn small ghost" onClick={toggle} aria-label={t('common.close')}>×</button>
      </h3>
      <p className="hint" style={{ margin: '0 0 0.4rem' }}>{label ? t('p3.parts.pointNow', { part: t(`p3.part.${label}`) }) : t('p3.parts.lead')}</p>
      <div className="parts-grid">
        {BURNER_PARTS.map((p) => (
          <button key={p} className="btn small" aria-pressed={label === p} disabled={answers[p] === p}
            onClick={() => { setLabel(label === p ? null : p); stage?.goToStation('A'); }}>
            {answers[p] === p ? '✓ ' : ''}{t(`p3.part.${p}`)}
          </button>
        ))}
      </div>
      {label && (
        <div className="field" style={{ marginTop: '0.5rem' }}>
          <label htmlFor="kb-part">{t('p3.parts.keyboard')}</label>
          <div style={{ display: 'flex', gap: '0.3rem' }}>
            <select id="kb-part" value={kbPart} onChange={(e) => setKbPart(e.target.value)} style={{ flex: 1 }}>
              <option value="">{t('nb.choose')}</option>
              {BURNER_PARTS.map((p) => <option key={p} value={p}>{t(`p3.partGeo.${p}`)}</option>)}
            </select>
            <button className="btn small" disabled={!kbPart} onClick={() => { dispatch({ type: 'identifyPart', part: kbPart, answer: label }); setLabel(null); setKbPart(''); }}>{t('p3.parts.point')}</button>
          </div>
        </div>
      )}
    </aside>
  );
}
